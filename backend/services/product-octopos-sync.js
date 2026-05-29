'use strict';

const OctoposService = require('./octopos');
const logger = require('../utils/logger');

function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
}

function parseMoney(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function unwrapList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
    return [];
}

function unwrapRecord(payload) {
    if (!payload) return null;
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        return payload.data;
    }
    if (payload.id != null) return payload;
    return null;
}

class ProductOctoposSyncService {
    constructor(pool) {
        this.pool = pool;
    }

    buildClient({ baseUrl, token } = {}) {
        return new OctoposService(
            baseUrl || process.env.OCTOPOS_API_URL || '',
            token || process.env.OCTOPOS_TOKEN || ''
        );
    }

    _webToPosCostEnabled() {
        if (process.env.OCTOPOS_SYNC_WEB_PRODUCT_COST === 'false') return false;
        const url = String(process.env.OCTOPOS_API_URL || '').trim();
        const tok = String(process.env.OCTOPOS_TOKEN || '').trim();
        return !!(url && tok);
    }

    async fetchAllOctoposProducts(svc) {
        const limit = 100;
        let skip = 0;
        const all = [];
        const maxPages = 500;

        for (let page = 0; page < maxPages; page++) {
            const result = await svc.getProducts({ limit, skip });
            if (!result.success) {
                throw new Error(
                    result.error?.message || result.error?.error?.message || 'Octopos product list failed'
                );
            }
            const batch = unwrapList(result.data);
            if (!batch.length) break;
            all.push(...batch);
            if (batch.length < limit) break;
            skip += limit;
        }
        return all;
    }

    buildOctoposLookup(octoposProducts) {
        const bySku = new Map();
        const byBarcode = new Map();
        const byId = new Map();

        for (const item of octoposProducts) {
            if (!item || item.id == null) continue;
            const id = Number(item.id);
            const record = {
                id,
                cost: parseMoney(item.cost),
                sale_price: parseMoney(item.sale_price),
                sku: item.sku,
                barcode: item.barcode,
                name: item.name,
            };
            byId.set(id, record);
            const skuKey = normalizeKey(item.sku);
            const barcodeKey = normalizeKey(item.barcode);
            if (skuKey) bySku.set(skuKey, record);
            if (barcodeKey) byBarcode.set(barcodeKey, record);
        }
        return { bySku, byBarcode, byId };
    }

    findOctoposMatch(localProduct, lookup) {
        const skuKey = normalizeKey(localProduct.sku);
        if (skuKey && lookup.bySku.has(skuKey)) return lookup.bySku.get(skuKey);
        const barcodeKey = normalizeKey(localProduct.sku);
        if (barcodeKey && lookup.byBarcode.has(barcodeKey)) return lookup.byBarcode.get(barcodeKey);
        if (localProduct.octopos_product_id) {
            const id = Number(localProduct.octopos_product_id);
            if (lookup.byId.has(id)) return lookup.byId.get(id);
        }
        return null;
    }

    async resolveCostFromOctopos(svc, match) {
        if (!match) return null;
        if (match.cost != null) return match.cost;
        const detail = await svc.getProductById(match.id);
        if (!detail.success) return null;
        const row = unwrapRecord(detail.data);
        return parseMoney(row?.cost);
    }

  /**
   * Pull costs from Octopos into products.cost_price (match by SKU / barcode).
   */
    async syncAllCostsFromOctopos(octoposCtx = {}) {
        const svc = this.buildClient(octoposCtx);
        const octoposProducts = await this.fetchAllOctoposProducts(svc);
        const lookup = this.buildOctoposLookup(octoposProducts);

        const [locals] = await this.pool.execute(
            `SELECT id, sku, octopos_product_id, cost_price FROM products ORDER BY id`
        );

        const stats = {
            total: locals.length,
            matched: 0,
            updated: 0,
            linked: 0,
            skipped_no_cost: 0,
            unmatched: 0,
        };

        for (const local of locals) {
            const match = this.findOctoposMatch(local, lookup);
            if (!match) {
                stats.unmatched++;
                continue;
            }
            stats.matched++;

            let cost = match.cost;
            if (cost == null) {
                cost = await this.resolveCostFromOctopos(svc, match);
            }
            if (cost == null) {
                stats.skipped_no_cost++;
                if (!local.octopos_product_id) {
                    await this.pool.execute(
                        'UPDATE products SET octopos_product_id = ?, cost_synced_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [match.id, local.id]
                    );
                    stats.linked++;
                }
                continue;
            }

            await this.pool.execute(
                `UPDATE products
                    SET cost_price = ?, octopos_product_id = ?, cost_synced_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
                [cost, match.id, local.id]
            );
            stats.updated++;
            if (!local.octopos_product_id) stats.linked++;
        }

        logger.info('[octopos] Product cost sync finished', stats);
        return { success: true, stats };
    }

    async syncProductCostFromOctopos(productId, octoposCtx = {}) {
        const id = Number(productId);
        if (!Number.isInteger(id) || id <= 0) {
            return { success: false, error: 'Invalid product id' };
        }

        const [[local]] = await this.pool.execute(
            'SELECT id, sku, octopos_product_id, cost_price FROM products WHERE id = ? LIMIT 1',
            [id]
        );
        if (!local) return { success: false, error: 'Product not found' };

        const svc = this.buildClient(octoposCtx);
        let match = null;

        if (local.octopos_product_id) {
            const detail = await svc.getProductById(local.octopos_product_id);
            if (detail.success) {
                const row = unwrapRecord(detail.data);
                if (row) {
                    match = {
                        id: Number(row.id),
                        cost: parseMoney(row.cost),
                        sku: row.sku,
                        barcode: row.barcode,
                    };
                }
            }
        }

        if (!match) {
            const octoposProducts = await this.fetchAllOctoposProducts(svc);
            const lookup = this.buildOctoposLookup(octoposProducts);
            match = this.findOctoposMatch(local, lookup);
        }

        if (!match) {
            return { success: false, error: 'No matching Octopos product found for this SKU' };
        }

        let cost = match.cost;
        if (cost == null) cost = await this.resolveCostFromOctopos(svc, match);

        if (cost == null) {
            await this.pool.execute(
                'UPDATE products SET octopos_product_id = ?, cost_synced_at = CURRENT_TIMESTAMP WHERE id = ?',
                [match.id, local.id]
            );
            return {
                success: true,
                linked: true,
                message: 'Linked to Octopos but no cost is set in Octopos for this item',
            };
        }

        await this.pool.execute(
            `UPDATE products
                SET cost_price = ?, octopos_product_id = ?, cost_synced_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [cost, match.id, local.id]
        );

        return { success: true, cost_price: cost, octopos_product_id: match.id };
    }

    async pushCostToOctopos(productId, octoposCtx = {}) {
        if (!this._webToPosCostEnabled()) {
            return { success: false, skipped: true, reason: 'OCTOPOS_SYNC_WEB_PRODUCT_COST disabled or API not configured' };
        }

        const id = Number(productId);
        const [[row]] = await this.pool.execute(
            'SELECT id, sku, cost_price, octopos_product_id FROM products WHERE id = ? LIMIT 1',
            [id]
        );
        if (!row?.octopos_product_id) {
            return { success: false, error: 'Product is not linked to Octopos (sync from Octopos first)' };
        }
        const cost = parseMoney(row.cost_price);
        if (cost == null) {
            return { success: false, error: 'No cost_price on this product to push' };
        }

        const svc = this.buildClient(octoposCtx);
        const result = await svc.updateProduct(row.octopos_product_id, {
            cost: cost.toFixed(2),
        });

        if (!result.success) {
            return {
                success: false,
                error: result.error?.message || result.error?.error?.message || 'Octopos update failed',
            };
        }

        await this.pool.execute(
            'UPDATE products SET cost_synced_at = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );

        return { success: true, cost_price: cost };
    }
}

module.exports = ProductOctoposSyncService;

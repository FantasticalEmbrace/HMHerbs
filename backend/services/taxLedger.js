const OctoposService = require('./octopos');
const logger = require('../utils/logger');

const TARGET_STATES = new Set(['GA', 'NC', 'IN', 'MI', 'OH']);
const POS_PAGE_SIZE = 100;
const POS_REQUEST_DELAY_MS = 250;

function toDateKey(input = new Date()) {
    const date = input instanceof Date ? input : new Date(input);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function toStartEndUtc(dateKey) {
    return {
        start: `${dateKey}T00:00:00.000Z`,
        end: `${dateKey}T23:59:59.999Z`
    };
}

function toMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStateCode(raw) {
    return String(raw || '').trim().toUpperCase();
}

function isTargetState(stateCode) {
    return TARGET_STATES.has(normalizeStateCode(stateCode));
}

function extractRows(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (payload.result && Array.isArray(payload.result)) return payload.result;
    if (payload.result && Array.isArray(payload.result.items)) return payload.result.items;
    return [];
}

function parsePosOrderTax(order) {
    const candidates = [
        order?.tax_amount,
        order?.taxAmount,
        order?.tax_total,
        order?.taxTotal,
        order?.total_tax,
        order?.totalTax
    ];
    for (const value of candidates) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return toMoney(parsed);
    }
    return 0;
}

class TaxLedgerService {
    constructor(pool) {
        this.pool = pool;
    }

    async ensureDailyReserve(dateKey) {
        await this.pool.execute(
            `INSERT INTO daily_tax_reserves (date, webstore_total, pos_total, combined_reserve_needed, status)
             VALUES (?, 0, 0, 0, 'pending')
             ON DUPLICATE KEY UPDATE date = VALUES(date)`,
            [dateKey]
        );
    }

    async upsertDailyReserve(dateKey) {
        await this.pool.execute(
            `INSERT INTO daily_tax_reserves (date, webstore_total, pos_total, combined_reserve_needed, status)
             SELECT ?, 
                    COALESCE(SUM(CASE WHEN source = 'webstore' THEN tax_amount ELSE 0 END), 0) AS webstore_total,
                    COALESCE(SUM(CASE WHEN source = 'pos' THEN tax_amount ELSE 0 END), 0) AS pos_total,
                    COALESCE(SUM(tax_amount), 0) AS combined_reserve_needed,
                    'pending'
               FROM tax_entries
              WHERE DATE(created_at) = ?
             ON DUPLICATE KEY UPDATE
                webstore_total = VALUES(webstore_total),
                pos_total = VALUES(pos_total),
                combined_reserve_needed = VALUES(combined_reserve_needed)`,
            [dateKey, dateKey]
        );
    }

    async syncWebstoreTaxEntries(dateKey) {
        const [orders] = await this.pool.execute(
            `SELECT id, order_number, tax_amount, shipping_state, shipping_postal_code, created_at
               FROM orders
              WHERE DATE(created_at) = ?
                AND COALESCE(tax_amount, 0) > 0
                AND status NOT IN ('cancelled', 'refunded')`,
            [dateKey]
        );

        let inserted = 0;
        for (const row of orders) {
            const stateCode = normalizeStateCode(row.shipping_state);
            if (!isTargetState(stateCode)) continue;

            const taxAmount = toMoney(row.tax_amount);
            const orderId = row.order_number || `WEB-${row.id}`;
            await this.pool.execute(
                `INSERT INTO tax_entries (order_id, source, tax_amount, taxable_amount, state_code, zip_code, created_at)
                 VALUES (?, 'webstore', ?, NULL, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    tax_amount = VALUES(tax_amount),
                    state_code = VALUES(state_code),
                    zip_code = VALUES(zip_code),
                    created_at = VALUES(created_at)`,
                [String(orderId), taxAmount, stateCode, row.shipping_postal_code || null, row.created_at]
            );
            inserted += 1;
        }

        await this.upsertDailyReserve(dateKey);
        return { inserted };
    }

    async fetchPosOrdersForDate(dateKey) {
        const baseUrl = process.env.OCTOPOS_API_URL || '';
        const token = process.env.OCTOPOS_TOKEN || '';
        if (!baseUrl || !token) {
            throw new Error('Missing OCTOPOS_API_URL or OCTOPOS_TOKEN');
        }

        const service = new OctoposService(baseUrl, token);
        const all = [];
        let page = 1;

        while (true) {
            const { start, end } = toStartEndUtc(dateKey);
            const response = await service.getOrdersByFilter({
                date_from: start,
                date_to: end,
                statuses: ['Completed', 'Paid'],
                page,
                limit: POS_PAGE_SIZE
            });

            if (!response?.success) {
                throw new Error(
                    response?.error?.message ||
                    `Octopos order fetch failed on page ${page}`
                );
            }

            const rows = extractRows(response.data);
            const pageRows = rows.filter((order) => {
                const status = String(order?.status || order?.payment_status || '').toLowerCase();
                return status.includes('complete') || status.includes('paid');
            });

            all.push(...pageRows);
            if (rows.length < POS_PAGE_SIZE) break;

            page += 1;
            await sleep(POS_REQUEST_DELAY_MS);
        }

        return all;
    }

    async syncPosTaxEntries(dateKey) {
        const orders = await this.fetchPosOrdersForDate(dateKey);
        let inserted = 0;
        let totalTax = 0;

        for (const order of orders) {
            const stateCode = normalizeStateCode(
                order?.shipping_state ||
                order?.ship_to_state ||
                order?.state
            );
            if (!isTargetState(stateCode)) continue;

            const orderId = String(
                order?.order_number ||
                order?.orderNumber ||
                order?.id ||
                order?.order_id ||
                ''
            ).trim();
            if (!orderId) continue;

            const taxAmount = parsePosOrderTax(order);
            if (taxAmount <= 0) continue;

            const taxableAmount = toMoney(
                order?.taxable_amount ||
                order?.taxableAmount ||
                order?.subtotal ||
                order?.sub_total ||
                0
            );
            const createdAt = order?.completed_at || order?.updated_at || order?.created_at || `${dateKey} 12:00:00`;
            const zipCode = order?.shipping_zip || order?.ship_to_zip || order?.zip_code || null;

            await this.pool.execute(
                `INSERT INTO tax_entries (order_id, source, tax_amount, taxable_amount, state_code, zip_code, created_at)
                 VALUES (?, 'pos', ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    tax_amount = VALUES(tax_amount),
                    taxable_amount = VALUES(taxable_amount),
                    state_code = VALUES(state_code),
                    zip_code = VALUES(zip_code),
                    created_at = VALUES(created_at)`,
                [orderId, taxAmount, taxableAmount || null, stateCode, zipCode, createdAt]
            );

            totalTax += taxAmount;
            inserted += 1;
        }

        await this.upsertDailyReserve(dateKey);
        return {
            inserted,
            totalTax: toMoney(totalTax),
            fetchedOrders: orders.length
        };
    }

    async runDailySync(dateKey = toDateKey()) {
        await this.ensureDailyReserve(dateKey);
        const webstore = await this.syncWebstoreTaxEntries(dateKey);
        let pos = {
            inserted: 0,
            totalTax: 0,
            fetchedOrders: 0,
            skipped: false
        };
        try {
            pos = await this.syncPosTaxEntries(dateKey);
        } catch (error) {
            // Allow daily reserve workflow even when Octopos is not configured yet.
            pos = {
                ...pos,
                skipped: true,
                reason: error.message || 'POS sync skipped'
            };
            logger.warn('[tax-ledger] POS sync skipped during daily sync', {
                date: dateKey,
                reason: pos.reason
            });
        }
        await this.upsertDailyReserve(dateKey);
        return { date: dateKey, webstore, pos };
    }

    async getDailyOverview(dateKey = toDateKey()) {
        await this.ensureDailyReserve(dateKey);
        await this.syncWebstoreTaxEntries(dateKey);
        await this.upsertDailyReserve(dateKey);

        const [[reserve]] = await this.pool.execute(
            `SELECT date, webstore_total, pos_total, combined_reserve_needed, status, updated_at
               FROM daily_tax_reserves
              WHERE date = ?`,
            [dateKey]
        );

        return reserve || null;
    }

    async markTransferred(dateKey = toDateKey()) {
        await this.ensureDailyReserve(dateKey);
        await this.pool.execute(
            `UPDATE daily_tax_reserves
                SET status = 'transferred'
              WHERE date = ?`,
            [dateKey]
        );
        return this.getDailyOverview(dateKey);
    }

    async exportTaxCloudCsv(startDate, endDate) {
        const [rows] = await this.pool.execute(
            `SELECT te.order_id,
                    te.source,
                    te.zip_code,
                    COALESCE(te.taxable_amount, o.subtotal, 0) AS taxable_amount,
                    te.tax_amount,
                    te.created_at
               FROM tax_entries te
          LEFT JOIN orders o ON te.source = 'webstore' AND (te.order_id = o.order_number OR te.order_id = CAST(o.id AS CHAR))
              WHERE DATE(te.created_at) BETWEEN ? AND ?
              ORDER BY te.created_at ASC, te.id ASC`,
            [startDate, endDate]
        );

        const lines = ['TransactionID,OrderDate,ShipToZip,TaxableAmount,TaxCollected'];
        for (const row of rows) {
            const created = new Date(row.created_at);
            const orderDate = `${String(created.getMonth() + 1).padStart(2, '0')}/${String(created.getDate()).padStart(2, '0')}/${created.getFullYear()}`;
            lines.push([
                `${row.source}-${row.order_id}`,
                orderDate,
                String(row.zip_code || ''),
                toMoney(row.taxable_amount).toFixed(2),
                toMoney(row.tax_amount).toFixed(2)
            ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
        }

        return {
            csv: lines.join('\n'),
            count: rows.length
        };
    }
}

module.exports = {
    TaxLedgerService,
    toDateKey
};

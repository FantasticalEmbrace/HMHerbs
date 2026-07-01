/**
 * Upsert product variants and sync parent price/inventory from variants.
 * Avoids DELETE-all, which breaks FK constraints on inventory_transactions / order_items.
 */
const { parsePriceFromLabel, labelWithoutPrice } = require('./extractHmherbsVariants');

function normalizeOptionGroups(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!Array.isArray(raw) || !raw.length) return null;
    return raw.map((g) => ({
        name: String(g.name || 'Options').trim(),
        values: Array.isArray(g.values) ? g.values.map((v) => String(v).trim()).filter(Boolean) : [],
    }));
}

function normalizeVariantRow(v, productSku, index) {
    const rawName = String(v.name || v.label || '').trim();
    let name = labelWithoutPrice(rawName);
    name = name.replace(/\s*\(\s*\$\s*[\d,.]+\s*\)\s*$/i, '').trim();
    if (!name) name = rawName;

    let price = parseFloat(v.price);
    if (!Number.isFinite(price)) {
        const fromName = parsePriceFromLabel(rawName);
        price = fromName != null ? fromName : NaN;
    }
    if (!Number.isFinite(price)) return null;

    let sku = String(v.sku || '').trim();
    if (!sku) {
        const ext = v.externalValue || v.external_value;
        const hint = v.skuHint || v.sku_hint;
        if (ext) {
            sku = `${productSku}-${ext}`;
        } else if (hint) {
            sku = `${productSku}-${hint}-${index + 1}`;
        } else {
            sku = `${productSku}-V${index + 1}`;
        }
    }
    sku = sku.slice(0, 100);

    let attributes = v.attributes;
    if (typeof attributes === 'string') {
        try {
            attributes = JSON.parse(attributes);
        } catch {
            attributes = null;
        }
    }

    const id = v.id != null && v.id !== '' ? parseInt(v.id, 10) : null;

    return {
        id: Number.isFinite(id) ? id : null,
        sku,
        name,
        price,
        compare_price:
            v.compare_price != null && v.compare_price !== ''
                ? parseFloat(v.compare_price)
                : null,
        cost_price:
            v.cost_price != null && v.cost_price !== ''
                ? parseFloat(v.cost_price)
                : null,
        image_url: String(v.image_url || '').trim() || null,
        inventory_quantity: parseInt(v.inventory_quantity, 10) || 0,
        weight: v.weight != null && v.weight !== '' ? parseFloat(v.weight) : null,
        is_active: v.is_active === false || v.is_active === 0 ? 0 : 1,
        sort_order: v.sort_order != null ? parseInt(v.sort_order, 10) : index,
        attributes: attributes && typeof attributes === 'object' ? attributes : null,
    };
}

async function variantIsReferenced(connection, variantId) {
    const [inventory] = await connection.execute(
        'SELECT 1 FROM inventory_transactions WHERE variant_id = ? LIMIT 1',
        [variantId]
    );
    if (inventory.length > 0) return true;

    const [orders] = await connection.execute(
        'SELECT 1 FROM order_items WHERE variant_id = ? LIMIT 1',
        [variantId]
    );
    return orders.length > 0;
}

async function saveProductVariants(connection, productId, productSku, variantOptionGroups, variants) {
    const groupsJson = normalizeOptionGroups(variantOptionGroups);
    const groupsPayload = groupsJson ? JSON.stringify(groupsJson) : null;

    await connection.execute('UPDATE products SET variant_option_groups = ? WHERE id = ?', [
        groupsPayload,
        productId,
    ]);

    const [existingRows] = await connection.execute(
        'SELECT id, sku FROM product_variants WHERE product_id = ?',
        [productId]
    );
    const existingById = new Map(existingRows.map((r) => [Number(r.id), r]));
    const existingBySku = new Map(existingRows.map((r) => [String(r.sku), r]));

    const keptIds = new Set();
    const rawList = Array.isArray(variants) ? variants : [];
    const rows = rawList
        .map((v, i) => normalizeVariantRow(v, productSku, i))
        .filter(Boolean);

    for (const row of rows) {
        let targetId = row.id && existingById.has(row.id) ? row.id : null;
        if (!targetId && row.sku && existingBySku.has(row.sku)) {
            targetId = Number(existingBySku.get(row.sku).id);
        }

        const attrsJson = row.attributes ? JSON.stringify(row.attributes) : null;

        if (targetId) {
            await connection.execute(
                `UPDATE product_variants
                 SET sku = ?, name = ?, price = ?, compare_price = ?, cost_price = ?, image_url = ?, inventory_quantity = ?,
                     weight = ?, is_active = ?, sort_order = ?, attributes = ?
                 WHERE id = ? AND product_id = ?`,
                [
                    row.sku,
                    row.name,
                    row.price,
                    row.compare_price,
                    row.cost_price,
                    row.image_url,
                    row.inventory_quantity,
                    row.weight,
                    row.is_active,
                    row.sort_order,
                    attrsJson,
                    targetId,
                    productId,
                ]
            );
            keptIds.add(targetId);
        } else {
            const [insertResult] = await connection.execute(
                `INSERT INTO product_variants
                 (product_id, sku, name, price, compare_price, cost_price, image_url, inventory_quantity, weight, is_active, sort_order, attributes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    productId,
                    row.sku,
                    row.name,
                    row.price,
                    row.compare_price,
                    row.cost_price,
                    row.image_url,
                    row.inventory_quantity,
                    row.weight,
                    row.is_active,
                    row.sort_order,
                    attrsJson,
                ]
            );
            keptIds.add(Number(insertResult.insertId));
        }
    }

    for (const existing of existingRows) {
        const existingId = Number(existing.id);
        if (keptIds.has(existingId)) continue;

        if (await variantIsReferenced(connection, existingId)) {
            await connection.execute(
                'UPDATE product_variants SET is_active = 0 WHERE id = ? AND product_id = ?',
                [existingId, productId]
            );
        } else {
            await connection.execute(
                'DELETE FROM product_variants WHERE id = ? AND product_id = ?',
                [existingId, productId]
            );
        }
    }

    if (rows.length) {
        const minPrice = Math.min(...rows.map((r) => r.price));
        const totalInv = rows.reduce((s, r) => s + (r.inventory_quantity || 0), 0);
        await connection.execute(
            'UPDATE products SET price = ?, inventory_quantity = ? WHERE id = ?',
            [minPrice, totalInv, productId]
        );
    }

    return rows.length;
}

module.exports = { saveProductVariants, normalizeOptionGroups, normalizeVariantRow };

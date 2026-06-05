/**
 * Replace all variants for a product and sync parent price/inventory from variants.
 */
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
    const name = String(v.name || v.label || '').trim();
    if (!name) return null;

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

    const price = parseFloat(v.price);
    if (!Number.isFinite(price)) return null;

    let attributes = v.attributes;
    if (typeof attributes === 'string') {
        try {
            attributes = JSON.parse(attributes);
        } catch {
            attributes = null;
        }
    }

    return {
        sku,
        name,
        price,
        compare_price:
            v.compare_price != null && v.compare_price !== ''
                ? parseFloat(v.compare_price)
                : null,
        inventory_quantity: parseInt(v.inventory_quantity, 10) || 0,
        weight: v.weight != null && v.weight !== '' ? parseFloat(v.weight) : null,
        is_active: v.is_active === false || v.is_active === 0 ? 0 : 1,
        sort_order: v.sort_order != null ? parseInt(v.sort_order, 10) : index,
        attributes: attributes && typeof attributes === 'object' ? attributes : null,
    };
}

async function saveProductVariants(connection, productId, productSku, variantOptionGroups, variants) {
    const groupsJson = normalizeOptionGroups(variantOptionGroups);
    const groupsPayload = groupsJson ? JSON.stringify(groupsJson) : null;

    await connection.execute('UPDATE products SET variant_option_groups = ? WHERE id = ?', [
        groupsPayload,
        productId,
    ]);

    await connection.execute('DELETE FROM product_variants WHERE product_id = ?', [productId]);

    const rows = (variants || [])
        .map((v, i) => normalizeVariantRow(v, productSku, i))
        .filter(Boolean);

    for (const row of rows) {
        await connection.execute(
            `INSERT INTO product_variants
             (product_id, sku, name, price, compare_price, inventory_quantity, weight, is_active, sort_order, attributes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                productId,
                row.sku,
                row.name,
                row.price,
                row.compare_price,
                row.inventory_quantity,
                row.weight,
                row.is_active,
                row.sort_order,
                row.attributes ? JSON.stringify(row.attributes) : null,
            ]
        );
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

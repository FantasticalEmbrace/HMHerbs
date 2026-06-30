/**
 * Shared product SKU generation and uniqueness checks.
 */

function generateRandomProductSku() {
    return `HM-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

function generateSkuFromProductName(name) {
    const base = String(name || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 28) || 'ITEM';
    return `HM-${base}-${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
}

function normalizeScannedSku(value) {
    return String(value || '').trim().replace(/\s+/g, '');
}

async function skuExists(pool, sku, excludeProductId = null) {
    const trimmed = normalizeScannedSku(sku);
    if (!trimmed) return false;

    if (excludeProductId != null) {
        const [rows] = await pool.execute(
            'SELECT id FROM products WHERE sku = ? AND id != ? LIMIT 1',
            [trimmed, excludeProductId]
        );
        return rows.length > 0;
    }

    const [rows] = await pool.execute(
        'SELECT id FROM products WHERE sku = ? LIMIT 1',
        [trimmed]
    );
    return rows.length > 0;
}

async function generateUniqueProductSku(pool, { name = null, maxAttempts = 12 } = {}) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = name && attempt < 4
            ? generateSkuFromProductName(name)
            : generateRandomProductSku();
        // eslint-disable-next-line no-await-in-loop
        const taken = await skuExists(pool, candidate);
        if (!taken) return candidate;
    }
    return generateRandomProductSku();
}

module.exports = {
    generateRandomProductSku,
    generateSkuFromProductName,
    normalizeScannedSku,
    skuExists,
    generateUniqueProductSku,
};

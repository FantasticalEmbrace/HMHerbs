'use strict';

const logger = require('./logger');

const DENOMINATIONS = [10, 25, 50, 75, 100];
const CATEGORY_SLUG = 'gift-cards';

async function tableExists(pool, tableName) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
    );
    return Number(rows[0].c) > 0;
}

async function columnExists(pool, tableName, columnName) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );
    return Number(rows[0].c) > 0;
}

async function resolveBrandId(pool) {
    const [[row]] = await pool.query(
        `SELECT id FROM brands WHERE is_active = 1 ORDER BY id ASC LIMIT 1`
    );
    if (row?.id) return row.id;

    const [r] = await pool.execute(
        `INSERT INTO brands (name, slug, description, is_active)
         VALUES ('H&M Herbs', 'hm-herbs', 'H&M Herbs & Vitamins', 1)`
    );
    return r.insertId;
}

async function ensureCategory(pool) {
    const [[existing]] = await pool.execute(
        'SELECT id FROM product_categories WHERE slug = ? LIMIT 1',
        [CATEGORY_SLUG]
    );
    if (existing?.id) return existing.id;

    const [r] = await pool.execute(
        `INSERT INTO product_categories (name, slug, description, sort_order, is_active)
         VALUES ('Gift Cards', ?, 'Digital and physical gift cards', 999, 1)`,
        [CATEGORY_SLUG]
    );
    logger.info('[gift-card-catalog] Created Gift Cards category');
    return r.insertId;
}

async function upsertGiftCardProduct(pool, { sku, slug, name, cardType, categoryId, brandId }) {
    const [[existing]] = await pool.execute('SELECT id FROM products WHERE sku = ? LIMIT 1', [sku]);
    const requiresShipping = cardType === 'physical' ? 1 : 0;
    const hasGiftTypeCol = await columnExists(pool, 'products', 'gift_card_type');

    if (existing?.id) {
        if (hasGiftTypeCol) {
            await pool.execute(
                `UPDATE products SET gift_card_type = ?, category_id = ?, requires_shipping = ?,
                        track_inventory = 0, is_active = 1, is_taxable = 0
                 WHERE id = ?`,
                [cardType, categoryId, requiresShipping, existing.id]
            );
        }
        return existing.id;
    }

    const minPrice = Math.min(...DENOMINATIONS);
    const cols = [
        'sku', 'name', 'slug', 'short_description', 'long_description',
        'brand_id', 'category_id', 'price', 'requires_shipping',
        'is_taxable', 'track_inventory', 'inventory_quantity', 'is_active'
    ];
    const vals = [
        sku,
        name,
        slug,
        cardType === 'digital'
            ? 'Send instantly by email. Recipient gets an account to track their balance.'
            : 'Mailed to you or your recipient. Optional recipient email creates an account to track balance.',
        `<p>${name} — choose an amount and add recipient details at checkout.</p>`,
        brandId,
        categoryId,
        minPrice,
        requiresShipping,
        0,
        0,
        9999,
        1
    ];

    if (hasGiftTypeCol) {
        cols.push('gift_card_type');
        vals.push(cardType);
    }

    const [r] = await pool.execute(
        `INSERT INTO products (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
    );
    logger.info(`[gift-card-catalog] Created product ${sku}`);
    return r.insertId;
}

async function ensureVariants(pool, productId, cardType) {
    for (const amount of DENOMINATIONS) {
        const sku = `GC-${cardType === 'digital' ? 'DIG' : 'PHY'}-${amount}`;
        const [[existing]] = await pool.execute(
            'SELECT id FROM product_variants WHERE sku = ? LIMIT 1',
            [sku]
        );
        if (existing?.id) {
            await pool.execute(
                'UPDATE product_variants SET price = ?, is_active = 1 WHERE id = ?',
                [amount, existing.id]
            );
            continue;
        }
        await pool.execute(
            `INSERT INTO product_variants (product_id, sku, name, price, inventory_quantity, is_active, sort_order)
             VALUES (?, ?, ?, ?, 9999, 1, ?)`,
            [productId, sku, `$${amount}`, amount, amount]
        );
    }
}

/**
 * Ensures gift card category + digital/physical products with amount variants exist.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureGiftCardCatalog(pool) {
    if (!(await tableExists(pool, 'products'))) return;
    if (!(await tableExists(pool, 'product_categories'))) return;
    if (!(await tableExists(pool, 'product_variants'))) return;

    try {
        const brandId = await resolveBrandId(pool);
        const categoryId = await ensureCategory(pool);

        const digitalId = await upsertGiftCardProduct(pool, {
            sku: 'GC-DIGITAL',
            slug: 'digital-gift-card',
            name: 'Digital Gift Card',
            cardType: 'digital',
            categoryId,
            brandId
        });
        await ensureVariants(pool, digitalId, 'digital');

        const physicalId = await upsertGiftCardProduct(pool, {
            sku: 'GC-PHYSICAL',
            slug: 'physical-gift-card',
            name: 'Physical Gift Card',
            cardType: 'physical',
            categoryId,
            brandId
        });
        await ensureVariants(pool, physicalId, 'physical');
    } catch (err) {
        logger.warn(`[gift-card-catalog] seed skipped or partial — ${logger.formatMysqlError(err)}`);
    }
}

module.exports = { ensureGiftCardCatalog, CATEGORY_SLUG, DENOMINATIONS };

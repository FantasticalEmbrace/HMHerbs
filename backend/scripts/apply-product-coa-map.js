#!/usr/bin/env node
/**
 * Set coa_url + is_cannabis for products (paths are served from site root).
 *
 * Usage (from backend/): node scripts/apply-product-coa-map.js
 * Optional: --dry-run
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

/** slug -> public path + batch date on COA where known */
const MAP = [
    {
        slug: 'herbs-for-life-cbd-gummies-sleep',
        coa_url: '/images/coa/herbs-for-life-15mg-coa-2024-09-19.pdf',
        coa_updated_at: '2024-09-19',
        note: 'Source file: Herbs for Life - 15mg COA (sleep gummies are 15mg CBD per gummy)'
    },
    {
        slug: 'herbs-for-life-cbd-gummies-30mg',
        coa_url: '/images/coa/herbs-for-life-30mg-coa-2024-09-19.pdf',
        coa_updated_at: '2024-09-19',
        note: 'Source: Herbs for Life - 30mg COA'
    },
    {
        slug: 'herbs-for-life-delta-9-gummies-10mg-ea',
        coa_url: '/images/coa/herbs-for-life-delta-9-coa.pdf',
        coa_updated_at: '2024-09-19',
        note: 'Source: Herbs for Life - Delta 9 COA'
    },
    {
        slug: 'hippie-jack-s-cbd-extreme-1000mg-pain-cream',
        coa_url: '/images/coa/hippie-jacks-extreme-pain-cream-coa.pdf',
        coa_updated_at: '2026-04-16',
        note: 'Source: Hippie Jacks - Extreme Pain Cream COA'
    },
    {
        slug: 'regalabs-cannabis-care-cream-free-shipping',
        coa_url: '/images/coa/regalabs-cannabis-care-coa.html',
        coa_updated_at: '2026-04-16',
        note: 'Regal Labs Cannabis Care COA pages 1–5 (JPG); shared with roll-on'
    },
    {
        slug: 'regalabs-cannabis-care-roll-on',
        coa_url: '/images/coa/regalabs-cannabis-care-coa.html',
        coa_updated_at: '2026-04-16',
        note: 'Same multi-page COA as Cannabis Care cream'
    },
    {
        slug: 'regalabs-organic-cbd-oils',
        coa_url: '/images/coa/regalabs-organic-cbd-oils-coas.html',
        coa_updated_at: '2025-07-25',
        note: 'Index to 5mg (072525), Silver 10mg (032625), Platinum 30mg PDFs'
    }
];

(async () => {
    const dryRun = process.argv.includes('--dry-run');
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hmherbs'
    });

    console.log(dryRun ? 'DRY RUN\n' : 'Applying COA map…\n');

    for (const row of MAP) {
        const [products] = await pool.query('SELECT id, name, coa_url FROM products WHERE slug = ? LIMIT 1', [
            row.slug
        ]);
        if (!products.length) {
            console.warn(`SKIP: no product with slug "${row.slug}"`);
            continue;
        }
        const p = products[0];
        if (dryRun) {
            console.log(`Would set ${row.slug} (${p.name})\n  → ${row.coa_url}\n  (${row.note})\n`);
            continue;
        }
        await pool.execute(
            `UPDATE products SET coa_url = ?, coa_updated_at = ?, is_cannabis = 1 WHERE id = ?`,
            [row.coa_url, row.coa_updated_at, p.id]
        );
        console.log(`✓ ${row.slug} (id ${p.id})`);
        console.log(`  ${row.coa_url}`);
    }

    await pool.end();
    console.log('\nDone.');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});

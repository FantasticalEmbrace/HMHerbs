#!/usr/bin/env node
/**
 * Ensures every active product slug has a matching /index.php/products/{slug} → product.html redirect.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { parseRedirectCsv, normalizePathname } = require('../../backend/middleware/seoRedirects');

const rootDir = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(rootDir, 'backend', '.env') });

function loadAllRedirects() {
    const map = new Map();
    for (const name of [
        'redirects-301.csv',
        'redirects-legacy-sitemap.csv',
        'redirects-products-db.csv',
        'redirects-slug-aliases.csv'
    ]) {
        const fp = path.join(rootDir, name);
        if (!fs.existsSync(fp)) continue;
        for (const [k, v] of parseRedirectCsv(fs.readFileSync(fp, 'utf8'))) {
            map.set(k, v);
        }
    }
    return map;
}

async function main() {
    const redirects = loadAllRedirects();
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hmherbs',
        connectionLimit: 2
    });

    const [products] = await pool.query(
        'SELECT slug FROM products WHERE is_active = 1 AND TRIM(slug) <> "" ORDER BY slug'
    );
    await pool.end();

    const missing = [];
    const wrongTarget = [];
    for (const { slug } of products) {
        const from = normalizePathname(`/index.php/products/${slug}`);
        const want = `/product.html?slug=${encodeURIComponent(slug)}`;
        const got = redirects.get(from);
        if (!got) {
            missing.push(slug);
        } else if (got !== want) {
            wrongTarget.push({ slug, got, want });
        }
    }

    console.log('Active products:', products.length);
    console.log('Redirect rules loaded:', redirects.size);
    console.log('Missing product redirects:', missing.length);
    if (missing.length) {
        console.log('  Examples:', missing.slice(0, 10).join(', '));
    }
    console.log('Mismatched targets:', wrongTarget.length);
    if (wrongTarget.length) {
        console.log('  Example:', wrongTarget[0]);
    }

    if (missing.length || wrongTarget.length) {
        process.exit(1);
    }
    console.log('All active products have correct 301 redirect rules.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

/**
 * Script to find products without images
 * Queries the database to find all products that don't have primary images
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function findProductsWithoutImages() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hmherbs',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        console.log('🔍 Finding products without images...\n');

        // Query products that don't have a primary image
        const query = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.slug,
                b.id as brand_id,
                b.name as brand_name,
                b.slug as brand_slug,
                b.website_url as brand_website_url
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
            WHERE p.is_active = 1 
            AND pi.id IS NULL
            ORDER BY b.name, p.name
        `;

        const [products] = await pool.execute(query);

        console.log(`📊 Found ${products.length} products without images\n`);

        if (products.length === 0) {
            console.log('✅ All products have images!');
            return [];
        }

        // Group by brand for better organization
        const productsByBrand = {};
        products.forEach(product => {
            const brandName = product.brand_name || 'Unknown Brand';
            if (!productsByBrand[brandName]) {
                productsByBrand[brandName] = {
                    brand_name: brandName,
                    brand_slug: product.brand_slug,
                    website_url: product.brand_website_url,
                    products: []
                };
            }
            productsByBrand[brandName].products.push({
                id: product.id,
                sku: product.sku,
                name: product.name,
                slug: product.slug
            });
        });

        // Display results
        console.log('📦 Products without images grouped by brand:\n');
        Object.keys(productsByBrand).sort().forEach(brandName => {
            const brandInfo = productsByBrand[brandName];
            console.log(`\n🏷️  ${brandName}`);
            if (brandInfo.website_url) {
                console.log(`   Website: ${brandInfo.website_url}`);
            } else {
                console.log(`   ⚠️  No website URL in database`);
            }
            console.log(`   Products (${brandInfo.products.length}):`);
            brandInfo.products.forEach(p => {
                console.log(`      - ID: ${p.id}, SKU: ${p.sku}, Name: "${p.name}"`);
            });
        });

        // Save to JSON file for reference
        const fs = require('fs');
        const path = require('path');
        const outputPath = path.join(__dirname, '../../products-without-images.json');
        fs.writeFileSync(outputPath, JSON.stringify({
            total_count: products.length,
            generated_at: new Date().toISOString(),
            products_by_brand: productsByBrand
        }, null, 2));
        console.log(`\n💾 Results saved to: ${outputPath}`);

        return productsByBrand;

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    findProductsWithoutImages()
        .then(() => {
            console.log('\n✅ Script completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

module.exports = { findProductsWithoutImages };


// Update Product Images in Database
// Updates product_images table with local image paths after downloading

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class ProductImageUpdater {
    constructor() {
        this.pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'hmherbs',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }

    async updateAllProducts() {
        console.log('🔄 Starting product image database update...\n');

        try {
            // Load products with local images
            const productsPath = path.join(__dirname, '../data/products-with-images.json');
            let productsData;

            try {
                const data = await fs.readFile(productsPath, 'utf8');
                productsData = JSON.parse(data);
            } catch (error) {
                console.error(`❌ Could not load products-with-images.json: ${error.message}`);
                console.log('💡 Please run download-product-images.js first');
                return;
            }

            const products = productsData.products || [];
            console.log(`📦 Found ${products.length} products to update\n`);

            let updated = 0;
            let skipped = 0;
            let errors = 0;

            for (let i = 0; i < products.length; i++) {
                const product = products[i];
                
                if (!product.localImages || product.localImages.length === 0) {
                    skipped++;
                    continue;
                }

                try {
                    await this.updateProductImages(product);
                    updated++;
                    
                    if ((i + 1) % 10 === 0) {
                        console.log(`📊 Progress: ${i + 1}/${products.length} products processed`);
                    }
                } catch (error) {
                    console.error(`❌ Error updating product ${product.sku}: ${error.message}`);
                    errors++;
                }
            }

            console.log('\n' + '='.repeat(60));
            console.log('📊 UPDATE SUMMARY');
            console.log('='.repeat(60));
            console.log(`✅ Products Updated: ${updated}`);
            console.log(`⏭️  Products Skipped: ${skipped}`);
            console.log(`❌ Errors: ${errors}`);
            console.log('\n✅ Database update complete!');

        } catch (error) {
            console.error('❌ Update failed:', error);
        } finally {
            await this.pool.end();
        }
    }

    async updateProductImages(product) {
        const connection = await this.pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Find product by SKU
            const [products] = await connection.execute(
                'SELECT id FROM products WHERE sku = ?',
                [product.sku]
            );

            if (products.length === 0) {
                console.log(`   ⚠️  Product not found in database: ${product.sku} - ${product.name}`);
                await connection.rollback();
                return;
            }

            const productId = products[0].id;

            // Delete existing images
            await connection.execute(
                'DELETE FROM product_images WHERE product_id = ?',
                [productId]
            );

            // Insert new images
            for (let i = 0; i < product.localImages.length; i++) {
                const imagePath = product.localImages[i];
                const altText = product.name || 'Product image';
                const isPrimary = i === 0;

                await connection.execute(
                    `INSERT INTO product_images 
                     (product_id, image_url, alt_text, is_primary, sort_order) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [productId, imagePath, altText, isPrimary, i]
                );
            }

            await connection.commit();
            console.log(`   ✅ Updated: ${product.sku} - ${product.name} (${product.localImages.length} images)`);

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

// CLI usage
if (require.main === module) {
    const updater = new ProductImageUpdater();
    updater.updateAllProducts()
        .then(() => {
            console.log('\n🎉 Database update completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Database update failed:', error);
            process.exit(1);
        });
}

module.exports = ProductImageUpdater;


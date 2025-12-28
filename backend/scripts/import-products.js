// Product Import Script for HM Herbs
// Handles bulk import of products from CSV/Excel files

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const csv = require('csv-parser');
const path = require('path');
require('dotenv').config();

class ProductImporter {
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

        this.importStats = {
            total: 0,
            success: 0,
            errors: 0,
            skipped: 0
        };
    }

    // Main import function
    async importFromCSV(filePath) {
        console.log(`Starting import from: ${filePath}`);

        try {
            const products = await this.parseCSV(filePath);
            console.log(`Found ${products.length} products to import`);

            this.importStats.total = products.length;

            for (const product of products) {
                try {
                    await this.importSingleProduct(product);
                    this.importStats.success++;

                    if (this.importStats.success % 100 === 0) {
                        console.log(`Imported ${this.importStats.success} products...`);
                    }
                } catch (error) {
                    console.error(`Error importing product ${product.name}:`, error.message);
                    this.importStats.errors++;
                }
            }

            this.printImportSummary();

        } catch (error) {
            console.error('Import failed:', error);
        }
    }

    // Import from JSON file (for scraped products)
    async importFromJSON(filePath) {
        console.log(`Starting import from JSON: ${filePath}`);

        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const jsonData = JSON.parse(fileContent);
            const products = jsonData.products || [];

            console.log(`Found ${products.length} products to import`);

            this.importStats.total = products.length;

            for (const product of products) {
                try {
                    // Map JSON product to import format
                    const mappedProduct = this.mapJSONToProduct(product);
                    if (mappedProduct) {
                        await this.importSingleProduct(mappedProduct);
                        this.importStats.success++;

                        if (this.importStats.success % 100 === 0) {
                            console.log(`Imported ${this.importStats.success} products...`);
                        }
                    } else {
                        this.importStats.skipped++;
                    }
                } catch (error) {
                    console.error(`Error importing product ${product.name || 'Unknown'}:`, error.message);
                    this.importStats.errors++;
                }
            }

            this.printImportSummary();

        } catch (error) {
            console.error('Import failed:', error);
            throw error;
        }
    }

    // Map JSON product to import format
    mapJSONToProduct(jsonProduct) {
        try {
            return {
                sku: jsonProduct.sku || this.generateSKU(),
                name: jsonProduct.name || 'Unknown Product',
                slug: this.generateSlug(jsonProduct.name || 'unknown-product'),
                short_description: jsonProduct.shortDescription || jsonProduct.description || '',
                long_description: jsonProduct.description || jsonProduct.longDescription || '',
                brand: jsonProduct.brand || 'Unknown',
                category: jsonProduct.category || 'General',
                price: parseFloat(jsonProduct.price || 0),
                compare_price: parseFloat(jsonProduct.comparePrice || 0) || null,
                weight: parseFloat(jsonProduct.weight || 0) || null,
                inventory_quantity: parseInt(jsonProduct.inventory || jsonProduct.inStock ? 10 : 0),
                is_active: jsonProduct.inStock !== false,
                is_featured: false,
                health_categories: jsonProduct.healthCategories || [],
                images: (jsonProduct.images || []).map(img => ({
                    url: typeof img === 'string' ? img : (img.url || ''),
                    alt: typeof img === 'string' ? '' : (img.alt || '')
                })),
                variants: []
            };
        } catch (error) {
            console.error('Error mapping JSON product:', error);
            return null;
        }
    }

    // Parse CSV file
    async parseCSV(filePath) {
        return new Promise((resolve, reject) => {
            const products = [];
            const stream = require('fs').createReadStream(filePath);

            stream
                .pipe(csv())
                .on('data', (row) => {
                    // Map CSV columns to product structure
                    const product = this.mapCSVToProduct(row);
                    if (product) {
                        products.push(product);
                    }
                })
                .on('end', () => {
                    resolve(products);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    // Map CSV row to product object
    mapCSVToProduct(row) {
        try {
            return {
                sku: row.sku || row.SKU || row['Product Code'] || this.generateSKU(),
                name: row.name || row.Name || row['Product Name'] || row.title,
                slug: this.generateSlug(row.name || row.Name || row['Product Name']),
                short_description: row.short_description || row['Short Description'] || '',
                long_description: row.description || row.Description || row['Long Description'] || '',
                brand: row.brand || row.Brand || row.manufacturer || 'Unknown',
                category: row.category || row.Category || 'General',
                price: parseFloat(row.price || row.Price || row.cost || 0),
                compare_price: parseFloat(row.compare_price || row['Compare Price'] || row.msrp || 0) || null,
                weight: parseFloat(row.weight || row.Weight || 0) || null,
                inventory_quantity: parseInt(row.inventory || row.Inventory || row.stock || 0),
                is_active: (row.active || row.Active || 'true').toLowerCase() === 'true',
                is_featured: (row.featured || row.Featured || 'false').toLowerCase() === 'true',
                health_categories: this.parseHealthCategories(row.health_categories || row['Health Categories'] || ''),
                images: this.parseImages(row.images || row.Images || row.image_url || ''),
                variants: this.parseVariants(row.variants || row.Variants || '')
            };
        } catch (error) {
            console.error('Error mapping CSV row:', error);
            return null;
        }
    }

    // Import single product
    async importSingleProduct(productData) {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();

            // Get or create brand
            const brandId = await this.getOrCreateBrand(connection, productData.brand);

            // Get or create category
            const categoryId = await this.getOrCreateCategory(connection, productData.category);

            // Check if product already exists by SKU first
            let [existing] = await connection.execute(
                'SELECT id FROM products WHERE sku = ?',
                [productData.sku]
            );

            // Fallback: Check by Name if SKU not found or if it's a generated SKU
            if (existing.length === 0 || productData.sku.startsWith('HM-')) {
                const [existingByName] = await connection.execute(
                    'SELECT id, sku FROM products WHERE name = ?',
                    [productData.name]
                );
                if (existingByName.length > 0) {
                    // Use the existing one
                    existing = existingByName;
                }
            }

            let productId;

            if (existing.length > 0) {
                // Update existing product
                productId = existing[0].id;

                // If the existing one has a real SKU and we have a generated one, don't overwrite SKU
                const skuToUse = (existing[0].sku && !existing[0].sku.startsWith('HM-'))
                    ? existing[0].sku
                    : productData.sku;

                // SMART BRAND/CATEGORY UPDATE: Don't overwrite real names with "Unknown"/"General"
                const [currentValues] = await connection.execute(
                    'SELECT brand_id, category_id FROM products WHERE id = ?',
                    [productId]
                );

                let brandIdToUse = brandId;
                let categoryIdToUse = categoryId;

                if (productData.brand === 'Unknown' || productData.brand === '') {
                    // Check if current brand is better than "Unknown"
                    const [currentBrand] = await connection.execute('SELECT name FROM brands WHERE id = ?', [currentValues[0].brand_id]);
                    if (currentBrand.length > 0 && currentBrand[0].name !== 'Unknown') {
                        brandIdToUse = currentValues[0].brand_id;
                    }
                }

                if (productData.category === 'General' || productData.category === '') {
                    // Check if current category is better than "General"
                    const [currentCategory] = await connection.execute('SELECT name FROM product_categories WHERE id = ?', [currentValues[0].category_id]);
                    if (currentCategory.length > 0 && currentCategory[0].name !== 'General' && currentCategory[0].name !== 'Unknown') {
                        categoryIdToUse = currentValues[0].category_id;
                    }
                }

                await connection.execute(`
                    UPDATE products SET 
                        sku = ?, name = ?, slug = ?, short_description = ?, long_description = ?,
                        brand_id = ?, category_id = ?, price = ?, compare_price = ?,
                        weight = ?, inventory_quantity = ?, is_active = ?, is_featured = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [
                    skuToUse, productData.name, productData.slug, productData.short_description,
                    productData.long_description, brandIdToUse, categoryIdToUse, productData.price,
                    productData.compare_price, productData.weight, productData.inventory_quantity,
                    productData.is_active, productData.is_featured, productId
                ]);
            } else {
                // Insert new product
                const [result] = await connection.execute(`
                    INSERT INTO products (
                        sku, name, slug, short_description, long_description,
                        brand_id, category_id, price, compare_price, weight,
                        inventory_quantity, is_active, is_featured
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    productData.sku, productData.name, productData.slug,
                    productData.short_description, productData.long_description,
                    brandId, categoryId, productData.price, productData.compare_price,
                    productData.weight, productData.inventory_quantity,
                    productData.is_active, productData.is_featured
                ]);
                productId = result.insertId;
            }

            // Handle health categories
            if (productData.health_categories.length > 0) {
                await this.assignHealthCategories(connection, productId, productData.health_categories);
            }

            // Handle images
            if (productData.images.length > 0) {
                await this.addProductImages(connection, productId, productData.images);
            }

            // Handle variants
            if (productData.variants.length > 0) {
                await this.addProductVariants(connection, productId, productData.variants);
            }

            await connection.commit();

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get or create brand
    async getOrCreateBrand(connection, brandName) {
        const [existing] = await connection.execute(
            'SELECT id FROM brands WHERE name = ?',
            [brandName]
        );

        if (existing.length > 0) {
            return existing[0].id;
        }

        const [result] = await connection.execute(
            'INSERT INTO brands (name, slug) VALUES (?, ?)',
            [brandName, this.generateSlug(brandName)]
        );

        return result.insertId;
    }

    // Get or create category
    async getOrCreateCategory(connection, categoryName) {
        const [existing] = await connection.execute(
            'SELECT id FROM product_categories WHERE name = ?',
            [categoryName]
        );

        if (existing.length > 0) {
            return existing[0].id;
        }

        const [result] = await connection.execute(
            'INSERT INTO product_categories (name, slug) VALUES (?, ?)',
            [categoryName, this.generateSlug(categoryName)]
        );

        return result.insertId;
    }

    // Assign health categories
    async assignHealthCategories(connection, productId, healthCategories) {
        // Clear existing assignments
        await connection.execute(
            'DELETE FROM product_health_categories WHERE product_id = ?',
            [productId]
        );

        for (const categoryName of healthCategories) {
            const [category] = await connection.execute(
                'SELECT id FROM health_categories WHERE name = ? OR slug = ?',
                [categoryName, this.generateSlug(categoryName)]
            );

            if (category.length > 0) {
                await connection.execute(
                    'INSERT IGNORE INTO product_health_categories (product_id, health_category_id) VALUES (?, ?)',
                    [productId, category[0].id]
                );
            }
        }
    }

    // Add product images
    async addProductImages(connection, productId, images) {
        // Clear existing images
        await connection.execute(
            'DELETE FROM product_images WHERE product_id = ?',
            [productId]
        );

        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            await connection.execute(
                'INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES (?, ?, ?, ?, ?)',
                [productId, image.url, image.alt || '', i === 0, i]
            );
        }
    }

    // Add product variants
    async addProductVariants(connection, productId, variants) {
        // Clear existing variants
        await connection.execute(
            'DELETE FROM product_variants WHERE product_id = ?',
            [productId]
        );

        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            await connection.execute(
                'INSERT INTO product_variants (product_id, sku, name, price, inventory_quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                [productId, variant.sku, variant.name, variant.price, variant.inventory || 0, i]
            );
        }
    }

    // Utility functions
    generateSlug(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    generateSKU() {
        return 'HM-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }

    parseHealthCategories(categoriesString) {
        if (!categoriesString) return [];
        return categoriesString.split(',').map(cat => cat.trim()).filter(cat => cat);
    }

    parseImages(imagesString) {
        if (!imagesString) return [];
        const urls = imagesString.split(',').map(url => url.trim()).filter(url => url);
        return urls.map(url => ({ url, alt: '' }));
    }

    parseVariants(variantsString) {
        if (!variantsString) return [];
        try {
            return JSON.parse(variantsString);
        } catch {
            return [];
        }
    }

    printImportSummary() {
        console.log('\n=== IMPORT SUMMARY ===');
        console.log(`Total products processed: ${this.importStats.total}`);
        console.log(`Successfully imported: ${this.importStats.success}`);
        console.log(`Errors: ${this.importStats.errors}`);
        console.log(`Skipped: ${this.importStats.skipped}`);
        console.log('======================\n');
    }
}

// CLI usage
if (require.main === module) {
    const filePath = process.argv[2];
    const fileType = process.argv[3] || 'auto'; // 'csv', 'json', or 'auto'

    if (!filePath) {
        console.log('Usage: node import-products.js <file-path> [csv|json|auto]');
        console.log('Example: node import-products.js ./data/products.csv');
        console.log('Example: node import-products.js ./data/complete-scraped-products.json json');
        process.exit(1);
    }

    const importer = new ProductImporter();
    const ext = path.extname(filePath).toLowerCase();
    const importType = fileType === 'auto' ? (ext === '.json' ? 'json' : 'csv') : fileType;

    const importPromise = importType === 'json'
        ? importer.importFromJSON(filePath)
        : importer.importFromCSV(filePath);

    importPromise
        .then(() => {
            console.log('Import completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Import failed:', error);
            process.exit(1);
        });
}

module.exports = ProductImporter;

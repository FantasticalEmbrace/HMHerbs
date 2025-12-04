// Admin Panel Routes for HM Herbs
// Complete admin interface for managing products, orders, customers, and EDSA bookings

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const HMHerbsScraper = require('../scripts/scrape-hmherbs');
const ProductImporter = require('../scripts/import-products');
const InventoryService = require('../services/inventory');
const VendorService = require('../services/vendor');
const POSService = require('../services/pos');
const GiftCardService = require('../services/giftcard');
const LoyaltyService = require('../services/loyalty');
const AnalyticsService = require('../services/analytics');

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Admin access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const [rows] = await req.pool.execute(
            'SELECT id, email, first_name, last_name, role, is_active FROM admin_users WHERE id = ? AND is_active = 1',
            [decoded.adminId]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid admin token' });
        }

        req.admin = rows[0];
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid admin token' });
    }
};

// Check admin permissions
const requirePermission = (minRole) => {
    const roleHierarchy = { 'staff': 1, 'manager': 2, 'admin': 3, 'super_admin': 4 };
    
    return (req, res, next) => {
        const userLevel = roleHierarchy[req.admin.role] || 0;
        const requiredLevel = roleHierarchy[minRole] || 0;
        
        if (userLevel < requiredLevel) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// Admin Authentication
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const [admins] = await req.pool.execute(
            'SELECT id, email, password_hash, first_name, last_name, role, is_active FROM admin_users WHERE email = ?',
            [email]
        );

        if (admins.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const admin = admins[0];

        if (!admin.is_active) {
            return res.status(401).json({ error: 'Account is deactivated' });
        }

        const isValidPassword = await bcrypt.compare(password, admin.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await req.pool.execute(
            'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [admin.id]
        );

        const token = jwt.sign(
            { adminId: admin.id },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '8h' }
        );

        res.json({
            message: 'Admin login successful',
            token,
            admin: {
                id: admin.id,
                email: admin.email,
                firstName: admin.first_name,
                lastName: admin.last_name,
                role: admin.role
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Dashboard Statistics
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
    try {
        // Get various statistics
        const [productStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_products,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_products,
                COUNT(CASE WHEN is_featured = 1 THEN 1 END) as featured_products,
                COUNT(CASE WHEN inventory_quantity <= low_stock_threshold THEN 1 END) as low_stock_products
            FROM products
        `);

        const [orderStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_orders,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_orders,
                COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
                SUM(total_amount) as total_revenue
            FROM orders
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);

        const [userStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_users_30_days
            FROM users
        `);

        const [edsaStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_bookings_30_days
            FROM edsa_bookings
        `);

        res.json({
            products: productStats[0],
            orders: orderStats[0],
            users: userStats[0],
            edsa: edsaStats[0]
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Product Management
router.get('/products', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search, brand, category, status } = req.query;
        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];

        if (search) {
            whereConditions.push('(p.name LIKE ? OR p.sku LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        if (brand) {
            whereConditions.push('b.slug = ?');
            queryParams.push(brand);
        }

        if (category) {
            whereConditions.push('pc.slug = ?');
            queryParams.push(category);
        }

        if (status === 'active') {
            whereConditions.push('p.is_active = 1');
        } else if (status === 'inactive') {
            whereConditions.push('p.is_active = 0');
        } else if (status === 'low_stock') {
            whereConditions.push('p.inventory_quantity <= p.low_stock_threshold');
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                p.id, p.sku, p.name, p.slug, p.price, p.inventory_quantity,
                p.low_stock_threshold, p.is_active, p.is_featured, p.created_at,
                b.name as brand_name, pc.name as category_name
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `;

        queryParams.push(parseInt(limit), offset);

        const [products] = await req.pool.execute(query, queryParams);

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            ${whereClause}
        `;

        const [countResult] = await req.pool.execute(countQuery, queryParams.slice(0, -2));
        const totalProducts = countResult[0].total;

        res.json({
            products,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalProducts / limit),
                totalProducts,
                hasNextPage: page < Math.ceil(totalProducts / limit),
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Admin products fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create Product
router.post('/products', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const {
            sku, name, short_description, long_description, brand_id, category_id,
            price, compare_price, weight, inventory_quantity, low_stock_threshold,
            is_active, is_featured, health_categories, images, variants
        } = req.body;

        // Validate required fields
        if (!sku || !name || !brand_id || !category_id || !price) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if SKU already exists
        const [existing] = await req.pool.execute(
            'SELECT id FROM products WHERE sku = ?',
            [sku]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'SKU already exists' });
        }

        const connection = await req.pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Generate slug
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

            // Insert product
            const [result] = await connection.execute(`
                INSERT INTO products (
                    sku, name, slug, short_description, long_description,
                    brand_id, category_id, price, compare_price, weight,
                    inventory_quantity, low_stock_threshold, is_active, is_featured
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sku, name, slug, short_description || '', long_description || '',
                brand_id, category_id, price, compare_price || null, weight || null,
                inventory_quantity || 0, low_stock_threshold || 10,
                is_active !== false, is_featured === true
            ]);

            const productId = result.insertId;

            // Add health categories
            if (health_categories && health_categories.length > 0) {
                for (const categoryId of health_categories) {
                    await connection.execute(
                        'INSERT INTO product_health_categories (product_id, health_category_id) VALUES (?, ?)',
                        [productId, categoryId]
                    );
                }
            }

            // Add images
            if (images && images.length > 0) {
                for (let i = 0; i < images.length; i++) {
                    const image = images[i];
                    await connection.execute(
                        'INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES (?, ?, ?, ?, ?)',
                        [productId, image.url, image.alt || '', i === 0, i]
                    );
                }
            }

            // Add variants
            if (variants && variants.length > 0) {
                for (let i = 0; i < variants.length; i++) {
                    const variant = variants[i];
                    await connection.execute(
                        'INSERT INTO product_variants (product_id, sku, name, price, inventory_quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                        [productId, variant.sku, variant.name, variant.price, variant.inventory_quantity || 0, i]
                    );
                }
            }

            await connection.commit();

            res.status(201).json({
                message: 'Product created successfully',
                productId
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Product creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update Product
router.put('/products/:id', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Check if product exists
        const [existing] = await req.pool.execute(
            'SELECT id FROM products WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const connection = await req.pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Build update query dynamically
            const updateFields = [];
            const updateValues = [];

            const allowedFields = [
                'name', 'short_description', 'long_description', 'brand_id', 'category_id',
                'price', 'compare_price', 'weight', 'inventory_quantity', 'low_stock_threshold',
                'is_active', 'is_featured'
            ];

            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    updateFields.push(`${field} = ?`);
                    updateValues.push(updateData[field]);
                }
            }

            if (updateFields.length > 0) {
                updateFields.push('updated_at = CURRENT_TIMESTAMP');
                updateValues.push(id);

                await connection.execute(
                    `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
                    updateValues
                );
            }

            await connection.commit();

            res.json({ message: 'Product updated successfully' });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Product update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete Product
router.delete('/products/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await req.pool.execute(
            'DELETE FROM products WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Product deletion error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Order Management
router.get('/orders', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];

        if (status) {
            whereConditions.push('o.status = ?');
            queryParams.push(status);
        }

        if (search) {
            whereConditions.push('(o.order_number LIKE ? OR o.email LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const [orders] = await req.pool.execute(`
            SELECT 
                o.id, o.order_number, o.email, o.status, o.payment_status,
                o.total_amount, o.created_at, o.shipping_first_name, o.shipping_last_name,
                COUNT(oi.id) as item_count
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ${whereClause}
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), offset]);

        res.json({ orders });
    } catch (error) {
        console.error('Admin orders fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// EDSA Booking Management
router.get('/edsa/bookings', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, date } = req.query;
        const offset = (page - 1) * limit;

        let whereConditions = [];
        let queryParams = [];

        if (status) {
            whereConditions.push('status = ?');
            queryParams.push(status);
        }

        if (date) {
            whereConditions.push('preferred_date = ?');
            queryParams.push(date);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const [bookings] = await req.pool.execute(`
            SELECT 
                id, first_name, last_name, email, phone,
                preferred_date, preferred_time, alternative_date, alternative_time,
                confirmed_date, confirmed_time, status, notes, admin_notes, created_at
            FROM edsa_bookings
            ${whereClause}
            ORDER BY preferred_date ASC, preferred_time ASC
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), offset]);

        res.json({ bookings });
    } catch (error) {
        console.error('Admin EDSA bookings fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update EDSA Booking Status
router.put('/edsa/bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, confirmed_date, confirmed_time, admin_notes } = req.body;

        const [result] = await req.pool.execute(`
            UPDATE edsa_bookings 
            SET status = ?, confirmed_date = ?, confirmed_time = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [status, confirmed_date || null, confirmed_time || null, admin_notes || null, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ message: 'Booking updated successfully' });
    } catch (error) {
        console.error('EDSA booking update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get System Settings
router.get('/settings', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const [settings] = await req.pool.execute(
            'SELECT key_name, value, description, type FROM settings ORDER BY key_name'
        );

        res.json({ settings });
    } catch (error) {
        console.error('Settings fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update System Settings
router.put('/settings', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const { settings } = req.body;

        const connection = await req.pool.getConnection();
        
        try {
            await connection.beginTransaction();

            for (const setting of settings) {
                await connection.execute(
                    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key_name = ?',
                    [setting.value, setting.key_name]
                );
            }

            await connection.commit();

            res.json({ message: 'Settings updated successfully' });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Scrape Products from HM Herbs Website
router.post('/scrape-products', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        console.log('Starting HM Herbs website scraping...');
        
        const scraper = new HMHerbsScraper();
        await scraper.scrapeAllProducts();
        
        // Import the scraped products
        const importer = new ProductImporter();
        await importer.importFromCSV('./data/scraped-products.csv');
        
        res.json({
            message: 'Products scraped and imported successfully',
            productsFound: scraper.products.length
        });
        
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape products: ' + error.message });
    }
});

// Import Products from CSV
router.post('/import-products', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        // Handle file upload (you'd need multer middleware for this)
        // For now, we'll assume the file is already uploaded
        
        const importer = new ProductImporter();
        await importer.importFromCSV('./data/uploaded-products.csv');
        
        res.json({
            message: 'Products imported successfully',
            imported: importer.importStats.success
        });
        
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Failed to import products: ' + error.message });
    }
});

// Inventory Management Endpoints

// Get inventory transaction history
router.get('/inventory/history/:productId', authenticateAdmin, async (req, res) => {
    try {
        const { productId } = req.params;
        const { variantId, limit = 50 } = req.query;
        
        const inventoryService = new InventoryService(req.pool);
        const history = await inventoryService.getInventoryHistory(
            parseInt(productId),
            variantId ? parseInt(variantId) : null,
            parseInt(limit)
        );
        
        res.json(history);
    } catch (error) {
        console.error('Get inventory history error:', error);
        res.status(500).json({ error: 'Failed to get inventory history' });
    }
});

// Get low stock products
router.get('/inventory/low-stock', authenticateAdmin, async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        
        const inventoryService = new InventoryService(req.pool);
        const lowStockProducts = await inventoryService.getLowStockProducts(parseInt(limit));
        
        res.json(lowStockProducts);
    } catch (error) {
        console.error('Get low stock products error:', error);
        res.status(500).json({ error: 'Failed to get low stock products' });
    }
});

// Manual inventory adjustment
router.post('/inventory/adjust', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { productId, variantId, quantityChange, reason } = req.body;
        const adminId = req.admin.id;
        
        if (!productId || quantityChange === undefined) {
            return res.status(400).json({ error: 'Product ID and quantity change are required' });
        }
        
        const inventoryService = new InventoryService(req.pool);
        const result = await inventoryService.adjustInventory(
            parseInt(productId),
            variantId ? parseInt(variantId) : null,
            parseInt(quantityChange),
            adminId,
            reason || 'Manual adjustment'
        );
        
        res.json({
            success: true,
            message: 'Inventory adjusted successfully',
            result
        });
    } catch (error) {
        console.error('Inventory adjustment error:', error);
        res.status(500).json({ error: 'Failed to adjust inventory: ' + error.message });
    }
});

// Get current inventory level
router.get('/inventory/current/:productId', authenticateAdmin, async (req, res) => {
    try {
        const { productId } = req.params;
        const { variantId } = req.query;
        
        const inventoryService = new InventoryService(req.pool);
        const currentInventory = await inventoryService.getCurrentInventory(
            parseInt(productId),
            variantId ? parseInt(variantId) : null
        );
        
        res.json({ inventory: currentInventory });
    } catch (error) {
        console.error('Get current inventory error:', error);
        res.status(500).json({ error: 'Failed to get current inventory' });
    }
});

// Bulk inventory update
router.post('/inventory/bulk-update', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const { inventoryUpdates, reason } = req.body;
        
        if (!Array.isArray(inventoryUpdates) || inventoryUpdates.length === 0) {
            return res.status(400).json({ error: 'Inventory updates array is required' });
        }
        
        const inventoryService = new InventoryService(req.pool);
        const results = await inventoryService.bulkInventoryImport(
            inventoryUpdates,
            reason || 'Bulk inventory update'
        );
        
        res.json({
            success: true,
            message: `Successfully updated ${results.length} products`,
            results
        });
    } catch (error) {
        console.error('Bulk inventory update error:', error);
        res.status(500).json({ error: 'Failed to update inventory: ' + error.message });
    }
});

// Enhanced dashboard stats with inventory info
router.get('/dashboard/inventory-stats', authenticateAdmin, async (req, res) => {
    try {
        const inventoryService = new InventoryService(req.pool);
        
        // Get low stock count
        const lowStockProducts = await inventoryService.getLowStockProducts(100);
        
        // Get total products with inventory tracking
        const [inventoryStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_tracked_products,
                SUM(CASE WHEN inventory_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_products,
                SUM(CASE WHEN inventory_quantity <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock_products,
                SUM(inventory_quantity) as total_inventory_units
            FROM products 
            WHERE track_inventory = 1 AND is_active = 1
        `);
        
        // Get recent inventory transactions
        const [recentTransactions] = await req.pool.execute(`
            SELECT 
                it.*,
                p.name as product_name,
                p.sku as product_sku
            FROM inventory_transactions it
            JOIN products p ON it.product_id = p.id
            ORDER BY it.created_at DESC
            LIMIT 10
        `);
        
        res.json({
            inventory: inventoryStats[0],
            lowStockProducts: lowStockProducts.slice(0, 10), // Top 10 low stock
            recentTransactions
        });
    } catch (error) {
        console.error('Get inventory stats error:', error);
        res.status(500).json({ error: 'Failed to get inventory statistics' });
    }
});

// ===== VENDOR MANAGEMENT ENDPOINTS =====

// Get all vendors
router.get('/vendors', authenticateAdmin, async (req, res) => {
    try {
        const vendorService = new VendorService(req.pool);
        const vendors = await vendorService.getVendors(req.query);
        res.json({ vendors });
    } catch (error) {
        console.error('Get vendors error:', error);
        res.status(500).json({ error: 'Failed to get vendors' });
    }
});

// Create new vendor
router.post('/vendors', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const vendorService = new VendorService(req.pool);
        const vendor = await vendorService.createVendor(req.body, req.admin.id);
        res.status(201).json({ vendor });
    } catch (error) {
        console.error('Create vendor error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get vendor by ID
router.get('/vendors/:id', authenticateAdmin, async (req, res) => {
    try {
        const vendorService = new VendorService(req.pool);
        const vendor = await vendorService.getVendorById(req.params.id);
        res.json({ vendor });
    } catch (error) {
        console.error('Get vendor error:', error);
        res.status(404).json({ error: error.message });
    }
});

// Update vendor
router.put('/vendors/:id', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const vendorService = new VendorService(req.pool);
        const vendor = await vendorService.updateVendor(req.params.id, req.body, req.admin.id);
        res.json({ vendor });
    } catch (error) {
        console.error('Update vendor error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete vendor
router.delete('/vendors/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const vendorService = new VendorService(req.pool);
        const result = await vendorService.deleteVendor(req.params.id, req.admin.id);
        res.json(result);
    } catch (error) {
        console.error('Delete vendor error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Import vendor catalog
router.post('/vendors/:id/import-catalog', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const vendorService = new VendorService(req.pool);
        const result = await vendorService.importCatalog(req.params.id, 'manual');
        res.json(result);
    } catch (error) {
        console.error('Import catalog error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get vendor analytics
router.get('/vendors/:id/analytics', authenticateAdmin, async (req, res) => {
    try {
        const vendorService = new VendorService(req.pool);
        const analytics = await vendorService.getVendorAnalytics(req.params.id, req.query.days || 30);
        res.json({ analytics });
    } catch (error) {
        console.error('Get vendor analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get vendor import history
router.get('/vendors/:id/import-history', authenticateAdmin, async (req, res) => {
    try {
        const vendorService = new VendorService(req.pool);
        const history = await vendorService.getImportHistory(req.params.id, req.query.limit || 20);
        res.json({ history });
    } catch (error) {
        console.error('Get import history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== POS INTEGRATION ENDPOINTS =====

// Get all POS systems
router.get('/pos/systems', authenticateAdmin, async (req, res) => {
    try {
        const posService = new POSService(req.pool, new InventoryService(req.pool));
        const systems = await posService.getPOSSystems(req.query);
        res.json({ systems });
    } catch (error) {
        console.error('Get POS systems error:', error);
        res.status(500).json({ error: 'Failed to get POS systems' });
    }
});

// Create new POS system
router.post('/pos/systems', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const posService = new POSService(req.pool, new InventoryService(req.pool));
        const system = await posService.createPOSSystem(req.body, req.admin.id);
        res.status(201).json({ system });
    } catch (error) {
        console.error('Create POS system error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get POS system by ID
router.get('/pos/systems/:id', authenticateAdmin, async (req, res) => {
    try {
        const posService = new POSService(req.pool, new InventoryService(req.pool));
        const system = await posService.getPOSSystemById(req.params.id);
        res.json({ system });
    } catch (error) {
        console.error('Get POS system error:', error);
        res.status(404).json({ error: error.message });
    }
});

// Update POS system
router.put('/pos/systems/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const posService = new POSService(req.pool, new InventoryService(req.pool));
        const system = await posService.updatePOSSystem(req.params.id, req.body, req.admin.id);
        res.json({ system });
    } catch (error) {
        console.error('Update POS system error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test POS connection
router.post('/pos/systems/:id/test', authenticateAdmin, async (req, res) => {
    try {
        const posService = new POSService(req.pool, new InventoryService(req.pool));
        const result = await posService.testConnection(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Test POS connection error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sync inventory to POS
router.post('/pos/systems/:id/sync-inventory', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const posService = new POSService(req.pool, new InventoryService(req.pool));
        const result = await posService.syncInventoryToPOS(req.params.id, req.body.product_ids);
        res.json(result);
    } catch (error) {
        console.error('Sync inventory to POS error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sync inventory from POS
router.post('/pos/systems/:id/sync-from-pos', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const posService = new POSService(req.pool, new InventoryService(req.pool));
        const result = await posService.syncInventoryFromPOS(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Sync inventory from POS error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POS webhook endpoint
router.post('/pos/webhook/:systemId', async (req, res) => {
    try {
        const posService = new POSService(req.pool, new InventoryService(req.pool));
        const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
        const result = await posService.handleWebhook(req.params.systemId, req.body, signature);
        res.json(result);
    } catch (error) {
        console.error('POS webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== GIFT CARD MANAGEMENT ENDPOINTS =====

// Get all gift cards
router.get('/giftcards', authenticateAdmin, async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const giftCards = await giftCardService.getGiftCards(req.query);
        res.json({ giftCards });
    } catch (error) {
        console.error('Get gift cards error:', error);
        res.status(500).json({ error: 'Failed to get gift cards' });
    }
});

// Generate single gift card
router.post('/giftcards/generate', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const giftCard = await giftCardService.generateGiftCard(req.body, req.admin.id);
        res.status(201).json({ giftCard });
    } catch (error) {
        console.error('Generate gift card error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate bulk gift cards
router.post('/giftcards/generate-bulk', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const giftCards = await giftCardService.generateBulkGiftCards(req.body, req.admin.id);
        res.status(201).json({ giftCards });
    } catch (error) {
        console.error('Generate bulk gift cards error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get gift card by ID
router.get('/giftcards/:id', authenticateAdmin, async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const giftCard = await giftCardService.getGiftCardById(req.params.id);
        res.json({ giftCard });
    } catch (error) {
        console.error('Get gift card error:', error);
        res.status(404).json({ error: error.message });
    }
});

// Update gift card status
router.put('/giftcards/:id/status', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const result = await giftCardService.updateGiftCardStatus(
            req.params.id, 
            req.body.status, 
            req.admin.id, 
            req.body.notes
        );
        res.json(result);
    } catch (error) {
        console.error('Update gift card status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Adjust gift card balance
router.post('/giftcards/:id/adjust-balance', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const result = await giftCardService.adjustGiftCardBalance(
            req.params.id, 
            req.body.adjustment, 
            req.admin.id, 
            req.body.notes
        );
        res.json(result);
    } catch (error) {
        console.error('Adjust gift card balance error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get gift card transactions
router.get('/giftcards/:id/transactions', authenticateAdmin, async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const transactions = await giftCardService.getGiftCardTransactions(req.params.id, req.query.limit || 50);
        res.json({ transactions });
    } catch (error) {
        console.error('Get gift card transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get gift card analytics
router.get('/giftcards/analytics', authenticateAdmin, async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const analytics = await giftCardService.getGiftCardAnalytics(req.query.days || 30);
        res.json({ analytics });
    } catch (error) {
        console.error('Get gift card analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Process expired gift cards
router.post('/giftcards/process-expired', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const giftCardService = new GiftCardService(req.pool);
        const result = await giftCardService.processExpiredGiftCards();
        res.json(result);
    } catch (error) {
        console.error('Process expired gift cards error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== LOYALTY PROGRAM ENDPOINTS =====

// Get all loyalty programs
router.get('/loyalty/programs', authenticateAdmin, async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const programs = await loyaltyService.getLoyaltyPrograms(req.query);
        res.json({ programs });
    } catch (error) {
        console.error('Get loyalty programs error:', error);
        res.status(500).json({ error: 'Failed to get loyalty programs' });
    }
});

// Create loyalty program
router.post('/loyalty/programs', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const program = await loyaltyService.createLoyaltyProgram(req.body, req.admin.id);
        res.status(201).json({ program });
    } catch (error) {
        console.error('Create loyalty program error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get loyalty program by ID
router.get('/loyalty/programs/:id', authenticateAdmin, async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const program = await loyaltyService.getLoyaltyProgramById(req.params.id);
        res.json({ program });
    } catch (error) {
        console.error('Get loyalty program error:', error);
        res.status(404).json({ error: error.message });
    }
});

// Update loyalty program
router.put('/loyalty/programs/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const program = await loyaltyService.updateLoyaltyProgram(req.params.id, req.body, req.admin.id);
        res.json({ program });
    } catch (error) {
        console.error('Update loyalty program error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create loyalty tier
router.post('/loyalty/programs/:id/tiers', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const tierId = await loyaltyService.createLoyaltyTier(req.params.id, req.body);
        res.status(201).json({ tier_id: tierId });
    } catch (error) {
        console.error('Create loyalty tier error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update loyalty tier
router.put('/loyalty/tiers/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const result = await loyaltyService.updateLoyaltyTier(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        console.error('Update loyalty tier error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get loyalty customers
router.get('/loyalty/customers', authenticateAdmin, async (req, res) => {
    try {
        const { program_id, limit = 50, offset = 0 } = req.query;
        
        let query = `
            SELECT cl.*, u.email, u.first_name, u.last_name,
                   lp.name as program_name, lt.tier_name
            FROM customer_loyalty cl
            JOIN users u ON cl.user_id = u.id
            JOIN loyalty_programs lp ON cl.program_id = lp.id
            LEFT JOIN loyalty_tiers lt ON cl.current_tier_id = lt.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (program_id) {
            query += ' AND cl.program_id = ?';
            params.push(program_id);
        }
        
        query += ' ORDER BY cl.enrolled_date DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [customers] = await req.pool.execute(query, params);
        res.json({ customers });
    } catch (error) {
        console.error('Get loyalty customers error:', error);
        res.status(500).json({ error: 'Failed to get loyalty customers' });
    }
});

// Adjust customer points
router.post('/loyalty/customers/:userId/adjust-points', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const result = await loyaltyService.adjustPoints(
            req.params.userId,
            req.body.program_id,
            req.body.points_adjustment,
            req.admin.id,
            req.body.reason
        );
        res.json(result);
    } catch (error) {
        console.error('Adjust customer points error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get loyalty analytics
router.get('/loyalty/analytics', authenticateAdmin, async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const analytics = await loyaltyService.getLoyaltyAnalytics(req.query.program_id, req.query.days || 30);
        res.json({ analytics });
    } catch (error) {
        console.error('Get loyalty analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get loyalty tier distribution
router.get('/loyalty/programs/:id/tier-distribution', authenticateAdmin, async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const distribution = await loyaltyService.getLoyaltyTierDistribution(req.params.id);
        res.json({ distribution });
    } catch (error) {
        console.error('Get tier distribution error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Process expired loyalty points
router.post('/loyalty/process-expired-points', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const loyaltyService = new LoyaltyService(req.pool);
        const result = await loyaltyService.processExpiredPoints();
        res.json(result);
    } catch (error) {
        console.error('Process expired points error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== ANALYTICS AND MONITORING ENDPOINTS =====

// Get comprehensive dashboard overview
router.get('/analytics/dashboard', authenticateAdmin, async (req, res) => {
    try {
        const analyticsService = new AnalyticsService(req.pool);
        const overview = await analyticsService.getDashboardOverview(req.query.days || 30);
        res.json({ overview });
    } catch (error) {
        console.error('Get dashboard overview error:', error);
        res.status(500).json({ error: 'Failed to get dashboard overview' });
    }
});

// Get vendor performance metrics
router.get('/analytics/vendors', authenticateAdmin, async (req, res) => {
    try {
        const analyticsService = new AnalyticsService(req.pool);
        const metrics = await analyticsService.getVendorPerformanceMetrics(req.query.vendor_id, req.query.days || 30);
        res.json({ metrics });
    } catch (error) {
        console.error('Get vendor metrics error:', error);
        res.status(500).json({ error: 'Failed to get vendor metrics' });
    }
});

// Get POS system health
router.get('/analytics/pos-health', authenticateAdmin, async (req, res) => {
    try {
        const analyticsService = new AnalyticsService(req.pool);
        const health = await analyticsService.getPOSSystemHealth(req.query.system_id);
        res.json({ health });
    } catch (error) {
        console.error('Get POS health error:', error);
        res.status(500).json({ error: 'Failed to get POS system health' });
    }
});

// Get system alerts
router.get('/analytics/alerts', authenticateAdmin, async (req, res) => {
    try {
        const analyticsService = new AnalyticsService(req.pool);
        const alerts = await analyticsService.getSystemAlerts();
        res.json({ alerts });
    } catch (error) {
        console.error('Get system alerts error:', error);
        res.status(500).json({ error: 'Failed to get system alerts' });
    }
});

// Get performance metrics
router.get('/analytics/performance', authenticateAdmin, async (req, res) => {
    try {
        const analyticsService = new AnalyticsService(req.pool);
        const metrics = await analyticsService.getPerformanceMetrics(req.query.hours || 24);
        res.json({ metrics });
    } catch (error) {
        console.error('Get performance metrics error:', error);
        res.status(500).json({ error: 'Failed to get performance metrics' });
    }
});

module.exports = router;

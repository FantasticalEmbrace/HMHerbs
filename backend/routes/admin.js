// Admin Panel Routes for HM Herbs
// Complete admin interface for managing products, orders, customers, and EDSA bookings

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const HMHerbsScraper = require('../scripts/scrape-hmherbs');
const ProductImporter = require('../scripts/import-products');

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

module.exports = router;

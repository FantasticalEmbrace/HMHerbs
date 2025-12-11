// Admin Panel Routes for HM Herbs
// Complete admin interface for managing products, orders, customers, and EDSA bookings

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');
const {
    adminLoginValidation,
    productValidation,
    settingsValidation,
    inventoryAdjustmentValidation,
    vendorValidation,
    commonValidations
} = require('../middleware/validation');
const HMHerbsScraper = require('../scripts/scrape-hmherbs');
const ProductImporter = require('../scripts/import-products');
const InventoryService = require('../services/inventory');
const VendorService = require('../services/vendor');
const POSService = require('../services/pos');
const POSGiftCardService = require('../services/pos-giftcard');
const POSLoyaltyService = require('../services/pos-loyalty');
const POSDiscountService = require('../services/pos-discount');
const EmailCampaignService = require('../services/email-campaign');
const AnalyticsService = require('../services/analytics');

// Rate limiting for admin authentication
const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 admin auth attempts per windowMs
    message: {
        error: 'Too many admin authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Admin access token required' });
    }

    if (!process.env.JWT_SECRET) {
        logger.error('CRITICAL: JWT_SECRET environment variable is not set');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
router.post('/auth/login', adminAuthLimiter, adminLoginValidation, async (req, res) => {
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

        if (!process.env.JWT_SECRET) {
            logger.error('CRITICAL: JWT_SECRET environment variable is not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const token = jwt.sign(
            { adminId: admin.id },
            process.env.JWT_SECRET,
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
        logger.logError('Admin login error', error, { email });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Forgot Password - Request reset link
router.post('/auth/forgot-password', adminAuthLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if admin exists
        const [admins] = await req.pool.execute(
            'SELECT id, email, first_name, last_name FROM admin_users WHERE email = ? AND is_active = 1',
            [email]
        );

        // Always return success message (security best practice - don't reveal if email exists)
        if (admins.length > 0) {
            const admin = admins[0];

            // Generate reset token
            const crypto = require('crypto');
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour from now

            // Save token to database
            await req.pool.execute(
                'UPDATE admin_users SET password_reset_token = ?, password_reset_token_expires = ? WHERE id = ?',
                [resetToken, resetTokenExpires, admin.id]
            );

            // Generate reset URL
            const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8000'}/admin-reset-password.html?token=${resetToken}`;

            // Send email (if email service is configured)
            try {
                if (process.env.SMTP_HOST && process.env.SMTP_USER) {
                    const nodemailer = require('nodemailer');
                    const transporter = nodemailer.createTransport({
                        host: process.env.SMTP_HOST,
                        port: process.env.SMTP_PORT || 587,
                        secure: process.env.SMTP_PORT == 465,
                        auth: {
                            user: process.env.SMTP_USER,
                            pass: process.env.SMTP_PASSWORD
                        }
                    });

                    await transporter.sendMail({
                        from: process.env.SMTP_USER,
                        to: admin.email,
                        subject: 'HM Herbs Admin - Password Reset',
                        html: `
                            <h2>Password Reset Request</h2>
                            <p>Hello ${admin.first_name},</p>
                            <p>You requested to reset your password. Click the link below to reset it:</p>
                            <p><a href="${resetUrl}" style="background: #2d5a27; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
                            <p>Or copy this link: ${resetUrl}</p>
                            <p>This link will expire in 1 hour.</p>
                            <p>If you didn't request this, please ignore this email.</p>
                        `
                    });
                } else {
                    // Log the reset URL if email is not configured (for development)
                    logger.info('Password reset token generated (email not configured):', {
                        email: admin.email,
                        resetUrl
                    });
                    console.log('\n🔑 Password Reset Link (Email not configured):');
                    console.log(`   ${resetUrl}\n`);
                }
            } catch (emailError) {
                logger.error('Failed to send password reset email:', emailError);
                // Still return success - token is saved, user can check logs
            }
        }

        // Always return success (security best practice)
        res.json({
            message: 'If an account with that email exists, a password reset link has been sent.'
        });
    } catch (error) {
        logger.logError('Forgot password error', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Reset Password - Verify token and reset password
router.post('/auth/reset-password', adminAuthLimiter, async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long' });
        }

        // Find admin with valid token
        const [admins] = await req.pool.execute(
            'SELECT id, email FROM admin_users WHERE password_reset_token = ? AND password_reset_token_expires > NOW() AND is_active = 1',
            [token]
        );

        if (admins.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const admin = admins[0];

        // Hash new password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password and clear reset token
        await req.pool.execute(
            'UPDATE admin_users SET password_hash = ?, password_reset_token = NULL, password_reset_token_expires = NULL, updated_at = NOW() WHERE id = ?',
            [passwordHash, admin.id]
        );

        res.json({
            message: 'Password reset successfully. You can now login with your new password.'
        });
    } catch (error) {
        logger.logError('Reset password error', error);
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
        logger.logError('Dashboard stats error', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Product Management
router.get('/products', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const { search, brand, category, status } = req.query;
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

        // Ensure limit and offset are proper integers (safe to use in string interpolation)
        const limitInt = Number.isInteger(limit) && limit > 0 ? limit : 20;
        const offsetInt = Number.isInteger(offset) && offset >= 0 ? offset : 0;

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
            LIMIT ${limitInt} OFFSET ${offsetInt}
        `;

        const [products] = await req.pool.execute(query, queryParams);

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            ${whereClause}
        `;

        // For count query, remove the LIMIT and OFFSET params (last 2)
        const countParams = queryParams.slice(0, -2);
        const [countResult] = await req.pool.execute(countQuery, countParams.length > 0 ? countParams : []);
        const totalProducts = countResult[0]?.total || 0;

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
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Create Product
router.post('/products', authenticateAdmin, requirePermission('manager'), productValidation, async (req, res) => {
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

// Get Single Product by ID
router.get('/products/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [products] = await req.pool.execute(`
            SELECT 
                p.id, p.sku, p.name, p.slug, p.short_description, p.long_description,
                p.brand_id, p.category_id, p.price, p.compare_price, p.weight,
                p.inventory_quantity, p.low_stock_threshold, p.is_active, p.is_featured,
                p.created_at, p.updated_at,
                b.name as brand_name,
                pc.name as category_name
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            WHERE p.id = ?
        `, [id]);

        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[0];

        // Get product images
        const [images] = await req.pool.execute(
            'SELECT image_url, alt_text, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order',
            [id]
        );

        // Get health categories
        const [healthCategories] = await req.pool.execute(`
            SELECT hc.id, hc.name
            FROM health_categories hc
            JOIN product_health_categories phc ON hc.id = phc.health_category_id
            WHERE phc.product_id = ?
        `, [id]);

        product.images = images;
        product.health_categories = healthCategories.map(hc => hc.id);

        res.json(product);
    } catch (error) {
        console.error('Get product error:', error);
        console.error('Error stack:', error.stack);
        console.error('Product ID:', req.params.id);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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

            // Update images if provided
            if (updateData.images && Array.isArray(updateData.images)) {
                // Delete existing images
                await connection.execute(
                    'DELETE FROM product_images WHERE product_id = ?',
                    [id]
                );

                // Insert new images
                for (let i = 0; i < updateData.images.length; i++) {
                    const image = updateData.images[i];
                    await connection.execute(
                        'INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES (?, ?, ?, ?, ?)',
                        [id, image.url, image.alt || '', i === 0, i]
                    );
                }
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
        const pageNum = parseInt(page) || 1;
        const limitValue = parseInt(limit) || 20;
        const offsetValue = (pageNum - 1) * limitValue;

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

        // MySQL2 doesn't support placeholders for LIMIT and OFFSET, so use string interpolation
        // Also use a subquery to avoid GROUP BY issues with all columns
        const query = `
            SELECT 
                o.id, o.order_number, o.email, o.status, o.payment_status,
                o.total_amount, o.created_at, o.shipping_first_name, o.shipping_last_name,
                COALESCE(oi_counts.item_count, 0) as item_count
            FROM orders o
            LEFT JOIN (
                SELECT order_id, COUNT(id) as item_count
                FROM order_items
                GROUP BY order_id
            ) oi_counts ON o.id = oi_counts.order_id
            ${whereClause}
            ORDER BY o.created_at DESC
            LIMIT ${limitValue} OFFSET ${offsetValue}
        `;

        const [orders] = await req.pool.execute(query, queryParams);

        res.json({ orders });
    } catch (error) {
        console.error('Admin orders fetch error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// EDSA Booking Management
router.get('/edsa/bookings', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, date } = req.query;
        const pageNum = parseInt(page) || 1;
        const limitInt = parseInt(limit) || 20;
        const offsetInt = (pageNum - 1) * limitInt;

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

        // MySQL2 doesn't support placeholders for LIMIT and OFFSET, so use string interpolation

        const [bookings] = await req.pool.execute(`
            SELECT 
                id, first_name, last_name, email, phone,
                preferred_date, preferred_time, alternative_date, alternative_time,
                confirmed_date, confirmed_time, status, notes, admin_notes, created_at
            FROM edsa_bookings
            ${whereClause}
            ORDER BY preferred_date ASC, preferred_time ASC
            LIMIT ${limitInt} OFFSET ${offsetInt}
        `, queryParams);

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
router.put('/settings', authenticateAdmin, requirePermission('admin'), settingsValidation, async (req, res) => {
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

// Scrape Products from HM Herbs Website with Progress (SSE)
router.post('/scrape-products', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    // Set up Server-Sent Events for progress updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const sendProgress = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        sendProgress({ stage: 'init', message: 'Starting HM Herbs website scraping...', percentage: 0 });
        console.log('Starting HM Herbs website scraping...');

        // Create scraper with progress callback
        const scraper = new HMHerbsScraper((progress) => {
            sendProgress(progress);
        });

        await scraper.scrapeAllProducts();

        sendProgress({ stage: 'importing', message: 'Importing scraped products into database...', percentage: 90 });

        // Import the scraped products
        const importer = new ProductImporter();
        await importer.importFromCSV('./data/scraped-products.csv');

        sendProgress({
            stage: 'complete',
            message: `Products scraped and imported successfully! Found ${scraper.products.length} products.`,
            percentage: 100,
            productsFound: scraper.products.length
        });

        // Close the SSE connection
        res.end();

    } catch (error) {
        console.error('Scraping error:', error);
        sendProgress({
            stage: 'error',
            message: `Failed to scrape products: ${error.message}`,
            percentage: 0
        });
        res.end();
    }
});

// Upload Product Image
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fs = require('fs');
        const path = require('path');
        const uploadDir = path.join(__dirname, '..', 'uploads', 'products');
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadImage = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
        }
    }
});

router.post('/upload-image', authenticateAdmin, requirePermission('manager'), uploadImage.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Return the URL path to the uploaded image
        const imageUrl = `/uploads/products/${req.file.filename}`;
        res.json({
            success: true,
            imageUrl: imageUrl,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ error: 'Failed to upload image: ' + error.message });
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

// ===== POS GIFT CARD INTEGRATION ENDPOINTS =====

// Get all POS gift cards
router.get('/pos/gift-cards', authenticateAdmin, async (req, res) => {
    try {
        const posGiftCardService = new POSGiftCardService(req.pool);
        const giftCards = await posGiftCardService.getPOSGiftCards(req.query);
        res.json({ giftCards });
    } catch (error) {
        console.error('Get POS gift cards error:', error);
        res.status(500).json({ error: 'Failed to get POS gift cards' });
    }
});

// Sync gift cards from POS system
router.post('/pos/systems/:id/sync-gift-cards', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const posGiftCardService = new POSGiftCardService(req.pool);
        const result = await posGiftCardService.syncGiftCardsFromPOS(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Sync POS gift cards error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get POS gift card by ID
router.get('/pos/gift-cards/:id', authenticateAdmin, async (req, res) => {
    try {
        const posGiftCardService = new POSGiftCardService(req.pool);
        const giftCard = await posGiftCardService.getPOSGiftCardById(req.params.id);
        res.json({ giftCard });
    } catch (error) {
        console.error('Get POS gift card error:', error);
        res.status(404).json({ error: error.message });
    }
});

// Check gift card balance (real-time from POS)
router.get('/pos/gift-cards/:id/balance', authenticateAdmin, async (req, res) => {
    try {
        const posGiftCardService = new POSGiftCardService(req.pool);
        const balance = await posGiftCardService.checkGiftCardBalance(req.params.id);
        res.json({ balance });
    } catch (error) {
        console.error('Check gift card balance error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get POS gift card analytics
router.get('/pos/gift-cards/analytics', authenticateAdmin, async (req, res) => {
    try {
        const posGiftCardService = new POSGiftCardService(req.pool);
        const analytics = await posGiftCardService.getPOSGiftCardAnalytics(req.query.pos_system_id, req.query.days || 30);
        res.json({ analytics });
    } catch (error) {
        console.error('Get POS gift card analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== POS LOYALTY PROGRAM INTEGRATION ENDPOINTS =====

// Get all POS loyalty programs
router.get('/pos/loyalty/programs', authenticateAdmin, async (req, res) => {
    try {
        const posLoyaltyService = new POSLoyaltyService(req.pool);
        const programs = await posLoyaltyService.getPOSLoyaltyPrograms(req.query);
        res.json({ programs });
    } catch (error) {
        console.error('Get POS loyalty programs error:', error);
        res.status(500).json({ error: 'Failed to get POS loyalty programs' });
    }
});

// Sync loyalty programs from POS system
router.post('/pos/systems/:id/sync-loyalty', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const posLoyaltyService = new POSLoyaltyService(req.pool);
        const result = await posLoyaltyService.syncLoyaltyProgramsFromPOS(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Sync POS loyalty programs error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get POS loyalty customers
router.get('/pos/loyalty/customers', authenticateAdmin, async (req, res) => {
    try {
        const posLoyaltyService = new POSLoyaltyService(req.pool);
        const customers = await posLoyaltyService.getPOSLoyaltyCustomers(req.query);
        res.json({ customers });
    } catch (error) {
        console.error('Get POS loyalty customers error:', error);
        res.status(500).json({ error: 'Failed to get POS loyalty customers' });
    }
});

// Get POS loyalty analytics
router.get('/pos/loyalty/analytics', authenticateAdmin, async (req, res) => {
    try {
        const posLoyaltyService = new POSLoyaltyService(req.pool);
        const analytics = await posLoyaltyService.getPOSLoyaltyAnalytics(req.query.pos_system_id, req.query.program_id);
        res.json({ analytics });
    } catch (error) {
        console.error('Get POS loyalty analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== POS DISCOUNT INTEGRATION ENDPOINTS =====

// Get all POS discounts
router.get('/pos/discounts', authenticateAdmin, async (req, res) => {
    try {
        const posDiscountService = new POSDiscountService(req.pool);
        const discounts = await posDiscountService.getPOSDiscounts(req.query);
        res.json({ discounts });
    } catch (error) {
        console.error('Get POS discounts error:', error);
        res.status(500).json({ error: 'Failed to get POS discounts' });
    }
});

// Sync discounts from POS system
router.post('/pos/systems/:id/sync-discounts', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const posDiscountService = new POSDiscountService(req.pool);
        const result = await posDiscountService.syncDiscountsFromPOS(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Sync POS discounts error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get POS discount by ID
router.get('/pos/discounts/:id', authenticateAdmin, async (req, res) => {
    try {
        const posDiscountService = new POSDiscountService(req.pool);
        const discount = await posDiscountService.getPOSDiscountById(req.params.id);
        res.json({ discount });
    } catch (error) {
        console.error('Get POS discount error:', error);
        res.status(404).json({ error: error.message });
    }
});

// Get POS discount usage
router.get('/pos/discounts/usage', authenticateAdmin, async (req, res) => {
    try {
        const posDiscountService = new POSDiscountService(req.pool);
        const usage = await posDiscountService.getPOSDiscountUsage(req.query);
        res.json({ usage });
    } catch (error) {
        console.error('Get POS discount usage error:', error);
        res.status(500).json({ error: 'Failed to get POS discount usage' });
    }
});

// Get POS discount analytics
router.get('/pos/discounts/analytics', authenticateAdmin, async (req, res) => {
    try {
        const posDiscountService = new POSDiscountService(req.pool);
        const analytics = await posDiscountService.getPOSDiscountAnalytics(req.query.pos_system_id, req.query.days || 30);
        res.json({ analytics });
    } catch (error) {
        console.error('Get POS discount analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== EMAIL CAMPAIGN MANAGEMENT ENDPOINTS =====

// Get all email campaigns
router.get('/email-campaigns', authenticateAdmin, async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const campaigns = await emailCampaignService.getCampaigns(req.query);
        res.json({ campaigns });
    } catch (error) {
        console.error('Get email campaigns error:', error);
        res.status(500).json({ error: 'Failed to get email campaigns' });
    }
});

// Create new email campaign
router.post('/email-campaigns', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const campaign = await emailCampaignService.createCampaign(req.body, req.admin.id);
        res.status(201).json({ campaign });
    } catch (error) {
        console.error('Create email campaign error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get email campaign by ID
router.get('/email-campaigns/:id', authenticateAdmin, async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const campaign = await emailCampaignService.getCampaignById(req.params.id);
        res.json({ campaign });
    } catch (error) {
        console.error('Get email campaign error:', error);
        res.status(404).json({ error: error.message });
    }
});

// Update email campaign
router.put('/email-campaigns/:id', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const campaign = await emailCampaignService.updateCampaign(req.params.id, req.body, req.admin.id);
        res.json({ campaign });
    } catch (error) {
        console.error('Update email campaign error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete email campaign
router.delete('/email-campaigns/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const result = await emailCampaignService.deleteCampaign(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Delete email campaign error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get email campaign analytics
router.get('/email-campaigns/:id/analytics', authenticateAdmin, async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const analytics = await emailCampaignService.getCampaignAnalytics(req.params.id, req.query.days || 30);
        res.json({ analytics });
    } catch (error) {
        console.error('Get email campaign analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== EMAIL SUBSCRIBER MANAGEMENT ENDPOINTS =====

// Get all email subscribers
router.get('/email-subscribers', authenticateAdmin, async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const subscribers = await emailCampaignService.getSubscribers(req.query);
        res.json({ subscribers });
    } catch (error) {
        console.error('Get email subscribers error:', error);
        res.status(500).json({ error: 'Failed to get email subscribers' });
    }
});

// Get email subscriber by ID
router.get('/email-subscribers/:id', authenticateAdmin, async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const subscriber = await emailCampaignService.getSubscriberById(req.params.id);
        res.json({ subscriber });
    } catch (error) {
        console.error('Get email subscriber error:', error);
        res.status(404).json({ error: error.message });
    }
});

// Update subscriber status
router.put('/email-subscribers/:id/status', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const subscriber = await emailCampaignService.updateSubscriberStatus(
            req.params.id,
            req.body.status,
            req.body.reason
        );
        res.json({ subscriber });
    } catch (error) {
        console.error('Update subscriber status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mark offer as claimed
router.post('/email-subscribers/:id/claim-offer', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const result = await emailCampaignService.claimOffer(req.params.id, req.body.order_reference);
        res.json(result);
    } catch (error) {
        console.error('Claim offer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export subscribers
router.get('/email-subscribers/export', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const format = req.query.format || 'csv';
        const data = await emailCampaignService.exportSubscribers(format, req.query);

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="subscribers.json"');
        }

        res.send(data);
    } catch (error) {
        console.error('Export subscribers error:', error);
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

// Get POS gift card metrics
router.get('/analytics/pos-gift-cards', authenticateAdmin, async (req, res) => {
    try {
        const analyticsService = new AnalyticsService(req.pool);
        const metrics = await analyticsService.getPOSGiftCardMetrics(req.query.pos_system_id, req.query.days || 30);
        res.json({ metrics });
    } catch (error) {
        console.error('Get POS gift card metrics error:', error);
        res.status(500).json({ error: 'Failed to get POS gift card metrics' });
    }
});

// Get POS loyalty metrics
router.get('/analytics/pos-loyalty', authenticateAdmin, async (req, res) => {
    try {
        const analyticsService = new AnalyticsService(req.pool);
        const metrics = await analyticsService.getPOSLoyaltyMetrics(req.query.pos_system_id, req.query.program_id, req.query.days || 30);
        res.json({ metrics });
    } catch (error) {
        console.error('Get POS loyalty metrics error:', error);
        res.status(500).json({ error: 'Failed to get POS loyalty metrics' });
    }
});

// Get POS discount metrics
router.get('/analytics/pos-discounts', authenticateAdmin, async (req, res) => {
    try {
        const analyticsService = new AnalyticsService(req.pool);
        const metrics = await analyticsService.getPOSDiscountMetrics(req.query.pos_system_id, req.query.days || 30);
        res.json({ metrics });
    } catch (error) {
        console.error('Get POS discount metrics error:', error);
        res.status(500).json({ error: 'Failed to get POS discount metrics' });
    }
});

// Get email marketing overview
router.get('/analytics/email-marketing', authenticateAdmin, async (req, res) => {
    try {
        const emailCampaignService = new EmailCampaignService(req.pool);
        const overview = await emailCampaignService.getEmailMarketingOverview(req.query.days || 30);
        res.json({ overview });
    } catch (error) {
        console.error('Get email marketing overview error:', error);
        res.status(500).json({ error: 'Failed to get email marketing overview' });
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

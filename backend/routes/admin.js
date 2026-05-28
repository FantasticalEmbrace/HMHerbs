// Admin Panel Routes for HM Herbs
// Complete admin interface for managing products, orders, customers, and EDSA bookings

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const {
    sendAdminResolutionEmail,
    sendStaffCancelledCustomerEmail,
    sendStaffRescheduledCustomerEmail
} = require('../services/edsaAppointmentEmail');
const {
    loadBookingRowById,
    deleteBookingCalendarEvent,
    syncBookingCalendarEvent,
    bookingEmailPayload,
    appointmentSnapshot,
    normalizeDateYmd
} = require('../utils/edsaBookingOps');

// Configure multer for brand logo uploads
const brandLogoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'brands');
        // Create directory if it doesn't exist
        fs.mkdir(uploadPath, { recursive: true }).then(() => {
            cb(null, uploadPath);
        }).catch(err => cb(err));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'brand-logo-' + uniqueSuffix + ext);
    }
});

const uploadBrandLogo = multer({
    storage: brandLogoStorage,
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

// Configure multer for product image uploads
const productImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'products');
        // Create directory if it doesn't exist
        fs.mkdir(uploadPath, { recursive: true }).then(() => {
            cb(null, uploadPath);
        }).catch(err => cb(err));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'product-image-' + uniqueSuffix + ext);
    }
});

const uploadProductImage = multer({
    storage: productImageStorage,
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

// Certificate of Analysis (COA) — PDF only
const coaPdfStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'coa');
        fs.mkdir(uploadPath, { recursive: true }).then(() => {
            cb(null, uploadPath);
        }).catch(err => cb(err));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'coa-' + uniqueSuffix + '.pdf');
    }
});

const uploadCoaPdf = multer({
    storage: coaPdfStorage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.pdf') {
            return cb(new Error('Only PDF files are allowed for COA uploads'));
        }
        const okMime = !file.mimetype ||
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/x-pdf' ||
            file.mimetype === 'application/octet-stream';
        if (okMime) {
            return cb(null, true);
        }
        cb(new Error('Invalid file type for COA (expected PDF)'));
    }
});

const promoIconStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'promo-icons');
        fs.mkdir(uploadPath, { recursive: true }).then(() => {
            cb(null, uploadPath);
        }).catch(err => cb(err));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'promo-icon-' + uniqueSuffix + ext);
    }
});

const uploadPromoBannerIcon = multer({
    storage: promoIconStorage,
    limits: { fileSize: 512 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(ext)) {
            return cb(null, true);
        }
        cb(new Error('Only PNG, JPG, GIF, WebP, or SVG images are allowed'));
    }
});

const {
    adminLoginValidation,
    productValidation,
    settingsValidation
} = require('../middleware/validation');
const HMHerbsScraper = require('../scripts/scrape-hmherbs');
const ProductImporter = require('../scripts/import-products');
const ProductCategoryMatcher = require('../scripts/match-products-to-categories');
const InventoryService = require('../services/inventory');
const VendorService = require('../services/vendor');
const POSService = require('../services/pos');
const POSGiftCardService = require('../services/pos-giftcard');
const POSLoyaltyService = require('../services/pos-loyalty');
const POSDiscountService = require('../services/pos-discount');
const EmailCampaignService = require('../services/email-campaign');
const AnalyticsService = require('../services/analytics');
const GoogleBusinessProfileService = require('../services/google-business-profile');
const GoogleCalendarOAuthService = require('../services/google-calendar-oauth');
const googleCalendarService = require('../services/google-calendar');
const { TaxLedgerService, toDateKey } = require('../services/taxLedger');

const GBP_STORE_HOUR_KEYS = new Set([
    'store_holiday_schedule',
    'store_hours_weekdays',
    'store_hours_saturday',
    'store_hours_sunday',
]);

async function loadGoogleBusinessStoreHours(pool) {
    const keys = [...GBP_STORE_HOUR_KEYS];
    const placeholders = keys.map(() => '?').join(', ');
    const [rows] = await pool.execute(
        `SELECT key_name, value FROM settings WHERE key_name IN (${placeholders})`,
        keys
    );
    const map = new Map((rows || []).map((r) => [r.key_name, r.value]));
    const scheduleRaw = map.get('store_holiday_schedule') || '[]';
    let schedule = [];
    try {
        const parsed = JSON.parse(scheduleRaw);
        schedule = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        schedule = [];
    }
    return {
        holidaySchedule: schedule,
        regularHours: {
            weekdays: map.get('store_hours_weekdays') || '',
            saturday: map.get('store_hours_saturday') || '',
            sunday: map.get('store_hours_sunday') || '',
        },
    };
}

async function tryAutoSyncGoogleBusinessHours(req, updatedKeyNames = []) {
    const touchesHours = updatedKeyNames.some((key) => GBP_STORE_HOUR_KEYS.has(key));
    if (!touchesHours) return { skipped: true, reason: 'hours_not_updated' };

    if (!(await GoogleBusinessProfileService.isConfigured(req.pool))) {
        return { skipped: true, reason: 'not_connected' };
    }

    try {
        const { holidaySchedule, regularHours } = await loadGoogleBusinessStoreHours(req.pool);
        const result = await GoogleBusinessProfileService.syncHours(req.pool, req, {
            regularHours,
            holidaySchedule,
        });
        logger.info('[integration][google-business] Auto-sync on settings save', {
            actor: req.admin?.email || 'unknown',
            regularPeriodCount: result.regularPeriodCount || 0,
            specialPeriodCount: result.specialPeriodCount || 0,
        });
        return {
            synced: true,
            location: result.location || null,
            regularPeriodCount: result.regularPeriodCount || 0,
            specialPeriodCount: result.specialPeriodCount || 0,
        };
    } catch (error) {
        logger.error('[integration][google-business] Auto-sync on save failed', {
            error: error.message,
            actor: req.admin?.email || 'unknown',
        });
        return { synced: false, error: error.message || 'Google sync failed' };
    }
}
const { parseRules, promotionHasApplicableMerchOrShipping } = require('../services/webPromotionEngine');

// Rate limiting for admin authentication
// Completely disabled in development mode to allow for testing
const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 5 : 10000, // 5 attempts in production, effectively unlimited in development
    message: {
        error: 'Too many admin authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Completely skip rate limiting in development mode
    skip: () => {
        // In development, skip all rate limiting
        if (process.env.NODE_ENV !== 'production') {
            return true; // Skip rate limiting entirely in development
        }
        return false;
    }
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
router.post('/auth/login', adminAuthLimiter, ...adminLoginValidation, async (req, res) => {
    try {
        // Check if database pool is available
        if (!req.pool) {
            logger.error('Database pool not available in admin login route');
            return res.status(500).json({
                error: 'Database connection not available. Please check server configuration.',
                details: process.env.NODE_ENV === 'development' ? 'Database pool was not attached to request. Check server.js middleware.' : undefined
            });
        }

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
        // Log full error details for debugging
        logger.error('Admin login error:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage,
            stack: error.stack
        });

        // Provide more specific error messages for common issues
        const errorCode = error.code || error.errno;
        const sqlMessage = error.sqlMessage || error.message || '';
        const errorMessage = error.message || '';

        // Check if response has already been sent
        if (res.headersSent) {
            logger.error('Response already sent, cannot send error response');
            return;
        }

        // Database connection/auth errors - check multiple conditions
        if (errorCode === 'ER_ACCESS_DENIED_ERROR' ||
            errorCode === 1045 ||
            errorCode === 'ECONNREFUSED' ||
            error.errno === 1045 ||
            sqlMessage.includes('Access denied') ||
            sqlMessage.includes('using password: NO') ||
            errorMessage.includes('Access denied') ||
            errorMessage.includes('using password: NO')) {
            logger.error('Database connection error - check .env file for DB credentials');
            return res.status(500).json({
                error: 'Database connection failed. Please check server configuration.',
                details: process.env.NODE_ENV === 'development' ? 'Check .env file for DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME. Error: ' + (sqlMessage || errorMessage) : undefined
            });
        }

        // Table doesn't exist error
        if (errorCode === 'ER_NO_SUCH_TABLE' ||
            errorCode === 1146 ||
            error.errno === 1146 ||
            sqlMessage.includes("doesn't exist") ||
            errorMessage.includes("doesn't exist")) {
            logger.error('Database table missing - admin_users table does not exist');
            return res.status(500).json({
                error: 'Database table not found. Please run database migrations.',
                details: process.env.NODE_ENV === 'development' ? 'Run: cd backend && npm run migrate. Error: ' + (sqlMessage || errorMessage) : undefined
            });
        }

        // Database connection refused
        if (errorCode === 'ECONNREFUSED' ||
            sqlMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ECONNREFUSED')) {
            return res.status(500).json({
                error: 'Cannot connect to database server. Please ensure MySQL is running.',
                details: process.env.NODE_ENV === 'development' ? 'Start MySQL service and check DB_HOST in .env file' : undefined
            });
        }

        // Generic database error - check for any MySQL error codes
        if (errorCode && (errorCode.startsWith('ER_') || typeof errorCode === 'number' || error.errno)) {
            return res.status(500).json({
                error: 'Database error occurred.',
                details: process.env.NODE_ENV === 'development' ? `Error: ${sqlMessage || errorMessage || error.toString()}` : undefined
            });
        }

        // Unknown error - return generic message but log details
        return res.status(500).json({
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? `Unexpected error: ${errorMessage || error.toString()}` : undefined
        });
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
        logger.error('Forgot password error:', error);
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
        logger.error('Reset password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Dashboard Statistics
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
    try {
        // Initialize default stats
        const stats = {
            products: {
                total_products: 0,
                active_products: 0,
                featured_products: 0,
                low_stock_products: 0
            },
            orders: {
                total_orders: 0,
                pending_orders: 0,
                processing_orders: 0,
                shipped_orders: 0,
                total_revenue: 0
            },
            users: {
                total_users: 0,
                new_users_30_days: 0
            },
            edsa: {
                total_bookings: 0,
                pending_bookings: 0,
                confirmed_bookings: 0,
                new_bookings_30_days: 0
            },
            recentActivity: {
                orders: [],
                products: [],
                bookings: []
            }
        };

        // Get product statistics - handle gracefully if table doesn't exist
        try {
            const [productStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_products,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_products,
                COUNT(CASE WHEN is_featured = 1 THEN 1 END) as featured_products,
                COUNT(CASE WHEN track_inventory = 1 AND is_active = 1 AND inventory_quantity <= low_stock_threshold THEN 1 END) as low_stock_products
            FROM products
        `);
            if (productStats && productStats[0]) {
                stats.products = productStats[0];
            }
        } catch (productError) {
            logger.warn('Products table error in dashboard stats (may not exist):', productError.message);
        }

        // Get order statistics - handle gracefully if table doesn't exist
        try {
            const [orderStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_orders,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_orders,
                COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
                    COALESCE(SUM(total_amount), 0) as total_revenue
            FROM orders
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);
            if (orderStats && orderStats[0]) {
                stats.orders = orderStats[0];
            }
        } catch (orderError) {
            logger.warn('Orders table error in dashboard stats (may not exist):', orderError.message);
        }

        // Get user statistics - handle gracefully if table doesn't exist
        try {
            const [userStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_users_30_days
            FROM users
        `);
            if (userStats && userStats[0]) {
                stats.users = userStats[0];
            }
        } catch (userError) {
            logger.warn('Users table error in dashboard stats (may not exist):', userError.message);
        }

        // Get EDSA statistics - handle gracefully if table doesn't exist
        try {
            const [edsaStats] = await req.pool.execute(`
            SELECT 
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_bookings_30_days
            FROM edsa_bookings
        `);
            if (edsaStats && edsaStats[0]) {
                stats.edsa = edsaStats[0];
            }
        } catch (edsaError) {
            logger.warn('EDSA bookings table error in dashboard stats (may not exist):', edsaError.message);
        }

        // Get recent activity - handle gracefully if tables don't exist
        try {
            const [recentOrders] = await req.pool.execute(`
                SELECT 
                    id,
                    order_number,
                    customer_name,
                    total_amount,
                    status,
                    created_at
                FROM orders
                ORDER BY created_at DESC
                LIMIT 5
            `);
            stats.recentActivity.orders = recentOrders || [];
        } catch (orderError) {
            logger.warn('Recent orders query error:', orderError.message);
        }

        try {
            const [recentProducts] = await req.pool.execute(`
                SELECT 
                    id,
                    name,
                    sku,
                    created_at
                FROM products
                ORDER BY created_at DESC
                LIMIT 5
            `);
            stats.recentActivity.products = recentProducts || [];
        } catch (productError) {
            logger.warn('Recent products query error:', productError.message);
        }

        try {
            const [recentBookings] = await req.pool.execute(`
                SELECT 
                    id,
                    customer_name,
                    appointment_date,
                    status,
                    created_at
                FROM edsa_bookings
                ORDER BY created_at DESC
                LIMIT 5
            `);
            stats.recentActivity.bookings = recentBookings || [];
        } catch (bookingError) {
            logger.warn('Recent bookings query error:', bookingError.message);
        }

        res.json(stats);
    } catch (error) {
        logger.error('Dashboard stats error:', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState
        });
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Product Management
router.get('/products', authenticateAdmin, async (req, res) => {
    try {
        // First, verify database tables exist
        try {
            await req.pool.execute('SELECT 1 FROM products LIMIT 1');
            await req.pool.execute('SELECT 1 FROM brands LIMIT 1');
            await req.pool.execute('SELECT 1 FROM product_categories LIMIT 1');
        } catch (tableError) {
            if (tableError.code === 'ER_NO_SUCH_TABLE' || tableError.errno === 1146) {
                logger.error('Database tables missing - products, brands, or product_categories table does not exist');
                return res.status(500).json({
                    error: 'Database tables not found. Please run database migrations.',
                    details: process.env.NODE_ENV === 'development' ? 'Run: cd backend && npm run migrate or execute database/schema.sql' : undefined
                });
            }
            throw tableError; // Re-throw if it's a different error
        }

        const { page = 1, limit = 20, search, brand, category, status } = req.query;
        // Ensure page and limit are integers
        const pageInt = parseInt(page, 10) || 1;
        const limitInt = parseInt(limit, 10) || 20;
        const offset = (pageInt - 1) * limitInt;

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

        // Build the base query - use string concatenation to avoid template literal issues
        let query = 'SELECT ' +
            'p.id, p.sku, p.name, p.slug, p.price, p.inventory_quantity, ' +
            'p.low_stock_threshold, p.is_active, p.is_featured, p.created_at, ' +
            'p.brand_id, p.category_id, ' +
            'b.name as brand_name, pc.name as category_name ' +
            'FROM products p ' +
            'LEFT JOIN brands b ON p.brand_id = b.id ' +
            'LEFT JOIN product_categories pc ON p.category_id = pc.id';

        // Add WHERE clause if we have conditions
        if (whereConditions.length > 0) {
            query += ' WHERE ' + whereConditions.join(' AND ');
        }

        // Ensure limit and offset are proper integers
        const limitParam = parseInt(limitInt, 10);
        const offsetParam = parseInt(offset, 10);

        // Validate parameters
        if (isNaN(limitParam) || isNaN(offsetParam) || limitParam < 0 || offsetParam < 0) {
            logger.error('Invalid pagination parameters:', { limitInt, offset, limitParam, offsetParam });
            return res.status(400).json({ error: 'Invalid pagination parameters' });
        }

        // Add ORDER BY, LIMIT, and OFFSET - embed values directly (MySQL2 has issues with LIMIT/OFFSET placeholders)
        // Ensure values are safe integers (already validated above)
        query += ' ORDER BY p.created_at DESC LIMIT ' + String(limitParam) + ' OFFSET ' + String(offsetParam);

        // Use queryParams directly (no LIMIT/OFFSET params needed)
        const finalParams = queryParams;

        // Log query for debugging in development
        if (process.env.NODE_ENV === 'development') {
            const placeholderCount = (query.match(/\?/g) || []).length;
            logger.info('Products query:', {
                query: query.replace(/\s+/g, ' ').trim(),
                params: finalParams,
                paramCount: finalParams.length,
                paramTypes: finalParams.map(p => typeof p),
                placeholderCount: placeholderCount,
                limitParam: limitParam,
                offsetParam: offsetParam,
                whereConditionsCount: whereConditions.length
            });

            // Warn if there's a mismatch
            if (placeholderCount !== finalParams.length) {
                logger.warn('⚠️ Parameter count mismatch!', {
                    placeholders: placeholderCount,
                    params: finalParams.length
                });
            }
        }

        // Use query() instead of execute() since we're embedding LIMIT/OFFSET directly
        // execute() is for prepared statements with placeholders, query() is for direct SQL
        const [products] = await req.pool.query(query, finalParams);

        // Get total count - build count query same way as main query
        let countQuery = 'SELECT COUNT(*) as total ' +
            'FROM products p ' +
            'LEFT JOIN brands b ON p.brand_id = b.id ' +
            'LEFT JOIN product_categories pc ON p.category_id = pc.id';

        // Add WHERE clause if we have conditions (same as main query)
        if (whereConditions.length > 0) {
            countQuery += ' WHERE ' + whereConditions.join(' AND ');
        }

        // For count query, we use the same params (no LIMIT/OFFSET to remove)
        const countParams = finalParams;
        const [countResult] = await req.pool.query(countQuery, countParams);
        const totalProducts = countResult[0].total;

        res.json({
            products,
            pagination: {
                currentPage: pageInt,
                totalPages: Math.ceil(totalProducts / limitInt),
                totalProducts,
                hasNextPage: pageInt < Math.ceil(totalProducts / limitInt),
                hasPrevPage: pageInt > 1
            }
        });
    } catch (error) {
        // Enhanced error logging
        logger.error('Admin products fetch error:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage,
            stack: error.stack
        });

        // Check if response has already been sent
        if (res.headersSent) {
            logger.error('Response already sent, cannot send error response');
            return;
        }

        // Provide more specific error messages
        const errorCode = error.code || error.errno;
        const sqlMessage = error.sqlMessage || error.message || '';

        // SQL parameter mismatch error
        if (errorCode === 'ER_WRONG_ARGUMENTS' || errorCode === 1210 ||
            sqlMessage.includes('Incorrect arguments') ||
            sqlMessage.includes('mysqld_stmt_execute')) {
            return res.status(500).json({
                error: 'Database query error. Please check server logs.',
                details: process.env.NODE_ENV === 'development' ? `SQL parameter mismatch: ${sqlMessage}` : undefined
            });
        }

        // Table doesn't exist error
        if (errorCode === 'ER_NO_SUCH_TABLE' || errorCode === 1146 ||
            sqlMessage.includes("doesn't exist")) {
            return res.status(500).json({
                error: 'Database table not found. Please run database migrations.',
                details: process.env.NODE_ENV === 'development' ? `Missing table: ${sqlMessage}` : undefined
            });
        }

        // Generic database error
        if (errorCode && (errorCode.startsWith('ER_') || typeof errorCode === 'number')) {
            return res.status(500).json({
                error: 'Database error occurred.',
                details: process.env.NODE_ENV === 'development' ? `Error: ${sqlMessage || error.message}` : undefined
            });
        }

        // Unknown error
        res.status(500).json({
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? `Unexpected error: ${error.message}` : undefined
        });
    }
});

// Create Product
router.post('/products', authenticateAdmin, requirePermission('manager'), productValidation, async (req, res) => {
    try {
        const {
            sku, name, short_description, long_description, brand_id, category_id,
            price, compare_price, weight, inventory_quantity, low_stock_threshold,
            is_active, is_featured, is_cannabis, coa_url, coa_updated_at,
            health_categories, images, variants
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

            // Sanitize numeric fields - convert empty strings to null
            const sanitizeNumeric = (value, defaultValue = null) => {
                if (value === '' || value === null || value === undefined) {
                    return defaultValue;
                }
                const numValue = parseFloat(value);
                return isNaN(numValue) ? defaultValue : numValue;
            };

            const sanitizeInteger = (value, defaultValue = null) => {
                if (value === '' || value === null || value === undefined) {
                    return defaultValue;
                }
                const intValue = parseInt(value, 10);
                return isNaN(intValue) ? defaultValue : intValue;
            };

            const coaUrlTrimmed = typeof coa_url === 'string' ? coa_url.trim() : '';
            const coaUrlValue = coaUrlTrimmed ? coaUrlTrimmed.slice(0, 500) : null;
            let coaDateValue = null;
            if (coa_updated_at && String(coa_updated_at).trim()) {
                const d = new Date(String(coa_updated_at));
                coaDateValue = Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
            }
            const isCannabis = Boolean(is_cannabis === true || is_cannabis === 'true' || is_cannabis === 1 || is_cannabis === '1');

            // Insert product
            const [result] = await connection.execute(`
                INSERT INTO products (
                    sku, name, slug, short_description, long_description,
                    brand_id, category_id, price, compare_price, weight,
                    inventory_quantity, low_stock_threshold, is_active, is_featured,
                    is_cannabis, coa_url, coa_updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sku,
                name,
                slug,
                short_description || null,
                long_description || null,
                sanitizeInteger(brand_id),
                sanitizeInteger(category_id),
                sanitizeNumeric(price),
                sanitizeNumeric(compare_price),
                sanitizeNumeric(weight),
                sanitizeInteger(inventory_quantity, 0),
                sanitizeInteger(low_stock_threshold, 10),
                is_active !== false,
                is_featured === true,
                isCannabis,
                coaUrlValue,
                coaDateValue
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
                logger.info('Adding product images', {
                    productId: productId,
                    imageCount: images.length,
                    images: images
                });

                for (let i = 0; i < images.length; i++) {
                    const image = images[i];
                    // Determine if this image should be primary
                    // Use is_primary from the image object, or default to first image
                    const isPrimary = image.is_primary !== undefined
                        ? (image.is_primary === true || image.is_primary === 'true' || image.is_primary === 1)
                        : (i === 0);

                    logger.info('Inserting product image', {
                        productId: productId,
                        imageUrl: image.url,
                        altText: image.alt || '',
                        isPrimary: isPrimary,
                        sortOrder: i
                    });

                    await connection.execute(
                        'INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES (?, ?, ?, ?, ?)',
                        [productId, image.url, image.alt || '', isPrimary, i]
                    );
                }
            } else {
                logger.info('No images to add for product', { productId: productId });
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
        logger.error('Product creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Match products to brands - MUST be before /products/:id route to avoid route conflict
router.post('/products/match-brands', authenticateAdmin, async (req, res) => {
    try {
        // Run the matching process
        const results = {
            matched: 0,
            updated: 0,
            notMatched: 0,
            notMatchedProducts: []
        };

        // Get all brands
        const [brands] = await req.pool.execute(
            'SELECT id, name FROM brands WHERE is_active = 1 ORDER BY name'
        );

        if (brands.length === 0) {
            return res.status(400).json({ error: 'No brands found in database' });
        }

        // Get all products
        const [products] = await req.pool.execute(
            'SELECT id, name, brand_id FROM products ORDER BY name'
        );

        if (products.length === 0) {
            return res.status(400).json({ error: 'No products found in database' });
        }

        // Process each product
        for (const product of products) {
            const productName = (product.name || '').trim();

            if (!productName) {
                results.notMatched++;
                results.notMatchedProducts.push({
                    id: product.id,
                    name: productName,
                    reason: 'Empty product name'
                });
                continue;
            }

            // Try to find matching brand
            let matchedBrand = null;
            let bestMatchLength = 0;

            // Check if product name starts with brand name (case-insensitive)
            for (const brand of brands) {
                const brandName = (brand.name || '').trim();
                if (!brandName) continue;

                if (productName.toLowerCase().startsWith(brandName.toLowerCase())) {
                    // Prefer longer brand names (more specific matches)
                    if (brandName.length > bestMatchLength) {
                        matchedBrand = brand;
                        bestMatchLength = brandName.length;
                    }
                }
            }

            if (matchedBrand) {
                results.matched++;

                // Only update if brand_id is different
                if (product.brand_id !== matchedBrand.id) {
                    await req.pool.execute(
                        'UPDATE products SET brand_id = ?, updated_at = NOW() WHERE id = ?',
                        [matchedBrand.id, product.id]
                    );
                    results.updated++;
                }
            } else {
                results.notMatched++;
                results.notMatchedProducts.push({
                    id: product.id,
                    name: productName,
                    reason: 'No brand name found at start of product name'
                });
            }
        }

        logger.info('Product brand matching completed', {
            total: products.length,
            matched: results.matched,
            updated: results.updated,
            notMatched: results.notMatched
        });

        res.json({
            success: true,
            message: 'Product brand matching completed',
            results: {
                total: products.length,
                matched: results.matched,
                updated: results.updated,
                notMatched: results.notMatched,
                notMatchedProducts: results.notMatchedProducts.slice(0, 50) // Limit to first 50 for response size
            }
        });
    } catch (error) {
        logger.error('Match products to brands error:', error);
        res.status(500).json({
            error: 'Failed to match products to brands',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Match products to categories
router.post('/products/match-categories', authenticateAdmin, async (req, res) => {
    try {
        const matcher = new ProductCategoryMatcher();
        const result = await matcher.matchAndAssignCategories();

        res.json({
            success: true,
            message: 'Product category matching completed',
            results: {
                matched: result.matched,
                updated: result.updated,
                notMatched: result.notMatched,
                categoryAssignments: result.categoryAssignments,
                notMatchedProducts: result.notMatchedProducts.slice(0, 50) // Limit to first 50 for response size
            }
        });
    } catch (error) {
        logger.error('Match products to categories error:', error);
        res.status(500).json({
            error: 'Failed to match products to categories',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Upload product image - MUST be before /products/:id route to avoid route conflict
router.post('/products/upload-image', authenticateAdmin, requirePermission('manager'), uploadProductImage.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Return the URL path to the uploaded file
        const fileUrl = `/uploads/products/${req.file.filename}`;
        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename
        });
    } catch (error) {
        logger.error('Product image upload error:', error);
        res.status(500).json({ error: 'Failed to upload image: ' + error.message });
    }
});

// Upload COA PDF — MUST be before /products/:id
router.post('/products/upload-coa', authenticateAdmin, requirePermission('manager'), (req, res, next) => {
    uploadCoaPdf.single('coa')(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                error: err.message || 'COA upload failed'
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileUrl = `/uploads/coa/${req.file.filename}`;
        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename
        });
    } catch (error) {
        logger.error('COA upload error:', error);
        res.status(500).json({ error: 'Failed to upload COA: ' + error.message });
    }
});

// Get Single Product by ID
router.get('/products/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [products] = await req.pool.execute(`
            SELECT 
                p.id, p.sku, p.name, p.slug, p.short_description, p.long_description,
                p.price, p.compare_price, p.weight, p.inventory_quantity, p.low_stock_threshold,
                p.is_active, p.is_featured, p.is_cannabis, p.coa_url, p.coa_updated_at,
                p.created_at, p.updated_at,
                p.brand_id, p.category_id,
                b.name as brand_name, b.slug as brand_slug,
                pc.name as category_name, pc.slug as category_slug
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            WHERE p.id = ?
        `, [id]);

        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[0];

        // Get product images - handle gracefully if table doesn't exist
        try {
            const [images] = await req.pool.execute(`
                SELECT id, image_url, alt_text, is_primary, sort_order
                FROM product_images
                WHERE product_id = ?
                ORDER BY is_primary DESC, sort_order ASC
            `, [id]);
            product.images = images || [];
        } catch (imageError) {
            logger.warn('Product images table error (may not exist):', imageError.message);
            product.images = [];
        }

        // Get product variants - handle gracefully if table doesn't exist
        try {
            const [variants] = await req.pool.execute(`
                SELECT id, sku, name, price, inventory_quantity, sort_order
                FROM product_variants
                WHERE product_id = ?
                ORDER BY sort_order ASC
            `, [id]);
            product.variants = variants || [];
        } catch (variantError) {
            logger.warn('Product variants table error (may not exist):', variantError.message);
            product.variants = [];
        }

        // Get health categories - handle gracefully if table doesn't exist
        try {
            const [healthCategories] = await req.pool.execute(`
                SELECT hc.id, hc.name, hc.slug
                FROM product_health_categories phc
                JOIN health_categories hc ON phc.health_category_id = hc.id
                WHERE phc.product_id = ?
            `, [id]);
            product.health_categories = healthCategories || [];
        } catch (healthError) {
            logger.warn('Product health categories table error (may not exist):', healthError.message);
            product.health_categories = [];
        }

        res.json(product);
    } catch (error) {
        logger.error('Get product by ID error:', {
            error: error.message,
            stack: error.stack,
            productId: req.params.id,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState
        });
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
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
                'is_active', 'is_featured', 'is_cannabis', 'coa_url', 'coa_updated_at'
            ];

            // Fields that should be numeric (decimal or integer)
            const numericFields = ['price', 'compare_price', 'weight', 'inventory_quantity', 'low_stock_threshold'];
            // Fields that should be integers
            const integerFields = ['brand_id', 'category_id', 'inventory_quantity', 'low_stock_threshold'];
            // Fields that should be booleans
            const booleanFields = ['is_active', 'is_featured', 'is_cannabis'];

            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    let value = updateData[field];

                    // Handle empty strings for numeric fields - convert to NULL
                    if (numericFields.includes(field)) {
                        if (value === '' || value === null || value === undefined) {
                            value = null;
                        } else {
                            // Convert to number, or null if invalid
                            const numValue = parseFloat(value);
                            value = isNaN(numValue) ? null : numValue;
                        }
                    }

                    // Handle integer fields
                    if (integerFields.includes(field) && value !== null) {
                        if (value === '') {
                            value = null;
                        } else {
                            const intValue = parseInt(value, 10);
                            value = isNaN(intValue) ? null : intValue;
                        }
                    }

                    // Handle boolean fields
                    if (booleanFields.includes(field)) {
                        if (value === '' || value === null || value === undefined) {
                            value = false;
                        } else {
                            value = Boolean(value === true || value === 'true' || value === 1 || value === '1');
                        }

                        // Log boolean field updates for debugging
                        if (field === 'is_featured') {
                            logger.info('Updating is_featured field', {
                                productId: id,
                                originalValue: updateData[field],
                                convertedValue: value,
                                valueType: typeof updateData[field]
                            });
                        }
                    }

                    // Handle text fields - convert empty strings to null for optional fields
                    if (['short_description', 'long_description'].includes(field)) {
                        if (value === '') {
                            value = null;
                        }
                    }

                    if (field === 'coa_url') {
                        if (value === '' || value === null || value === undefined) {
                            value = null;
                        } else {
                            value = String(value).trim().slice(0, 500);
                        }
                    }

                    if (field === 'coa_updated_at') {
                        if (value === '' || value === null || value === undefined) {
                            value = null;
                        } else {
                            const d = new Date(String(value));
                            value = Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
                        }
                    }

                    updateFields.push(`${field} = ?`);
                    updateValues.push(value);
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

            // Handle images update
            if (updateData.images !== undefined) {
                logger.info('Updating product images', {
                    productId: id,
                    imageCount: Array.isArray(updateData.images) ? updateData.images.length : 0,
                    images: updateData.images
                });

                // Delete existing images
                await connection.execute(
                    'DELETE FROM product_images WHERE product_id = ?',
                    [id]
                );

                // Insert new images
                if (Array.isArray(updateData.images) && updateData.images.length > 0) {
                    for (let i = 0; i < updateData.images.length; i++) {
                        const image = updateData.images[i];
                        // Determine if this image should be primary
                        // Use is_primary from the image object, or default to first image
                        const isPrimary = image.is_primary !== undefined
                            ? (image.is_primary === true || image.is_primary === 'true' || image.is_primary === 1)
                            : (i === 0);

                        logger.info('Inserting product image', {
                            productId: id,
                            imageUrl: image.url,
                            altText: image.alt || '',
                            isPrimary: isPrimary,
                            sortOrder: i
                        });

                        await connection.execute(
                            'INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES (?, ?, ?, ?, ?)',
                            [id, image.url, image.alt || '', isPrimary, i]
                        );
                    }
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
        logger.error('Product update error:', error);
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
        logger.error('Product deletion error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Brand Management
// Upload brand logo
router.post('/brands/upload-logo', authenticateAdmin, requirePermission('manager'), uploadBrandLogo.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Return the URL path to the uploaded file
        const fileUrl = `/uploads/brands/${req.file.filename}`;
        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename
        });
    } catch (error) {
        logger.error('Brand logo upload error:', error);
        res.status(500).json({ error: 'Failed to upload logo: ' + error.message });
    }
});

router.post(
    '/promo-banner/upload-icon',
    authenticateAdmin,
    requirePermission('manager'),
    uploadPromoBannerIcon.single('icon'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }
            const fileUrl = `/uploads/promo-icons/${req.file.filename}`;
            res.json({
                success: true,
                url: fileUrl,
                filename: req.file.filename
            });
        } catch (error) {
            logger.error('Promo banner icon upload error:', error);
            res.status(500).json({ error: 'Failed to upload icon: ' + error.message });
        }
    }
);

// Get all brands (admin)
router.get('/brands', authenticateAdmin, async (req, res) => {
    try {
        const [brands] = await req.pool.execute(
            'SELECT id, name, slug, description, logo_url, website_url, is_active, created_at FROM brands ORDER BY name'
        );
        res.json(brands);
    } catch (error) {
        logger.error('Admin brands fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single brand
router.get('/brands/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [brands] = await req.pool.execute(
            'SELECT id, name, slug, description, logo_url, website_url, is_active, created_at FROM brands WHERE id = ?',
            [id]
        );

        if (brands.length === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        res.json(brands[0]);
    } catch (error) {
        logger.error('Brand fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create brand
router.post('/brands', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { name, description, logo_url, website_url, is_active = true } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Brand name is required' });
        }

        // Generate slug from name
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        // Check if slug already exists
        const [existing] = await req.pool.execute(
            'SELECT id FROM brands WHERE slug = ?',
            [slug]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Brand with this name already exists' });
        }

        const [result] = await req.pool.execute(
            'INSERT INTO brands (name, slug, description, logo_url, website_url, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            [name, slug, description || null, logo_url || null, website_url || null, is_active]
        );

        const [newBrand] = await req.pool.execute(
            'SELECT id, name, slug, description, logo_url, website_url, is_active, created_at FROM brands WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json(newBrand[0]);
    } catch (error) {
        logger.error('Brand creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update brand
router.put('/brands/:id', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, logo_url, website_url, is_active } = req.body;

        // Check if brand exists
        const [existing] = await req.pool.execute(
            'SELECT id, name, slug FROM brands WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        // If name is being changed, generate new slug and check for conflicts
        let slug = existing[0].slug;
        if (name && name !== existing[0].name) {
            slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

            const [slugCheck] = await req.pool.execute(
                'SELECT id FROM brands WHERE slug = ? AND id != ?',
                [slug, id]
            );

            if (slugCheck.length > 0) {
                return res.status(400).json({ error: 'Brand with this name already exists' });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (slug !== undefined && slug !== existing[0].slug) {
            updates.push('slug = ?');
            values.push(slug);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (logo_url !== undefined) {
            updates.push('logo_url = ?');
            values.push(logo_url);
        }
        if (website_url !== undefined) {
            updates.push('website_url = ?');
            values.push(website_url);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        await req.pool.execute(
            `UPDATE brands SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        const [updatedBrand] = await req.pool.execute(
            'SELECT id, name, slug, description, logo_url, website_url, is_active, created_at FROM brands WHERE id = ?',
            [id]
        );

        res.json(updatedBrand[0]);
    } catch (error) {
        logger.error('Brand update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete brand
router.delete('/brands/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if brand is used by any products
        const [products] = await req.pool.execute(
            'SELECT COUNT(*) as count FROM products WHERE brand_id = ?',
            [id]
        );

        if (products[0].count > 0) {
            return res.status(400).json({
                error: 'Cannot delete brand. It is associated with existing products.',
                productCount: products[0].count
            });
        }

        const [result] = await req.pool.execute(
            'DELETE FROM brands WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        res.json({ message: 'Brand deleted successfully' });
    } catch (error) {
        logger.error('Brand deletion error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Category Management
// Get all categories (admin)
router.get('/categories', authenticateAdmin, async (req, res) => {
    try {
        const [categories] = await req.pool.execute(
            `SELECT id, name, slug, description, image_url, parent_id, sort_order, is_active, created_at 
             FROM product_categories 
             ORDER BY sort_order, name`
        );
        res.json(categories);
    } catch (error) {
        logger.error('Admin categories fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single category
router.get('/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [categories] = await req.pool.execute(
            `SELECT id, name, slug, description, image_url, parent_id, sort_order, is_active, created_at 
             FROM product_categories 
             WHERE id = ?`,
            [id]
        );

        if (categories.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json(categories[0]);
    } catch (error) {
        logger.error('Category fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create category
router.post('/categories', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { name, description, image_url, parent_id, sort_order = 0, is_active = true } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        // Generate slug from name
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        // Check if slug already exists
        const [existing] = await req.pool.execute(
            'SELECT id FROM product_categories WHERE slug = ?',
            [slug]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Category with this name already exists' });
        }

        // Validate parent_id if provided
        if (parent_id) {
            const [parentCheck] = await req.pool.execute(
                'SELECT id FROM product_categories WHERE id = ?',
                [parent_id]
            );
            if (parentCheck.length === 0) {
                return res.status(400).json({ error: 'Invalid parent category' });
            }
        }

        const [result] = await req.pool.execute(
            'INSERT INTO product_categories (name, slug, description, image_url, parent_id, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, slug, description || null, image_url || null, parent_id || null, sort_order, is_active]
        );

        const [newCategory] = await req.pool.execute(
            `SELECT id, name, slug, description, image_url, parent_id, sort_order, is_active, created_at 
             FROM product_categories 
             WHERE id = ?`,
            [result.insertId]
        );

        res.status(201).json(newCategory[0]);
    } catch (error) {
        logger.error('Category creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update category
router.put('/categories/:id', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, image_url, parent_id, sort_order, is_active } = req.body;

        // Check if category exists
        const [existing] = await req.pool.execute(
            'SELECT id, name, slug, parent_id FROM product_categories WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Prevent setting parent to self or creating circular references
        if (parent_id && parseInt(parent_id) === parseInt(id)) {
            return res.status(400).json({ error: 'Category cannot be its own parent' });
        }

        // If name is being changed, generate new slug and check for conflicts
        let slug = existing[0].slug;
        if (name && name !== existing[0].name) {
            slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

            const [slugCheck] = await req.pool.execute(
                'SELECT id FROM product_categories WHERE slug = ? AND id != ?',
                [slug, id]
            );

            if (slugCheck.length > 0) {
                return res.status(400).json({ error: 'Category with this name already exists' });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (slug !== undefined && slug !== existing[0].slug) {
            updates.push('slug = ?');
            values.push(slug);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (image_url !== undefined) {
            updates.push('image_url = ?');
            values.push(image_url);
        }
        if (parent_id !== undefined) {
            updates.push('parent_id = ?');
            values.push(parent_id || null);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            values.push(sort_order);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        await req.pool.execute(
            `UPDATE product_categories SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        const [updatedCategory] = await req.pool.execute(
            `SELECT id, name, slug, description, image_url, parent_id, sort_order, is_active, created_at 
             FROM product_categories 
             WHERE id = ?`,
            [id]
        );

        res.json(updatedCategory[0]);
    } catch (error) {
        logger.error('Category update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete category
router.delete('/categories/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if category is used by any products
        const [products] = await req.pool.execute(
            'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
            [id]
        );

        if (products[0].count > 0) {
            return res.status(400).json({
                error: 'Cannot delete category. It is associated with existing products.',
                productCount: products[0].count
            });
        }

        // Check if category has children
        const [children] = await req.pool.execute(
            'SELECT COUNT(*) as count FROM product_categories WHERE parent_id = ?',
            [id]
        );

        if (children[0].count > 0) {
            return res.status(400).json({
                error: 'Cannot delete category. It has child categories.',
                childCount: children[0].count
            });
        }

        const [result] = await req.pool.execute(
            'DELETE FROM product_categories WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        logger.error('Category deletion error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Order Management
router.get('/orders', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const pageInt = parseInt(page, 10) || 1;
        const limitInt = parseInt(limit, 10) || 20;
        const offset = (pageInt - 1) * limitInt;

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

        // Validate pagination parameters
        const limitParam = parseInt(limitInt, 10);
        const offsetParam = parseInt(offset, 10);

        if (isNaN(limitParam) || isNaN(offsetParam) || limitParam < 0 || offsetParam < 0) {
            logger.error('Invalid pagination parameters:', { limitInt, offset, limitParam, offsetParam });
            return res.status(400).json({ error: 'Invalid pagination parameters' });
        }

        // Embed LIMIT and OFFSET directly into query string (MySQL2 has issues with LIMIT/OFFSET placeholders)
        const query = `
            SELECT 
                o.id, o.order_number, o.email, o.status, o.payment_status,
                o.total_amount, o.created_at, o.shipping_first_name, o.shipping_last_name,
                COUNT(oi.id) as item_count
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ${whereClause}
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        // Use query() instead of execute() since we're embedding LIMIT/OFFSET directly
        const [orders] = await req.pool.query(query, queryParams);

        res.json({ orders });
    } catch (error) {
        logger.error('Admin orders fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Single order with line items (admin detail view)
router.get('/orders/:id', authenticateAdmin, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        if (!Number.isFinite(orderId) || orderId < 1) {
            return res.status(400).json({ error: 'Invalid order id' });
        }

        const [orders] = await req.pool.execute(
            `
            SELECT o.*,
                   u.first_name AS account_first_name,
                   u.last_name AS account_last_name,
                   u.email AS account_email,
                   u.customer_number
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = ?
            LIMIT 1
            `,
            [orderId]
        );

        if (!orders.length) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const [items] = await req.pool.execute(
            `
            SELECT id, product_id, variant_id, product_name, product_sku,
                   variant_name, quantity, price, total, created_at
            FROM order_items
            WHERE order_id = ?
            ORDER BY id ASC
            `,
            [orderId]
        );

        res.json({ order: orders[0], items });
    } catch (error) {
        logger.error('Admin order detail fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update order status / tracking (admin)
router.patch('/orders/:id', authenticateAdmin, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        if (!Number.isFinite(orderId) || orderId < 1) {
            return res.status(400).json({ error: 'Invalid order id' });
        }

        const [existing] = await req.pool.execute('SELECT id, status FROM orders WHERE id = ? LIMIT 1', [orderId]);
        if (!existing.length) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const allowedStatus = new Set(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']);
        const allowedPayment = new Set(['pending', 'paid', 'failed', 'refunded']);
        const allowedFulfillment = new Set(['unfulfilled', 'partial', 'fulfilled']);

        const updates = [];
        const params = [];
        const body = req.body || {};

        if (body.status !== undefined) {
            const status = String(body.status).toLowerCase();
            if (!allowedStatus.has(status)) {
                return res.status(400).json({ error: 'Invalid order status' });
            }
            updates.push('status = ?');
            params.push(status);
            if (status === 'shipped') {
                updates.push('shipped_at = COALESCE(shipped_at, NOW())');
            }
            if (status === 'delivered') {
                updates.push('delivered_at = COALESCE(delivered_at, NOW())');
            }
        }

        if (body.payment_status !== undefined) {
            const paymentStatus = String(body.payment_status).toLowerCase();
            if (!allowedPayment.has(paymentStatus)) {
                return res.status(400).json({ error: 'Invalid payment status' });
            }
            updates.push('payment_status = ?');
            params.push(paymentStatus);
        }

        if (body.fulfillment_status !== undefined) {
            const fulfillmentStatus = String(body.fulfillment_status).toLowerCase();
            if (!allowedFulfillment.has(fulfillmentStatus)) {
                return res.status(400).json({ error: 'Invalid fulfillment status' });
            }
            updates.push('fulfillment_status = ?');
            params.push(fulfillmentStatus);
        }

        if (body.tracking_number !== undefined) {
            updates.push('tracking_number = ?');
            params.push(body.tracking_number ? String(body.tracking_number).trim() : null);
        }

        if (body.tracking_url !== undefined) {
            updates.push('tracking_url = ?');
            params.push(body.tracking_url ? String(body.tracking_url).trim() : null);
        }

        if (body.notes !== undefined) {
            updates.push('notes = ?');
            params.push(body.notes ? String(body.notes) : null);
        }

        if (!updates.length) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        params.push(orderId);
        await req.pool.execute(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params);

        const [orders] = await req.pool.execute(
            `
            SELECT o.*,
                   u.first_name AS account_first_name,
                   u.last_name AS account_last_name,
                   u.email AS account_email,
                   u.customer_number
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = ?
            LIMIT 1
            `,
            [orderId]
        );

        const [items] = await req.pool.execute(
            `
            SELECT id, product_id, variant_id, product_name, product_sku,
                   variant_name, quantity, price, total, created_at
            FROM order_items
            WHERE order_id = ?
            ORDER BY id ASC
            `,
            [orderId]
        );

        res.json({ order: orders[0], items, message: 'Order updated' });
    } catch (error) {
        logger.error('Admin order update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// EDSA Booking Management
router.get('/edsa/bookings', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, date, from, to } = req.query;
        const pageInt = parseInt(page, 10) || 1;
        const limitInt = parseInt(limit, 10) || 20;
        const offset = (pageInt - 1) * limitInt;

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
        if (from) {
            const fromYmd = normalizeDateYmd(from) || from;
            whereConditions.push('preferred_date >= ?');
            queryParams.push(fromYmd);
        }
        if (to) {
            const toYmd = normalizeDateYmd(to) || to;
            whereConditions.push('preferred_date <= ?');
            queryParams.push(toYmd);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Validate pagination parameters
        const limitParam = parseInt(limitInt, 10);
        const offsetParam = parseInt(offset, 10);

        if (isNaN(limitParam) || isNaN(offsetParam) || limitParam < 0 || offsetParam < 0) {
            logger.error('Invalid pagination parameters:', { limitInt, offset, limitParam, offsetParam });
            return res.status(400).json({ error: 'Invalid pagination parameters' });
        }

        // Embed LIMIT and OFFSET directly into query string (MySQL2 has issues with LIMIT/OFFSET placeholders)
        const query = `
            SELECT 
                id, first_name, last_name, email, phone,
                preferred_date, preferred_time, alternative_date, alternative_time,
                confirmed_date, confirmed_time, status, notes, admin_notes, created_at,
                customer_request_type, customer_request_notes,
                requested_date, requested_time, customer_request_at
            FROM edsa_bookings
            ${whereClause}
            ORDER BY preferred_date ASC, preferred_time ASC
            LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        // Use query() instead of execute() since we're embedding LIMIT/OFFSET directly
        const [bookings] = await req.pool.query(query, queryParams);

        res.json({ bookings });
    } catch (error) {
        logger.error('Admin EDSA bookings fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update EDSA booking (staff) — syncs calendar and emails customer when changed
router.put('/edsa/bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        const bookingId = Number(req.params.id);
        if (!Number.isFinite(bookingId) || bookingId < 1) {
            return res.status(400).json({ error: 'Invalid booking id' });
        }

        const before = await loadBookingRowById(req.pool, bookingId);
        if (!before) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const {
            status,
            preferred_date,
            preferred_time,
            confirmed_date,
            confirmed_time,
            admin_notes,
            notify_customer: notifyCustomer = true
        } = req.body;

        const nextStatus = status != null ? String(status) : before.status;
        const nextDate =
            preferred_date != null
                ? normalizeDateYmd(preferred_date) || preferred_date
                : normalizeDateYmd(before.preferred_date);
        const nextTime =
            preferred_time != null
                ? String(preferred_time).slice(0, 5)
                : String(before.preferred_time || '').slice(0, 5);

        const beforeSnap = appointmentSnapshot(before);
        const wasCancelled = String(before.status).toLowerCase() === 'cancelled';
        const nowCancelled = String(nextStatus).toLowerCase() === 'cancelled';
        const timeChanged = beforeSnap.date !== nextDate || beforeSnap.time !== nextTime;
        const statusChanged = String(before.status) !== String(nextStatus);

        const clearCalendarOnCancel = nowCancelled && !wasCancelled;

        await req.pool.execute(
            `UPDATE edsa_bookings
                SET status = ?,
                    preferred_date = ?,
                    preferred_time = ?,
                    confirmed_date = ?,
                    confirmed_time = ?,
                    admin_notes = ?,
                    google_calendar_event_id = CASE WHEN ? THEN NULL ELSE google_calendar_event_id END,
                    customer_request_type = 'none',
                    customer_request_notes = NULL,
                    requested_date = NULL,
                    requested_time = NULL,
                    customer_request_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [
                nextStatus,
                nextDate,
                nextTime,
                confirmed_date != null
                    ? normalizeDateYmd(confirmed_date) || confirmed_date
                    : nextStatus === 'confirmed'
                      ? nextDate
                      : before.confirmed_date,
                confirmed_time != null
                    ? String(confirmed_time).slice(0, 5)
                    : nextStatus === 'confirmed'
                      ? nextTime
                      : before.confirmed_time,
                admin_notes != null ? admin_notes : before.admin_notes,
                clearCalendarOnCancel ? 1 : 0,
                bookingId
            ]
        );

        const after = await loadBookingRowById(req.pool, bookingId);
        const emailPayload = bookingEmailPayload(after || before);

        if (nowCancelled) {
            if (before.google_calendar_event_id) {
                await deleteBookingCalendarEvent(req.pool, before.google_calendar_event_id);
            }
            if (notifyCustomer && !wasCancelled) {
                void sendStaffCancelledCustomerEmail(emailPayload);
            }
        } else {
            await syncBookingCalendarEvent(req.pool, after);
            if (notifyCustomer && timeChanged) {
                void sendStaffRescheduledCustomerEmail(
                    emailPayload,
                    beforeSnap.date,
                    beforeSnap.time
                );
            } else if (
                notifyCustomer &&
                statusChanged &&
                String(nextStatus).toLowerCase() === 'confirmed' &&
                !timeChanged
            ) {
                void sendAdminResolutionEmail({
                    ...emailPayload,
                    status: nextStatus,
                    confirmedDate: after?.confirmed_date,
                    confirmedTime: after?.confirmed_time
                });
            }
        }

        res.json({
            message: 'Booking updated successfully',
            booking: after,
            customerNotified: Boolean(notifyCustomer)
        });
    } catch (error) {
        logger.error('EDSA booking update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// OAuth refresh tokens — redacted from GET /settings
const SETTINGS_REDACT_KEYS = new Set(['gbp_refresh_token', 'gcal_refresh_token']);

// Get System Settings
router.get('/settings', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const [settings] = await req.pool.execute(
            'SELECT key_name, value, description, type FROM settings ORDER BY key_name'
        );

        const safe = (settings || []).map((row) => {
            if (!SETTINGS_REDACT_KEYS.has(row.key_name)) return row;
            return {
                ...row,
                value: row.value ? '[stored securely]' : '',
            };
        });

        res.json({ settings: safe });
    } catch (error) {
        logger.error('Settings fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update System Settings
router.put('/settings', authenticateAdmin, requirePermission('admin'), settingsValidation, async (req, res) => {
    try {
        const { settings } = req.body;
        const updatedKeyNames = (settings || []).map((s) => s.key_name).filter(Boolean);

        const connection = await req.pool.getConnection();

        try {
            await connection.beginTransaction();

            for (const setting of settings) {
                const keyName = setting.key_name;
                if (SETTINGS_REDACT_KEYS.has(keyName)) continue;
                const value = setting.value ?? '';
                const description = setting.description || keyName;
                const type = setting.type || 'string';
                await connection.execute(
                    `INSERT INTO settings (key_name, value, description, type)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        value = VALUES(value),
                        updated_at = CURRENT_TIMESTAMP`,
                    [keyName, value, description, type]
                );
            }

            await connection.commit();

            const googleBusinessSync = await tryAutoSyncGoogleBusinessHours(req, updatedKeyNames);

            res.json({
                message: 'Settings updated successfully',
                googleBusinessSync,
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        logger.error('Settings update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Integration logs (Octopos/Mailchimp/newsletter sync visibility)
router.get('/integration-logs', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const limitRaw = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;
        const logFiles = [
            path.join(__dirname, '..', 'logs', 'combined.log'),
            path.join(__dirname, '..', 'logs', 'error.log'),
        ];

        const entries = [];
        for (const filePath of logFiles) {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const lines = content.split('\n').filter(Boolean);
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        const message = String(parsed.message || '');
                        const combined = `${message} ${JSON.stringify(parsed)}`.toLowerCase();
                        if (!/(octopos|mailchimp|newsletter|sync|integration)/i.test(combined)) continue;
                        entries.push({
                            timestamp: parsed.timestamp || null,
                            level: parsed.level || 'info',
                            message,
                        });
                    } catch (_) {
                        // Ignore malformed lines.
                    }
                }
            } catch (_) {
                // Missing log files are fine in fresh/local setups.
            }
        }

        entries.sort((a, b) => {
            const at = new Date(a.timestamp || 0).getTime();
            const bt = new Date(b.timestamp || 0).getTime();
            return bt - at;
        });

        res.json({ logs: entries.slice(0, limit) });
    } catch (error) {
        logger.error('Integration logs fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch integration logs' });
    }
});

router.delete('/integration-logs', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const logFiles = [
            path.join(__dirname, '..', 'logs', 'combined.log'),
            path.join(__dirname, '..', 'logs', 'error.log'),
        ];
        let cleared = 0;

        for (const filePath of logFiles) {
            try {
                await fs.writeFile(filePath, '', 'utf8');
                cleared += 1;
            } catch (_) {
                // Ignore missing files.
            }
        }

        res.json({ message: 'Integration logs cleared', clearedFiles: cleared });
    } catch (error) {
        logger.error('Integration logs clear error:', error);
        res.status(500).json({ error: 'Failed to clear integration logs' });
    }
});

router.get('/settings/google-business/status', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const status = await GoogleBusinessProfileService.getConnectionStatus(req.pool);
        res.json(status);
    } catch (error) {
        logger.error('[integration][google-business] Status error:', error);
        res.status(500).json({ error: error.message || 'Failed to load Google Business status' });
    }
});

router.get('/settings/google-business/connect', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { authUrl, redirectUri } = GoogleBusinessProfileService.getAuthorizationUrl(req, req.admin.id);
        res.json({ authUrl, redirectUri });
    } catch (error) {
        logger.error('[integration][google-business] Connect URL error:', error);
        res.status(500).json({ error: error.message || 'Failed to start Google connection' });
    }
});

router.get('/settings/google-business/callback', async (req, res) => {
    const adminAppBase = GoogleBusinessProfileService.getAdminAppUrl(req);
    const failRedirect = (message) => {
        const url = `${adminAppBase}?gbp=error&msg=${encodeURIComponent(message)}#settings`;
        return res.redirect(url);
    };

    try {
        const { code, state, error: oauthError } = req.query;
        if (oauthError) {
            return failRedirect(String(oauthError));
        }
        if (!code || !state) {
            return failRedirect('Missing authorization code from Google');
        }

        GoogleBusinessProfileService.verifyOAuthState(state);
        await GoogleBusinessProfileService.exchangeCodeAndStore(req.pool, code, req);

        try {
            const locations = await GoogleBusinessProfileService.listLocations(req.pool, req);
            if (locations.length === 1) {
                await GoogleBusinessProfileService.saveLocationName(req.pool, locations[0].name);
            }
        } catch (listErr) {
            logger.warn('[integration][google-business] Connected but could not list locations', {
                error: listErr.message,
            });
        }

        return res.redirect(`${adminAppBase}?gbp=connected#settings`);
    } catch (error) {
        logger.error('[integration][google-business] OAuth callback error:', error);
        return failRedirect(error.message || 'Google connection failed');
    }
});

router.post('/settings/google-business/disconnect', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        await GoogleBusinessProfileService.disconnect(req.pool);
        logger.info('[integration][google-business] Disconnected', {
            actor: req.admin?.email || 'unknown',
        });
        res.json({ message: 'Google Business Profile disconnected' });
    } catch (error) {
        logger.error('[integration][google-business] Disconnect error:', error);
        res.status(500).json({ error: error.message || 'Failed to disconnect Google Business Profile' });
    }
});

router.put('/settings/google-business/location', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const locationName = await GoogleBusinessProfileService.saveLocationName(
            req.pool,
            req.body?.locationName || req.body?.location
        );
        res.json({ message: 'Location saved', locationName });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Invalid location' });
    }
});

router.get('/settings/google-business/locations', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const locations = await GoogleBusinessProfileService.listLocations(req.pool, req);
        res.json({ locations });
    } catch (error) {
        logger.error('[integration][google-business] List locations error:', error);
        res.status(500).json({ error: error.message || 'Failed to list Google locations' });
    }
});

router.post('/settings/google-business/sync-hours', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { holidaySchedule, regularHours } = await loadGoogleBusinessStoreHours(req.pool);
        const result = await GoogleBusinessProfileService.syncHours(req.pool, req, {
            regularHours,
            holidaySchedule,
        });
        logger.info('[integration][google-business] Manual sync triggered', {
            actor: req.admin?.email || 'unknown',
            regularPeriodCount: result.regularPeriodCount || 0,
            specialPeriodCount: result.specialPeriodCount || 0,
        });
        res.json({
            message: 'Google Business Profile hours synced successfully',
            syncedRegularPeriods: result.regularPeriodCount || 0,
            syncedSpecialPeriods: result.specialPeriodCount || 0,
            syncedPeriods: result.specialPeriodCount || 0,
            location: result.location || null,
        });
    } catch (error) {
        logger.error('[integration][google-business] Hours sync failed', {
            error: error.message,
            actor: req.admin?.email || 'unknown',
        });
        res.status(500).json({ error: error.message || 'Failed to sync Google Business Profile hours' });
    }
});

router.get('/settings/google-calendar/status', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const status = await GoogleCalendarOAuthService.getConnectionStatus(req.pool);
        res.json(status);
    } catch (error) {
        logger.error('[integration][google-calendar] Status error:', error);
        res.status(500).json({ error: error.message || 'Failed to load Google Calendar status' });
    }
});

router.get('/settings/google-calendar/connect', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const { authUrl, redirectUri } = GoogleCalendarOAuthService.getAuthorizationUrl(req, req.admin.id);
        res.json({ authUrl, redirectUri });
    } catch (error) {
        logger.error('[integration][google-calendar] Connect URL error:', error);
        res.status(500).json({ error: error.message || 'Failed to start Google Calendar connection' });
    }
});

router.get('/settings/google-calendar/callback', async (req, res) => {
    const adminAppBase = GoogleCalendarOAuthService.getAdminAppUrl(req);
    const failRedirect = (message) => {
        const url = `${adminAppBase}?gcal=error&msg=${encodeURIComponent(message)}#settings`;
        return res.redirect(url);
    };

    try {
        const { code, state, error: oauthError } = req.query;
        if (oauthError) {
            return failRedirect(String(oauthError));
        }
        if (!code || !state) {
            return failRedirect('Missing authorization code from Google');
        }

        GoogleCalendarOAuthService.verifyOAuthState(state);
        await GoogleCalendarOAuthService.exchangeCodeAndStore(req.pool, code, req);

        googleCalendarService.resetClient();

        return res.redirect(`${adminAppBase}?gcal=connected#settings`);
    } catch (error) {
        logger.error('[integration][google-calendar] OAuth callback error:', error);
        return failRedirect(error.message || 'Google Calendar connection failed');
    }
});

router.post('/settings/google-calendar/disconnect', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        await GoogleCalendarOAuthService.disconnect(req.pool);
        googleCalendarService.resetClient();
        logger.info('[integration][google-calendar] Disconnected', {
            actor: req.admin?.email || 'unknown',
        });
        res.json({ message: 'Google Calendar disconnected' });
    } catch (error) {
        logger.error('[integration][google-calendar] Disconnect error:', error);
        res.status(500).json({ error: error.message || 'Failed to disconnect Google Calendar' });
    }
});

router.put('/settings/google-calendar/calendar', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const calendarId = await GoogleCalendarOAuthService.saveCalendarId(
            req.pool,
            req.body?.calendarId || req.body?.calendar
        );
        googleCalendarService.resetClient();
        res.json({ message: 'Calendar saved', calendarId });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Invalid calendar' });
    }
});

router.get('/settings/google-calendar/calendars', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const calendars = await GoogleCalendarOAuthService.listCalendars(req.pool, req);
        res.json({ calendars });
    } catch (error) {
        logger.error('[integration][google-calendar] List calendars error:', error);
        res.status(500).json({ error: error.message || 'Failed to list Google calendars' });
    }
});

// Scrape Products from HM Herbs Website
router.post('/scrape-products', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    // Check if client wants SSE (Server-Sent Events) for progress updates
    const useSSE = (req.headers.accept && req.headers.accept.includes('text/event-stream')) || req.query.progress === 'true';

    if (useSSE) {
        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

        // Disable request timeout for scraping
        req.setTimeout(0);
        res.setTimeout(0);

        // Send initial connection message
        res.write(': connected\n\n');
        if (res.flush) res.flush();

        // Track scraper instance
        let scraper = null;
        let scraperStarted = false; // Track if scraper has actually started scraping

        // Progress callback function
        const sendProgress = (progress) => {
            // Set scraperStarted to true if we've moved past initialization
            if (progress.stage !== 'initializing' && !scraperStarted) {
                scraperStarted = true;
            }

            try {
                // Ensure progress object has all required fields
                const progressData = {
                    ...progress,
                    type: progress.type || 'progress',
                    percentage: progress.percentage !== undefined ? progress.percentage : (progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0),
                    message: progress.message || '',
                    productsFound: progress.productsFound !== undefined ? progress.productsFound : 0
                };

                const data = `data: ${JSON.stringify(progressData)}\n\n`;
                res.write(data);
                // Force flush to ensure data is sent immediately
                if (res.flush) {
                    res.flush();
                }
                console.log('Sent progress:', progressData.percentage + '%', progressData.message);
            } catch (error) {
                // Just log error sending progress, but don't stop the scraper
                logger.error('Error sending progress (scraper will continue):', error);
            }
        };

        try {
            console.log('Starting HM Herbs website scraping...');

            // Send initial progress immediately
            sendProgress({
                type: 'progress',
                stage: 'initializing',
                current: 1,
                total: 100,
                percentage: 1,
                message: 'Initializing scraping process...',
                productsFound: 0
            });

            scraper = new HMHerbsScraper(sendProgress);

            // Run scraping in background
            // The sendProgress callback will mark scraperStarted = true when actual scraping begins
            scraper.scrapeAllProducts()
                .then(async () => {
                    // Import the scraped products
                    sendProgress({
                        stage: 'importing',
                        current: 0,
                        total: 1,
                        percentage: 0,
                        message: 'Importing products into database...',
                        productsFound: scraper.products.length
                    });

                    const importer = new ProductImporter();
                    await importer.importFromCSV('./data/scraped-products.csv');

                    const report = scraper.getReport();

                    sendProgress({
                        stage: 'complete',
                        current: 1,
                        total: 1,
                        percentage: 100,
                        message: `Scraping complete! Found ${scraper.products.length} products`,
                        productsFound: scraper.products.length
                    });

                    res.write(`data: ${JSON.stringify({ type: 'complete', productsFound: scraper.products.length, report: report })}\n\n`);
                    res.end();
                })
                .catch((error) => {
                    logger.error('Scraping error:', error);

                    // Check if response is still writable (client might have disconnected)
                    if (!res.destroyed && !res.closed && !res.writableEnded) {
                        try {
                            res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
                            res.end();
                        } catch (writeError) {
                            // Response already closed, ignore
                            logger.debug('Could not write error to response:', writeError.message);
                        }
                    }
                });

        } catch (error) {
            logger.error('Scraping setup error:', error);
            // Check if response is still writable (client might have disconnected)
            if (!res.destroyed && !res.closed && !res.writableEnded) {
                try {
                    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
                    res.end();
                } catch (writeError) {
                    // Response already closed, ignore
                    logger.debug('Could not write setup error to response:', writeError.message);
                }
            }
        }
    } else {
        // Original synchronous endpoint (for backwards compatibility)
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
            logger.error('Scraping error:', error);
            res.status(500).json({ error: 'Failed to scrape products: ' + error.message });
        }
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
        logger.error('Import error:', error);
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
        logger.error('Get inventory history error:', error);
        res.status(500).json({ error: 'Failed to get inventory history' });
    }
});

// Get low stock products
router.get('/inventory/low-stock', authenticateAdmin, async (req, res) => {
    try {
        const raw = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(raw) ? raw : 20;

        const inventoryService = new InventoryService(req.pool);
        const lowStockProducts = await inventoryService.getLowStockProducts(limit);

        res.json(lowStockProducts);
    } catch (error) {
        logger.error('Get low stock products error:', error);
        const body = { error: 'Failed to get low stock products' };
        if (process.env.NODE_ENV !== 'production') {
            body.details = error.message;
            body.code = error.code;
        }
        res.status(500).json(body);
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
        logger.error('Inventory adjustment error:', error);
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
        logger.error('Get current inventory error:', error);
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
        logger.error('Bulk inventory update error:', error);
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
        logger.error('Get inventory stats error:', error);
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
        logger.error('Get vendors error:', error);
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
        logger.error('Create vendor error:', error);
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
        logger.error('Get vendor error:', error);
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
        logger.error('Update vendor error:', error);
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
        logger.error('Delete vendor error:', error);
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
        logger.error('Import catalog error:', error);
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
        logger.error('Get vendor analytics error:', error);
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
        logger.error('Get import history error:', error);
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
        logger.error('Get POS systems error:', error);
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
        logger.error('Create POS system error:', error);
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
        logger.error('Get POS system error:', error);
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
        logger.error('Update POS system error:', error);
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
        logger.error('Test POS connection error:', error);
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
        logger.error('Sync inventory to POS error:', error);
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
        logger.error('Sync inventory from POS error:', error);
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
        logger.error('POS webhook error:', error);
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
        logger.error('Get POS gift cards error:', error);
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
        logger.error('Sync POS gift cards error:', error);
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
        logger.error('Get POS gift card error:', error);
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
        logger.error('Check gift card balance error:', error);
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
        logger.error('Get POS gift card analytics error:', error);
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
        logger.error('Get POS loyalty programs error:', error);
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
        logger.error('Sync POS loyalty programs error:', error);
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
        logger.error('Get POS loyalty customers error:', error);
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
        logger.error('Get POS loyalty analytics error:', error);
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
        logger.error('Get POS discounts error:', error);
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
        logger.error('Sync POS discounts error:', error);
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
        logger.error('Get POS discount error:', error);
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
        logger.error('Get POS discount usage error:', error);
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
        logger.error('Get POS discount analytics error:', error);
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
        logger.error('Get email campaigns error:', error);
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
        logger.error('Create email campaign error:', error);
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
        logger.error('Get email campaign error:', error);
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
        logger.error('Update email campaign error:', error);
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
        logger.error('Delete email campaign error:', error);
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
        logger.error('Get email campaign analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Marketing hub: GET/PUT /api/admin/marketing-settings registered in server.js (main app) for reliable matching.

// Checkout promotion codes (rules JSON evaluated server-side at checkout)
router.get('/promotions', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const [rows] = await req.pool.execute(`
            SELECT id, code, description, is_active, starts_at, ends_at,
                   usage_limit_total, usage_limit_per_email, rules, created_at, updated_at
              FROM web_promotions
             ORDER BY id DESC`);
        res.json({ promotions: rows });
    } catch (error) {
        logger.error('List promotions error:', error);
        res.status(500).json({ error: 'Failed to load promotions' });
    }
});

router.get('/promotions/:id', authenticateAdmin, requirePermission('admin'), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid promotion id' });
        }
        const [rows] = await req.pool.execute(
            `SELECT id, code, description, is_active, starts_at, ends_at,
                    usage_limit_total, usage_limit_per_email, rules, created_at, updated_at
               FROM web_promotions WHERE id = ? LIMIT 1`,
            [id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Promotion not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        logger.error('Get promotion error:', error);
        res.status(500).json({ error: 'Failed to load promotion' });
    }
});

router.post('/promotions', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const body = req.body || {};
        const codeRaw = String(body.code || '').trim();
        if (!codeRaw) {
            return res.status(400).json({ error: 'Promotion code is required' });
        }
        let rules = body.rules;
        if (typeof rules === 'string') {
            try {
                rules = JSON.parse(rules);
            } catch {
                return res.status(400).json({ error: 'rules must be valid JSON' });
            }
        }
        if (!rules || typeof rules !== 'object') {
            return res.status(400).json({ error: 'rules object is required' });
        }
        const validated = parseRules(rules);
        if (!validated.effects || validated.effects.length === 0) {
            return res.status(400).json({
                error: 'Add at least one effect (percent, fixed amount, buy/get, or free shipping).'
            });
        }

        const code = codeRaw.toUpperCase();
        const description = String(body.description || '').trim().slice(0, 500);
        const is_active = body.is_active === false || body.is_active === 0 ? 0 : 1;
        const starts_at =
            body.starts_at && String(body.starts_at).trim() ? String(body.starts_at).trim() : null;
        const ends_at = body.ends_at && String(body.ends_at).trim() ? String(body.ends_at).trim() : null;
        const usage_limit_total =
            body.usage_limit_total === '' || body.usage_limit_total == null
                ? null
                : Number(body.usage_limit_total);
        const usage_limit_per_email =
            body.usage_limit_per_email === '' || body.usage_limit_per_email == null
                ? null
                : Number(body.usage_limit_per_email);

        const [ins] = await req.pool.execute(
            `INSERT INTO web_promotions (
                code, description, is_active, starts_at, ends_at,
                usage_limit_total, usage_limit_per_email, rules
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                code,
                description,
                is_active,
                starts_at,
                ends_at,
                Number.isFinite(usage_limit_total) ? usage_limit_total : null,
                Number.isFinite(usage_limit_per_email) ? usage_limit_per_email : null,
                validated
            ]
        );
        res.status(201).json({ id: ins.insertId, code });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'A promotion with this code already exists' });
        }
        logger.error('Create promotion error:', error);
        res.status(500).json({ error: 'Failed to create promotion' });
    }
});

router.put('/promotions/:id', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid promotion id' });
        }
        const body = req.body || {};
        const codeRaw = String(body.code || '').trim();
        if (!codeRaw) {
            return res.status(400).json({ error: 'Promotion code is required' });
        }
        let rules = body.rules;
        if (typeof rules === 'string') {
            try {
                rules = JSON.parse(rules);
            } catch {
                return res.status(400).json({ error: 'rules must be valid JSON' });
            }
        }
        if (!rules || typeof rules !== 'object') {
            return res.status(400).json({ error: 'rules object is required' });
        }
        const validated = parseRules(rules);
        if (!promotionHasApplicableMerchOrShipping(validated)) {
            return res.status(400).json({
                error: 'Add a discount: trigger→reward SKUs (product mode), cart percent/fixed/buy‑get + free shipping, or free shipping only.'
            });
        }

        const code = codeRaw.toUpperCase();
        const description = String(body.description || '').trim().slice(0, 500);
        const is_active = body.is_active === false || body.is_active === 0 ? 0 : 1;
        const starts_at =
            body.starts_at && String(body.starts_at).trim() ? String(body.starts_at).trim() : null;
        const ends_at = body.ends_at && String(body.ends_at).trim() ? String(body.ends_at).trim() : null;
        const usage_limit_total =
            body.usage_limit_total === '' || body.usage_limit_total == null
                ? null
                : Number(body.usage_limit_total);
        const usage_limit_per_email =
            body.usage_limit_per_email === '' || body.usage_limit_per_email == null
                ? null
                : Number(body.usage_limit_per_email);

        const [r] = await req.pool.execute(
            `UPDATE web_promotions SET
                code = ?, description = ?, is_active = ?, starts_at = ?, ends_at = ?,
                usage_limit_total = ?, usage_limit_per_email = ?, rules = ?
             WHERE id = ?`,
            [
                code,
                description,
                is_active,
                starts_at,
                ends_at,
                Number.isFinite(usage_limit_total) ? usage_limit_total : null,
                Number.isFinite(usage_limit_per_email) ? usage_limit_per_email : null,
                JSON.stringify(validated),
                id
            ]
        );
        if (r.affectedRows === 0) {
            return res.status(404).json({ error: 'Promotion not found' });
        }
        res.json({ success: true, id });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'A promotion with this code already exists' });
        }
        logger.error('Update promotion error:', error);
        res.status(500).json({ error: 'Failed to update promotion' });
    }
});

router.delete('/promotions/:id', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid promotion id' });
        }
        const [r] = await req.pool.execute('DELETE FROM web_promotions WHERE id = ?', [id]);
        if (r.affectedRows === 0) {
            return res.status(404).json({ error: 'Promotion not found' });
        }
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete promotion error:', error);
        res.status(500).json({ error: 'Failed to delete promotion' });
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
        logger.error('Get email subscribers error:', error);
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
        logger.error('Get email subscriber error:', error);
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
        logger.error('Update subscriber status error:', error);
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
        logger.error('Claim offer error:', error);
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
        logger.error('Export subscribers error:', error);
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
        logger.error('Get dashboard overview error:', error);
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
        logger.error('Get vendor metrics error:', error);
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
        logger.error('Get POS health error:', error);
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
        logger.error('Get POS gift card metrics error:', error);
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
        logger.error('Get POS loyalty metrics error:', error);
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
        logger.error('Get POS discount metrics error:', error);
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
        logger.error('Get email marketing overview error:', error);
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
        logger.error('Get system alerts error:', error);
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
        logger.error('Get performance metrics error:', error);
        res.status(500).json({ error: 'Failed to get performance metrics' });
    }
});

// ===== TAX RESERVE LEDGER =====

router.get('/tax-ledger/overview', authenticateAdmin, async (req, res) => {
    try {
        const date = String(req.query.date || toDateKey()).slice(0, 10);
        const service = new TaxLedgerService(req.pool);
        const overview = await service.getDailyOverview(date);
        res.json({ overview });
    } catch (error) {
        logger.error('Get tax ledger overview error:', error);
        res.status(500).json({ error: 'Failed to load tax ledger overview' });
    }
});

router.post('/tax-ledger/mark-transferred', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const date = String(req.body?.date || toDateKey()).slice(0, 10);
        const service = new TaxLedgerService(req.pool);
        const overview = await service.markTransferred(date);
        res.json({ success: true, overview });
    } catch (error) {
        logger.error('Mark tax ledger transferred error:', error);
        res.status(500).json({ error: 'Failed to mark reserve as transferred' });
    }
});

router.post('/tax-ledger/sync-pos', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const date = String(req.body?.date || toDateKey()).slice(0, 10);
        const service = new TaxLedgerService(req.pool);
        const result = await service.syncPosTaxEntries(date);
        const overview = await service.getDailyOverview(date);
        res.json({ success: true, date, result, overview });
    } catch (error) {
        logger.error('Manual tax ledger POS sync error:', error);
        res.status(500).json({ error: error.message || 'Failed POS sync' });
    }
});

router.post('/tax-ledger/sync-daily', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const date = String(req.body?.date || toDateKey()).slice(0, 10);
        const service = new TaxLedgerService(req.pool);
        const result = await service.runDailySync(date);
        const overview = await service.getDailyOverview(date);
        res.json({ success: true, date, result, overview });
    } catch (error) {
        logger.error('Manual tax ledger daily sync error:', error);
        res.status(500).json({ error: error.message || 'Failed daily sync' });
    }
});

router.get('/tax-ledger/export/taxcloud.csv', authenticateAdmin, requirePermission('manager'), async (req, res) => {
    try {
        const startDate = String(req.query.startDate || '').slice(0, 10);
        const endDate = String(req.query.endDate || '').slice(0, 10);
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
        }

        const service = new TaxLedgerService(req.pool);
        const { csv, count } = await service.exportTaxCloudCsv(startDate, endDate);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="taxcloud-${startDate}-to-${endDate}.csv"`);
        res.setHeader('X-Row-Count', String(count));
        return res.send(csv);
    } catch (error) {
        logger.error('Export tax ledger csv error:', error);
        res.status(500).json({ error: 'Failed to export TaxCloud CSV' });
    }
});

module.exports = router;

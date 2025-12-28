// H&M Herbs & Vitamins - Backend API Server
// Modern Node.js/Express server with authentication, product management, and e-commerce functionality

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Load .env file FIRST - before any other requires that might need it
// Use explicit path to ensure we're loading from the backend directory
const envPath = path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

const logger = require('./utils/logger');
const secureLogger = require('./utils/secure-logger');
const cache = require('./utils/cache');
const { userRegistrationValidation, userLoginValidation } = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting for database error logging (prevent console spam)
const dbErrorLogTimes = new Map();
const DB_ERROR_LOG_INTERVAL = 60000; // Log database errors at most once per minute

function shouldLogDatabaseError(errorCode) {
    if (errorCode !== 'ER_ACCESS_DENIED_ERROR' && errorCode !== 'ECONNREFUSED') {
        return true; // Always log non-database connection errors
    }

    const now = Date.now();
    const lastLogTime = dbErrorLogTimes.get(errorCode) || 0;

    if (now - lastLogTime > DB_ERROR_LOG_INTERVAL) {
        dbErrorLogTimes.set(errorCode, now);
        return true;
    }

    return false; // Don't log - too soon since last log
}

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hmherbs',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Log database config (without password) for debugging
if (process.env.NODE_ENV === 'development') {
    logger.info('Database config:', {
        host: dbConfig.host,
        user: dbConfig.user,
        database: dbConfig.database,
        hasPassword: !!dbConfig.password,
        passwordLength: dbConfig.password ? dbConfig.password.length : 0
    });

    // Warn if password is missing
    if (!dbConfig.password || dbConfig.password.trim() === '') {
        logger.warn('⚠️ WARNING: DB_PASSWORD is empty or not set in .env file!');
        logger.warn('   Database connections will fail. Please set DB_PASSWORD in backend/.env');
    }
}

const pool = mysql.createPool(dbConfig);

// Enhanced Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false, // Don't use helmet defaults - use our own
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:", "http:", "https://images.unsplash.com", "https://hmherbs.com", "https://*.hmherbs.com"],
            connectSrc: [
                "'self'",
                // Development: Allow localhost connections on all common ports
                "http://localhost:3000",
                "http://localhost:3001",
                "http://localhost:3002",
                "http://localhost:8080",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:3001",
                "http://127.0.0.1:3002",
                "http://127.0.0.1:8080",
                // Production APIs
                "https://fonts.googleapis.com",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
                "https://hmherbs.com",
                "https://*.hmherbs.com",
                "https://images.unsplash.com",
                "ws:", // WebSocket support
                "wss:" // Secure WebSocket support
            ],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            workerSrc: ["'self'", "blob:"],
            childSrc: ["'self'"],
            formAction: ["'self'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: null, // Disable upgrade insecure requests in development
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
// Compression middleware - but exclude SSE endpoints
app.use(compression({
    filter: (req, res) => {
        // Don't compress Server-Sent Events
        if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
            return false;
        }
        // Use default compression filter for other responses
        return compression.filter(req, res);
    }
}));
// CORS configuration with support for multiple origins
const allowedOrigins = [
    'http://localhost:8000',
    'http://localhost:3000',
    'http://localhost:3001', // Allow same-origin requests when frontend is served from backend
    'http://127.0.0.1:8000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001' // Allow same-origin requests when frontend is served from backend
];

// Add production frontend URL if specified
if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

// Add production domain if specified
if (process.env.PRODUCTION_DOMAIN) {
    allowedOrigins.push(`https://${process.env.PRODUCTION_DOMAIN}`);
    allowedOrigins.push(`http://${process.env.PRODUCTION_DOMAIN}`);
}

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow same-origin requests (when origin matches server origin)
        const serverOrigin = `http://localhost:${PORT}`;
        const serverOriginAlt = `http://127.0.0.1:${PORT}`;
        if (origin === serverOrigin || origin === serverOriginAlt) {
            return callback(null, true);
        }

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // Only log CORS blocks for non-localhost origins to reduce noise
            // Localhost CORS issues are usually development configuration issues, not security threats
            if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
                secureLogger.logSecurityEvent('cors_blocked', 'medium', 'CORS blocked request', { origin });
            }
            // Don't throw error - just reject silently to prevent "Unhandled error" messages
            callback(null, false);
        }
    },
    credentials: true
}));

// Rate limiting - skip for static files and in development
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Higher limit in development
    skip: (req) => {
        // Skip rate limiting for static files (CSS, JS, images, fonts, etc.)
        const staticExtensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.json', '.xml', '.txt', '.pdf'];
        const isStaticFile = staticExtensions.some(ext => req.path.toLowerCase().endsWith(ext));

        // Skip for localhost in development
        const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';

        return isStaticFile || (process.env.NODE_ENV !== 'production' && isLocalhost);
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth attempts per windowMs
    message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static('uploads'));

// Serve admin panel and frontend files
const rootPath = path.join(__dirname, '..');
app.use(express.static(rootPath)); // Serve files from project root

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    if (!process.env.JWT_SECRET) {
        logger.error('CRITICAL: JWT_SECRET environment variable is not set');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await pool.execute(
            'SELECT id, email, first_name, last_name, is_active FROM users WHERE id = ? AND is_active = 1',
            [decoded.userId]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = rows[0];
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    if (!process.env.JWT_SECRET) {
        logger.error('CRITICAL: JWT_SECRET environment variable is not set');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await pool.execute(
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

// Utility functions
const generateOrderNumber = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `HM${timestamp.slice(-6)}${random}`;
};

const calculateTax = (subtotal, taxRate = 0.08) => {
    return Math.round(subtotal * taxRate * 100) / 100;
};

const calculateShipping = (subtotal, freeShippingThreshold = 25.00) => {
    return subtotal >= freeShippingThreshold ? 0 : 5.99;
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// User Authentication Routes
app.post('/api/auth/register', authLimiter, userRegistrationValidation, async (req, res) => {
    try {
        const { email, password, firstName, lastName, phone } = req.body;

        // Validate input
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'All required fields must be provided' });
        }

        // Check if user already exists
        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User already exists with this email' });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const [result] = await pool.execute(
            'INSERT INTO users (email, password_hash, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)',
            [email, passwordHash, firstName, lastName, phone || null]
        );

        // Generate JWT token
        if (!process.env.JWT_SECRET) {
            logger.error('CRITICAL: JWT_SECRET environment variable is not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const token = jwt.sign(
            { userId: result.insertId },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: result.insertId,
                email,
                firstName,
                lastName
            }
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', authLimiter, userLoginValidation, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const [users] = await pool.execute(
            'SELECT id, email, password_hash, first_name, last_name, is_active FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        if (!user.is_active) {
            return res.status(401).json({ error: 'Account is deactivated' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await pool.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        // Generate JWT token
        if (!process.env.JWT_SECRET) {
            logger.error('CRITICAL: JWT_SECRET environment variable is not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User Profile Routes (require authentication)
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, email, first_name, last_name, phone, date_of_birth, email_verified, created_at, last_login FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user: {
                id: users[0].id,
                email: users[0].email,
                firstName: users[0].first_name,
                lastName: users[0].last_name,
                phone: users[0].phone,
                dateOfBirth: users[0].date_of_birth,
                emailVerified: users[0].email_verified,
                createdAt: users[0].created_at,
                lastLogin: users[0].last_login
            }
        });
    } catch (error) {
        logger.error('Get user profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, email, phone } = req.body;
        const userId = req.user.id;

        // Check if email is being changed and if it's already taken
        if (email) {
            const [existingUsers] = await pool.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, userId]
            );
            if (existingUsers.length > 0) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        // Update user
        await pool.execute(
            'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [firstName, lastName, email, phone, userId]
        );

        // Get updated user
        const [users] = await pool.execute(
            'SELECT id, email, first_name, last_name, phone FROM users WHERE id = ?',
            [userId]
        );

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: users[0].id,
                email: users[0].email,
                firstName: users[0].first_name,
                lastName: users[0].last_name,
                phone: users[0].phone
            }
        });
    } catch (error) {
        logger.error('Update user profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/user/orders', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [orders] = await pool.execute(
            `SELECT o.id, o.order_number, o.total, o.status, o.created_at,
                    COUNT(oi.id) as item_count
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             WHERE o.user_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC
             LIMIT 50`,
            [userId]
        );

        res.json({ orders });
    } catch (error) {
        logger.error('Get user orders error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/user/addresses', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [addresses] = await pool.execute(
            'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [userId]
        );

        res.json({ addresses });
    } catch (error) {
        logger.error('Get user addresses error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Product Routes
app.get('/api/products', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            brand,
            healthCategory,
            search,
            minPrice,
            maxPrice,
            sortBy = 'name',
            sortOrder = 'ASC',
            featured
        } = req.query;

        const offset = (page - 1) * limit;
        let whereConditions = ['p.is_active = 1'];
        let queryParams = [];

        // Build WHERE conditions
        if (category) {
            whereConditions.push('pc.slug = ?');
            queryParams.push(category);
        }

        if (brand) {
            const cleanBrand = brand.toLowerCase().replace(/[^a-z0-9]/g, '');

            whereConditions.push(`(
                LOWER(b.slug) = ? OR 
                LOWER(b.name) = ? OR 
                REPLACE(REPLACE(LOWER(b.slug), '-', ''), ' ', '') = ? OR
                REPLACE(REPLACE(LOWER(b.name), '-', ''), ' ', '') = ? OR
                LOWER(b.slug) LIKE ? OR 
                LOWER(b.name) LIKE ?
            )`);

            queryParams.push(
                brand.toLowerCase(),
                brand.toLowerCase(),
                cleanBrand,
                cleanBrand,
                `%${cleanBrand}%`,
                `%${cleanBrand}%`
            );
        }

        if (healthCategory) {
            whereConditions.push('hc.slug = ?');
            queryParams.push(healthCategory);
        }

        if (search) {
            whereConditions.push('(p.name LIKE ? OR p.short_description LIKE ? OR p.long_description LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }

        if (minPrice) {
            whereConditions.push('p.price >= ?');
            queryParams.push(parseFloat(minPrice));
        }

        if (maxPrice) {
            whereConditions.push('p.price <= ?');
            queryParams.push(parseFloat(maxPrice));
        }

        if (featured === 'true') {
            whereConditions.push('p.is_featured = 1');
            // Also ensure active products only for featured
            if (!whereConditions.includes('p.is_active = 1')) {
                whereConditions.push('p.is_active = 1');
            }
        }

        // Exclude scheduled events/non-product items from product listing
        const excludedSkus = ['51302']; // Association of Natural Health EDSA Biofeedback Testing
        const excludedSlugs = ['association-of-natural-health-edsa-biofeedback-testing'];
        const excludedNamePatterns = ['association of natural health edsa'];

        if (excludedSkus.length) {
            const placeholders = excludedSkus.map(() => '?').join(', ');
            whereConditions.push(`COALESCE(TRIM(p.sku), '') NOT IN (${placeholders})`);
            queryParams.push(...excludedSkus);
        }

        if (excludedSlugs.length) {
            const placeholders = excludedSlugs.map(() => '?').join(', ');
            whereConditions.push(`COALESCE(TRIM(p.slug), '') NOT IN (${placeholders})`);
            queryParams.push(...excludedSlugs);
        }

        excludedNamePatterns.forEach(pattern => {
            whereConditions.push('LOWER(p.name) NOT LIKE ?');
            queryParams.push(`%${pattern}%`);
        });

        // Build ORDER BY clause
        const allowedSortFields = ['name', 'price', 'created_at'];
        const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'name';
        const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Ensure limit and offset are integers
        const limitInt = parseInt(limit) || 20;
        const offsetInt = parseInt(offset) || 0;

        // Build query with embedded LIMIT/OFFSET (MySQL2 has issues with LIMIT/OFFSET placeholders)
        const query = `
            SELECT DISTINCT
                p.id,
                p.sku,
                p.name,
                p.slug,
                p.short_description,
                p.price,
                p.compare_price,
                p.inventory_quantity,
                p.is_featured,
                b.name as brand_name,
                b.slug as brand_slug,
                pc.name as category_name,
                pc.slug as category_slug,
                pi.image_url,
                pi.alt_text
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            LEFT JOIN product_health_categories phc ON p.id = phc.product_id
            LEFT JOIN health_categories hc ON phc.health_category_id = hc.id
            LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
            ${whereClause}
            ORDER BY p.${sortField} ${order}
            LIMIT ${limitInt} OFFSET ${offsetInt}
        `;

        // Use query() instead of execute() since we're embedding LIMIT/OFFSET directly
        const [products] = await pool.query(query, queryParams);

        // Log featured products query for debugging
        if (featured === 'true') {
            logger.info('Featured products query result:', {
                count: products.length,
                products: products.map(p => ({ id: p.id, name: p.name, is_featured: p.is_featured }))
            });
        }

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(DISTINCT p.id) as total
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            LEFT JOIN product_health_categories phc ON p.id = phc.product_id
            LEFT JOIN health_categories hc ON phc.health_category_id = hc.id
            ${whereClause}
        `;

        const [countResult] = await pool.execute(countQuery, queryParams);
        const totalProducts = countResult[0].total;
        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            products,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        // Rate limit database connection error logging to prevent console spam
        if (shouldLogDatabaseError(error.code)) {
            if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === 'ECONNREFUSED') {
                logger.error('Products fetch error (database unavailable):', error.message);
                logger.warn('Note: This error will only be logged once per minute to reduce console spam.');
            } else {
                logger.error('Products fetch error:', error);
            }
        }

        // Check if it's a database connection error - return empty array instead of error
        if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === 'ECONNREFUSED') {
            return res.status(200).json({
                products: [],
                pagination: {
                    currentPage: parseInt(req.query.page || 1),
                    totalPages: 0,
                    totalProducts: 0,
                    hasNextPage: false,
                    hasPrevPage: false
                }
            });
        }

        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single product
app.get('/api/products/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const [products] = await pool.execute(`
            SELECT 
                p.*,
                b.name as brand_name,
                b.slug as brand_slug,
                b.description as brand_description,
                pc.name as category_name,
                pc.slug as category_slug
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            WHERE p.slug = ? AND p.is_active = 1
        `, [slug]);

        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[0];

        // Get product images
        const [images] = await pool.execute(
            'SELECT image_url, alt_text, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order',
            [product.id]
        );

        // Get product variants
        const [variants] = await pool.execute(
            'SELECT id, sku, name, price, compare_price, inventory_quantity, is_active FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY sort_order',
            [product.id]
        );

        // Get health categories
        const [healthCategories] = await pool.execute(`
            SELECT hc.id, hc.name, hc.slug, hc.description
            FROM health_categories hc
            JOIN product_health_categories phc ON hc.id = phc.health_category_id
            WHERE phc.product_id = ? AND hc.is_active = 1
            ORDER BY hc.sort_order
        `, [product.id]);

        product.images = images;
        product.variants = variants;
        product.health_categories = healthCategories;

        // Map database field names to frontend-expected names
        product.description = product.long_description || product.description || '';
        // Ensure short_description is available (it's already in the SELECT p.*)

        res.json(product);
    } catch (error) {
        logger.error('Product fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get health categories
app.get('/api/health-categories', async (req, res) => {
    try {
        const [categories] = await pool.execute(
            'SELECT id, name, slug, description, image_url FROM health_categories WHERE is_active = 1 ORDER BY sort_order'
        );

        res.json(categories);
    } catch (error) {
        logger.error('Health categories fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get brands
app.get('/api/brands', async (req, res) => {
    try {
        const [brands] = await pool.execute(
            'SELECT id, name, slug, description, logo_url FROM brands WHERE is_active = 1 ORDER BY name'
        );

        res.json(brands);
    } catch (error) {
        logger.error('Brands fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get product categories
app.get('/api/categories', async (req, res) => {
    try {
        const [categories] = await pool.execute(
            'SELECT id, name, slug, description, image_url, parent_id FROM product_categories WHERE is_active = 1 ORDER BY sort_order'
        );

        res.json(categories);
    } catch (error) {
        logger.error('Categories fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Import route modules
const cartRoutes = require('./routes/cart');
const edsaRoutes = require('./routes/edsa');
const adminRoutes = require('./routes/admin');
const paymentCardsRoutes = require('./routes/payment-cards');
const publicRoutes = require('./routes/public');

// Middleware to attach database pool to requests
app.use((req, res, next) => {
    req.pool = pool;
    next();
});

// Analytics endpoint (public, for client-side analytics)
app.post('/api/analytics', express.json(), (req, res) => {
    // Accept analytics data but don't require database connection
    // This prevents 404 errors when frontend sends analytics
    try {
        // In production, you would store this in a database
        // For now, just acknowledge receipt to prevent errors
        res.status(200).json({ success: true, message: 'Analytics data received' });
    } catch (error) {
        // Silently fail - analytics shouldn't break the app
        res.status(200).json({ success: true });
    }
});

// Mount routes
app.use('/api/cart', cartRoutes);
app.use('/api/orders', require('./routes/orders'));
app.use('/api/edsa', edsaRoutes);
app.use('/api/menu', require('./routes/menu'));
app.use('/api/admin', adminRoutes);
app.use('/api/payment-cards', require('./routes/payment-cards'));
app.use('/api', publicRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
    // Don't log CORS errors - they're handled by the CORS middleware
    // CORS errors are expected when origins don't match and are not security issues
    if (error.message && error.message.includes('CORS')) {
        // CORS errors are handled by returning false in the callback
        // This shouldn't reach here, but if it does, handle silently
        return res.status(403).json({ error: 'CORS policy: Origin not allowed' });
    }

    // Log other errors
    logger.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler - only for API routes, allow static files to be served
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`H&M Herbs API Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:8000'}`);
}).on('error', (error) => {
    logger.error('Server startup error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please stop the other process or change the port.`);
    } else {
        console.error(`❌ Failed to start server: ${error.message}`);
    }
    process.exit(1);
});

// Set server timeouts for long-running operations like scraping
server.timeout = 0; // Disable timeout
server.keepAliveTimeout = 600000; // 10 minutes
server.headersTimeout = 601000; // 10 minutes + 1s

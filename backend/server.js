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
const logger = require('./utils/logger');
const cache = require('./utils/cache');
const { userRegistrationValidation, userLoginValidation } = require('./middleware/validation');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

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

const pool = mysql.createPool(dbConfig);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8000',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
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
        console.error('CRITICAL: JWT_SECRET environment variable is not set');
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
        console.error('Registration error:', error);
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
        console.error('Login error:', error);
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
            whereConditions.push('b.slug = ?');
            queryParams.push(brand);
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
        }

        // Build ORDER BY clause
        const allowedSortFields = ['name', 'price', 'created_at'];
        const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'name';
        const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

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
            LIMIT ? OFFSET ?
        `;

        queryParams.push(parseInt(limit), offset);

        const [products] = await pool.execute(query, queryParams);

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

        const [countResult] = await pool.execute(countQuery, queryParams.slice(0, -2));
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
        console.error('Products fetch error:', error);
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

        res.json(product);
    } catch (error) {
        console.error('Product fetch error:', error);
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
        console.error('Health categories fetch error:', error);
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
        console.error('Brands fetch error:', error);
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
        console.error('Categories fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Import route modules
const cartRoutes = require('./routes/cart');
const edsaRoutes = require('./routes/edsa');
const adminRoutes = require('./routes/admin');

// Middleware to attach database pool to requests
app.use((req, res, next) => {
    req.pool = pool;
    next();
});

// Mount routes
app.use('/api/cart', cartRoutes);
app.use('/api/orders', require('./routes/orders'));
app.use('/api/edsa', edsaRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`H&M Herbs API Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:8000'}`);
});

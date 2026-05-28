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
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { ensureProductCatalogImages } = require('./utils/ensureProductCatalogImages');

// Load .env file FIRST - before any other requires that might need it
// Use explicit path to ensure we're loading from the backend directory
const envPath = path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

const logger = require('./utils/logger');
const { handlePromoBannerGet, disabledPayload } = require('./utils/promoBanner');
const { createSeoRedirectMiddleware } = require('./middleware/seoRedirects');
const { ensureProductSchema } = require('./utils/ensureProductSchema');
const { ensureUserPasswordResetSchema } = require('./utils/ensureUserPasswordResetSchema');
const { ensureEdsaBookingSchema } = require('./utils/ensureEdsaBookingSchema');
const { provisionWebCustomerProfile } = require('./utils/provisionCustomerProfile');
const { createOctoposRewardCardForWebUser } = require('./utils/createOctoposRewardCardForWebUser');
const { pushUserProfileToOctopos } = require('./utils/pushUserProfileToOctopos');
const { isUsPhoneDisplayOrEmpty } = require('./utils/usPhoneDisplay');
const { startOctoposAutoSync } = require('./services/octoposAutoSyncScheduler');
const { startTaxReserveScheduler } = require('./services/taxReserveScheduler');
const secureLogger = require('./utils/secure-logger');
const {
    userRegistrationValidation,
    userLoginValidation,
    userForgotPasswordValidation,
    userResetPasswordValidation
} = require('./middleware/validation');
const {
    catalogPrimaryImageForProduct,
    applyCatalogPriceFix,
    sanitizeLegacyProductImageUrl
} = require('./utils/catalogOverrides');

const { jsonSafeDeep } = require('./utils/jsonSafeMysql');
const { buildDbConfig } = require('./utils/dbConfig');

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

// Database connection (local MySQL or Linode Managed MySQL — see utils/dbConfig.js)
let dbConfig;
try {
    dbConfig = buildDbConfig();
} catch (err) {
    logger.error(`Database configuration error: ${err.message}`);
    process.exit(1);
}

// Log database config (without password) for debugging
if (process.env.NODE_ENV === 'development') {
    logger.info('Database config:', {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database,
        ssl: !!dbConfig.ssl,
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

// Attach DB pool to every request first (public routes and middleware expect req.pool).
app.use((req, res, next) => {
    req.pool = pool;
    next();
});

// Enhanced Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false, // Don't use helmet defaults - use our own
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdnjs.cloudflare.com",
                "https://fonts.googleapis.com",
                // NMI Collect.js inline variant loads hosted styles
                "https://secure.nmi.com",
                "https://sandbox.nmi.com"
            ],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdnjs.cloudflare.com",
                // NMI Collect.js (card tokenization on checkout; sandbox for Durango test keys)
                "https://secure.nmi.com",
                "https://sandbox.nmi.com",
                // Apple Pay SDK (loaded by Collect.js when Apple Pay is offered)
                "https://applepay.cdn-apple.com"
            ],
            scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
                // Apple Pay button / wallet SDK (Collect.js) loads fonts from applepay.cdn-apple.com
                "https://applepay.cdn-apple.com"
            ],
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
                // NMI tokenization / gateway (Collect.js inline + API)
                "https://secure.nmi.com",
                "https://sandbox.nmi.com",
                "https://secure.networkmerchants.com",
                "ws:", // WebSocket support
                "wss:" // Secure WebSocket support
            ],
            // Inline Collect.js mounts hosted fields in iframes on NMI hosts
            frameSrc: [
                "'self'",
                "https://secure.nmi.com",
                "https://sandbox.nmi.com",
                "https://secure.networkmerchants.com"
            ],
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
        // Service worker must be readable as plain script; compression can confuse devtools / registration
        if (req.path === '/service-worker.js') {
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
    'http://localhost:5500', // VS Code Live Server and similar
    'http://localhost:5173', // Vite dev
    'http://localhost:4173', // Vite preview
    'http://localhost:8080',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001', // Allow same-origin requests when frontend is served from backend
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:8080'
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

// Stricter rate limiting for authentication endpoints.
// In production: 5 attempts / 15 min per IP (brute-force protection).
// In non-production (local dev): much higher default so debugging sign-in
// isn't blocked for 15 minutes after a few tries. Override with
// AUTH_RATE_LIMIT_MAX (integer) if needed.
const authLimiterMaxEnv = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '', 10);
const authLimiterDefaultMax = process.env.NODE_ENV === 'production' ? 5 : 80;
const authLimiterMax =
    Number.isFinite(authLimiterMaxEnv) && authLimiterMaxEnv > 0
        ? authLimiterMaxEnv
        : authLimiterDefaultMax;

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: authLimiterMax,
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

// Static uploads — always resolve to backend/uploads (relative "uploads" breaks if cwd is not backend/)
const uploadsDir = path.join(__dirname, 'uploads');
const rootPath = path.join(__dirname, '..');
const missingUploadProductFallback = path.join(
    rootPath,
    'images',
    'products',
    'nature-s-puls-probiotic-mega.jpg'
);

// DB often points at /uploads/products/... files that only exist where they were uploaded (not in git).
// Serve a real repo image so catalog <img> requests succeed instead of 404 + client fallbacks.
app.get('/uploads/products/:filename', async (req, res) => {
    const filename = req.params.filename || '';
    if (!filename || filename.includes('..') || /[/\\]/.test(filename)) {
        return res.status(400).end();
    }
    const filePath = path.join(uploadsDir, 'products', filename);
    try {
        await fs.access(filePath);
        return res.sendFile(path.resolve(filePath));
    } catch {
        try {
            await fs.access(missingUploadProductFallback);
            return res.sendFile(path.resolve(missingUploadProductFallback));
        } catch {
            logger.error('Uploads fallback image missing. Run: node backend/scripts/ensure-product-catalog-images.js');
            return res.status(404).end();
        }
    }
});

// Catalog images under /images/products/ — DB often references files that are missing or 0-byte in the repo.
// Serve a real JPEG so <img> requests decode instead of erroring (client fallbacks still work as backup).
app.get('/images/products/:filename', async (req, res) => {
    const filename = req.params.filename || '';
    if (!filename || filename.includes('..') || /[/\\]/.test(filename)) {
        return res.status(400).end();
    }
    const filePath = path.join(rootPath, 'images', 'products', filename);
    try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.size > 0) {
            return res.sendFile(path.resolve(filePath));
        }
    } catch {
        // missing or unreadable
    }
    try {
        await fs.access(missingUploadProductFallback);
        return res.sendFile(path.resolve(missingUploadProductFallback));
    } catch {
        logger.error('Catalog fallback image missing. Run: node backend/scripts/ensure-product-catalog-images.js');
        return res.status(404).end();
    }
});

app.use('/uploads', express.static(uploadsDir));

// Service worker: dedicated handler (correct MIME, no-cache, scope) — avoids flaky registration on :3001
app.get('/service-worker.js', (req, res, next) => {
    const swPath = path.join(rootPath, 'service-worker.js');
    res.type('application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.resolve(swPath), (err) => {
        if (err) next(err);
    });
});

// Staging / preview hosts: block indexing (unset before production launch).
if (process.env.STAGING_BLOCK_INDEXING === 'true') {
    app.use((req, res, next) => {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        next();
    });
    app.get('/robots.txt', (req, res) => {
        res.type('text/plain');
        res.send('User-agent: *\nDisallow: /\n');
    });
}

// Permanent SEO redirects from repo-root redirects-301.csv (see file header).
app.use(createSeoRedirectMiddleware({ rootPath, logger }));

// Serve admin panel and frontend files
app.use(express.static(rootPath)); // Serve files from project root

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
        const uid = decoded.userId ?? decoded.id ?? decoded.sub;
        if (uid == null || uid === '') {
            return res.status(403).json({ error: 'Invalid token' });
        }
        const [rows] = await pool.execute(
            'SELECT id, email, first_name, last_name, is_active FROM users WHERE id = ? AND is_active = 1',
            [uid]
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

/** Build storefront JWT session `user` JSON from a users table row (camelCase for web clients). */
function storefrontSessionUserFromDbRow(row) {
    if (!row) return null;
    let dob = row.date_of_birth;
    if (dob instanceof Date) {
        dob = dob.toISOString().slice(0, 10);
    } else if (dob != null && String(dob).trim() !== '') {
        dob = String(dob).slice(0, 10);
    } else {
        dob = null;
    }
    return {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone != null ? row.phone : null,
        dateOfBirth: dob,
        customerNumber: row.customer_number != null ? row.customer_number : null,
    };
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Database + catalog readiness (use when /api/products returns empty)
app.get('/api/health/ready', async (req, res) => {
    try {
        await pool.query('SELECT 1 AS ok');
        const [countRows] = await pool.query(
            'SELECT COUNT(*) AS n FROM products WHERE is_active = 1'
        );
        const activeProducts = countRows[0] ? Number(countRows[0].n) : 0;
        res.json({
            status: 'OK',
            database: 'connected',
            activeProducts,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.warn('Health ready check failed:', error.message);
        res.status(503).json({
            status: 'error',
            database: 'unavailable',
            code: error.code || null,
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Promo banner (early registration; uses `pool` directly; always 200 — see utils/promoBanner.js)
app.get('/api/promo-banner', async (req, res) => {
    try {
        await handlePromoBannerGet(pool, res, logger);
    } catch (error) {
        logger.error('Promo banner route error:', error);
        if (!res.headersSent) {
            res.status(200).json(disabledPayload());
        }
    }
});

// User Authentication Routes
app.post('/api/auth/register', authLimiter, userRegistrationValidation, async (req, res) => {
    try {
        const { email, password, firstName, lastName, phone, dateOfBirth } = req.body;
        const emailNorm = String(email || '').trim().toLowerCase();
        const dob = String(dateOfBirth || '').trim().slice(0, 10);

        // Validate input (DOB also enforced by userRegistrationValidation)
        if (!emailNorm || !password || !firstName || !lastName || !dob) {
            return res.status(400).json({ error: 'All required fields must be provided' });
        }

        // Check if user already exists (case-insensitive; handles legacy mixed-case rows)
        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE LOWER(TRIM(email)) = ?',
            [emailNorm]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                error: 'There is already an account with this email address. Please sign in instead.',
            });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const [result] = await pool.execute(
            'INSERT INTO users (email, password_hash, first_name, last_name, phone, date_of_birth) VALUES (?, ?, ?, ?, ?, ?)',
            [emailNorm, passwordHash, firstName, lastName, phone || null, dob]
        );

        const newUserId = result.insertId;
        await provisionWebCustomerProfile(pool, newUserId, logger);

        // Generate JWT token
        if (!process.env.JWT_SECRET) {
            logger.error('CRITICAL: JWT_SECRET environment variable is not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const token = jwt.sign(
            { userId: newUserId },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        let sessionUser;
        try {
            const [urows] = await pool.execute(
                `SELECT id, email, first_name, last_name, phone, date_of_birth, customer_number
                 FROM users WHERE id = ?`,
                [newUserId]
            );
            sessionUser = storefrontSessionUserFromDbRow(urows[0]);
        } catch (err) {
            if (err.errno !== 1054) throw err;
            const [urows] = await pool.execute(
                `SELECT id, email, first_name, last_name, phone, date_of_birth FROM users WHERE id = ?`,
                [newUserId]
            );
            sessionUser = storefrontSessionUserFromDbRow({ ...urows[0], customer_number: null });
        }

        setImmediate(() => {
            createOctoposRewardCardForWebUser(
                pool,
                {
                    id: newUserId,
                    email: emailNorm,
                    first_name: firstName,
                    last_name: lastName,
                    phone: phone || null,
                    date_of_birth: dob,
                },
                logger
            ).catch((e) => logger.warn('[octopos] post-register reward card', { message: e.message }));
        });

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: sessionUser || {
                id: newUserId,
                email: emailNorm,
                firstName,
                lastName,
                phone: phone || null,
                dateOfBirth: dob,
                customerNumber: null,
            },
        });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                error: 'There is already an account with this email address. Please sign in instead.',
            });
        }
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

        const emailKey = String(email || '').trim().toLowerCase();

        // Find user (case-insensitive match for legacy mixed-case emails)
        let users;
        try {
            [users] = await pool.execute(
                `SELECT id, email, password_hash, first_name, last_name, phone, date_of_birth,
                        customer_number, is_active
                   FROM users WHERE LOWER(TRIM(email)) = ?`,
                [emailKey]
            );
        } catch (err) {
            if (err.errno !== 1054) throw err;
            [users] = await pool.execute(
                `SELECT id, email, password_hash, first_name, last_name, phone, date_of_birth, is_active
                   FROM users WHERE LOWER(TRIM(email)) = ?`,
                [emailKey]
            );
            users = users.map((u) => ({ ...u, customer_number: null }));
        }

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

        await provisionWebCustomerProfile(pool, user.id, logger);

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
            user: storefrontSessionUserFromDbRow(user),
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/** Base URL for links in customer emails (reset-password.html). */
function getStorefrontPasswordResetBaseUrl() {
    let base = String(process.env.STOREFRONT_PUBLIC_URL || process.env.FRONTEND_URL || '').trim();
    base = base.replace(/\/+$/, '');
    if (!base) {
        const port = String(process.env.PORT || 3001).trim();
        base = `http://localhost:${port}`;
    }
    return base;
}

// Customer password reset (self-service; same email privacy pattern as admin)
app.post('/api/auth/forgot-password', authLimiter, userForgotPasswordValidation, async (req, res) => {
    try {
        const emailNorm = String(req.body.email || '')
            .trim()
            .toLowerCase();
        const crypto = require('crypto');
        const [users] = await pool.execute(
            `SELECT id, email, first_name, last_name FROM users
             WHERE LOWER(TRIM(email)) = ? AND is_active = 1`,
            [emailNorm]
        );

        if (users.length > 0) {
            const u = users[0];
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpires = new Date(Date.now() + 3600000);
            await pool.execute(
                'UPDATE users SET password_reset_token = ?, password_reset_token_expires = ? WHERE id = ?',
                [resetToken, resetTokenExpires, u.id]
            );
            const resetBase = getStorefrontPasswordResetBaseUrl();
            const resetUrl = `${resetBase}/reset-password.html?token=${encodeURIComponent(resetToken)}`;

            try {
                const smtpHost = String(process.env.SMTP_HOST || process.env.EMAIL_HOST || '').trim();
                const smtpUser = String(process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
                const smtpPass = process.env.SMTP_PASSWORD || process.env.EMAIL_PASS || '';
                const smtpPort = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587) || 587;
                if (smtpHost && smtpUser) {
                    const nodemailer = require('nodemailer');
                    const transporter = nodemailer.createTransport({
                        host: smtpHost,
                        port: smtpPort,
                        secure: smtpPort === 465,
                        auth: {
                            user: smtpUser,
                            pass: smtpPass
                        }
                    });
                    const first = String(u.first_name || '').trim() || 'there';
                    const fromAddr = String(process.env.SMTP_FROM || process.env.EMAIL_FROM || smtpUser).trim();
                    await transporter.sendMail({
                        from: fromAddr,
                        to: u.email,
                        subject: 'H&M Herbs — reset your password',
                        html: `
                            <h2>Password reset</h2>
                            <p>Hello ${first},</p>
                            <p>We received a request to reset the password for your H&amp;M Herbs account.</p>
                            <p><a href="${resetUrl}" style="background:#2d5a27;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">Choose a new password</a></p>
                            <p>Or copy this link into your browser:</p>
                            <p style="word-break:break-all;">${resetUrl}</p>
                            <p>This link expires in one hour. If you did not ask for this, you can ignore this email.</p>
                        `
                    });
                } else {
                    logger.info('Customer password reset (SMTP not configured):', { email: u.email, resetUrl });
                    console.log('\n🔑 Customer password reset link (set SMTP_* or EMAIL_* in backend/.env to send email):\n');
                    console.log(`   ${resetUrl}\n`);
                }
            } catch (emailErr) {
                logger.error('Failed to send customer password reset email:', emailErr);
            }
        }

        res.json({
            message: 'If an account with that email exists, we sent a link to reset your password.'
        });
    } catch (error) {
        if (error && (error.code === 'ER_BAD_FIELD_ERROR' || error.errno === 1054)) {
            logger.error(
                'Customer forgot-password: missing password_reset columns on users. Restart server after DB migration.',
                error.message
            );
            return res.status(503).json({
                error: 'Password reset is temporarily unavailable. Please try again later or contact support.'
            });
        }
        logger.error('Customer forgot-password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/reset-password', authLimiter, userResetPasswordValidation, async (req, res) => {
    try {
        const token = String(req.body.token || '').trim();
        const newPassword = String(req.body.newPassword || '');
        const [rows] = await pool.execute(
            `SELECT id FROM users
             WHERE password_reset_token = ? AND password_reset_token_expires > NOW() AND is_active = 1`,
            [token]
        );
        if (rows.length === 0) {
            return res.status(400).json({
                error: 'Invalid or expired reset link. Please request a new password reset.'
            });
        }
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await pool.execute(
            'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_token_expires = NULL, updated_at = NOW() WHERE id = ?',
            [passwordHash, rows[0].id]
        );
        res.json({ message: 'Your password was updated. You can sign in with your new password.' });
    } catch (error) {
        if (error && (error.code === 'ER_BAD_FIELD_ERROR' || error.errno === 1054)) {
            logger.error('Customer reset-password: missing columns on users.', error.message);
            return res.status(503).json({
                error: 'Password reset is temporarily unavailable. Please try again later or contact support.'
            });
        }
        logger.error('Customer reset-password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User Profile Routes (require authentication)
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        await provisionWebCustomerProfile(pool, req.user.id, logger);

        const baseSelect = `SELECT id, email, first_name, last_name, phone, date_of_birth, email_verified,
                    created_at, last_login`;
        let users;
        try {
            [users] = await pool.execute(
                `${baseSelect}, customer_number FROM users WHERE id = ?`,
                [req.user.id]
            );
        } catch (err) {
            if (err.errno !== 1054) throw err;
            [users] = await pool.execute(`${baseSelect} FROM users WHERE id = ?`, [req.user.id]);
        }

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const u = users[0];
        res.json({
            user: {
                id: u.id,
                email: u.email,
                firstName: u.first_name,
                lastName: u.last_name,
                phone: u.phone,
                dateOfBirth: u.date_of_birth,
                emailVerified: u.email_verified,
                createdAt: u.created_at,
                lastLogin: u.last_login,
                customerNumber: u.customer_number != null ? u.customer_number : null,
            }
        });
    } catch (error) {
        logger.error('Get user profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Tax exemption status for checkout UI (requires authentication)
app.get('/api/user/tax-status', authenticateToken, async (req, res) => {
    try {
        let rows;
        try {
            [rows] = await pool.execute(
                'SELECT tax_exempt, tax_exempt_id FROM users WHERE id = ? LIMIT 1',
                [req.user.id]
            );
        } catch (err) {
            // Older schema without tax fields
            if (err.errno !== 1054) throw err;
            return res.json({ taxExempt: false, verified: false, taxExemptIdPresent: false });
        }

        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const taxExempt = Boolean(rows[0].tax_exempt);
        const idValue = rows[0].tax_exempt_id ? String(rows[0].tax_exempt_id).trim() : '';
        const verified = taxExempt && idValue.length >= 3;

        res.json({
            taxExempt,
            verified,
            taxExemptIdPresent: idValue.length > 0
        });
    } catch (error) {
        logger.error('Get tax status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, dateOfBirth } = req.body;
        const userId = req.user.id;

        const phoneTrim = phone != null ? String(phone).trim() : '';
        if (!isUsPhoneDisplayOrEmpty(phoneTrim)) {
            return res.status(400).json({ error: 'Phone must be formatted as (555) 123-4567 or left blank' });
        }

        // Check if email is being changed
        if (email) {
            const [existingUsers] = await pool.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, userId]
            );
            if (existingUsers.length > 0) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        const dob = dateOfBirth != null && String(dateOfBirth).trim() !== '' ? String(dateOfBirth).trim().slice(0, 32) : null;

        // Update user (date_of_birth exists in base schema)
        await pool.execute(
            'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, date_of_birth = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [firstName, lastName, email, phoneTrim || null, dob, userId]
        );

        // Get updated user
        let users;
        try {
            [users] = await pool.execute(
                `SELECT id, email, first_name, last_name, phone, date_of_birth, customer_number FROM users WHERE id = ?`,
                [userId]
            );
        } catch (err) {
            if (err.errno !== 1054) throw err;
            [users] = await pool.execute(
                `SELECT id, email, first_name, last_name, phone, date_of_birth FROM users WHERE id = ?`,
                [userId]
            );
        }

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: users[0].id,
                email: users[0].email,
                firstName: users[0].first_name,
                lastName: users[0].last_name,
                phone: users[0].phone,
                dateOfBirth: users[0].date_of_birth,
                customerNumber: users[0].customer_number != null ? users[0].customer_number : null,
            }
        });

        setImmediate(() => {
            pushUserProfileToOctopos(pool, userId, logger).catch((e) =>
                logger.warn('[octopos] profile push', { message: e.message })
            );
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
            `SELECT /* hmherbs-user-orders-v3 */
                    o.id, o.order_number, o.total_amount AS total, o.status, o.created_at,
                    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
             FROM orders o
             WHERE o.user_id = ?
             ORDER BY o.created_at DESC
             LIMIT 50`,
            [userId]
        );

        res.json({ orders: jsonSafeDeep(orders) });
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

// Customer-facing loyalty profile (web user's points/tier/history)
app.get('/api/user/loyalty', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        let [[loyalty]] = await pool.execute(
            `SELECT points_balance, points_pending, lifetime_points_earned,
                    lifetime_points_redeemed, tier, tier_progress, member_since,
                    last_earned_at, last_redeemed_at, octopos_reward_card_number,
                    last_synced_at, sync_status
               FROM customer_loyalty WHERE user_id = ?`,
            [userId]
        );
        if (!loyalty) {
            await pool.execute(
                'INSERT INTO customer_loyalty (user_id, member_since) VALUES (?, CURDATE())',
                [userId]
            );
            [[loyalty]] = await pool.execute(
                `SELECT points_balance, points_pending, lifetime_points_earned,
                        lifetime_points_redeemed, tier, tier_progress, member_since,
                        last_earned_at, last_redeemed_at, octopos_reward_card_number,
                        last_synced_at, sync_status
                   FROM customer_loyalty WHERE user_id = ?`,
                [userId]
            );
        }
        const [transactions] = await pool.execute(
            `SELECT id, transaction_type, points_change, points_balance_after,
                    description, created_at
               FROM loyalty_transactions
              WHERE user_id = ?
              ORDER BY created_at DESC
              LIMIT 25`,
            [userId]
        );
        res.json({ loyalty, transactions });
    } catch (error) {
        logger.error('Get user loyalty error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Customer-facing gift cards (cards assigned to this customer)
app.get('/api/user/gift-cards', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [cards] = await pool.execute(
            `SELECT id, code, card_type, status, initial_balance, current_balance,
                    currency, recipient_name, recipient_email, sender_name,
                    personal_message, issued_at, expires_at, last_used_at
               FROM gift_cards
              WHERE customer_id = ? OR recipient_email = (SELECT email FROM users WHERE id = ?)
              ORDER BY status = 'active' DESC, created_at DESC`,
            [userId, userId]
        );
        res.json({ gift_cards: cards });
    } catch (error) {
        logger.error('Get user gift cards error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Customer-facing gift card balance check (no auth required - by code+pin)
app.post('/api/gift-cards/check-balance', async (req, res) => {
    try {
        const { code, pin } = req.body || {};
        if (!code) return res.status(400).json({ error: 'code is required' });
        const cleanCode = String(code).trim().toUpperCase().replace(/\s+/g, '');
        const [[card]] = await pool.execute(
            `SELECT card_type, status, initial_balance, current_balance, currency,
                    expires_at, last_used_at
               FROM gift_cards
              WHERE code = ? AND (pin IS NULL OR pin = ? OR ? IS NULL)
              LIMIT 1`,
            [cleanCode, pin || null, pin || null]
        );
        if (!card) return res.status(404).json({ error: 'Gift card not found or invalid PIN' });
        res.json({ gift_card: card });
    } catch (error) {
        logger.error('Check gift card balance error:', error);
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

        const catRaw = category != null && category !== '' ? (Array.isArray(category) ? category[0] : category) : '';
        const hcRaw =
            healthCategory != null && healthCategory !== ''
                ? Array.isArray(healthCategory)
                    ? healthCategory[0]
                    : healthCategory
                : '';
        const cat = String(catRaw || '').trim();
        const hc = String(hcRaw || '').trim();

        // Build WHERE conditions for category / health category
        // products.js sends BOTH category=X and healthCategory=X with the same slug so either taxonomy
        // can match. Using AND would require a product to satisfy pc.slug AND hc.slug simultaneously
        // (usually impossible), which hid the entire catalog.
        if (cat && hc && cat === hc) {
            whereConditions.push('(pc.slug = ? OR hc.slug = ?)');
            queryParams.push(cat, hc);
        } else {
            if (cat) {
                whereConditions.push('pc.slug = ?');
                queryParams.push(cat);
            }
            if (hc) {
                whereConditions.push('hc.slug = ?');
                queryParams.push(hc);
            }
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
                p.is_cannabis,
                p.coa_url,
                p.coa_updated_at,
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

        products.forEach((p) => {
            applyCatalogPriceFix(p);
            const catalog = catalogPrimaryImageForProduct(p);
            if (catalog) {
                p.image_url = catalog;
            } else if (p.image_url) {
                p.image_url = sanitizeLegacyProductImageUrl(p.image_url, p.slug, p.sku);
            }
        });

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

        const [countRows] = await pool.query(countQuery, queryParams);
        const totalProducts = countRows[0] ? Number(countRows[0].total) : 0;
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
                logger.error(
                    `Products fetch error (database unavailable): ${logger.formatMysqlError(error)}`
                );
                logger.warn('Note: This error will only be logged once per minute to reduce console spam.');
            } else {
                logger.error('Products fetch error:', error);
            }
        }

        // Database unreachable — 503 so clients do not treat an empty list as a valid catalog
        const dbUnavailable =
            error.code === 'ER_ACCESS_DENIED_ERROR' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'PROTOCOL_CONNECTION_LOST';
        if (dbUnavailable) {
            return res.status(503).json({
                error: 'Database unavailable',
                code: error.code,
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
        const raw = String(slug || '').trim();
        const isNumericId = /^\d+$/.test(raw);
        const idParam = isNumericId ? Number(raw) : -1;

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
            WHERE p.is_active = 1 AND (p.slug = ? OR p.id = ?)
        `, [raw, idParam]);

        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[0];
        applyCatalogPriceFix(product);

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

        const catalogPrimary = catalogPrimaryImageForProduct(product);
        if (catalogPrimary) {
            product.images = [{
                image_url: catalogPrimary,
                alt_text: product.name,
                is_primary: 1,
                sort_order: 0
            }];
        } else {
            product.images = images.map((row) => ({
                ...row,
                image_url: sanitizeLegacyProductImageUrl(row.image_url, product.slug, product.sku)
            }));
        }
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
const marketingSettingsSvc = require('./services/marketingSettings');

/** req.pool is attached at app init (right after createPool). */

/** Same role ladder as backend/routes/admin.js — kept local so marketing hub works even if admin router ordering changes. */
const requireAdminPermissionLevel = (minRole) => {
    const roleHierarchy = { staff: 1, manager: 2, admin: 3, super_admin: 4 };
    return (req, res, next) => {
        const userLevel = roleHierarchy[req.admin.role] || 0;
        const requiredLevel = roleHierarchy[minRole] || 0;
        if (userLevel < requiredLevel) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// Marketing hub (Mailchimp signup URL / headline) — registered on the main app so `/api/admin/marketing-settings`
// is never missed by the catch-all 404 (some deployments had only this path fail from the admin router).
app.get('/api/admin/marketing-settings', authenticateAdmin, requireAdminPermissionLevel('admin'), (req, res) => {
    try {
        const stored = marketingSettingsSvc.readConfig();
        const effective = marketingSettingsSvc.mergedPublicConfig();
        res.json({
            stored,
            effective,
            mailchimp: marketingSettingsSvc.mailchimpEnvStatus()
        });
    } catch (error) {
        logger.error('Get marketing-settings error:', error);
        res.status(500).json({ error: 'Failed to load marketing settings' });
    }
});

app.put('/api/admin/marketing-settings', authenticateAdmin, requireAdminPermissionLevel('admin'), (req, res) => {
    try {
        const { signupLandingUrl, headline } = req.body || {};
        const saved = marketingSettingsSvc.saveConfig({ signupLandingUrl, headline });
        res.json({
            saved,
            effective: marketingSettingsSvc.mergedPublicConfig(),
            mailchimp: marketingSettingsSvc.mailchimpEnvStatus()
        });
    } catch (error) {
        logger.error('Put marketing-settings error:', error);
        res.status(500).json({ error: 'Failed to save marketing settings' });
    }
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
app.use('/api/promotions', require('./routes/promotions'));
app.use('/api/payments', require('./routes/nmi-payments'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/edsa', edsaRoutes);
app.use('/api/menu', require('./routes/menu'));
app.use('/api/admin/customers', require('./routes/admin-customers'));
app.use('/api/admin/gift-cards', require('./routes/admin-gift-cards'));
app.use('/api/admin', adminRoutes);
app.use('/api/payment-cards', paymentCardsRoutes);
app.use('/api/octopos', require('./routes/octopos'));
// Customer-facing account API (addresses CRUD, password change, order detail,
// wishlist collections + items). Mounted AFTER the inline /api/user/* handlers
// (profile, orders list, addresses GET, loyalty, gift-cards) defined above so
// those keep working — express tries router routes only if no inline match.
app.use('/api/user', require('./routes/user')({ pool, authenticateToken, logger }));

app.use('/api', publicRoutes);

// Error handling middleware (fourth arg required so Express recognizes this as an error handler)
// eslint-disable-next-line no-unused-vars -- Express requires arity-4; we never forward to `next`
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

// Start server (apply DB patches first so API queries match current schema)
(async () => {
    try {
        await ensureProductSchema(pool);
    } catch (e) {
        logger.error(`ensureProductSchema failed: ${logger.formatMysqlError(e)}`);
    }

    try {
        await ensureUserPasswordResetSchema(pool);
    } catch (e) {
        logger.error(`ensureUserPasswordResetSchema failed: ${logger.formatMysqlError(e)}`);
    }

    try {
        await ensureEdsaBookingSchema(pool);
    } catch (e) {
        logger.error(`ensureEdsaBookingSchema failed: ${logger.formatMysqlError(e)}`);
    }

    try {
        await fs.mkdir(uploadsDir, { recursive: true });
    } catch (e) {
        logger.warn(`Could not create uploads directory: ${logger.formatMysqlError(e)}`);
    }

    try {
        await ensureProductCatalogImages(rootPath, logger);
    } catch (e) {
        logger.error(`ensureProductCatalogImages failed: ${logger.formatMysqlError(e)}`);
    }

    const stopOctoposAutoSync = startOctoposAutoSync(pool);
    const stopTaxReserveScheduler = startTaxReserveScheduler(pool);

    const server = app.listen(PORT, () => {
        console.log(`H&M Herbs API Server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:8000'}`);
        console.log(
            'Checkout API: orders INSERT v2 (order_number + shipping_address_line_1); NMI skip-preflight=' +
                (process.env.NMI_SKIP_TOKENIZATION_PREFLIGHT || '0')
        );
        logger.info(
            'Account SQL v3: GET /api/user/orders uses total_amount + item subquery; ' +
            'wishlist items JOIN product_images (not products.image_url). If errors still cite o.total or p.image_url, restart the server from backend/ after save.'
        );
        if (process.env.NODE_ENV !== 'production') {
            logger.info(
                'Checkout CSP: restart this Node process after changing helmet in server.js (e.g. Apple Pay script + NMI styles). Stale processes serve old Content-Security-Policy headers.'
            );
        }
        if (typeof stopOctoposAutoSync === 'function' && process.env.OCTOPOS_AUTO_SYNC_ENABLED === 'true') {
            process.on('SIGTERM', () => stopOctoposAutoSync());
            process.on('SIGINT', () => stopOctoposAutoSync());
        }
        if (typeof stopTaxReserveScheduler === 'function' && process.env.TAX_LEDGER_SYNC_ENABLED === 'true') {
            process.on('SIGTERM', () => stopTaxReserveScheduler());
            process.on('SIGINT', () => stopTaxReserveScheduler());
        }
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
})();

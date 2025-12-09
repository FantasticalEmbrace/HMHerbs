// Enhanced Security Middleware for HM Herbs E-commerce
// Comprehensive security headers and protection for e-commerce applications

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Enhanced Content Security Policy for e-commerce
 */
const getCSPDirectives = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
        defaultSrc: ["'self'"],
        scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Required for some e-commerce widgets
            "'unsafe-eval'", // Required for some payment processors
            "https://js.stripe.com",
            "https://checkout.stripe.com",
            "https://www.google.com",
            "https://www.gstatic.com",
            "https://www.googletagmanager.com",
            "https://www.google-analytics.com",
            "https://ssl.google-analytics.com",
            "https://connect.facebook.net",
            "https://www.facebook.com"
        ],
        styleSrc: [
            "'self'",
            "'unsafe-inline'", // Required for dynamic styles
            "https://fonts.googleapis.com",
            "https://use.fontawesome.com",
            "https://maxcdn.bootstrapcdn.com"
        ],
        fontSrc: [
            "'self'",
            "https://fonts.gstatic.com",
            "https://use.fontawesome.com",
            "https://maxcdn.bootstrapcdn.com",
            "data:"
        ],
        imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https:",
            "http:", // Allow HTTP images for product images from various sources
            "https://www.google-analytics.com",
            "https://ssl.google-analytics.com",
            "https://www.facebook.com",
            "https://www.google.com"
        ],
        connectSrc: [
            "'self'",
            "https://api.stripe.com",
            "https://checkout.stripe.com",
            "https://www.google-analytics.com",
            "https://ssl.google-analytics.com",
            "https://stats.g.doubleclick.net",
            "https://www.facebook.com",
            "https://connect.facebook.net"
        ],
        frameSrc: [
            "'self'",
            "https://js.stripe.com",
            "https://checkout.stripe.com",
            "https://www.google.com",
            "https://www.facebook.com"
        ],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "data:", "blob:"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null
    };
};

/**
 * Security headers configuration
 */
const securityHeaders = () => {
    return helmet({
        contentSecurityPolicy: {
            directives: getCSPDirectives(),
            reportOnly: process.env.NODE_ENV === 'development'
        },
        crossOriginEmbedderPolicy: false, // Disabled for e-commerce compatibility
        crossOriginResourcePolicy: { policy: "cross-origin" },
        dnsPrefetchControl: { allow: false },
        frameguard: { action: 'deny' },
        hidePoweredBy: true,
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        },
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: false,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        xssFilter: true
    });
};

/**
 * Rate limiting configurations
 */
const createRateLimiter = (windowMs, max, message, skipSuccessfulRequests = false) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            error: 'Too many requests',
            message,
            retryAfter: Math.ceil(windowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests,
        handler: (req, res) => {
            logger.logError('Rate limit exceeded', new Error('Rate limit exceeded'), {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                path: req.path,
                method: req.method
            });
            
            res.status(429).json({
                error: 'Too many requests',
                message,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
    });
};

// General API rate limiting
const generalLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // limit each IP to 100 requests per windowMs
    'Too many requests from this IP, please try again later.'
);

// Strict rate limiting for authentication endpoints
const authLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // limit each IP to 5 requests per windowMs
    'Too many authentication attempts, please try again later.',
    true // skip successful requests
);

// Rate limiting for password reset
const passwordResetLimiter = createRateLimiter(
    60 * 60 * 1000, // 1 hour
    3, // limit each IP to 3 requests per hour
    'Too many password reset attempts, please try again later.'
);

// Rate limiting for contact/email endpoints
const contactLimiter = createRateLimiter(
    60 * 60 * 1000, // 1 hour
    10, // limit each IP to 10 requests per hour
    'Too many contact form submissions, please try again later.'
);

// Rate limiting for order creation
const orderLimiter = createRateLimiter(
    60 * 1000, // 1 minute
    5, // limit each IP to 5 orders per minute
    'Too many order attempts, please wait before trying again.'
);

/**
 * IP whitelist middleware for admin endpoints
 */
const adminIPWhitelist = (req, res, next) => {
    const allowedIPs = process.env.ADMIN_ALLOWED_IPS ? 
        process.env.ADMIN_ALLOWED_IPS.split(',').map(ip => ip.trim()) : 
        [];
    
    if (allowedIPs.length === 0) {
        // No IP restrictions configured
        return next();
    }
    
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!allowedIPs.includes(clientIP)) {
        logger.logError('Admin access denied - IP not whitelisted', new Error('IP not whitelisted'), {
            ip: clientIP,
            userAgent: req.get('User-Agent'),
            path: req.path
        });
        
        return res.status(403).json({
            error: 'Access denied',
            message: 'Your IP address is not authorized for admin access'
        });
    }
    
    next();
};

/**
 * Request sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
    // Remove null bytes and other dangerous characters
    const sanitize = (obj) => {
        if (typeof obj === 'string') {
            return obj.replace(/\0/g, '').trim();
        } else if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    obj[key] = sanitize(obj[key]);
                }
            }
        }
        return obj;
    };
    
    if (req.body) {
        req.body = sanitize(req.body);
    }
    
    if (req.query) {
        req.query = sanitize(req.query);
    }
    
    if (req.params) {
        req.params = sanitize(req.params);
    }
    
    next();
};

/**
 * Security logging middleware
 */
const securityLogger = (req, res, next) => {
    // Log suspicious patterns
    const suspiciousPatterns = [
        /(\<script\>|\<\/script\>)/i,
        /(union\s+select|drop\s+table|insert\s+into)/i,
        /(\.\.\/)|(\.\.\\)/,
        /(exec\s*\(|eval\s*\()/i,
        /(<iframe|<object|<embed)/i
    ];
    
    const checkSuspicious = (value) => {
        if (typeof value === 'string') {
            return suspiciousPatterns.some(pattern => pattern.test(value));
        }
        return false;
    };
    
    let suspicious = false;
    
    // Check query parameters
    for (const key in req.query) {
        if (checkSuspicious(req.query[key])) {
            suspicious = true;
            break;
        }
    }
    
    // Check body parameters
    if (req.body && typeof req.body === 'object') {
        for (const key in req.body) {
            if (checkSuspicious(req.body[key])) {
                suspicious = true;
                break;
            }
        }
    }
    
    if (suspicious) {
        logger.logError('Suspicious request detected', new Error('Suspicious patterns in request'), {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            method: req.method,
            query: req.query,
            body: req.body
        });
    }
    
    next();
};

module.exports = {
    securityHeaders,
    generalLimiter,
    authLimiter,
    passwordResetLimiter,
    contactLimiter,
    orderLimiter,
    adminIPWhitelist,
    sanitizeInput,
    securityLogger
};

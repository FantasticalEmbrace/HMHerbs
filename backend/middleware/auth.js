// Enhanced Authentication Middleware for HM Herbs
// Secure JWT token validation with proper error handling

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Validate JWT_SECRET on module load - fail fast if missing
if (!process.env.JWT_SECRET) {
    logger.error('CRITICAL: JWT_SECRET environment variable is not set');
    console.error('CRITICAL: JWT_SECRET environment variable is not set');
    process.exit(1); // Terminate application - security requirement
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token with proper expiration
 */
const generateToken = (payload) => {
    try {
        return jwt.sign(payload, JWT_SECRET, { 
            expiresIn: JWT_EXPIRES_IN,
            issuer: 'hmherbs-api',
            audience: 'hmherbs-client'
        });
    } catch (error) {
        logger.error('Token generation failed', error);
        throw new Error('Token generation failed');
    }
};

/**
 * Verify JWT token with comprehensive error handling
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET, {
            issuer: 'hmherbs-api',
            audience: 'hmherbs-client'
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expired');
        } else if (error.name === 'JsonWebTokenError') {
            throw new Error('Invalid token');
        } else if (error.name === 'NotBeforeError') {
            throw new Error('Token not active');
        } else {
            logger.error('Token verification failed', error);
            throw new Error('Token verification failed');
        }
    }
};

/**
 * Admin authentication middleware
 */
const authenticateAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Access denied',
                message: 'No valid authorization header provided'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Access denied',
                message: 'No token provided'
            });
        }

        const decoded = verifyToken(token);
        
        if (!decoded.isAdmin) {
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'Admin privileges required'
            });
        }

        // Add user info to request
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            isAdmin: decoded.isAdmin
        };

        next();
    } catch (error) {
        logger.logError('Admin authentication failed', error, { 
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path
        });

        if (error.message === 'Token expired') {
            return res.status(401).json({ 
                error: 'Token expired',
                message: 'Please log in again'
            });
        } else if (error.message === 'Invalid token') {
            return res.status(401).json({ 
                error: 'Invalid token',
                message: 'Please log in again'
            });
        } else {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'Please log in again'
            });
        }
    }
};

/**
 * User authentication middleware
 */
const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Access denied',
                message: 'No valid authorization header provided'
            });
        }

        const token = authHeader.substring(7);
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Access denied',
                message: 'No token provided'
            });
        }

        const decoded = verifyToken(token);

        // Add user info to request
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            isAdmin: decoded.isAdmin || false
        };

        next();
    } catch (error) {
        logger.logError('User authentication failed', error, { 
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path
        });

        if (error.message === 'Token expired') {
            return res.status(401).json({ 
                error: 'Token expired',
                message: 'Please log in again'
            });
        } else if (error.message === 'Invalid token') {
            return res.status(401).json({ 
                error: 'Invalid token',
                message: 'Please log in again'
            });
        } else {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'Please log in again'
            });
        }
    }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(); // No token provided, continue without auth
        }

        const token = authHeader.substring(7);
        
        if (!token) {
            return next(); // No token provided, continue without auth
        }

        const decoded = verifyToken(token);

        // Add user info to request if token is valid
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            isAdmin: decoded.isAdmin || false
        };

        next();
    } catch (error) {
        // Log the error but don't fail the request for optional auth
        logger.logError('Optional authentication failed', error, { 
            ip: req.ip,
            path: req.path
        });
        next(); // Continue without authentication
    }
};

module.exports = {
    generateToken,
    verifyToken,
    authenticateAdmin,
    authenticateUser,
    optionalAuth
};

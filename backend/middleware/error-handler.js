// Comprehensive Error Handling Middleware for HM Herbs
// Centralized error handling with proper logging and user-friendly responses

const logger = require('../utils/logger');

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.name = this.constructor.name;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Database error handler
 */
const handleDatabaseError = (error) => {
    let message = 'Database operation failed';
    let statusCode = 500;

    // MySQL specific error codes
    switch (error.code) {
        case 'ER_DUP_ENTRY':
            message = 'Duplicate entry - this record already exists';
            statusCode = 409;
            break;
        case 'ER_NO_REFERENCED_ROW_2':
            message = 'Referenced record does not exist';
            statusCode = 400;
            break;
        case 'ER_ROW_IS_REFERENCED_2':
            message = 'Cannot delete - record is referenced by other data';
            statusCode = 409;
            break;
        case 'ER_DATA_TOO_LONG':
            message = 'Data too long for field';
            statusCode = 400;
            break;
        case 'ER_BAD_NULL_ERROR':
            message = 'Required field cannot be null';
            statusCode = 400;
            break;
        case 'ECONNREFUSED':
            message = 'Database connection refused';
            statusCode = 503;
            break;
        case 'ETIMEDOUT':
            message = 'Database operation timed out';
            statusCode = 504;
            break;
        default:
            if (error.sqlMessage) {
                // Log the actual SQL error but don't expose it to users
                logger.error('SQL Error', { 
                    code: error.code, 
                    sqlMessage: error.sqlMessage,
                    sql: error.sql 
                });
            }
            break;
    }

    return new AppError(message, statusCode);
};

/**
 * JWT error handler
 */
const handleJWTError = (error) => {
    let message = 'Authentication failed';
    let statusCode = 401;

    switch (error.name) {
        case 'TokenExpiredError':
            message = 'Token has expired - please log in again';
            break;
        case 'JsonWebTokenError':
            message = 'Invalid token - please log in again';
            break;
        case 'NotBeforeError':
            message = 'Token not active yet';
            break;
        default:
            message = 'Token verification failed';
            break;
    }

    return new AppError(message, statusCode);
};

/**
 * Validation error handler
 */
const handleValidationError = (error) => {
    if (error.details && Array.isArray(error.details)) {
        // Express-validator errors
        const messages = error.details.map(detail => detail.message);
        return new AppError(`Validation failed: ${messages.join(', ')}`, 400);
    }
    
    return new AppError('Validation failed', 400);
};

/**
 * Multer error handler (file upload errors)
 */
const handleMulterError = (error) => {
    let message = 'File upload failed';
    let statusCode = 400;

    switch (error.code) {
        case 'LIMIT_FILE_SIZE':
            message = 'File too large';
            break;
        case 'LIMIT_FILE_COUNT':
            message = 'Too many files';
            break;
        case 'LIMIT_UNEXPECTED_FILE':
            message = 'Unexpected file field';
            break;
        case 'LIMIT_PART_COUNT':
            message = 'Too many parts';
            break;
        case 'LIMIT_FIELD_KEY':
            message = 'Field name too long';
            break;
        case 'LIMIT_FIELD_VALUE':
            message = 'Field value too long';
            break;
        case 'LIMIT_FIELD_COUNT':
            message = 'Too many fields';
            break;
        case 'MISSING_FIELD_NAME':
            message = 'Field name missing';
            break;
        default:
            break;
    }

    return new AppError(message, statusCode);
};

/**
 * Development error response
 */
const sendErrorDev = (err, req, res) => {
    // Log the full error in development
    logger.error('Development Error', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    res.status(err.statusCode || 500).json({
        status: 'error',
        error: err.message,
        message: err.message,
        stack: err.stack,
        details: {
            url: req.originalUrl,
            method: req.method,
            timestamp: new Date().toISOString()
        }
    });
};

/**
 * Production error response
 */
const sendErrorProd = (err, req, res) => {
    // Log error details for monitoring
    logger.logError('Production Error', err, {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        adminId: req.admin?.id
    });

    // Only send operational errors to client in production
    if (err.isOperational) {
        res.status(err.statusCode || 500).json({
            status: 'error',
            error: err.message,
            message: err.message,
            timestamp: new Date().toISOString()
        });
    } else {
        // Programming or unknown errors - don't leak details
        res.status(500).json({
            status: 'error',
            error: 'Internal server error',
            message: 'Something went wrong. Please try again later.',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Main error handling middleware
 */
const globalErrorHandler = (err, req, res, next) => {
    // Set default values
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (err.code && (err.code.startsWith('ER_') || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')) {
        error = handleDatabaseError(err);
    } else if (err.name && (err.name.includes('JsonWebToken') || err.name.includes('Token'))) {
        error = handleJWTError(err);
    } else if (err.name === 'ValidationError' || (err.details && Array.isArray(err.details))) {
        error = handleValidationError(err);
    } else if (err.code && err.code.startsWith('LIMIT_')) {
        error = handleMulterError(err);
    } else if (err.name === 'CastError') {
        error = new AppError('Invalid data format', 400);
    } else if (err.code === 11000) {
        error = new AppError('Duplicate field value', 409);
    }

    // Send error response based on environment
    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(error, req, res);
    } else {
        sendErrorProd(error, req, res);
    }
};

/**
 * Async error wrapper - catches async errors and passes to error handler
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res, next) => {
    const err = new AppError(`Route ${req.originalUrl} not found`, 404);
    next(err);
};

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = (server, pool) => {
    const shutdown = (signal) => {
        logger.info(`Received ${signal}. Starting graceful shutdown...`);
        
        server.close(() => {
            logger.info('HTTP server closed');
            
            if (pool) {
                pool.end(() => {
                    logger.info('Database pool closed');
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        });

        // Force close after 30 seconds
        setTimeout(() => {
            logger.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

module.exports = {
    AppError,
    globalErrorHandler,
    catchAsync,
    notFoundHandler,
    gracefulShutdown
};

// Enhanced Input Validation Middleware for HM Herbs
// Comprehensive validation using express-validator

const { body, param, query, validationResult } = require('express-validator');
const validator = require('validator');

// Custom validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// User registration validation
const userRegistrationValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters'),

  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),

  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),

  body('phone')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number'),

  handleValidationErrors
];

// User login validation
const userLoginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required'),

  handleValidationErrors
];

// Product validation
const productValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Product name must be between 1 and 255 characters')
    .escape(),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description must be less than 5000 characters')
    .escape(),

  body('price')
    .isFloat({ min: 0, max: 999999.99 })
    .withMessage('Price must be a valid number between 0 and 999999.99'),

  body('sku')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('SKU must be between 1 and 100 characters')
    .matches(/^[A-Za-z0-9\-_]+$/)
    .withMessage('SKU can only contain letters, numbers, hyphens, and underscores'),

  body('category_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),

  body('brand_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Brand ID must be a positive integer'),

  body('inventory_quantity')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Inventory quantity must be a non-negative integer'),

  body('weight')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Weight must be less than 50 characters'),

  body('ingredients')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Ingredients must be less than 2000 characters')
    .escape(),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean value'),

  handleValidationErrors
];

// Order validation
const orderValidation = [
  body('customer_email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid customer email'),

  body('customer_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Customer name must be between 1 and 100 characters')
    .escape(),

  body('customer_phone')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number'),

  body('shipping_address')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Shipping address must be between 1 and 500 characters')
    .escape(),

  body('items')
    .isArray({ min: 1 })
    .withMessage('Order must contain at least one item'),

  body('items.*.product_id')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer'),

  body('items.*.quantity')
    .isInt({ min: 1, max: 999 })
    .withMessage('Quantity must be between 1 and 999'),

  body('items.*.price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),

  body('total_amount')
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a positive number'),

  handleValidationErrors
];

// EDSA booking validation
const edsaBookingValidation = [
  body('first_name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes')
    .escape(),

  body('last_name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes')
    .escape(),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('phone')
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number'),

  body('preferred_date')
    .isISO8601({ strict: true })
    .withMessage('Preferred date must be in YYYY-MM-DD format')
    .custom((value) => {
      const date = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        throw new Error('Preferred date cannot be in the past');
      }
      return true;
    }),

  body('preferred_time')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Preferred time must be in HH:MM format'),

  body('health_concerns')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Health concerns must be less than 1000 characters')
    .escape(),

  body('current_medications')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Current medications must be less than 1000 characters')
    .escape(),

  body('alternative_date')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('Alternative date must be in YYYY-MM-DD format'),

  body('alternative_time')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Alternative time must be in HH:MM format'),

  handleValidationErrors
];

// Email campaign validation
const emailCampaignValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('first_name')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('First name must be less than 50 characters')
    .escape(),

  body('last_name')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Last name must be less than 50 characters')
    .escape(),

  body('campaign_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Campaign ID must be a positive integer'),

  handleValidationErrors
];

// ID parameter validation
const idParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),

  handleValidationErrors
];

// Pagination query validation
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be between 1 and 1000'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('search')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Search term must be less than 255 characters')
    .escape(),

  handleValidationErrors
];

// Add to cart validation
const addToCartValidation = [
  body('productId')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer'),

  body('variantId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Variant ID must be a positive integer'),

  body('quantity')
    .optional()
    .isInt({ min: 1, max: 999 })
    .withMessage('Quantity must be between 1 and 999'),

  handleValidationErrors
];

// Update cart validation
const updateCartValidation = [
  body('quantity')
    .isInt({ min: 0, max: 999 })
    .withMessage('Quantity must be between 0 and 999'),

  handleValidationErrors
];

// Admin login validation
const adminLoginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required'),

  handleValidationErrors
];

// Settings validation
const settingsValidation = [
  body('key_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Key name must be between 1 and 100 characters'),

  body('value')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Value must be less than 5000 characters'),

  handleValidationErrors
];

// Inventory adjustment validation
const inventoryAdjustmentValidation = [
  body('product_id')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer'),

  body('quantity')
    .isInt()
    .withMessage('Quantity must be an integer'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters')
    .escape(),

  handleValidationErrors
];

// Vendor validation
const vendorValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Vendor name must be between 1 and 255 characters')
    .escape(),

  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('phone')
    .optional()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number'),

  body('address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters')
    .escape(),

  handleValidationErrors
];

// Common validations (for reuse)
const commonValidations = {
  idParam: idParamValidation,
  pagination: paginationValidation
};

// Custom sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Recursively sanitize all string inputs
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove potential XSS patterns
        obj[key] = validator.escape(obj[key].trim());
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }

  next();
};

module.exports = {
  userRegistrationValidation,
  userLoginValidation,
  adminLoginValidation,
  productValidation,
  orderValidation,
  edsaBookingValidation,
  emailCampaignValidation,
  idParamValidation,
  paginationValidation,
  addToCartValidation,
  updateCartValidation,
  settingsValidation,
  inventoryAdjustmentValidation,
  vendorValidation,
  commonValidations,
  sanitizeInput,
  handleValidationErrors
};

// Octopos API Routes
// Proxy routes for Octopos POS system integration
// All endpoints from Octopos API are available through this router

const express = require('express');
const router = express.Router();
const OctoposService = require('../services/octopos');
const logger = require('../utils/logger');

// Middleware to initialize Octopos service with credentials from request
// Credentials can come from:
// 1. Request body (for authentication endpoint)
// 2. Request headers (X-Octopos-BaseUrl, X-Octopos-Token)
// 3. Environment variables (OCTOPOS_API_URL, OCTOPOS_TOKEN)
function getOctoposService(req) {
    const baseUrl = req.headers['x-octopos-baseurl'] || 
                   req.body?.baseUrl || 
                   process.env.OCTOPOS_API_URL || '';
    
    const token = req.headers['x-octopos-token'] || 
                 req.body?.token || 
                 process.env.OCTOPOS_TOKEN || null;

    const service = new OctoposService(baseUrl, token);
    return service;
}

// Helper function to send response
function sendResponse(res, result) {
    if (result.success) {
        res.status(result.status || 200).json(result.data);
    } else {
        res.status(result.status || 500).json(result.error || { message: 'Request failed' });
    }
}

// ==================== ROOT ENDPOINT ====================

/**
 * GET /api/octopos
 * Get API information and available endpoints
 */
router.get('/', (req, res) => {
    res.status(200).json({
        service: 'Octopos API Integration',
        version: '1.0',
        status: 'ready',
        description: 'Proxy service for Octopos POS system API - Fully implemented and ready to use',
        note: 'This is a POS (Point of Sale) system integration. You need your Octopos POS server API URL and account credentials.',
        setupRequired: {
            message: 'Account setup required before use',
            steps: [
                '1. Set up your Octopos POS system account',
                '2. Contact Octopos vendor/support for API access',
                '3. Obtain API endpoint URL and credentials',
                '4. Test connection using /api/octopos/authenticate'
            ]
        },
        findingApiUrl: {
            localNetwork: 'If POS is on your network, use the server IP (e.g., http://192.168.1.100)',
            posSettings: 'Check your POS system Settings → API/Integration settings',
            vendorDocs: 'Check Octopos documentation or contact vendor support',
            commonFormats: [
                'http://[POS-SERVER-IP]:[PORT]',
                'http://192.168.1.XXX',
                'https://[POS-DOMAIN]/api'
            ]
        },
        endpoints: {
            authentication: 'POST /api/octopos/authenticate',
            employees: 'GET, POST, PUT /api/octopos/employees',
            categories: 'GET, POST, PUT /api/octopos/categories',
            products: 'GET, POST, PUT /api/octopos/products',
            orders: 'GET, POST /api/octopos/orders',
            inventory: 'POST /api/octopos/inventory',
            // ... and 40+ more endpoints
        },
        documentation: {
            fullApiDocs: 'See OCTOPOS_INTEGRATION.md for full API documentation',
            setupGuide: 'See OCTOPOS_SETUP_GUIDE.md for setup instructions',
            testPage: 'Visit http://localhost:3001/test-octopos.html to test the API'
        }
    });
});

// ==================== AUTHENTICATION ====================

/**
 * GET /api/octopos/authenticate
 * Get authentication endpoint information
 */
router.get('/authenticate', (req, res) => {
    res.status(200).json({
        message: 'Octopos Authentication Endpoint',
        method: 'POST',
        description: 'Authenticate with Octopos POS system and get access token',
        required_fields: ['email', 'password'],
        optional_fields: ['baseUrl'],
        note: 'baseUrl is your Octopos POS server API URL (e.g., http://192.168.1.100 or the URL provided by your POS vendor)',
        example: {
            email: 'your-pos-email@example.com',
            password: 'your-pos-password',
            baseUrl: 'http://192.168.1.100' // Your POS server IP or vendor-provided URL
        },
        findingBaseUrl: {
            step1: 'Check your POS system Settings → API/Integration',
            step2: 'Look for the server IP address in POS network settings',
            step3: 'Check Octopos documentation for API endpoint URL',
            step4: 'Contact Octopos vendor support if needed'
        }
    });
});

/**
 * POST /api/octopos/authenticate
 * Authenticate with Octopos and get access token
 */
router.post('/authenticate', async (req, res) => {
    try {
        const { email, password, baseUrl } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                error: { 
                    message: ['Email and password are required.'], 
                    code: 400 
                } 
            });
        }

        // Validate baseUrl is provided
        const apiBaseUrl = baseUrl || process.env.OCTOPOS_API_URL;
        if (!apiBaseUrl || apiBaseUrl.trim() === '') {
            return res.status(400).json({ 
                error: { 
                    message: 'Octopos API base URL is required. Please provide baseUrl in the request body or set OCTOPOS_API_URL environment variable.',
                    code: 400 
                } 
            });
        }

        const service = new OctoposService(apiBaseUrl);
        const result = await service.authenticate(email, password);

        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos authentication error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== EMPLOYEES ====================

/**
 * GET /api/octopos/employees
 * List all employees
 */
router.get('/employees', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getEmployees(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get employees error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/employees
 * Create a new employee
 */
router.post('/employees', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createEmployee(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create employee error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/employees/:id
 * Get employee by ID
 */
router.get('/employees/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getEmployeeById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get employee error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/employees/:id
 * Update employee
 */
router.put('/employees/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateEmployee(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update employee error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== CATEGORIES ====================

/**
 * GET /api/octopos/categories
 * List all categories
 */
router.get('/categories', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getCategories(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get categories error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/categories
 * Create a new category
 */
router.post('/categories', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createCategory(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create category error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/categories/:id
 * Get category by ID
 */
router.get('/categories/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getCategoryById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get category error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/categories/:id
 * Update category
 */
router.put('/categories/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateCategory(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update category error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/categories/copy
 * Copy categories
 */
router.post('/categories/copy', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.copyCategories(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos copy categories error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== DEPARTMENTS ====================

/**
 * GET /api/octopos/departments
 * List all departments
 */
router.get('/departments', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getDepartments(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get departments error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/departments
 * Create a new department
 */
router.post('/departments', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createDepartment(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create department error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/departments/:id
 * Get department by ID
 */
router.get('/departments/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getDepartmentById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get department error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/departments/:id
 * Update department
 */
router.put('/departments/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateDepartment(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update department error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== MODIFIER SETS ====================

/**
 * GET /api/octopos/modifier-sets
 * List all modifier sets
 */
router.get('/modifier-sets', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getModifierSets(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get modifier sets error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/modifier-sets
 * Create a new modifier set
 */
router.post('/modifier-sets', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createModifierSet(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create modifier set error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/modifier-sets/:id
 * Get modifier set by ID
 */
router.get('/modifier-sets/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getModifierSetById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get modifier set error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/modifier-sets/:id
 * Update modifier set
 */
router.put('/modifier-sets/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateModifierSet(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update modifier set error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== PRODUCTS ====================

/**
 * POST /api/octopos/products/filter
 * Get products by filter
 */
router.post('/products/filter', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getProductsByFilter(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get products by filter error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/products/filter/single-location
 * Get products by filter for single location
 */
router.post('/products/filter/single-location', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getProductsByFilterSingleLocation(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get products by filter single location error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/products
 * List all products
 */
router.get('/products', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getProducts(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get products error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/products
 * Create a new product
 */
router.post('/products', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createProduct(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create product error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/products/:id
 * Get product by ID
 */
router.get('/products/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getProductById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get product error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/products/:id
 * Update product
 */
router.put('/products/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateProduct(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update product error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/products/search/term
 * Search products by term
 */
router.get('/products/search/term', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.searchProducts(req.query.term, req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos search products error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== TAXES ====================

/**
 * GET /api/octopos/taxes
 * List all taxes
 */
router.get('/taxes', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getTaxes(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get taxes error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/taxes
 * Create a new tax
 */
router.post('/taxes', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createTax(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create tax error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/taxes/:id
 * Get tax by ID
 */
router.get('/taxes/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getTaxById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get tax error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/taxes/:id
 * Update tax
 */
router.put('/taxes/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateTax(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update tax error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== VENDORS ====================

/**
 * GET /api/octopos/vendors
 * List all vendors
 */
router.get('/vendors', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getVendors(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get vendors error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/vendors
 * Create a new vendor
 */
router.post('/vendors', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createVendor(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create vendor error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/vendors/:id
 * Get vendor by ID
 */
router.get('/vendors/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getVendorById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get vendor error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/vendors/:id
 * Update vendor
 */
router.put('/vendors/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateVendor(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update vendor error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== PURCHASE ORDERS ====================

/**
 * POST /api/octopos/purchase-orders
 * Create a purchase order
 */
router.post('/purchase-orders', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createPurchaseOrder(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create purchase order error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/purchase-orders
 * List all purchase orders
 */
router.get('/purchase-orders', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getPurchaseOrders(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get purchase orders error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/purchase-orders/:id
 * Get purchase order by ID
 */
router.get('/purchase-orders/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getPurchaseOrderById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get purchase order error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/purchase-orders/:id
 * Update purchase order
 */
router.put('/purchase-orders/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updatePurchaseOrder(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update purchase order error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/purchase-orders/:id/lines
 * Update purchase order lines
 */
router.put('/purchase-orders/:id/lines', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updatePurchaseOrderLines(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update purchase order lines error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== REWARD CARDS ====================

/**
 * GET /api/octopos/reward-cards
 * List all reward cards
 */
router.get('/reward-cards', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRewardCards(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get reward cards error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/reward-cards
 * Create a new reward card
 */
router.post('/reward-cards', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createRewardCard(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create reward card error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/reward-cards/:id
 * Get reward card by ID
 */
router.get('/reward-cards/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRewardCardById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get reward card error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/reward-cards/:id
 * Update reward card
 */
router.put('/reward-cards/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateRewardCard(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update reward card error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== REWARDS ====================

/**
 * GET /api/octopos/rewards
 * List all rewards
 */
router.get('/rewards', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRewards(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get rewards error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/rewards
 * Create a new reward
 */
router.post('/rewards', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createReward(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create reward error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/rewards/:id
 * Get reward by ID
 */
router.get('/rewards/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRewardById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get reward error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/rewards/:id
 * Update reward
 */
router.put('/rewards/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateReward(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update reward error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== ORDERS ====================

/**
 * GET /api/octopos/orders/:orderNumber
 * Get order by order number
 */
router.get('/orders/:orderNumber', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getOrderByNumber(req.params.orderNumber);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get order error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/orders/filter
 * Get orders by filter
 */
router.post('/orders/filter', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getOrdersByFilter(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get orders by filter error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== REFUNDS ====================

/**
 * GET /api/octopos/refunds
 * Get refund by refund ID or order number
 */
router.get('/refunds', async (req, res) => {
    try {
        const service = getOctoposService(req);
        let result;
        
        if (req.query.refund_id) {
            result = await service.getRefundById(req.query.refund_id);
        } else if (req.query.order_number) {
            result = await service.getRefundByOrderNumber(req.query.order_number);
        } else {
            return res.status(400).json({ 
                error: { message: 'refund_id or order_number query parameter is required', code: 400 } 
            });
        }
        
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get refund error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/refunds/filter
 * Get refunds by filter
 */
router.post('/refunds/filter', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRefundsByFilter(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get refunds by filter error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/refunds/without-orders
 * Create refund without order
 */
router.post('/refunds/without-orders', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createRefundWithoutOrder(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create refund without order error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/refunds/without-orders/:id
 * Get refund without order by ID
 */
router.get('/refunds/without-orders/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRefundWithoutOrderById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get refund without order error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/refunds/bottle-deposit
 * Create bottle deposit refund
 */
router.post('/refunds/bottle-deposit', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createBottleDepositRefund(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create bottle deposit refund error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/refunds/bottle-deposit/:id
 * Get bottle deposit refund by ID
 */
router.get('/refunds/bottle-deposit/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getBottleDepositRefundById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get bottle deposit refund error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== INVENTORY ====================

/**
 * POST /api/octopos/inventory/add
 * Add inventory
 */
router.post('/inventory/add', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.addInventory(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos add inventory error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/inventory/subtract
 * Subtract inventory
 */
router.post('/inventory/subtract', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.subtractInventory(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos subtract inventory error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/inventory/recount
 * Recount inventory
 */
router.post('/inventory/recount', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.recountInventory(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos recount inventory error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== PROMOTIONS ====================

/**
 * GET /api/octopos/promotions/types
 * Get promotion types
 */
router.get('/promotions/types', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getPromotionTypes();
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get promotion types error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/promotions
 * List all promotions
 */
router.get('/promotions', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getPromotions(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get promotions error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/promotions
 * Create a new promotion
 */
router.post('/promotions', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createPromotion(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create promotion error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/promotions/:id
 * Get promotion by ID
 */
router.get('/promotions/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getPromotionById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get promotion error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/promotions/:id
 * Update promotion
 */
router.put('/promotions/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updatePromotion(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update promotion error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== COUPONS ====================

/**
 * GET /api/octopos/coupons
 * List all coupons
 */
router.get('/coupons', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getCoupons(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get coupons error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/coupons
 * Create a new coupon
 */
router.post('/coupons', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createCoupon(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create coupon error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/coupons/:id
 * Get coupon by ID
 */
router.get('/coupons/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getCouponById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get coupon error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * PUT /api/octopos/coupons/:id
 * Update coupon
 */
router.put('/coupons/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.updateCoupon(req.params.id, req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos update coupon error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== WEBHOOKS ====================

/**
 * GET /api/octopos/webhooks
 * List all webhooks
 */
router.get('/webhooks', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getWebhooks(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get webhooks error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * POST /api/octopos/webhooks
 * Create a new webhook
 */
router.post('/webhooks', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.createWebhook(req.body);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos create webhook error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/webhooks/:id
 * Get webhook by ID
 */
router.get('/webhooks/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getWebhookById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get webhook error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/webhooks/types
 * Get webhook types
 */
router.get('/webhooks/types', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getWebhookTypes();
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get webhook types error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== ROLES & PERMISSIONS ====================

/**
 * GET /api/octopos/roles
 * List all roles
 */
router.get('/roles', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRoles(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get roles error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/roles/:id
 * Get role by ID
 */
router.get('/roles/:id', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRoleById(req.params.id);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get role error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/permissions
 * Get permissions
 */
router.get('/permissions', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getPermissions();
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get permissions error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

/**
 * GET /api/octopos/reward-points/calculation-types
 * Get reward points calculation types
 */
router.get('/reward-points/calculation-types', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getRewardPointsCalculationTypes();
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get reward points calculation types error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

// ==================== TARE CONTAINERS ====================

/**
 * GET /api/octopos/tare-containers
 * List all tare containers
 */
router.get('/tare-containers', async (req, res) => {
    try {
        const service = getOctoposService(req);
        const result = await service.getTareContainers(req.query);
        sendResponse(res, result);
    } catch (error) {
        logger.error('Octopos get tare containers error:', error);
        res.status(500).json({ error: { message: error.message, code: 500 } });
    }
});

module.exports = router;

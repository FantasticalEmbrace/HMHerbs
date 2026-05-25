// Octopos API Client Service
// Comprehensive integration with Octopos POS system API
// Based on OpenAPI 3.1.0 specification

const axios = require('axios');
const logger = require('../utils/logger');

class OctoposService {
    constructor(baseUrl = null, token = null) {
        // Base URL can be set via constructor or environment variable
        this.baseUrl = baseUrl || process.env.OCTOPOS_API_URL || '';
        this.token = token || null;
        this.defaultTimeout = 30000; // 30 seconds
    }

    /**
     * Set authentication token
     * @param {string} token - Authentication token
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Set base URL
     * @param {string} baseUrl - Base URL for Octopos API
     */
    setBaseUrl(baseUrl) {
        this.baseUrl = baseUrl;
    }

    /**
     * Make authenticated API request
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
     * @param {string} endpoint - API endpoint path
     * @param {object} data - Request body data
     * @param {object} params - Query parameters
     * @param {object} options - Additional options (timeout, headers, etc.)
     * @returns {Promise<object>} API response
     */
    async request(method, endpoint, data = null, params = null, options = {}) {
        // Validate base URL
        if (!this.baseUrl || this.baseUrl.trim() === '') {
            return {
                success: false,
                error: { 
                    message: 'Octopos API base URL is required. Please provide baseUrl in the request or set OCTOPOS_API_URL environment variable.',
                    code: 400
                },
                status: 400
            };
        }

        // Ensure base URL has protocol
        let baseUrl = this.baseUrl.trim();
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            // Default to http for local network addresses, https for others
            if (baseUrl.match(/^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)/)) {
                baseUrl = `http://${baseUrl}`;
            } else {
                baseUrl = `https://${baseUrl}`;
            }
        }

        // Remove trailing slash from base URL and ensure endpoint starts with /
        baseUrl = baseUrl.replace(/\/+$/, '');
        const endpointPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${baseUrl}${endpointPath}`;

        // Validate URL format
        try {
            new URL(url);
        } catch (urlError) {
            return {
                success: false,
                error: { 
                    message: `Invalid URL format: ${url}. Please provide a valid base URL (e.g., https://api.octopos.com)`,
                    code: 400
                },
                status: 400
            };
        }

        const config = {
            method: method.toUpperCase(),
            url,
            timeout: options.timeout || this.defaultTimeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'HMHerbs-Octopos-Integration/1.0',
                ...options.headers
            }
        };

        // Add authentication token if available
        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Add query parameters
        if (params) {
            config.params = params;
        }

        // Add request body
        if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT' || method.toUpperCase() === 'PATCH')) {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return {
                success: true,
                data: response.data,
                status: response.status,
                headers: response.headers
            };
        } catch (error) {
            logger.error('Octopos API request failed:', {
                method,
                endpoint,
                url,
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            // Handle specific axios errors
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                return {
                    success: false,
                    error: { 
                        message: `Cannot connect to Octopos API at ${baseUrl}. Please check if the URL is correct and the server is accessible.`,
                        code: 503
                    },
                    status: 503
                };
            }

            if (error.message && error.message.includes('Invalid URL')) {
                return {
                    success: false,
                    error: { 
                        message: `Invalid URL: ${url}. Please provide a valid base URL.`,
                        code: 400
                    },
                    status: 400
                };
            }

            return {
                success: false,
                error: error.response?.data || { message: error.message },
                status: error.response?.status || 500
            };
        }
    }

    // ==================== AUTHENTICATION ====================

    /**
     * Authenticate and get access token
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<object>} Authentication response with token and locations
     */
    async authenticate(email, password) {
        const response = await this.request('POST', '/api/v2/authenticate', {
            email,
            password
        });

        if (response.success && response.data.token) {
            this.setToken(response.data.token);
        }

        return response;
    }

    // ==================== EMPLOYEES ====================

    /**
     * List all employees
     * @param {object} filters - Query filters (active, skip, limit)
     * @returns {Promise<object>} List of employees
     */
    async getEmployees(filters = {}) {
        return this.request('GET', '/api/v2/employees', null, filters);
    }

    /**
     * Create a new employee
     * @param {object} employeeData - Employee data
     * @returns {Promise<object>} Created employee
     */
    async createEmployee(employeeData) {
        return this.request('POST', '/api/v2/employees', employeeData);
    }

    /**
     * Get employee by ID
     * @param {string|number} id - Employee ID
     * @returns {Promise<object>} Employee data
     */
    async getEmployeeById(id) {
        return this.request('GET', `/api/v2/employees/${id}`);
    }

    /**
     * Update employee
     * @param {string|number} id - Employee ID
     * @param {object} employeeData - Updated employee data
     * @returns {Promise<object>} Updated employee
     */
    async updateEmployee(id, employeeData) {
        return this.request('PUT', `/api/v2/employees/${id}`, employeeData);
    }

    // ==================== CATEGORIES ====================

    /**
     * List all categories
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of categories
     */
    async getCategories(filters = {}) {
        return this.request('GET', '/api/v2/categories', null, filters);
    }

    /**
     * Create a new category
     * @param {object} categoryData - Category data
     * @returns {Promise<object>} Created category
     */
    async createCategory(categoryData) {
        return this.request('POST', '/api/v2/categories', categoryData);
    }

    /**
     * Get category by ID
     * @param {string|number} id - Category ID
     * @returns {Promise<object>} Category data
     */
    async getCategoryById(id) {
        return this.request('GET', `/api/v2/categories/${id}`);
    }

    /**
     * Update category
     * @param {string|number} id - Category ID
     * @param {object} categoryData - Updated category data
     * @returns {Promise<object>} Updated category
     */
    async updateCategory(id, categoryData) {
        return this.request('PUT', `/api/v2/categories/${id}`, categoryData);
    }

    /**
     * Copy categories
     * @param {object} copyData - Copy configuration
     * @returns {Promise<object>} Copy result
     */
    async copyCategories(copyData) {
        return this.request('POST', '/api/v2/categories_copy', copyData);
    }

    // ==================== DEPARTMENTS ====================

    /**
     * List all departments
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of departments
     */
    async getDepartments(filters = {}) {
        return this.request('GET', '/api/v2/departments', null, filters);
    }

    /**
     * Create a new department
     * @param {object} departmentData - Department data
     * @returns {Promise<object>} Created department
     */
    async createDepartment(departmentData) {
        return this.request('POST', '/api/v2/departments', departmentData);
    }

    /**
     * Get department by ID
     * @param {string|number} id - Department ID
     * @returns {Promise<object>} Department data
     */
    async getDepartmentById(id) {
        return this.request('GET', `/api/v2/departments/${id}`);
    }

    /**
     * Update department
     * @param {string|number} id - Department ID
     * @param {object} departmentData - Updated department data
     * @returns {Promise<object>} Updated department
     */
    async updateDepartment(id, departmentData) {
        return this.request('PUT', `/api/v2/departments/${id}`, departmentData);
    }

    // ==================== MODIFIER SETS ====================

    /**
     * List all modifier sets
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of modifier sets
     */
    async getModifierSets(filters = {}) {
        return this.request('GET', '/api/v2/modifier_sets', null, filters);
    }

    /**
     * Create a new modifier set
     * @param {object} modifierSetData - Modifier set data
     * @returns {Promise<object>} Created modifier set
     */
    async createModifierSet(modifierSetData) {
        return this.request('POST', '/api/v2/modifier_sets', modifierSetData);
    }

    /**
     * Get modifier set by ID
     * @param {string|number} id - Modifier set ID
     * @returns {Promise<object>} Modifier set data
     */
    async getModifierSetById(id) {
        return this.request('GET', `/api/v2/modifier_sets/${id}`);
    }

    /**
     * Update modifier set
     * @param {string|number} id - Modifier set ID
     * @param {object} modifierSetData - Updated modifier set data
     * @returns {Promise<object>} Updated modifier set
     */
    async updateModifierSet(id, modifierSetData) {
        return this.request('PUT', `/api/v2/modifier_sets/${id}`, modifierSetData);
    }

    // ==================== PRODUCTS ====================

    /**
     * Get products by filter
     * @param {object} filterData - Filter criteria
     * @returns {Promise<object>} Filtered products
     */
    async getProductsByFilter(filterData) {
        return this.request('POST', '/api/v2/get_products_by_filter', filterData);
    }

    /**
     * Get products by filter for single location
     * @param {object} filterData - Filter criteria
     * @returns {Promise<object>} Filtered products
     */
    async getProductsByFilterSingleLocation(filterData) {
        return this.request('POST', '/api/v2/get_products_by_filter_single_location', filterData);
    }

    /**
     * List all products
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of products
     */
    async getProducts(filters = {}) {
        return this.request('GET', '/api/v2/products', null, filters);
    }

    /**
     * Create a new product
     * @param {object} productData - Product data
     * @returns {Promise<object>} Created product
     */
    async createProduct(productData) {
        return this.request('POST', '/api/v2/products', productData);
    }

    /**
     * Get product by ID
     * @param {string|number} id - Product ID
     * @returns {Promise<object>} Product data
     */
    async getProductById(id) {
        return this.request('GET', `/api/v2/products/${id}`);
    }

    /**
     * Update product
     * @param {string|number} id - Product ID
     * @param {object} productData - Updated product data
     * @returns {Promise<object>} Updated product
     */
    async updateProduct(id, productData) {
        return this.request('PUT', `/api/v2/products/${id}`, productData);
    }

    /**
     * Search products by term
     * @param {string} term - Search term
     * @param {object} filters - Additional filters
     * @returns {Promise<object>} Search results
     */
    async searchProducts(term, filters = {}) {
        return this.request('GET', '/api/v2/products/search/term', null, { term, ...filters });
    }

    // ==================== TAXES ====================

    /**
     * List all taxes
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of taxes
     */
    async getTaxes(filters = {}) {
        return this.request('GET', '/api/v2/taxes', null, filters);
    }

    /**
     * Create a new tax
     * @param {object} taxData - Tax data
     * @returns {Promise<object>} Created tax
     */
    async createTax(taxData) {
        return this.request('POST', '/api/v2/taxes', taxData);
    }

    /**
     * Get tax by ID
     * @param {string|number} id - Tax ID
     * @returns {Promise<object>} Tax data
     */
    async getTaxById(id) {
        return this.request('GET', `/api/v2/taxes/${id}`);
    }

    /**
     * Update tax
     * @param {string|number} id - Tax ID
     * @param {object} taxData - Updated tax data
     * @returns {Promise<object>} Updated tax
     */
    async updateTax(id, taxData) {
        return this.request('PUT', `/api/v2/taxes/${id}`, taxData);
    }

    // ==================== VENDORS ====================

    /**
     * List all vendors
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of vendors
     */
    async getVendors(filters = {}) {
        return this.request('GET', '/api/v2/vendors', null, filters);
    }

    /**
     * Create a new vendor
     * @param {object} vendorData - Vendor data
     * @returns {Promise<object>} Created vendor
     */
    async createVendor(vendorData) {
        return this.request('POST', '/api/v2/vendors', vendorData);
    }

    /**
     * Get vendor by ID
     * @param {string|number} id - Vendor ID
     * @returns {Promise<object>} Vendor data
     */
    async getVendorById(id) {
        return this.request('GET', `/api/v2/vendors/${id}`);
    }

    /**
     * Update vendor
     * @param {string|number} id - Vendor ID
     * @param {object} vendorData - Updated vendor data
     * @returns {Promise<object>} Updated vendor
     */
    async updateVendor(id, vendorData) {
        return this.request('PUT', `/api/v2/vendors/${id}`, vendorData);
    }

    // ==================== PURCHASE ORDERS ====================

    /**
     * Create a purchase order
     * @param {object} orderData - Purchase order data
     * @returns {Promise<object>} Created purchase order
     */
    async createPurchaseOrder(orderData) {
        return this.request('POST', '/api/v2/PurchaseOrder', orderData);
    }

    /**
     * List all purchase orders
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of purchase orders
     */
    async getPurchaseOrders(filters = {}) {
        return this.request('GET', '/api/v2/PurchaseOrder', null, filters);
    }

    /**
     * Get purchase order by ID
     * @param {string|number} id - Purchase order ID
     * @returns {Promise<object>} Purchase order data
     */
    async getPurchaseOrderById(id) {
        return this.request('GET', `/api/v2/purchase_orders/${id}`);
    }

    /**
     * Update purchase order
     * @param {string|number} id - Purchase order ID
     * @param {object} orderData - Updated purchase order data
     * @returns {Promise<object>} Updated purchase order
     */
    async updatePurchaseOrder(id, orderData) {
        return this.request('PUT', `/api/v2/purchase_orders/${id}`, orderData);
    }

    /**
     * Update purchase order lines
     * @param {string|number} id - Purchase order ID
     * @param {object} linesData - Purchase order lines data
     * @returns {Promise<object>} Updated purchase order
     */
    async updatePurchaseOrderLines(id, linesData) {
        return this.request('PUT', `/api/v2/purchase_orders/${id}/lines`, linesData);
    }

    // ==================== REWARD CARDS ====================

    /**
     * List all reward cards
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of reward cards
     */
    async getRewardCards(filters = {}) {
        return this.request('GET', '/api/v2/reward_cards', null, filters);
    }

    /**
     * Create a new reward card
     * @param {object} cardData - Reward card data
     * @returns {Promise<object>} Created reward card
     */
    async createRewardCard(cardData) {
        return this.request('POST', '/api/v2/reward_cards', cardData);
    }

    /**
     * Get reward card by ID
     * @param {string|number} id - Reward card ID
     * @returns {Promise<object>} Reward card data
     */
    async getRewardCardById(id) {
        return this.request('GET', `/api/v2/reward_cards/${id}`);
    }

    /**
     * Update reward card
     * @param {string|number} id - Reward card ID
     * @param {object} cardData - Updated reward card data
     * @returns {Promise<object>} Updated reward card
     */
    async updateRewardCard(id, cardData) {
        return this.request('PUT', `/api/v2/reward_cards/${id}`, cardData);
    }

    // ==================== REWARDS ====================

    /**
     * List all rewards
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of rewards
     */
    async getRewards(filters = {}) {
        return this.request('GET', '/api/v2/rewards', null, filters);
    }

    /**
     * Create a new reward
     * @param {object} rewardData - Reward data
     * @returns {Promise<object>} Created reward
     */
    async createReward(rewardData) {
        return this.request('POST', '/api/v2/rewards', rewardData);
    }

    /**
     * Get reward by ID
     * @param {string|number} id - Reward ID
     * @returns {Promise<object>} Reward data
     */
    async getRewardById(id) {
        return this.request('GET', `/api/v2/rewards/${id}`);
    }

    /**
     * Update reward
     * @param {string|number} id - Reward ID
     * @param {object} rewardData - Updated reward data
     * @returns {Promise<object>} Updated reward
     */
    async updateReward(id, rewardData) {
        return this.request('PUT', `/api/v2/rewards/${id}`, rewardData);
    }

    // ==================== ORDERS ====================

    /**
     * Get order by order number
     * @param {string} orderNumber - Order number
     * @returns {Promise<object>} Order data
     */
    async getOrderByNumber(orderNumber) {
        return this.request('GET', `/api/v2/orders/${orderNumber}`);
    }

    /**
     * Get orders by filter
     * @param {object} filterData - Filter criteria
     * @returns {Promise<object>} Filtered orders
     */
    async getOrdersByFilter(filterData) {
        return this.request('POST', '/api/v2/get_orders_by_filter', filterData);
    }

    // ==================== REFUNDS ====================

    /**
     * Get refund by refund ID
     * @param {string|number} refundId - Refund ID
     * @returns {Promise<object>} Refund data
     */
    async getRefundById(refundId) {
        return this.request('GET', '/api/v2/refunds', null, { refund_id: refundId });
    }

    /**
     * Get refund by order number
     * @param {string} orderNumber - Order number
     * @returns {Promise<object>} Refund data
     */
    async getRefundByOrderNumber(orderNumber) {
        return this.request('GET', '/api/v2/refunds', null, { order_number: orderNumber });
    }

    /**
     * Get refunds by filter
     * @param {object} filterData - Filter criteria
     * @returns {Promise<object>} Filtered refunds
     */
    async getRefundsByFilter(filterData) {
        return this.request('POST', '/api/v2/get_refunds_by_filter', filterData);
    }

    /**
     * Create refund without order
     * @param {object} refundData - Refund data
     * @returns {Promise<object>} Created refund
     */
    async createRefundWithoutOrder(refundData) {
        return this.request('POST', '/api/v2/refund_without_orders', refundData);
    }

    /**
     * Get refund without order by ID
     * @param {string|number} id - Refund ID
     * @returns {Promise<object>} Refund data
     */
    async getRefundWithoutOrderById(id) {
        return this.request('GET', `/api/v2/refund_without_orders/${id}`);
    }

    /**
     * Create bottle deposit refund
     * @param {object} refundData - Bottle deposit refund data
     * @returns {Promise<object>} Created refund
     */
    async createBottleDepositRefund(refundData) {
        return this.request('POST', '/api/v2/bottle_deposit_refunds', refundData);
    }

    /**
     * Get bottle deposit refund by ID
     * @param {string|number} id - Refund ID
     * @returns {Promise<object>} Refund data
     */
    async getBottleDepositRefundById(id) {
        return this.request('GET', `/api/v2/bottle_deposit_refunds/${id}`);
    }

    // ==================== INVENTORY ====================

    /**
     * Add inventory
     * @param {object} inventoryData - Inventory data
     * @returns {Promise<object>} Inventory update result
     */
    async addInventory(inventoryData) {
        return this.request('POST', '/api/v2/add_inventory', inventoryData);
    }

    /**
     * Subtract inventory
     * @param {object} inventoryData - Inventory data
     * @returns {Promise<object>} Inventory update result
     */
    async subtractInventory(inventoryData) {
        return this.request('POST', '/api/v2/subtract_inventory', inventoryData);
    }

    /**
     * Recount inventory
     * @param {object} inventoryData - Inventory data
     * @returns {Promise<object>} Inventory update result
     */
    async recountInventory(inventoryData) {
        return this.request('POST', '/api/v2/recount_inventory', inventoryData);
    }

    // ==================== PROMOTIONS ====================

    /**
     * Get promotion types
     * @returns {Promise<object>} List of promotion types
     */
    async getPromotionTypes() {
        return this.request('GET', '/api/v2/promotion_types');
    }

    /**
     * List all promotions
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of promotions
     */
    async getPromotions(filters = {}) {
        return this.request('GET', '/api/v2/promotions', null, filters);
    }

    /**
     * Create a new promotion
     * @param {object} promotionData - Promotion data
     * @returns {Promise<object>} Created promotion
     */
    async createPromotion(promotionData) {
        return this.request('POST', '/api/v2/promotions', promotionData);
    }

    /**
     * Get promotion by ID
     * @param {string|number} id - Promotion ID
     * @returns {Promise<object>} Promotion data
     */
    async getPromotionById(id) {
        return this.request('GET', `/api/v2/promotions/${id}`);
    }

    /**
     * Update promotion
     * @param {string|number} id - Promotion ID
     * @param {object} promotionData - Updated promotion data
     * @returns {Promise<object>} Updated promotion
     */
    async updatePromotion(id, promotionData) {
        return this.request('PUT', `/api/v2/promotions/${id}`, promotionData);
    }

    // ==================== COUPONS ====================

    /**
     * List all coupons
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of coupons
     */
    async getCoupons(filters = {}) {
        return this.request('GET', '/api/v2/coupons', null, filters);
    }

    /**
     * Create a new coupon
     * @param {object} couponData - Coupon data
     * @returns {Promise<object>} Created coupon
     */
    async createCoupon(couponData) {
        return this.request('POST', '/api/v2/coupons', couponData);
    }

    /**
     * Get coupon by ID
     * @param {string|number} id - Coupon ID
     * @returns {Promise<object>} Coupon data
     */
    async getCouponById(id) {
        return this.request('GET', `/api/v2/coupons/${id}`);
    }

    /**
     * Update coupon
     * @param {string|number} id - Coupon ID
     * @param {object} couponData - Updated coupon data
     * @returns {Promise<object>} Updated coupon
     */
    async updateCoupon(id, couponData) {
        return this.request('PUT', `/api/v2/coupons/${id}`, couponData);
    }

    // ==================== WEBHOOKS ====================

    /**
     * List all webhooks
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of webhooks
     */
    async getWebhooks(filters = {}) {
        return this.request('GET', '/api/v2/webhooks', null, filters);
    }

    /**
     * Create a new webhook
     * @param {object} webhookData - Webhook data
     * @returns {Promise<object>} Created webhook
     */
    async createWebhook(webhookData) {
        return this.request('POST', '/api/v2/webhooks', webhookData);
    }

    /**
     * Get webhook by ID
     * @param {string|number} id - Webhook ID
     * @returns {Promise<object>} Webhook data
     */
    async getWebhookById(id) {
        return this.request('GET', `/api/v2/webhooks/${id}`);
    }

    /**
     * Get webhook types
     * @returns {Promise<object>} List of webhook types
     */
    async getWebhookTypes() {
        return this.request('GET', '/api/v2/webhook_types');
    }

    // ==================== ROLES & PERMISSIONS ====================

    /**
     * List all roles
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of roles
     */
    async getRoles(filters = {}) {
        return this.request('GET', '/api/v2/roles', null, filters);
    }

    /**
     * Get role by ID
     * @param {string|number} id - Role ID
     * @returns {Promise<object>} Role data
     */
    async getRoleById(id) {
        return this.request('GET', `/api/v2/roles/${id}`);
    }

    /**
     * Get permissions
     * @returns {Promise<object>} List of permissions
     */
    async getPermissions() {
        return this.request('GET', '/api/v2/permissions');
    }

    /**
     * Get reward points calculation types
     * @returns {Promise<object>} List of calculation types
     */
    async getRewardPointsCalculationTypes() {
        return this.request('GET', '/api/v2/reward_points_calculation_types');
    }

    // ==================== TARE CONTAINERS ====================

    /**
     * List all tare containers
     * @param {object} filters - Query filters
     * @returns {Promise<object>} List of tare containers
     */
    async getTareContainers(filters = {}) {
        return this.request('GET', '/api/v2/tare_containers', null, filters);
    }
}

module.exports = OctoposService;

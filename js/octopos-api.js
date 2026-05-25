// Octopos API Client for Frontend
// Utility class for making Octopos API calls through the backend proxy

class OctoposAPI {
    constructor(baseUrl = '/api/octopos') {
        this.baseUrl = baseUrl;
        this.token = null;
        this.baseApiUrl = null;
    }

    /**
     * Set authentication token
     * @param {string} token - Authentication token
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Set base API URL for Octopos
     * @param {string} baseApiUrl - Base URL for Octopos API
     */
    setBaseApiUrl(baseApiUrl) {
        this.baseApiUrl = baseApiUrl;
    }

    /**
     * Make API request
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body
     * @param {object} params - Query parameters
     * @returns {Promise<object>} API response
     */
    async request(method, endpoint, data = null, params = null) {
        const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);
        
        // Add query parameters
        if (params) {
            Object.keys(params).forEach(key => {
                if (params[key] !== null && params[key] !== undefined) {
                    url.searchParams.append(key, params[key]);
                }
            });
        }

        const options = {
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Add authentication headers
        if (this.token) {
            options.headers['X-Octopos-Token'] = this.token;
        }

        if (this.baseApiUrl) {
            options.headers['X-Octopos-BaseUrl'] = this.baseApiUrl;
        }

        // Add request body
        if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT' || method.toUpperCase() === 'PATCH')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url.toString(), options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error?.message || `Request failed with status ${response.status}`);
            }

            return {
                success: true,
                data: result,
                status: response.status
            };
        } catch (error) {
            console.error('Octopos API request failed:', error);
            return {
                success: false,
                error: error.message,
                status: error.status || 500
            };
        }
    }

    // ==================== AUTHENTICATION ====================

    /**
     * Authenticate and get access token
     * @param {string} email - User email
     * @param {string} password - User password
     * @param {string} baseUrl - Optional base URL override
     * @returns {Promise<object>} Authentication response
     */
    async authenticate(email, password, baseUrl = null) {
        const response = await this.request('POST', '/authenticate', {
            email,
            password,
            baseUrl: baseUrl || this.baseApiUrl
        });

        if (response.success && response.data.token) {
            this.setToken(response.data.token);
            if (baseUrl) {
                this.setBaseApiUrl(baseUrl);
            }
        }

        return response;
    }

    // ==================== EMPLOYEES ====================

    async getEmployees(filters = {}) {
        return this.request('GET', '/employees', null, filters);
    }

    async createEmployee(employeeData) {
        return this.request('POST', '/employees', employeeData);
    }

    async getEmployeeById(id) {
        return this.request('GET', `/employees/${id}`);
    }

    async updateEmployee(id, employeeData) {
        return this.request('PUT', `/employees/${id}`, employeeData);
    }

    // ==================== CATEGORIES ====================

    async getCategories(filters = {}) {
        return this.request('GET', '/categories', null, filters);
    }

    async createCategory(categoryData) {
        return this.request('POST', '/categories', categoryData);
    }

    async getCategoryById(id) {
        return this.request('GET', `/categories/${id}`);
    }

    async updateCategory(id, categoryData) {
        return this.request('PUT', `/categories/${id}`, categoryData);
    }

    async copyCategories(copyData) {
        return this.request('POST', '/categories/copy', copyData);
    }

    // ==================== DEPARTMENTS ====================

    async getDepartments(filters = {}) {
        return this.request('GET', '/departments', null, filters);
    }

    async createDepartment(departmentData) {
        return this.request('POST', '/departments', departmentData);
    }

    async getDepartmentById(id) {
        return this.request('GET', `/departments/${id}`);
    }

    async updateDepartment(id, departmentData) {
        return this.request('PUT', `/departments/${id}`, departmentData);
    }

    // ==================== MODIFIER SETS ====================

    async getModifierSets(filters = {}) {
        return this.request('GET', '/modifier-sets', null, filters);
    }

    async createModifierSet(modifierSetData) {
        return this.request('POST', '/modifier-sets', modifierSetData);
    }

    async getModifierSetById(id) {
        return this.request('GET', `/modifier-sets/${id}`);
    }

    async updateModifierSet(id, modifierSetData) {
        return this.request('PUT', `/modifier-sets/${id}`, modifierSetData);
    }

    // ==================== PRODUCTS ====================

    async getProductsByFilter(filterData) {
        return this.request('POST', '/products/filter', filterData);
    }

    async getProductsByFilterSingleLocation(filterData) {
        return this.request('POST', '/products/filter/single-location', filterData);
    }

    async getProducts(filters = {}) {
        return this.request('GET', '/products', null, filters);
    }

    async createProduct(productData) {
        return this.request('POST', '/products', productData);
    }

    async getProductById(id) {
        return this.request('GET', `/products/${id}`);
    }

    async updateProduct(id, productData) {
        return this.request('PUT', `/products/${id}`, productData);
    }

    async searchProducts(term, filters = {}) {
        return this.request('GET', '/products/search/term', null, { term, ...filters });
    }

    // ==================== TAXES ====================

    async getTaxes(filters = {}) {
        return this.request('GET', '/taxes', null, filters);
    }

    async createTax(taxData) {
        return this.request('POST', '/taxes', taxData);
    }

    async getTaxById(id) {
        return this.request('GET', `/taxes/${id}`);
    }

    async updateTax(id, taxData) {
        return this.request('PUT', `/taxes/${id}`, taxData);
    }

    // ==================== VENDORS ====================

    async getVendors(filters = {}) {
        return this.request('GET', '/vendors', null, filters);
    }

    async createVendor(vendorData) {
        return this.request('POST', '/vendors', vendorData);
    }

    async getVendorById(id) {
        return this.request('GET', `/vendors/${id}`);
    }

    async updateVendor(id, vendorData) {
        return this.request('PUT', `/vendors/${id}`, vendorData);
    }

    // ==================== PURCHASE ORDERS ====================

    async createPurchaseOrder(orderData) {
        return this.request('POST', '/purchase-orders', orderData);
    }

    async getPurchaseOrders(filters = {}) {
        return this.request('GET', '/purchase-orders', null, filters);
    }

    async getPurchaseOrderById(id) {
        return this.request('GET', `/purchase-orders/${id}`);
    }

    async updatePurchaseOrder(id, orderData) {
        return this.request('PUT', `/purchase-orders/${id}`, orderData);
    }

    async updatePurchaseOrderLines(id, linesData) {
        return this.request('PUT', `/purchase-orders/${id}/lines`, linesData);
    }

    // ==================== REWARD CARDS ====================

    async getRewardCards(filters = {}) {
        return this.request('GET', '/reward-cards', null, filters);
    }

    async createRewardCard(cardData) {
        return this.request('POST', '/reward-cards', cardData);
    }

    async getRewardCardById(id) {
        return this.request('GET', `/reward-cards/${id}`);
    }

    async updateRewardCard(id, cardData) {
        return this.request('PUT', `/reward-cards/${id}`, cardData);
    }

    // ==================== REWARDS ====================

    async getRewards(filters = {}) {
        return this.request('GET', '/rewards', null, filters);
    }

    async createReward(rewardData) {
        return this.request('POST', '/rewards', rewardData);
    }

    async getRewardById(id) {
        return this.request('GET', `/rewards/${id}`);
    }

    async updateReward(id, rewardData) {
        return this.request('PUT', `/rewards/${id}`, rewardData);
    }

    // ==================== ORDERS ====================

    async getOrderByNumber(orderNumber) {
        return this.request('GET', `/orders/${orderNumber}`);
    }

    async getOrdersByFilter(filterData) {
        return this.request('POST', '/orders/filter', filterData);
    }

    // ==================== REFUNDS ====================

    async getRefundById(refundId) {
        return this.request('GET', '/refunds', null, { refund_id: refundId });
    }

    async getRefundByOrderNumber(orderNumber) {
        return this.request('GET', '/refunds', null, { order_number: orderNumber });
    }

    async getRefundsByFilter(filterData) {
        return this.request('POST', '/refunds/filter', filterData);
    }

    async createRefundWithoutOrder(refundData) {
        return this.request('POST', '/refunds/without-orders', refundData);
    }

    async getRefundWithoutOrderById(id) {
        return this.request('GET', `/refunds/without-orders/${id}`);
    }

    async createBottleDepositRefund(refundData) {
        return this.request('POST', '/refunds/bottle-deposit', refundData);
    }

    async getBottleDepositRefundById(id) {
        return this.request('GET', `/refunds/bottle-deposit/${id}`);
    }

    // ==================== INVENTORY ====================

    async addInventory(inventoryData) {
        return this.request('POST', '/inventory/add', inventoryData);
    }

    async subtractInventory(inventoryData) {
        return this.request('POST', '/inventory/subtract', inventoryData);
    }

    async recountInventory(inventoryData) {
        return this.request('POST', '/inventory/recount', inventoryData);
    }

    // ==================== PROMOTIONS ====================

    async getPromotionTypes() {
        return this.request('GET', '/promotions/types');
    }

    async getPromotions(filters = {}) {
        return this.request('GET', '/promotions', null, filters);
    }

    async createPromotion(promotionData) {
        return this.request('POST', '/promotions', promotionData);
    }

    async getPromotionById(id) {
        return this.request('GET', `/promotions/${id}`);
    }

    async updatePromotion(id, promotionData) {
        return this.request('PUT', `/promotions/${id}`, promotionData);
    }

    // ==================== COUPONS ====================

    async getCoupons(filters = {}) {
        return this.request('GET', '/coupons', null, filters);
    }

    async createCoupon(couponData) {
        return this.request('POST', '/coupons', couponData);
    }

    async getCouponById(id) {
        return this.request('GET', `/coupons/${id}`);
    }

    async updateCoupon(id, couponData) {
        return this.request('PUT', `/coupons/${id}`, couponData);
    }

    // ==================== WEBHOOKS ====================

    async getWebhooks(filters = {}) {
        return this.request('GET', '/webhooks', null, filters);
    }

    async createWebhook(webhookData) {
        return this.request('POST', '/webhooks', webhookData);
    }

    async getWebhookById(id) {
        return this.request('GET', `/webhooks/${id}`);
    }

    async getWebhookTypes() {
        return this.request('GET', '/webhooks/types');
    }

    // ==================== ROLES & PERMISSIONS ====================

    async getRoles(filters = {}) {
        return this.request('GET', '/roles', null, filters);
    }

    async getRoleById(id) {
        return this.request('GET', `/roles/${id}`);
    }

    async getPermissions() {
        return this.request('GET', '/permissions');
    }

    async getRewardPointsCalculationTypes() {
        return this.request('GET', '/reward-points/calculation-types');
    }

    // ==================== TARE CONTAINERS ====================

    async getTareContainers(filters = {}) {
        return this.request('GET', '/tare-containers', null, filters);
    }
}

// Create a global instance
if (typeof window !== 'undefined') {
    window.OctoposAPI = OctoposAPI;
    window.octoposAPI = new OctoposAPI();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OctoposAPI;
}

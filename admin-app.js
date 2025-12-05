// HM Herbs Admin Panel Application
// Complete admin interface with backend integration

class AdminApp {
    constructor() {
        // Dynamic API base URL configuration
        this.apiBaseUrl = this.getApiBaseUrl();
        this.authToken = localStorage.getItem('adminToken');
        this.currentUser = null;
        
        this.init();
    }
    
    getApiBaseUrl() {
        // Check if we're in development (localhost)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001/api';
        }
        
        // For production, use the same origin with /api path
        return `${window.location.origin}/api`;
    }

    async init() {
        // Check if user is already logged in
        if (this.authToken) {
            try {
                await this.loadDashboard();
            } catch (error) {
                this.logout();
            }
        }

        this.setupEventListeners();
    }

    // Helper function to escape HTML to prevent XSS
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Navigation
        document.querySelectorAll('.nav-link[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.target.closest('.nav-link').dataset.section;
                this.showSection(section);
            });
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const emailElement = document.getElementById('email');
        const passwordElement = document.getElementById('password');
        const errorDiv = document.getElementById('loginError');
        
        if (!emailElement || !passwordElement || !errorDiv) {
            // Log error in development only
            if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
                console.error('Required login form elements not found');
            }
            return;
        }
        
        const email = emailElement.value;
        const password = passwordElement.value;
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/admin/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.authToken = data.token;
                this.currentUser = data.admin;
                localStorage.setItem('adminToken', this.authToken);
                
                await this.loadDashboard();
            } else {
                errorDiv.textContent = data.error || 'Login failed';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            errorDiv.textContent = 'Connection error. Please try again.';
            errorDiv.style.display = 'block';
        }
    }

    async loadDashboard() {
        // Hide login screen and show dashboard
        const loginScreen = document.getElementById('loginScreen');
        const adminDashboard = document.getElementById('adminDashboard');
        const userName = document.getElementById('userName');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (adminDashboard) adminDashboard.style.display = 'flex';
        
        // Update user info
        if (this.currentUser && userName) {
            userName.textContent = 
                `${this.currentUser.firstName} ${this.currentUser.lastName}`;
        }

        // Load dashboard data
        await this.loadDashboardStats();
    }

    async loadDashboardStats() {
        try {
            const response = await this.apiRequest('/admin/dashboard/stats');
            
            if (response.products) {
                const totalProducts = document.getElementById('totalProducts');
                const lowStockProducts = document.getElementById('lowStockProducts');
                
                if (totalProducts) totalProducts.textContent = response.products.total_products || 0;
                if (lowStockProducts) lowStockProducts.textContent = response.products.low_stock_products || 0;
            }
            
            if (response.orders) {
                const totalOrders = document.getElementById('totalOrders');
                if (totalOrders) totalOrders.textContent = response.orders.total_orders || 0;
            }
            
            if (response.edsa) {
                const totalBookings = document.getElementById('totalBookings');
                if (totalBookings) totalBookings.textContent = response.edsa.pending_bookings || 0;
            }
        } catch (error) {
            // Log error in development only
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to load dashboard stats:', error);
            }
            // Show user-friendly error message
            this.showNotification('Failed to load dashboard statistics', 'error');
        }
    }

    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        const activeNavLink = document.querySelector(`[data-section="${sectionName}"]`);
        if (activeNavLink) activeNavLink.classList.add('active');

        // Show section
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        const activeSection = document.getElementById(sectionName);
        if (activeSection) activeSection.classList.add('active');

        // Load section data
        this.loadSectionData(sectionName);
    }

    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'dashboard':
                await this.loadDashboardStats();
                break;
            case 'products':
                await this.loadProducts();
                break;
            case 'orders':
                await this.loadOrders();
                break;
            case 'edsa':
                await this.loadEDSABookings();
                break;
        }
    }

    async loadProducts() {
        const container = document.getElementById('productsTable');
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading products...</div>';

        try {
            const response = await this.apiRequest('/admin/products?limit=50');
            
            if (response.products && response.products.length > 0) {
                container.innerHTML = this.renderProductsTable(response.products);
            } else {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                        <i class="fas fa-box-open" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                        <p>No products found. Import products or scrape from HM Herbs website.</p>
                        <button class="btn btn-primary" onclick="scrapeProducts()">
                            <i class="fas fa-download"></i>
                            Scrape HM Herbs Products
                        </button>
                    </div>
                `;
            }
        } catch (error) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--error);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                    <p>Failed to load products: ${error.message}</p>
                </div>
            `;
        }
    }

    renderProductsTable(products) {
        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Name</th>
                            <th>Brand</th>
                            <th>Price</th>
                            <th>Stock</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(product => `
                            <tr>
                                <td><code>${this.escapeHtml(product.sku)}</code></td>
                                <td>
                                    <div style="font-weight: 500;">${this.escapeHtml(product.name)}</div>
                                    <div style="font-size: 0.75rem; color: var(--gray-500);">${this.escapeHtml(product.category_name || 'No category')}</div>
                                </td>
                                <td>${this.escapeHtml(product.brand_name || 'Unknown')}</td>
                                <td>$${product.price.toFixed(2)}</td>
                                <td>
                                    <span class="badge ${product.inventory_quantity <= (product.low_stock_threshold || 10) ? 'badge-warning' : 'badge-success'}">
                                        ${product.inventory_quantity}
                                    </span>
                                </td>
                                <td>
                                    <span class="badge ${product.is_active ? 'badge-success' : 'badge-danger'}">
                                        ${product.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="editProduct(${product.id})">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`,
                ...options.headers
            },
            ...options
        };

        const response = await fetch(url, config);
        
        if (response.status === 401) {
            this.logout();
            throw new Error('Authentication required');
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'API request failed');
        }

        return data;
    }

    logout() {
        localStorage.removeItem('adminToken');
        this.authToken = null;
        this.currentUser = null;
        
        const adminDashboard = document.getElementById('adminDashboard');
        const loginScreen = document.getElementById('loginScreen');
        const loginForm = document.getElementById('loginForm');
        const loginError = document.getElementById('loginError');
        
        if (adminDashboard) adminDashboard.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'flex';
        
        // Clear forms
        if (loginForm) loginForm.reset();
        if (loginError) loginError.style.display = 'none';
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${this.escapeHtml(message)}</span>
            </div>
        `;
        
        // Add styles
        Object.assign(notification.style, {
            position: 'fixed',
            top: '2rem',
            right: '2rem',
            padding: '1rem 1.5rem',
            borderRadius: 'var(--border-radius)',
            color: 'white',
            backgroundColor: type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--info)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: '9999',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease'
        });
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    }
}

// Global functions for button clicks
async function scrapeProducts() {
    const app = window.adminApp;
    
    try {
        app.showNotification('Starting product scraping from HM Herbs website...', 'info');
        
        const response = await fetch(`${app.apiBaseUrl}/admin/scrape-products`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${app.authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            app.showNotification(`Successfully scraped ${data.productsFound || 0} products!`, 'success');
            app.loadProducts(); // Reload products table
        } else {
            app.showNotification(data.error || 'Scraping failed', 'error');
        }
    } catch (error) {
        app.showNotification('Failed to start scraping: ' + error.message, 'error');
    }
}

async function importProducts() {
    const app = window.adminApp;
    const fileInput = document.getElementById('csvFile');
    const progressDiv = document.getElementById('importProgress');
    
    if (!fileInput.files[0]) {
        app.showNotification('Please select a CSV file first', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('csvFile', fileInput.files[0]);
    
    try {
        progressDiv.style.display = 'block';
        
        const response = await fetch(`${app.apiBaseUrl}/admin/import-products`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${app.authToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            app.showNotification(`Successfully imported ${data.imported || 0} products!`, 'success');
            fileInput.value = '';
        } else {
            app.showNotification(data.error || 'Import failed', 'error');
        }
    } catch (error) {
        app.showNotification('Failed to import products: ' + error.message, 'error');
    } finally {
        progressDiv.style.display = 'none';
    }
}

function editProduct(productId) {
    // Create and show product editing modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Edit Product</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="edit-product-form">
                    <div class="form-group">
                        <label for="edit-sku">SKU *</label>
                        <input type="text" id="edit-sku" name="sku" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-name">Product Name *</label>
                        <input type="text" id="edit-name" name="name" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-short-description">Short Description</label>
                        <textarea id="edit-short-description" name="short_description" rows="2"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="edit-long-description">Long Description</label>
                        <textarea id="edit-long-description" name="long_description" rows="4"></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="edit-price">Price *</label>
                            <input type="number" id="edit-price" name="price" step="0.01" min="0" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-compare-price">Compare Price</label>
                            <input type="number" id="edit-compare-price" name="compare_price" step="0.01" min="0">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="edit-inventory">Inventory Quantity *</label>
                            <input type="number" id="edit-inventory" name="inventory_quantity" min="0" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-low-stock">Low Stock Threshold</label>
                            <input type="number" id="edit-low-stock" name="low_stock_threshold" min="0" value="10">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="edit-weight">Weight (oz)</label>
                        <input type="number" id="edit-weight" name="weight" step="0.01" min="0">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="edit-is-active" name="is_active" checked>
                                Active Product
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="edit-is-featured" name="is_featured">
                                Featured Product
                            </label>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit">Update Product</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // Load existing product data
    loadProductForEdit(productId);
    
    // Handle form submission
    document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProduct(productId, new FormData(e.target));
        modal.remove();
    });
}

async function loadProductForEdit(productId) {
    try {
        const response = await fetch(`/api/admin/products/${productId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            const product = await response.json();
            
            // Populate form fields
            document.getElementById('edit-sku').value = product.sku || '';
            document.getElementById('edit-name').value = product.name || '';
            document.getElementById('edit-short-description').value = product.short_description || '';
            document.getElementById('edit-long-description').value = product.long_description || '';
            document.getElementById('edit-price').value = product.price || '';
            document.getElementById('edit-compare-price').value = product.compare_price || '';
            document.getElementById('edit-inventory').value = product.inventory_quantity || '';
            document.getElementById('edit-low-stock').value = product.low_stock_threshold || '';
            document.getElementById('edit-weight').value = product.weight || '';
            document.getElementById('edit-is-active').checked = product.is_active;
            document.getElementById('edit-is-featured').checked = product.is_featured;
        } else {
            window.adminApp.showNotification('Failed to load product data', 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error loading product: ' + error.message, 'error');
    }
}

async function updateProduct(productId, formData) {
    try {
        const productData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active' || key === 'is_featured') {
                productData[key] = true; // Checkbox was checked
            } else {
                productData[key] = value;
            }
        }
        
        // Handle unchecked checkboxes
        if (!formData.has('is_active')) productData.is_active = false;
        if (!formData.has('is_featured')) productData.is_featured = false;
        
        const response = await fetch(`/api/admin/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify(productData)
        });
        
        if (response.ok) {
            window.adminApp.showNotification('Product updated successfully!', 'success');
            // Refresh the products list
            if (typeof loadProducts === 'function') {
                loadProducts();
            }
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to update product: ' + error.error, 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error updating product: ' + error.message, 'error');
    }
}

function showAddProduct() {
    // Create and show add product modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add New Product</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="add-product-form">
                    <div class="form-group">
                        <label for="add-sku">SKU *</label>
                        <input type="text" id="add-sku" name="sku" required>
                    </div>
                    <div class="form-group">
                        <label for="add-name">Product Name *</label>
                        <input type="text" id="add-name" name="name" required>
                    </div>
                    <div class="form-group">
                        <label for="add-short-description">Short Description</label>
                        <textarea id="add-short-description" name="short_description" rows="2"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="add-long-description">Long Description</label>
                        <textarea id="add-long-description" name="long_description" rows="4"></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="add-brand">Brand *</label>
                            <select id="add-brand" name="brand_id" required>
                                <option value="">Select Brand</option>
                                <option value="1">HM Herbs</option>
                                <option value="2">Nature's Way</option>
                                <option value="3">Garden of Life</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="add-category">Category *</label>
                            <select id="add-category" name="category_id" required>
                                <option value="">Select Category</option>
                                <option value="1">Herbs & Botanicals</option>
                                <option value="2">Vitamins</option>
                                <option value="3">Supplements</option>
                                <option value="4">Essential Oils</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="add-price">Price *</label>
                            <input type="number" id="add-price" name="price" step="0.01" min="0" required>
                        </div>
                        <div class="form-group">
                            <label for="add-compare-price">Compare Price</label>
                            <input type="number" id="add-compare-price" name="compare_price" step="0.01" min="0">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="add-inventory">Inventory Quantity *</label>
                            <input type="number" id="add-inventory" name="inventory_quantity" min="0" required>
                        </div>
                        <div class="form-group">
                            <label for="add-low-stock">Low Stock Threshold</label>
                            <input type="number" id="add-low-stock" name="low_stock_threshold" min="0" value="10">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="add-weight">Weight (oz)</label>
                        <input type="number" id="add-weight" name="weight" step="0.01" min="0">
                    </div>
                    <div class="form-group">
                        <label for="add-health-categories">Health Categories (comma-separated)</label>
                        <input type="text" id="add-health-categories" name="health_categories" placeholder="e.g., immune support, digestive health">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="add-is-active" name="is_active" checked>
                                Active Product
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="add-is-featured" name="is_featured">
                                Featured Product
                            </label>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit">Add Product</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // Handle form submission
    document.getElementById('add-product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createProduct(new FormData(e.target));
        modal.remove();
    });
}

async function createProduct(formData) {
    try {
        const productData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active' || key === 'is_featured') {
                productData[key] = true; // Checkbox was checked
            } else if (key === 'health_categories') {
                // Convert comma-separated string to array
                productData[key] = value.split(',').map(cat => cat.trim()).filter(cat => cat);
            } else {
                productData[key] = value;
            }
        }
        
        // Handle unchecked checkboxes
        if (!formData.has('is_active')) productData.is_active = false;
        if (!formData.has('is_featured')) productData.is_featured = false;
        
        const response = await fetch('/api/admin/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify(productData)
        });
        
        if (response.ok) {
            window.adminApp.showNotification('Product created successfully!', 'success');
            // Refresh the products list
            if (typeof loadProducts === 'function') {
                loadProducts();
            }
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to create product: ' + error.error, 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error creating product: ' + error.message, 'error');
    }
}

function logout() {
    window.adminApp.logout();
}

// Initialize the admin app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();
});

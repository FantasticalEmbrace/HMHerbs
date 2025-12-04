// HM Herbs Admin Panel Application
// Complete admin interface with backend integration

class AdminApp {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3001/api';
        this.authToken = localStorage.getItem('adminToken');
        this.currentUser = null;
        
        this.init();
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
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');
        
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
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'flex';
        
        // Update user info
        if (this.currentUser) {
            document.getElementById('userName').textContent = 
                `${this.currentUser.firstName} ${this.currentUser.lastName}`;
        }

        // Load dashboard data
        await this.loadDashboardStats();
    }

    async loadDashboardStats() {
        try {
            const response = await this.apiRequest('/admin/dashboard/stats');
            
            if (response.products) {
                document.getElementById('totalProducts').textContent = 
                    response.products.total_products || 0;
                document.getElementById('lowStockProducts').textContent = 
                    response.products.low_stock_products || 0;
            }
            
            if (response.orders) {
                document.getElementById('totalOrders').textContent = 
                    response.orders.total_orders || 0;
            }
            
            if (response.edsa) {
                document.getElementById('totalBookings').textContent = 
                    response.edsa.pending_bookings || 0;
            }
        } catch (error) {
            console.error('Failed to load dashboard stats:', error);
        }
    }

    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // Show section
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName).classList.add('active');

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
                                <td><code>${product.sku}</code></td>
                                <td>
                                    <div style="font-weight: 500;">${product.name}</div>
                                    <div style="font-size: 0.75rem; color: var(--gray-500);">${product.category_name || 'No category'}</div>
                                </td>
                                <td>${product.brand_name || 'Unknown'}</td>
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
        
        document.getElementById('adminDashboard').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        
        // Clear forms
        document.getElementById('loginForm').reset();
        document.getElementById('loginError').style.display = 'none';
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
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
    // TODO: Implement product editing modal
    window.adminApp.showNotification('Product editing coming soon!', 'info');
}

function showAddProduct() {
    // TODO: Implement add product modal
    window.adminApp.showNotification('Add product form coming soon!', 'info');
}

function logout() {
    window.adminApp.logout();
}

// Initialize the admin app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();
});

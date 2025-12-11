// HM Herbs Admin Panel Application
// Complete admin interface with backend integration

class AdminApp {
    constructor() {
        // Dynamic API base URL configuration
        this.apiBaseUrl = this.getApiBaseUrl();
        this.authToken = localStorage.getItem('adminToken');
        this.currentUser = null;
        this.eventListeners = []; // Track event listeners for cleanup
        this.timeouts = []; // Track timeouts for cleanup

        this.init();
    }

    getApiBaseUrl() {
        // Check if we're using file:// protocol (opened directly)
        if (window.location.protocol === 'file:') {
            console.warn('⚠️ Admin panel opened via file:// protocol. Please use a web server.');
            console.warn('💡 Start the backend server: cd backend && npm start');
            console.warn('💡 Then access: http://localhost:3001/admin.html');
            // Still return the API URL for when server is running
            return 'http://localhost:3001/api';
        }

        // Check if we're in development (localhost)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // If served from backend server, use relative path
            if (window.location.port === '3001') {
                return '/api';
            }
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

        // Forgot password link
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForgotPasswordModal();
            });
        }

        // Forgot password form
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', (e) => this.handleForgotPassword(e));
        }

        // Close forgot password modal
        const closeForgotPasswordModal = document.getElementById('closeForgotPasswordModal');
        const cancelForgotPassword = document.getElementById('cancelForgotPassword');
        if (closeForgotPasswordModal) {
            closeForgotPasswordModal.addEventListener('click', () => this.hideForgotPasswordModal());
        }
        if (cancelForgotPassword) {
            cancelForgotPassword.addEventListener('click', () => this.hideForgotPasswordModal());
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

    showForgotPasswordModal() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
            modal.style.display = 'flex';
            const emailInput = document.getElementById('forgotPasswordEmail');
            if (emailInput) {
                setTimeout(() => emailInput.focus(), 100);
            }
        }
    }

    hideForgotPasswordModal() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
            modal.style.display = 'none';
            const form = document.getElementById('forgotPasswordForm');
            const errorDiv = document.getElementById('forgotPasswordError');
            const successDiv = document.getElementById('forgotPasswordSuccess');
            if (form) form.reset();
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.style.display = 'none';
            }
            if (successDiv) successDiv.style.display = 'none';
        }
    }

    async handleForgotPassword(e) {
        e.preventDefault();

        const emailInput = document.getElementById('forgotPasswordEmail');
        const errorDiv = document.getElementById('forgotPasswordError');
        const successDiv = document.getElementById('forgotPasswordSuccess');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        if (!emailInput || !errorDiv || !successDiv) return;

        const email = emailInput.value.trim();
        const originalText = submitBtn ? submitBtn.textContent : '';

        // Clear previous messages
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/admin/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (response.ok) {
                successDiv.style.display = 'block';
                if (emailInput) emailInput.value = '';
                // Auto-close modal after 3 seconds
                setTimeout(() => {
                    this.hideForgotPasswordModal();
                }, 3000);
            } else {
                errorDiv.textContent = data.error || 'Failed to send reset link. Please try again.';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            errorDiv.textContent = 'Connection error. Please try again.';
            errorDiv.style.display = 'block';
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
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
            // Log error (process.env not available in browser)
            console.error('Failed to load dashboard stats:', error);
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
            case 'orders':
                await this.loadOrders();
                break;
            case 'edsa':
                await this.loadEDSABookings();
                break;
        }
    }

    async loadOrders() {
        // Implementation for loading orders
        const container = document.getElementById('ordersTable');
        if (!container) {
            console.warn('Orders table container not found');
            return;
        }

        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading orders...</div>';

        try {
            const response = await this.apiRequest('/admin/orders?limit=50');

            if (response.orders && response.orders.length > 0) {
                container.innerHTML = this.renderOrdersTable(response.orders);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>No orders found.</p></div>';
            }
        } catch (error) {
            container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error);"><p>Failed to load orders: ${error.message}</p></div>`;
        }
    }

    renderOrdersTable(orders) {
        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Order #</th>
                            <th>Customer</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Payment</th>
                            <th>Total</th>
                            <th>Items</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orders.map(order => `
                            <tr>
                                <td><code>${this.escapeHtml(order.order_number)}</code></td>
                                <td>${this.escapeHtml((order.shipping_first_name || '') + ' ' + (order.shipping_last_name || ''))}</td>
                                <td>${this.escapeHtml(order.email)}</td>
                                <td>
                                    <span class="badge ${order.status === 'completed' ? 'badge-success' : order.status === 'pending' ? 'badge-warning' : 'badge-info'}">
                                        ${this.escapeHtml(order.status)}
                                    </span>
                                </td>
                                <td>
                                    <span class="badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}">
                                        ${this.escapeHtml(order.payment_status)}
                                    </span>
                                </td>
                                <td>$${parseFloat(order.total_amount || 0).toFixed(2)}</td>
                                <td>${order.item_count || 0}</td>
                                <td>${new Date(order.created_at).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="viewOrder(${order.id})">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async loadEDSABookings() {
        // Implementation for loading EDSA bookings
        const container = document.getElementById('edsaBookingsTable');
        if (!container) {
            console.warn('EDSA bookings table container not found');
            return;
        }

        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading EDSA bookings...</div>';

        try {
            const response = await this.apiRequest('/admin/edsa/bookings?limit=50');

            if (response.bookings && response.bookings.length > 0) {
                container.innerHTML = this.renderEDSABookingsTable(response.bookings);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>No EDSA bookings found.</p></div>';
            }
        } catch (error) {
            container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error);"><p>Failed to load EDSA bookings: ${error.message}</p></div>`;
        }
    }

    renderEDSABookingsTable(bookings) {
        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Preferred Date</th>
                            <th>Preferred Time</th>
                            <th>Confirmed Date</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bookings.map(booking => `
                            <tr>
                                <td>${this.escapeHtml((booking.first_name || '') + ' ' + (booking.last_name || ''))}</td>
                                <td>${this.escapeHtml(booking.email)}</td>
                                <td>${this.escapeHtml(booking.phone || 'N/A')}</td>
                                <td>${booking.preferred_date ? new Date(booking.preferred_date).toLocaleDateString() : 'N/A'}</td>
                                <td>${booking.preferred_time || 'N/A'}</td>
                                <td>${booking.confirmed_date ? new Date(booking.confirmed_date).toLocaleDateString() : 'Pending'}</td>
                                <td>
                                    <span class="badge ${booking.status === 'confirmed' ? 'badge-success' : booking.status === 'pending' ? 'badge-warning' : booking.status === 'cancelled' ? 'badge-danger' : 'badge-info'}">
                                        ${this.escapeHtml(booking.status)}
                                    </span>
                                </td>
                                <td>${new Date(booking.created_at).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="editEDSABooking(${booking.id})">
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

    async loadProducts() {
        const container = document.getElementById('productsTable');

        // Create loading indicator safely
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        const loadingText = document.createTextNode('Loading products...');
        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(loadingText);

        container.innerHTML = '';
        container.appendChild(loadingDiv);

        try {
            const response = await this.apiRequest('/admin/products?limit=50');

            if (response.products && response.products.length > 0) {
                container.innerHTML = this.renderProductsTable(response.products);

                // Attach event listeners to edit buttons (using event delegation)
                container.addEventListener('click', (e) => {
                    if (e.target.closest('.edit-product-btn')) {
                        const button = e.target.closest('.edit-product-btn');
                        const productId = button.getAttribute('data-product-id');
                        if (productId) {
                            editProduct(parseInt(productId));
                        }
                    }
                });
            } else {
                // Create empty state safely
                const emptyDiv = document.createElement('div');
                emptyDiv.style.textAlign = 'center';
                emptyDiv.style.padding = '2rem';
                emptyDiv.style.color = 'var(--gray-500)';

                const icon = document.createElement('i');
                icon.className = 'fas fa-box-open';
                icon.style.fontSize = '3rem';
                icon.style.marginBottom = '1rem';

                const message = document.createElement('p');
                message.textContent = 'No products found. Import products or scrape from HM Herbs website.';

                emptyDiv.appendChild(icon);
                emptyDiv.appendChild(message);

                // Add scrape button
                const scrapeBtn = document.createElement('button');
                scrapeBtn.className = 'btn btn-primary';
                scrapeBtn.onclick = () => scrapeProducts();

                const btnIcon = document.createElement('i');
                btnIcon.className = 'fas fa-download';
                const btnText = document.createTextNode(' Scrape HM Herbs Products');

                scrapeBtn.appendChild(btnIcon);
                scrapeBtn.appendChild(btnText);
                emptyDiv.appendChild(scrapeBtn);

                container.innerHTML = '';
                container.appendChild(emptyDiv);
            }
        } catch (error) {
            // Create error message safely
            const errorDiv = document.createElement('div');
            errorDiv.style.textAlign = 'center';
            errorDiv.style.padding = '2rem';
            errorDiv.style.color = 'var(--error)';

            const errorIcon = document.createElement('i');
            errorIcon.className = 'fas fa-exclamation-triangle';
            errorIcon.style.fontSize = '3rem';
            errorIcon.style.marginBottom = '1rem';

            const errorMessage = document.createElement('p');
            errorMessage.textContent = `Failed to load products: ${error.message}`;

            errorDiv.appendChild(errorIcon);
            errorDiv.appendChild(errorMessage);

            container.innerHTML = '';
            container.appendChild(errorDiv);
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
                                <td>$${parseFloat(product.price || 0).toFixed(2)}</td>
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
                                    <button class="btn btn-sm btn-secondary edit-product-btn" data-product-id="${product.id}">
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
        // Clean up event listeners and timeouts
        this.cleanup();

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

    // Add event listener with tracking for cleanup
    addEventListenerWithCleanup(element, event, handler, options = false) {
        element.addEventListener(event, handler, options);
        this.eventListeners.push({ element, event, handler, options });
    }

    // Add timeout with tracking for cleanup
    addTimeoutWithCleanup(callback, delay) {
        const timeoutId = setTimeout(callback, delay);
        this.timeouts.push(timeoutId);
        return timeoutId;
    }

    // Clean up all tracked event listeners and timeouts
    cleanup() {
        // Remove all tracked event listeners
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            try {
                element.removeEventListener(event, handler, options);
            } catch (error) {
                console.warn('Error removing event listener:', error);
            }
        });
        this.eventListeners = [];

        // Clear all tracked timeouts
        this.timeouts.forEach(timeoutId => {
            try {
                clearTimeout(timeoutId);
            } catch (error) {
                console.warn('Error clearing timeout:', error);
            }
        });
        this.timeouts = [];
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        // Create notification content safely
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; align-items: center; gap: 0.5rem;';

        const icon = document.createElement('i');
        const iconClass = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
        icon.className = `fas fa-${iconClass}`;

        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;

        container.appendChild(icon);
        container.appendChild(messageSpan);
        notification.appendChild(container);

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
        // Show progress modal
        const modal = document.getElementById('scrapingProgressModal');
        modal.style.display = 'block';

        // Reset progress
        updateScrapingProgress({
            stage: 'init',
            message: 'Starting product scraping...',
            current: 0,
            total: 0,
            percentage: 0,
            productsFound: 0
        });

        // Use EventSource for Server-Sent Events
        const eventSource = new EventSource(`${app.apiBaseUrl}/admin/scrape-products`, {
            headers: {
                'Authorization': `Bearer ${app.authToken}`
            }
        });

        // Note: EventSource doesn't support custom headers, so we need to use fetch with streaming
        // Let's use fetch with ReadableStream instead
        const response = await fetch(`${app.apiBaseUrl}/admin/scrape-products`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${app.authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.substring(6));
                        updateScrapingProgress(data);

                        if (data.stage === 'complete' || data.stage === 'error') {
                            reader.cancel();
                            if (data.stage === 'complete') {
                                setTimeout(() => {
                                    closeScrapingProgress();
                                    app.showNotification(`Successfully scraped ${data.productsFound || 0} products!`, 'success');
                                    app.loadProducts(); // Reload products table
                                }, 2000);
                            } else {
                                setTimeout(() => {
                                    closeScrapingProgress();
                                    app.showNotification(data.message || 'Scraping failed', 'error');
                                }, 2000);
                            }
                            return;
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Scraping error:', error);
        closeScrapingProgress();
        app.showNotification('Failed to start scraping: ' + error.message, 'error');
    }
}

function updateScrapingProgress(data) {
    const statusEl = document.getElementById('scrapingStatus');
    const progressBar = document.getElementById('scrapingProgressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const totalProductsEl = document.getElementById('totalProducts');
    const scrapedCountEl = document.getElementById('scrapedCount');
    const validProductsEl = document.getElementById('validProducts');

    if (statusEl) statusEl.textContent = data.message || 'Processing...';
    if (progressBar) {
        const percentage = data.percentage || 0;
        progressBar.style.width = `${percentage}%`;
    }
    if (progressPercentage) {
        const percentage = data.percentage || 0;
        progressPercentage.textContent = `${percentage}%`;
    }
    if (totalProductsEl) totalProductsEl.textContent = data.total || 0;
    if (scrapedCountEl) scrapedCountEl.textContent = data.current || 0;
    if (validProductsEl) validProductsEl.textContent = data.productsFound || 0;
}

function closeScrapingProgress() {
    const modal = document.getElementById('scrapingProgressModal');
    if (modal) {
        modal.style.display = 'none';
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

// Helper function to create form elements safely
function createFormElement(type, attributes = {}, textContent = '') {
    const element = document.createElement(type);

    // Set attributes safely
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'textContent') {
            element.textContent = value;
        } else {
            element.setAttribute(key, value);
        }
    });

    if (textContent) {
        element.textContent = textContent;
    }

    return element;
}

// Helper function to create modal structure safely
function createProductModal(title, formId, isEdit = false) {
    const modal = document.createElement('div');
    modal.className = 'modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    // Event listener will be attached after modal is added to DOM

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';

    const form = document.createElement('form');
    form.id = formId;

    // Create form fields
    const fields = [
        { type: 'input', label: 'SKU *', id: `${isEdit ? 'edit' : 'add'}-sku`, name: 'sku', inputType: 'text', required: true },
        { type: 'input', label: 'Product Name *', id: `${isEdit ? 'edit' : 'add'}-name`, name: 'name', inputType: 'text', required: true },
        { type: 'textarea', label: 'Short Description', id: `${isEdit ? 'edit' : 'add'}-short-description`, name: 'short_description', rows: 2 },
        { type: 'textarea', label: 'Long Description', id: `${isEdit ? 'edit' : 'add'}-long-description`, name: 'long_description', rows: 4 }
    ];

    // Add brand and category selects for add modal only
    if (!isEdit) {
        fields.push(
            {
                type: 'select', label: 'Brand *', id: 'add-brand', name: 'brand_id', required: true, options: [
                    { value: '', text: 'Select Brand' },
                    { value: '1', text: 'HM Herbs' },
                    { value: '2', text: 'Nature\'s Way' },
                    { value: '3', text: 'Garden of Life' }
                ]
            },
            {
                type: 'select', label: 'Category *', id: 'add-category', name: 'category_id', required: true, options: [
                    { value: '', text: 'Select Category' },
                    { value: '1', text: 'Herbs & Botanicals' },
                    { value: '2', text: 'Vitamins' },
                    { value: '3', text: 'Supplements' },
                    { value: '4', text: 'Essential Oils' }
                ]
            }
        );
    }

    // Add remaining fields
    fields.push(
        { type: 'input', label: 'Price *', id: `${isEdit ? 'edit' : 'add'}-price`, name: 'price', inputType: 'number', step: '0.01', min: '0', required: true },
        { type: 'input', label: 'Compare Price', id: `${isEdit ? 'edit' : 'add'}-compare-price`, name: 'compare_price', inputType: 'number', step: '0.01', min: '0' },
        { type: 'input', label: 'Inventory Quantity *', id: `${isEdit ? 'edit' : 'add'}-inventory`, name: 'inventory_quantity', inputType: 'number', min: '0', required: true },
        { type: 'input', label: 'Low Stock Threshold', id: `${isEdit ? 'edit' : 'add'}-low-stock`, name: 'low_stock_threshold', inputType: 'number', min: '0', value: '10' },
        { type: 'input', label: 'Weight (oz)', id: `${isEdit ? 'edit' : 'add'}-weight`, name: 'weight', inputType: 'number', step: '0.01', min: '0' }
    );

    // Add health categories for add modal only
    if (!isEdit) {
        fields.push({ type: 'input', label: 'Health Categories (comma-separated)', id: 'add-health-categories', name: 'health_categories', inputType: 'text', placeholder: 'e.g., immune support, digestive health' });
    }

    // Create form fields
    let currentRow = null;
    fields.forEach((field, index) => {
        const isRowField = (field.label.includes('Price') && field.label !== 'Compare Price') ||
            (field.label.includes('Brand') || field.label.includes('Category')) ||
            (field.label.includes('Inventory') || field.label.includes('Low Stock'));

        if (isRowField && (!currentRow || currentRow.children.length >= 2)) {
            currentRow = document.createElement('div');
            currentRow.className = 'form-row';
            form.appendChild(currentRow);
        }

        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.setAttribute('for', field.id);
        label.textContent = field.label;
        formGroup.appendChild(label);

        if (field.type === 'input') {
            const input = document.createElement('input');
            input.setAttribute('type', field.inputType);
            input.id = field.id;
            input.setAttribute('name', field.name);
            if (field.required) input.setAttribute('required', '');
            if (field.step) input.setAttribute('step', field.step);
            if (field.min) input.setAttribute('min', field.min);
            if (field.value) input.setAttribute('value', field.value);
            if (field.placeholder) input.setAttribute('placeholder', field.placeholder);
            formGroup.appendChild(input);
        } else if (field.type === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.id = field.id;
            textarea.setAttribute('name', field.name);
            if (field.rows) textarea.setAttribute('rows', field.rows.toString());
            formGroup.appendChild(textarea);
        } else if (field.type === 'select') {
            const select = document.createElement('select');
            select.id = field.id;
            select.setAttribute('name', field.name);
            if (field.required) select.setAttribute('required', '');

            field.options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.setAttribute('value', option.value);
                optionEl.textContent = option.text;
                select.appendChild(optionEl);
            });
            formGroup.appendChild(select);
        }

        if (isRowField && currentRow) {
            currentRow.appendChild(formGroup);
        } else {
            form.appendChild(formGroup);
        }
    });

    // Add checkboxes
    const checkboxRow = document.createElement('div');
    checkboxRow.className = 'form-row';

    const activeGroup = document.createElement('div');
    activeGroup.className = 'form-group';
    const activeLabel = document.createElement('label');
    const activeCheckbox = document.createElement('input');
    activeCheckbox.setAttribute('type', 'checkbox');
    activeCheckbox.id = `${isEdit ? 'edit' : 'add'}-is-active`;
    activeCheckbox.setAttribute('name', 'is_active');
    activeCheckbox.checked = true;
    activeLabel.appendChild(activeCheckbox);
    activeLabel.appendChild(document.createTextNode(' Active Product'));
    activeGroup.appendChild(activeLabel);

    const featuredGroup = document.createElement('div');
    featuredGroup.className = 'form-group';
    const featuredLabel = document.createElement('label');
    const featuredCheckbox = document.createElement('input');
    featuredCheckbox.setAttribute('type', 'checkbox');
    featuredCheckbox.id = `${isEdit ? 'edit' : 'add'}-is-featured`;
    featuredCheckbox.setAttribute('name', 'is_featured');
    featuredLabel.appendChild(featuredCheckbox);
    featuredLabel.appendChild(document.createTextNode(' Featured Product'));
    featuredGroup.appendChild(featuredLabel);

    checkboxRow.appendChild(activeGroup);
    checkboxRow.appendChild(featuredGroup);
    form.appendChild(checkboxRow);

    // Add image section
    const imageSection = document.createElement('div');
    imageSection.className = 'form-group';
    imageSection.style.marginTop = '1.5rem';

    const imageLabel = document.createElement('label');
    imageLabel.textContent = 'Product Images';
    imageSection.appendChild(imageLabel);

    const imageContainer = document.createElement('div');
    imageContainer.id = `${isEdit ? 'edit' : 'add'}-images-container`;
    imageContainer.style.marginTop = '0.5rem';

    // Image input section - URL and File upload
    const imageInputRow = document.createElement('div');
    imageInputRow.style.display = 'flex';
    imageInputRow.style.flexDirection = 'column';
    imageInputRow.style.gap = '0.5rem';
    imageInputRow.style.marginBottom = '0.5rem';

    // File upload input
    const fileInputWrapper = document.createElement('div');
    fileInputWrapper.style.display = 'flex';
    fileInputWrapper.style.gap = '0.5rem';
    fileInputWrapper.style.alignItems = 'center';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp';
    fileInput.className = 'form-input';
    fileInput.style.flex = '1';
    fileInput.id = `${isEdit ? 'edit' : 'add'}-image-file`;
    fileInput.setAttribute('data-prefix', isEdit ? 'edit' : 'add');

    const uploadImageBtn = document.createElement('button');
    uploadImageBtn.type = 'button';
    uploadImageBtn.className = 'btn btn-primary upload-image-btn';
    uploadImageBtn.textContent = 'Upload Image';
    uploadImageBtn.setAttribute('data-prefix', isEdit ? 'edit' : 'add');

    fileInputWrapper.appendChild(fileInput);
    fileInputWrapper.appendChild(uploadImageBtn);

    // URL input (alternative method)
    const urlInputRow = document.createElement('div');
    urlInputRow.style.display = 'flex';
    urlInputRow.style.gap = '0.5rem';
    urlInputRow.style.alignItems = 'center';

    const imageUrlInput = document.createElement('input');
    imageUrlInput.type = 'text';
    imageUrlInput.placeholder = 'Or enter image URL';
    imageUrlInput.className = 'form-input';
    imageUrlInput.style.flex = '1';
    imageUrlInput.id = `${isEdit ? 'edit' : 'add'}-image-url`;

    const addImageBtn = document.createElement('button');
    addImageBtn.type = 'button';
    addImageBtn.className = 'btn btn-secondary add-image-btn';
    addImageBtn.textContent = 'Add URL';
    addImageBtn.setAttribute('data-prefix', isEdit ? 'edit' : 'add');

    urlInputRow.appendChild(imageUrlInput);
    urlInputRow.appendChild(addImageBtn);

    imageInputRow.appendChild(fileInputWrapper);
    imageInputRow.appendChild(urlInputRow);
    imageContainer.appendChild(imageInputRow);

    // Images list container
    const imagesList = document.createElement('div');
    imagesList.id = `${isEdit ? 'edit' : 'add'}-images-list`;
    imagesList.style.display = 'flex';
    imagesList.style.flexWrap = 'wrap';
    imagesList.style.gap = '1rem';
    imagesList.style.marginTop = '1rem';
    imageContainer.appendChild(imagesList);

    imageSection.appendChild(imageContainer);
    form.appendChild(imageSection);

    // Form actions
    const actions = document.createElement('div');
    actions.className = 'form-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.className = 'modal-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    // Use event listener instead of onclick to avoid CSP issues

    const submitBtn = document.createElement('button');
    submitBtn.setAttribute('type', 'submit');
    submitBtn.textContent = isEdit ? 'Update Product' : 'Add Product';

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    body.appendChild(form);
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modal.appendChild(modalContent);

    // Attach event listeners after modal is created (to avoid CSP issues)
    // Use event delegation on the modal for better reliability
    modal.addEventListener('click', function (e) {
        // Close button (×)
        if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
            e.preventDefault();
            modal.remove();
            return;
        }

        // Cancel button
        if (e.target.classList.contains('modal-cancel-btn') || e.target.closest('.modal-cancel-btn')) {
            e.preventDefault();
            modal.remove();
            return;
        }

        // Upload Image button (file upload)
        if (e.target.classList.contains('upload-image-btn') || e.target.closest('.upload-image-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.upload-image-btn') || e.target;
            const prefix = btn.getAttribute('data-prefix');
            const fileInput = document.getElementById(`${prefix}-image-file`);
            if (fileInput && fileInput.files && fileInput.files[0]) {
                uploadImageFile(fileInput.files[0], prefix);
            } else {
                window.adminApp.showNotification('Please select an image file', 'error');
            }
            return;
        }
        // Upload Image button (file upload)
        if (e.target.classList.contains('upload-image-btn') || e.target.closest('.upload-image-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.upload-image-btn') || e.target;
            const prefix = btn.getAttribute('data-prefix');
            const fileInput = document.getElementById(`${prefix}-image-file`);
            if (fileInput && fileInput.files && fileInput.files[0]) {
                uploadImageFile(fileInput.files[0], prefix);
            } else {
                window.adminApp.showNotification('Please select an image file', 'error');
            }
            return;
        }

        // Add Image button (URL)
        if (e.target.classList.contains('add-image-btn') || e.target.closest('.add-image-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.add-image-btn') || e.target;
            const prefix = btn.getAttribute('data-prefix');
            const urlInput = document.getElementById(`${prefix}-image-url`);
            if (urlInput) {
                const url = urlInput.value.trim();
                if (url) {
                    addImageToList(null, url, prefix);
                    urlInput.value = '';
                }
            }
            return;
        }

        // Remove image button
        if (e.target.classList.contains('remove-image-btn') || e.target.closest('.remove-image-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.remove-image-btn') || e.target;
            const imageItem = btn.closest('div[style*="position: relative"]');
            if (imageItem) {
                imageItem.remove();
            }
            return;
        }
    });

    return modal;
}

// Function to upload image file
async function uploadImageFile(file, prefix) {
    try {
        const app = window.adminApp;
        const formData = new FormData();
        formData.append('image', file);

        // Show loading state
        const uploadBtn = document.querySelector(`[data-prefix="${prefix}"].upload-image-btn`);
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';
        }

        const response = await fetch(`${app.apiBaseUrl}/admin/upload-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.imageUrl) {
            // Add the uploaded image to the list
            addImageToList(null, data.imageUrl, prefix);

            // Clear the file input
            const fileInput = document.getElementById(`${prefix}-image-file`);
            if (fileInput) {
                fileInput.value = '';
            }

            window.adminApp.showNotification('Image uploaded successfully!', 'success');
        } else {
            window.adminApp.showNotification(data.error || 'Failed to upload image', 'error');
        }

        // Reset button
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload Image';
        }
    } catch (error) {
        console.error('Upload error:', error);
        window.adminApp.showNotification('Error uploading image: ' + error.message, 'error');

        // Reset button
        const uploadBtn = document.querySelector(`[data-prefix="${prefix}"].upload-image-btn`);
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload Image';
        }
    }
}

// Helper function to add image to the images list
function addImageToList(container, imageUrl, prefix) {
    const imagesList = document.getElementById(`${prefix}-images-list`);
    if (!imagesList) {
        console.error('Images list not found');
        return;
    }

    const imageItem = document.createElement('div');
    imageItem.style.position = 'relative';
    imageItem.style.width = '150px';
    imageItem.style.marginBottom = '0.5rem';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.width = '100%';
    img.style.height = '150px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '4px';
    img.style.border = '1px solid var(--gray-300)';
    img.onerror = function () {
        this.style.display = 'none';
        imageItem.innerHTML = '<div style="padding: 1rem; background: var(--gray-100); border-radius: 4px; text-align: center; color: var(--gray-500);">Invalid image</div>';
    };

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm';
    removeBtn.style.position = 'absolute';
    removeBtn.style.top = '5px';
    removeBtn.style.right = '5px';
    removeBtn.style.background = 'rgba(255, 0, 0, 0.8)';
    removeBtn.style.color = 'white';
    removeBtn.style.border = 'none';
    removeBtn.style.borderRadius = '50%';
    removeBtn.style.width = '24px';
    removeBtn.style.height = '24px';
    removeBtn.style.cursor = 'pointer';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function () {
        imageItem.remove();
    });

    const urlInput = document.createElement('input');
    urlInput.type = 'hidden';
    urlInput.name = `${prefix}_image_urls[]`;
    urlInput.value = imageUrl;

    imageItem.appendChild(img);
    imageItem.appendChild(removeBtn);
    imageItem.appendChild(urlInput);
    imagesList.appendChild(imageItem);
}

function editProduct(productId) {
    try {
        // Check if adminApp is available
        if (!window.adminApp) {
            alert('Admin app not initialized. Please refresh the page.');
            return;
        }

        if (!productId) {
            window.adminApp.showNotification('Product ID is required', 'error');
            return;
        }

        // Create and show product editing modal using safe helper
        const modal = createProductModal('Edit Product', 'edit-product-form', true);

        if (!modal) {
            console.error('Failed to create modal');
            window.adminApp.showNotification('Error: Failed to create modal', 'error');
            return;
        }

        document.body.appendChild(modal);
        modal.style.display = 'block';
        modal.style.zIndex = '10000';

        // Wait a bit for the form to be in the DOM before accessing it
        setTimeout(() => {
            // Load existing product data
            loadProductForEdit(productId);

            // Handle form submission
            const form = document.getElementById('edit-product-form');
            if (form) {
                // Remove any existing listeners to prevent duplicates
                const newForm = form.cloneNode(true);
                form.parentNode.replaceChild(newForm, form);

                document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    try {
                        await updateProduct(productId, new FormData(e.target));
                        modal.remove();
                    } catch (error) {
                        console.error('Error updating product:', error);
                    }
                });
            } else {
                console.error('Edit product form not found');
                window.adminApp.showNotification('Error: Form not found', 'error');
            }
        }, 100);

    } catch (error) {
        console.error('Error showing edit product modal:', error);
        if (window.adminApp) {
            window.adminApp.showNotification('Error opening edit product form: ' + error.message, 'error');
        } else {
            alert('Error opening edit product form: ' + error.message);
        }
    }
}

// Make sure function is globally accessible
window.editProduct = editProduct;

async function loadProductForEdit(productId) {
    try {
        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/products/${productId}`, {
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

            // Load existing images
            const imagesList = document.getElementById('edit-images-list');
            if (imagesList && product.images && product.images.length > 0) {
                imagesList.innerHTML = ''; // Clear any existing
                product.images.forEach(image => {
                    addImageToList(null, image.image_url || image.url, 'edit');
                });
            }
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
        const imageUrls = [];

        for (let [key, value] of formData.entries()) {
            if (key === 'is_active' || key === 'is_featured') {
                productData[key] = true; // Checkbox was checked
            } else if (key.startsWith('edit_image_urls[')) {
                // Collect image URLs
                imageUrls.push(value);
            } else {
                productData[key] = value;
            }
        }

        // Handle unchecked checkboxes
        if (!formData.has('is_active')) productData.is_active = false;
        if (!formData.has('is_featured')) productData.is_featured = false;

        // Convert image URLs to images array format
        if (imageUrls.length > 0) {
            productData.images = imageUrls.map((url, index) => ({
                url: url,
                alt: productData.name || 'Product image',
                is_primary: index === 0
            }));
        }

        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/products/${productId}`, {
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
    try {
        // Check if adminApp is available
        if (!window.adminApp) {
            alert('Admin app not initialized. Please refresh the page.');
            console.error('Admin app not initialized');
            return;
        }

        console.log('Creating modal...');
        // Create and show add product modal using safe helper
        const modal = createProductModal('Add New Product', 'add-product-form', false);

        if (!modal) {
            console.error('Failed to create modal');
            window.adminApp.showNotification('Error: Failed to create modal', 'error');
            return;
        }

        console.log('Appending modal to body...');
        // Append modal to body and make it visible
        document.body.appendChild(modal);
        modal.style.display = 'block';

        // Ensure modal is on top
        modal.style.zIndex = '10000';
        console.log('Modal should be visible now');

        // Add event listener for form submission
        const form = document.getElementById('add-product-form');
        if (!form) {
            console.error('Add product form not found');
            window.adminApp.showNotification('Error: Form not found', 'error');
            return;
        }

        console.log('Form found, adding submit handler...');
        // Add submit handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await createProduct(new FormData(e.target));
                modal.remove();
            } catch (error) {
                console.error('Error creating product:', error);
            }
        });

    } catch (error) {
        console.error('Error showing add product modal:', error);
        console.error('Error stack:', error.stack);
        if (window.adminApp) {
            window.adminApp.showNotification('Error opening add product form: ' + error.message, 'error');
        } else {
            alert('Error opening add product form: ' + error.message);
        }
    }
}

// Make sure function is globally accessible - define it immediately
window.showAddProduct = showAddProduct;
console.log('showAddProduct function defined on window object');

async function createProduct(formData) {
    try {
        const productData = {};
        const imageUrls = [];

        for (let [key, value] of formData.entries()) {
            if (key === 'is_active' || key === 'is_featured') {
                productData[key] = true; // Checkbox was checked
            } else if (key === 'health_categories') {
                // Convert comma-separated string to array
                productData[key] = value.split(',').map(cat => cat.trim()).filter(cat => cat);
            } else if (key.startsWith('add_image_urls[')) {
                // Collect image URLs
                imageUrls.push(value);
            } else {
                productData[key] = value;
            }
        }

        // Handle unchecked checkboxes
        if (!formData.has('is_active')) productData.is_active = false;
        if (!formData.has('is_featured')) productData.is_featured = false;

        // Convert image URLs to images array format
        if (imageUrls.length > 0) {
            productData.images = imageUrls.map((url, index) => ({
                url: url,
                alt: productData.name || 'Product image',
                is_primary: index === 0
            }));
        }

        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/products`, {
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

// Helper functions for action buttons
function viewOrder(orderId) {
    window.adminApp.showNotification(`View order ${orderId} - Feature coming soon`, 'info');
    // TODO: Implement order detail modal
}

function editEDSABooking(bookingId) {
    window.adminApp.showNotification(`Edit EDSA booking ${bookingId} - Feature coming soon`, 'info');
    // TODO: Implement EDSA booking edit modal
}

// Initialize the admin app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();

    // Set up Add Product button event listener
    const addProductBtn = document.querySelector('button[onclick="showAddProduct()"]');
    if (addProductBtn) {
        // Remove the inline onclick and add event listener
        addProductBtn.removeAttribute('onclick');
        addProductBtn.addEventListener('click', function (e) {
            e.preventDefault();
            console.log('Add Product button clicked via event listener');
            showAddProduct();
        });
        console.log('Add Product button event listener attached');
    } else {
        console.warn('Add Product button not found');
    }
});

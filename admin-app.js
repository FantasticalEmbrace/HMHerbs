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
        this.allProducts = []; // Store all products for search/filtering
        this.allBrands = []; // Store all brands for filtering
        this.allCategories = []; // Store all categories for filtering
        this.allCategoriesForFilter = []; // Store all categories for category section filtering
        this.productsPagination = {
            currentPage: 1,
            itemsPerPage: 50,
            totalPages: 1,
            totalProducts: 0,
            useServerPagination: true // Use server pagination when no filters active
        };
        this.categoriesPagination = {
            currentPage: 1,
            itemsPerPage: 50,
            totalPages: 1,
            totalCategories: 0
        };

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
        // Ensure login screen is visible and dashboard is hidden initially
        const loginScreen = document.getElementById('loginScreen');
        const adminDashboard = document.getElementById('adminDashboard');
        if (loginScreen) loginScreen.style.display = 'flex';
        if (adminDashboard) adminDashboard.style.display = 'none';

        // Check if user is already logged in
        if (this.authToken) {
            try {
                // Try to verify token by loading dashboard stats
                const response = await this.apiRequest('/admin/dashboard/stats');
                if (!response) {
                    // 403 or null response means invalid token
                    this.logout();
                    return;
                }
                // Token is valid, load dashboard
                await this.loadDashboard();
            } catch (error) {
                // If dashboard load fails (e.g., invalid/expired token), logout silently
                // Don't log errors for authentication failures - they're expected
                if (error.message === 'Authentication required' ||
                    error.message.includes('Invalid admin token') ||
                    error.message.includes('403')) {
                    this.logout();
                } else {
                    // Only log unexpected errors
                    console.error('Failed to load dashboard:', error);
                    this.logout();
                }
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
                // Show detailed error message from server
                const errorMessage = data.error || data.details || 'Login failed';
                errorDiv.textContent = errorMessage;
                errorDiv.style.display = 'block';

                // Log full error for debugging
                console.error('Login error:', {
                    status: response.status,
                    error: data.error,
                    details: data.details
                });
            }
        } catch (error) {
            errorDiv.textContent = 'Connection error. Please try again.';
            errorDiv.style.display = 'block';
            console.error('Login request failed:', error);
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
        // Don't try to load stats if user isn't authenticated
        if (!this.authToken) {
            // Clear loading state if not authenticated
            const recentActivityEl = document.getElementById('recentActivity');
            if (recentActivityEl) {
                recentActivityEl.className = '';
                recentActivityEl.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">Please log in to view activity</p>';
            }
            return;
        }

        try {
            // Note: Browser will log 403 errors in console for invalid/expired tokens
            // This is expected browser behavior and cannot be prevented
            // Our code handles 403s gracefully by returning null
            const response = await this.apiRequest('/admin/dashboard/stats');

            // Handle case where response is null (403 Forbidden - not authenticated)
            if (!response) {
                // Clear loading state
                const recentActivityEl = document.getElementById('recentActivity');
                if (recentActivityEl) {
                    recentActivityEl.className = '';
                    recentActivityEl.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">Please log in to view activity</p>';
                }
                return;
            }

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

            // Render recent activity
            if (response.recentActivity) {
                this.renderRecentActivity(response.recentActivity);
            } else {
                // If no recent activity data, show empty state
                const recentActivityEl = document.getElementById('recentActivity');
                if (recentActivityEl) {
                    recentActivityEl.className = '';
                    recentActivityEl.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">No recent activity</p>';
                }
            }
        } catch (error) {
            // Always clear loading state on error
            const recentActivityEl = document.getElementById('recentActivity');
            if (recentActivityEl) {
                recentActivityEl.className = '';
            }

            // Completely silent for authentication errors - they're expected when not logged in
            const errorMsg = (error.message || '').toLowerCase();
            const isAuthError = errorMsg.includes('authentication required') ||
                errorMsg.includes('invalid admin token') ||
                errorMsg.includes('403') ||
                errorMsg.includes('forbidden') ||
                errorMsg.includes('unauthorized') ||
                errorMsg.includes('401');

            if (!isAuthError) {
                // Only log unexpected errors
                console.error('Failed to load dashboard stats:', error);
                this.showNotification('Failed to load dashboard statistics', 'error');
                // Show error message in recent activity section
                if (recentActivityEl) {
                    recentActivityEl.innerHTML = '<p style="text-align: center; color: var(--error); padding: 2rem;">Failed to load recent activity</p>';
                }
            } else {
                // For auth errors, show login message
                if (recentActivityEl) {
                    recentActivityEl.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">Please log in to view activity</p>';
                }
            }
        }
    }

    renderRecentActivity(activity) {
        const recentActivityEl = document.getElementById('recentActivity');
        if (!recentActivityEl) return;

        // Remove loading class
        recentActivityEl.className = '';

        const activities = [];

        // Add recent orders
        if (activity.orders && activity.orders.length > 0) {
            activity.orders.forEach(order => {
                activities.push({
                    type: 'order',
                    icon: 'fa-shopping-cart',
                    title: `Order #${order.order_number || order.id}`,
                    description: `${order.customer_name || 'Customer'} - $${parseFloat(order.total_amount || 0).toFixed(2)}`,
                    status: order.status,
                    time: this.formatTimeAgo(order.created_at)
                });
            });
        }

        // Add recent products
        if (activity.products && activity.products.length > 0) {
            activity.products.forEach(product => {
                activities.push({
                    type: 'product',
                    icon: 'fa-box',
                    title: 'New Product',
                    description: product.name || product.sku,
                    time: this.formatTimeAgo(product.created_at)
                });
            });
        }

        // Add recent bookings
        if (activity.bookings && activity.bookings.length > 0) {
            activity.bookings.forEach(booking => {
                activities.push({
                    type: 'booking',
                    icon: 'fa-calendar',
                    title: 'EDSA Booking',
                    description: `${booking.customer_name || 'Customer'} - ${booking.appointment_date ? new Date(booking.appointment_date).toLocaleDateString() : 'Pending'}`,
                    status: booking.status,
                    time: this.formatTimeAgo(booking.created_at)
                });
            });
        }

        // Sort by time (most recent first) - activities already sorted by created_at DESC from DB
        // Limit to 10 most recent
        const recentActivities = activities.slice(0, 10);

        if (recentActivities.length === 0) {
            recentActivityEl.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">No recent activity</p>';
            return;
        }

        recentActivityEl.innerHTML = `
            <div class="activity-list">
                ${recentActivities.map(activity => `
                    <div class="activity-item">
                        <div class="activity-icon">
                            <i class="fas ${activity.icon}"></i>
                        </div>
                        <div class="activity-content">
                            <div class="activity-title">${this.escapeHtml(activity.title)}</div>
                            <div class="activity-description">${this.escapeHtml(activity.description)}</div>
                            ${activity.status ? `<span class="activity-status badge badge-${activity.status === 'pending' ? 'warning' : activity.status === 'completed' || activity.status === 'confirmed' ? 'success' : 'info'}">${activity.status}</span>` : ''}
                        </div>
                        <div class="activity-time">${activity.time}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    formatTimeAgo(dateString) {
        if (!dateString) return 'Unknown';

        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffInSeconds = Math.floor((now - date) / 1000);

            if (diffInSeconds < 60) {
                return 'Just now';
            } else if (diffInSeconds < 3600) {
                const minutes = Math.floor(diffInSeconds / 60);
                return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
            } else if (diffInSeconds < 86400) {
                const hours = Math.floor(diffInSeconds / 3600);
                return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
            } else if (diffInSeconds < 604800) {
                const days = Math.floor(diffInSeconds / 86400);
                return `${days} day${days !== 1 ? 's' : ''} ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return 'Unknown';
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
        // For products section, ensure DOM is ready before loading
        if (sectionName === 'products') {
            // Use requestAnimationFrame to ensure section is visible and DOM is ready
            requestAnimationFrame(() => {
                // Double-check section is actually visible
                const section = document.getElementById(sectionName);
                if (section && section.classList.contains('active')) {
                    this.loadSectionData(sectionName);
                } else {
                    // Section not visible yet, wait a bit more
                    setTimeout(() => {
                        this.loadSectionData(sectionName);
                    }, 100);
                }
            });
        } else {
            this.loadSectionData(sectionName);
        }
    }

    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'dashboard':
                await this.loadDashboardStats();
                break;
            case 'products':
                // Ensure brands and categories are loaded first for the filter dropdowns
                // This ensures filters are populated before products are loaded
                await Promise.all([
                    this.loadBrandsForFilters(),
                    this.loadCategoriesForFilters()
                ]);
                // Then load products - ensure this completes before any rendering
                await this.loadProducts();
                // After loadProducts completes, ensure render happens
                // loadProducts will call renderFilteredProductsImmediate, but add a safeguard
                if (this.allProducts.length > 0) {
                    // Products loaded successfully, ensure they're rendered
                    requestAnimationFrame(() => {
                        if (this.allProducts.length > 0) {
                            this.renderFilteredProductsImmediate();
                        }
                    });
                }
                break;
            case 'categories':
                await this.loadCategories();
                break;
            case 'brands':
                await this.loadBrands();
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

        // Don't make API call if not authenticated
        if (!this.authToken) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view orders.</p></div>';
            return;
        }

        try {
            const response = await this.apiRequest('/admin/orders?limit=50');

            // Handle null response (403 Forbidden)
            if (!response) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view orders.</p></div>';
                return;
            }

            if (response.orders && response.orders.length > 0) {
                container.innerHTML = this.renderOrdersTable(response.orders);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>No orders found.</p></div>';
            }
        } catch (error) {
            // Don't show error for authentication issues
            if (error.message === 'Authentication required' || error.message.includes('Invalid admin token')) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view orders.</p></div>';
            } else {
                container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error);"><p>Failed to load orders: ${error.message}</p></div>`;
            }
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

        // Don't make API call if not authenticated
        if (!this.authToken) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view EDSA bookings.</p></div>';
            return;
        }

        try {
            const response = await this.apiRequest('/admin/edsa/bookings?limit=50');

            // Handle null response (403 Forbidden)
            if (!response) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view EDSA bookings.</p></div>';
                return;
            }

            if (response.bookings && response.bookings.length > 0) {
                container.innerHTML = this.renderEDSABookingsTable(response.bookings);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>No EDSA bookings found.</p></div>';
            }
        } catch (error) {
            // Don't show error for authentication issues
            if (error.message === 'Authentication required' || error.message.includes('Invalid admin token')) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view EDSA bookings.</p></div>';
            } else {
                container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error);"><p>Failed to load EDSA bookings: ${error.message}</p></div>`;
            }
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
        // Prevent multiple simultaneous loads
        if (this._loadingProducts) {
            console.log('⏸️ Products already loading, skipping duplicate request');
            return;
        }

        this._loadingProducts = true;
        const container = document.getElementById('productsTable');

        // Create loading indicator safely
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        const loadingText = document.createTextNode('Loading products...');
        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(loadingText);

        if (container) {
            container.innerHTML = '';
            container.appendChild(loadingDiv);
        }

        // Don't make API call if not authenticated
        if (!this.authToken) {
            if (container) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view products.</p></div>';
            }
            this._loadingProducts = false;
            return;
        }

        try {
            // Check if we should use server-side pagination or fetch all
            // Preserve filter values before setupProductsSearch clones elements
            const searchInput = document.getElementById('productsSearchInput');
            const brandFilter = document.getElementById('productsBrandFilter');
            const categoryFilter = document.getElementById('productsCategoryFilter');

            const featuredFilter = document.getElementById('productsFeaturedFilter');
            const preservedSearchValue = searchInput ? searchInput.value : '';
            const preservedBrandValue = brandFilter ? brandFilter.value : '';
            const preservedCategoryValue = categoryFilter ? categoryFilter.value : '';
            const preservedFeaturedValue = featuredFilter ? featuredFilter.value : '';

            const hasSearch = preservedSearchValue.trim() !== '';
            const hasBrandFilter = preservedBrandValue !== '';
            const hasCategoryFilter = preservedCategoryValue !== '';
            const hasFeaturedFilter = preservedFeaturedValue !== '';
            const hasFilters = hasSearch || hasBrandFilter || hasCategoryFilter || hasFeaturedFilter;

            // If filters are active, fetch all products for client-side filtering
            // Otherwise, use server-side pagination
            let response;
            if (hasFilters) {
                // When filters are active, fetch a large batch for client-side filtering
                // We'll paginate the filtered results client-side
                this.productsPagination.useServerPagination = false;
                console.log('🔍 Filters active, fetching all products for client-side filtering...');
                response = await this.apiRequest(`/admin/products?limit=10000&page=1`);
            } else {
                // Use server-side pagination when no filters
                this.productsPagination.useServerPagination = true;
                const page = this.productsPagination.currentPage;
                const limit = this.productsPagination.itemsPerPage;
                console.log('📄 No filters, using server-side pagination:', { page, limit });
                response = await this.apiRequest(`/admin/products?limit=${limit}&page=${page}`);
            }

            console.log('📥 API Response received:', {
                hasResponse: !!response,
                hasProducts: !!(response && response.products),
                productsCount: response && response.products ? response.products.length : 0,
                hasPagination: !!(response && response.pagination),
                responseKeys: response ? Object.keys(response) : []
            });

            // Handle null response (403 Forbidden)
            if (!response) {
                if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view products.</p></div>';
                }
                this._loadingProducts = false;
                return;
            }

            if (response.products && response.products.length > 0) {
                // Update pagination info if available
                if (response.pagination) {
                    this.productsPagination.totalPages = response.pagination.totalPages;
                    this.productsPagination.totalProducts = response.pagination.totalProducts;
                    this.productsPagination.currentPage = response.pagination.currentPage;
                }

                // Store all products for search/filtering
                // Always replace with fresh products to ensure we have the latest data
                this.allProducts = response.products || [];

                console.log('✅ Products stored in allProducts:', {
                    count: this.allProducts.length,
                    useServerPagination: this.productsPagination.useServerPagination,
                    totalProducts: this.productsPagination.totalProducts,
                    sampleNames: this.allProducts.slice(0, 3).map(p => p.name),
                    responseProductsCount: response.products ? response.products.length : 0,
                    hasPagination: !!response.pagination
                });

                // Log sample products to verify they have category_id and is_featured
                if (this.allProducts.length > 0) {
                    console.log('📦 Sample products after loading:', this.allProducts.slice(0, 5).map(p => ({
                        id: p.id,
                        name: p.name,
                        category_id: p.category_id,
                        category_name: p.category_name,
                        brand_id: p.brand_id,
                        brand_name: p.brand_name,
                        is_featured: p.is_featured,
                        is_featured_type: typeof p.is_featured,
                        is_featured_raw: p.is_featured,
                        allKeys: Object.keys(p)
                    })));

                    // Check specifically for featured products
                    const featuredProducts = this.allProducts.filter(p =>
                        p.is_featured === true ||
                        p.is_featured === 1 ||
                        p.is_featured === '1' ||
                        p.is_featured === 'true'
                    );
                    console.log('⭐ Featured products found:', {
                        count: featuredProducts.length,
                        products: featuredProducts.map(p => ({
                            id: p.id,
                            name: p.name,
                            is_featured: p.is_featured,
                            is_featured_type: typeof p.is_featured
                        }))
                    });
                }

                // Setup search and filter functionality FIRST (before populating filters)
                // Only setup if not already set up to prevent losing focus
                const existingSearchInput = document.getElementById('productsSearchInput');
                if (!existingSearchInput || !existingSearchInput.hasAttribute('data-listeners-setup')) {
                    this.setupProductsSearch();
                }
                // Load brands and categories for filters (after setup, so cloned elements get populated)
                await this.loadBrandsForFilters();
                await this.loadCategoriesForFilters();

                // Restore preserved filter values after setup and population
                if (preservedSearchValue) {
                    const currentSearchInput = document.getElementById('productsSearchInput');
                    if (currentSearchInput) {
                        currentSearchInput.value = preservedSearchValue;
                        // Show clear button if search term exists
                        const clearBtn = document.getElementById('clearProductsSearch');
                        if (clearBtn) {
                            clearBtn.style.display = preservedSearchValue ? 'block' : 'none';
                        }
                        // Trigger filtering directly after a short delay to ensure setup is complete
                        setTimeout(() => {
                            this.renderFilteredProducts();
                        }, 150);
                    }
                }
                if (preservedBrandValue) {
                    const currentBrandFilter = document.getElementById('productsBrandFilter');
                    if (currentBrandFilter && this.allBrands.some(b => b.id == preservedBrandValue)) {
                        currentBrandFilter.value = preservedBrandValue;
                    }
                }
                if (preservedCategoryValue) {
                    const currentCategoryFilter = document.getElementById('productsCategoryFilter');
                    if (currentCategoryFilter && this.allCategories.some(c => c.id == preservedCategoryValue)) {
                        currentCategoryFilter.value = preservedCategoryValue;
                    }
                }
                if (preservedFeaturedValue) {
                    const currentFeaturedFilter = document.getElementById('productsFeaturedFilter');
                    if (currentFeaturedFilter) {
                        // Set data-suppress-change to prevent triggering change event during restoration
                        currentFeaturedFilter.setAttribute('data-suppress-change', 'true');
                        currentFeaturedFilter.value = preservedFeaturedValue;
                        // Remove the flag after a short delay to allow setupProductsSearch to complete
                        setTimeout(() => {
                            currentFeaturedFilter.removeAttribute('data-suppress-change');
                        }, 200);
                    }
                }

                // Setup pagination controls
                this.setupProductsPagination();
                // Render products immediately (will be filtered if search term or filters exist)
                // Use requestAnimationFrame to ensure DOM is ready, then render
                requestAnimationFrame(() => {
                    // Double-check products are still loaded before rendering
                    if (this.allProducts.length > 0) {
                        console.log('🎨 Rendering products via requestAnimationFrame, product count:', this.allProducts.length);
                        this.renderFilteredProductsImmediate();
                    } else {
                        // If products disappeared (shouldn't happen), try loading again
                        console.warn('⚠️ Products were loaded but allProducts is empty, reloading...');
                        setTimeout(() => this.loadProducts(), 200);
                    }
                });

                // Also add a fallback render after a short delay to ensure it happens
                setTimeout(() => {
                    const container = document.getElementById('productsTable');
                    // Only render if container is still showing loading or is empty
                    if (container && (container.querySelector('.loading') || container.innerHTML.trim() === '')) {
                        if (this.allProducts.length > 0) {
                            console.log('🔄 Fallback render triggered, product count:', this.allProducts.length);
                            this.renderFilteredProductsImmediate();
                        }
                    }
                }, 500);
            } else {
                this.allProducts = [];
                // Setup search and filter functionality FIRST
                // Only setup if not already set up to prevent losing focus
                const existingSearchInput = document.getElementById('productsSearchInput');
                if (!existingSearchInput || !existingSearchInput.hasAttribute('data-listeners-setup')) {
                    this.setupProductsSearch();
                }
                // Load brands and categories for filters (after setup)
                await this.loadBrandsForFilters();
                await this.loadCategoriesForFilters();

                // Restore preserved filter values
                if (preservedSearchValue) {
                    const currentSearchInput = document.getElementById('productsSearchInput');
                    if (currentSearchInput) currentSearchInput.value = preservedSearchValue;
                }
                if (preservedBrandValue) {
                    const currentBrandFilter = document.getElementById('productsBrandFilter');
                    if (currentBrandFilter && this.allBrands.some(b => b.id == preservedBrandValue)) {
                        currentBrandFilter.value = preservedBrandValue;
                    }
                }
                if (preservedCategoryValue) {
                    const currentCategoryFilter = document.getElementById('productsCategoryFilter');
                    if (currentCategoryFilter && this.allCategories.some(c => c.id == preservedCategoryValue)) {
                        currentCategoryFilter.value = preservedCategoryValue;
                    }
                }
                if (preservedFeaturedValue) {
                    const currentFeaturedFilter = document.getElementById('productsFeaturedFilter');
                    if (currentFeaturedFilter) {
                        // Set data-suppress-change to prevent triggering change event during restoration
                        currentFeaturedFilter.setAttribute('data-suppress-change', 'true');
                        currentFeaturedFilter.value = preservedFeaturedValue;
                        // Remove the flag after a short delay
                        setTimeout(() => {
                            currentFeaturedFilter.removeAttribute('data-suppress-change');
                        }, 200);
                    }
                }
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

                if (container) {
                    container.innerHTML = '';
                    container.appendChild(emptyDiv);
                }
            }
        } catch (error) {
            console.error('❌ Error loading products:', error);
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

            if (container) {
                container.innerHTML = '';
                container.appendChild(errorDiv);
            }
        } finally {
            // Always clear the loading flag
            this._loadingProducts = false;
        }
    }

    async loadBrandsForFilters() {
        try {
            if (!this.authToken) return;
            const response = await this.apiRequest('/admin/brands');
            if (response && Array.isArray(response)) {
                this.allBrands = response;
                this.populateBrandFilter();
            }
        } catch (error) {
            console.warn('Failed to load brands for filter:', error);
            this.allBrands = [];
        }
    }

    async loadCategoriesForFilters() {
        try {
            if (!this.authToken) {
                console.warn('⚠️ Cannot load categories: not authenticated');
                return;
            }

            console.log('📥 Loading categories for filter...');
            const response = await this.apiRequest('/admin/categories');

            console.log('📦 Categories API response:', {
                response: response,
                isArray: Array.isArray(response),
                length: response ? response.length : 0
            });

            if (response && Array.isArray(response)) {
                this.allCategories = response;
                console.log('✅ Loaded categories:', this.allCategories.length);
                this.populateCategoryFilter();
            } else {
                console.warn('⚠️ Categories response is not an array:', response);
                this.allCategories = [];
            }
        } catch (error) {
            console.error('❌ Failed to load categories for filter:', error);
            this.allCategories = [];
        }
    }

    populateBrandFilter() {
        const brandFilter = document.getElementById('productsBrandFilter');
        if (!brandFilter) return;

        // Save the currently selected value
        const currentValue = brandFilter.value;

        // Set a flag to prevent change event from triggering filter
        brandFilter.setAttribute('data-suppress-change', 'true');

        // Clear existing options except "All Brands"
        brandFilter.innerHTML = '<option value="">All Brands</option>';

        // Add brand options
        this.allBrands.forEach(brand => {
            const option = document.createElement('option');
            option.value = brand.id;
            option.textContent = brand.name || `Brand ${brand.id}`;
            brandFilter.appendChild(option);
        });

        // Restore the selected value if it still exists (this won't trigger change event)
        if (currentValue && this.allBrands.some(b => b.id == currentValue)) {
            brandFilter.value = currentValue;
        }

        // Remove the flag after a short delay to allow value to be set
        setTimeout(() => {
            brandFilter.removeAttribute('data-suppress-change');
        }, 0);
    }

    populateCategoryFilter() {
        const categoryFilter = document.getElementById('productsCategoryFilter');
        if (!categoryFilter) {
            console.warn('⚠️ Category filter dropdown not found');
            return;
        }

        console.log('🔄 Populating category filter:', {
            categoriesCount: this.allCategories.length,
            categories: this.allCategories
        });

        // Save the currently selected value
        const currentValue = categoryFilter.value;

        // Clear existing options except "All Categories"
        categoryFilter.innerHTML = '<option value="">All Categories</option>';

        // Add category options
        if (this.allCategories && this.allCategories.length > 0) {
            this.allCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name || `Category ${category.id}`;
                categoryFilter.appendChild(option);
            });
            console.log('✅ Added', this.allCategories.length, 'categories to filter dropdown');
        } else {
            console.warn('⚠️ No categories to add to filter dropdown');
        }

        // Restore the selected value if it still exists
        if (currentValue && this.allCategories.some(c => c.id == currentValue)) {
            categoryFilter.value = currentValue;
            console.log('✅ Restored selected category:', currentValue);
        }
    }

    setupProductsSearch() {
        const searchInput = document.getElementById('productsSearchInput');
        const clearBtn = document.getElementById('clearProductsSearch');
        const clearFiltersBtn = document.getElementById('clearProductsFilters');
        const brandFilter = document.getElementById('productsBrandFilter');
        const categoryFilter = document.getElementById('productsCategoryFilter');
        const featuredFilter = document.getElementById('productsFeaturedFilter');
        const container = document.getElementById('productsTable');

        if (!searchInput || !container) return;

        // Check if search input already has listeners set up
        // Use a data attribute to track this
        if (searchInput.hasAttribute('data-listeners-setup')) {
            // Listeners already set up, don't clone again
            return;
        }

        // Mark that listeners are being set up
        searchInput.setAttribute('data-listeners-setup', 'true');

        // Preserve focus state and cursor position
        const wasFocused = document.activeElement === searchInput;
        const cursorPosition = searchInput.selectionStart;
        const inputValue = searchInput.value;

        // Remove existing listeners to prevent duplicates
        const newSearchInput = searchInput.cloneNode(true);
        newSearchInput.setAttribute('data-listeners-setup', 'true');
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        // Restore value and focus if it was focused
        if (inputValue) {
            newSearchInput.value = inputValue;
        }
        if (wasFocused) {
            newSearchInput.focus();
            // Restore cursor position
            if (cursorPosition !== null && cursorPosition !== undefined) {
                newSearchInput.setSelectionRange(cursorPosition, cursorPosition);
            }
        }

        // Setup search input listener
        newSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim().toLowerCase();

            // Show/hide clear button
            if (clearBtn) {
                clearBtn.style.display = searchTerm ? 'block' : 'none';
            }

            // Update clear filters button visibility
            this.updateClearFiltersButton();

            // If we have a search term and are using server pagination with limited products,
            // we need to load all products for client-side filtering
            const wasUsingServerPagination = this.productsPagination.useServerPagination;
            const hasPartialProductSet = this.allProducts.length > 0 && this.allProducts.length < 1000;

            if (searchTerm && (wasUsingServerPagination || hasPartialProductSet)) {
                console.log('🔍 Search term entered, loading all products for filtering...', {
                    searchTerm,
                    wasUsingServerPagination,
                    currentProductCount: this.allProducts.length
                });
                // Switch to client-side filtering
                this.productsPagination.useServerPagination = false;
                this.productsPagination.currentPage = 1;
                // Store the search term and cursor position to ensure it's preserved through the reload
                const searchValueToPreserve = e.target.value;
                const cursorPos = e.target.selectionStart;
                // Prevent setupProductsSearch from running again during this load
                const searchInputEl = document.getElementById('productsSearchInput');
                if (searchInputEl) {
                    searchInputEl.setAttribute('data-listeners-setup', 'true');
                }
                // Reload all products - the search term will be preserved and filtering will happen
                this.loadProducts().then(() => {
                    // After products are loaded, ensure the search input still has the value
                    // and restore focus/cursor position
                    const currentSearchInput = document.getElementById('productsSearchInput');
                    if (currentSearchInput) {
                        if (currentSearchInput.value !== searchValueToPreserve) {
                            currentSearchInput.value = searchValueToPreserve;
                        }
                        // Restore focus and cursor position
                        currentSearchInput.focus();
                        if (cursorPos !== null && cursorPos !== undefined) {
                            currentSearchInput.setSelectionRange(cursorPos, cursorPos);
                        }
                    }
                    // Trigger filtering with the search term
                    this.renderFilteredProducts();
                });
            } else if (searchTerm) {
                // We have all products loaded, just filter them
                this.renderFilteredProducts();
            } else {
                // No search term - if we were filtering, switch back to server pagination if no other filters
                const brandFilter = document.getElementById('productsBrandFilter');
                const categoryFilter = document.getElementById('productsCategoryFilter');
                const featuredFilter = document.getElementById('productsFeaturedFilter');
                const hasOtherFilters = (brandFilter && brandFilter.value) ||
                    (categoryFilter && categoryFilter.value) ||
                    (featuredFilter && featuredFilter.value);

                if (!hasOtherFilters && !wasUsingServerPagination && this.allProducts.length > 1000) {
                    // No filters at all, switch back to server pagination
                    this.productsPagination.useServerPagination = true;
                    this.productsPagination.currentPage = 1;
                    this.loadProducts();
                } else {
                    // Filter and render products with existing data
                    this.renderFilteredProducts();
                }
            }
        });

        // Setup clear search button
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                newSearchInput.value = '';
                if (clearBtn) clearBtn.style.display = 'none';
                this.updateClearFiltersButton();
                this.renderFilteredProducts();
            });
        }

        // Setup brand filter listener - clone to remove old listeners
        if (brandFilter) {
            // Preserve the selected value before cloning
            const preservedValue = brandFilter.value;
            const newBrandFilter = brandFilter.cloneNode(true);
            brandFilter.parentNode.replaceChild(newBrandFilter, brandFilter);

            // Restore the preserved value after cloning (if it exists)
            if (preservedValue) {
                newBrandFilter.value = preservedValue;
            }

            newBrandFilter.addEventListener('change', () => {
                // Skip if this change was triggered programmatically
                if (newBrandFilter.getAttribute('data-suppress-change') === 'true') {
                    return;
                }

                console.log('🔄 Brand filter changed:', newBrandFilter.value);
                this.updateClearFiltersButton();

                // Check if we need to reload all products BEFORE changing the pagination mode
                // If we were using server-side pagination, we only have a subset of products
                // We need to reload ALL products to filter properly
                const wasUsingServerPagination = this.productsPagination.useServerPagination;
                const hasPartialProductSet = this.allProducts.length > 0 && this.allProducts.length < 1000;

                // When filters change, switch to client-side filtering
                this.productsPagination.useServerPagination = false;
                this.productsPagination.currentPage = 1;

                // Reload if: we were using server pagination, or we have no products, or we have a small subset
                if (wasUsingServerPagination || this.allProducts.length === 0 || hasPartialProductSet) {
                    console.log('📥 Loading all products for filtering...', {
                        wasUsingServerPagination,
                        currentProductCount: this.allProducts.length,
                        hasPartialProductSet
                    });
                    this.loadProducts(); // Reload to get all products for filtering
                } else {
                    console.log('📦 Products already loaded, filtering existing products...', {
                        productCount: this.allProducts.length
                    });
                    this.renderFilteredProducts();
                }
            });
        }

        // Setup category filter listener - clone to remove old listeners
        if (categoryFilter) {
            const newCategoryFilter = categoryFilter.cloneNode(true);
            categoryFilter.parentNode.replaceChild(newCategoryFilter, categoryFilter);
            newCategoryFilter.addEventListener('change', () => {
                console.log('🔄 Category filter changed:', newCategoryFilter.value);
                this.updateClearFiltersButton();

                // Check if we need to reload all products BEFORE changing the pagination mode
                // If we were using server-side pagination, we only have a subset of products
                // We need to reload ALL products to filter properly
                const wasUsingServerPagination = this.productsPagination.useServerPagination;
                const hasPartialProductSet = this.allProducts.length > 0 && this.allProducts.length < 1000;

                // When filters change, switch to client-side filtering
                this.productsPagination.useServerPagination = false;
                this.productsPagination.currentPage = 1;

                // Reload if: we were using server pagination, or we have no products, or we have a small subset
                if (wasUsingServerPagination || this.allProducts.length === 0 || hasPartialProductSet) {
                    console.log('📥 Loading all products for filtering...', {
                        wasUsingServerPagination,
                        currentProductCount: this.allProducts.length,
                        hasPartialProductSet
                    });
                    this.loadProducts(); // Reload to get all products for filtering
                } else {
                    console.log('📦 Products already loaded, filtering existing products...', {
                        productCount: this.allProducts.length
                    });
                    this.renderFilteredProducts();
                }
            });
        }

        // Setup featured filter listener - clone to remove old listeners
        if (featuredFilter) {
            // Preserve the selected value before cloning
            const preservedValue = featuredFilter.value;
            const newFeaturedFilter = featuredFilter.cloneNode(true);
            featuredFilter.parentNode.replaceChild(newFeaturedFilter, featuredFilter);

            // Restore the preserved value after cloning (if it exists)
            if (preservedValue) {
                // Set data-suppress-change to prevent triggering change event during restoration
                newFeaturedFilter.setAttribute('data-suppress-change', 'true');
                newFeaturedFilter.value = preservedValue;
                // Remove the flag after a short delay
                setTimeout(() => {
                    newFeaturedFilter.removeAttribute('data-suppress-change');
                }, 100);
            }

            newFeaturedFilter.addEventListener('change', () => {
                // Skip if this change was triggered programmatically
                if (newFeaturedFilter.getAttribute('data-suppress-change') === 'true') {
                    return;
                }

                console.log('🔄 Featured filter changed:', newFeaturedFilter.value);
                this.updateClearFiltersButton();

                // Check if we need to reload all products BEFORE changing the pagination mode
                const wasUsingServerPagination = this.productsPagination.useServerPagination;
                const hasPartialProductSet = this.allProducts.length > 0 && this.allProducts.length < 1000;

                // When filters change, switch to client-side filtering
                this.productsPagination.useServerPagination = false;
                this.productsPagination.currentPage = 1;

                // Reload if: we were using server pagination, or we have no products, or we have a small subset
                if (wasUsingServerPagination || this.allProducts.length === 0 || hasPartialProductSet) {
                    console.log('📥 Loading all products for filtering...', {
                        wasUsingServerPagination,
                        currentProductCount: this.allProducts.length,
                        hasPartialProductSet,
                        featuredFilterValue: newFeaturedFilter.value
                    });
                    // Store the featured filter value before reloading
                    const featuredValue = newFeaturedFilter.value;
                    // Store the featured value in sessionStorage to persist through reloads
                    if (featuredValue) {
                        sessionStorage.setItem('adminFeaturedFilter', featuredValue);
                    } else {
                        sessionStorage.removeItem('adminFeaturedFilter');
                    }
                    this.loadProducts().then(() => {
                        // Restore the featured filter value after products are loaded
                        const currentFeaturedFilter = document.getElementById('productsFeaturedFilter');
                        const storedFeaturedValue = sessionStorage.getItem('adminFeaturedFilter') || featuredValue;
                        if (currentFeaturedFilter && storedFeaturedValue) {
                            // Set data-suppress-change to prevent triggering change event during restoration
                            currentFeaturedFilter.setAttribute('data-suppress-change', 'true');
                            currentFeaturedFilter.value = storedFeaturedValue;
                            // Remove the flag and trigger filtering after a short delay
                            // Use a longer delay to ensure setupProductsSearch has completed
                            setTimeout(() => {
                                currentFeaturedFilter.removeAttribute('data-suppress-change');
                                // Double-check the value is still set before filtering
                                if (currentFeaturedFilter.value === storedFeaturedValue) {
                                    // Trigger filtering with the restored value
                                    this.renderFilteredProducts();
                                } else {
                                    // Value was lost, restore it and try again
                                    currentFeaturedFilter.value = storedFeaturedValue;
                                    setTimeout(() => this.renderFilteredProducts(), 50);
                                }
                            }, 200);
                        } else {
                            // If filter wasn't restored, still render products
                            this.renderFilteredProducts();
                        }
                    }).catch((error) => {
                        console.error('Error loading products:', error);
                        this.renderFilteredProducts();
                    });
                } else {
                    console.log('📦 Products already loaded, filtering existing products...', {
                        productCount: this.allProducts.length,
                        featuredFilterValue: newFeaturedFilter.value
                    });
                    this.renderFilteredProducts();
                }
            });
        }

        // Setup clear all filters button
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                newSearchInput.value = '';
                if (clearBtn) clearBtn.style.display = 'none';
                // Get current elements by ID (in case they were cloned)
                const currentBrandFilter = document.getElementById('productsBrandFilter');
                const currentCategoryFilter = document.getElementById('productsCategoryFilter');
                const currentFeaturedFilter = document.getElementById('productsFeaturedFilter');
                if (currentBrandFilter) currentBrandFilter.value = '';
                if (currentCategoryFilter) currentCategoryFilter.value = '';
                if (currentFeaturedFilter) currentFeaturedFilter.value = '';
                // Clear from sessionStorage as well
                sessionStorage.removeItem('adminFeaturedFilter');
                this.updateClearFiltersButton();
                // Switch back to server-side pagination when filters cleared
                this.productsPagination.useServerPagination = true;
                this.productsPagination.currentPage = 1;
                this.loadProducts();
            });
        }

        // When search changes, switch to client-side filtering
        newSearchInput.addEventListener('input', () => {
            const hasSearch = newSearchInput.value.trim() !== '';
            if (hasSearch) {
                this.productsPagination.useServerPagination = false;
                this.productsPagination.currentPage = 1;
            }
        });
    }

    setupProductsPagination() {
        const perPageSelect = document.getElementById('productsPerPage');
        const paginationContainer = document.getElementById('productsPagination');

        // Setup per-page dropdown
        if (perPageSelect) {
            perPageSelect.addEventListener('change', (e) => {
                this.productsPagination.itemsPerPage = parseInt(e.target.value, 10);
                this.productsPagination.currentPage = 1;
                this.loadProducts();
            });
        }

        // Render pagination controls
        this.renderProductsPagination();
    }

    renderProductsPagination() {
        const paginationContainer = document.getElementById('productsPagination');
        if (!paginationContainer) return;

        const pagination = this.productsPagination;
        const totalPages = pagination.totalPages || 1;
        const currentPage = pagination.currentPage || 1;
        const totalProducts = pagination.totalProducts || 0;

        if (totalPages <= 1 && !pagination.useServerPagination) {
            // For client-side filtering, calculate pages from filtered products
            const filteredCount = this.getFilteredProductsCount();
            const itemsPerPage = pagination.itemsPerPage;
            const clientTotalPages = Math.ceil(filteredCount / itemsPerPage);

            if (clientTotalPages <= 1) {
                paginationContainer.innerHTML = '';
                return;
            }
        }

        let html = '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--gray-200);">';

        // Left side: Page info
        const startItem = ((currentPage - 1) * pagination.itemsPerPage) + 1;
        const endItem = Math.min(currentPage * pagination.itemsPerPage, totalProducts);
        html += `<div style="color: var(--gray-600); font-size: 0.875rem;">`;
        html += `Showing ${startItem}-${endItem} of ${totalProducts} products`;
        html += `</div>`;

        // Right side: Pagination controls
        html += '<div style="display: flex; gap: 0.5rem; align-items: center;">';

        // Previous button
        html += `<button class="btn btn-sm btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="window.adminApp.goToProductsPage(${currentPage - 1})" style="min-width: auto;">`;
        html += '<i class="fas fa-chevron-left"></i>';
        html += '</button>';

        // Page numbers
        const maxPagesToShow = 7;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage < maxPagesToShow - 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        if (startPage > 1) {
            html += `<button class="btn btn-sm btn-secondary" onclick="window.adminApp.goToProductsPage(1)" style="min-width: auto;">1</button>`;
            if (startPage > 2) {
                html += '<span style="padding: 0 0.5rem; color: var(--gray-400);">...</span>';
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-secondary'}" onclick="window.adminApp.goToProductsPage(${i})" style="min-width: auto;">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += '<span style="padding: 0 0.5rem; color: var(--gray-400);">...</span>';
            }
            html += `<button class="btn btn-sm btn-secondary" onclick="window.adminApp.goToProductsPage(${totalPages})" style="min-width: auto;">${totalPages}</button>`;
        }

        // Next button
        html += `<button class="btn btn-sm btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="window.adminApp.goToProductsPage(${currentPage + 1})" style="min-width: auto;">`;
        html += '<i class="fas fa-chevron-right"></i>';
        html += '</button>';

        html += '</div>';
        html += '</div>';

        paginationContainer.innerHTML = html;
    }

    goToProductsPage(page) {
        if (page < 1 || page > this.productsPagination.totalPages) return;
        this.productsPagination.currentPage = page;
        this.loadProducts();
        // Scroll to top of products table
        const container = document.getElementById('productsTable');
        if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    getFilteredProductsCount() {
        const searchInput = document.getElementById('productsSearchInput');
        const brandFilter = document.getElementById('productsBrandFilter');
        const categoryFilter = document.getElementById('productsCategoryFilter');

        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const brandId = brandFilter ? brandFilter.value : '';
        const categoryId = categoryFilter ? categoryFilter.value : '';

        const featuredFilter = document.getElementById('productsFeaturedFilter');
        const featuredStatus = featuredFilter ? featuredFilter.value : '';
        const filtered = this.filterProducts(searchTerm, brandId, categoryId, featuredStatus);
        return filtered.length;
    }

    updateClearFiltersButton() {
        const clearFiltersBtn = document.getElementById('clearProductsFilters');
        const searchInput = document.getElementById('productsSearchInput');
        const brandFilter = document.getElementById('productsBrandFilter');
        const categoryFilter = document.getElementById('productsCategoryFilter');
        const featuredFilter = document.getElementById('productsFeaturedFilter');

        if (!clearFiltersBtn) return;

        const hasSearch = searchInput && searchInput.value.trim() !== '';
        const hasBrandFilter = brandFilter && brandFilter.value !== '';
        const hasCategoryFilter = categoryFilter && categoryFilter.value !== '';
        const hasFeaturedFilter = featuredFilter && featuredFilter.value !== '';

        clearFiltersBtn.style.display = (hasSearch || hasBrandFilter || hasCategoryFilter || hasFeaturedFilter) ? 'block' : 'none';
    }

    filterProducts(searchTerm, brandId, categoryId, featuredStatus) {
        // Ensure featuredStatus is always a string, never undefined
        featuredStatus = featuredStatus || '';

        // Ensure searchTerm is a string
        searchTerm = searchTerm || '';

        console.log('🔍 filterProducts() called with:', {
            searchTerm: searchTerm,
            searchTermType: typeof searchTerm,
            brandId: brandId,
            categoryId: categoryId,
            featuredStatus: featuredStatus,
            totalProducts: this.allProducts.length
        });

        let filtered = this.allProducts;

        // IMPORTANT: Filter by search term FIRST, before other filters
        // This ensures we search the full dataset, not a pre-filtered subset
        if (searchTerm && searchTerm.trim()) {
            const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/).filter(word => word.length > 0);

            console.log('🔍 Filtering by search term (FIRST):', {
                searchTerm: searchTerm,
                searchTerms: searchTerms,
                totalProductsBeforeFilter: filtered.length
            });

            if (searchTerms.length > 0) {
                filtered = filtered.filter(product => {
                    const name = (product.name || '').toLowerCase();
                    const sku = (product.sku || '').toLowerCase();
                    const brand = (product.brand_name || '').toLowerCase();
                    const category = (product.category_name || '').toLowerCase();

                    // Combine all searchable fields
                    const searchableText = `${name} ${sku} ${brand} ${category}`;

                    // Check if ALL search terms are found (AND logic)
                    // This means "buried treasure" will match products containing both "buried" AND "treasure"
                    const matches = searchTerms.every(term => searchableText.includes(term));
                    return matches;
                });

                console.log('✅ After search filter (FIRST):', {
                    filteredCount: filtered.length,
                    sampleProducts: filtered.slice(0, 5).map(p => p.name)
                });
            }
        }

        // Filter by brand - use brand_id if available, otherwise fall back to brand_name matching
        if (brandId) {
            const selectedBrandId = parseInt(brandId, 10);

            console.log('🔍 Filtering by brand:', {
                brandId: brandId,
                selectedBrandId: selectedBrandId,
                totalProductsBeforeFilter: filtered.length,
                allBrandsCount: this.allBrands.length,
                selectedBrand: this.allBrands.find(b => b.id == brandId)
            });

            filtered = filtered.filter(product => {
                // First try to match by brand_id (most reliable)
                if (product.brand_id !== null && product.brand_id !== undefined) {
                    // Use loose equality to handle type mismatches (string vs number)
                    return product.brand_id == selectedBrandId;
                }

                // Fall back to brand_name matching if brand_id is not available
                const selectedBrand = this.allBrands.find(b => b.id == brandId);
                if (selectedBrand) {
                    const brandName = (selectedBrand.name || '').trim();
                    const productBrandName = (product.brand_name || '').trim();

                    if (!productBrandName) return false;

                    // Normalize for comparison: lowercase and normalize whitespace
                    const normalizedBrandName = brandName.toLowerCase().replace(/\s+/g, ' ').trim();
                    const normalizedProductBrand = productBrandName.toLowerCase().replace(/\s+/g, ' ').trim();

                    // Use exact match first (most reliable)
                    if (normalizedProductBrand === normalizedBrandName) {
                        return true;
                    }

                    // Also check if product brand starts with selected brand (for cases like "Skinny Magic" vs "Skinny Magic Plus")
                    if (normalizedProductBrand.startsWith(normalizedBrandName + ' ') ||
                        normalizedBrandName.startsWith(normalizedProductBrand + ' ')) {
                        return true;
                    }
                }

                return false;
            });

            console.log('✅ After brand filter:', {
                filteredCount: filtered.length,
                sampleProducts: filtered.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.name,
                    brand_id: p.brand_id,
                    brand_name: p.brand_name
                }))
            });
        }

        // Filter by category - use category_id if available, otherwise fall back to category_name matching
        if (categoryId) {
            const selectedCategoryId = parseInt(categoryId, 10);
            const selectedCategory = this.allCategories.find(c => c.id == categoryId);

            console.log('🔍 Filtering by category:', {
                categoryId: categoryId,
                selectedCategoryId: selectedCategoryId,
                totalProductsBeforeFilter: filtered.length,
                allCategoriesCount: this.allCategories.length,
                selectedCategory: selectedCategory,
                selectedCategoryName: selectedCategory ? selectedCategory.name : 'NOT FOUND'
            });

            // Log sample products before filtering to see their category data
            const sampleProducts = filtered.slice(0, 10).map(p => ({
                id: p.id,
                name: p.name,
                category_id: p.category_id,
                category_id_type: typeof p.category_id,
                category_name: p.category_name
            }));
            console.log('📦 Sample products before category filter:', sampleProducts);

            // Also log what we're trying to match
            console.log('🎯 Trying to match category:', {
                selectedCategoryId: selectedCategoryId,
                selectedCategoryIdType: typeof selectedCategoryId,
                selectedCategoryName: selectedCategory ? selectedCategory.name : 'NOT FOUND',
                selectedCategoryIdFromDropdown: categoryId,
                selectedCategoryIdFromDropdownType: typeof categoryId
            });

            // Check if any products have the matching category_id
            const productsWithMatchingId = filtered.filter(p => p.category_id == selectedCategoryId);
            console.log('🔍 Products with matching category_id:', {
                count: productsWithMatchingId.length,
                sample: productsWithMatchingId.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.name,
                    category_id: p.category_id,
                    category_name: p.category_name
                }))
            });

            // Check category_id distribution (including null/undefined)
            const categoryIdDistribution = {};
            let nullCategoryCount = 0;
            filtered.slice(0, 50).forEach(p => {
                const cid = p.category_id;
                if (cid === null || cid === undefined) {
                    nullCategoryCount++;
                } else {
                    categoryIdDistribution[cid] = (categoryIdDistribution[cid] || 0) + 1;
                }
            });
            if (nullCategoryCount > 0) {
                categoryIdDistribution['null/undefined'] = nullCategoryCount;
            }
            console.log('📊 Category ID distribution (first 50 products):', categoryIdDistribution);

            // Show what categories these IDs correspond to
            const categoryIdNames = {};
            Object.keys(categoryIdDistribution).forEach(cid => {
                const cat = this.allCategories.find(c => c.id == cid);
                categoryIdNames[cid] = cat ? cat.name : `Unknown (ID: ${cid})`;
            });
            console.log('📋 Category names for product category_ids:', categoryIdNames);

            // Show all available categories in dropdown
            console.log('📋 All available categories in dropdown:', this.allCategories.map(c => ({
                id: c.id,
                name: c.name
            })));

            let matchedByCategoryId = 0;
            let matchedByCategoryName = 0;
            let noMatch = 0;

            filtered = filtered.filter(product => {
                // First try to match by category_id (most reliable)
                if (product.category_id !== null && product.category_id !== undefined) {
                    // Use loose equality to handle type mismatches (string vs number)
                    const matches = product.category_id == selectedCategoryId;
                    if (matches) {
                        matchedByCategoryId++;
                        return true;
                    }
                }

                // Fall back to category_name matching if category_id is not available or didn't match
                if (selectedCategory) {
                    const categoryName = (selectedCategory.name || '').trim();
                    const productCategoryName = (product.category_name || '').trim();

                    if (productCategoryName) {
                        // Normalize for comparison: lowercase and normalize whitespace
                        const normalizedCategoryName = categoryName.toLowerCase().replace(/\s+/g, ' ').trim();
                        const normalizedProductCategory = productCategoryName.toLowerCase().replace(/\s+/g, ' ').trim();

                        // Use exact match first (most reliable)
                        if (normalizedProductCategory === normalizedCategoryName) {
                            matchedByCategoryName++;
                            return true;
                        }

                        // Also check if product category starts with selected category
                        if (normalizedProductCategory.startsWith(normalizedCategoryName + ' ') ||
                            normalizedCategoryName.startsWith(normalizedProductCategory + ' ')) {
                            matchedByCategoryName++;
                            return true;
                        }
                    }
                }

                noMatch++;
                return false;
            });

            // Get full category distribution for all products (not just first 50)
            const fullCategoryDistribution = {};
            let fullNullCount = 0;
            filtered.forEach(p => {
                const cid = p.category_id;
                if (cid === null || cid === undefined) {
                    fullNullCount++;
                } else {
                    fullCategoryDistribution[cid] = (fullCategoryDistribution[cid] || 0) + 1;
                }
            });
            if (fullNullCount > 0) {
                fullCategoryDistribution['null/undefined'] = fullNullCount;
            }

            console.log('✅ After category filter:', {
                filteredCount: filtered.length,
                matchedByCategoryId: matchedByCategoryId,
                matchedByCategoryName: matchedByCategoryName,
                noMatch: noMatch,
                fullCategoryDistribution: fullCategoryDistribution,
                tryingToMatchCategoryId: selectedCategoryId,
                tryingToMatchCategoryName: selectedCategory ? selectedCategory.name : 'NOT FOUND',
                sampleProducts: filtered.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.name,
                    category_id: p.category_id,
                    category_name: p.category_name
                }))
            });

            // If no matches, show helpful message
            if (filtered.length === 0 && noMatch > 0) {
                console.warn('⚠️ No products match this category filter!', {
                    reason: 'Products have different category_id values',
                    selectedCategoryId: selectedCategoryId,
                    selectedCategoryName: selectedCategory ? selectedCategory.name : 'NOT FOUND',
                    productCategoryIds: Object.keys(fullCategoryDistribution),
                    suggestion: 'Products may need to be assigned to this category, or you may need to select a different category'
                });
            }
        }

        // Filter by featured status
        // Ensure featuredStatus is always a string, never undefined
        const featuredStatusStr = featuredStatus || '';

        // Debug: Log if featuredStatus was undefined
        if (featuredStatus === undefined) {
            console.warn('⚠️ filterProducts() called with undefined featuredStatus!', {
                searchTerm,
                brandId,
                categoryId,
                stackTrace: new Error().stack
            });
        }

        if (featuredStatusStr !== '') {
            const isFeatured = featuredStatusStr === 'true';

            console.log('🔍 Filtering by featured status:', {
                featuredStatus: featuredStatusStr,
                isFeatured: isFeatured,
                totalProductsBeforeFilter: filtered.length,
                sampleProducts: filtered.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.name,
                    is_featured: p.is_featured,
                    is_featured_type: typeof p.is_featured,
                    is_featured_raw: p.is_featured
                }))
            });

            filtered = filtered.filter(product => {
                // Handle both boolean and numeric values (1/0 from database)
                // Also handle null/undefined as false
                const productIsFeatured = product.is_featured === true ||
                    product.is_featured === 1 ||
                    product.is_featured === '1' ||
                    product.is_featured === 'true';
                return productIsFeatured === isFeatured;
            });

            console.log('✅ After featured filter:', {
                filteredCount: filtered.length,
                sampleFilteredProducts: filtered.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.name,
                    is_featured: p.is_featured,
                    is_featured_type: typeof p.is_featured
                }))
            });
        }

        // Search filter has already been applied at the beginning, so we skip it here
        // This prevents double-filtering by search

        return filtered;
    }

    renderFilteredProducts() {
        // Debounce to prevent multiple rapid calls
        if (this._renderFilteredProductsTimeout) {
            clearTimeout(this._renderFilteredProductsTimeout);
        }

        this._renderFilteredProductsTimeout = setTimeout(() => {
            this._renderFilteredProductsImpl();
        }, 50);
    }

    // Force immediate render (bypasses debounce) - used when we know data is ready
    renderFilteredProductsImmediate() {
        if (this._renderFilteredProductsTimeout) {
            clearTimeout(this._renderFilteredProductsTimeout);
            this._renderFilteredProductsTimeout = null;
        }
        this._renderFilteredProductsImpl();
    }

    _renderFilteredProductsImpl() {
        const container = document.getElementById('productsTable');
        if (!container) {
            console.error('❌ Products table container not found!');
            return;
        }

        const searchInput = document.getElementById('productsSearchInput');
        const brandFilter = document.getElementById('productsBrandFilter');
        const categoryFilter = document.getElementById('productsCategoryFilter');
        const featuredFilter = document.getElementById('productsFeaturedFilter');

        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const brandId = brandFilter ? brandFilter.value : '';
        const categoryId = categoryFilter ? categoryFilter.value : '';

        console.log('🎨 _renderFilteredProductsImpl - reading filter values:', {
            searchTerm: searchTerm,
            searchTermLength: searchTerm ? searchTerm.length : 0,
            searchInputExists: !!searchInput,
            searchInputValue: searchInput ? searchInput.value : 'NO INPUT',
            brandId: brandId,
            categoryId: categoryId
        });

        // Get featured status - handle case where filter might not exist yet or value might be lost
        // First try to get from the filter element, then fall back to sessionStorage
        let featuredStatus = '';
        if (featuredFilter) {
            featuredStatus = featuredFilter.value || '';
        } else {
            // Filter doesn't exist yet, try to find it
            const tempFilter = document.getElementById('productsFeaturedFilter');
            if (tempFilter) {
                featuredStatus = tempFilter.value || '';
            }
        }
        // If still empty, try sessionStorage as a fallback
        if (!featuredStatus) {
            const storedValue = sessionStorage.getItem('adminFeaturedFilter');
            if (storedValue) {
                featuredStatus = storedValue;
                // Restore it to the filter if it exists
                if (featuredFilter) {
                    featuredFilter.value = storedValue;
                }
            }
        }

        // Ensure featuredStatus is always a string, never undefined
        featuredStatus = featuredStatus || '';

        console.log('🎨 Rendering filtered products:', {
            searchTerm: searchTerm,
            brandId: brandId,
            categoryId: categoryId,
            featuredStatus: featuredStatus,
            featuredStatusType: typeof featuredStatus,
            featuredFilterExists: !!featuredFilter,
            featuredFilterValue: featuredFilter ? featuredFilter.value : 'NOT FOUND',
            sessionStorageValue: sessionStorage.getItem('adminFeaturedFilter'),
            totalProducts: this.allProducts.length,
            categoriesLoaded: this.allCategories.length,
            useServerPagination: this.productsPagination.useServerPagination,
            containerExists: !!container
        });

        // If no products are loaded and no filters are active, products may still be loading
        if (this.allProducts.length === 0 && !searchTerm && !brandId && !categoryId && !featuredStatus) {
            console.log('⏳ Products not loaded yet, showing loading state...');
            container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading products...</div>';
            // Try to load products if they haven't been loaded yet
            // Use a longer delay to avoid race conditions
            setTimeout(() => {
                if (this.allProducts.length === 0) {
                    console.log('🔄 Retrying product load...');
                    this.loadProducts();
                } else {
                    // Products loaded in the meantime, render them
                    console.log('✅ Products loaded, rendering...');
                    this._renderFilteredProductsImpl();
                }
            }, 300);
            return;
        }

        // Ensure categories are loaded if category filter is active
        if (categoryId && this.allCategories.length === 0) {
            console.warn('⚠️ Category filter active but categories not loaded yet. Loading...');
            this.loadCategoriesForFilters().then(() => {
                // Retry filtering after categories are loaded
                this.renderFilteredProducts();
            });
            return;
        }

        // If using server pagination and we have filters/search, we need to fetch all products for filtering
        // Otherwise, if using server pagination with no filters, use the products we already have
        let filteredProducts;

        if (this.productsPagination.useServerPagination && (searchTerm || brandId || categoryId || featuredStatus)) {
            // We have filters but are using server pagination - need to fetch all products for client-side filtering
            console.log('⚠️ Filters active but using server pagination. Fetching all products for filtering...');
            // Trigger a reload with filters to switch to client-side filtering
            this.loadProducts();
            return; // Will re-render after products are loaded
        } else if (this.productsPagination.useServerPagination && !searchTerm && !brandId && !categoryId && !featuredStatus) {
            // No filters, using server pagination - use products as-is (already paginated by server)
            filteredProducts = this.allProducts;
            console.log('📄 Using server-paginated products:', {
                count: filteredProducts.length,
                totalProducts: this.productsPagination.totalProducts,
                currentPage: this.productsPagination.currentPage
            });
        } else {
            // Client-side filtering - filter all products
            filteredProducts = this.filterProducts(searchTerm, brandId, categoryId, featuredStatus);
        }

        // Apply client-side pagination if not using server pagination
        if (!this.productsPagination.useServerPagination && filteredProducts.length > 0) {
            const page = this.productsPagination.currentPage;
            const itemsPerPage = this.productsPagination.itemsPerPage;
            const startIndex = (page - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;

            // Update pagination info for client-side
            this.productsPagination.totalProducts = filteredProducts.length;
            this.productsPagination.totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

            filteredProducts = filteredProducts.slice(startIndex, endIndex);
        }

        if (filteredProducts.length === 0) {
            const hasFilters = searchTerm || brandId || categoryId || featuredStatus;
            if (hasFilters) {
                let filterText = [];
                if (searchTerm) filterText.push(`search "${this.escapeHtml(searchTerm)}"`);
                if (brandId) {
                    const brand = this.allBrands.find(b => b.id == brandId);
                    filterText.push(`brand "${this.escapeHtml(brand ? brand.name : 'Unknown')}"`);
                }
                if (categoryId) {
                    const category = this.allCategories.find(c => c.id == categoryId);
                    filterText.push(`category "${this.escapeHtml(category ? category.name : 'Unknown')}"`);
                }
                if (featuredStatus) {
                    filterText.push(`featured: ${featuredStatus === 'true' ? 'Yes' : 'No'}`);
                }
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                        <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1rem; color: var(--gray-400);"></i>
                        <p>No products found matching ${filterText.join(' and ')}</p>
                        <p style="font-size: 0.875rem; margin-top: 0.5rem;">Try adjusting your filters or search terms</p>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                        <i class="fas fa-box-open" style="font-size: 3rem; margin-bottom: 1rem; color: var(--gray-400);"></i>
                        <p>No products found. Import products or scrape from HM Herbs website.</p>
                    </div>
                `;
            }
        } else {
            // Ensure we have products to render
            if (filteredProducts.length === 0 && this.allProducts.length > 0) {
                // This shouldn't happen, but if it does, use allProducts
                console.warn('⚠️ Filtered products empty but allProducts has data, using allProducts');
                filteredProducts = this.allProducts.slice(0, this.productsPagination.itemsPerPage);
            }

            if (filteredProducts.length > 0) {
                // Debug: Check featured status of products being rendered
                const featuredInFiltered = filteredProducts.filter(p =>
                    p.is_featured === true ||
                    p.is_featured === 1 ||
                    p.is_featured === '1' ||
                    p.is_featured === 'true'
                );
                console.log('🎨 About to render products table:', {
                    totalProducts: filteredProducts.length,
                    featuredProducts: featuredInFiltered.length,
                    featuredProductIds: featuredInFiltered.map(p => ({ id: p.id, name: p.name, is_featured: p.is_featured }))
                });

                container.innerHTML = this.renderProductsTable(filteredProducts);
                // Update pagination after rendering
                this.renderProductsPagination();
            } else {
                // No products to show
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                        <i class="fas fa-box-open" style="font-size: 3rem; margin-bottom: 1rem; color: var(--gray-400);"></i>
                        <p>No products found. Import products or scrape from HM Herbs website.</p>
                    </div>
                `;
            }
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
                            <th>Category</th>
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
                                <td>
                                    ${product.brand_name && product.brand_name !== 'Unknown' ?
                `<a href="#" onclick="document.getElementById('brandFilter').value='${product.brand_slug}'; document.getElementById('brandFilter').dispatchEvent(new Event('change')); return false;">${this.escapeHtml(product.brand_name)}</a>` :
                this.escapeHtml(product.brand_name || 'Unknown')}
                                </td>
                                <td>${this.escapeHtml(product.category_name || 'No category')}</td>
                                <td>$${(typeof product.price === 'string' ? parseFloat(product.price) : (product.price || 0)).toFixed(2)}</td>
                                <td>
                                    <span class="badge ${product.inventory_quantity <= (product.low_stock_threshold || 10) ? 'badge-warning' : 'badge-success'}">
                                        ${product.inventory_quantity}
                                    </span>
                                </td>
                                <td>
                                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                        <span class="badge ${product.is_active ? 'badge-success' : 'badge-danger'}">
                                            ${product.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                        ${(() => {
                // Check if product is featured - handle all possible formats
                const isFeatured = product.is_featured === true ||
                    product.is_featured === 1 ||
                    product.is_featured === '1' ||
                    product.is_featured === 'true';

                // Debug logging for featured products
                if (isFeatured) {
                    console.log('⭐ Rendering featured product:', {
                        id: product.id,
                        name: product.name,
                        is_featured: product.is_featured,
                        is_featured_type: typeof product.is_featured
                    });
                }

                return isFeatured ?
                    '<span class="badge badge-info" style="font-size: 0.7rem; padding: 0.2rem 0.5rem;"><i class="fas fa-star"></i> Featured</span>' :
                    '';
            })()}
                                    </div>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="editProduct(${product.id})">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteProduct(${product.id}, '${this.escapeHtml(product.name)}')" style="margin-left: 0.5rem;">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async loadCategories() {
        const container = document.getElementById('categoriesTable');
        if (!container) {
            console.warn('Categories table container not found');
            return;
        }

        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading categories...</div>';

        // Don't make API call if not authenticated
        if (!this.authToken) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view categories.</p></div>';
            return;
        }

        try {
            // Use admin API endpoint (requires auth)
            const response = await this.apiRequest('/admin/categories');

            // Handle null response (403 Forbidden)
            if (!response) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view categories.</p></div>';
                return;
            }

            // Store all categories for filtering
            this.allCategoriesForFilter = response || [];

            // Setup search and filters
            this.setupCategoriesSearch();
            this.setupCategoriesPagination();
            this.populateParentFilter();

            // Apply filters and render
            this.renderFilteredCategories();

            // Refresh category dropdown in edit modal if it exists
            refreshCategoryDropdown();

        } catch (error) {
            container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error);"><p>Failed to load categories: ${error.message}</p></div>`;
        }
    }

    renderCategoriesTable(categories, categoryMap) {
        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Slug</th>
                            <th>Parent</th>
                            <th>Sort Order</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categories.map(category => `
                            <tr>
                                <td>${category.id}</td>
                                <td>${this.escapeHtml(category.name || 'N/A')}</td>
                                <td><code>${this.escapeHtml(category.slug || 'N/A')}</code></td>
                                <td>${category.parent_id ? this.escapeHtml(categoryMap[category.parent_id] || `ID: ${category.parent_id}`) : '<em>None</em>'}</td>
                                <td>${category.sort_order || 0}</td>
                                <td>
                                    <span class="badge ${category.is_active ? 'badge-success' : 'badge-danger'}">
                                        ${category.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="editCategory(${category.id})">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteCategory(${category.id}, '${this.escapeHtml(category.name)}')" style="margin-left: 0.5rem;">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    setupCategoriesSearch() {
        const searchInput = document.getElementById('categoriesSearchInput');
        const clearSearchBtn = document.getElementById('clearCategoriesSearch');
        const parentFilter = document.getElementById('categoriesParentFilter');
        const statusFilter = document.getElementById('categoriesStatusFilter');
        const clearFiltersBtn = document.getElementById('clearCategoriesFilters');

        if (!searchInput) return;

        // Debounce search input
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.categoriesPagination.currentPage = 1;
                this.renderFilteredCategories();
                this.updateClearCategoriesFiltersButton();
            }, 300);

            // Show/hide clear search button
            if (clearSearchBtn) {
                clearSearchBtn.style.display = e.target.value ? 'block' : 'none';
            }
        });

        // Clear search button
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                this.categoriesPagination.currentPage = 1;
                this.renderFilteredCategories();
                this.updateClearCategoriesFiltersButton();
            });
        }

        // Parent filter change
        if (parentFilter) {
            parentFilter.addEventListener('change', () => {
                this.categoriesPagination.currentPage = 1;
                this.renderFilteredCategories();
                this.updateClearCategoriesFiltersButton();
            });
        }

        // Status filter change
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.categoriesPagination.currentPage = 1;
                this.renderFilteredCategories();
                this.updateClearCategoriesFiltersButton();
            });
        }

        // Clear filters button
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (clearSearchBtn) clearSearchBtn.style.display = 'none';
                if (parentFilter) parentFilter.value = '';
                if (statusFilter) statusFilter.value = '';
                this.categoriesPagination.currentPage = 1;
                this.renderFilteredCategories();
                this.updateClearCategoriesFiltersButton();
            });
        }
    }

    setupCategoriesPagination() {
        const perPageSelect = document.getElementById('categoriesPerPage');
        if (perPageSelect) {
            perPageSelect.addEventListener('change', (e) => {
                this.categoriesPagination.itemsPerPage = parseInt(e.target.value, 10);
                this.categoriesPagination.currentPage = 1;
                this.renderFilteredCategories();
            });
        }
    }

    populateParentFilter() {
        const parentFilter = document.getElementById('categoriesParentFilter');
        if (!parentFilter) return;

        const currentValue = parentFilter.value;

        // Clear existing options except "All Categories"
        parentFilter.innerHTML = '<option value="">All Categories</option>';

        // Add category options (excluding root categories for parent selection)
        this.allCategoriesForFilter.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name || `Category ${category.id}`;
            parentFilter.appendChild(option);
        });

        // Restore selected value if it still exists
        if (currentValue && this.allCategoriesForFilter.some(c => c.id == currentValue)) {
            parentFilter.value = currentValue;
        }
    }

    filterCategories(searchTerm, parentId, statusFilter) {
        let filtered = [...this.allCategoriesForFilter];

        // Filter by search term (name or slug)
        if (searchTerm) {
            const term = searchTerm.toLowerCase().trim();
            filtered = filtered.filter(category => {
                const name = (category.name || '').toLowerCase();
                const slug = (category.slug || '').toLowerCase();
                return name.includes(term) || slug.includes(term);
            });
        }

        // Filter by parent
        if (parentId) {
            const selectedParentId = parseInt(parentId, 10);
            filtered = filtered.filter(category => {
                return category.parent_id === selectedParentId;
            });
        }

        // Filter by status
        if (statusFilter) {
            const isActive = statusFilter === 'active';
            filtered = filtered.filter(category => {
                return category.is_active === isActive;
            });
        }

        return filtered;
    }

    renderFilteredCategories() {
        const container = document.getElementById('categoriesTable');
        if (!container) return;

        const searchInput = document.getElementById('categoriesSearchInput');
        const parentFilter = document.getElementById('categoriesParentFilter');
        const statusFilter = document.getElementById('categoriesStatusFilter');

        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const parentId = parentFilter ? parentFilter.value : '';
        const status = statusFilter ? statusFilter.value : '';

        // Filter categories
        let filteredCategories = this.filterCategories(searchTerm, parentId, status);

        // Build category map for parent lookup
        const categoryMap = {};
        this.allCategoriesForFilter.forEach(cat => {
            categoryMap[cat.id] = cat.name;
        });

        // Pagination
        const page = this.categoriesPagination.currentPage;
        const itemsPerPage = this.categoriesPagination.itemsPerPage;
        const totalCategories = filteredCategories.length;
        const totalPages = Math.ceil(totalCategories / itemsPerPage);
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedCategories = filteredCategories.slice(startIndex, endIndex);

        // Update pagination state
        this.categoriesPagination.totalCategories = totalCategories;
        this.categoriesPagination.totalPages = totalPages;

        // Render table
        if (paginatedCategories.length > 0) {
            container.innerHTML = this.renderCategoriesTable(paginatedCategories, categoryMap);
        } else {
            let message = 'No categories found.';
            if (searchTerm || parentId || status) {
                message = 'No categories match your filters.';
            }
            container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>${message}</p></div>`;
        }

        // Render pagination
        this.renderCategoriesPagination();
    }

    renderCategoriesPagination() {
        const paginationContainer = document.getElementById('categoriesPagination');
        if (!paginationContainer) return;

        const pagination = this.categoriesPagination;
        const totalCategories = pagination.totalCategories;
        const totalPages = pagination.totalPages;
        const currentPage = pagination.currentPage;

        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHTML = '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--gray-200);">';

        // Results count
        const startItem = totalCategories > 0 ? ((currentPage - 1) * pagination.itemsPerPage) + 1 : 0;
        const endItem = Math.min(currentPage * pagination.itemsPerPage, totalCategories);
        paginationHTML += `<div style="color: var(--gray-600); font-size: 0.875rem;">Showing ${startItem}-${endItem} of ${totalCategories} categories</div>`;

        // Pagination controls
        paginationHTML += '<div style="display: flex; gap: 0.5rem; align-items: center;">';

        // Previous button
        paginationHTML += `<button class="btn btn-sm btn-secondary" ${currentPage === 1 ? 'disabled' : ''} onclick="app.goToCategoriesPage(${currentPage - 1})" style="min-width: auto;">
            <i class="fas fa-chevron-left"></i>
        </button>`;

        // Page numbers
        const maxPagesToShow = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        if (endPage - startPage < maxPagesToShow - 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        if (startPage > 1) {
            paginationHTML += `<button class="btn btn-sm btn-secondary" onclick="app.goToCategoriesPage(1)" style="min-width: auto;">1</button>`;
            if (startPage > 2) {
                paginationHTML += `<span style="padding: 0 0.5rem; color: var(--gray-500);">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-secondary'}" onclick="app.goToCategoriesPage(${i})" style="min-width: auto;">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += `<span style="padding: 0 0.5rem; color: var(--gray-500);">...</span>`;
            }
            paginationHTML += `<button class="btn btn-sm btn-secondary" onclick="app.goToCategoriesPage(${totalPages})" style="min-width: auto;">${totalPages}</button>`;
        }

        // Next button
        paginationHTML += `<button class="btn btn-sm btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} onclick="app.goToCategoriesPage(${currentPage + 1})" style="min-width: auto;">
            <i class="fas fa-chevron-right"></i>
        </button>`;

        paginationHTML += '</div></div>';
        paginationContainer.innerHTML = paginationHTML;
    }

    goToCategoriesPage(page) {
        if (page < 1 || page > this.categoriesPagination.totalPages) return;
        this.categoriesPagination.currentPage = page;
        this.renderFilteredCategories();
        // Scroll to top of table
        const container = document.getElementById('categoriesTable');
        if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    updateClearCategoriesFiltersButton() {
        const clearFiltersBtn = document.getElementById('clearCategoriesFilters');
        if (!clearFiltersBtn) return;

        const searchInput = document.getElementById('categoriesSearchInput');
        const parentFilter = document.getElementById('categoriesParentFilter');
        const statusFilter = document.getElementById('categoriesStatusFilter');

        const hasSearch = searchInput && searchInput.value.trim() !== '';
        const hasParentFilter = parentFilter && parentFilter.value !== '';
        const hasStatusFilter = statusFilter && statusFilter.value !== '';

        clearFiltersBtn.style.display = (hasSearch || hasParentFilter || hasStatusFilter) ? 'block' : 'none';
    }

    async loadBrands() {
        const container = document.getElementById('brandsTable');
        if (!container) {
            console.warn('Brands table container not found');
            return;
        }

        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading brands...</div>';

        // Don't make API call if not authenticated
        if (!this.authToken) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view brands.</p></div>';
            return;
        }

        try {
            // Use admin API endpoint (requires auth)
            const response = await this.apiRequest('/admin/brands');

            // Handle null response (403 Forbidden)
            if (!response) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view brands.</p></div>';
                return;
            }

            if (response && response.length > 0) {
                container.innerHTML = this.renderBrandsTable(response);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>No brands found.</p></div>';
            }

            // Refresh brand dropdown in edit modal if it exists
            refreshBrandDropdown();

        } catch (error) {
            container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error);"><p>Failed to load brands: ${error.message}</p></div>`;
        }
    }

    renderBrandsTable(brands) {
        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Slug</th>
                            <th>Description</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${brands.map(brand => `
                            <tr>
                                <td>${brand.id}</td>
                                <td>${this.escapeHtml(brand.name || 'N/A')}</td>
                                <td><code>${this.escapeHtml(brand.slug || 'N/A')}</code></td>
                                <td>${this.escapeHtml((brand.description || '').substring(0, 100))}${brand.description && brand.description.length > 100 ? '...' : ''}</td>
                                <td>
                                    <span class="badge ${brand.is_active ? 'badge-success' : 'badge-danger'}">
                                        ${brand.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="editBrand(${brand.id})">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteBrand(${brand.id}, '${this.escapeHtml(brand.name)}')" style="margin-left: 0.5rem;">
                                        <i class="fas fa-trash"></i>
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

        // Handle 403 (Forbidden) before trying to parse JSON
        // This prevents errors when response body might not be valid JSON
        if (response.status === 403) {
            // If we have a token but get 403, it's invalid/expired - logout
            if (this.authToken) {
                this.logout();
            }
            // Don't throw error for 403 - just return null
            // This prevents console errors when user isn't authenticated
            // The browser will still log the 403 in Network tab, but our code won't add to it
            return null;
        }

        // Only try to parse JSON if response is ok or if we need error details
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            // If JSON parsing fails, return null for non-ok responses
            if (!response.ok) {
                return null;
            }
            throw parseError;
        }

        if (!response.ok) {
            // Check if this is an authentication error even if status isn't 401/403
            const errorMsg = (data.error || '').toLowerCase();
            if (errorMsg.includes('invalid admin token') ||
                errorMsg.includes('authentication') ||
                errorMsg.includes('forbidden') ||
                errorMsg.includes('unauthorized')) {
                // Return null for auth errors instead of throwing
                return null;
            }
            // Include status code and message for better debugging
            const errorMessage = data.error || data.message || `API request failed with status ${response.status}`;
            throw new Error(errorMessage);
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

    showProgressModal(title, initialMessage = '', showCancel = false) {
        // Remove existing progress modal if any
        const existingModal = document.getElementById('progressModal');
        if (existingModal) {
            document.body.removeChild(existingModal);
        }

        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'progressModal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';

        // Create modal content
        const content = document.createElement('div');
        content.style.cssText = 'background: white; border-radius: var(--border-radius-lg); padding: 2rem; max-width: 600px; width: 90%; box-shadow: var(--shadow-lg);';

        // Title
        const titleEl = document.createElement('h2');
        titleEl.textContent = title;
        titleEl.style.cssText = 'margin: 0 0 1.5rem 0; color: var(--primary-green); font-size: 1.5rem;';
        content.appendChild(titleEl);

        // Message
        const messageEl = document.createElement('div');
        messageEl.id = 'progressMessage';
        messageEl.textContent = initialMessage;
        messageEl.style.cssText = 'margin-bottom: 1.5rem; color: var(--gray-600); font-weight: 500;';
        content.appendChild(messageEl);

        // Scanning Progress Section
        const scanningSection = document.createElement('div');
        scanningSection.id = 'scanningSection';
        scanningSection.style.cssText = 'margin-bottom: 1.5rem;';

        const scanningLabel = document.createElement('div');
        scanningLabel.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--gray-700);';
        scanningLabel.innerHTML = '<span>Scanning Website</span><span id="scanningPercent">100%</span>';
        scanningSection.appendChild(scanningLabel);

        const scanningProgressWrapper = document.createElement('div');
        scanningProgressWrapper.style.cssText = 'width: 100%; height: 1.5rem; background-color: var(--gray-200); border-radius: var(--border-radius); overflow: hidden;';

        const scanningProgressBar = document.createElement('div');
        scanningProgressBar.id = 'scanningProgressBar';
        scanningProgressBar.style.cssText = 'height: 100%; background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%); width: 1%; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.75rem; font-weight: 600;';
        scanningProgressBar.textContent = '1%';

        scanningProgressWrapper.appendChild(scanningProgressBar);
        scanningSection.appendChild(scanningProgressWrapper);
        content.appendChild(scanningSection);

        // Scraping Progress Section (initially hidden)
        const scrapingSection = document.createElement('div');
        scrapingSection.id = 'scrapingSection';
        scrapingSection.style.cssText = 'margin-bottom: 1.5rem; display: none;';

        const scrapingLabel = document.createElement('div');
        scrapingLabel.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--gray-700);';
        scrapingLabel.innerHTML = '<span>Scraping Products</span><span id="scrapingPercent">100%</span>';
        scrapingSection.appendChild(scrapingLabel);

        const scrapingProgressWrapper = document.createElement('div');
        scrapingProgressWrapper.style.cssText = 'width: 100%; height: 1.5rem; background-color: var(--gray-200); border-radius: var(--border-radius); overflow: hidden;';

        const scrapingProgressBar = document.createElement('div');
        scrapingProgressBar.id = 'scrapingProgressBar';
        scrapingProgressBar.style.cssText = 'height: 100%; background: linear-gradient(90deg, var(--primary-green) 0%, var(--secondary-sage) 100%); width: 0%; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.75rem; font-weight: 600;';
        scrapingProgressBar.textContent = '0%';

        scrapingProgressWrapper.appendChild(scrapingProgressBar);
        scrapingSection.appendChild(scrapingProgressWrapper);
        content.appendChild(scrapingSection);

        // Progress info
        const progressInfo = document.createElement('div');
        progressInfo.id = 'progressInfo';
        progressInfo.style.cssText = 'display: flex; justify-content: space-between; font-size: 0.8125rem; color: var(--gray-600); margin-bottom: 1rem;';
        progressInfo.innerHTML = '<span id="progressStatus">Scanning...</span><span id="progressCount">0 products found</span>';
        content.appendChild(progressInfo);

        // Cancel button removed

        modal.appendChild(content);
        document.body.appendChild(modal);

        return modal;
    }

    updateProgressModal(percentage, message = '', productsFound = 0, stage = null) {
        const scanningProgressBar = document.getElementById('scanningProgressBar');
        const scanningPercent = document.getElementById('scanningPercent');
        const scrapingProgressBar = document.getElementById('scrapingProgressBar');
        const scrapingPercent = document.getElementById('scrapingPercent');
        const scanningSection = document.getElementById('scanningSection');
        const scrapingSection = document.getElementById('scrapingSection');
        const progressMessage = document.getElementById('progressMessage');
        const progressStatus = document.getElementById('progressStatus');
        const progressCount = document.getElementById('progressCount');

        // Determine which stage we're in based on stage parameter or percentage
        const isScanning = !stage || stage === 'initializing' || stage === 'scraping_main' || stage === 'finding_categories';
        const isScraping = stage === 'scraping_products';
        const isComplete = stage === 'complete' || stage === 'saving';
        const isError = stage === 'error';

        // Ensure minimum 1% is shown (unless it's 0 for error)
        const displayPercentage = percentage === 0 ? 0 : Math.max(1, percentage);

        // Map percentage to appropriate progress bar
        let scanningPercentage = 0;
        let scrapingPercentage = 0;

        if (isScanning) {
            // Scanning phase: 1-15% maps to 1-100% for scanning bar
            if (percentage <= 15) {
                scanningPercentage = Math.max(1, Math.round((percentage / 15) * 100));
            } else {
                scanningPercentage = 100; // Scanning complete
            }
        } else if (isScraping) {
            // Scanning is complete, show scraping bar
            scanningPercentage = 100;
            // Scraping phase: 15-85% maps to 1-100% for scraping bar
            if (percentage >= 15 && percentage <= 85) {
                scrapingPercentage = Math.max(1, Math.round(((percentage - 15) / 70) * 100));
            } else if (percentage > 85) {
                scrapingPercentage = 100;
            }
        } else if (isComplete) {
            scanningPercentage = 100;
            scrapingPercentage = 100;
        }

        // Update scanning progress bar
        if (scanningProgressBar && scanningPercent) {
            scanningProgressBar.style.width = `${scanningPercentage}%`;
            scanningProgressBar.textContent = `${scanningPercentage}%`;
            // Keep percentage label static at 100%
            scanningPercent.textContent = '100%';
        }

        // Show scraping section when scraping starts
        if (isScraping && scrapingSection && scrapingSection.style.display === 'none') {
            scanningSection.style.display = 'none';
            scrapingSection.style.display = 'block';
        }

        // Update scraping progress bar
        if (scrapingProgressBar && scrapingPercent && scrapingSection && scrapingSection.style.display !== 'none') {
            scrapingProgressBar.style.width = `${scrapingPercentage}%`;
            scrapingProgressBar.textContent = `${scrapingPercentage}%`;
            // Keep percentage label static at 100%
            scrapingPercent.textContent = '100%';
        }

        // Update message
        if (progressMessage && message) {
            progressMessage.textContent = message;
        }

        // Update status and count
        if (progressStatus) {
            if (isScanning) {
                progressStatus.textContent = 'Scanning...';
            } else if (isScraping) {
                progressStatus.textContent = 'Scraping...';
            } else if (isComplete) {
                progressStatus.textContent = 'Complete!';
            } else if (isError) {
                progressStatus.textContent = 'Error';
            }
        }

        if (progressCount) {
            const countText = productsFound > 0 ? `${productsFound} products found` : (isScanning ? 'Scanning website...' : 'Scraping products...');
            progressCount.textContent = countText;
        }
    }

    closeProgressModal() {
        const modal = document.getElementById('progressModal');
        if (modal) {
            document.body.removeChild(modal);
        }
    }

    showScrapingReport(report) {
        // Remove existing report modal if any
        const existingModal = document.getElementById('reportModal');
        if (existingModal) {
            document.body.removeChild(existingModal);
        }

        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'reportModal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 10001; display: flex; align-items: center; justify-content: center; overflow-y: auto; padding: 2rem;';

        // Create modal content
        const content = document.createElement('div');
        content.id = 'reportContent';
        content.style.cssText = 'background: white; border-radius: var(--border-radius-lg); padding: 2rem; max-width: 800px; width: 100%; box-shadow: var(--shadow-lg); max-height: 90vh; overflow-y: auto;';

        // Title
        const titleEl = document.createElement('h2');
        titleEl.textContent = 'Scraping Report';
        titleEl.style.cssText = 'margin: 0 0 1.5rem 0; color: var(--primary-green); font-size: 1.75rem; font-weight: 700;';
        content.appendChild(titleEl);

        // Report date
        const dateEl = document.createElement('div');
        dateEl.textContent = `Generated: ${new Date(report.endTime || new Date()).toLocaleString()}`;
        dateEl.style.cssText = 'margin-bottom: 2rem; color: var(--gray-600); font-size: 0.875rem;';
        content.appendChild(dateEl);

        // Summary section
        const summarySection = this.createReportSection('Summary', [
            { label: 'Total Products Found', value: report.totalProducts || 0, highlight: true },
            { label: 'Duration', value: report.durationFormatted || '0s' },
            { label: 'Pages Scanned', value: report.pagesScanned || 0 },
            { label: 'Success Rate', value: `${report.successRate || 100}%`, highlight: report.successRate >= 90 }
        ]);
        content.appendChild(summarySection);

        // Products section
        const productsSection = this.createReportSection('Products', [
            { label: 'Total Products', value: report.totalProducts || 0 },
            { label: 'With Prices', value: report.productsWithPrices || 0 },
            { label: 'With Images', value: report.productsWithImages || 0 },
            { label: 'Duplicates Skipped', value: report.duplicatesSkipped || 0 }
        ]);
        content.appendChild(productsSection);

        // Categories and Brands
        const categoriesSection = this.createReportSection('Categories & Brands', [
            { label: 'Categories Found', value: report.categoriesFound || 0 },
            { label: 'Brands Found', value: report.brandsFound || 0 }
        ]);
        content.appendChild(categoriesSection);

        // Categories list
        if (report.categoriesList && report.categoriesList.length > 0) {
            const categoriesListEl = document.createElement('div');
            categoriesListEl.style.cssText = 'margin-bottom: 1.5rem;';
            const categoriesTitle = document.createElement('h4');
            categoriesTitle.textContent = 'Categories:';
            categoriesTitle.style.cssText = 'margin: 0 0 0.5rem 0; color: var(--gray-700); font-size: 0.875rem; font-weight: 600;';
            categoriesListEl.appendChild(categoriesTitle);
            const categoriesText = document.createElement('div');
            categoriesText.textContent = report.categoriesList.slice(0, 20).join(', ') + (report.categoriesList.length > 20 ? ` ... and ${report.categoriesList.length - 20} more` : '');
            categoriesText.style.cssText = 'color: var(--gray-600); font-size: 0.8125rem; line-height: 1.5;';
            categoriesListEl.appendChild(categoriesText);
            content.appendChild(categoriesListEl);
        }

        // Brands list
        if (report.brandsList && report.brandsList.length > 0) {
            const brandsListEl = document.createElement('div');
            brandsListEl.style.cssText = 'margin-bottom: 1.5rem;';
            const brandsTitle = document.createElement('h4');
            brandsTitle.textContent = 'Brands:';
            brandsTitle.style.cssText = 'margin: 0 0 0.5rem 0; color: var(--gray-700); font-size: 0.875rem; font-weight: 600;';
            brandsListEl.appendChild(brandsTitle);
            const brandsText = document.createElement('div');
            brandsText.textContent = report.brandsList.slice(0, 20).join(', ') + (report.brandsList.length > 20 ? ` ... and ${report.brandsList.length - 20} more` : '');
            brandsText.style.cssText = 'color: var(--gray-600); font-size: 0.8125rem; line-height: 1.5;';
            brandsListEl.appendChild(brandsText);
            content.appendChild(brandsListEl);
        }

        // Errors section
        if (report.errors && report.errors.length > 0) {
            const errorsSection = this.createReportSection('Errors', [
                { label: 'Total Errors', value: report.errors.length, highlight: true }
            ]);
            content.appendChild(errorsSection);

            const errorsListEl = document.createElement('div');
            errorsListEl.style.cssText = 'margin-bottom: 1.5rem; max-height: 200px; overflow-y: auto;';
            const errorsTitle = document.createElement('h4');
            errorsTitle.textContent = 'Error Details:';
            errorsTitle.style.cssText = 'margin: 0 0 0.5rem 0; color: var(--error); font-size: 0.875rem; font-weight: 600;';
            errorsListEl.appendChild(errorsTitle);

            const errorsList = document.createElement('ul');
            errorsList.style.cssText = 'margin: 0; padding-left: 1.5rem; color: var(--gray-600); font-size: 0.8125rem;';
            report.errors.slice(0, 10).forEach(error => {
                const li = document.createElement('li');
                li.style.cssText = 'margin-bottom: 0.25rem;';
                li.textContent = `${error.url || 'Unknown'}: ${error.message}`;
                errorsList.appendChild(li);
            });
            if (report.errors.length > 10) {
                const li = document.createElement('li');
                li.textContent = `... and ${report.errors.length - 10} more errors`;
                li.style.cssText = 'margin-top: 0.5rem; font-style: italic;';
                errorsList.appendChild(li);
            }
            errorsListEl.appendChild(errorsList);
            content.appendChild(errorsListEl);
        }

        // Action buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 1rem; margin-top: 2rem;';

        // Download PDF button
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download PDF';
        downloadBtn.className = 'btn btn-primary';
        downloadBtn.style.cssText = 'flex: 1;';
        downloadBtn.onclick = () => this.downloadReportPDF(report);
        buttonContainer.appendChild(downloadBtn);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.className = 'btn btn-secondary';
        closeBtn.style.cssText = 'flex: 1;';
        closeBtn.onclick = () => {
            document.body.removeChild(modal);
        };
        buttonContainer.appendChild(closeBtn);

        content.appendChild(buttonContainer);
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    createReportSection(title, items) {
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 1.5rem; padding: 1rem; background: var(--gray-50); border-radius: var(--border-radius);';

        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = title;
        sectionTitle.style.cssText = 'margin: 0 0 1rem 0; color: var(--primary-green); font-size: 1rem; font-weight: 600;';
        section.appendChild(sectionTitle);

        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;';

        items.forEach(item => {
            const itemEl = document.createElement('div');
            const label = document.createElement('div');
            label.textContent = item.label;
            label.style.cssText = 'font-size: 0.75rem; color: var(--gray-600); margin-bottom: 0.25rem;';
            itemEl.appendChild(label);

            const value = document.createElement('div');
            value.textContent = item.value;
            value.style.cssText = `font-size: 1.125rem; font-weight: ${item.highlight ? '700' : '600'}; color: ${item.highlight ? 'var(--primary-green)' : 'var(--gray-800)'};`;
            itemEl.appendChild(value);

            grid.appendChild(itemEl);
        });

        section.appendChild(grid);
        return section;
    }

    downloadReportPDF(report) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Set font
        doc.setFont('helvetica');

        // Title
        doc.setFontSize(20);
        doc.setTextColor(45, 90, 39); // Primary green
        doc.text('Scraping Report', 14, 20);

        // Date
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated: ${new Date(report.endTime || new Date()).toLocaleString()}`, 14, 30);

        let yPos = 45;

        // Summary
        doc.setFontSize(14);
        doc.setTextColor(45, 90, 39);
        doc.text('Summary', 14, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Total Products Found: ${report.totalProducts || 0}`, 20, yPos);
        yPos += 7;
        doc.text(`Duration: ${report.durationFormatted || '0s'}`, 20, yPos);
        yPos += 7;
        doc.text(`Pages Scanned: ${report.pagesScanned || 0}`, 20, yPos);
        yPos += 7;
        doc.text(`Success Rate: ${report.successRate || 100}%`, 20, yPos);
        yPos += 12;

        // Products
        doc.setFontSize(14);
        doc.setTextColor(45, 90, 39);
        doc.text('Products', 14, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Total Products: ${report.totalProducts || 0}`, 20, yPos);
        yPos += 7;
        doc.text(`With Prices: ${report.productsWithPrices || 0}`, 20, yPos);
        yPos += 7;
        doc.text(`With Images: ${report.productsWithImages || 0}`, 20, yPos);
        yPos += 7;
        doc.text(`Duplicates Skipped: ${report.duplicatesSkipped || 0}`, 20, yPos);
        yPos += 12;

        // Categories & Brands
        doc.setFontSize(14);
        doc.setTextColor(45, 90, 39);
        doc.text('Categories & Brands', 14, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Categories Found: ${report.categoriesFound || 0}`, 20, yPos);
        yPos += 7;
        doc.text(`Brands Found: ${report.brandsFound || 0}`, 20, yPos);
        yPos += 12;

        // Categories list
        if (report.categoriesList && report.categoriesList.length > 0) {
            doc.setFontSize(12);
            doc.setTextColor(45, 90, 39);
            doc.text('Categories:', 14, yPos);
            yPos += 7;

            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            const categoriesText = report.categoriesList.join(', ');
            const categoriesLines = doc.splitTextToSize(categoriesText, 180);
            doc.text(categoriesLines, 20, yPos);
            yPos += categoriesLines.length * 5 + 5;
        }

        // Brands list
        if (report.brandsList && report.brandsList.length > 0) {
            doc.setFontSize(12);
            doc.setTextColor(45, 90, 39);
            doc.text('Brands:', 14, yPos);
            yPos += 7;

            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            const brandsText = report.brandsList.join(', ');
            const brandsLines = doc.splitTextToSize(brandsText, 180);
            doc.text(brandsLines, 20, yPos);
            yPos += brandsLines.length * 5 + 5;
        }

        // Errors
        if (report.errors && report.errors.length > 0) {
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFontSize(14);
            doc.setTextColor(239, 68, 68); // Error red
            doc.text('Errors', 14, yPos);
            yPos += 10;

            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Total Errors: ${report.errors.length}`, 20, yPos);
            yPos += 10;

            doc.setFontSize(9);
            report.errors.slice(0, 20).forEach((error, index) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
                const errorText = `${index + 1}. ${error.url || 'Unknown'}: ${error.message}`;
                const errorLines = doc.splitTextToSize(errorText, 180);
                doc.text(errorLines, 20, yPos);
                yPos += errorLines.length * 5 + 3;
            });
        }

        // Save PDF
        const fileName = `scraping-report-${new Date(report.endTime || new Date()).toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
    }
}

// Global functions for button clicks
async function matchProductsToBrands() {
    const app = window.adminApp;
    const btn = document.getElementById('matchBrandsBtn');

    if (!app || !app.authToken) {
        app.showNotification('Please log in to match products to brands', 'error');
        return;
    }

    // Confirm action
    if (!confirm('This will match products to brands based on product name prefixes. This may update many products. Continue?')) {
        return;
    }

    try {
        // Disable button and show loading
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Matching...';
        }

        app.showNotification('Matching products to brands...', 'info');

        const response = await app.apiRequest('/admin/products/match-brands', {
            method: 'POST'
        });

        if (response && response.success) {
            const results = response.results;
            let message = `Matching complete! `;
            message += `Matched: ${results.matched}, Updated: ${results.updated}`;
            if (results.notMatched > 0) {
                message += `, Not matched: ${results.notMatched}`;
            }

            app.showNotification(message, 'success');

            // Reload products to show updated brand associations
            setTimeout(() => {
                app.loadProducts();
            }, 1000);

            // Show details if there are unmatched products
            if (results.notMatchedProducts && results.notMatchedProducts.length > 0) {
                console.log('Products that could not be matched:', results.notMatchedProducts);
            }
        } else {
            app.showNotification(response?.error || 'Failed to match products to brands', 'error');
        }
    } catch (error) {
        app.showNotification('Error matching products to brands: ' + error.message, 'error');
        console.error('Match products to brands error:', error);
    } finally {
        // Re-enable button
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-link"></i> Match Products to Brands';
        }
    }
}

async function scrapeProducts() {
    const app = window.adminApp;

    try {
        app.showNotification('Starting product scraping from HM Herbs website...', 'info');

        // Show progress modal
        const progressModal = app.showProgressModal('Scraping Products', 'Initializing and scanning website structure...', false);

        const response = await fetch(`${app.apiBaseUrl}/admin/scrape-products?progress=true`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${app.authToken}`,
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Read SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    // Skip empty lines and comments
                    if (!line.trim() || line.startsWith(':')) continue;

                    if (line.startsWith('data: ')) {
                        try {
                            const jsonStr = line.slice(6).trim();
                            if (!jsonStr) continue;

                            const data = JSON.parse(jsonStr);
                            console.log('Received SSE data:', data);

                            if (data.type === 'complete') {
                                const productsFound = data.productsFound || 0;
                                const report = data.report || null;
                                app.updateProgressModal(100, `Scraping complete! Found ${productsFound} products.`, productsFound, 'complete');
                                app.showNotification(`Successfully scraped ${productsFound} products!`, 'success');
                                app.loadProducts(); // Reload products table
                                setTimeout(() => {
                                    app.closeProgressModal();
                                    if (report) {
                                        app.showScrapingReport(report);
                                    }
                                }, 2000);
                                return;
                            } else if (data.type === 'error') {
                                app.updateProgressModal(0, `Error: ${data.error || 'Scraping failed'}`, 0, 'error');
                                throw new Error(data.error || 'Scraping failed');
                            } else {
                                // Progress update - ensure minimum 1% is shown
                                const percentage = Math.max(1, data.percentage || 1);
                                const message = data.message || 'Scanning website...';
                                const productsFound = data.productsFound || 0;
                                const stage = data.stage || null;
                                console.log('Progress update:', percentage + '%', message, productsFound + ' products', 'stage:', stage);
                                app.updateProgressModal(percentage, message, productsFound, stage);
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    } catch (error) {
        console.error('Scraping error:', error);
        app.updateProgressModal(0, `Error: ${error.message}`, 0, 'error');
        app.showNotification(`Scraping failed: ${error.message}`, 'error');
        setTimeout(() => app.closeProgressModal(), 5000);
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

// Helper function to add Escape key support to modals
function addEscapeKeySupport(modal) {
    const escapeHandler = (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
            // Check if this modal is still open and visible
            if (modal && modal.parentNode && (modal.style.display === 'block' || window.getComputedStyle(modal).display === 'block')) {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

// Helper function to create modal structure safely
function createProductModal(title, formId, isEdit = false) {
    const modal = document.createElement('div');
    modal.className = 'modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '1100px'; // Wider for product form
    modalContent.style.maxHeight = '95vh'; // Allow more vertical space

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = function () { this.closest('.modal').remove(); };

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.padding = '2rem';

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
    } else {
        // Add brand dropdown for edit mode with link to brands section
        fields.push({
            type: 'select', label: 'Brand *', id: 'edit-brand', name: 'brand_id', required: true,
            options: [{ value: '', text: 'Loading brands...' }],
            hasLink: true, // Flag to add link button
            linkSection: 'brands'
        });
        // Add category dropdown for edit mode with link to categories section
        fields.push({
            type: 'select', label: 'Category *', id: 'edit-category', name: 'category_id', required: true,
            options: [{ value: '', text: 'Loading categories...' }],
            hasLink: true, // Flag to add link button
            linkSection: 'categories'
        });
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

    // Create form sections for better organization
    const basicInfoSection = document.createElement('div');
    basicInfoSection.style.marginBottom = '2rem';
    basicInfoSection.style.paddingBottom = '1.5rem';
    basicInfoSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitle1 = document.createElement('h3');
    sectionTitle1.textContent = 'Basic Information';
    sectionTitle1.style.fontSize = '1.1rem';
    sectionTitle1.style.fontWeight = '600';
    sectionTitle1.style.color = 'var(--primary-green)';
    sectionTitle1.style.marginBottom = '1.5rem'; // Increased spacing below section title
    basicInfoSection.appendChild(sectionTitle1);

    const pricingSection = document.createElement('div');
    pricingSection.style.marginBottom = '2.5rem'; // Increased spacing
    pricingSection.style.paddingBottom = '2rem'; // Increased spacing
    pricingSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitle2 = document.createElement('h3');
    sectionTitle2.textContent = 'Pricing & Inventory';
    sectionTitle2.style.fontSize = '1.1rem';
    sectionTitle2.style.fontWeight = '600';
    sectionTitle2.style.color = 'var(--primary-green)';
    sectionTitle2.style.marginBottom = '1.5rem'; // Increased spacing below section title
    pricingSection.appendChild(sectionTitle2);

    const additionalSection = document.createElement('div');
    additionalSection.style.marginBottom = '2rem';

    // Create form fields with better spacing
    let currentRow = null;
    fields.forEach((field, index) => {
        const isBasicInfo = field.name === 'sku' || field.name === 'name' ||
            field.name === 'short_description' || field.name === 'long_description' ||
            field.name === 'health_categories';
        const isPricing = field.name === 'price' || field.name === 'compare_price' ||
            field.name === 'inventory_quantity' || field.name === 'low_stock_threshold' ||
            field.name === 'brand_id' || field.name === 'category_id' ||
            field.name === 'weight';
        const isRowField = (field.label.includes('Price') && field.label !== 'Compare Price') ||
            (field.label.includes('Brand') || field.label.includes('Category')) ||
            (field.label.includes('Inventory') || field.label.includes('Low Stock'));

        // Determine which section this field belongs to
        let targetSection = additionalSection;
        if (isBasicInfo) targetSection = basicInfoSection;
        else if (isPricing) targetSection = pricingSection;

        if (isRowField && (!currentRow || currentRow.children.length >= 2)) {
            currentRow = document.createElement('div');
            currentRow.className = 'form-row';
            currentRow.style.gap = '1.5rem'; // Increased gap between columns
            targetSection.appendChild(currentRow);
        }

        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.style.marginBottom = '1.75rem'; // Increased spacing between fields
        formGroup.style.display = 'flex';
        formGroup.style.flexDirection = 'column';
        formGroup.style.width = '100%';

        const label = document.createElement('label');
        label.setAttribute('for', field.id);
        label.textContent = field.label;
        label.style.display = 'block';
        label.style.marginBottom = '0.75rem';
        label.style.fontWeight = '500';
        label.style.color = 'var(--gray-700)';
        label.style.fontSize = '0.875rem';
        label.style.width = '100%';
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
            const selectWrapper = document.createElement('div');
            selectWrapper.style.display = 'flex';
            selectWrapper.style.gap = '0.5rem';
            selectWrapper.style.alignItems = 'flex-end';

            const select = document.createElement('select');
            select.id = field.id;
            select.setAttribute('name', field.name);
            if (field.required) select.setAttribute('required', '');
            select.style.flex = '1';

            field.options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.setAttribute('value', option.value);
                optionEl.textContent = option.text;
                select.appendChild(optionEl);
            });
            selectWrapper.appendChild(select);

            // Add link button to brands/categories section if this is the brand/category field in edit mode
            if (field.hasLink && (field.id === 'edit-brand' || field.id === 'edit-category')) {
                const linkBtn = document.createElement('button');
                linkBtn.type = 'button';
                linkBtn.className = 'btn btn-secondary btn-sm';
                linkBtn.style.whiteSpace = 'nowrap';
                const sectionName = field.linkSection === 'brands' ? 'Brands' : 'Categories';
                linkBtn.innerHTML = `<i class="fas fa-external-link-alt"></i> Manage ${sectionName}`;
                linkBtn.onclick = function () {
                    // Close modal and navigate to section
                    const modal = this.closest('.modal');
                    if (modal) {
                        modal.remove();
                    }
                    // Navigate to section
                    if (window.adminApp) {
                        window.adminApp.showSection(field.linkSection);
                    }
                };
                selectWrapper.appendChild(linkBtn);
            }

            formGroup.appendChild(selectWrapper);
        }

        if (isRowField && currentRow) {
            currentRow.appendChild(formGroup);
        } else {
            targetSection.appendChild(formGroup);
        }
    });

    // Add sections to form
    form.appendChild(basicInfoSection);
    form.appendChild(pricingSection);
    if (additionalSection.children.length > 0) {
        form.appendChild(additionalSection);
    }

    // Add image upload section
    const imageSection = document.createElement('div');
    imageSection.style.marginBottom = '2.5rem';
    imageSection.style.paddingBottom = '2rem';
    imageSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitleImages = document.createElement('h3');
    sectionTitleImages.textContent = 'Product Images';
    sectionTitleImages.style.fontSize = '1.1rem';
    sectionTitleImages.style.fontWeight = '600';
    sectionTitleImages.style.color = 'var(--primary-green)';
    sectionTitleImages.style.marginBottom = '1.5rem';
    imageSection.appendChild(sectionTitleImages);

    const imageUploadContainer = document.createElement('div');
    imageUploadContainer.id = `${isEdit ? 'edit' : 'add'}-image-upload-container`;
    imageUploadContainer.style.marginBottom = '1rem';

    // Unified input container with both file and URL support
    const unifiedInputGroup = document.createElement('div');
    unifiedInputGroup.className = 'form-group';
    unifiedInputGroup.style.marginBottom = '1rem';

    const inputLabel = document.createElement('label');
    inputLabel.textContent = 'Add Images (Upload files or paste URL)';
    inputLabel.style.display = 'block';
    inputLabel.style.marginBottom = '0.75rem';
    inputLabel.style.fontWeight = '500';
    inputLabel.style.color = 'var(--gray-700)';
    inputLabel.style.fontSize = '0.875rem';
    unifiedInputGroup.appendChild(inputLabel);

    // Container for the unified input
    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.gap = '0.5rem';
    inputContainer.style.alignItems = 'stretch';
    inputContainer.style.position = 'relative';

    // Wrapper for input and browse button (to create integrated look)
    const inputWrapper = document.createElement('div');
    inputWrapper.style.display = 'flex';
    inputWrapper.style.flex = '1';
    inputWrapper.style.position = 'relative';
    inputWrapper.style.alignItems = 'stretch';

    // Text input that accepts both URLs and triggers file selection
    const unifiedInput = document.createElement('input');
    unifiedInput.setAttribute('type', 'text');
    unifiedInput.id = `${isEdit ? 'edit' : 'add'}-product-images-unified`;
    unifiedInput.setAttribute('placeholder', 'Paste image URL or click "Browse" to upload files');
    unifiedInput.className = 'form-input';
    unifiedInput.style.flex = '1';
    unifiedInput.style.borderTopRightRadius = '0';
    unifiedInput.style.borderBottomRightRadius = '0';
    unifiedInput.style.borderRight = 'none';
    unifiedInput.style.marginBottom = '0';

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.setAttribute('type', 'file');
    fileInput.setAttribute('accept', 'image/*');
    fileInput.setAttribute('multiple', 'multiple');
    fileInput.id = `${isEdit ? 'edit' : 'add'}-product-images-file`;
    fileInput.setAttribute('name', 'product_images');
    fileInput.style.display = 'none';

    // Browse button - integrated with input field, styled as primary button
    const browseBtn = document.createElement('button');
    browseBtn.setAttribute('type', 'button');
    browseBtn.textContent = 'Browse';
    browseBtn.className = 'btn btn-primary';
    browseBtn.style.borderTopLeftRadius = '0';
    browseBtn.style.borderBottomLeftRadius = '0';
    browseBtn.style.borderLeft = '1px solid var(--primary-green)';
    browseBtn.style.padding = '0.75rem 1.5rem';
    browseBtn.style.fontSize = '0.875rem';
    browseBtn.style.fontWeight = '500';
    browseBtn.style.whiteSpace = 'nowrap';
    browseBtn.style.minWidth = 'auto';
    browseBtn.style.marginBottom = '0';
    browseBtn.onclick = function () {
        fileInput.click();
    };

    // Assemble the input wrapper
    inputWrapper.appendChild(unifiedInput);
    inputWrapper.appendChild(browseBtn);

    // Assemble the container
    inputContainer.appendChild(inputWrapper);
    unifiedInputGroup.appendChild(inputContainer);
    unifiedInputGroup.appendChild(fileInput);

    // Image preview container
    const previewContainer = document.createElement('div');
    previewContainer.id = `${isEdit ? 'edit' : 'add'}-image-preview-container`;
    previewContainer.style.display = 'grid';
    previewContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    previewContainer.style.gap = '1rem';
    previewContainer.style.marginTop = '1rem';

    imageUploadContainer.appendChild(unifiedInputGroup);
    imageSection.appendChild(imageUploadContainer);
    imageSection.appendChild(previewContainer);

    // Store selected images
    const selectedImages = [];

    // Helper function to add image
    function addImage(imageUrl, file = null, alt = '') {
        const imageData = {
            url: imageUrl,
            file: file,
            alt: alt || (file ? file.name.replace(/\.[^/.]+$/, '') : ''),
            isPrimary: selectedImages.length === 0
        };
        selectedImages.push(imageData);
        updateImagePreview();
        unifiedInput.value = ''; // Clear input after adding
        fileInput.value = ''; // Clear file input
    }

    // File input change handler - upload files to server
    fileInput.addEventListener('change', async function (e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const app = window.adminApp;
        if (!app || !app.authToken) {
            alert('Please log in to upload images');
            return;
        }

        // Show loading state on browse button
        const originalBrowseBtnText = browseBtn.textContent;
        browseBtn.disabled = true;
        browseBtn.textContent = 'Uploading...';

        try {
            // Upload each file
            for (const file of files) {
                if (!file.type.startsWith('image/')) {
                    alert(`${file.name} is not an image file. Skipping.`);
                    continue;
                }

                const formData = new FormData();
                formData.append('image', file);

                const response = await fetch(`${app.apiBaseUrl}/admin/products/upload-image`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${app.authToken}`
                    },
                    body: formData
                });

                if (response.ok) {
                    const result = await response.json();
                    // Use the server URL instead of data URL
                    addImage(result.url, null, file.name.replace(/\.[^/.]+$/, ''));
                } else {
                    const error = await response.json();
                    console.error('Failed to upload image:', error);
                    alert(`Failed to upload ${file.name}: ${error.error || 'Unknown error'}`);
                }
            }
        } catch (error) {
            console.error('Error uploading images:', error);
            alert('Error uploading images. Please try again.');
        } finally {
            // Reset button state
            browseBtn.disabled = false;
            browseBtn.textContent = originalBrowseBtnText;
            fileInput.value = ''; // Clear file input
        }
    });

    // Unified input handlers
    // Handle Enter key or Add button click
    function handleAddInput() {
        const value = unifiedInput.value.trim();
        if (!value) return;

        // Check if it's a URL
        if (isValidImageUrl(value) || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/')) {
            addImage(value);
        } else {
            // If not a valid URL, try to trigger file selection
            alert('Please enter a valid image URL (starting with http:// or https://) or use the Browse button to select files');
        }
    }

    unifiedInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddInput();
        }
    });

    // Add button removed - users can press Enter or paste URLs (which auto-add)

    // Handle paste events for URLs
    unifiedInput.addEventListener('paste', function (e) {
        setTimeout(() => {
            const pastedValue = unifiedInput.value.trim();
            if (isValidImageUrl(pastedValue) || pastedValue.startsWith('http://') || pastedValue.startsWith('https://')) {
                // Auto-add if it looks like a valid URL
                setTimeout(() => {
                    if (unifiedInput.value.trim() === pastedValue) {
                        handleAddInput();
                    }
                }, 100);
            }
        }, 10);
    });

    // Update image preview
    function updateImagePreview() {
        previewContainer.innerHTML = '';
        selectedImages.forEach((imageData, index) => {
            const imageCard = document.createElement('div');
            imageCard.style.position = 'relative';
            imageCard.style.border = '2px solid var(--gray-300)';
            imageCard.style.borderRadius = 'var(--border-radius)';
            imageCard.style.padding = '0.5rem';
            imageCard.style.backgroundColor = 'var(--gray-50)';

            const img = document.createElement('img');
            img.src = imageData.url;
            img.style.width = '100%';
            img.style.height = '150px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = 'var(--border-radius)';
            img.style.marginBottom = '0.5rem';

            const primaryBadge = document.createElement('div');
            if (imageData.isPrimary) {
                primaryBadge.textContent = 'Primary';
                primaryBadge.style.position = 'absolute';
                primaryBadge.style.top = '0.5rem';
                primaryBadge.style.right = '0.5rem';
                primaryBadge.style.backgroundColor = 'var(--primary-green)';
                primaryBadge.style.color = 'white';
                primaryBadge.style.padding = '0.25rem 0.5rem';
                primaryBadge.style.borderRadius = 'var(--border-radius)';
                primaryBadge.style.fontSize = '0.75rem';
                primaryBadge.style.fontWeight = '600';
            }

            const buttonRow = document.createElement('div');
            buttonRow.style.display = 'flex';
            buttonRow.style.gap = '0.5rem';
            buttonRow.style.marginTop = '0.5rem';

            if (!imageData.isPrimary) {
                const setPrimaryBtn = document.createElement('button');
                setPrimaryBtn.setAttribute('type', 'button');
                setPrimaryBtn.textContent = 'Set Primary';
                setPrimaryBtn.className = 'btn btn-sm btn-secondary';
                setPrimaryBtn.style.flex = '1';
                setPrimaryBtn.style.fontSize = '0.75rem';
                setPrimaryBtn.onclick = function () {
                    selectedImages.forEach(img => img.isPrimary = false);
                    imageData.isPrimary = true;
                    updateImagePreview();
                };
                buttonRow.appendChild(setPrimaryBtn);
            }

            const removeBtn = document.createElement('button');
            removeBtn.setAttribute('type', 'button');
            removeBtn.textContent = 'Remove';
            removeBtn.className = 'btn btn-sm btn-danger';
            removeBtn.style.flex = '1';
            removeBtn.style.fontSize = '0.75rem';
            removeBtn.onclick = function () {
                selectedImages.splice(index, 1);
                if (selectedImages.length > 0 && imageData.isPrimary) {
                    selectedImages[0].isPrimary = true;
                }
                updateImagePreview();
            };
            buttonRow.appendChild(removeBtn);

            imageCard.appendChild(img);
            if (imageData.isPrimary) {
                imageCard.appendChild(primaryBadge);
            }
            imageCard.appendChild(buttonRow);
            previewContainer.appendChild(imageCard);
        });
    }

    // Helper function to validate image URL
    function isValidImageUrl(url) {
        try {
            const urlObj = new URL(url);
            return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(urlObj.pathname) ||
                url.startsWith('data:image/');
        } catch {
            return false;
        }
    }

    // Store images array on form element for later retrieval
    form.selectedImages = selectedImages;

    // Helper function to get images from form
    form.getImages = function () {
        return this.selectedImages.map(img => ({
            url: img.url,
            alt: img.alt || '',
            is_primary: img.isPrimary
        }));
    };

    // Store update function on form for external access
    form.updateImagePreview = updateImagePreview;

    form.appendChild(imageSection);

    // Add status section
    const statusSection = document.createElement('div');
    statusSection.style.marginBottom = '2.5rem'; // Increased spacing
    statusSection.style.paddingBottom = '2rem'; // Increased spacing
    statusSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitle3 = document.createElement('h3');
    sectionTitle3.textContent = 'Status & Settings';
    sectionTitle3.style.fontSize = '1.1rem';
    sectionTitle3.style.fontWeight = '600';
    sectionTitle3.style.color = 'var(--primary-green)';
    sectionTitle3.style.marginBottom = '1.5rem'; // Increased spacing below section title
    statusSection.appendChild(sectionTitle3);

    const checkboxRow = document.createElement('div');
    checkboxRow.className = 'form-row';
    checkboxRow.style.gap = '1.5rem'; // Increased gap between columns

    const activeGroup = document.createElement('div');
    activeGroup.className = 'form-group';
    activeGroup.style.marginBottom = '0';
    const activeLabel = document.createElement('label');
    activeLabel.style.display = 'flex';
    activeLabel.style.alignItems = 'center';
    activeLabel.style.cursor = 'pointer';
    activeLabel.style.fontWeight = '500';
    const activeCheckbox = document.createElement('input');
    activeCheckbox.setAttribute('type', 'checkbox');
    activeCheckbox.id = `${isEdit ? 'edit' : 'add'}-is-active`;
    activeCheckbox.setAttribute('name', 'is_active');
    activeCheckbox.checked = true;
    activeCheckbox.style.marginRight = '0.75rem';
    activeCheckbox.style.width = '1.25rem';
    activeCheckbox.style.height = '1.25rem';
    activeLabel.appendChild(activeCheckbox);
    activeLabel.appendChild(document.createTextNode(' Active Product'));
    activeGroup.appendChild(activeLabel);

    const featuredGroup = document.createElement('div');
    featuredGroup.className = 'form-group';
    featuredGroup.style.marginBottom = '0';
    const featuredLabel = document.createElement('label');
    featuredLabel.style.display = 'flex';
    featuredLabel.style.alignItems = 'center';
    featuredLabel.style.cursor = 'pointer';
    featuredLabel.style.fontWeight = '500';
    const featuredCheckbox = document.createElement('input');
    featuredCheckbox.setAttribute('type', 'checkbox');
    featuredCheckbox.id = `${isEdit ? 'edit' : 'add'}-is-featured`;
    featuredCheckbox.setAttribute('name', 'is_featured');
    featuredCheckbox.style.marginRight = '0.75rem';
    featuredCheckbox.style.width = '1.25rem';
    featuredCheckbox.style.height = '1.25rem';
    featuredLabel.appendChild(featuredCheckbox);
    featuredLabel.appendChild(document.createTextNode(' Featured Product'));
    featuredGroup.appendChild(featuredLabel);

    checkboxRow.appendChild(activeGroup);
    checkboxRow.appendChild(featuredGroup);
    statusSection.appendChild(checkboxRow);
    form.appendChild(statusSection);

    // Form actions
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.style.marginTop = '2.5rem';
    actions.style.paddingTop = '1.5rem';
    actions.style.borderTop = '2px solid var(--gray-200)';

    const cancelBtn = document.createElement('button');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.padding = '0.875rem 1.75rem';
    cancelBtn.style.fontSize = '0.9375rem';
    cancelBtn.onclick = function () { this.closest('.modal').remove(); };

    const submitBtn = document.createElement('button');
    submitBtn.setAttribute('type', 'submit');
    submitBtn.textContent = isEdit ? 'Update Product' : 'Add Product';
    submitBtn.className = 'btn btn-primary';
    submitBtn.style.padding = '0.875rem 1.75rem';
    submitBtn.style.fontSize = '0.9375rem';

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    body.appendChild(form);
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modal.appendChild(modalContent);

    return modal;
}

// Global function to refresh brand dropdown (can be called from anywhere)
async function refreshBrandDropdown() {
    const brandSelect = document.getElementById('edit-brand');
    if (!brandSelect) return;

    try {
        const app = window.adminApp;
        if (!app) return;

        // Fetch brands from API (use admin endpoint for consistency)
        const response = await fetch(`${app.apiBaseUrl}/admin/brands`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            const brands = await response.json();
            const currentValue = brandSelect.value; // Preserve current selection

            // Clear existing options
            brandSelect.innerHTML = '<option value="">Select Brand</option>';

            // Add brands to dropdown
            brands.forEach(brand => {
                const option = document.createElement('option');
                option.value = brand.id;
                option.textContent = brand.name;
                brandSelect.appendChild(option);
            });

            // Restore previous selection if it still exists
            if (currentValue) {
                brandSelect.value = currentValue;
            }
        } else {
            brandSelect.innerHTML = '<option value="">Failed to load brands</option>';
        }
    } catch (error) {
        const brandSelect = document.getElementById('edit-brand');
        if (brandSelect) {
            brandSelect.innerHTML = '<option value="">Error loading brands</option>';
        }
        console.error('Error loading brands:', error);
    }
}

// Global function to refresh category dropdown (can be called from anywhere)
async function refreshCategoryDropdown() {
    const categorySelect = document.getElementById('edit-category');
    if (!categorySelect) return;

    try {
        const app = window.adminApp;
        if (!app) return;

        // Fetch categories from API (use admin endpoint)
        const response = await fetch(`${app.apiBaseUrl}/admin/categories`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            const categories = await response.json();
            const currentValue = categorySelect.value; // Preserve current selection

            // Clear existing options
            categorySelect.innerHTML = '<option value="">Select Category</option>';

            // Add categories to dropdown
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categorySelect.appendChild(option);
            });

            // Restore previous selection if it still exists
            if (currentValue) {
                categorySelect.value = currentValue;
            }
        } else {
            categorySelect.innerHTML = '<option value="">Failed to load categories</option>';
        }
    } catch (error) {
        const categorySelect = document.getElementById('edit-category');
        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Error loading categories</option>';
        }
        console.error('Error loading categories:', error);
    }
}

async function loadBrandsForEdit() {
    await refreshBrandDropdown();
}

async function loadCategoriesForEdit() {
    await refreshCategoryDropdown();
}

function editProduct(productId) {
    // Create and show product editing modal using safe helper
    const modal = createProductModal('Edit Product', 'edit-product-form', true);

    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Add Escape key support
    addEscapeKeySupport(modal);

    // Load brands and categories for the dropdowns
    loadBrandsForEdit();
    loadCategoriesForEdit();

    // Load existing product data
    loadProductForEdit(productId);

    // Handle form submission
    const form = document.getElementById('edit-product-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProduct(productId, new FormData(e.target), e.target);
        modal.remove();
    });
}


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
            // Handle both boolean and numeric values (1/0 from database)
            const isFeatured = product.is_featured === true ||
                product.is_featured === 1 ||
                product.is_featured === '1' ||
                product.is_featured === 'true';
            document.getElementById('edit-is-featured').checked = isFeatured;

            // Set brand and category if available
            const brandSelect = document.getElementById('edit-brand');
            if (brandSelect && product.brand_id) {
                // Wait a bit for brands to load, then set the value
                setTimeout(() => {
                    brandSelect.value = product.brand_id;
                }, 100);
            }

            const categorySelect = document.getElementById('edit-category');
            if (categorySelect && product.category_id) {
                // Wait a bit for categories to load, then set the value
                setTimeout(() => {
                    categorySelect.value = product.category_id;
                }, 150);
            }

            // Load existing images if available
            if (product.images && Array.isArray(product.images) && product.images.length > 0) {
                const form = document.getElementById('edit-product-form');
                if (form && form.selectedImages) {
                    // Clear existing images
                    form.selectedImages.length = 0;
                    // Add existing images
                    product.images.forEach((img, index) => {
                        form.selectedImages.push({
                            url: img.image_url,
                            alt: img.alt_text || '',
                            isPrimary: img.is_primary || index === 0,
                            file: null
                        });
                    });
                    // Update preview using the stored function
                    if (form.updateImagePreview) {
                        form.updateImagePreview();
                    }
                }
            }
        } else {
            window.adminApp.showNotification('Failed to load product data', 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error loading product: ' + error.message, 'error');
    }
}

async function updateProduct(productId, formData, formElement) {
    try {
        const productData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active' || key === 'is_featured') {
                productData[key] = true; // Checkbox was checked
            } else if (key === 'brand_id' || key === 'category_id') {
                // Convert brand_id and category_id to integer if it's a valid number
                productData[key] = value ? parseInt(value) : null;
            } else {
                productData[key] = value;
            }
        }

        // Handle unchecked checkboxes
        if (!formData.has('is_active')) productData.is_active = false;
        if (!formData.has('is_featured')) productData.is_featured = false;

        // Log featured status for debugging
        console.log('📝 Product update data:', {
            productId: productId,
            is_featured: productData.is_featured,
            is_featured_type: typeof productData.is_featured,
            formDataHasFeatured: formData.has('is_featured'),
            checkboxValue: formData.get('is_featured')
        });

        // Get images from form element
        if (formElement && typeof formElement.getImages === 'function') {
            const images = formElement.getImages();
            // All images should now be URLs (files are uploaded before being added)
            productData.images = images.filter(img => {
                // Skip any remaining data URLs (shouldn't happen, but just in case)
                if (img.url && img.url.startsWith('data:image/')) {
                    console.warn('Skipping data URL image. Files should be uploaded first.');
                    return false;
                }
                return true; // Keep URL-based images
            });
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
            if (window.adminApp && typeof window.adminApp.loadProducts === 'function') {
                window.adminApp.loadProducts();
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
    // Create and show add product modal using safe helper
    const modal = createProductModal('Add New Product', 'add-product-form', false);

    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Add Escape key support
    addEscapeKeySupport(modal);

    // Handle form submission
    const form = document.getElementById('add-product-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await createProduct(new FormData(e.target), e.target);
        modal.remove();
    });
}

async function createProduct(formData, formElement) {
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

        // Get images from form element
        if (formElement && typeof formElement.getImages === 'function') {
            const images = formElement.getImages();
            // All images should now be URLs (files are uploaded before being added)
            productData.images = images.filter(img => {
                // Skip any remaining data URLs (shouldn't happen, but just in case)
                if (img.url && img.url.startsWith('data:image/')) {
                    console.warn('Skipping data URL image. Files should be uploaded first.');
                    return false;
                }
                return true; // Keep URL-based images
            });
        } else {
            productData.images = [];
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

// Brand Management Functions
function createBrandModal(title, formId, isEdit = false) {
    const modal = document.createElement('div');
    modal.className = 'modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '850px'; // Wider for brand form
    modalContent.style.maxHeight = '95vh'; // Allow more vertical space

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = function () { this.closest('.modal').remove(); };

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.padding = '2.5rem'; // Increased padding

    const form = document.createElement('form');
    form.id = formId;

    // Basic Information Section
    const basicSection = document.createElement('div');
    basicSection.style.marginBottom = '2.5rem'; // Increased spacing
    basicSection.style.paddingBottom = '2rem'; // Increased spacing
    basicSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitle1 = document.createElement('h3');
    sectionTitle1.textContent = 'Basic Information';
    sectionTitle1.style.fontSize = '1.1rem';
    sectionTitle1.style.fontWeight = '600';
    sectionTitle1.style.color = 'var(--primary-green)';
    sectionTitle1.style.marginBottom = '1.5rem'; // Increased spacing below section title
    basicSection.appendChild(sectionTitle1);

    // Form fields
    const fields = [
        { type: 'input', label: 'Brand Name *', id: `${isEdit ? 'edit' : 'add'}-brand-name`, name: 'name', inputType: 'text', required: true },
        { type: 'textarea', label: 'Description', id: `${isEdit ? 'edit' : 'add'}-brand-description`, name: 'description', rows: 4 }
    ];

    fields.forEach(field => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.style.marginBottom = '1.75rem'; // Increased spacing between fields
        formGroup.style.display = 'flex';
        formGroup.style.flexDirection = 'column';
        formGroup.style.width = '100%';

        const label = document.createElement('label');
        label.setAttribute('for', field.id);
        label.textContent = field.label;
        label.style.display = 'block';
        label.style.marginBottom = '0.75rem';
        label.style.fontWeight = '500';
        label.style.color = 'var(--gray-700)';
        label.style.fontSize = '0.875rem';
        label.style.width = '100%';
        formGroup.appendChild(label);

        if (field.type === 'input') {
            const input = document.createElement('input');
            input.setAttribute('type', field.inputType);
            input.id = field.id;
            input.setAttribute('name', field.name);
            if (field.required) input.setAttribute('required', '');
            if (field.placeholder) input.setAttribute('placeholder', field.placeholder);
            formGroup.appendChild(input);
        } else if (field.type === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.id = field.id;
            textarea.setAttribute('name', field.name);
            if (field.rows) textarea.setAttribute('rows', field.rows.toString());
            formGroup.appendChild(textarea);
        }

        basicSection.appendChild(formGroup);
    });

    // Links Section
    const linksSection = document.createElement('div');
    linksSection.style.marginBottom = '2.5rem'; // Increased spacing
    linksSection.style.paddingBottom = '2rem'; // Increased spacing
    linksSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitle2 = document.createElement('h3');
    sectionTitle2.textContent = 'Links & Media';
    sectionTitle2.style.fontSize = '1.1rem';
    sectionTitle2.style.fontWeight = '600';
    sectionTitle2.style.color = 'var(--primary-green)';
    sectionTitle2.style.marginBottom = '1.5rem'; // Increased spacing below section title
    linksSection.appendChild(sectionTitle2);

    // Logo upload section
    const logoSection = document.createElement('div');
    logoSection.className = 'form-group';
    logoSection.style.marginBottom = '1.75rem';
    logoSection.style.display = 'flex';
    logoSection.style.flexDirection = 'column';
    logoSection.style.width = '100%';

    const logoLabel = document.createElement('label');
    logoLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-brand-logo`);
    logoLabel.textContent = 'Brand Logo';
    logoLabel.style.display = 'block';
    logoLabel.style.marginBottom = '0.75rem';
    logoLabel.style.fontWeight = '500';
    logoLabel.style.color = 'var(--gray-700)';
    logoLabel.style.fontSize = '0.875rem';
    logoLabel.style.width = '100%';
    logoSection.appendChild(logoLabel);

    // File upload input
    const fileInput = document.createElement('input');
    fileInput.setAttribute('type', 'file');
    fileInput.id = `${isEdit ? 'edit' : 'add'}-brand-logo-file`;
    fileInput.setAttribute('name', 'logo_file');
    fileInput.setAttribute('accept', 'image/jpeg,image/jpg,image/png,image/gif,image/webp');
    fileInput.style.width = '100%';
    fileInput.style.padding = '0.75rem';
    fileInput.style.border = '1px solid var(--gray-300)';
    fileInput.style.borderRadius = 'var(--radius-md)';
    fileInput.style.fontSize = '0.875rem';
    logoSection.appendChild(fileInput);

    // URL input (fallback)
    const urlInput = document.createElement('input');
    urlInput.setAttribute('type', 'url');
    urlInput.id = `${isEdit ? 'edit' : 'add'}-brand-logo`;
    urlInput.setAttribute('name', 'logo_url');
    urlInput.setAttribute('placeholder', 'Or enter logo URL (https://example.com/logo.png)');
    urlInput.style.width = '100%';
    urlInput.style.marginTop = '0.5rem';
    urlInput.style.padding = '0.75rem';
    urlInput.style.border = '1px solid var(--gray-300)';
    urlInput.style.borderRadius = 'var(--radius-md)';
    urlInput.style.fontSize = '0.875rem';
    logoSection.appendChild(urlInput);

    // Image preview
    const previewContainer = document.createElement('div');
    previewContainer.id = `${isEdit ? 'edit' : 'add'}-brand-logo-preview`;
    previewContainer.style.marginTop = '1rem';
    previewContainer.style.display = 'none';
    previewContainer.style.textAlign = 'center';
    const previewImg = document.createElement('img');
    previewImg.style.maxWidth = '200px';
    previewImg.style.maxHeight = '200px';
    previewImg.style.border = '1px solid var(--gray-300)';
    previewImg.style.borderRadius = 'var(--radius-md)';
    previewImg.style.padding = '0.5rem';
    previewImg.style.backgroundColor = 'var(--gray-50)';
    previewContainer.appendChild(previewImg);
    logoSection.appendChild(previewContainer);

    // File input change handler
    fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            // Clear URL input when file is selected
            urlInput.value = '';

            // Show preview
            const reader = new FileReader();
            reader.onload = function (e) {
                previewImg.src = e.target.result;
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            previewContainer.style.display = 'none';
        }
    });

    // URL input change handler
    urlInput.addEventListener('input', function (e) {
        if (e.target.value) {
            // Clear file input when URL is entered
            fileInput.value = '';
            previewImg.src = e.target.value;
            previewContainer.style.display = 'block';
        } else {
            previewContainer.style.display = 'none';
        }
    });

    linksSection.appendChild(logoSection);

    const urlFields = [
        { type: 'input', label: 'Website URL', id: `${isEdit ? 'edit' : 'add'}-brand-website`, name: 'website_url', inputType: 'url', placeholder: 'https://example.com' }
    ];

    urlFields.forEach(field => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.style.marginBottom = '1.75rem'; // Increased spacing between fields
        formGroup.style.display = 'flex';
        formGroup.style.flexDirection = 'column';
        formGroup.style.width = '100%';

        const label = document.createElement('label');
        label.setAttribute('for', field.id);
        label.textContent = field.label;
        label.style.display = 'block';
        label.style.marginBottom = '0.75rem';
        label.style.fontWeight = '500';
        label.style.color = 'var(--gray-700)';
        label.style.fontSize = '0.875rem';
        label.style.width = '100%';
        formGroup.appendChild(label);

        const input = document.createElement('input');
        input.setAttribute('type', field.inputType);
        input.id = field.id;
        input.setAttribute('name', field.name);
        if (field.placeholder) input.setAttribute('placeholder', field.placeholder);
        formGroup.appendChild(input);

        linksSection.appendChild(formGroup);
    });

    // Status Section
    const statusSection = document.createElement('div');
    statusSection.style.marginBottom = '2rem';

    const sectionTitle3 = document.createElement('h3');
    sectionTitle3.textContent = 'Status';
    sectionTitle3.style.fontSize = '1.1rem';
    sectionTitle3.style.fontWeight = '600';
    sectionTitle3.style.color = 'var(--primary-green)';
    sectionTitle3.style.marginBottom = '1.5rem'; // Increased spacing below section title
    statusSection.appendChild(sectionTitle3);

    const activeGroup = document.createElement('div');
    activeGroup.className = 'form-group';
    activeGroup.style.marginBottom = '0';
    const activeLabel = document.createElement('label');
    activeLabel.style.display = 'flex';
    activeLabel.style.alignItems = 'center';
    activeLabel.style.cursor = 'pointer';
    activeLabel.style.fontWeight = '500';
    const activeCheckbox = document.createElement('input');
    activeCheckbox.setAttribute('type', 'checkbox');
    activeCheckbox.id = `${isEdit ? 'edit' : 'add'}-brand-is-active`;
    activeCheckbox.setAttribute('name', 'is_active');
    activeCheckbox.checked = true;
    activeCheckbox.style.marginRight = '0.75rem';
    activeCheckbox.style.width = '1.25rem';
    activeCheckbox.style.height = '1.25rem';
    activeLabel.appendChild(activeCheckbox);
    activeLabel.appendChild(document.createTextNode(' Active Brand'));
    activeGroup.appendChild(activeLabel);
    statusSection.appendChild(activeGroup);

    form.appendChild(basicSection);
    form.appendChild(linksSection);
    form.appendChild(statusSection);

    // Form actions
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.style.marginTop = '2.5rem';
    actions.style.paddingTop = '1.5rem';
    actions.style.borderTop = '2px solid var(--gray-200)';

    const cancelBtn = document.createElement('button');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.padding = '0.875rem 1.75rem';
    cancelBtn.style.fontSize = '0.9375rem';
    cancelBtn.onclick = function () { this.closest('.modal').remove(); };

    const submitBtn = document.createElement('button');
    submitBtn.setAttribute('type', 'submit');
    submitBtn.textContent = isEdit ? 'Update Brand' : 'Add Brand';
    submitBtn.className = 'btn btn-primary';
    submitBtn.style.padding = '0.875rem 1.75rem';
    submitBtn.style.fontSize = '0.9375rem';

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    body.appendChild(form);
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modal.appendChild(modalContent);

    return modal;
}

function showAddBrand() {
    const modal = createBrandModal('Add New Brand', 'add-brand-form', false);
    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Add Escape key support
    addEscapeKeySupport(modal);

    document.getElementById('add-brand-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createBrand(new FormData(e.target));
        modal.remove();
    });
}
// Make globally accessible
window.showAddBrand = showAddBrand;

function editBrand(brandId) {
    const modal = createBrandModal('Edit Brand', 'edit-brand-form', true);
    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Add Escape key support
    addEscapeKeySupport(modal);

    loadBrandForEdit(brandId);

    document.getElementById('edit-brand-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateBrand(brandId, new FormData(e.target));
        modal.remove();
    });
}

async function loadBrandForEdit(brandId) {
    try {
        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/brands/${brandId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            const brand = await response.json();

            document.getElementById('edit-brand-name').value = brand.name || '';
            document.getElementById('edit-brand-description').value = brand.description || '';
            document.getElementById('edit-brand-logo').value = brand.logo_url || '';
            document.getElementById('edit-brand-website').value = brand.website_url || '';
            document.getElementById('edit-brand-is-active').checked = brand.is_active !== false;

            // Show preview if logo URL exists
            const previewContainer = document.getElementById('edit-brand-logo-preview');
            const previewImg = previewContainer?.querySelector('img');
            if (brand.logo_url && previewImg) {
                previewImg.src = brand.logo_url;
                previewContainer.style.display = 'block';
            }
        } else {
            window.adminApp.showNotification('Failed to load brand data', 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error loading brand: ' + error.message, 'error');
    }
}

async function createBrand(formData) {
    try {
        const app = window.adminApp;
        let logoUrl = null;

        // Handle file upload if a file is selected
        const logoFile = formData.get('logo_file');
        if (logoFile && logoFile.size > 0) {
            try {
                const uploadFormData = new FormData();
                uploadFormData.append('logo', logoFile);

                const uploadResponse = await fetch(`${app.apiBaseUrl}/admin/brands/upload-logo`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                    },
                    body: uploadFormData
                });

                if (uploadResponse.ok) {
                    const uploadResult = await uploadResponse.json();
                    logoUrl = uploadResult.url;
                } else {
                    const error = await uploadResponse.json();
                    throw new Error(error.error || 'Failed to upload logo');
                }
            } catch (uploadError) {
                window.adminApp.showNotification('Failed to upload logo: ' + uploadError.message, 'error');
                return;
            }
        } else {
            // Use URL if provided
            logoUrl = formData.get('logo_url') || null;
        }

        const brandData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active') {
                brandData[key] = true;
            } else if (key !== 'logo_file' && key !== 'logo_url') {
                brandData[key] = value || null;
            }
        }

        // Set logo URL
        brandData.logo_url = logoUrl;

        if (!formData.has('is_active')) brandData.is_active = false;

        const response = await fetch(`${app.apiBaseUrl}/admin/brands`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify(brandData)
        });

        if (response.ok) {
            window.adminApp.showNotification('Brand created successfully!', 'success');
            // Refresh the brands list and dropdown
            if (window.adminApp && typeof window.adminApp.loadBrands === 'function') {
                await window.adminApp.loadBrands();
            }
            // Refresh brand dropdown in edit modal if it exists
            refreshBrandDropdown();
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to create brand: ' + error.error, 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error creating brand: ' + error.message, 'error');
    }
}

async function updateBrand(brandId, formData) {
    try {
        const app = window.adminApp;
        let logoUrl = null;

        // Handle file upload if a file is selected
        const logoFile = formData.get('logo_file');
        if (logoFile && logoFile.size > 0) {
            try {
                const uploadFormData = new FormData();
                uploadFormData.append('logo', logoFile);

                const uploadResponse = await fetch(`${app.apiBaseUrl}/admin/brands/upload-logo`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                    },
                    body: uploadFormData
                });

                if (uploadResponse.ok) {
                    const uploadResult = await uploadResponse.json();
                    logoUrl = uploadResult.url;
                } else {
                    const error = await uploadResponse.json();
                    throw new Error(error.error || 'Failed to upload logo');
                }
            } catch (uploadError) {
                window.adminApp.showNotification('Failed to upload logo: ' + uploadError.message, 'error');
                return;
            }
        } else {
            // Use URL if provided, otherwise keep existing
            logoUrl = formData.get('logo_url') || null;
        }

        const brandData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active') {
                brandData[key] = true;
            } else if (key !== 'logo_file' && key !== 'logo_url') {
                brandData[key] = value || null;
            }
        }

        // Set logo URL (only update if a new value is provided)
        if (logoUrl !== null) {
            brandData.logo_url = logoUrl;
        }

        if (!formData.has('is_active')) brandData.is_active = false;

        const response = await fetch(`${app.apiBaseUrl}/admin/brands/${brandId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify(brandData)
        });

        if (response.ok) {
            window.adminApp.showNotification('Brand updated successfully!', 'success');
            // Refresh the brands list and dropdown
            if (window.adminApp && typeof window.adminApp.loadBrands === 'function') {
                await window.adminApp.loadBrands();
            }
            // Refresh brand dropdown in edit modal if it exists
            refreshBrandDropdown();
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to update brand: ' + error.error, 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error updating brand: ' + error.message, 'error');
    }
}

async function deleteBrand(brandId, brandName) {
    if (!confirm(`Are you sure you want to delete the brand "${brandName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/brands/${brandId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            window.adminApp.showNotification('Brand deleted successfully!', 'success');
            // Refresh the brands list and dropdown
            if (window.adminApp && typeof window.adminApp.loadBrands === 'function') {
                await window.adminApp.loadBrands();
            }
            // Refresh brand dropdown in edit modal if it exists
            refreshBrandDropdown();
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to delete brand: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error deleting brand: ' + error.message, 'error');
    }
}

// Category Management Functions
function createCategoryModal(title, formId, isEdit = false) {
    const modal = document.createElement('div');
    modal.className = 'modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '850px'; // Wider for brand form
    modalContent.style.maxHeight = '95vh'; // Allow more vertical space

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = function () { this.closest('.modal').remove(); };

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.padding = '2.5rem'; // Increased padding

    const form = document.createElement('form');
    form.id = formId;

    // Basic Information Section
    const basicSection = document.createElement('div');
    basicSection.style.marginBottom = '2.5rem'; // Increased spacing
    basicSection.style.paddingBottom = '2rem'; // Increased spacing
    basicSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitle1 = document.createElement('h3');
    sectionTitle1.textContent = 'Basic Information';
    sectionTitle1.style.fontSize = '1.1rem';
    sectionTitle1.style.fontWeight = '600';
    sectionTitle1.style.color = 'var(--primary-green)';
    sectionTitle1.style.marginBottom = '1.5rem'; // Increased spacing below section title
    basicSection.appendChild(sectionTitle1);

    const basicFields = [
        { type: 'input', label: 'Category Name *', id: `${isEdit ? 'edit' : 'add'}-category-name`, name: 'name', inputType: 'text', required: true },
        { type: 'textarea', label: 'Description', id: `${isEdit ? 'edit' : 'add'}-category-description`, name: 'description', rows: 4 }
    ];

    basicFields.forEach(field => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.style.marginBottom = '1.75rem'; // Increased spacing between fields
        formGroup.style.display = 'flex';
        formGroup.style.flexDirection = 'column';
        formGroup.style.width = '100%';

        const label = document.createElement('label');
        label.setAttribute('for', field.id);
        label.textContent = field.label;
        label.style.display = 'block';
        label.style.marginBottom = '0.75rem';
        label.style.fontWeight = '500';
        label.style.color = 'var(--gray-700)';
        label.style.fontSize = '0.875rem';
        label.style.width = '100%';
        formGroup.appendChild(label);

        if (field.type === 'input') {
            const input = document.createElement('input');
            input.setAttribute('type', field.inputType);
            input.id = field.id;
            input.setAttribute('name', field.name);
            if (field.required) input.setAttribute('required', '');
            if (field.placeholder) input.setAttribute('placeholder', field.placeholder);
            if (field.value) input.setAttribute('value', field.value);
            formGroup.appendChild(input);
        } else if (field.type === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.id = field.id;
            textarea.setAttribute('name', field.name);
            if (field.rows) textarea.setAttribute('rows', field.rows.toString());
            formGroup.appendChild(textarea);
        }

        basicSection.appendChild(formGroup);
    });

    // Organization Section
    const orgSection = document.createElement('div');
    orgSection.style.marginBottom = '2.5rem'; // Increased spacing
    orgSection.style.paddingBottom = '2rem'; // Increased spacing
    orgSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitle2 = document.createElement('h3');
    sectionTitle2.textContent = 'Organization';
    sectionTitle2.style.fontSize = '1.1rem';
    sectionTitle2.style.fontWeight = '600';
    sectionTitle2.style.color = 'var(--primary-green)';
    sectionTitle2.style.marginBottom = '1.5rem'; // Increased spacing below section title
    orgSection.appendChild(sectionTitle2);

    const orgRow = document.createElement('div');
    orgRow.className = 'form-row';
    orgRow.style.gap = '1.5rem'; // Increased gap between columns

    const parentGroup = document.createElement('div');
    parentGroup.className = 'form-group';
    parentGroup.style.marginBottom = '0';
    parentGroup.style.display = 'flex';
    parentGroup.style.flexDirection = 'column';
    parentGroup.style.width = '100%';
    const parentLabel = document.createElement('label');
    parentLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-category-parent`);
    parentLabel.textContent = 'Parent Category';
    parentLabel.style.display = 'block';
    parentLabel.style.marginBottom = '0.75rem';
    parentLabel.style.fontWeight = '500';
    parentLabel.style.color = 'var(--gray-700)';
    parentLabel.style.fontSize = '0.875rem';
    parentGroup.appendChild(parentLabel);
    const parentSelect = document.createElement('select');
    parentSelect.id = `${isEdit ? 'edit' : 'add'}-category-parent`;
    parentSelect.setAttribute('name', 'parent_id');
    parentSelect.style.width = '100%';
    const noneOption = document.createElement('option');
    noneOption.setAttribute('value', '');
    noneOption.textContent = 'None (Top Level)';
    parentSelect.appendChild(noneOption);
    parentGroup.appendChild(parentSelect);
    orgRow.appendChild(parentGroup);

    const sortGroup = document.createElement('div');
    sortGroup.className = 'form-group';
    sortGroup.style.marginBottom = '0';
    sortGroup.style.display = 'flex';
    sortGroup.style.flexDirection = 'column';
    sortGroup.style.width = '100%';
    const sortLabel = document.createElement('label');
    sortLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-category-sort`);
    sortLabel.textContent = 'Sort Order';
    sortLabel.style.display = 'block';
    sortLabel.style.marginBottom = '0.75rem';
    sortLabel.style.fontWeight = '500';
    sortLabel.style.color = 'var(--gray-700)';
    sortLabel.style.fontSize = '0.875rem';
    sortGroup.appendChild(sortLabel);
    const sortInput = document.createElement('input');
    sortInput.setAttribute('type', 'number');
    sortInput.id = `${isEdit ? 'edit' : 'add'}-category-sort`;
    sortInput.setAttribute('name', 'sort_order');
    sortInput.setAttribute('value', '0');
    sortInput.style.width = '100%';
    sortGroup.appendChild(sortInput);
    orgRow.appendChild(sortGroup);

    orgSection.appendChild(orgRow);
    form.appendChild(basicSection);
    form.appendChild(orgSection);

    // Media Section
    const mediaSection = document.createElement('div');
    mediaSection.style.marginBottom = '2.5rem'; // Increased spacing
    mediaSection.style.paddingBottom = '2rem'; // Increased spacing
    mediaSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitle3 = document.createElement('h3');
    sectionTitle3.textContent = 'Media';
    sectionTitle3.style.fontSize = '1.1rem';
    sectionTitle3.style.fontWeight = '600';
    sectionTitle3.style.color = 'var(--primary-green)';
    sectionTitle3.style.marginBottom = '1.5rem'; // Increased spacing below section title
    mediaSection.appendChild(sectionTitle3);

    const imageGroup = document.createElement('div');
    imageGroup.className = 'form-group';
    imageGroup.style.marginBottom = '0';
    imageGroup.style.display = 'flex';
    imageGroup.style.flexDirection = 'column';
    imageGroup.style.width = '100%';
    const imageLabel = document.createElement('label');
    imageLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-category-image`);
    imageLabel.textContent = 'Image URL';
    imageLabel.style.display = 'block';
    imageLabel.style.marginBottom = '0.75rem';
    imageLabel.style.fontWeight = '500';
    imageLabel.style.color = 'var(--gray-700)';
    imageLabel.style.fontSize = '0.875rem';
    imageLabel.style.width = '100%';
    imageGroup.appendChild(imageLabel);
    const imageInput = document.createElement('input');
    imageInput.setAttribute('type', 'url');
    imageInput.id = `${isEdit ? 'edit' : 'add'}-category-image`;
    imageInput.setAttribute('name', 'image_url');
    imageInput.setAttribute('placeholder', 'https://example.com/image.png');
    imageInput.style.width = '100%';
    imageGroup.appendChild(imageInput);
    mediaSection.appendChild(imageGroup);
    form.appendChild(mediaSection);

    // Status Section
    const statusSection = document.createElement('div');
    statusSection.style.marginBottom = '2rem';

    const sectionTitle4 = document.createElement('h3');
    sectionTitle4.textContent = 'Status';
    sectionTitle4.style.fontSize = '1.1rem';
    sectionTitle4.style.fontWeight = '600';
    sectionTitle4.style.color = 'var(--primary-green)';
    sectionTitle4.style.marginBottom = '1.5rem'; // Increased spacing below section title
    statusSection.appendChild(sectionTitle4);

    const activeGroup = document.createElement('div');
    activeGroup.className = 'form-group';
    activeGroup.style.marginBottom = '0';
    const activeLabel = document.createElement('label');
    activeLabel.style.display = 'flex';
    activeLabel.style.alignItems = 'center';
    activeLabel.style.cursor = 'pointer';
    activeLabel.style.fontWeight = '500';
    const activeCheckbox = document.createElement('input');
    activeCheckbox.setAttribute('type', 'checkbox');
    activeCheckbox.id = `${isEdit ? 'edit' : 'add'}-category-is-active`;
    activeCheckbox.setAttribute('name', 'is_active');
    activeCheckbox.checked = true;
    activeCheckbox.style.marginRight = '0.75rem';
    activeCheckbox.style.width = '1.25rem';
    activeCheckbox.style.height = '1.25rem';
    activeLabel.appendChild(activeCheckbox);
    activeLabel.appendChild(document.createTextNode(' Active Category'));
    activeGroup.appendChild(activeLabel);
    statusSection.appendChild(activeGroup);
    form.appendChild(statusSection);

    // Form actions
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.style.marginTop = '2.5rem';
    actions.style.paddingTop = '1.5rem';
    actions.style.borderTop = '2px solid var(--gray-200)';

    const cancelBtn = document.createElement('button');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.padding = '0.875rem 1.75rem';
    cancelBtn.style.fontSize = '0.9375rem';
    cancelBtn.onclick = function () { this.closest('.modal').remove(); };

    const submitBtn = document.createElement('button');
    submitBtn.setAttribute('type', 'submit');
    submitBtn.textContent = isEdit ? 'Update Category' : 'Add Category';
    submitBtn.className = 'btn btn-primary';
    submitBtn.style.padding = '0.875rem 1.75rem';
    submitBtn.style.fontSize = '0.9375rem';

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    body.appendChild(form);
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modal.appendChild(modalContent);

    return modal;
}

function showAddCategory() {
    const modal = createCategoryModal('Add New Category', 'add-category-form', false);
    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Add Escape key support
    addEscapeKeySupport(modal);

    // Load categories for parent dropdown
    loadCategoriesForParentDropdown('add-category-parent');

    document.getElementById('add-category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createCategory(new FormData(e.target));
        modal.remove();
    });
}
// Make globally accessible
window.showAddCategory = showAddCategory;

function editCategory(categoryId) {
    const modal = createCategoryModal('Edit Category', 'edit-category-form', true);
    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Add Escape key support
    addEscapeKeySupport(modal);

    // Load categories for parent dropdown (excluding current category)
    loadCategoriesForParentDropdown('edit-category-parent', categoryId);

    loadCategoryForEdit(categoryId);

    document.getElementById('edit-category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateCategory(categoryId, new FormData(e.target));
        modal.remove();
    });
}

async function loadCategoriesForParentDropdown(selectId, excludeId = null) {
    try {
        const app = window.adminApp;
        const select = document.getElementById(selectId);
        if (!select) return;

        const response = await fetch(`${app.apiBaseUrl}/admin/categories`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            const categories = await response.json();
            const currentValue = select.value;

            // Clear existing options except the first "None" option
            select.innerHTML = '<option value="">None (Top Level)</option>';

            // Add categories to dropdown (excluding the current category if editing)
            categories.forEach(category => {
                if (excludeId && category.id === excludeId) return; // Don't allow self as parent
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                select.appendChild(option);
            });

            if (currentValue) {
                select.value = currentValue;
            }
        }
    } catch (error) {
        console.error('Error loading categories for parent dropdown:', error);
    }
}

async function loadCategoryForEdit(categoryId) {
    try {
        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/categories/${categoryId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            const category = await response.json();

            document.getElementById('edit-category-name').value = category.name || '';
            document.getElementById('edit-category-description').value = category.description || '';
            document.getElementById('edit-category-image').value = category.image_url || '';
            document.getElementById('edit-category-parent').value = category.parent_id || '';
            document.getElementById('edit-category-sort').value = category.sort_order || 0;
            document.getElementById('edit-category-is-active').checked = category.is_active !== false;
        } else {
            window.adminApp.showNotification('Failed to load category data', 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error loading category: ' + error.message, 'error');
    }
}

async function createCategory(formData) {
    try {
        const categoryData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active') {
                categoryData[key] = true;
            } else if (key === 'parent_id' && !value) {
                categoryData[key] = null;
            } else if (key === 'sort_order') {
                categoryData[key] = parseInt(value) || 0;
            } else {
                categoryData[key] = value || null;
            }
        }

        if (!formData.has('is_active')) categoryData.is_active = false;

        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/categories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify(categoryData)
        });

        if (response.ok) {
            window.adminApp.showNotification('Category created successfully!', 'success');
            // Refresh the categories list and dropdown
            if (window.adminApp && typeof window.adminApp.loadCategories === 'function') {
                await window.adminApp.loadCategories();
            }
            // Refresh category dropdown in edit modal if it exists
            refreshCategoryDropdown();
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to create category: ' + error.error, 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error creating category: ' + error.message, 'error');
    }
}

async function updateCategory(categoryId, formData) {
    try {
        const categoryData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active') {
                categoryData[key] = true;
            } else if (key === 'parent_id' && !value) {
                categoryData[key] = null;
            } else if (key === 'sort_order') {
                categoryData[key] = parseInt(value) || 0;
            } else {
                categoryData[key] = value || null;
            }
        }

        if (!formData.has('is_active')) categoryData.is_active = false;

        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify(categoryData)
        });

        if (response.ok) {
            window.adminApp.showNotification('Category updated successfully!', 'success');
            // Refresh the categories list and dropdown
            if (window.adminApp && typeof window.adminApp.loadCategories === 'function') {
                await window.adminApp.loadCategories();
            }
            // Refresh category dropdown in edit modal if it exists
            refreshCategoryDropdown();
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to update category: ' + error.error, 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error updating category: ' + error.message, 'error');
    }
}

async function deleteCategory(categoryId, categoryName) {
    if (!confirm(`Are you sure you want to delete the category "${categoryName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/categories/${categoryId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            window.adminApp.showNotification('Category deleted successfully!', 'success');
            // Refresh the categories list and dropdown
            if (window.adminApp && typeof window.adminApp.loadCategories === 'function') {
                await window.adminApp.loadCategories();
            }
            // Refresh category dropdown in edit modal if it exists
            refreshCategoryDropdown();
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to delete category: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error deleting category: ' + error.message, 'error');
    }
}

async function deleteProduct(productId, productName) {
    if (!confirm(`Are you sure you want to delete the product "${productName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const app = window.adminApp;
        const response = await fetch(`${app.apiBaseUrl}/admin/products/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            window.adminApp.showNotification('Product deleted successfully!', 'success');
            // Refresh the products list
            if (window.adminApp && typeof window.adminApp.loadProducts === 'function') {
                await window.adminApp.loadProducts();
            }
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to delete product: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error deleting product: ' + error.message, 'error');
    }
}


// Make functions globally accessible
window.showAddBrand = showAddBrand;
window.editBrand = editBrand;
window.deleteBrand = deleteBrand;
window.showAddCategory = showAddCategory;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.deleteProduct = deleteProduct;
window.editProduct = editProduct;
window.showAddProduct = showAddProduct;
window.scrapeProducts = scrapeProducts;
window.matchProductsToBrands = matchProductsToBrands;

async function matchProductsToCategories() {
    const app = window.adminApp;
    const btn = document.getElementById('matchCategoriesBtn');

    if (!app || !app.authToken) {
        app.showNotification('Please log in to match products to categories', 'error');
        return;
    }

    // Confirm action
    if (!confirm('This will match products to categories based on product names and descriptions. This may update many products. Continue?')) {
        return;
    }

    try {
        // Disable button and show loading
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Matching...';
        }

        app.showNotification('Matching products to categories...', 'info');

        const response = await app.apiRequest('/admin/products/match-categories', {
            method: 'POST'
        });

        if (response && response.success) {
            const results = response.results;
            let message = `Matching complete! `;
            message += `Matched: ${results.matched}, Updated: ${results.updated}`;
            if (results.notMatched > 0) {
                message += `, Not matched: ${results.notMatched}`;
            }

            app.showNotification(message, 'success');

            // Log category assignments to console
            if (results.categoryAssignments && Object.keys(results.categoryAssignments).length > 0) {
                console.log('📋 Category Assignments:');
                Object.entries(results.categoryAssignments).forEach(([category, count]) => {
                    console.log(`   ${category}: ${count} products`);
                });
            }

            // Reload products to show updated category associations
            setTimeout(() => {
                app.loadProducts();
            }, 1000);

            // Show details if there are unmatched products
            if (results.notMatchedProducts && results.notMatchedProducts.length > 0) {
                console.log('Products that could not be matched:', results.notMatchedProducts);
            }
        } else {
            app.showNotification(response?.error || 'Failed to match products to categories', 'error');
        }
    } catch (error) {
        console.error('Match products to categories error:', error);
        app.showNotification('Error matching products to categories: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-tags"></i> Match Products to Categories';
        }
    }
}

window.matchProductsToCategories = matchProductsToCategories;
window.importProducts = importProducts;
window.logout = logout;
window.viewOrder = viewOrder;
window.editEDSABooking = editEDSABooking;

// Initialize the admin app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();

    // Sidebar toggle functionality (desktop and mobile)
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const mobileToggle = document.getElementById('mobileSidebarToggle');
    const sidebar = document.getElementById('adminSidebar');
    const mainContent = document.querySelector('.main-content');

    if (sidebar && mainContent) {
        // Desktop sidebar toggle
        if (sidebarToggleBtn) {
            sidebarToggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('sidebar-collapsed');
                const isCollapsed = sidebar.classList.contains('collapsed');
                const icon = document.getElementById('sidebarToggleIcon');
                if (icon) {
                    icon.className = isCollapsed ? 'fas fa-bars' : 'fas fa-times';
                }
                // Store preference
                localStorage.setItem('adminSidebarCollapsed', isCollapsed);
            });

            // Restore sidebar state
            const wasCollapsed = localStorage.getItem('adminSidebarCollapsed') === 'true';
            if (wasCollapsed) {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('sidebar-collapsed');
                const icon = document.getElementById('sidebarToggleIcon');
                if (icon) {
                    icon.className = 'fas fa-bars';
                }
            }
        }

        // Mobile sidebar toggle functionality
        if (mobileToggle) {
            // Show/hide toggle based on screen size
            function updateMobileToggle() {
                if (window.innerWidth <= 768) {
                    mobileToggle.style.display = 'block';
                    if (sidebarToggleBtn) sidebarToggleBtn.style.display = 'none';
                } else {
                    mobileToggle.style.display = 'none';
                    sidebar.classList.remove('show');
                    if (sidebarToggleBtn) sidebarToggleBtn.style.display = 'block';
                }
            }

            // Initial check
            updateMobileToggle();

            // Update on resize
            window.addEventListener('resize', updateMobileToggle);

            // Toggle sidebar
            mobileToggle.addEventListener('click', () => {
                sidebar.classList.toggle('show');
                const isOpen = sidebar.classList.contains('show');
                mobileToggle.setAttribute('aria-expanded', isOpen);
            });

            // Close sidebar when clicking outside
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 768 && sidebar.classList.contains('show')) {
                    if (!sidebar.contains(e.target) && !mobileToggle.contains(e.target)) {
                        sidebar.classList.remove('show');
                        mobileToggle.setAttribute('aria-expanded', 'false');
                    }
                }
            });

            // Close sidebar when clicking a nav link on mobile
            const navLinks = sidebar.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        sidebar.classList.remove('show');
                        mobileToggle.setAttribute('aria-expanded', 'false');
                    }
                });
            });
        }
    }
});

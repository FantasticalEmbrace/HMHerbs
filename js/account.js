/**
 * Account Page Manager
 * Handles user profile, orders, and addresses management
 */

class AccountManager {
    constructor() {
        this.apiBaseUrl = '/api';
        this.init();
    }

    init() {
        // Check authentication
        if (!window.customerAuth || !window.customerAuth.isAuthenticated()) {
            window.location.href = 'index.html';
            return;
        }

        this.setupEventListeners();
        this.loadUserProfile();
        this.handleHashNavigation();
    }

    setupEventListeners() {
        // Navigation links
        const navLinks = document.querySelectorAll('.account-nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                this.showSection(section);
            });
        });

        // Profile form
        const profileForm = document.getElementById('profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', (e) => this.handleProfileUpdate(e));
        }

        // Change password button
        const changePasswordBtn = document.getElementById('change-password-btn');
        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', () => this.showChangePasswordModal());
        }

        // Add address button
        const addAddressBtn = document.getElementById('add-address-btn');
        if (addAddressBtn) {
            addAddressBtn.addEventListener('click', () => this.showAddAddressModal());
        }
    }

    handleHashNavigation() {
        const hash = window.location.hash.replace('#', '');
        if (hash && ['profile', 'orders', 'addresses'].includes(hash)) {
            this.showSection(hash);
        }
    }

    showSection(sectionId) {
        // Hide all sections
        document.querySelectorAll('.account-section').forEach(section => {
            section.classList.remove('active');
        });

        // Show selected section
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.add('active');
        }

        // Update nav links
        document.querySelectorAll('.account-nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-section') === sectionId) {
                link.classList.add('active');
            }
        });

        // Update URL
        window.history.replaceState(null, '', `#${sectionId}`);

        // Load section data
        if (sectionId === 'orders') {
            this.loadOrders();
        } else if (sectionId === 'addresses') {
            this.loadAddresses();
        }
    }

    async loadUserProfile() {
        try {
            const user = window.customerAuth.getCurrentUser();
            if (user) {
                // Update welcome message
                const welcomeMsg = document.getElementById('account-welcome-message');
                if (welcomeMsg) {
                    welcomeMsg.textContent = `Welcome back, ${user.firstName}!`;
                }

                // Populate profile form
                document.getElementById('profile-first-name').value = user.firstName || '';
                document.getElementById('profile-last-name').value = user.lastName || '';
                document.getElementById('profile-email').value = user.email || '';
                document.getElementById('profile-phone').value = user.phone || '';
            }

            // Load full profile from API
            const response = await this.apiRequest('/user/profile');
            if (response.user) {
                const profileForm = document.getElementById('profile-form');
                if (profileForm) {
                    document.getElementById('profile-first-name').value = response.user.first_name || '';
                    document.getElementById('profile-last-name').value = response.user.last_name || '';
                    document.getElementById('profile-email').value = response.user.email || '';
                    document.getElementById('profile-phone').value = response.user.phone || '';
                }
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }
    }

    async handleProfileUpdate(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        try {
            const formData = {
                firstName: document.getElementById('profile-first-name').value.trim(),
                lastName: document.getElementById('profile-last-name').value.trim(),
                email: document.getElementById('profile-email').value.trim(),
                phone: document.getElementById('profile-phone').value.trim() || undefined,
            };

            await this.apiRequest('/user/profile', {
                method: 'PUT',
                body: formData,
            });

            this.showNotification('Profile updated successfully!', 'success');
            window.customerAuth.user = { ...window.customerAuth.user, ...formData };
            window.customerAuth.setStoredUser(window.customerAuth.user);
            window.customerAuth.updateUI();
        } catch (error) {
            this.showNotification(error.message || 'Failed to update profile', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    async loadOrders() {
        const container = document.getElementById('orders-container');
        if (!container) return;

        container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading orders...</p></div>';

        try {
            const response = await this.apiRequest('/user/orders');
            if (response.orders && response.orders.length > 0) {
                container.innerHTML = response.orders.map(order => this.renderOrder(order)).join('');
            } else {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-bag"></i><p>No orders yet</p></div>';
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading orders</p></div>';
        }
    }

    renderOrder(order) {
        const statusClass = order.status || 'pending';
        const date = new Date(order.created_at).toLocaleDateString();
        return `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <div class="order-number">Order #${order.id}</div>
                        <div class="order-date">${date}</div>
                    </div>
                    <span class="order-status ${statusClass}">${statusClass}</span>
                </div>
                <div class="order-details">
                    <p><strong>Total:</strong> $${parseFloat(order.total || 0).toFixed(2)}</p>
                    <p><strong>Items:</strong> ${order.item_count || 0}</p>
                </div>
            </div>
        `;
    }

    async loadAddresses() {
        const container = document.getElementById('addresses-container');
        if (!container) return;

        container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading addresses...</p></div>';

        try {
            const response = await this.apiRequest('/user/addresses');
            if (response.addresses && response.addresses.length > 0) {
                container.innerHTML = response.addresses.map(address => this.renderAddress(address)).join('');
            } else {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>No saved addresses</p></div>';
            }
        } catch (error) {
            console.error('Error loading addresses:', error);
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading addresses</p></div>';
        }
    }

    renderAddress(address) {
        const defaultClass = address.is_default ? 'default' : '';
        return `
            <div class="address-card ${defaultClass}">
                <h4>${address.type === 'shipping' ? 'Shipping' : 'Billing'} Address</h4>
                ${address.is_default ? '<span class="order-status completed">Default</span>' : ''}
                <p>${address.first_name} ${address.last_name}</p>
                <p>${address.address_line_1}</p>
                ${address.address_line_2 ? `<p>${address.address_line_2}</p>` : ''}
                <p>${address.city}, ${address.state} ${address.postal_code}</p>
                <p>${address.country}</p>
                <div class="address-actions">
                    <button class="btn btn-secondary btn-sm" onclick="accountManager.editAddress(${address.id})">Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="accountManager.deleteAddress(${address.id})">Delete</button>
                </div>
            </div>
        `;
    }

    showChangePasswordModal() {
        // TODO: Implement change password modal
        alert('Change password feature coming soon!');
    }

    showAddAddressModal() {
        // TODO: Implement add address modal
        alert('Add address feature coming soon!');
    }

    async apiRequest(endpoint, options = {}) {
        const token = window.customerAuth.getToken();
        const url = `${this.apiBaseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        };

        const config = { ...defaultOptions, ...options };
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    showNotification(message, type = 'info') {
        if (window.customerAuth && typeof window.customerAuth.showNotification === 'function') {
            window.customerAuth.showNotification(message, type);
        } else {
            alert(message);
        }
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.accountManager = new AccountManager();
    });
} else {
    window.accountManager = new AccountManager();
}


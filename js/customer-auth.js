/**
 * Customer Authentication Manager
 * Handles user registration, login, logout, and profile management
 */

class CustomerAuth {
    constructor() {
        this.apiBaseUrl = '/api/auth';
        this.tokenKey = 'hmherbs_customer_token';
        this.userKey = 'hmherbs_customer_user';
        this.token = this.getStoredToken();
        this.user = this.getStoredUser();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
    }

    // Token Management
    getStoredToken() {
        try {
            return localStorage.getItem(this.tokenKey);
        } catch (error) {
            console.error('Error getting stored token:', error);
            return null;
        }
    }

    getStoredUser() {
        try {
            const userStr = localStorage.getItem(this.userKey);
            return userStr ? JSON.parse(userStr) : null;
        } catch (error) {
            console.error('Error getting stored user:', error);
            return null;
        }
    }

    setStoredToken(token) {
        try {
            if (token) {
                localStorage.setItem(this.tokenKey, token);
            } else {
                localStorage.removeItem(this.tokenKey);
            }
        } catch (error) {
            console.error('Error setting stored token:', error);
        }
    }

    setStoredUser(user) {
        try {
            if (user) {
                localStorage.setItem(this.userKey, JSON.stringify(user));
            } else {
                localStorage.removeItem(this.userKey);
            }
        } catch (error) {
            console.error('Error setting stored user:', error);
        }
    }

    // API Request Helper
    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (this.token) {
            defaultOptions.headers['Authorization'] = `Bearer ${this.token}`;
        }

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

    // Registration
    async register(userData) {
        try {
            const response = await this.apiRequest('/register', {
                method: 'POST',
                body: userData,
            });

            if (response.token && response.user) {
                this.token = response.token;
                this.user = response.user;
                this.setStoredToken(this.token);
                this.setStoredUser(this.user);
                this.updateUI();
                return { success: true, user: response.user };
            }

            throw new Error('Registration failed');
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    // Login
    async login(email, password) {
        try {
            const response = await this.apiRequest('/login', {
                method: 'POST',
                body: { email, password },
            });

            if (response.token && response.user) {
                this.token = response.token;
                this.user = response.user;
                this.setStoredToken(this.token);
                this.setStoredUser(this.user);
                this.updateUI();
                return { success: true, user: response.user };
            }

            throw new Error('Login failed');
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    // Logout
    logout() {
        this.token = null;
        this.user = null;
        this.setStoredToken(null);
        this.setStoredUser(null);
        this.updateUI();
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    // Get current user
    getCurrentUser() {
        return this.user;
    }

    // Get auth token
    getToken() {
        return this.token;
    }

    // Check auth status and update UI
    checkAuthStatus() {
        if (this.isAuthenticated()) {
            this.updateUI();
        }
    }

    // Update UI based on auth status
    updateUI() {
        const loginBtn = document.getElementById('customer-login-btn');
        const registerBtn = document.getElementById('customer-register-btn');
        const accountBtn = document.getElementById('customer-account-btn');
        const accountDropdown = document.getElementById('customer-account-dropdown');
        const userNameDisplay = document.getElementById('customer-name-display');

        if (this.isAuthenticated()) {
            // Hide login/register buttons
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';

            // Show account button
            if (accountBtn) accountBtn.style.display = 'flex';
            if (accountDropdown) accountDropdown.style.display = 'block';
            if (userNameDisplay) {
                userNameDisplay.textContent = `${this.user.firstName} ${this.user.lastName}`;
            }
        } else {
            // Show login/register buttons
            if (loginBtn) loginBtn.style.display = 'flex';
            if (registerBtn) registerBtn.style.display = 'flex';

            // Hide account button
            if (accountBtn) accountBtn.style.display = 'none';
            if (accountDropdown) accountDropdown.style.display = 'none';
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Login form submission
        const loginForm = document.getElementById('customer-login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Register form submission
        const registerForm = document.getElementById('customer-register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Logout button
        const logoutBtn = document.getElementById('customer-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Account menu toggle
        const accountMenuToggle = document.getElementById('account-menu-toggle');
        const accountDropdown = document.getElementById('customer-account-dropdown');
        if (accountMenuToggle && accountDropdown) {
            accountMenuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = accountMenuToggle.getAttribute('aria-expanded') === 'true';
                accountMenuToggle.setAttribute('aria-expanded', !isExpanded);
                accountDropdown.style.display = isExpanded ? 'none' : 'block';
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!accountMenuToggle.contains(e.target) && !accountDropdown.contains(e.target)) {
                    accountMenuToggle.setAttribute('aria-expanded', 'false');
                    accountDropdown.style.display = 'none';
                }
            });
        }

        // Login/Register button clicks
        const loginBtn = document.getElementById('customer-login-btn');
        const registerBtn = document.getElementById('customer-register-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.openLoginModal());
        }
        if (registerBtn) {
            registerBtn.addEventListener('click', () => this.openRegisterModal());
        }

        // Modal close buttons
        const loginModal = document.getElementById('customer-login-modal');
        const registerModal = document.getElementById('customer-register-modal');

        if (loginModal) {
            const closeBtn = loginModal.querySelector('.auth-modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeLoginModal());
            }
            loginModal.addEventListener('click', (e) => {
                if (e.target === loginModal) this.closeLoginModal();
            });
        }

        if (registerModal) {
            const closeBtn = registerModal.querySelector('.auth-modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeRegisterModal());
            }
            registerModal.addEventListener('click', (e) => {
                if (e.target === registerModal) this.closeRegisterModal();
            });
        }

        // Switch between login and register
        const showRegisterLink = document.getElementById('show-register-link');
        const showLoginLink = document.getElementById('show-login-link');

        if (showRegisterLink) {
            showRegisterLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeLoginModal();
                this.openRegisterModal();
            });
        }

        if (showLoginLink) {
            showLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeRegisterModal();
                this.openLoginModal();
            });
        }
    }

    // Handle login form submission
    async handleLogin(e) {
        e.preventDefault();
        const form = e.target;
        const email = form.querySelector('#login-email').value.trim();
        const password = form.querySelector('#login-password').value;
        const errorDiv = form.querySelector('.auth-error');
        const submitBtn = form.querySelector('button[type="submit"]');

        // Clear previous errors
        if (errorDiv) errorDiv.textContent = '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in...';
        }

        try {
            await this.login(email, password);
            this.closeLoginModal();
            this.showNotification('Login successful!', 'success');
            form.reset();
        } catch (error) {
            if (errorDiv) {
                errorDiv.textContent = error.message || 'Login failed. Please try again.';
                errorDiv.style.display = 'block';
            }
            this.showNotification(error.message || 'Login failed', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign In';
            }
        }
    }

    // Handle register form submission
    async handleRegister(e) {
        e.preventDefault();
        const form = e.target;
        const firstName = form.querySelector('#register-first-name').value.trim();
        const lastName = form.querySelector('#register-last-name').value.trim();
        const email = form.querySelector('#register-email').value.trim();
        const password = form.querySelector('#register-password').value;
        const confirmPassword = form.querySelector('#register-confirm-password').value;
        const phone = form.querySelector('#register-phone')?.value.trim() || '';
        const errorDiv = form.querySelector('.auth-error');
        const submitBtn = form.querySelector('button[type="submit"]');

        // Clear previous errors
        if (errorDiv) errorDiv.textContent = '';

        // Validate passwords match
        if (password !== confirmPassword) {
            if (errorDiv) {
                errorDiv.textContent = 'Passwords do not match.';
                errorDiv.style.display = 'block';
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
        }

        try {
            await this.register({
                firstName,
                lastName,
                email,
                password,
                phone: phone || undefined,
            });
            this.closeRegisterModal();
            this.showNotification('Account created successfully!', 'success');
            form.reset();
        } catch (error) {
            if (errorDiv) {
                errorDiv.textContent = error.message || 'Registration failed. Please try again.';
                errorDiv.style.display = 'block';
            }
            this.showNotification(error.message || 'Registration failed', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account';
            }
        }
    }

    // Handle logout
    handleLogout() {
        this.logout();
        this.showNotification('Logged out successfully', 'info');
        // Redirect to home if on account page
        if (window.location.pathname.includes('account.html')) {
            window.location.href = 'index.html';
        }
    }

    // Modal management
    openLoginModal() {
        const modal = document.getElementById('customer-login-modal');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            const emailInput = modal.querySelector('#login-email');
            if (emailInput) emailInput.focus();
        }
    }

    closeLoginModal() {
        const modal = document.getElementById('customer-login-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            const form = modal.querySelector('#customer-login-form');
            if (form) {
                form.reset();
                const errorDiv = form.querySelector('.auth-error');
                if (errorDiv) {
                    errorDiv.textContent = '';
                    errorDiv.style.display = 'none';
                }
            }
        }
    }

    openRegisterModal() {
        const modal = document.getElementById('customer-register-modal');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            const firstNameInput = modal.querySelector('#register-first-name');
            if (firstNameInput) firstNameInput.focus();
        }
    }

    closeRegisterModal() {
        const modal = document.getElementById('customer-register-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            const form = modal.querySelector('#customer-register-form');
            if (form) {
                form.reset();
                const errorDiv = form.querySelector('.auth-error');
                if (errorDiv) {
                    errorDiv.textContent = '';
                    errorDiv.style.display = 'none';
                }
            }
        }
    }

    // Show notification
    showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.app && typeof window.app.showNotification === 'function') {
            window.app.showNotification(message, type);
        } else if (window.showNotification && typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            // Fallback: simple alert
            alert(message);
        }
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.customerAuth = new CustomerAuth();
    });
} else {
    window.customerAuth = new CustomerAuth();
}


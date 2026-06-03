// HM Herbs admin panel

const HM_CLOSE_ICON_SVG = '<svg class="cart-close-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg>';

class AdminApp {
    constructor() {
        // Dynamic API base URL configuration
        this.apiBaseUrl = this.getApiBaseUrl();
        this.authToken = localStorage.getItem('adminToken');
        this.currentUser = null;
        this.allowedSections = null;
        this.defaultSection = 'dashboard';
        this.eventListeners = []; // Track event listeners for cleanup
        this.timeouts = []; // Track timeouts for cleanup
        this.allProducts = []; // Store all products for search/filtering
        this.allBrands = []; // Store all brands for filtering
        this.allCategories = []; // Store all categories for filtering
        this.allCategoriesForFilter = []; // Store all categories for category section filtering
        this.holidaySchedule = [];
        this.productsPagination = {
            currentPage: 1,
            itemsPerPage: 50,
            totalPages: 1,
            totalProducts: 0,
            useServerPagination: true // Use server pagination when no filters active
        };
        this._promoPickerProducts = { scope: new Map(), buy: new Map(), get: new Map(), trigger: new Map() };
        this._promoRewardRuleSeq = 0;
        this._promoPickerCategories = new Map();
        this._promoCategoriesCache = null;
        this._promoProductPickersReady = false;
        this._promoProdSearchTimers = {};
        /** @type {HTMLElement | null} Element to restore focus when closing the checkout promo editor modal */
        this._promoEditorReturnFocus = null;
        this.categoriesPagination = {
            currentPage: 1,
            itemsPerPage: 50,
            totalPages: 1,
            totalCategories: 0
        };
        this._edsaBookingsById = new Map();

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
                const sessionOk = await this.loadSession();
                if (!sessionOk) {
                    this.logout();
                    return;
                }
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
        void this.setupGoogleSignIn();
    }

    // Helper function to escape HTML to prevent XSS
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    formatAdminMoney(amount) {
        const value = Number(amount) || 0;
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }

    formatAdminDateTime(value) {
        if (!value) return '—';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
    }

    _orderStatusBadgeClass(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'delivered' || s === 'completed') return 'badge-success';
        if (s === 'pending' || s === 'cancelled' || s === 'refunded') return 'badge-warning';
        return 'badge-info';
    }

    _mountAdminModal(html) {
        const root = document.getElementById('adminModalRoot');
        if (!root) return null;
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText =
            'display:flex;position:fixed;z-index:10000;inset:0;background:rgba(0,0,0,0.6);align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow-y:auto;';
        modal.innerHTML = `
            <div class="modal-content" style="background:#fff;border-radius:var(--radius-lg, 8px);max-width:980px;width:100%;position:relative;max-height:calc(100vh - 4rem);overflow-y:auto;box-shadow:0 25px 50px -12px rgba(0,0,0,0.3);">
                ${html}
            </div>`;

        const onEscape = (e) => {
            if (e.key !== 'Escape') return;
            if (!modal.isConnected) {
                document.removeEventListener('keydown', onEscape, true);
                return;
            }
            e.preventDefault();
            modal.remove();
            document.removeEventListener('keydown', onEscape, true);
        };
        document.addEventListener('keydown', onEscape, true);

        const mo = new MutationObserver(() => {
            if (!modal.isConnected) {
                document.removeEventListener('keydown', onEscape, true);
                mo.disconnect();
            }
        });
        mo.observe(root, { childList: true });

        root.appendChild(modal);
        return modal;
    }

    _formatAddressBlock(prefix, order) {
        const lines = [
            [order[`${prefix}_first_name`], order[`${prefix}_last_name`]].filter(Boolean).join(' '),
            order[`${prefix}_company`],
            order[`${prefix}_address_line_1`],
            order[`${prefix}_address_line_2`],
            [order[`${prefix}_city`], order[`${prefix}_state`], order[`${prefix}_postal_code`]].filter(Boolean).join(', '),
            order[`${prefix}_country`],
        ].filter((line) => line && String(line).trim());
        return lines.length
            ? lines.map((line) => `<div>${this.escapeHtml(line)}</div>`).join('')
            : '<div style="color:var(--gray-500);">—</div>';
    }

    async showOrderDetail(orderId) {
        if (!this.authToken) {
            this.showNotification('Please log in to view orders.', 'error');
            return;
        }

        try {
            const data = await this.apiRequest(`/admin/orders/${orderId}`);
            if (!data || !data.order) {
                this.showNotification('Order not found', 'error');
                return;
            }

            const order = data.order;
            const items = data.items || [];
            const customerName = [order.shipping_first_name, order.shipping_last_name].filter(Boolean).join(' ')
                || [order.account_first_name, order.account_last_name].filter(Boolean).join(' ')
                || '—';
            const closeBtn =
                `<button type="button" class="modal-close" onclick="this.closest('.modal').remove()" aria-label="Close">${HM_CLOSE_ICON_SVG}</button>`;

            const itemsHtml = items.length
                ? `<div class="table-container"><table class="table">
                    <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                    <tbody>
                    ${items.map((item) => `
                        <tr>
                            <td>${this.escapeHtml(item.product_name || '')}${item.variant_name ? `<div style="font-size:0.8rem;color:var(--gray-500);">${this.escapeHtml(item.variant_name)}</div>` : ''}</td>
                            <td><code>${this.escapeHtml(item.product_sku || '')}</code></td>
                            <td>${item.quantity || 0}</td>
                            <td>${this.formatAdminMoney(item.price)}</td>
                            <td>${this.formatAdminMoney(item.total)}</td>
                        </tr>`).join('')}
                    </tbody></table></div>`
                : '<p style="color:var(--gray-500);">No line items.</p>';

            const modal = this._mountAdminModal(`
                <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:1.5rem;border-bottom:1px solid var(--gray-200);gap:1rem;">
                    <div>
                        <h3 style="margin:0 0 0.35rem;color:var(--primary-green);">Order <code>${this.escapeHtml(order.order_number)}</code></h3>
                        <div style="font-size:0.85rem;color:var(--gray-500);">${this.formatAdminDateTime(order.created_at)}</div>
                        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem;">
                            <span class="badge ${this._orderStatusBadgeClass(order.status)}">${this.escapeHtml(order.status)}</span>
                            <span class="badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}">${this.escapeHtml(order.payment_status)}</span>
                            ${order.fulfillment_status ? `<span class="badge badge-info">${this.escapeHtml(order.fulfillment_status)}</span>` : ''}
                        </div>
                    </div>
                    ${closeBtn}
                </div>

                <div style="padding:1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
                    <div>
                        <h4 style="margin:0 0 0.75rem;color:var(--gray-800);">Customer</h4>
                        <div style="font-size:0.95rem;line-height:1.5;">
                            <div><strong>${this.escapeHtml(customerName)}</strong></div>
                            <div>${this.escapeHtml(order.email || order.account_email || '')}</div>
                            ${order.customer_number ? `<div style="color:var(--gray-500);margin-top:0.25rem;"><code>${this.escapeHtml(order.customer_number)}</code></div>` : ''}
                            ${order.user_id ? `<button type="button" class="btn btn-sm btn-secondary" id="orderViewCustomerBtn" style="margin-top:0.75rem;"><i class="fas fa-user"></i> View customer</button>` : ''}
                        </div>
                    </div>
                    <div>
                        <h4 style="margin:0 0 0.75rem;color:var(--gray-800);">Order totals</h4>
                        <div style="font-size:0.95rem;line-height:1.6;">
                            <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${this.formatAdminMoney(order.subtotal)}</span></div>
                            <div style="display:flex;justify-content:space-between;"><span>Discount</span><span>-${this.formatAdminMoney(order.discount_amount)}</span></div>
                            <div style="display:flex;justify-content:space-between;"><span>Shipping</span><span>${this.formatAdminMoney(order.shipping_amount)}</span></div>
                            <div style="display:flex;justify-content:space-between;"><span>Tax</span><span>${this.formatAdminMoney(order.tax_amount)}</span></div>
                            <div style="display:flex;justify-content:space-between;font-weight:700;margin-top:0.35rem;padding-top:0.35rem;border-top:1px solid var(--gray-200);"><span>Total</span><span>${this.formatAdminMoney(order.total_amount)}</span></div>
                            ${order.promo_code ? `<div style="margin-top:0.5rem;color:var(--gray-600);">Promo: <code>${this.escapeHtml(order.promo_code)}</code></div>` : ''}
                        </div>
                    </div>
                    <div>
                        <h4 style="margin:0 0 0.75rem;color:var(--gray-800);">Shipping address</h4>
                        ${this._formatAddressBlock('shipping', order)}
                    </div>
                    <div>
                        <h4 style="margin:0 0 0.75rem;color:var(--gray-800);">Billing address</h4>
                        ${this._formatAddressBlock('billing', order)}
                    </div>
                </div>

                <div style="padding:0 1.5rem 1.5rem;">
                    <h4 style="margin:0 0 0.75rem;color:var(--gray-800);">Items (${items.length})</h4>
                    ${itemsHtml}
                </div>

                <form id="orderDetailForm" style="padding:0 1.5rem 1.5rem;border-top:1px solid var(--gray-200);">
                    <h4 style="margin:1rem 0 0.75rem;color:var(--gray-800);">Update order</h4>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;">
                        <div class="form-group">
                            <label for="order-edit-status">Status</label>
                            <select class="form-input" id="order-edit-status" name="status">
                                ${['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].map((s) =>
                                    `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="order-edit-payment">Payment</label>
                            <select class="form-input" id="order-edit-payment" name="payment_status">
                                ${['pending', 'paid', 'failed', 'refunded'].map((s) =>
                                    `<option value="${s}" ${order.payment_status === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="order-edit-fulfillment">Fulfillment</label>
                            <select class="form-input" id="order-edit-fulfillment" name="fulfillment_status">
                                ${['unfulfilled', 'partial', 'fulfilled'].map((s) =>
                                    `<option value="${s}" ${order.fulfillment_status === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="order-edit-tracking">Tracking #</label>
                            <input class="form-input" id="order-edit-tracking" name="tracking_number" value="${this.escapeHtml(order.tracking_number || '')}">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label for="order-edit-tracking-url">Tracking URL</label>
                            <input class="form-input" id="order-edit-tracking-url" name="tracking_url" value="${this.escapeHtml(order.tracking_url || '')}">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label for="order-edit-notes">Notes</label>
                            <textarea class="form-input" id="order-edit-notes" name="notes" rows="3">${this.escapeHtml(order.notes || '')}</textarea>
                        </div>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1rem;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                        <button type="submit" class="btn btn-primary" id="orderDetailSaveBtn">Save changes</button>
                    </div>
                </form>
            `);

            if (!modal) return;

            const viewCustomerBtn = modal.querySelector('#orderViewCustomerBtn');
            if (viewCustomerBtn && order.user_id && typeof this.showCustomerProfile === 'function') {
                viewCustomerBtn.addEventListener('click', () => {
                    modal.remove();
                    this.showCustomerProfile(order.user_id);
                });
            }

            const form = modal.querySelector('#orderDetailForm');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const saveBtn = modal.querySelector('#orderDetailSaveBtn');
                    if (saveBtn) {
                        saveBtn.disabled = true;
                        saveBtn.textContent = 'Saving…';
                    }
                    try {
                        const payload = {
                            status: form.status.value,
                            payment_status: form.payment_status.value,
                            fulfillment_status: form.fulfillment_status.value,
                            tracking_number: form.tracking_number.value,
                            tracking_url: form.tracking_url.value,
                            notes: form.notes.value,
                        };
                        const updated = await this.apiRequest(`/admin/orders/${orderId}`, {
                            method: 'PATCH',
                            body: JSON.stringify(payload),
                        });
                        if (updated) {
                            this.showNotification('Order updated', 'success');
                            modal.remove();
                            await this.loadOrders();
                        }
                    } catch (err) {
                        this.showNotification(err.message || 'Failed to update order', 'error');
                    } finally {
                        if (saveBtn) {
                            saveBtn.disabled = false;
                            saveBtn.textContent = 'Save changes';
                        }
                    }
                });
            }
        } catch (error) {
            this.showNotification(error.message || 'Failed to load order', 'error');
        }
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

        const lowStockCardLink = document.getElementById('lowStockCardLink');
        if (lowStockCardLink) {
            lowStockCardLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSection('low-stock');
            });
        }

        window.addEventListener('hashchange', () => {
            if (!this.authToken) return;
            const deep = this.parseAdminDeepLink();
            if (deep) {
                this.showSection(deep.section, { skipHashUpdate: true }).then(() => {
                    if (deep.bookingId && deep.section === 'edsa') {
                        this.openEdsaBookingWhenReady(deep.bookingId);
                    }
                });
            }
        });
    }

    parseAdminDeepLink() {
        const hash = window.location.hash.replace(/^#/, '').trim();
        if (!hash) return null;
        const section = hash.split(/[/?&]/)[0];
        if (!document.querySelector(`[data-section="${section}"]`)) return null;
        const bookingParam = new URLSearchParams(window.location.search).get('booking');
        const bookingId = Number(bookingParam);
        return {
            section,
            bookingId: Number.isFinite(bookingId) && bookingId > 0 ? bookingId : null,
        };
    }

    updateAdminUrlHash(sectionName) {
        try {
            const url = new URL(window.location.href);
            url.hash = sectionName;
            if (sectionName !== 'edsa') {
                url.searchParams.delete('booking');
            }
            const next = `${url.pathname}${url.search}${url.hash}`;
            if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
                history.replaceState(null, '', next);
            }
        } catch (_) {
            /* ignore */
        }
    }

    async openEdsaBookingWhenReady(bookingId, attemptsLeft = 20) {
        const id = Number(bookingId);
        if (!Number.isFinite(id) || id < 1) return;
        if (this._edsaBookingsById.has(id)) {
            this.openEdsaBookingModal(id);
            return;
        }
        if (attemptsLeft <= 0) {
            this.showToast(
                `Booking #${id} is not on the current calendar view. Use the table below or change the month.`,
                'info'
            );
            return;
        }
        await new Promise((r) => setTimeout(r, 150));
        return this.openEdsaBookingWhenReady(id, attemptsLeft - 1);
    }

    async applyAdminDeepLink() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('gbp') || params.get('gcal') || window.location.hash === '#settings') {
            await this.showSection('settings', { skipHashUpdate: true });
            this.handleGoogleBusinessOAuthReturn();
            this.handleGoogleCalendarOAuthReturn();
            return;
        }

        const deep = this.parseAdminDeepLink();
        if (!deep) return;

        await this.showSection(deep.section, { skipHashUpdate: true });
        if (deep.bookingId && deep.section === 'edsa') {
            await this.openEdsaBookingWhenReady(deep.bookingId);
        }
    }

    _googleButtonSvg() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
    }

    async setupGoogleSignIn() {
        if (document.querySelector('link[data-hm-oauth-css]')) {
            /* already linked */
        } else {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'css/oauth-buttons.css';
            link.setAttribute('data-hm-oauth-css', '1');
            document.head.appendChild(link);
        }
        try {
            const res = await fetch(`${this.apiBaseUrl}/admin/auth/google/status`);
            const data = await res.json();
            if (!data?.google?.enabled) return;
            const form = document.getElementById('loginForm');
            if (!form || form.querySelector('.btn-google-oauth')) return;
            const divider = document.createElement('div');
            divider.className = 'auth-divider';
            divider.textContent = 'or';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-google btn-google-oauth';
            btn.innerHTML = `${this._googleButtonSvg()} Continue with Google`;
            btn.addEventListener('click', () => this.startGoogleSignIn());
            form.appendChild(divider);
            form.appendChild(btn);
        } catch (_) {
            /* optional */
        }
    }

    startGoogleSignIn() {
        window.location.href = `${this.apiBaseUrl}/admin/auth/google/start?returnTo=${encodeURIComponent('/admin.html')}`;
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
                this.allowedSections = data.allowedSections ?? null;
                this.defaultSection = data.defaultSection || 'dashboard';
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

    async loadSession() {
        if (!this.authToken) return false;
        try {
            const data = await this.apiRequest('/admin/auth/me');
            if (!data?.admin) return false;
            this.currentUser = data.admin;
            this.allowedSections = data.allowedSections ?? null;
            this.defaultSection = data.defaultSection || 'dashboard';
            return true;
        } catch {
            return false;
        }
    }

    canAccessSection(sectionName) {
        if (sectionName === 'personnel') {
            return this.isFullAdmin;
        }
        if (sectionName === 'developer-tools') {
            return this.currentUser?.role === 'developer';
        }
        if (this.allowedSections === null || this.allowedSections === undefined) {
            return true;
        }
        return this.allowedSections.includes(sectionName);
    }

    applyRoleAccess() {
        const allowed = this.allowedSections;
        const isFullAdmin = allowed === null || allowed === undefined;
        const isDeveloper = this.currentUser?.role === 'developer';

        document.querySelectorAll('.nav-link[data-section]').forEach((link) => {
            const section = link.getAttribute('data-section');
            const item = link.closest('.nav-item');
            if (!item || !section) return;
            let show = isFullAdmin || (Array.isArray(allowed) && allowed.includes(section));
            if (section === 'personnel') {
                show = isFullAdmin;
            }
            if (section === 'developer-tools') {
                show = isDeveloper;
            }
            item.style.display = show ? '' : 'none';
        });

        const personnelNav = document.getElementById('nav-personnel-item');
        if (personnelNav) {
            personnelNav.style.display = isFullAdmin ? '' : 'none';
        }

        const developerNav = document.getElementById('nav-developer-tools-item');
        if (developerNav) {
            developerNav.style.display = isDeveloper ? '' : 'none';
        }

        document.querySelectorAll('.sidebar-nav .nav-section').forEach((sec) => {
            const visibleItems = [...sec.querySelectorAll('.nav-item')].filter(
                (el) => el.style.display !== 'none'
            );
            sec.style.display = visibleItems.length ? '' : 'none';
        });
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
            const label = this.currentUser.roleLabel || this.currentUser.role || '';
            userName.textContent = label
                ? `${this.currentUser.firstName} ${this.currentUser.lastName} · ${label}`
                : `${this.currentUser.firstName} ${this.currentUser.lastName}`;
        }

        this.applyRoleAccess();

        const landing = this.canAccessSection(this.defaultSection)
            ? this.defaultSection
            : (this.allowedSections && this.allowedSections[0]) || 'marketing';

        await this.showSection(landing, { skipHashUpdate: true });

        if (this.canAccessSection('dashboard')) {
            await this.loadDashboardStats();
        }
        await this.applyAdminDeepLink();
    }

    get isFullAdmin() {
        return this.allowedSections === null || this.allowedSections === undefined;
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

    async showSection(sectionName, { skipHashUpdate = false } = {}) {
        if (!this.canAccessSection(sectionName)) {
            this.showToast('You do not have access to that section.', 'error');
            return;
        }

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
        if (sectionName === 'products') {
            await new Promise((resolve) => {
                requestAnimationFrame(() => {
                    const section = document.getElementById(sectionName);
                    if (section && section.classList.contains('active')) {
                        this.loadSectionData(sectionName).then(resolve);
                    } else {
                        setTimeout(() => this.loadSectionData(sectionName).then(resolve), 100);
                    }
                });
            });
        } else {
            await this.loadSectionData(sectionName);
        }

        if (!skipHashUpdate) {
            this.updateAdminUrlHash(sectionName);
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
            case 'tax-ledger':
                await this.loadTaxLedger();
                break;
            case 'low-stock':
                await this.loadLowStock();
                break;
            case 'edsa':
                await this.loadEDSABookings();
                break;
            case 'customers':
                if (typeof this.loadCustomers === 'function') {
                    await this.loadCustomers();
                }
                break;
            case 'gift-cards':
                if (typeof this.loadGiftCards === 'function') {
                    await this.loadGiftCards();
                }
                break;
            case 'marketing':
                await this.loadMarketingHub();
                break;
            case 'personnel':
                await this.loadAdminTeam();
                break;
            case 'settings':
                await this.loadStoreInfoSettings();
                break;
            case 'developer-tools':
                await this.loadDeveloperTools();
                break;
        }
    }

    async loadDeveloperTools() {
        const backupMeta = document.getElementById('dev-tools-backup-meta');
        const migrationsSummary = document.getElementById('dev-tools-migrations-summary');
        const migrationsList = document.getElementById('dev-tools-migrations-list');
        const msg = document.getElementById('dev-tools-migrations-msg');
        if (!backupMeta || !migrationsSummary || !migrationsList) return;

        backupMeta.textContent = 'Loading backup info…';
        migrationsSummary.textContent = 'Loading migration status…';
        migrationsList.innerHTML = '<p style="margin:0;color:var(--gray-500);">Loading…</p>';
        if (msg) msg.textContent = '';

        try {
            const status = await this.apiRequest('/admin/dev-tools/status');
            const db = status?.database || {};
            const backup = status?.backup || {};
            const migrations = status?.migrations || {};
            const method = backup.mysqldumpAvailable ? 'mysqldump (fast)' : 'built-in exporter';
            backupMeta.textContent = `Connected to ${db.name || 'database'} on ${db.host || 'localhost'}${db.ssl ? ' (SSL)' : ''}. Backup method: ${method}.`;

            const pending = migrations.pendingCount || 0;
            const applied = migrations.appliedCount || 0;
            migrationsSummary.innerHTML =
                pending === 0
                    ? `<strong style="color:var(--success);">Database is up to date.</strong> ${applied} migration file(s) recorded.`
                    : `<strong style="color:var(--warning);">${pending} pending</strong> migration file(s), ${applied} already applied.`;

            const rows = Array.isArray(migrations.migrations) ? migrations.migrations : [];
            if (!rows.length) {
                migrationsList.innerHTML =
                    '<p style="margin:0;color:var(--gray-500);">No migration files found in database/migrations/.</p>';
            } else {
                migrationsList.innerHTML = `
                    <table class="table" style="margin:0;background:transparent;">
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Status</th>
                                <th>Applied</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows
                                .map((m) => {
                                    const statusLabel =
                                        m.status === 'applied'
                                            ? '<span class="badge badge-success">Applied</span>'
                                            : '<span class="badge badge-warning">Pending</span>';
                                    const mismatch = m.checksumMismatch
                                        ? ' <span class="badge" style="background:#fef3c7;color:#92400e;">Changed since apply</span>'
                                        : '';
                                    const appliedAt = m.appliedAt
                                        ? this._escapeHtml(this._formatPersonnelDate(m.appliedAt))
                                        : '—';
                                    return `<tr>
                                        <td style="font-family:monospace;font-size:0.82rem;">${this._escapeHtml(m.filename)}</td>
                                        <td>${statusLabel}${mismatch}</td>
                                        <td style="font-size:0.85rem;color:var(--gray-600);">${appliedAt}</td>
                                    </tr>`;
                                })
                                .join('')}
                        </tbody>
                    </table>`;
            }
        } catch (err) {
            backupMeta.textContent = 'Could not load developer tools status.';
            migrationsSummary.textContent = '';
            migrationsList.innerHTML = `<p style="margin:0;color:var(--error);">${this._escapeHtml(err.message || 'Failed to load status')}</p>`;
        }
    }

    async downloadDatabaseBackup() {
        if (this.currentUser?.role !== 'developer') {
            this.showNotification('Developer access required', 'error');
            return;
        }
        const proceedWithBackup = await this.showAdminConfirm({
            title: 'Download database backup',
            message:
                'Download a full SQL backup of the database now?\n\nThis may take a minute on large databases.',
            confirmLabel: 'Download backup',
            cancelLabel: 'Cancel',
        });
        if (!proceedWithBackup) {
            return;
        }

        const url = `${this.apiBaseUrl}/admin/dev-tools/backup`;
        this.showNotification('Building database backup…', 'info');
        const response = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${this.authToken}` },
        });

        if (!response.ok) {
            let message = `Backup failed (${response.status})`;
            try {
                const err = await response.json();
                if (err?.error) message = err.error;
            } catch (_) {
                /* ignore */
            }
            this.showNotification(message, 'error');
            return;
        }

        const method = response.headers.get('X-Backup-Method') || 'sql';
        const blob = await response.blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        const stamp = new Date().toISOString().slice(0, 10);
        link.download = `hmherbs-backup-${stamp}.sql`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);
        this.showNotification(`Database backup downloaded (${method})`, 'success');
    }

    async runPendingMigrations() {
        if (this.currentUser?.role !== 'developer') {
            this.showNotification('Developer access required', 'error');
            return;
        }

        const msg = document.getElementById('dev-tools-migrations-msg');
        const confirmed = await this.showAdminConfirm({
            title: 'Run pending migrations',
            message:
                'Run all PENDING database migrations?\n\nThis applies schema updates only — it does not delete customers, orders, or sales data.',
            confirmLabel: 'Continue',
            cancelLabel: 'Cancel',
        });
        if (!confirmed) return;

        const typedResult = await this.showAdminInputModal({
            title: 'Confirm migration run',
            message: 'Type RUN MIGRATIONS to confirm.',
            inputs: [
                {
                    key: 'confirmText',
                    label: 'Confirmation',
                    placeholder: 'RUN MIGRATIONS',
                    required: true,
                },
            ],
            submitLabel: 'Run migrations',
            cancelLabel: 'Cancel',
        });
        const typed = typedResult ? typedResult.confirmText : null;
        if (typed !== 'RUN MIGRATIONS') {
            if (msg) msg.textContent = 'Migration run cancelled — confirmation text did not match.';
            return;
        }

        const btn = document.getElementById('dev-tools-run-migrations-btn');
        const original = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Running…';
        }
        if (msg) msg.textContent = 'Running pending migrations…';

        try {
            const result = await this.apiRequest('/admin/dev-tools/run-migrations', {
                method: 'POST',
                body: JSON.stringify({ confirm: 'RUN MIGRATIONS' }),
            });
            if (msg) {
                msg.style.color = 'var(--success)';
                msg.textContent = result?.message || 'Migrations complete.';
            }
            this.showNotification(result?.message || 'Migrations complete', 'success');
            await this.loadDeveloperTools();
        } catch (err) {
            if (msg) {
                msg.style.color = 'var(--error)';
                msg.textContent = err.message || 'Migration run failed';
            }
            this.showNotification(err.message || 'Migration run failed', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = original;
            }
        }
    }

    _employeeDiscountSettingMeta() {
        return {
            employee_discount_enabled: 'Enable employee merchandise discount at checkout',
            employee_discount_percent: 'Employee discount percentage (0–100)',
        };
    }

    _storeInfoSettingMeta() {
        return {
            store_name: 'Store display name',
            store_phone: 'Primary store phone number',
            store_email: 'Primary store contact email',
            store_address_line1: 'Store street address line 1',
            store_address_line2: 'Store street address line 2',
            store_city: 'Store city',
            store_state: 'Store state/province',
            store_postal_code: 'Store postal code',
            store_hours_weekdays: 'Operating hours for weekdays',
            store_hours_saturday: 'Operating hours for Saturday',
            store_hours_sunday: 'Operating hours for Sunday',
            store_holiday_schedule: 'Structured holiday schedule for closures/special hours',
        };
    }

    _nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
        const first = new Date(year, monthIndex, 1);
        const delta = (weekday - first.getDay() + 7) % 7;
        return new Date(year, monthIndex, 1 + delta + (nth - 1) * 7);
    }

    _lastWeekdayOfMonth(year, monthIndex, weekday) {
        const last = new Date(year, monthIndex + 1, 0);
        const delta = (last.getDay() - weekday + 7) % 7;
        return new Date(year, monthIndex, last.getDate() - delta);
    }

    _toIsoDate(date) {
        if (!(date instanceof Date)) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    _holidayDefinitions() {
        return [
            { key: 'new-year', name: "New Year's Day", dateForYear: (y) => `${y}-01-01` },
            { key: 'mlk', name: 'Martin Luther King Jr. Day', dateForYear: (y) => this._toIsoDate(this._nthWeekdayOfMonth(y, 0, 1, 3)) },
            { key: 'presidents', name: "Presidents' Day", dateForYear: (y) => this._toIsoDate(this._nthWeekdayOfMonth(y, 1, 1, 3)) },
            { key: 'memorial', name: 'Memorial Day', dateForYear: (y) => this._toIsoDate(this._lastWeekdayOfMonth(y, 4, 1)) },
            { key: 'independence', name: 'Independence Day', dateForYear: (y) => `${y}-07-04` },
            { key: 'labor', name: 'Labor Day', dateForYear: (y) => this._toIsoDate(this._nthWeekdayOfMonth(y, 8, 1, 1)) },
            { key: 'columbus', name: 'Columbus Day', dateForYear: (y) => this._toIsoDate(this._nthWeekdayOfMonth(y, 9, 1, 2)) },
            { key: 'veterans', name: "Veterans Day", dateForYear: (y) => `${y}-11-11` },
            { key: 'thanksgiving', name: 'Thanksgiving Day', dateForYear: (y) => this._toIsoDate(this._nthWeekdayOfMonth(y, 10, 4, 4)) },
            { key: 'christmas', name: 'Christmas Day', dateForYear: (y) => `${y}-12-25` },
        ];
    }

    _buildUsHolidayTemplates() {
        const year = new Date().getFullYear();
        const defs = this._holidayDefinitions();
        return defs.map((def) => ({
            key: def.key,
            templateKey: def.key,
            name: def.name,
            date: def.dateForYear(year),
            hours: 'Closed',
        }));
    }

    _renderHolidayTemplateOptions() {
        const typeSelect = document.getElementById('holiday-template-type');
        if (!typeSelect) return;
        const defs = this._holidayDefinitions();
        const currentType = typeSelect.value;
        const options = ['<option value="">Select U.S. holiday...</option>']
            .concat(
                defs.map((def) => {
                    return `<option value="${this.escapeHtml(def.key)}">${this.escapeHtml(def.name)}</option>`;
                })
            )
            .concat('<option value="__custom__">Create holiday</option>');
        typeSelect.innerHTML = options.join('');
        if (Array.from(typeSelect.options).some((opt) => opt.value === currentType)) typeSelect.value = currentType;
    }

    _renderHolidayScheduleList() {
        const list = document.getElementById('holiday-list');
        if (!list) return;
        if (!Array.isArray(this.holidaySchedule) || !this.holidaySchedule.length) {
            list.innerHTML = '<p style="margin:0;color:var(--gray-500);font-size:0.9rem;">No holidays scheduled.</p>';
            return;
        }
        const sorted = [...this.holidaySchedule].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        this.holidaySchedule = sorted;
        list.innerHTML = sorted.map((holiday, idx) => {
            const name = this.escapeHtml(holiday.name || 'Holiday');
            const date = this.escapeHtml(holiday.date || '');
            const computedHours = holiday.isClosed
                ? 'Closed'
                : `${holiday.openTime || ''}${holiday.closeTime ? ` - ${holiday.closeTime}` : ''}`.trim();
            const hours = this.escapeHtml(holiday.hours || computedHours || 'Closed');
            const note = holiday.note ? `<div style="font-size:0.82rem;color:var(--gray-500);">${this.escapeHtml(holiday.note)}</div>` : '';
            return `<div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:flex-start;padding:0.55rem 0;border-bottom:1px solid var(--gray-200);">
                <div>
                    <div style="font-weight:600;font-size:0.92rem;">${name}</div>
                    <div style="font-size:0.85rem;color:var(--gray-600);">${date} - ${hours}</div>
                    ${note}
                </div>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary btn-sm" data-holiday-revert="${idx}">Remove &amp; save</button>
                    <button type="button" class="btn btn-danger btn-sm" data-holiday-remove="${idx}">Remove from list</button>
                </div>
            </div>`;
        }).join('');
    }

    _toggleCustomHolidayFields() {
        const select = document.getElementById('holiday-template-type');
        const wrap = document.getElementById('holiday-custom-fields');
        if (!select || !wrap) return;
        wrap.style.display = select.value === '__custom__' ? 'block' : 'none';
        this._toggleCustomHolidayTimeRange();
    }

    _toggleCustomHolidayTimeRange() {
        const status = document.getElementById('holiday-custom-status');
        const timeWrap = document.getElementById('holiday-custom-time-range');
        if (!status || !timeWrap) return;
        timeWrap.style.display = status.value === 'open' ? 'grid' : 'none';
    }

    addHolidayFromSelection() {
        const select = document.getElementById('holiday-template-type');
        if (!select) return;
        if (select.value === '__custom__') {
            const name = (document.getElementById('holiday-custom-name')?.value || '').trim();
            const date = (document.getElementById('holiday-custom-date')?.value || '').trim();
            const status = (document.getElementById('holiday-custom-status')?.value || 'closed').trim();
            const openTime = (document.getElementById('holiday-custom-open-time')?.value || '').trim();
            const closeTime = (document.getElementById('holiday-custom-close-time')?.value || '').trim();
            const note = (document.getElementById('holiday-custom-note')?.value || '').trim();
            if (!name || !date) {
                this.showToast('Custom holiday needs name and date', 'warning');
                return;
            }
            if (status === 'open' && (!openTime || !closeTime || openTime >= closeTime)) {
                this.showToast('Set a valid open and close time', 'warning');
                return;
            }
            this.holidaySchedule.push({
                name,
                date,
                isClosed: status !== 'open',
                openTime: status === 'open' ? openTime : null,
                closeTime: status === 'open' ? closeTime : null,
                hours: status === 'open' ? `${openTime} - ${closeTime}` : 'Closed',
                note,
                source: 'custom',
            });
            this._renderHolidayScheduleList();
            document.getElementById('holiday-custom-name').value = '';
            document.getElementById('holiday-custom-date').value = '';
            document.getElementById('holiday-custom-status').value = 'closed';
            document.getElementById('holiday-custom-open-time').value = '09:00';
            document.getElementById('holiday-custom-close-time').value = '17:00';
            document.getElementById('holiday-custom-note').value = '';
            this._toggleCustomHolidayTimeRange();
            return;
        }
        const template = this._buildUsHolidayTemplates().find((item) => item.templateKey === select.value);
        if (!template) {
            this.showToast('Select a holiday first', 'warning');
            return;
        }
        const duplicate = this.holidaySchedule.some((item) => item.date === template.date && item.name === template.name);
        if (duplicate) {
            this.showToast('That holiday is already scheduled', 'warning');
            return;
        }
        this.holidaySchedule.push({
            name: template.name,
            date: template.date,
            isClosed: true,
            openTime: null,
            closeTime: null,
            hours: template.hours || 'Closed',
            note: '',
            source: 'preset',
        });
        this._renderHolidayScheduleList();
    }

    removeHolidayAt(index) {
        if (!Number.isInteger(index)) return;
        this.holidaySchedule = this.holidaySchedule.filter((_, i) => i !== index);
        this._renderHolidayScheduleList();
    }

    _collectPromoBannerFromForm() {
        const presetRaw = (document.getElementById('promo-preset')?.value || 'sale').trim().toLowerCase();
        const presets = new Set(['sale', 'flash', 'holiday', 'info', 'custom']);
        const preset = presets.has(presetRaw) ? presetRaw : 'sale';
        return {
            enabled: !!document.getElementById('promo-enabled')?.checked,
            preset,
            headline: (document.getElementById('promo-headline')?.value || '').trim().slice(0, 200),
            subline: (document.getElementById('promo-subline')?.value || '').trim().slice(0, 280),
            linkUrl: (document.getElementById('promo-link-url')?.value || '').trim().slice(0, 500),
            linkLabel: (document.getElementById('promo-link-label')?.value || '').trim().slice(0, 80),
            icon: (document.getElementById('promo-icon')?.value || '').trim().slice(0, 12),
            iconUrl: (() => {
                const v = (document.getElementById('promo-icon-url')?.value || '').trim().slice(0, 200);
                return /^\/uploads\/promo-icons\/[a-zA-Z0-9._-]+$/.test(v) ? v : '';
            })(),
            customBg: (document.getElementById('promo-custom-bg')?.value || '#2d5a27').trim(),
            customText: (document.getElementById('promo-custom-text')?.value || '#ffffff').trim(),
            customAccent: (document.getElementById('promo-custom-accent')?.value || '#fbbf24').trim(),
        };
    }

    _applyPromoBannerToForm(raw) {
        let cfg = {};
        try {
            cfg = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
        } catch (_) {
            cfg = {};
        }
        const el = (id) => document.getElementById(id);
        if (el('promo-enabled')) el('promo-enabled').checked = !!cfg.enabled;
        if (el('promo-preset')) el('promo-preset').value = cfg.preset || 'sale';
        if (el('promo-headline')) el('promo-headline').value = cfg.headline || '';
        if (el('promo-subline')) el('promo-subline').value = cfg.subline || '';
        if (el('promo-link-url')) el('promo-link-url').value = cfg.linkUrl || '';
        if (el('promo-link-label')) el('promo-link-label').value = cfg.linkLabel || '';
        if (el('promo-icon')) el('promo-icon').value = cfg.icon || '';
        if (el('promo-icon-url')) el('promo-icon-url').value = cfg.iconUrl || '';
        if (el('promo-custom-bg')) el('promo-custom-bg').value = cfg.customBg || '#2d5a27';
        if (el('promo-custom-text')) el('promo-custom-text').value = cfg.customText || '#ffffff';
        if (el('promo-custom-accent')) el('promo-custom-accent').value = cfg.customAccent || '#fbbf24';
        this._togglePromoCustomColors();
        this._refreshPromoIconPreview();
    }

    _promoIconAssetBase() {
        return (this.apiBaseUrl || '').replace(/\/api\/?$/, '');
    }

    _refreshPromoIconPreview() {
        const path = document.getElementById('promo-icon-url')?.value?.trim();
        const wrap = document.getElementById('promo-icon-preview-wrap');
        const img = document.getElementById('promo-icon-preview-img');
        if (!wrap || !img) return;
        if (!path || !/^\/uploads\/promo-icons\//.test(path)) {
            wrap.style.display = 'none';
            img.removeAttribute('src');
            return;
        }
        img.src = `${this._promoIconAssetBase()}${path}`;
        wrap.style.display = 'block';
    }

    async uploadPromoBannerIcon() {
        const input = document.getElementById('promo-icon-file');
        if (!input?.files?.length) {
            this.showToast('Choose an image file first', 'warning');
            return;
        }
        const fd = new FormData();
        fd.append('icon', input.files[0]);
        const url = `${this.apiBaseUrl}/admin/promo-banner/upload-icon`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.authToken}` },
                body: fd,
            });
            if (res.status === 401) {
                this.logout();
                throw new Error('Authentication required');
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Upload failed');
            }
            const hidden = document.getElementById('promo-icon-url');
            if (hidden) hidden.value = data.url || '';
            input.value = '';
            this._refreshPromoIconPreview();
            this.showToast('Banner icon uploaded', 'success');
        } catch (e) {
            this.showToast(e.message || 'Upload failed', 'error');
        }
    }

    clearPromoBannerUploadedIcon() {
        const hidden = document.getElementById('promo-icon-url');
        const file = document.getElementById('promo-icon-file');
        if (hidden) hidden.value = '';
        if (file) file.value = '';
        this._refreshPromoIconPreview();
    }

    bindPromoProductLinkSearch() {
        const input = document.getElementById('promo-product-link-search');
        const results = document.getElementById('promo-product-link-results');
        if (!input || !results || input.dataset.bound === '1') return;
        input.dataset.bound = '1';
        this._promoProductLinkRows = [];
        this._promoProductLinkHighlightIdx = -1;
        this._promoProductLinkSearchPending = false;

        if (!this._promoProductLinkReposBound) {
            this._promoProductLinkReposBound = () => this._promoProductLinkSyncPanelPosition();
            window.addEventListener('scroll', this._promoProductLinkReposBound, true);
            window.addEventListener('resize', this._promoProductLinkReposBound);
        }

        input.addEventListener('input', () => {
            clearTimeout(this._promoProductLinkSearchTimer);
            this._promoProductLinkSearchTimer = setTimeout(() => this._promoProductLinkSearchFetch(), 200);
        });
        input.addEventListener('focus', () => {
            if (input.value.trim().length >= 1) this._promoProductLinkSearchFetch();
            else this._promoProductLinkShowTypingHint();
        });
        input.addEventListener('keydown', (ev) => this._promoProductLinkSearchKeydown(ev));
        document.addEventListener('click', (e) => {
            if (e.target.closest('.promo-product-link-field')) return;
            this._promoProductLinkHidePanel();
        });
    }

    _promoProductLinkSetAriaExpanded(open) {
        const input = document.getElementById('promo-product-link-search');
        if (input) input.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    _promoProductLinkSyncPanelPosition() {
        const input = document.getElementById('promo-product-link-search');
        const results = document.getElementById('promo-product-link-results');
        if (!input || !results || results.hasAttribute('hidden')) return;
        const r = input.getBoundingClientRect();
        const w = Math.max(Math.round(r.width), 220);
        const maxLeft = Math.max(8, window.innerWidth - w - 8);
        results.style.left = `${Math.min(Math.round(r.left), maxLeft)}px`;
        results.style.width = `${w}px`;
        const placeBelow = () => {
            const panelH = results.offsetHeight || 200;
            let top = Math.round(r.bottom) + 6;
            if (top + panelH > window.innerHeight - 8) {
                top = Math.max(8, Math.round(r.top) - panelH - 6);
            }
            results.style.top = `${top}px`;
        };
        placeBelow();
        requestAnimationFrame(placeBelow);
    }

    _promoProductLinkShowTypingHint() {
        const results = document.getElementById('promo-product-link-results');
        if (!results) return;
        this._promoProductLinkRows = [];
        this._promoProductLinkHighlightIdx = -1;
        results.removeAttribute('hidden');
        results.classList.add('prompt');
        results.textContent =
            'Type a product name or SKU — suggestions appear below; click one or highlight with arrows and press Enter.';
        results.style.display = 'block';
        this._promoProductLinkSetAriaExpanded(true);
        this._promoProductLinkSyncPanelPosition();
    }

    _promoProductLinkHidePanel() {
        const results = document.getElementById('promo-product-link-results');
        if (!results) return;
        results.innerHTML = '';
        results.style.display = 'none';
        results.setAttribute('hidden', '');
        results.classList.remove('prompt');
        this._promoProductLinkRows = [];
        this._promoProductLinkHighlightIdx = -1;
        this._promoProductLinkSetAriaExpanded(false);
    }

    _promoProductLinkApplyHighlight() {
        const results = document.getElementById('promo-product-link-results');
        if (!results) return;
        const opts = results.querySelectorAll('.promo-product-link-option');
        opts.forEach((el, i) => {
            el.classList.toggle('promo-product-link-option--highlight', i === this._promoProductLinkHighlightIdx);
            el.setAttribute('aria-selected', i === this._promoProductLinkHighlightIdx ? 'true' : 'false');
        });
    }

    _promoProductLinkSetHighlight(idx) {
        const n = this._promoProductLinkRows.length;
        if (n === 0) return;
        this._promoProductLinkHighlightIdx = ((idx % n) + n) % n;
        this._promoProductLinkApplyHighlight();
    }

    _promoProductLinkSearchKeydown(ev) {
        const input = document.getElementById('promo-product-link-search');
        const results = document.getElementById('promo-product-link-results');
        if (!input || !results) return;
        const open = !results.hasAttribute('hidden') && results.style.display !== 'none';
        const q = (input.value || '').trim();

        if (ev.key === 'Escape') {
            if (open) {
                ev.preventDefault();
                this._promoProductLinkHidePanel();
            }
            return;
        }

        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            if (q.length < 1) return;
            if (!open || !this._promoProductLinkRows.length) {
                void this._promoProductLinkSearchFetch();
                return;
            }
            this._promoProductLinkSetHighlight(this._promoProductLinkHighlightIdx + 1);
            return;
        }

        if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            if (q.length < 1) return;
            if (!open || !this._promoProductLinkRows.length) {
                void this._promoProductLinkSearchFetch();
                return;
            }
            this._promoProductLinkSetHighlight(
                this._promoProductLinkHighlightIdx <= 0 ? this._promoProductLinkRows.length - 1 : this._promoProductLinkHighlightIdx - 1
            );
            return;
        }

        if (ev.key === 'Enter') {
            ev.preventDefault();
            if (open && this._promoProductLinkRows.length) {
                const i = this._promoProductLinkHighlightIdx >= 0 ? this._promoProductLinkHighlightIdx : 0;
                const p = this._promoProductLinkRows[i];
                if (p) this.applyPromoProductLink(p);
            }
        }
    }

    applyPromoProductLink(product) {
        if (!product || product.id == null) return;
        const urlField = document.getElementById('promo-link-url');
        const labelField = document.getElementById('promo-link-label');
        if (!urlField) return;
        const slug = String(product.slug || '').trim();
        const id = Number(product.id);
        if (slug) {
            urlField.value = `product.html?slug=${encodeURIComponent(slug)}`;
        } else if (Number.isFinite(id) && id > 0) {
            urlField.value = `product.html?id=${id}`;
        } else {
            return;
        }
        if (labelField) {
            const cur = labelField.value.trim();
            const name = String(product.name || '').trim();
            if (!cur && name) {
                labelField.value = name.length > 40 ? `${name.slice(0, 37)}…` : name;
            }
        }
        this._promoProductLinkHidePanel();
        const searchIn = document.getElementById('promo-product-link-search');
        if (searchIn) searchIn.value = '';
        this.showToast('CTA set to this product — save Settings to publish', 'success');
    }

    async _promoProductLinkSearchFetch() {
        const input = document.getElementById('promo-product-link-search');
        const results = document.getElementById('promo-product-link-results');
        if (!input || !results) return;
        const q = input.value.trim();
        if (q.length < 1) {
            this._promoProductLinkHidePanel();
            return;
        }
        if (!this.authToken) return;

        this._promoProductLinkSearchPending = true;
        results.classList.add('prompt');
        results.textContent = 'Searching…';
        results.removeAttribute('hidden');
        results.style.display = 'block';
        this._promoProductLinkSetAriaExpanded(true);
        this._promoProductLinkRows = [];
        this._promoProductLinkHighlightIdx = -1;
        this._promoProductLinkSyncPanelPosition();

        try {
            const url = `${this.apiBaseUrl}/admin/products?search=${encodeURIComponent(q)}&limit=12&page=1`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${this.authToken}` },
            });
            if (res.status === 401) {
                this._promoProductLinkHidePanel();
                this.logout();
                return;
            }
            const data = await res.json().catch(() => ({}));
            const rows = Array.isArray(data.products) ? data.products : [];
            results.textContent = '';
            results.innerHTML = '';
            this._promoProductLinkRows = rows;

            if (!rows.length) {
                results.classList.add('prompt');
                results.textContent = 'No matching products. Try another word or SKU.';
            } else {
                results.classList.remove('prompt');
                rows.forEach((p, idx) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'promo-product-link-option';
                    btn.setAttribute('role', 'option');
                    btn.setAttribute('aria-selected', 'false');
                    btn.addEventListener('mousedown', (e) => e.preventDefault());
                    btn.addEventListener('mouseenter', () => {
                        this._promoProductLinkHighlightIdx = idx;
                        this._promoProductLinkApplyHighlight();
                    });
                    const sku = String(p.sku || '').trim();
                    btn.textContent = sku ? `${p.name} (${sku})` : String(p.name || 'Product');
                    btn.addEventListener('click', () => this.applyPromoProductLink(p));
                    results.appendChild(btn);
                });
                this._promoProductLinkHighlightIdx = 0;
                this._promoProductLinkApplyHighlight();
            }
            this._promoProductLinkSyncPanelPosition();
        } catch (_) {
            results.classList.add('prompt');
            results.textContent = 'Search failed. Try again.';
            results.removeAttribute('hidden');
            results.style.display = 'block';
            this._promoProductLinkSyncPanelPosition();
        } finally {
            this._promoProductLinkSearchPending = false;
        }
    }

    _togglePromoCustomColors() {
        const preset = document.getElementById('promo-preset')?.value || '';
        const wrap = document.getElementById('promo-custom-colors');
        if (wrap) wrap.style.display = preset === 'custom' ? 'block' : 'none';
    }

    _buildStoreInfoSettingsPayload(form, { includePromoBanner = false } = {}) {
        const meta = this._storeInfoSettingMeta();
        const rows = Object.keys(meta).map((key) => {
            const input = key === 'store_holiday_schedule' ? null : form.querySelector(`[name="${key}"]`);
            const value = key === 'store_holiday_schedule'
                ? JSON.stringify(this.holidaySchedule || [])
                : (input?.value || '').trim();
            return {
                key_name: key,
                value,
                description: meta[key],
                type: key === 'store_holiday_schedule' ? 'json' : 'string',
            };
        });
        if (includePromoBanner) {
            rows.push({
                key_name: 'store_promo_banner',
                value: JSON.stringify(this._collectPromoBannerFromForm()),
                description: 'Site-wide promotional banner (JSON)',
                type: 'json',
            });
        }
        return rows;
    }

    _buildPromoBannerSettingRow() {
        return {
            key_name: 'store_promo_banner',
            value: JSON.stringify(this._collectPromoBannerFromForm()),
            description: 'Site-wide promotional banner (JSON)',
            type: 'json',
        };
    }

    async revertHolidayToDefaultAt(index) {
        if (!Number.isInteger(index)) return;
        const item = this.holidaySchedule[index];
        if (!item) return;

        const ok = await this.showAdminConfirm({
            title: 'Remove this holiday?',
            message: `This removes "${item.name || 'holiday override'}" from your schedule and saves. If Google is connected, your listing will be updated too.`,
            confirmLabel: 'Remove and save',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;

        const form = document.getElementById('store-info-settings-form');
        if (!form) return;

        const storePhone = form.querySelector('[name="store_phone"]')?.value?.trim() || '';
        if (storePhone && window.HMHERBS_PHONE_US && !HMHERBS_PHONE_US.isValidDisplay(storePhone, false)) {
            this.showToast('Store phone must be formatted as (555) 123-4567', 'error');
            return;
        }

        this.holidaySchedule = this.holidaySchedule.filter((_, i) => i !== index);
        this._renderHolidayScheduleList();

        try {
            const settings = this._buildStoreInfoSettingsPayload(form, { includePromoBanner: false });
            const res = await this.apiRequest('/admin/settings', {
                method: 'PUT',
                body: JSON.stringify({ settings }),
            });
            const syncNote = this._googleSyncResultMessage(res?.googleBusinessSync);
            this.showToast(
                syncNote ? `Holiday removed — ${syncNote}` : 'Holiday removed and hours saved',
                res?.googleBusinessSync?.synced === false ? 'warning' : 'success'
            );
            await this.loadIntegrationLogs();
        } catch (err) {
            this.showToast('Could not remove holiday: ' + (err.message || 'Please try again.'), 'error');
        }
    }

    _applyEmployeeDiscountToForm(map) {
        const form = document.getElementById('employee-discount-settings-form');
        if (!form) return;
        const enabled = String(map.get('employee_discount_enabled') || 'false').toLowerCase();
        const enabledEl = form.querySelector('[name="employee_discount_enabled"]');
        if (enabledEl) enabledEl.checked = enabled === 'true' || enabled === '1';
        const percentEl = form.querySelector('[name="employee_discount_percent"]');
        if (percentEl) {
            const p = Number(map.get('employee_discount_percent'));
            percentEl.value = Number.isFinite(p) ? String(p) : '0';
        }
    }

    _buildEmployeeDiscountSettingsPayload(form) {
        const meta = this._employeeDiscountSettingMeta();
        const enabledEl = form.querySelector('[name="employee_discount_enabled"]');
        let percent = Number(form.querySelector('[name="employee_discount_percent"]')?.value);
        if (!Number.isFinite(percent) || percent < 0) percent = 0;
        if (percent > 100) percent = 100;
        return Object.keys(meta).map((key) => {
            if (key === 'employee_discount_enabled') {
                return {
                    key_name: key,
                    value: enabledEl?.checked ? 'true' : 'false',
                    description: meta[key],
                    type: 'boolean',
                };
            }
            return {
                key_name: key,
                value: String(percent),
                description: meta[key],
                type: 'number',
            };
        });
    }

    async loadEmployeeDiscountSettings() {
        const form = document.getElementById('employee-discount-settings-form');
        if (!form || !this.authToken) return;
        const msg = document.querySelector('[data-employee-discount-save-msg]');
        if (msg) msg.textContent = '';
        try {
            const res = await this.apiRequest('/admin/settings');
            const settings = Array.isArray(res?.settings) ? res.settings : [];
            const map = new Map(settings.map((item) => [item.key_name, item.value || '']));
            this._applyEmployeeDiscountToForm(map);
        } catch (err) {
            if (msg) {
                msg.textContent = 'Failed to load employee discount settings.';
                msg.style.color = 'var(--error)';
            }
            this.showToast('Failed to load employee discount: ' + (err.message || 'error'), 'error');
        }
    }

    async saveEmployeeDiscountSettings(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const form = document.getElementById('employee-discount-settings-form');
        if (!form) return;
        const msg = document.querySelector('[data-employee-discount-save-msg]');
        if (msg) msg.textContent = '';
        const settings = this._buildEmployeeDiscountSettingsPayload(form);
        try {
            await this.apiRequest('/admin/settings', {
                method: 'PUT',
                body: JSON.stringify({ settings }),
            });
            if (msg) {
                msg.textContent = 'Employee discount settings saved.';
                msg.style.color = 'var(--success)';
            }
            this.showToast('Employee discount settings saved', 'success');
        } catch (err) {
            if (msg) {
                msg.textContent = err.message || 'Save failed.';
                msg.style.color = 'var(--error)';
            }
            this.showToast('Could not save employee discount: ' + (err.message || 'error'), 'error');
        }
    }

    async loadStoreInfoSettings() {
        const form = document.getElementById('store-info-settings-form');
        if (!form || !this.authToken) return;
        const msg = document.querySelector('[data-store-info-save-msg]');
        if (msg) msg.textContent = '';
        try {
            const res = await this.apiRequest('/admin/settings');
            const settings = Array.isArray(res?.settings) ? res.settings : [];
            const map = new Map(settings.map((item) => [item.key_name, item.value || '']));
            this._applyEmployeeDiscountToForm(map);
            Object.keys(this._storeInfoSettingMeta()).forEach((key) => {
                const input = form.querySelector(`[name="${key}"]`);
                if (!input || key === 'store_holiday_schedule') return;
                let v = map.get(key) || '';
                if (key === 'store_phone' && window.HMHERBS_PHONE_US && v) {
                    const d = HMHERBS_PHONE_US.digitsOnly(v);
                    v = d ? HMHERBS_PHONE_US.formatDigitsToDisplay(d) : '';
                }
                input.value = v;
            });
            const holidayRaw = map.get('store_holiday_schedule') || '[]';
            try {
                const parsed = JSON.parse(holidayRaw);
                this.holidaySchedule = Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                this.holidaySchedule = [];
            }
            this._renderHolidayTemplateOptions();
            this._toggleCustomHolidayFields();
            this._renderHolidayScheduleList();
            if (this.currentUser?.role !== 'marketing') {
                await this.loadGoogleBusinessStatus();
                await this.loadGoogleCalendarStatus();
                await this.loadIntegrationLogs();
            }
        } catch (err) {
            if (msg) {
                msg.textContent = 'Failed to load store info.';
                msg.style.color = 'var(--error)';
            }
            this.showToast('Failed to load store info: ' + (err.message || 'error'), 'error');
        }
    }

    async saveStoreInfoSettings(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const form = document.getElementById('store-info-settings-form');
        if (!form) return;
        const msg = document.querySelector('[data-store-info-save-msg]');
        if (msg) msg.textContent = '';

        const storePhone = form.querySelector('[name="store_phone"]')?.value?.trim() || '';
        if (storePhone && window.HMHERBS_PHONE_US && !HMHERBS_PHONE_US.isValidDisplay(storePhone, false)) {
            this.showToast('Store phone must be formatted as (555) 123-4567', 'error');
            return;
        }

        const settings = this._buildStoreInfoSettingsPayload(form, { includePromoBanner: false });

        try {
            const res = await this.apiRequest('/admin/settings', {
                method: 'PUT',
                body: JSON.stringify({ settings }),
            });
            const syncNote = this._googleSyncResultMessage(res?.googleBusinessSync);
            const statusLine = syncNote
                ? `Store info and holidays saved. ${syncNote}.`
                : 'Store info and holidays saved.';
            if (msg) {
                msg.textContent = statusLine;
                msg.style.color = res?.googleBusinessSync?.synced === false ? 'var(--warning, #b45309)' : 'var(--success)';
            }
            const toastType = res?.googleBusinessSync?.synced === false ? 'warning' : 'success';
            this.showToast(statusLine, toastType);
            if (res?.googleBusinessSync?.synced) {
                await this.loadIntegrationLogs();
            }
        } catch (err) {
            if (msg) {
                msg.textContent = err.message || 'Save failed';
                msg.style.color = 'var(--error)';
            }
            this.showToast('Store info save failed: ' + (err.message || 'error'), 'error');
        }
    }

    async savePromoBannerSettings() {
        if (!this.authToken) return;
        const msg = document.querySelector('[data-promo-banner-save-msg]');
        if (msg) {
            msg.textContent = '';
            msg.style.color = '';
        }
        const settings = [this._buildPromoBannerSettingRow()];
        try {
            await this.apiRequest('/admin/settings', {
                method: 'PUT',
                body: JSON.stringify({ settings }),
            });
            if (msg) {
                msg.textContent = 'Promo banner saved and published.';
                msg.style.color = 'var(--success)';
            }
            this.showToast('Promo banner saved', 'success');
        } catch (err) {
            if (msg) {
                msg.textContent = err.message || 'Save failed';
                msg.style.color = 'var(--error)';
            }
            this.showToast('Promo banner save failed: ' + (err.message || 'error'), 'error');
        }
    }

    async loadIntegrationLogs() {
        const list = document.getElementById('integration-logs-list');
        if (!list) return;
        list.innerHTML = '<p style="margin:0;color:var(--gray-500);">Loading logs...</p>';
        try {
            const res = await this.apiRequest('/admin/integration-logs?limit=10');
            const logs = Array.isArray(res?.logs) ? res.logs : [];
            if (!logs.length) {
                list.innerHTML = '<p style="margin:0;color:var(--gray-500);">No recent integration logs found.</p>';
                return;
            }
            list.innerHTML = logs.map((item) => {
                const ts = this.escapeHtml(item.timestamp || '');
                const level = this.escapeHtml((item.level || 'info').toUpperCase());
                const msg = this.escapeHtml(item.message || '');
                const color = (item.level || '').toLowerCase() === 'error' ? 'var(--error)' : 'var(--gray-700)';
                return `<div style="padding:0.45rem 0;border-bottom:1px solid var(--gray-200);">
                    <div style="font-size:0.78rem;color:var(--gray-500);">${ts} - ${level}</div>
                    <div style="font-size:0.9rem;color:${color};">${msg}</div>
                </div>`;
            }).join('');
        } catch (err) {
            list.innerHTML = '<p style="margin:0;color:var(--error);">Failed to load integration logs.</p>';
        }
    }

    async clearIntegrationLogs() {
        const ok = await this.showAdminConfirm({
            title: 'Clear Integration Logs?',
            message: 'This removes entries from the Integration Logs panel.',
            confirmLabel: 'Clear Logs',
            cancelLabel: 'Cancel',
            danger: true,
        });
        if (!ok) return;
        try {
            await this.apiRequest('/admin/integration-logs', { method: 'DELETE' });
            this.showToast('Integration logs cleared', 'success');
            await this.loadIntegrationLogs();
        } catch (err) {
            this.showToast('Failed to clear logs: ' + (err.message || 'error'), 'error');
        }
    }

    _googleSyncResultMessage(googleBusinessSync) {
        if (!googleBusinessSync) return '';
        if (googleBusinessSync.synced) {
            return 'Your Google Business listing was updated too.';
        }
        if (googleBusinessSync.skipped && googleBusinessSync.reason === 'not_connected') {
            return 'Saved on your website. Connect Google Business Profile above to update Google too.';
        }
        if (googleBusinessSync.error) {
            return 'Saved on your website, but Google could not be updated. Try “Send hours to Google now” or check your connection above.';
        }
        return '';
    }

    _friendlyGoogleApiError(message) {
        const text = String(message || '').trim();
        if (!text) return 'Something went wrong. Please try again.';
        if (/GBP_CLIENT_ID|GBP_CLIENT_SECRET|GCAL_CLIENT|OAuth|\.env|JWT_SECRET|not configured/i.test(text)) {
            return 'Google sign-in is not available on this site yet.';
        }
        if (/access_denied/i.test(text)) {
            return (
                'Google denied access. If the app is in Testing mode, add hmherbs1@gmail.com under ' +
                'Google Cloud → OAuth consent screen → Test users. Also confirm the redirect URI ' +
                'http://localhost:3001/api/admin/settings/google-calendar/callback is listed on your OAuth client.'
            );
        }
        if (/Cloud Console|My Business Account Management|Business Business Information|quota|QPM/i.test(text)) {
            return '';
        }
        return text;
    }

    _applyGoogleStatusPanelStyle(panel, state) {
        if (!panel) return;
        const styles = {
            notReady: { border: '1px solid #f59e0b', background: '#fffbeb' },
            ready: { border: '1px solid var(--gray-200)', background: 'var(--gray-50)' },
            connected: { border: '1px solid #16a34a', background: '#f0fdf4' },
        };
        const s = styles[state] || styles.ready;
        panel.style.border = s.border;
        panel.style.background = s.background;
    }

    _renderGoogleBusinessStatus(status = {}) {
        const statusText = document.getElementById('gbp-status-text');
        const statusPanel = document.getElementById('gbp-status-panel');
        const connectBtn = document.getElementById('gbp-connect-btn');
        const disconnectBtn = document.getElementById('gbp-disconnect-btn');
        const saveLocBtn = document.getElementById('gbp-save-location-btn');
        const locationWrap = document.getElementById('gbp-location-wrap');
        const syncBtn = document.getElementById('store-hours-sync-google-btn');
        const locationSelect = document.getElementById('gbp-location-select');

        if (!status.clientConfigured) {
            this._applyGoogleStatusPanelStyle(statusPanel, 'notReady');
            if (statusText) {
                statusText.textContent =
                    'Google sign-in is not available on this site yet. When it is turned on, you will use the Connect button below. After you sign in, this box will show that you are connected.';
            }
            if (connectBtn) connectBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.style.display = 'none';
            if (saveLocBtn) saveLocBtn.style.display = 'none';
            if (locationWrap) locationWrap.style.display = 'none';
            if (syncBtn) syncBtn.disabled = true;
            return;
        }

        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.style.display = status.connected ? 'none' : 'inline-flex';
        }
        if (disconnectBtn) {
            disconnectBtn.style.display = status.connected ? 'inline-flex' : 'none';
        }

        if (status.connected) {
            this._applyGoogleStatusPanelStyle(statusPanel, 'connected');
            const email = status.connectedEmail ? ` Signed in as ${status.connectedEmail}.` : '';
            const syncPending = Boolean(status.apiAccessPending || this.gbpGoogleSyncUnavailable);
            if (statusText) {
                if (syncPending) {
                    statusText.textContent =
                        `Connected to Google.${email} Map hour sync is not set up yet; hours you save here still update your website.`;
                } else {
                    const loc = status.locationName
                        ? ' Your store listing on Google is selected.'
                        : ' Choose your store below.';
                    statusText.textContent = `Connected — your hours can update on Google when you save.${email}${loc}`;
                }
            }
            if (locationWrap) locationWrap.style.display = 'block';
            if (locationSelect) {
                locationSelect.disabled = syncPending;
                if (syncPending) {
                    locationSelect.innerHTML =
                        '<option value="">Store list will appear after map sync is enabled</option>';
                }
            }
            if (saveLocBtn) saveLocBtn.style.display = syncPending ? 'none' : 'inline-flex';
        } else {
            this._applyGoogleStatusPanelStyle(statusPanel, 'ready');
            if (statusText) {
                statusText.textContent =
                    'Ready to connect. Click “Connect Google Account” below and sign in with the Google account that manages your store.';
            }
            if (locationWrap) locationWrap.style.display = 'none';
            if (saveLocBtn) saveLocBtn.style.display = 'none';
        }

        if (syncBtn) syncBtn.disabled = !status.readyToSync;
    }

    async loadGoogleBusinessStatus() {
        if (!this.authToken) return;
        try {
            const status = await this.apiRequest('/admin/settings/google-business/status');
            this.gbpStatus = status;
            this.gbpGoogleSyncUnavailable = Boolean(status.apiAccessPending);
            this._renderGoogleBusinessStatus(status);
            if (status.connected && !status.apiAccessPending) {
                await this.loadGoogleBusinessLocations(status.locationName || '');
            }
        } catch (err) {
            this._renderGoogleBusinessStatus({ clientConfigured: false, connected: false, readyToSync: false });
            this.showToast(
                this._friendlyGoogleApiError(err.message) || 'Could not load Google connection status.',
                'error'
            );
        }
    }

    async loadGoogleBusinessLocations(selectedName = '') {
        const select = document.getElementById('gbp-location-select');
        if (!select) return;
        try {
            const res = await this.apiRequest('/admin/settings/google-business/locations');
            const locations = Array.isArray(res?.locations) ? res.locations : [];
            if (!locations.length) {
                select.innerHTML = '<option value="">No store found on this Google account</option>';
                select.disabled = true;
                return;
            }
            select.disabled = false;
            select.innerHTML =
                '<option value="">Select location…</option>' +
                locations
                    .map((loc) => {
                        const label = `${loc.title || loc.name}${loc.address ? ` — ${loc.address}` : ''}`;
                        return `<option value="${this.escapeHtml(loc.name)}">${this.escapeHtml(label)}</option>`;
                    })
                    .join('');
            if (selectedName) select.value = selectedName;
            this.gbpGoogleSyncUnavailable = false;
            if (this.gbpStatus) {
                this.gbpStatus.apiAccessPending = false;
                this._renderGoogleBusinessStatus(this.gbpStatus);
            }
        } catch (err) {
            this.gbpGoogleSyncUnavailable = true;
            if (this.gbpStatus) {
                this.gbpStatus.apiAccessPending = true;
                this._renderGoogleBusinessStatus(this.gbpStatus);
            }
        }
    }

    async connectGoogleBusiness() {
        try {
            const res = await this.apiRequest('/admin/settings/google-business/connect');
            if (!res?.authUrl) {
                this.showToast('Could not start Google connection', 'error');
                return;
            }
            window.location.href = res.authUrl;
        } catch (err) {
            this.showToast(this._friendlyGoogleApiError(err.message), 'error');
        }
    }

    async disconnectGoogleBusiness() {
        const ok = await this.showAdminConfirm({
            title: 'Disconnect Google?',
            message: 'Your hours will no longer update on Google automatically until you connect again.',
            confirmLabel: 'Disconnect',
            cancelLabel: 'Cancel',
            danger: true,
        });
        if (!ok) return;
        try {
            await this.apiRequest('/admin/settings/google-business/disconnect', { method: 'POST' });
            this.showToast('Google Business Profile disconnected', 'success');
            await this.loadGoogleBusinessStatus();
        } catch (err) {
            this.showToast('Disconnect failed: ' + (err.message || 'error'), 'error');
        }
    }

    async saveGoogleBusinessLocation() {
        const select = document.getElementById('gbp-location-select');
        const locationName = (select?.value || '').trim();
        if (!locationName) {
            this.showToast('Select or enter a Google location ID', 'warning');
            return;
        }
        try {
            await this.apiRequest('/admin/settings/google-business/location', {
                method: 'PUT',
                body: JSON.stringify({ locationName }),
            });
            this.showToast('Google location saved', 'success');
            await this.loadGoogleBusinessStatus();
        } catch (err) {
            this.showToast('Save location failed: ' + (err.message || 'error'), 'error');
        }
    }

    handleGoogleBusinessOAuthReturn() {
        const params = new URLSearchParams(window.location.search);
        const gbp = params.get('gbp');
        if (!gbp) return;
        const msg = params.get('msg');
        if (gbp === 'connected') {
            this.showToast('Google Business Profile connected', 'success');
        } else if (gbp === 'error') {
            this.showToast(
                'Google connection failed: ' + (this._friendlyGoogleApiError(msg) || msg || 'unknown error'),
                'error'
            );
        }
        const clean = new URL(window.location.href);
        clean.searchParams.delete('gbp');
        if (!params.get('gcal')) clean.searchParams.delete('msg');
        window.history.replaceState({}, '', clean.pathname + clean.hash + (clean.search || ''));
    }

    _setGcalActionMsg(text, isError = false) {
        const msg = document.querySelector('[data-gcal-action-msg]');
        if (!msg) return;
        msg.textContent = text || '';
        msg.style.color = isError ? 'var(--error)' : text ? 'var(--success)' : '';
    }

    _renderGoogleCalendarStatus(status = {}) {
        const statusText = document.getElementById('gcal-status-text');
        const statusPanel = document.getElementById('gcal-status-panel');
        const connectBtn = document.getElementById('gcal-connect-btn');
        const disconnectBtn = document.getElementById('gcal-disconnect-btn');
        const saveBtn = document.getElementById('gcal-save-calendar-btn');
        const calendarWrap = document.getElementById('gcal-calendar-wrap');
        const manualInput = document.getElementById('gcal-calendar-manual');

        if (!status.clientConfigured) {
            this._applyGoogleStatusPanelStyle(statusPanel, 'notReady');
            if (statusText) {
                statusText.textContent =
                    'Google Calendar sign-in is not available on this site yet. When it is turned on, you will use the Connect button below. After you sign in, this box will show that you are connected.';
            }
            if (connectBtn) connectBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'none';
            if (calendarWrap) calendarWrap.style.display = 'none';
            return;
        }

        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.style.display = status.connected ? 'none' : 'inline-flex';
        }
        if (disconnectBtn) {
            disconnectBtn.style.display = status.connected ? 'inline-flex' : 'none';
        }

        if (status.connected) {
            this._applyGoogleStatusPanelStyle(statusPanel, 'connected');
            const email = status.connectedEmail ? ` Signed in as ${status.connectedEmail}.` : '';
            const cal =
                status.calendarId && status.calendarId !== 'primary'
                    ? ' EDSA bookings will use the calendar you selected below.'
                    : status.calendarId === 'primary'
                      ? ' EDSA bookings will go to your main Google calendar.'
                      : ' Choose which calendar should receive EDSA bookings below.';
            if (statusText) {
                statusText.textContent = `Connected — EDSA appointments will sync to your calendar.${email}${cal}`;
            }
            if (calendarWrap) calendarWrap.style.display = 'block';
            if (saveBtn) saveBtn.style.display = 'inline-flex';
            if (manualInput && status.calendarId) manualInput.value = status.calendarId;
        } else {
            this._applyGoogleStatusPanelStyle(statusPanel, 'ready');
            if (statusText) {
                statusText.textContent =
                    'Ready to connect. Click “Connect Google Calendar” below and sign in with the Google account you use for appointments.';
            }
            if (calendarWrap) calendarWrap.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'none';
        }
    }

    async loadGoogleCalendarStatus() {
        if (!this.authToken) return;
        try {
            const status = await this.apiRequest('/admin/settings/google-calendar/status');
            this.gcalStatus = status;
            this._renderGoogleCalendarStatus(status);
            if (status.connected) {
                await this.loadGoogleCalendarList(status.calendarId || '');
            }
        } catch (err) {
            this._renderGoogleCalendarStatus({ clientConfigured: false, connected: false });
            this._setGcalActionMsg(this._friendlyGoogleApiError(err.message) || 'Could not load calendar connection status.', true);
        }
    }

    async loadGoogleCalendarList(selectedId = '') {
        const select = document.getElementById('gcal-calendar-select');
        if (!select) return;
        try {
            const res = await this.apiRequest('/admin/settings/google-calendar/calendars');
            const calendars = Array.isArray(res?.calendars) ? res.calendars : [];
            if (!calendars.length) {
                select.innerHTML = '<option value="">No calendars found — enter your calendar below</option>';
                return;
            }
            select.innerHTML =
                '<option value="">Select calendar…</option>' +
                calendars
                    .map((cal) => {
                        const label = `${cal.summary || cal.id}${cal.primary ? ' (main calendar)' : ''}`;
                        return `<option value="${this.escapeHtml(cal.id)}">${this.escapeHtml(label)}</option>`;
                    })
                    .join('');
            if (selectedId) select.value = selectedId;
        } catch (_) {
            select.innerHTML = '<option value="">Could not load calendars</option>';
        }
    }

    async connectGoogleCalendar() {
        try {
            this._setGcalActionMsg('');
            const res = await this.apiRequest('/admin/settings/google-calendar/connect');
            if (!res?.authUrl) {
                this.showToast('Could not start Google Calendar connection', 'error');
                return;
            }
            window.location.href = res.authUrl;
        } catch (err) {
            this.showToast(this._friendlyGoogleApiError(err.message), 'error');
        }
    }

    async disconnectGoogleCalendar() {
        const ok = await this.showAdminConfirm({
            title: 'Disconnect Google Calendar?',
            message: 'New EDSA bookings will no longer be added to Google Calendar until you connect again.',
            confirmLabel: 'Disconnect',
            cancelLabel: 'Cancel',
            danger: true,
        });
        if (!ok) return;
        try {
            await this.apiRequest('/admin/settings/google-calendar/disconnect', { method: 'POST' });
            this.showToast('Google Calendar disconnected', 'success');
            await this.loadGoogleCalendarStatus();
            this._setGcalActionMsg('');
        } catch (err) {
            this.showToast('Disconnect failed: ' + (err.message || 'error'), 'error');
        }
    }

    async saveGoogleCalendarSelection() {
        const select = document.getElementById('gcal-calendar-select');
        const manual = document.getElementById('gcal-calendar-manual');
        const calendarId = (select?.value || manual?.value || '').trim();
        if (!calendarId) {
            this.showToast('Select or enter a calendar ID', 'warning');
            return;
        }
        try {
            await this.apiRequest('/admin/settings/google-calendar/calendar', {
                method: 'PUT',
                body: JSON.stringify({ calendarId }),
            });
            this.showToast('EDSA calendar saved', 'success');
            this._setGcalActionMsg('Calendar saved for EDSA bookings.');
            await this.loadGoogleCalendarStatus();
        } catch (err) {
            this.showToast('Save calendar failed: ' + (err.message || 'error'), 'error');
        }
    }

    handleGoogleCalendarOAuthReturn() {
        const params = new URLSearchParams(window.location.search);
        const gcal = params.get('gcal');
        if (!gcal) return;
        const msg = params.get('msg');
        if (gcal === 'connected') {
            this.showToast('Google Calendar connected for EDSA', 'success');
            this._setGcalActionMsg('You are signed in. Choose which calendar should receive EDSA bookings, then click Save Calendar.');
            this.loadGoogleCalendarStatus();
        } else if (gcal === 'error') {
            this.showToast('Google Calendar connection failed: ' + (msg || 'unknown error'), 'error');
            this._setGcalActionMsg(msg || 'Connection failed', true);
        }
        const clean = new URL(window.location.href);
        clean.searchParams.delete('gcal');
        if (!params.get('gbp')) clean.searchParams.delete('msg');
        window.history.replaceState({}, '', clean.pathname + clean.hash + (clean.search || ''));
    }

    async syncStoreHoursToGoogleBusiness() {
        const btn = document.getElementById('store-hours-sync-google-btn');
        const originalText = btn ? btn.textContent : '';
        if (!this.gbpStatus?.readyToSync) {
            this.showToast('Connect Google and select a business location first', 'warning');
            return;
        }
        const ok = await this.showAdminConfirm({
            title: 'Update hours on Google?',
            message:
                'This sends your current weekday, Saturday, Sunday, and holiday hours to your Google Business listing.',
            confirmLabel: 'Push Now',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;

        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Syncing...';
            }
            const res = await this.apiRequest('/admin/settings/google-business/sync-hours', {
                method: 'POST',
            });
            const regular = Number(res?.syncedRegularPeriods || 0);
            const special = Number(res?.syncedSpecialPeriods || res?.syncedPeriods || 0);
            this.showToast('Your hours were sent to Google.', 'success');
            await this.loadIntegrationLogs();
        } catch (err) {
            this.showToast(this._friendlyGoogleApiError(err.message) || 'Could not update Google. Check your connection above.', 'error');
        } finally {
            if (btn) {
                btn.disabled = !this.gbpStatus?.readyToSync;
                btn.textContent = originalText || 'Send hours to Google now';
            }
        }
    }

    async loadPromoBannerSettings() {
        if (!this.authToken || !document.getElementById('promo-banner-save-btn')) return;
        const msg = document.querySelector('[data-promo-banner-save-msg]');
        if (msg) msg.textContent = '';
        try {
            const res = await this.apiRequest('/admin/settings');
            const settings = Array.isArray(res?.settings) ? res.settings : [];
            const map = new Map(settings.map((item) => [item.key_name, item.value || '']));
            this._applyPromoBannerToForm(map.get('store_promo_banner') || '{}');
        } catch (err) {
            if (msg) {
                msg.textContent = 'Failed to load promo banner settings.';
                msg.style.color = 'var(--error)';
            }
            console.warn('loadPromoBannerSettings', err);
        }
    }

    async loadMarketingHub() {
        if (!this.authToken) return;
        try {
            const res = await this.apiRequest('/admin/marketing-settings');
            const signup = document.getElementById('marketing-signup-url');
            const headline = document.getElementById('marketing-newsletter-headline');
            const eff = res && res.effective ? res.effective : {};
            if (signup) signup.value = eff.signupLandingUrl || '';
            if (headline) headline.value = eff.headline || '';
            await this.loadPromoBannerSettings();
            await this.loadWebPromotionsTable();
        } catch (e) {
            console.error('loadMarketingHub', e);
        }
    }

    async saveMarketingHub(ev) {
        if (ev) ev.preventDefault();
        const signup = document.getElementById('marketing-signup-url');
        const headline = document.getElementById('marketing-newsletter-headline');
        try {
            await this.apiRequest('/admin/marketing-settings', {
                method: 'PUT',
                body: JSON.stringify({
                    signupLandingUrl: (signup?.value || '').trim(),
                    headline: (headline?.value || '').trim()
                })
            });
            this.showToast('Marketing settings saved', 'success');
            await this.loadMarketingHub();
        } catch (err) {
            this.showToast('Save failed: ' + (err.message || 'error'), 'error');
        }
    }

    _personnelRoleBadge(role) {
        const map = {
            developer: 'badge-role-admin',
            admin: 'badge-role-admin',
            manager: 'badge-role-manager',
            assistant_manager: 'badge-role-assistant',
            marketing: 'badge-role-marketing',
        };
        const cls = map[role] || 'badge-info';
        const label =
            {
                developer: 'Developer',
                admin: 'Admin',
                manager: 'Manager',
                assistant_manager: 'Assistant Manager',
                marketing: 'Marketing',
            }[role] || role;
        return `<span class="badge ${cls}" style="display:inline-block;padding:0.2rem 0.55rem;border-radius:9999px;font-size:0.75rem;font-weight:600;">${this._escapeHtml(label)}</span>`;
    }

    _formatPersonnelDate(d) {
        if (!d) return '—';
        try {
            return new Date(d).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
            });
        } catch {
            return '—';
        }
    }

    async loadAdminTeam() {
        const list = document.getElementById('admin-team-list');
        const roleSelect = document.getElementById('team-create-role');
        if (!list || !this.isFullAdmin) return;

        list.innerHTML =
            '<div class="loading" style="padding:2rem;text-align:center;color:var(--gray-500);"><div class="spinner" style="margin:0 auto 0.75rem;"></div>Loading personnel…</div>';

        try {
            const res = await this.apiRequest('/admin/team');
            const users = Array.isArray(res?.users) ? res.users : [];
            const roles = Array.isArray(res?.roles) ? res.roles : [];
            this._teamRoleOptions = roles;

            if (roleSelect && roleSelect.options.length === 0) {
                roles.forEach((r) => {
                    const opt = document.createElement('option');
                    opt.value = r.id;
                    opt.textContent = r.label || r.id;
                    roleSelect.appendChild(opt);
                });
                const marketingOpt = roleSelect.querySelector('option[value="marketing"]');
                if (marketingOpt) marketingOpt.selected = true;
            }

            if (!users.length) {
                list.innerHTML =
                    '<div style="text-align:center;padding:2.5rem 1rem;color:var(--gray-500);"><i class="fas fa-users" style="font-size:2.5rem;opacity:0.25;display:block;margin-bottom:0.75rem;"></i><p style="margin:0;">No personnel accounts yet. Add someone below.</p></div>';
                return;
            }

            const myId = this.currentUser?.id;
            const roleOptions = (currentRole) =>
                roles
                    .map((r) => {
                        const sel = r.id === currentRole ? ' selected' : '';
                        return `<option value="${this._escapeHtml(r.id)}"${sel}>${this._escapeHtml(r.label || r.id)}</option>`;
                    })
                    .join('');

            const rows = users
                .map((u) => {
                    const isSelf = myId != null && Number(u.id) === Number(myId);
                    const nextRole =
                        u.role === 'admin'
                            ? null
                            : u.role === 'manager'
                              ? 'admin'
                              : u.role === 'assistant_manager'
                                ? 'manager'
                                : u.role === 'marketing'
                                  ? 'assistant_manager'
                                  : null;
                    const nextLabel =
                        nextRole === 'admin'
                            ? 'Admin'
                            : nextRole === 'manager'
                              ? 'Manager'
                              : nextRole === 'assistant_manager'
                                ? 'Assistant Manager'
                                : '';
                    const promoteBtn =
                        nextRole && !isSelf
                            ? `<button type="button" class="btn btn-sm btn-secondary" title="Promote to ${nextLabel}" data-team-action="promote" data-team-id="${u.id}" data-team-role="${nextRole}"><i class="fas fa-arrow-up" aria-hidden="true"></i> Promote</button>`
                            : '';
                    const deleteBtn = isSelf
                        ? ''
                        : `<button type="button" class="btn btn-sm btn-danger" title="Remove account" data-team-action="delete" data-team-id="${u.id}" data-team-email="${this._escapeHtml(u.email)}"><i class="fas fa-trash" aria-hidden="true"></i></button>`;
                    return `<tr data-team-row="${u.id}">
                        <td>
                            <strong>${this._escapeHtml(u.email)}</strong>
                            ${isSelf ? '<span class="personnel-you-tag">You</span>' : ''}
                        </td>
                        <td>${this._escapeHtml(u.firstName)} ${this._escapeHtml(u.lastName)}</td>
                        <td>${this._personnelRoleBadge(u.role)}</td>
                        <td>${u.isActive ? '<span class="badge badge-success">Active</span>' : '<span class="badge" style="background:#f3f4f6;color:#6b7280;">Inactive</span>'}</td>
                        <td style="font-size:0.85rem;color:var(--gray-600);white-space:nowrap;">${this._escapeHtml(this._formatPersonnelDate(u.lastLogin))}</td>
                        <td>
                            <div class="personnel-actions">
                                <select class="form-input personnel-role-select" id="team-role-${u.id}" data-team-id="${u.id}" aria-label="Role for ${this._escapeHtml(u.email)}">${roleOptions(u.role)}</select>
                                <button type="button" class="btn btn-sm btn-primary" data-team-action="save-role" data-team-id="${u.id}">Save</button>
                                ${promoteBtn}
                                ${deleteBtn}
                            </div>
                        </td>
                    </tr>`;
                })
                .join('');

            list.innerHTML = `
                <div class="personnel-table-wrap table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Last login</th>
                                <th style="text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;

            if (!this._teamListClickBound) {
                this._teamListClickBound = true;
                list.addEventListener('click', (ev) => this._handleTeamListClick(ev));
            }
        } catch (err) {
            list.innerHTML = `<div style="padding:1.5rem;color:var(--error);text-align:center;">Could not load personnel: ${this._escapeHtml(err.message || 'error')}</div>`;
        }
    }

    async _handleTeamListClick(ev) {
        const btn = ev.target.closest('[data-team-action]');
        if (!btn) return;
        const id = Number(btn.dataset.teamId);
        if (!Number.isInteger(id) || id <= 0) return;

        if (btn.dataset.teamAction === 'save-role') {
            const sel = document.getElementById(`team-role-${id}`);
            if (!sel) return;
            await this.updateTeamMemberRole(id, sel.value);
            return;
        }
        if (btn.dataset.teamAction === 'promote') {
            const role = btn.dataset.teamRole;
            if (role) await this.updateTeamMemberRole(id, role, { promoted: true });
            return;
        }
        if (btn.dataset.teamAction === 'delete') {
            await this.deleteTeamMember(id, btn.dataset.teamEmail || '');
        }
    }

    async updateTeamMemberRole(id, role, { promoted = false } = {}) {
        try {
            await this.apiRequest(`/admin/team/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ role }),
            });
            this.showToast(promoted ? 'Role promoted' : 'Role updated', 'success');
            await this.loadAdminTeam();
        } catch (err) {
            this.showToast(err.message || 'Update failed', 'error');
        }
    }

    async deleteTeamMember(id, email) {
        const ok = await this.showAdminConfirm({
            title: 'Remove team member?',
            message: `This permanently removes the login for ${email || 'this user'}. They will no longer access the admin panel.`,
            confirmLabel: 'Remove',
            cancelLabel: 'Cancel',
            danger: true,
        });
        if (!ok) return;
        try {
            await this.apiRequest(`/admin/team/${id}`, { method: 'DELETE' });
            this.showToast('Team member removed', 'success');
            await this.loadAdminTeam();
        } catch (err) {
            this.showToast(err.message || 'Delete failed', 'error');
        }
    }

    async handleCreateTeamMember(ev) {
        if (ev) ev.preventDefault();
        const form = document.getElementById('admin-team-create-form');
        const msg = document.getElementById('admin-team-form-msg');
        if (!form || !this.isFullAdmin) return;
        const email = form.querySelector('#team-create-email')?.value?.trim();
        const firstName = form.querySelector('#team-create-first')?.value?.trim();
        const lastName = form.querySelector('#team-create-last')?.value?.trim();
        const role = form.querySelector('#team-create-role')?.value;
        const password = form.querySelector('#team-create-password')?.value;
        if (msg) msg.textContent = '';
        try {
            await this.apiRequest('/admin/team', {
                method: 'POST',
                body: JSON.stringify({ email, firstName, lastName, role, password }),
            });
            if (msg) {
                msg.textContent = 'Account created. Send them the email and password securely.';
                msg.style.color = 'var(--success)';
            }
            form.reset();
            const marketingOpt = form.querySelector('#team-create-role option[value="marketing"]');
            if (marketingOpt) marketingOpt.selected = true;
            await this.loadAdminTeam();
        } catch (err) {
            if (msg) {
                msg.textContent = err.message || 'Create failed';
                msg.style.color = 'var(--error)';
            }
        }
    }

    _escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _promoRulesFromEditor() {
        const scope = document.getElementById('promo-form-scope')?.value || 'all';
        const strat = document.getElementById('promo-form-product-promo-strategy')?.value || 'trigger_reward';
        const parseIds = (s) =>
            String(s || '')
                .split(/[\s,]+/)
                .map((x) => Number(String(x).trim()))
                .filter((n) => Number.isFinite(n) && n > 0);

        const effects = [];
        const classicMerchAllowed = !(scope === 'products' && strat === 'trigger_reward');

        if (classicMerchAllowed) {
            const pct = Number(document.getElementById('promo-form-pct')?.value);
            if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
                effects.push({ type: 'percent_off', percent: pct });
            }
            const fixed = Number(document.getElementById('promo-form-fixed')?.value);
            if (Number.isFinite(fixed) && fixed > 0) {
                effects.push({ type: 'fixed_off', amount: fixed });
            }
            const buyQty = Number(document.getElementById('promo-form-buy-qty')?.value);
            const getQty = Number(document.getElementById('promo-form-get-qty')?.value);
            if (Number.isFinite(buyQty) && Number.isFinite(getQty) && buyQty >= 1 && getQty >= 1) {
                const buySkus = this._promoProdPickerIds('buy');
                const getSkus = this._promoProdPickerIds('get');
                const eff = { type: 'buy_get', buyQty, getQty };
                if (buySkus.length > 0 && getSkus.length > 0) {
                    eff.buyProductIds = buySkus;
                    eff.getProductIds = getSkus;
                }
                const rw = (document.getElementById('promo-form-bogo-reward-type')?.value || 'free').toLowerCase();
                const getPct = Number(document.getElementById('promo-form-bogo-get-pct')?.value);
                const getFixed = Number(document.getElementById('promo-form-bogo-get-fixed')?.value);
                if (rw === 'percent_off') {
                    eff.getRewardType = 'percent_off';
                    if (Number.isFinite(getPct) && getPct > 0) eff.getPercent = Math.min(100, getPct);
                } else if (rw === 'fixed_off') {
                    eff.getRewardType = 'fixed_off';
                    if (Number.isFinite(getFixed) && getFixed > 0) eff.getFixedAmount = getFixed;
                } else {
                    eff.getRewardType = 'free';
                }
                effects.push(eff);
            }
        }
        if (document.getElementById('promo-form-free-shipping')?.checked) {
            effects.push({ type: 'free_standard_shipping' });
        }

        this._promoPickerSyncProdHiddenField();
        this._promoPickerSyncCategoryHiddenField();
        let triggerReward = null;
        let productIdsMerged =
            scope === 'products'
                ? (() => {
                      const scopeIds = this._promoProdPickerIds('scope');
                      const buyIds = this._promoProdPickerIds('buy');
                      const getIds = this._promoProdPickerIds('get');
                      return [...new Set([...scopeIds, ...buyIds, ...getIds])].sort((a, b) => a - b);
                  })()
                : [];

        if (scope === 'products' && strat === 'trigger_reward') {
            const trigIds = this._promoProdPickerIds('trigger');
            const minTriggerQty = Math.floor(Number(document.getElementById('promo-form-trigger-min-qty')?.value));
            const rewardRules = [];
            document.querySelectorAll('[data-reward-rule-id]').forEach((row) => {
                const rid = row.getAttribute('data-reward-rule-id');
                if (!rid) return;
                const kind = `reward-${rid}`;
                const targetProductIds = this._promoProdPickerIds(kind);
                const discSel = document.getElementById(`promo-reward-disc-${rid}`);
                const valInp = document.getElementById(`promo-reward-val-${rid}`);
                const dt = String(discSel?.value || 'percent_off').toLowerCase();
                const valRaw = valInp?.value;
                const val = Number(valRaw);
                if (!targetProductIds.length) return;
                const entry = { targetProductIds: [...targetProductIds].sort((a, b) => a - b), discountType: dt };
                if (dt === 'percent_off') {
                    if (!Number.isFinite(val) || val <= 0 || val > 100) return;
                    entry.percent = val;
                    rewardRules.push(entry);
                } else if (dt === 'fixed_off') {
                    if (!Number.isFinite(val) || val <= 0) return;
                    entry.amount = val;
                    rewardRules.push(entry);
                } else if (dt === 'set_price') {
                    if (!Number.isFinite(val) || val < 0) return;
                    entry.setPrice = val;
                    rewardRules.push(entry);
                }
            });
            const idPool = new Set(trigIds);
            rewardRules.forEach((rr) => rr.targetProductIds.forEach((id) => idPool.add(id)));
            productIdsMerged = [...idPool].sort((a, b) => a - b);
            if (trigIds.length > 0 && Number.isFinite(minTriggerQty) && minTriggerQty >= 1 && rewardRules.length > 0) {
                triggerReward = {
                    triggerProductIds: [...trigIds].sort((a, b) => a - b),
                    minTriggerQty,
                    rewardRules
                };
            }
        }

        return {
            scope,
            productIds: productIdsMerged,
            categoryIds:
                scope === 'categories' ? parseIds(document.getElementById('promo-form-category-ids')?.value) : [],
            effects,
            triggerReward: triggerReward || null
        };
    }

    _togglePromoScopeHints() {
        const scope = document.getElementById('promo-form-scope')?.value || 'all';
        const pq = document.getElementById('promo-scope-products');
        const cq = document.getElementById('promo-scope-categories');
        if (pq) pq.style.display = scope === 'products' ? 'block' : 'none';
        if (cq) cq.style.display = scope === 'categories' ? 'block' : 'none';
        if (scope === 'categories') {
            void this._promoHydrateCategoryDropdown();
        }
        this._togglePromoProductStrategyUi();
        this._togglePromoBogoPickersVisibility();
    }

    _promoAllProdSearchKinds() {
        const rewardKeys = Object.keys(this._promoPickerProducts || {}).filter((k) =>
            String(k).startsWith('reward-')
        );
        return [...new Set(['scope', 'buy', 'get', 'trigger', ...rewardKeys])];
    }

    _togglePromoProductStrategyUi() {
        const scope = document.getElementById('promo-form-scope')?.value || '';
        const stratSel = document.getElementById('promo-form-product-promo-strategy');
        const trPanel = document.getElementById('promo-panel-trigger-reward');
        const clsPanel = document.getElementById('promo-panel-classic-products');
        const classicMerch = document.getElementById('promo-block-classic-merch-effects');
        if (!stratSel || !trPanel || !clsPanel || !classicMerch) return;
        const strat = stratSel.value || 'trigger_reward';
        const isProd = scope === 'products';
        const grp = stratSel.closest('.form-group');
        if (grp) grp.style.display = isProd ? 'block' : 'none';
        if (!isProd) {
            trPanel.style.display = 'none';
            clsPanel.style.display = 'none';
            classicMerch.style.display = '';
            return;
        }
        if (strat === 'trigger_reward') {
            trPanel.style.display = 'block';
            clsPanel.style.display = 'none';
            classicMerch.style.display = 'none';
            const list = document.getElementById('promo-reward-rules-list');
            if (list && !list.querySelector('[data-reward-rule-id]')) {
                this.initPromoProductPickers();
                this._promoAddRewardRuleRow();
            }
        } else {
            trPanel.style.display = 'none';
            clsPanel.style.display = 'block';
            classicMerch.style.display = '';
        }
        this._togglePromoBogoPickersVisibility();
    }

    _promoClearRewardRuleUi() {
        const list = document.getElementById('promo-reward-rules-list');
        if (list) list.innerHTML = '';
        for (const k of Object.keys(this._promoPickerProducts || {})) {
            if (k.startsWith('reward-')) delete this._promoPickerProducts[k];
        }
        this._promoRewardRuleSeq = 0;
    }

    _toggleRewardRuleDiscountFields(ruleId) {
        const ds = document.getElementById(`promo-reward-disc-${ruleId}`);
        const lbl = document.getElementById(`promo-reward-val-lbl-${ruleId}`);
        const inp = document.getElementById(`promo-reward-val-${ruleId}`);
        if (!ds || !lbl || !inp) return;
        const t = ds.value;
        if (t === 'percent_off') {
            lbl.textContent = 'Percent (%)';
            inp.placeholder = 'e.g. 25';
        } else if (t === 'fixed_off') {
            lbl.textContent = 'Flat $ off order line';
            inp.placeholder = 'e.g. 5';
        } else {
            lbl.textContent = 'Set price per unit ($)';
            inp.placeholder = '0 = free';
        }
    }

    _promoRemoveRewardRuleRow(id) {
        const kind = `reward-${id}`;
        delete this._promoPickerProducts[kind];
        document.querySelector(`[data-reward-rule-id="${id}"]`)?.remove();
        this._promoPickerSyncProdHiddenField();
    }

    _promoAddRewardRuleRow(prefillRow) {
        this.initPromoProductPickers();
        const list = document.getElementById('promo-reward-rules-list');
        if (!list) return;
        const id = ++this._promoRewardRuleSeq;
        const kind = `reward-${id}`;
        this._promoPickerProducts[kind] = new Map();
        const wrap = document.createElement('div');
        wrap.className = 'promo-reward-rule-row';
        wrap.setAttribute('data-reward-rule-id', String(id));
        wrap.style.cssText =
            'padding:0.75rem;border:1px solid var(--gray-200);border-radius:var(--border-radius);background:#fff';
        wrap.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
                <strong>Reward SKU group #${id}</strong>
                <button type="button" class="btn btn-secondary btn-sm" data-remove-reward-rule="${id}">Remove group</button>
            </div>
            <label for="promo-reward-q-${id}">Target SKUs</label>
            <div id="promo-reward-chips-${id}" class="promo-prod-chips" aria-live="polite"></div>
            <div class="promo-prod-search-wrap">
                <input type="text" class="form-input" id="promo-reward-q-${id}" autocomplete="off" placeholder="Products that receive this discount…" data-reward-rule-search="${id}">
                <div id="promo-reward-res-${id}" class="promo-prod-results-local promo-product-link-results-panel" role="listbox" hidden></div>
            </div>
            <div class="form-row" style="margin-top:0.65rem;">
                <div class="form-group">
                    <label for="promo-reward-disc-${id}">Discount type</label>
                    <select class="form-input" id="promo-reward-disc-${id}" data-reward-disc-type="${id}">
                        <option value="percent_off">Percent off</option>
                        <option value="fixed_off">Flat $ off order line</option>
                        <option value="set_price">Set price (per unit)</option>
                    </select>
                </div>
                <div class="form-group" style="flex:1;">
                    <label for="promo-reward-val-${id}" id="promo-reward-val-lbl-${id}">Value</label>
                    <input class="form-input" id="promo-reward-val-${id}" type="number" step="any" data-reward-val="${id}">
                </div>
            </div>
            <small class="form-help">Each group is evaluated on its own. Set price lowers every matching unit toward the amount you enter (use 0 with “Set price” for a free accessory).</small>
        `;
        list.appendChild(wrap);
        const rm = wrap.querySelector(`[data-remove-reward-rule="${id}"]`);
        rm?.addEventListener('click', () => this._promoRemoveRewardRuleRow(id));
        const qs = wrap.querySelector(`[data-reward-rule-search]`);

        qs?.addEventListener('input', () => this._promoScheduleProdSearch(kind));

        qs?.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') this._promoHideProdResults(kind);

        });

        wrap
            .querySelector(`[data-reward-disc-type]`)
            ?.addEventListener('change', () => this._toggleRewardRuleDiscountFields(id));
        const pr = typeof prefillRow === 'object' && prefillRow ? prefillRow : null;

        const dsEl = wrap.querySelector(`[data-reward-disc-type]`);
        if (pr) {
            const dt = String(pr.discountType || 'percent_off').toLowerCase();
            if (dt === 'set_price') dsEl.value = 'set_price';

            else if (dt === 'fixed_off') dsEl.value = 'fixed_off';

            else dsEl.value = 'percent_off';

            const vInp = document.getElementById(`promo-reward-val-${id}`);
            if (vInp) {
                if (pr.percent != null) vInp.value = String(pr.percent);
                else if (pr.amount != null) vInp.value = String(pr.amount);

                else if (pr.setPrice != null) vInp.value = String(pr.setPrice);
            }
            for (const pid of pr.targetProductIds || []) {

                const n = Number(pid);
                if (!Number.isFinite(n) || n <= 0) continue;
                this._promoPickerProducts[kind].set(n, `Product #${n}`);
            }
            this._promoRenderProdChips(kind);

        }

        this._toggleRewardRuleDiscountFields(id);

        this._promoPickerSyncProdHiddenField();
    }

    _promoProdPickerIds(kind) {
        const pmap = this._promoPickerProducts[kind];
        return pmap ? [...pmap.keys()].map((n) => Number(n)).filter((n) => n > 0) : [];
    }

    _promoProdPickerElements(kind) {
        if (kind === 'trigger') {
            return {
                chips: document.getElementById('promo-trigger-chips'),
                q: document.getElementById('promo-trigger-prod-q'),
                res: document.getElementById('promo-trigger-results')
            };
        }
        const rew = typeof kind === 'string' ? kind.match(/^reward-(\d+)$/) : null;
        if (rew) {
            const rid = rew[1];
            return {
                chips: document.getElementById(`promo-reward-chips-${rid}`),
                q: document.getElementById(`promo-reward-q-${rid}`),
                res: document.getElementById(`promo-reward-res-${rid}`)
            };
        }
        const elMap = {
            scope: { chips: 'promo-scope-prod-chips', q: 'promo-scope-prod-q', res: 'promo-scope-prod-results' },
            buy: { chips: 'promo-bogo-buy-chips', q: 'promo-bogo-buy-q', res: 'promo-bogo-buy-results' },
            get: { chips: 'promo-bogo-get-chips', q: 'promo-bogo-get-q', res: 'promo-bogo-get-results' }
        };
        const c = elMap[kind];
        if (!c) return null;
        return {
            chips: document.getElementById(c.chips),
            q: document.getElementById(c.q),
            res: document.getElementById(c.res)
        };
    }

    _promoHideProdResults(kind) {
        const el = this._promoProdPickerElements(kind)?.res;
        if (el) {
            el.hidden = true;
            el.style.display = '';
        }
    }

    _promoRenderProdChips(kind) {
        const { chips } = this._promoProdPickerElements(kind) || {};
        const map = this._promoPickerProducts[kind];
        if (!chips || !map) return;
        chips.innerHTML = '';
        for (const id of [...map.keys()].sort((a, b) => Number(a) - Number(b))) {
            const label = map.get(id);
            const pill = document.createElement('span');
            pill.className = 'promo-prod-chip';
            const sp = document.createElement('span');
            sp.textContent = label || `Product #${id}`;
            pill.appendChild(sp);
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'promo-prod-chip-remove';
            rm.setAttribute('aria-label', `Remove product ${id}`);
            rm.innerHTML = '&times;';
            rm.addEventListener('click', () => {
                map.delete(id);
                this._promoRenderProdChips(kind);
                this._promoPickerSyncProdHiddenField();
            });
            pill.appendChild(rm);
            chips.appendChild(pill);
        }
    }

    _promoPickerSyncProdHiddenField() {
        const hid = document.getElementById('promo-form-product-ids');
        const scopeMode = document.getElementById('promo-form-scope')?.value;
        const strat = document.getElementById('promo-form-product-promo-strategy')?.value;
        let merged;
        if (scopeMode === 'products' && strat === 'trigger_reward') {
            const ids = new Set(this._promoProdPickerIds('trigger'));
            for (const node of document.querySelectorAll('[data-reward-rule-id]')) {
                const rid = node.getAttribute('data-reward-rule-id');
                if (!rid) continue;
                const kind = `reward-${rid}`;
                this._promoProdPickerIds(kind).forEach((pid) => ids.add(pid));
            }
            merged = [...ids].sort((a, b) => a - b);
        } else {
            const scopeIds = this._promoProdPickerIds('scope');
            const buyIds = this._promoProdPickerIds('buy');
            const getIds = this._promoProdPickerIds('get');
            merged = [...new Set([...scopeIds, ...buyIds, ...getIds])].sort((a, b) => a - b);
        }
        if (hid) hid.value = merged.join(', ');
    }

    _promoPickerSyncCategoryHiddenField() {
        const hid = document.getElementById('promo-form-category-ids');
        if (!hid) return;
        hid.value = [...this._promoPickerCategories.keys()]
            .map((n) => Number(n))
            .filter((n) => n > 0)
            .sort((a, b) => a - b)
            .join(', ');
    }

    _promoRenderCatChips() {
        const chips = document.getElementById('promo-scope-cat-chips');
        if (!chips) return;
        chips.innerHTML = '';
        for (const id of [...this._promoPickerCategories.keys()].sort((a, b) => Number(a) - Number(b))) {
            const label = this._promoPickerCategories.get(id);
            const pill = document.createElement('span');
            pill.className = 'promo-prod-chip';
            const sp = document.createElement('span');
            sp.textContent = label || `Category #${id}`;
            pill.appendChild(sp);
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'promo-prod-chip-remove';
            rm.setAttribute('aria-label', `Remove category ${id}`);
            rm.innerHTML = '&times;';
            rm.addEventListener('click', () => {
                this._promoPickerCategories.delete(id);
                this._promoRenderCatChips();
                this._promoPickerSyncCategoryHiddenField();
            });
            pill.appendChild(rm);
            chips.appendChild(pill);
        }
        this._promoUpdateCategoryDropdownState();
    }

    async _promoEnsureCategoriesCache() {
        if (Array.isArray(this._promoCategoriesCache)) return;
        try {
            const rows = await this.apiRequest('/admin/categories');
            this._promoCategoriesCache = Array.isArray(rows) ? rows : [];
        } catch {
            this._promoCategoriesCache = [];
        }
    }

    _promoUpdateCategoryDropdownState() {
        const sel = document.getElementById('promo-scope-category-add');
        if (!sel) return;
        for (let i = 0; i < sel.options.length; i++) {
            const opt = sel.options[i];
            const id = Number(opt.value);
            if (!Number.isFinite(id) || id <= 0) {
                opt.disabled = false;
                continue;
            }
            opt.disabled = this._promoPickerCategories.has(id);
        }
    }

    async _promoHydrateCategoryDropdown() {
        const sel = document.getElementById('promo-scope-category-add');
        if (!sel) return;
        sel.innerHTML = '';
        const loading = document.createElement('option');
        loading.value = '';
        loading.textContent = 'Loading categories…';
        sel.appendChild(loading);
        sel.disabled = true;
        await this._promoEnsureCategoriesCache();
        sel.disabled = false;
        sel.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'Choose a category to add…';
        sel.appendChild(ph);
        const rows = [...(this._promoCategoriesCache || [])].sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''))
        );
        for (const c of rows) {
            const id = Number(c.id);
            if (!Number.isFinite(id) || id <= 0) continue;
            const opt = document.createElement('option');
            opt.value = String(id);
            opt.textContent = `${c.name} (id ${id})`;
            sel.appendChild(opt);
        }
        sel.value = '';
        this._promoUpdateCategoryDropdownState();
    }

    _togglePromoBogoPickersVisibility() {
        const wrap = document.getElementById('promo-bogo-product-pickers');
        if (!wrap) return;
        const scope = document.getElementById('promo-form-scope')?.value || '';
        const bq = Number(document.getElementById('promo-form-buy-qty')?.value);
        const gq = Number(document.getElementById('promo-form-get-qty')?.value);
        const ok =
            scope === 'products' &&
            Number.isFinite(bq) &&
            Number.isFinite(gq) &&
            bq >= 1 &&
            gq >= 1;
        wrap.style.display = ok ? 'block' : 'none';
        this._togglePromoBogoRewardFields();
    }

    /** Buy/get reward type + conditional % / $ inputs (requires both buy and get qty). */
    _togglePromoBogoRewardFields() {
        const wrap = document.getElementById('promo-bogo-reward-fields');
        const pctRow = document.getElementById('promo-bogo-reward-pct-row');
        const fixedRow = document.getElementById('promo-bogo-reward-fixed-row');
        const typeSel = document.getElementById('promo-form-bogo-reward-type');
        if (!wrap || !pctRow || !fixedRow) return;
        const bq = Number(document.getElementById('promo-form-buy-qty')?.value);
        const gq = Number(document.getElementById('promo-form-get-qty')?.value);
        const show = Number.isFinite(bq) && Number.isFinite(gq) && bq >= 1 && gq >= 1;
        wrap.style.display = show ? 'block' : 'none';
        if (!show) {
            pctRow.style.display = 'none';
            fixedRow.style.display = 'none';
            return;
        }
        const t = (typeSel?.value || 'free').toLowerCase();
        pctRow.style.display = t === 'percent_off' ? '' : 'none';
        fixedRow.style.display = t === 'fixed_off' ? '' : 'none';
    }

    _promoPickProduct(kind, row) {
        const id = Number(row?.id);
        if (!Number.isFinite(id) || id <= 0) return;
        const sku = String(row.sku || '').trim();
        const label = sku ? `${row.name} (${sku})` : String(row.name || `Product #${id}`);
        if (!this._promoPickerProducts[kind]) this._promoPickerProducts[kind] = new Map();
        this._promoPickerProducts[kind].set(id, label);
        this._promoRenderProdChips(kind);
        this._promoPickerSyncProdHiddenField();
        const el = this._promoProdPickerElements(kind);
        if (el?.q) el.q.value = '';
        this._promoHideProdResults(kind);
    }

    _promoScheduleProdSearch(kind) {
        const el = this._promoProdPickerElements(kind);
        if (!el?.q) return;
        clearTimeout(this._promoProdSearchTimers[kind]);
        this._promoProdSearchTimers[kind] = window.setTimeout(() => {
            this._promoRunProdSearch(kind, el.q.value.trim());
        }, 280);
    }

    async _promoRunProdSearch(kind, q) {
        const el = this._promoProdPickerElements(kind);
        if (!el?.res) return;
        const results = el.res;
        if (q.length < 1) {
            this._promoHideProdResults(kind);
            return;
        }
        if (!this.authToken) return;
        results.hidden = false;
        results.style.display = 'block';
        results.classList.add('prompt');
        results.textContent = 'Searching…';
        try {
            const data = await this.apiRequest(
                `/admin/products?search=${encodeURIComponent(q)}&limit=15&page=1`
            );
            const rows = data && Array.isArray(data.products) ? data.products : [];
            results.textContent = '';
            results.innerHTML = '';
            results.classList.remove('prompt');
            if (!rows.length) {
                results.classList.add('prompt');
                results.textContent = 'No matches. Try another name or SKU.';
            } else {
                rows.forEach((p) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'promo-product-link-option';
                    btn.addEventListener('mousedown', (e) => e.preventDefault());
                    const sku = String(p.sku || '').trim();
                    btn.textContent = sku ? `${p.name} (${sku})` : String(p.name || 'Product');
                    btn.addEventListener('click', () => this._promoPickProduct(kind, p));
                    results.appendChild(btn);
                });
            }
        } catch {
            results.classList.add('prompt');
            results.textContent = 'Search failed.';
        }
    }

    async _promoEnrichProductLabels(ids) {
        const uniq = [...new Set((ids || []).map((n) => Number(n)).filter((n) => n > 0))].slice(0, 96);
        for (const id of uniq) {
            try {
                const p = await this.apiRequest(`/admin/products/${id}`);
                if (!p?.id) continue;
                const sku = String(p.sku || '').trim();
                const label = sku ? `${p.name} (${sku})` : String(p.name || `Product #${id}`);
                for (const k of this._promoAllProdSearchKinds()) {
                    const m = this._promoPickerProducts[k];
                    if (m && m.has(id)) m.set(id, label);
                }
            } catch (_) {
                /* ignore */
            }
        }
        this._promoAllProdSearchKinds().forEach((k) => this._promoRenderProdChips(k));
    }

    _promoPostFillEnrichLabels(allProductIds) {
        void (async () => {
            await this._promoEnrichProductLabels(allProductIds);
            await this._promoEnsureCategoriesCache();
            for (const id of [...this._promoPickerCategories.keys()]) {
                const hit = (this._promoCategoriesCache || []).find((c) => Number(c.id) === Number(id));
                if (hit?.name) this._promoPickerCategories.set(Number(id), hit.name);
            }
            this._promoRenderCatChips();
        })();
    }

    initPromoProductPickers() {
        if (this._promoProductPickersReady) return;
        const bind = (kind) => {
            const el = this._promoProdPickerElements(kind);
            if (!el?.q) return;
            el.q.addEventListener('input', () => this._promoScheduleProdSearch(kind));
            el.q.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape') this._promoHideProdResults(kind);
            });
        };
        bind('scope');
        bind('buy');
        bind('get');
        bind('trigger');
        const prodStrat = document.getElementById('promo-form-product-promo-strategy');

        if (prodStrat) {
            prodStrat.addEventListener('change', () => this._togglePromoProductStrategyUi());
        }
        const addRew = document.getElementById('promo-add-reward-rule-btn');
        if (addRew) addRew.addEventListener('click', () => this._promoAddRewardRuleRow());
        const catSel = document.getElementById('promo-scope-category-add');
        if (catSel) {
            catSel.addEventListener('change', () => {
                const id = Number(catSel.value);
                if (!Number.isFinite(id) || id <= 0) return;
                if (this._promoPickerCategories.has(id)) {
                    catSel.value = '';
                    return;
                }
                const hit = (this._promoCategoriesCache || []).find((c) => Number(c.id) === id);
                const label = hit?.name ? String(hit.name) : `Category #${id}`;
                this._promoPickerCategories.set(id, label);
                this._promoRenderCatChips();
                this._promoPickerSyncCategoryHiddenField();
                catSel.value = '';
                this._promoUpdateCategoryDropdownState();
            });
        }
        const bq = document.getElementById('promo-form-buy-qty');
        const gq = document.getElementById('promo-form-get-qty');
        if (bq) {
            bq.addEventListener('input', () => this._togglePromoBogoPickersVisibility());
        }
        if (gq) {
            gq.addEventListener('input', () => this._togglePromoBogoPickersVisibility());
        }
        const bogoRewardType = document.getElementById('promo-form-bogo-reward-type');
        if (bogoRewardType) {
            bogoRewardType.addEventListener('change', () => this._togglePromoBogoRewardFields());
        }
        document.addEventListener('click', (ev) => {
            if (!(ev.target instanceof Element)) return;
            const inPanel =
                ev.target.closest('.promo-prod-search-wrap') ||
                ev.target.closest('.promo-prod-results-local');
            if (inPanel) return;
            this._promoAllProdSearchKinds().forEach((k) => this._promoHideProdResults(k));
        });
        this._promoProductPickersReady = true;
        this._togglePromoBogoRewardFields();
        this._togglePromoProductStrategyUi();
    }

    _promoClearProductPickers() {
        ['scope', 'buy', 'get', 'trigger'].forEach((k) => {
            if (!this._promoPickerProducts[k]) this._promoPickerProducts[k] = new Map();
            this._promoPickerProducts[k].clear();

            this._promoRenderProdChips(k);
            this._promoHideProdResults(k);

            const el = this._promoProdPickerElements(k);
            if (el?.q) el.q.value = '';
        });
        this._promoClearRewardRuleUi();
        this._promoPickerCategories.clear();
        this._promoRenderCatChips();
        const catSelClear = document.getElementById('promo-scope-category-add');
        if (catSelClear) catSelClear.value = '';
        this._promoUpdateCategoryDropdownState();
        this._promoPickerSyncProdHiddenField();
        this._promoPickerSyncCategoryHiddenField();
    }

    _promoEnsure12hHourSelect(sel) {
        if (!sel || sel.dataset.promoPopulated12h === '1') return;
        for (let h = 1; h <= 12; h++) {
            const o = document.createElement('option');
            o.value = String(h);
            o.textContent = String(h);
            sel.appendChild(o);
        }
        sel.dataset.promoPopulated12h = '1';
    }

    _promoEnsureMinuteSelect(sel) {
        if (!sel || sel.dataset.promoPopulatedMm === '1') return;
        for (let m = 0; m <= 59; m++) {
            const o = document.createElement('option');
            o.value = String(m);
            o.textContent = String(m).padStart(2, '0');
            sel.appendChild(o);
        }
        sel.dataset.promoPopulatedMm = '1';
    }

    _promoEnsureAmpmSelect(sel) {
        if (!sel || sel.dataset.promoPopulatedAmpm === '1') return;
        for (const x of ['AM', 'PM']) {
            const o = document.createElement('option');
            o.value = x;
            o.textContent = x;
            sel.appendChild(o);
        }
        sel.dataset.promoPopulatedAmpm = '1';
    }

    /**
     * Populates scrollable selects and wires change handlers.
     * Does not infer hidden timestamps from widgets (caller uses fill/sync).
     */
    initPromoDatetimeUi() {
        const probe = document.getElementById('promo-form-starts-hour');
        if (!probe) return;
        if (!this._promoDatetimeUiReady) {
            for (const prefix of ['starts', 'ends']) {
                this._promoEnsure12hHourSelect(document.getElementById(`promo-form-${prefix}-hour`));
                this._promoEnsureMinuteSelect(document.getElementById(`promo-form-${prefix}-minute`));
                this._promoEnsureAmpmSelect(document.getElementById(`promo-form-${prefix}-ampm`));
            }
            const syncBoth = () => {
                this._promoSyncDatetimePartsToHidden('starts');
                this._promoSyncDatetimePartsToHidden('ends');
            };
            for (const prefix of ['starts', 'ends']) {
                for (const part of ['date', 'hour', 'minute', 'ampm']) {
                    const el = document.getElementById(`promo-form-${prefix}-${part}`);
                    if (el) el.addEventListener('change', syncBoth);
                }
            }
            this._promoDatetimeUiReady = true;
        }
    }

    _promoSyncDatetimePartsToHidden(prefix) {
        const hid = document.getElementById(`promo-form-${prefix}`);
        const dateEl = document.getElementById(`promo-form-${prefix}-date`);
        const hEl = document.getElementById(`promo-form-${prefix}-hour`);
        const mEl = document.getElementById(`promo-form-${prefix}-minute`);
        const apEl = document.getElementById(`promo-form-${prefix}-ampm`);
        if (!hid || !dateEl || !hEl || !mEl || !apEl) return;
        const d = String(dateEl.value || '').trim();
        if (!d) {
            hid.value = '';
            return;
        }
        const h12 = Number(hEl.value);
        const mi = Number(mEl.value);
        const ap = String(apEl.value || 'AM').toUpperCase();
        if (!Number.isFinite(h12) || h12 < 1 || h12 > 12 || !Number.isFinite(mi) || mi < 0 || mi > 59) {
            hid.value = '';
            return;
        }
        let h24;
        if (ap === 'AM') {
            h24 = h12 === 12 ? 0 : h12;
        } else if (ap === 'PM') {
            h24 = h12 === 12 ? 12 : h12 + 12;
        } else {
            hid.value = '';
            return;
        }
        hid.value = `${d}T${String(h24).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }

    _promoFillDatetimePartsFromHidden(prefix) {
        const hid = document.getElementById(`promo-form-${prefix}`);
        const dateEl = document.getElementById(`promo-form-${prefix}-date`);
        const hEl = document.getElementById(`promo-form-${prefix}-hour`);
        const mEl = document.getElementById(`promo-form-${prefix}-minute`);
        const apEl = document.getElementById(`promo-form-${prefix}-ampm`);
        if (!hid || !dateEl || !hEl || !mEl || !apEl) return;
        const raw = String(hid.value || '').trim();
        if (!raw) {
            dateEl.value = '';
            hEl.value = '12';
            mEl.value = '0';
            apEl.value = 'AM';
            return;
        }
        const normalized = raw.includes('T') ? raw : raw.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
        const m = normalized.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{2})/);
        if (!m) {
            dateEl.value = '';
            hEl.value = '12';
            mEl.value = '0';
            apEl.value = 'AM';
            return;
        }
        dateEl.value = m[1];
        const H = Number(m[2]);
        const minute = Number(m[3]);
        let ap;
        let h12;
        if (H === 0) {
            h12 = 12;
            ap = 'AM';
        } else if (H === 12) {
            h12 = 12;
            ap = 'PM';
        } else if (H < 12) {
            h12 = H;
            ap = 'AM';
        } else {
            h12 = H - 12;
            ap = 'PM';
        }
        hEl.value = String(h12);
        mEl.value = String(minute);
        apEl.value = ap;
    }

    resetPromoEditor() {
        this.initPromoProductPickers();
        this.initPromoDatetimeUi();
        this._promoClearProductPickers();
        const idEl = document.getElementById('promo-edit-id');
        if (idEl) idEl.value = '';
        const hdr = document.getElementById('promo-editor-title');
        if (hdr) hdr.textContent = 'New checkout promotion';

        const fields = [
            ['promo-form-code', ''],
            ['promo-form-desc', ''],
            ['promo-form-pct', ''],
            ['promo-form-fixed', ''],
            ['promo-form-buy-qty', ''],
            ['promo-form-get-qty', ''],
            ['promo-form-product-ids', ''],
            ['promo-form-category-ids', ''],
            ['promo-form-starts', ''],
            ['promo-form-ends', ''],
            ['promo-form-limit-total', ''],
            ['promo-form-limit-email', '']
        ];
        fields.forEach(([id, v]) => {
            const el = document.getElementById(id);
            if (el) el.value = v;
        });
        this._promoFillDatetimePartsFromHidden('starts');
        this._promoFillDatetimePartsFromHidden('ends');

        const scope = document.getElementById('promo-form-scope');
        if (scope) scope.value = 'all';
        const act = document.getElementById('promo-form-active');
        if (act) act.checked = true;
        const fs = document.getElementById('promo-form-free-shipping');
        if (fs) fs.checked = false;
        const bogort = document.getElementById('promo-form-bogo-reward-type');
        if (bogort) bogort.value = 'free';
        const bogopct = document.getElementById('promo-form-bogo-get-pct');
        if (bogopct) bogopct.value = '';
        const bogofix = document.getElementById('promo-form-bogo-get-fixed');
        if (bogofix) bogofix.value = '';
        const pstr = document.getElementById('promo-form-product-promo-strategy');
        if (pstr) pstr.value = 'trigger_reward';
        const tmin = document.getElementById('promo-form-trigger-min-qty');
        if (tmin) tmin.value = '';
        this._togglePromoScopeHints();

        const msg = document.getElementById('promo-form-msg');
        if (msg) msg.textContent = '';
    }

    openPromoEditorModal() {
        const m = document.getElementById('promo-editor-modal');
        if (!m) return;
        const prev = document.activeElement;
        this._promoEditorReturnFocus =
            prev instanceof HTMLElement &&
            typeof prev.focus === 'function' &&
            document.body.contains(prev) &&
            !m.contains(prev)
                ? prev
                : null;
        m.hidden = false;
        m.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        const scrollEl = m.querySelector('.promo-editor-modal__scroll');
        if (scrollEl) scrollEl.scrollTop = 0;
        const first = document.getElementById('promo-form-code');
        window.setTimeout(() => {
            try {
                first?.focus();
            } catch (_) {
                /* ignore */
            }
        }, 60);
    }

    closePromoEditorModal() {
        const m = document.getElementById('promo-editor-modal');
        if (!m) return;
        const ae = document.activeElement;
        if (ae instanceof HTMLElement && m.contains(ae)) {
            const ret = this._promoEditorReturnFocus;
            if (
                ret &&
                document.body.contains(ret) &&
                typeof ret.focus === 'function' &&
                !m.contains(ret)
            ) {
                try {
                    ret.focus({ preventScroll: true });
                } catch (_) {
                    /* ignore */
                }
            } else {
                const fb = document.getElementById('promo-editor-open-new-btn');
                if (fb && typeof fb.focus === 'function') {
                    try {
                        fb.focus({ preventScroll: true });
                    } catch (_) {
                        try {
                            ae.blur();
                        } catch (_) {
                            /* ignore */
                        }
                    }
                } else {
                    try {
                        ae.blur();
                    } catch (_) {
                        /* ignore */
                    }
                }
            }
        }
        this._promoEditorReturnFocus = null;
        m.hidden = true;
        m.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    _parseRulesField(raw) {
        if (raw == null) return {};
        if (typeof raw === 'object') return raw;
        try {
            return JSON.parse(String(raw));
        } catch {
            return {};
        }
    }

    fillPromoEditor(row) {
        if (!row) return;
        const idEl = document.getElementById('promo-edit-id');
        if (idEl) idEl.value = String(row.id);
        const hdr = document.getElementById('promo-editor-title');
        if (hdr) hdr.textContent = `Edit promotion #${row.id}`;

        const code = document.getElementById('promo-form-code');
        const desc = document.getElementById('promo-form-desc');
        if (code) code.value = row.code || '';
        if (desc) desc.value = row.description || '';
        document.getElementById('promo-form-active').checked = Number(row.is_active) === 1;
        const startsNorm = row.starts_at
            ? String(row.starts_at).trim().replace(' ', 'T').slice(0, 16)
            : '';
        const endsNorm = row.ends_at
            ? String(row.ends_at).trim().replace(' ', 'T').slice(0, 16)
            : '';
        this.initPromoDatetimeUi();
        document.getElementById('promo-form-starts').value = startsNorm;
        document.getElementById('promo-form-ends').value = endsNorm;
        this._promoFillDatetimePartsFromHidden('starts');
        this._promoFillDatetimePartsFromHidden('ends');
        document.getElementById('promo-form-limit-total').value =
            row.usage_limit_total != null ? String(row.usage_limit_total) : '';
        document.getElementById('promo-form-limit-email').value =
            row.usage_limit_per_email != null ? String(row.usage_limit_per_email) : '';

        const rules = this._parseRulesField(row.rules);
        this.initPromoProductPickers();
        this._promoPickerProducts.scope.clear();
        this._promoPickerProducts.buy.clear();
        this._promoPickerProducts.get.clear();
        this._promoPickerProducts.trigger.clear();
        this._promoClearRewardRuleUi();
        this._promoPickerCategories.clear();

        const scopeEl = document.getElementById('promo-form-scope');
        const stratEl = document.getElementById('promo-form-product-promo-strategy');
        const sc = rules.scope === 'products' || rules.scope === 'categories' ? rules.scope : 'all';
        if (scopeEl) scopeEl.value = sc;

        const allP = Array.isArray(rules.productIds)
            ? rules.productIds.map((x) => Number(x)).filter((n) => n > 0)
            : [];
        const trRaw = rules.triggerReward;
        const useTrigger =
            sc === 'products' &&
            trRaw &&
            typeof trRaw === 'object' &&
            Array.isArray(trRaw.triggerProductIds) &&
            trRaw.triggerProductIds.length > 0;
        if (stratEl) stratEl.value = useTrigger ? 'trigger_reward' : 'classic';

        if (useTrigger) {
            for (const tid of trRaw.triggerProductIds || []) {

                const n = Number(tid);
                if (Number.isFinite(n) && n > 0)
                    this._promoPickerProducts.trigger.set(n, `Product #${n}`);
            }
            const mq = document.getElementById('promo-form-trigger-min-qty');

            if (mq) mq.value = trRaw.minTriggerQty != null ? String(trRaw.minTriggerQty) : '';

            const rrules = Array.isArray(trRaw.rewardRules) ? trRaw.rewardRules : [];

            if (rrules.length) {

                rrules.forEach((rr) => this._promoAddRewardRuleRow(rr));
            } else {
                this._promoAddRewardRuleRow();
            }
        } else {
            const effsEarly = Array.isArray(rules.effects) ? rules.effects : [];
            const bogoEarly = effsEarly.find((e) => {
                const t = String(e?.type || '').toLowerCase();

                return t === 'buy_get' || t === 'bogo';
            });
            const buySide = new Set(
                Array.isArray(bogoEarly?.buyProductIds)
                    ? bogoEarly.buyProductIds.map((n) => Number(n)).filter((n) => n > 0)
                    : []
            );
            const getSide = new Set(
                Array.isArray(bogoEarly?.getProductIds)
                    ? bogoEarly.getProductIds.map((n) => Number(n)).filter((n) => n > 0)
                    : []
            );
            if (buySide.size > 0 && getSide.size > 0) {

                for (const id of allP) {

                    if (!buySide.has(id) && !getSide.has(id))
                        this._promoPickerProducts.scope.set(id, `Product #${id}`);
                }
                for (const id of buySide) this._promoPickerProducts.buy.set(id, `Product #${id}`);
                for (const id of getSide) this._promoPickerProducts.get.set(id, `Product #${id}`);
            } else {

                for (const id of allP) this._promoPickerProducts.scope.set(id, `Product #${id}`);
            }
        }

        const cats = Array.isArray(rules.categoryIds)
            ? rules.categoryIds.map((x) => Number(x)).filter((n) => n > 0)
            : [];
        for (const id of cats) this._promoPickerCategories.set(id, `Category #${id}`);

        this._promoPickerSyncProdHiddenField();
        this._promoPickerSyncCategoryHiddenField();
        if (useTrigger) {
            this._promoRenderProdChips('trigger');
            Object.keys(this._promoPickerProducts)

                .filter((k) => k.startsWith('reward-'))

                .forEach((k) => this._promoRenderProdChips(k));

        } else {
            ['scope', 'buy', 'get'].forEach((k) => this._promoRenderProdChips(k));

        }

        this._promoRenderCatChips();

        const pctEl = document.getElementById('promo-form-pct');
        const fixedEl = document.getElementById('promo-form-fixed');
        const buyEl = document.getElementById('promo-form-buy-qty');
        const getEl = document.getElementById('promo-form-get-qty');
        const fsEl = document.getElementById('promo-form-free-shipping');
        const rewardSel = document.getElementById('promo-form-bogo-reward-type');
        const getPctBogo = document.getElementById('promo-form-bogo-get-pct');
        const getFixedBogo = document.getElementById('promo-form-bogo-get-fixed');
        if (pctEl) pctEl.value = '';
        if (fixedEl) fixedEl.value = '';
        if (buyEl) buyEl.value = '';
        if (getEl) getEl.value = '';
        if (fsEl) fsEl.checked = false;
        if (rewardSel) rewardSel.value = 'free';
        if (getPctBogo) getPctBogo.value = '';
        if (getFixedBogo) getFixedBogo.value = '';

        const effs = Array.isArray(rules.effects) ? rules.effects : [];
        for (const e of effs) {

            const t = String(e.type || '').toLowerCase();
            if (
                (t === 'free_standard_shipping' || t === 'free_standard_shipping_only') &&
                fsEl
            ) {

                fsEl.checked = true;

                continue;

            }
            if (!useTrigger) {

                if (t === 'percent_off' && pctEl) pctEl.value = e.percent ?? '';
                if (t === 'fixed_off' && fixedEl) fixedEl.value = e.amount ?? '';
                if ((t === 'buy_get' || t === 'bogo') && buyEl && getEl) {

                    buyEl.value = e.buyQty ?? '';

                    getEl.value = e.getQty ?? '';

                    if (rewardSel) {

                        const grt = String(e.getRewardType || 'free').toLowerCase();
                        if (grt === 'percent_off' || grt === 'percent') rewardSel.value = 'percent_off';
                        else if (grt === 'fixed_off' || grt === 'fixed') rewardSel.value = 'fixed_off';
                        else rewardSel.value = 'free';

                    }

                    if (getPctBogo && e.getPercent != null && e.getPercent !== '') {

                        getPctBogo.value = String(e.getPercent);

                    }

                    const fa = e.getFixedAmount != null ? e.getFixedAmount : e.getAmount;

                    if (getFixedBogo && fa != null && fa !== '') getFixedBogo.value = String(fa);

                }

            }

        }

        this._togglePromoScopeHints();
        this._promoPostFillEnrichLabels(allP);
        this.openPromoEditorModal();
    }

    async loadWebPromotionsTable() {
        const tbody = document.getElementById('promotions-table-body');
        if (!tbody) return;
        if (!this.authToken) return;
        try {
            const res = await this.apiRequest('/admin/promotions');
            const rows = Array.isArray(res.promotions) ? res.promotions : [];
            tbody.innerHTML = rows
                .map((r) => {
                    const active = Number(r.is_active) === 1 ? 'Yes' : 'No';
                    return `<tr data-promo-row="${r.id}">
                        <td><code>${this.escapeHtml(r.code)}</code></td>
                        <td>${this.escapeHtml(active)}</td>
                        <td style="font-size:0.88rem">${this.escapeHtml(r.description || '—')}</td>
                        <td style="white-space:nowrap">
                            <button type="button" class="btn btn-secondary btn-sm" data-promo-edit="${r.id}">Edit</button>
                            <button type="button" class="btn btn-danger btn-sm" data-promo-delete="${r.id}">Delete</button>
                        </td>
                    </tr>`;
                })
                .join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" style="color:var(--error)">Unable to load promotions.</td></tr>`;
        }
    }

    async submitPromoForm(ev) {
        ev.preventDefault();
        const msg = document.getElementById('promo-form-msg');
        if (msg) {
            msg.textContent = '';
            msg.style.color = '';
        }

        const rules = this._promoRulesFromEditor();
        const usesTriggerSku =
            rules.scope === 'products' &&
            rules.triggerReward &&
            typeof rules.triggerReward === 'object' &&
            rules.triggerReward.triggerProductIds &&
            rules.triggerReward.triggerProductIds.length > 0;
        if (!rules.effects.length && !usesTriggerSku) {
            if (msg) {
                msg.textContent =
                    'Add a Trigger→Reward SKU setup, cart discount (classic), buy/get, or check Free shipping.';
                msg.style.color = 'var(--error)';
            }
            this.showToast('Add promotion rules first', 'error');
            return;
        }
        const promoProdStrat = document.getElementById('promo-form-product-promo-strategy')?.value;
        if (rules.scope === 'products' && promoProdStrat === 'trigger_reward') {
            const tr = rules.triggerReward;

            const bad = () => {
                const t =
                    'Trigger mode: add at least one Trigger SKU, minimum quantity ≥ 1, and one reward SKU group with a valid discount value.';
                if (msg) {

                    msg.textContent = t;
                    msg.style.color = 'var(--error)';
                }

                this.showToast(t, 'error');
            };


            if (!tr || !tr.triggerProductIds?.length || !Number.isFinite(tr.minTriggerQty) || tr.minTriggerQty < 1) {

                bad();
                return;
            }

            if (!Array.isArray(tr.rewardRules) || !tr.rewardRules.length) {

                bad();
                return;

            }


        }


        if (rules.scope === 'products' && (!rules.productIds || rules.productIds.length === 0)) {
            const t = 'Add at least one product to the SKU lists above, or change “Applies to”.';
            if (msg) {
                msg.textContent = t;

                msg.style.color = 'var(--error)';
            }
            this.showToast(t, 'error');
            return;
        }
        if (rules.scope === 'categories' && (!rules.categoryIds || rules.categoryIds.length === 0)) {
            const t = 'Add at least one category, or change “Applies to”.';
            if (msg) {
                msg.textContent = t;
                msg.style.color = 'var(--error)';
            }
            this.showToast(t, 'error');
            return;
        }

        for (const e of rules.effects) {
            const tp = String(e.type || '').toLowerCase();
            if (tp !== 'buy_get' && tp !== 'bogo') continue;
            const rt = String(e.getRewardType || 'free').toLowerCase();
            if (rt === 'percent_off' || rt === 'percent') {
                const p = Number(e.getPercent);
                if (!Number.isFinite(p) || p <= 0 || p > 100) {
                    const tx =
                        'Buy/get is set to percent off reward items — enter a percent between 1 and 100, or choose Free.';
                    if (msg) {
                        msg.textContent = tx;
                        msg.style.color = 'var(--error)';
                    }
                    this.showToast(tx, 'error');
                    return;
                }
            } else if (rt === 'fixed_off' || rt === 'fixed') {
                const f = Number(e.getFixedAmount);
                if (!Number.isFinite(f) || f <= 0) {
                    const tx =
                        'Buy/get is set to dollar off reward items — enter an amount greater than zero, or choose Free.';
                    if (msg) {
                        msg.textContent = tx;
                        msg.style.color = 'var(--error)';
                    }
                    this.showToast(tx, 'error');
                    return;
                }
            }
        }

        const id = Number(document.getElementById('promo-edit-id')?.value || '0');
        this.initPromoDatetimeUi();
        this._promoSyncDatetimePartsToHidden('starts');
        this._promoSyncDatetimePartsToHidden('ends');
        const promoNormDt = (v) => {
            const s = String(v ?? '').trim();
            if (!s) return null;
            const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
            if (m) return `${m[1]} ${m[2]}:00`;
            return s;
        };
        const payload = {
            code: (document.getElementById('promo-form-code')?.value || '').trim(),
            description: (document.getElementById('promo-form-desc')?.value || '').trim(),
            is_active: document.getElementById('promo-form-active')?.checked ? 1 : 0,
            starts_at: promoNormDt(document.getElementById('promo-form-starts')?.value),
            ends_at: promoNormDt(document.getElementById('promo-form-ends')?.value),
            usage_limit_total: document.getElementById('promo-form-limit-total')?.value,
            usage_limit_per_email: document.getElementById('promo-form-limit-email')?.value,
            rules
        };

        try {
            if (id > 0) {
                await this.apiRequest(`/admin/promotions/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                this.showToast('Promotion updated', 'success');
                this.closePromoEditorModal();
            } else {
                await this.apiRequest('/admin/promotions', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                this.showToast('Promotion created', 'success');
                this.resetPromoEditor();
                this.closePromoEditorModal();
            }
            await this.loadWebPromotionsTable();
        } catch (err) {
            if (msg) {
                msg.textContent = err.message || 'Save failed';
                msg.style.color = 'var(--error)';
            }
            this.showToast('Save failed: ' + (err.message || ''), 'error');
        }
    }

    async deletePromoById(id) {
        const pid = Number(id);
        if (!Number.isFinite(pid)) return;
        const ok = await this.showAdminConfirm({
            title: 'Delete promotion?',
            message: 'This cannot be undone. Existing orders keep their totals.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            danger: true
        });
        if (!ok) return;
        try {
            await this.apiRequest(`/admin/promotions/${pid}`, { method: 'DELETE' });
            this.showToast('Promotion deleted', 'success');
            await this.loadWebPromotionsTable();
            const cur = Number(document.getElementById('promo-edit-id')?.value || '0');
            if (cur === pid) {
                this.resetPromoEditor();
                this.closePromoEditorModal();
            }
        } catch (err) {
            this.showToast('Delete failed: ' + (err.message || ''), 'error');
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

    formatMoney(value) {
        const n = Number(value) || 0;
        return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }

    getTodayDateKey() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    setTaxReportDefaultRange() {
        const startInput = document.getElementById('taxReportStartDate');
        const endInput = document.getElementById('taxReportEndDate');
        if (!startInput || !endInput) return;
        if (startInput.value && endInput.value) return;

        const now = new Date();
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
        const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);

        const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        startInput.value = toKey(firstOfPrevMonth);
        endInput.value = toKey(lastOfPrevMonth);
    }

    getTaxReportDateRange() {
        const startDate = (document.getElementById('taxReportStartDate')?.value || '').trim();
        const endDate = (document.getElementById('taxReportEndDate')?.value || '').trim();
        return { startDate, endDate };
    }

    async loadTaxLedger() {
        try {
            const date = this.getTodayDateKey();
            this.setTaxReportDefaultRange();
            const response = await this.apiRequest(`/admin/tax-ledger/overview?date=${encodeURIComponent(date)}`);
            if (!response || !response.overview) return;

            const overview = response.overview;
            const webstore = Number(overview.webstore_total) || 0;
            const pos = Number(overview.pos_total) || 0;
            const combined = Number(overview.combined_reserve_needed) || 0;
            const status = String(overview.status || 'pending').toLowerCase();

            const webstoreEl = document.getElementById('taxLedgerWebstoreTotal');
            const posEl = document.getElementById('taxLedgerPosTotal');
            const combinedEl = document.getElementById('taxLedgerCombinedTotal');
            const statusEl = document.getElementById('taxLedgerStatus');
            const instructionEl = document.getElementById('taxLedgerInstruction');

            if (webstoreEl) webstoreEl.textContent = this.formatMoney(webstore);
            if (posEl) posEl.textContent = this.formatMoney(pos);
            if (combinedEl) combinedEl.textContent = this.formatMoney(combined);
            if (statusEl) statusEl.textContent = `Status: ${status}`;
            if (instructionEl) {
                instructionEl.textContent = `Based on today's sales, please transfer ${this.formatMoney(combined)} to your Tax Savings Account.`;
            }
        } catch (error) {
            this.showNotification('Tax ledger endpoint unavailable. Restart backend to load new routes.', 'error');
            console.warn('Tax ledger load failed:', error?.message || error);
        }
    }

    async runDailyTaxSync() {
        const date = this.getTodayDateKey();
        const response = await this.apiRequest('/admin/tax-ledger/sync-daily', {
            method: 'POST',
            body: JSON.stringify({ date })
        });
        if (!response) return;
        this.showNotification('Daily tax sync finished', 'success');
        await this.loadTaxLedger();
    }

    async markTaxReserveTransferred() {
        const date = this.getTodayDateKey();
        const response = await this.apiRequest('/admin/tax-ledger/mark-transferred', {
            method: 'POST',
            body: JSON.stringify({ date })
        });
        if (!response) return;
        this.showNotification('Reserve marked as transferred', 'success');
        await this.loadTaxLedger();
    }

    async exportTaxAccountantExcel() {
        const { startDate, endDate } = this.getTaxReportDateRange();
        if (!startDate || !endDate) {
            this.showNotification('Select both start and end dates', 'error');
            return;
        }

        const url = `${this.apiBaseUrl}/admin/tax-ledger/export/accountant.xlsx?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        this.showNotification('Building Excel report (syncing POS + website)…', 'info');
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.authToken}`
            }
        });

        if (!response.ok) {
            let message = `Excel export failed (${response.status})`;
            try {
                const err = await response.json();
                if (err?.error) message = err.error;
            } catch (_) {
                /* ignore */
            }
            this.showNotification(message, 'error');
            return;
        }

        const blob = await response.blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = `hmherbs-tax-report-${startDate}-to-${endDate}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);
        this.showNotification('Tax report Excel downloaded', 'success');
    }

    async sendTaxAccountantReport() {
        const { startDate, endDate } = this.getTaxReportDateRange();
        if (!startDate || !endDate) {
            this.showNotification('Select both start and end dates', 'error');
            return;
        }

        const ok = await this.showAdminConfirm({
            title: 'Email tax report to accountant?',
            message: `Send the Excel sales tax report for ${startDate} through ${endDate} to the accountant? This syncs website and POS data for that period first.`,
            confirmLabel: 'Send email',
            cancelLabel: 'Cancel'
        });
        if (!ok) return;

        try {
            this.showNotification('Syncing sales and sending email…', 'info');
            const response = await this.apiRequest('/admin/tax-ledger/send-accountant-report', {
                method: 'POST',
                body: JSON.stringify({ startDate, endDate, syncBeforeExport: true })
            });
            if (!response?.success) return;
            const to = response.result?.recipientEmail || 'accountant';
            const count = response.result?.rowCount ?? 0;
            this.showNotification(`Tax report emailed to ${to} (${count} transactions)`, 'success');
        } catch (error) {
            this.showNotification(error?.message || 'Failed to send tax report', 'error');
        }
    }

    async syncProductCostsFromOctopos() {
        const ok = await this.showAdminConfirm({
            title: 'Sync costs from Octopos?',
            message:
                'This matches website products to Octopos by SKU (and barcode when applicable) and updates Cost from Octopos. Existing retail prices are not changed.',
            confirmLabel: 'Sync now',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;
        try {
            this.showToast('Syncing product costs from Octopos…', 'info');
            const result = await this.apiRequest('/admin/products/sync-octopos/costs', { method: 'POST' });
            const s = result?.stats || {};
            this.showToast(
                `Octopos sync done: ${s.updated || 0} updated, ${s.matched || 0} matched, ${s.unmatched || 0} unmatched`,
                'success'
            );
            await this.loadProducts();
        } catch (err) {
            this.showToast('Octopos cost sync failed: ' + (err.message || 'error'), 'error');
        }
    }

    async syncOneProductCostFromOctopos(productId) {
        try {
            const result = await this.apiRequest(`/admin/products/${productId}/sync-octopos-cost`, {
                method: 'POST',
            });
            if (result?.cost_price != null) {
                const costEl = document.getElementById('edit-cost-price');
                if (costEl) costEl.value = result.cost_price;
            }
            const octStatus = document.getElementById('edit-octopos-cost-status');
            if (octStatus) {
                octStatus.textContent = result.message
                    || (result.cost_price != null
                        ? `Cost $${Number(result.cost_price).toFixed(2)} pulled from Octopos #${result.octopos_product_id}`
                        : 'Updated from Octopos');
                octStatus.style.color = 'var(--success, #059669)';
            }
            this.showToast(result.message || 'Cost updated from Octopos', 'success');
            await this.loadProducts();
        } catch (err) {
            this.showToast('Pull from Octopos failed: ' + (err.message || 'error'), 'error');
        }
    }

    async pushOneProductCostToOctopos(productId) {
        try {
            const costEl = document.getElementById('edit-cost-price');
            if (costEl && costEl.value !== '') {
                await this.apiRequest(`/admin/products/${productId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ cost_price: costEl.value }),
                });
            }
            const result = await this.apiRequest(`/admin/products/${productId}/push-octopos-cost`, {
                method: 'POST',
            });
            if (result.skipped) {
                this.showToast(result.reason || 'Octopos push skipped', 'warning');
                return;
            }
            this.showToast('Cost pushed to Octopos', 'success');
        } catch (err) {
            this.showToast('Push to Octopos failed: ' + (err.message || 'error'), 'error');
        }
    }

    async loadLowStock() {
        const container = document.getElementById('lowStockTable');
        if (!container) {
            console.warn('Low stock table container not found');
            return;
        }

        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading low stock products...</div>';

        if (!this.authToken) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view low stock products.</p></div>';
            return;
        }

        try {
            const rows = await this.apiRequest('/admin/inventory/low-stock?limit=10000');

            if (!rows) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view low stock products.</p></div>';
                return;
            }

            if (!Array.isArray(rows) || rows.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>No low stock products. All tracked inventory is above threshold.</p></div>';
                return;
            }

            container.innerHTML = `
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Product</th>
                                <th>Brand</th>
                                <th>Category</th>
                                <th>Qty</th>
                                <th>Threshold</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((p) => `
                            <tr>
                                <td><code>${this.escapeHtml(p.sku || '')}</code></td>
                                <td>${this.escapeHtml(p.name || '')}</td>
                                <td>${this.escapeHtml(p.brand_name || '—')}</td>
                                <td>${this.escapeHtml(p.category_name || '—')}</td>
                                <td><span class="badge badge-warning">${Number(p.inventory_quantity) || 0}</span></td>
                                <td>${Number(p.low_stock_threshold) || 0}</td>
                                <td>
                                    <button type="button" class="btn btn-sm btn-secondary" onclick="editProduct(${p.id})">
                                        <i class="fas fa-edit"></i> Edit
                                    </button>
                                </td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <p style="margin: 1rem 0 0; font-size: 0.875rem; color: var(--gray-600);">
                    Showing ${rows.length} product${rows.length === 1 ? '' : 's'}.
                </p>
            `;
        } catch (error) {
            if (error.message === 'Authentication required' || error.message.includes('Invalid admin token')) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view low stock products.</p></div>';
            } else {
                container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error);"><p>Failed to load low stock: ${this.escapeHtml(error.message)}</p></div>`;
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
            this.initEdsaCalendarState();
            const range = this.getEdsaCalendarRange();
            const response = await this.apiRequest(
                `/admin/edsa/bookings?limit=500&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
            );

            // Handle null response (403 Forbidden)
            if (!response) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>Please log in to view EDSA bookings.</p></div>';
                return;
            }

            if (response.bookings && response.bookings.length > 0) {
                this._edsaBookingsById = new Map(
                    response.bookings.map((b) => [Number(b.id), b])
                );
                this._edsaBookingsList = response.bookings;
                container.innerHTML = this.renderEdsaCalendarShell();
                this.renderEdsaCalendarBody();
                this.bindEdsaCalendarControls();
            } else {
                this._edsaBookingsById = new Map();
                this._edsaBookingsList = [];
                container.innerHTML = this.renderEdsaCalendarShell();
                this.renderEdsaCalendarBody();
                this.bindEdsaCalendarControls();
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

    renderEdsaCustomerRequest(booking) {
        const type = booking.customer_request_type || 'none';
        if (type === 'none') {
            return '<span class="text-muted">—</span>';
        }
        let text = type === 'cancel' ? 'Cancel requested' : 'Reschedule requested';
        if (type === 'reschedule' && booking.requested_date) {
            const d = new Date(booking.requested_date);
            const dateStr = Number.isNaN(d.getTime()) ? booking.requested_date : d.toLocaleDateString();
            const timeStr = booking.requested_time ? String(booking.requested_time).slice(0, 5) : '';
            text += ` → ${dateStr}${timeStr ? ' ' + timeStr : ''}`;
        }
        if (booking.customer_request_notes) {
            text += ` — ${this.escapeHtml(String(booking.customer_request_notes).slice(0, 80))}`;
        }
        return `<span class="badge badge-warning">${this.escapeHtml(text)}</span>`;
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
                            <th>Appointment date</th>
                            <th>Time</th>
                            <th>Status</th>
                            <th>Customer request</th>
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
                                <td>${booking.preferred_time ? String(booking.preferred_time).slice(0, 5) : 'N/A'}</td>
                                <td>
                                    <span class="badge ${booking.status === 'confirmed' ? 'badge-success' : booking.status === 'pending' ? 'badge-warning' : booking.status === 'cancelled' ? 'badge-danger' : 'badge-info'}">
                                        ${this.escapeHtml(String(booking.status || '').toUpperCase())}
                                    </span>
                                </td>
                                <td>${this.renderEdsaCustomerRequest(booking)}</td>
                                <td>${new Date(booking.created_at).toLocaleDateString()}</td>
                                <td>
                                    <button type="button" class="btn btn-sm btn-secondary" data-edsa-edit-id="${booking.id}" aria-label="Edit booking #${booking.id}">
                                        <i class="fas fa-edit" aria-hidden="true"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    formatEdsaDateInput(value) {
        if (!value) return '';
        const raw = String(value);
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
            return raw.slice(0, 10);
        }
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    buildEdsaTimeOptions(selected) {
        const sel = String(selected || '').slice(0, 5);
        let html = '';
        for (let hour = 10; hour < 18; hour++) {
            const t = `${String(hour).padStart(2, '0')}:00`;
            html += `<option value="${t}"${t === sel ? ' selected' : ''}>${t}</option>`;
        }
        return html;
    }

    bindEdsaBookingsTableActions(root) {
        if (!root) return;
        root.querySelectorAll('[data-edsa-edit-id]').forEach((btn) => {
            if (btn.dataset.edsaEditBound === '1') return;
            btn.dataset.edsaEditBound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = Number(btn.getAttribute('data-edsa-edit-id'));
                if (Number.isFinite(id)) {
                    this.openEdsaBookingModal(id);
                }
            });
        });
    }

    openEdsaBookingModal(bookingId) {
        const booking = this._edsaBookingsById.get(Number(bookingId));
        if (!booking) {
            this.showToast('Booking not found. Refresh the list and try again.', 'error');
            return;
        }

        const dateVal = this.formatEdsaDateInput(booking.preferred_date);
        const timeVal = String(booking.preferred_time || '10:00').slice(0, 5);
        const name = `${booking.first_name || ''} ${booking.last_name || ''}`.trim();

        const modal = this._mountAdminModal(`
            <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:1.25rem 1.5rem;border-bottom:1px solid var(--gray-200);background:var(--light-green, #f0f7ef);">
                <h2 id="edsa-edit-title" style="margin:0;color:var(--primary-green);font-size:1.25rem;">EDSA booking #${booking.id}</h2>
                <button type="button" class="modal-close" id="edsa-edit-close" aria-label="Close">${HM_CLOSE_ICON_SVG}</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <p style="margin:0 0 1rem;color:var(--gray-600);">${this.escapeHtml(name)} · ${this.escapeHtml(booking.email)}</p>
                <div class="form-group">
                    <label for="edsa-edit-status">Status</label>
                    <select id="edsa-edit-status" class="form-control">
                        <option value="pending"${booking.status === 'pending' ? ' selected' : ''}>Pending</option>
                        <option value="confirmed"${booking.status === 'confirmed' ? ' selected' : ''}>Confirmed</option>
                        <option value="cancelled"${booking.status === 'cancelled' ? ' selected' : ''}>Cancelled</option>
                        <option value="completed"${booking.status === 'completed' ? ' selected' : ''}>Completed</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="edsa-edit-date">Appointment date</label>
                    <input type="date" id="edsa-edit-date" class="form-control" value="${this.escapeHtml(dateVal)}">
                </div>
                <div class="form-group">
                    <label for="edsa-edit-time">Appointment time</label>
                    <select id="edsa-edit-time" class="form-control">${this.buildEdsaTimeOptions(timeVal)}</select>
                </div>
                <div class="form-group">
                    <label for="edsa-edit-notes">Staff notes (internal)</label>
                    <textarea id="edsa-edit-notes" class="form-control" rows="2">${this.escapeHtml(booking.admin_notes || '')}</textarea>
                </div>
                <label style="display:flex;align-items:center;gap:0.5rem;margin:1rem 0;">
                    <input type="checkbox" id="edsa-edit-notify" checked>
                    Email customer about cancel or time change
                </label>
                <p style="font-size:0.875rem;color:var(--gray-500);margin:0;">
                    Saving updates Google Calendar when connected. Customers receive an email if the date, time, or status (cancelled) changes.
                </p>
            </div>
            <div class="modal-footer" style="display:flex;gap:0.5rem;justify-content:flex-end;padding:1rem 1.5rem;border-top:1px solid var(--gray-200);">
                <button type="button" class="btn btn-secondary" id="edsa-edit-cancel">Close</button>
                <button type="button" class="btn btn-primary" id="edsa-edit-save">Save changes</button>
            </div>`);

        if (!modal) {
            this.showToast('Could not open booking editor.', 'error');
            return;
        }

        const close = () => modal.remove();

        modal.querySelector('#edsa-edit-close')?.addEventListener('click', close);
        modal.querySelector('#edsa-edit-cancel')?.addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        modal.querySelector('#edsa-edit-save')?.addEventListener('click', async () => {
            const btn = modal.querySelector('#edsa-edit-save');
            btn.disabled = true;
            btn.textContent = 'Saving…';
            try {
                await this.apiRequest(`/admin/edsa/bookings/${booking.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        status: modal.querySelector('#edsa-edit-status').value,
                        preferred_date: modal.querySelector('#edsa-edit-date').value,
                        preferred_time: modal.querySelector('#edsa-edit-time').value,
                        admin_notes: modal.querySelector('#edsa-edit-notes').value,
                        notify_customer: modal.querySelector('#edsa-edit-notify').checked
                    })
                });
                this.showToast('EDSA booking updated', 'success');
                close();
                await this.loadEDSABookings();
            } catch (err) {
                this.showToast(err.message || 'Could not save booking', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save changes';
            }
        });
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
        const esc = (v) => this.escapeHtml(v);
        const money = (v) => {
            const n = typeof v === 'string' ? parseFloat(v) : Number(v);
            return Number.isFinite(n) ? `$${n.toFixed(2)}` : '—';
        };
        const rows = products.map((product) => {
            const name = esc(product.name || '');
            const cat = esc(product.category_name || 'No category');
            const brand = esc(product.brand_name || 'Unknown');
            const isFeatured = product.is_featured === true ||
                product.is_featured === 1 ||
                product.is_featured === '1' ||
                product.is_featured === 'true';
            const lowStock = product.inventory_quantity <= (product.low_stock_threshold || 10);
            return `
                <tr>
                    <td class="col-sku"><code title="${esc(product.sku)}">${esc(product.sku)}</code></td>
                    <td class="product-name-cell">
                        <span class="product-name-primary" title="${name}">${name}</span>
                        <span class="product-name-meta" title="${cat}">${cat}</span>
                    </td>
                    <td><span class="cell-ellipsis" title="${brand}">${brand}</span></td>
                    <td class="col-money">${money(product.price)}</td>
                    <td class="col-money">${product.cost_price != null && product.cost_price !== ''
                        ? money(product.cost_price)
                        : '<span style="color:var(--gray-400);">—</span>'}</td>
                    <td class="col-stock">
                        <span class="badge ${lowStock ? 'badge-warning' : 'badge-success'}">${product.inventory_quantity}</span>
                    </td>
                    <td class="col-status">
                        <span class="status-inline">
                            <span class="badge ${product.is_active ? 'badge-success' : 'badge-danger'}">${product.is_active ? 'Active' : 'Off'}</span>
                            ${isFeatured ? '<span class="badge badge-info" title="Featured" style="padding:0.2rem 0.4rem;"><i class="fas fa-star" aria-hidden="true"></i></span>' : ''}
                        </span>
                    </td>
                    <td class="col-actions">
                        <div class="admin-row-actions">
                            <button type="button" class="btn btn-sm btn-secondary" onclick="editProduct(${product.id})" title="Edit">
                                <i class="fas fa-edit" aria-hidden="true"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-danger" onclick="deleteProduct(${product.id})" title="Delete">
                                <i class="fas fa-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');

        return `
            <div class="admin-products-table-wrap table-container" tabindex="0" role="region" aria-label="Product list">
                <table class="table">
                    <colgroup>
                        <col style="width:7%">
                        <col style="width:34%">
                        <col style="width:14%">
                        <col style="width:8%">
                        <col style="width:8%">
                        <col style="width:7%">
                        <col style="width:12%">
                        <col style="width:10%">
                    </colgroup>
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Name</th>
                            <th>Brand</th>
                            <th>Price</th>
                            <th>Cost</th>
                            <th>Stock</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
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

    renderCategoriesTable(categories, categoryMap, startIndex = 0) {
        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Name</th>
                            <th>Slug</th>
                            <th>Parent</th>
                            <th>Sort Order</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categories.map((category, index) => `
                            <tr title="Database ID: ${category.id} (stable; used by products and API)">
                                <td>${startIndex + index + 1}</td>
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
                                    <button class="btn btn-sm btn-danger" onclick="deleteCategory(${category.id})" style="margin-left: 0.5rem;">
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

        // Same order as API: sort_order then name (stable, sensible row numbers in "#" column)
        filtered.sort((a, b) => {
            const so = (a.sort_order || 0) - (b.sort_order || 0);
            if (so !== 0) return so;
            return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        });

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
            container.innerHTML = this.renderCategoriesTable(paginatedCategories, categoryMap, startIndex);
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
                container.innerHTML = this.renderBrandsTable(response, 0);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-500);"><p>No brands found.</p></div>';
            }

            // Refresh brand dropdown in edit modal if it exists
            refreshBrandDropdown();

        } catch (error) {
            container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error);"><p>Failed to load brands: ${error.message}</p></div>`;
        }
    }

    renderBrandsTable(brands, startIndex = 0) {
        const sorted = [...brands].sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
        );
        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Name</th>
                            <th>Slug</th>
                            <th>Description</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map((brand, index) => `
                            <tr title="Database ID: ${brand.id} (stable; used by products and API)">
                                <td>${startIndex + index + 1}</td>
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
                                    <button class="btn btn-sm btn-danger" onclick="deleteBrand(${brand.id})" style="margin-left: 0.5rem;">
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

    /** Non-blocking toast (alias used by admin-customers.js and other modules). */
    showToast(message, type = 'info') {
        this.showNotification(message, type);
    }

    /**
     * Branded confirmation dialog (replaces window.confirm).
     * @returns {Promise<boolean>} true if confirmed
     */
    showAdminConfirm({
        title = 'Please confirm',
        message = '',
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        danger = false,
    } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'admin-branded-dialog-overlay';
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:11000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
            const box = document.createElement('div');
            box.style.cssText =
                'background:#fff;border-radius:var(--border-radius-lg,12px);max-width:440px;width:100%;box-shadow:var(--shadow-lg);padding:1.5rem 1.5rem 1.25rem;';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'admin-branded-dialog-title');

            const h = document.createElement('h2');
            h.id = 'admin-branded-dialog-title';
            h.textContent = title;
            h.style.cssText =
                'margin:0 0 0.75rem;font-size:1.25rem;color:var(--primary-green);font-weight:600;letter-spacing:-0.02em;';

            const p = document.createElement('p');
            p.textContent = message;
            p.style.cssText =
                'margin:0 0 1.25rem;color:var(--gray-700);line-height:1.55;font-size:0.95rem;white-space:pre-line;';

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end;flex-wrap:wrap;';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-danger';
            cancelBtn.textContent = cancelLabel;

            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
            okBtn.textContent = confirmLabel;

            const cleanup = (result) => {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
                resolve(result);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cleanup(false);
                }
            };

            cancelBtn.addEventListener('click', () => cleanup(false));
            okBtn.addEventListener('click', () => cleanup(true));
            document.addEventListener('keydown', onKey);

            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(okBtn);
            box.appendChild(h);
            box.appendChild(p);
            box.appendChild(btnRow);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            okBtn.focus();
        });
    }

    /**
     * Branded informational alert (replaces window.alert for multi-line / titled notices).
     * @returns {Promise<void>}
     */
    showAdminAlert({ title = 'Notice', message = '', okLabel = 'OK' } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'admin-branded-dialog-overlay';
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:11000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
            const box = document.createElement('div');
            box.style.cssText =
                'background:#fff;border-radius:var(--border-radius-lg,12px);max-width:440px;width:100%;box-shadow:var(--shadow-lg);padding:1.5rem 1.5rem 1.25rem;';
            box.setAttribute('role', 'alertdialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'admin-branded-alert-title');

            const h = document.createElement('h2');
            h.id = 'admin-branded-alert-title';
            h.textContent = title;
            h.style.cssText =
                'margin:0 0 0.75rem;font-size:1.25rem;color:var(--primary-green);font-weight:600;letter-spacing:-0.02em;';

            const p = document.createElement('p');
            p.textContent = message;
            p.style.cssText =
                'margin:0 0 1.25rem;color:var(--gray-700);line-height:1.55;font-size:0.95rem;white-space:pre-line;';

            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'btn btn-primary';
            okBtn.textContent = okLabel;

            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:flex;justify-content:flex-end;';
            btnWrap.appendChild(okBtn);

            const cleanup = () => {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
                resolve();
            };
            const onKey = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    cleanup();
                }
            };

            okBtn.addEventListener('click', cleanup);
            document.addEventListener('keydown', onKey);

            box.appendChild(h);
            box.appendChild(p);
            box.appendChild(btnWrap);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            okBtn.focus();
        });
    }

    /**
     * Simple branded form dialog (replaces window.prompt).
     * @param {Array<{key:string,label:string,placeholder?:string,inputType?:string,required?:boolean}>} inputs
     * @returns {Promise<Record<string,string|null>|null>}
     */
    showAdminInputModal({
        title = '',
        message = '',
        inputs = [],
        submitLabel = 'OK',
        cancelLabel = 'Cancel',
    } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:11000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
            const box = document.createElement('div');
            box.style.cssText =
                'background:#fff;border-radius:var(--border-radius-lg,12px);max-width:440px;width:100%;box-shadow:var(--shadow-lg);padding:1.5rem;';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');

            const h = document.createElement('h2');
            h.textContent = title;
            h.style.cssText =
                'margin:0 0 0.5rem;font-size:1.2rem;color:var(--primary-green);font-weight:600;';
            box.appendChild(h);

            if (message) {
                const pm = document.createElement('p');
                pm.textContent = message;
                pm.style.cssText = 'margin:0 0 1rem;color:var(--gray-600);font-size:0.92rem;line-height:1.5;';
                box.appendChild(pm);
            }

            const form = document.createElement('form');
            form.style.cssText = 'display:flex;flex-direction:column;gap:0.9rem;';
            const els = {};
            for (let i = 0; i < inputs.length; i++) {
                const inp = inputs[i];
                const wrap = document.createElement('div');
                wrap.className = 'form-group';
                const lab = document.createElement('label');
                lab.textContent = inp.label;
                lab.style.cssText = 'display:block;margin-bottom:0.35rem;font-weight:500;font-size:0.88rem;color:var(--gray-800);';
                const input = document.createElement('input');
                const fieldId = `admin-inp-${i}-${String(inp.key).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                input.id = fieldId;
                lab.setAttribute('for', fieldId);
                input.className = 'form-input';
                input.name = inp.key;
                input.type = inp.inputType || 'text';
                input.placeholder = inp.placeholder || '';
                input.required = !!inp.required;
                wrap.appendChild(lab);
                wrap.appendChild(input);
                form.appendChild(wrap);
                els[inp.key] = input;
            }

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end;margin-top:0.75rem;';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-danger';
            cancelBtn.textContent = cancelLabel;
            const subBtn = document.createElement('button');
            subBtn.type = 'submit';
            subBtn.className = 'btn btn-primary';
            subBtn.textContent = submitLabel;
            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(subBtn);
            form.appendChild(btnRow);

            const cleanup = (val) => {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
                resolve(val);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cleanup(null);
                }
            };

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const out = {};
                for (const inp of inputs) {
                    const v = (els[inp.key].value || '').trim();
                    if (inp.required && !v) {
                        els[inp.key].focus();
                        return;
                    }
                    out[inp.key] = v || null;
                }
                cleanup(out);
            });
            cancelBtn.addEventListener('click', () => cleanup(null));
            document.addEventListener('keydown', onKey);

            box.appendChild(form);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            const first = form.querySelector('input');
            if (first) first.focus();
        });
    }

    showProgressModal(title, initialMessage = '') {
        const existingModal = document.getElementById('progressModal');
        if (existingModal) {
            document.body.removeChild(existingModal);
        }

        const modal = document.createElement('div');
        modal.id = 'progressModal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';

        const content = document.createElement('div');
        content.style.cssText = 'background: white; border-radius: var(--border-radius-lg); padding: 2rem; max-width: 600px; width: 90%; box-shadow: var(--shadow-lg);';

        const titleEl = document.createElement('h2');
        titleEl.textContent = title;
        titleEl.style.cssText = 'margin: 0 0 1.5rem 0; color: var(--primary-green); font-size: 1.5rem;';
        content.appendChild(titleEl);

        const messageEl = document.createElement('div');
        messageEl.id = 'progressMessage';
        messageEl.textContent = initialMessage;
        messageEl.style.cssText = 'margin-bottom: 1.5rem; color: var(--gray-600); font-weight: 500;';
        content.appendChild(messageEl);

        const progressSection = document.createElement('div');
        progressSection.style.cssText = 'margin-bottom: 1.5rem;';

        const progressLabel = document.createElement('div');
        progressLabel.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--gray-700);';
        progressLabel.innerHTML = '<span>Overall progress</span><span id="overallPercentLabel">0%</span>';
        progressSection.appendChild(progressLabel);

        const progressWrapper = document.createElement('div');
        progressWrapper.style.cssText = 'width: 100%; height: 1.5rem; background-color: var(--gray-200); border-radius: var(--border-radius); overflow: hidden;';

        const progressBar = document.createElement('div');
        progressBar.id = 'overallProgressBar';
        progressBar.style.cssText = 'height: 100%; background: linear-gradient(90deg, var(--primary-green) 0%, var(--secondary-sage) 100%); width: 0%; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.75rem; font-weight: 600;';
        progressBar.textContent = '0%';

        progressWrapper.appendChild(progressBar);
        progressSection.appendChild(progressWrapper);
        content.appendChild(progressSection);

        const progressInfo = document.createElement('div');
        progressInfo.id = 'progressInfo';
        progressInfo.style.cssText = 'display: flex; justify-content: space-between; font-size: 0.8125rem; color: var(--gray-600); margin-bottom: 1.5rem;';
        progressInfo.innerHTML = '<span id="progressStatus">Working...</span><span id="progressCount">0 products found</span>';
        content.appendChild(progressInfo);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'progressCancelBtn';
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'width: 100%;';
        cancelBtn.addEventListener('click', () => this.cancelActiveLongTask());
        content.appendChild(cancelBtn);

        modal.appendChild(content);
        document.body.appendChild(modal);

        return modal;
    }

    registerActiveLongTask(task) {
        this.activeLongTask = task;
        const cancelBtn = document.getElementById('progressCancelBtn');
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'Cancel';
        }
    }

    clearActiveLongTask() {
        this.activeLongTask = null;
        const cancelBtn = document.getElementById('progressCancelBtn');
        if (cancelBtn) {
            cancelBtn.disabled = true;
        }
    }

    async cancelActiveLongTask() {
        const task = this.activeLongTask;
        if (!task) return;

        const cancelBtn = document.getElementById('progressCancelBtn');
        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.textContent = 'Cancelling...';
        }

        if (task.abortController) {
            task.abortController.abort();
        }
        if (task.cancelUrl) {
            try {
                await fetch(task.cancelUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (e) {
                console.warn('Cancel request failed:', e);
            }
        }
        if (typeof task.onCancel === 'function') {
            task.onCancel();
        }
    }

    updateProgressModal(percentage, message = '', productsFound = 0, stage = null) {
        const progressBar = document.getElementById('overallProgressBar');
        const percentLabel = document.getElementById('overallPercentLabel');
        const progressMessage = document.getElementById('progressMessage');
        const progressStatus = document.getElementById('progressStatus');
        const progressCount = document.getElementById('progressCount');

        const overall = Math.min(100, Math.max(0, Math.round(percentage)));

        if (progressBar) {
            progressBar.style.width = `${overall}%`;
            progressBar.textContent = `${overall}%`;
        }
        if (percentLabel) {
            percentLabel.textContent = `${overall}%`;
        }
        if (progressMessage && message) {
            progressMessage.textContent = message;
        }

        const isComplete = stage === 'complete' || stage === 'saving';
        const isCancelled = stage === 'cancelled';
        const isError = stage === 'error';

        if (progressStatus) {
            if (isCancelled) {
                progressStatus.textContent = 'Cancelled';
            } else if (isError) {
                progressStatus.textContent = 'Error';
            } else if (isComplete) {
                progressStatus.textContent = 'Complete!';
            } else if (stage === 'importing') {
                progressStatus.textContent = 'Importing...';
            } else if (stage === 'scraping_products') {
                progressStatus.textContent = 'Scraping...';
            } else {
                progressStatus.textContent = 'Working...';
            }
        }

        if (progressCount) {
            if (productsFound > 0) {
                progressCount.textContent = `${productsFound} products found`;
            } else if (isCancelled) {
                progressCount.textContent = 'Stopped';
            } else {
                progressCount.textContent = 'In progress...';
            }
        }
    }

    closeProgressModal() {
        this.clearActiveLongTask();
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

    const proceed = await app.showAdminConfirm({
        title: 'Match products to brands?',
        message:
            'H&M Herbs will match catalog products to brands using name prefixes. Many product rows may be updated. Continue?',
        confirmLabel: 'Run match',
        cancelLabel: 'Cancel',
    });
    if (!proceed) return;

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
    const abortController = new AbortController();

    try {
        app.showNotification('Starting product scraping from HM Herbs website...', 'info');
        app.showProgressModal('Scraping Products', 'Initializing and scanning website structure...');
        app.registerActiveLongTask({
            type: 'scrape',
            abortController,
            cancelUrl: `${app.apiBaseUrl}/admin/scrape-products/cancel`
        });

        const response = await fetch(`${app.apiBaseUrl}/admin/scrape-products?progress=true`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${app.authToken}`,
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            signal: abortController.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim() || line.startsWith(':')) continue;

                if (line.startsWith('data: ')) {
                    try {
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;

                        const data = JSON.parse(jsonStr);

                        if (data.type === 'complete') {
                            const productsFound = data.productsFound || 0;
                            const report = data.report || null;
                            app.updateProgressModal(100, `Scraping complete! Found ${productsFound} products.`, productsFound, 'complete');
                            app.showNotification(`Successfully scraped ${productsFound} products!`, 'success');
                            app.loadProducts();
                            setTimeout(() => {
                                app.closeProgressModal();
                                if (report) {
                                    app.showScrapingReport(report);
                                }
                            }, 2000);
                            return;
                        }
                        if (data.type === 'cancelled') {
                            const productsFound = data.productsFound || 0;
                            app.updateProgressModal(
                                productsFound > 0 ? 50 : 0,
                                data.message || 'Scraping cancelled',
                                productsFound,
                                'cancelled'
                            );
                            app.showNotification(data.message || 'Scraping cancelled', 'info');
                            setTimeout(() => app.closeProgressModal(), 1500);
                            return;
                        }
                        if (data.type === 'error') {
                            app.updateProgressModal(0, `Error: ${data.error || 'Scraping failed'}`, 0, 'error');
                            throw new Error(data.error || 'Scraping failed');
                        }

                        const percentage = data.percentage ?? 0;
                        const message = data.message || 'Working...';
                        const productsFound = data.productsFound || 0;
                        const stage = data.stage || null;
                        app.updateProgressModal(percentage, message, productsFound, stage);
                    } catch (e) {
                        if (e.name === 'AbortError') throw e;
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            app.updateProgressModal(0, 'Scraping cancelled', 0, 'cancelled');
            app.showNotification('Scraping cancelled', 'info');
            setTimeout(() => app.closeProgressModal(), 1500);
            return;
        }
        console.error('Scraping error:', error);
        app.updateProgressModal(0, `Error: ${error.message}`, 0, 'error');
        app.showNotification(`Scraping failed: ${error.message}`, 'error');
        setTimeout(() => app.closeProgressModal(), 5000);
    } finally {
        app.clearActiveLongTask();
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
    closeBtn.innerHTML = HM_CLOSE_ICON_SVG;
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
        { type: 'input', label: 'Cost', id: `${isEdit ? 'edit' : 'add'}-cost-price`, name: 'cost_price', inputType: 'number', step: '0.01', min: '0' },
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
    fields.forEach((field) => {
        const isBasicInfo = field.name === 'sku' || field.name === 'name' ||
            field.name === 'short_description' || field.name === 'long_description' ||
            field.name === 'health_categories';
        const isPricing = field.name === 'price' || field.name === 'compare_price' || field.name === 'cost_price' ||
            field.name === 'inventory_quantity' || field.name === 'low_stock_threshold' ||
            field.name === 'brand_id' || field.name === 'category_id' ||
            field.name === 'weight';
        const isRowField = field.name === 'price' || field.name === 'cost_price' || field.name === 'compare_price' ||
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

    if (isEdit) {
        const octoposCostSection = document.createElement('div');
        octoposCostSection.style.marginBottom = '2rem';
        octoposCostSection.style.paddingBottom = '1.5rem';
        octoposCostSection.style.borderBottom = '1px solid var(--gray-200)';
        const octTitle = document.createElement('h3');
        octTitle.textContent = 'Octopos cost';
        octTitle.style.fontSize = '1.1rem';
        octTitle.style.fontWeight = '600';
        octTitle.style.color = 'var(--primary-green)';
        octTitle.style.marginBottom = '0.75rem';
        octoposCostSection.appendChild(octTitle);
        const octHelp = document.createElement('p');
        octHelp.style.margin = '0 0 1rem';
        octHelp.style.fontSize = '0.875rem';
        octHelp.style.color = 'var(--gray-600)';
        octHelp.textContent = 'Pull cost from your Octopos catalog (matched by SKU). Saving the product also pushes cost to Octopos when linked.';
        octoposCostSection.appendChild(octHelp);
        const octStatus = document.createElement('p');
        octStatus.id = 'edit-octopos-cost-status';
        octStatus.style.margin = '0 0 0.75rem';
        octStatus.style.fontSize = '0.85rem';
        octStatus.style.color = 'var(--gray-500)';
        octStatus.textContent = 'Octopos link: not loaded yet';
        octoposCostSection.appendChild(octStatus);
        const octBtns = document.createElement('div');
        octBtns.style.display = 'flex';
        octBtns.style.flexWrap = 'wrap';
        octBtns.style.gap = '0.5rem';
        const pullBtn = document.createElement('button');
        pullBtn.type = 'button';
        pullBtn.className = 'btn btn-secondary btn-sm';
        pullBtn.id = 'edit-pull-octopos-cost-btn';
        pullBtn.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i> Pull cost from Octopos';
        const pushBtn = document.createElement('button');
        pushBtn.type = 'button';
        pushBtn.className = 'btn btn-secondary btn-sm';
        pushBtn.id = 'edit-push-octopos-cost-btn';
        pushBtn.innerHTML = '<i class="fas fa-upload" aria-hidden="true"></i> Push cost to Octopos';
        octBtns.appendChild(pullBtn);
        octBtns.appendChild(pushBtn);
        octoposCostSection.appendChild(octBtns);
        form.appendChild(octoposCostSection);
    }

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
    inputLabel.setAttribute('for', unifiedInput.id);

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
    previewContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(180px, 1fr))';
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
            app.showNotification('Please log in to upload images', 'error');
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
                    app.showNotification(`${file.name} is not an image file — skipped.`, 'error');
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
                    app.showNotification(`Failed to upload ${file.name}: ${error.error || 'Unknown error'}`, 'error');
                }
            }
        } catch (error) {
            console.error('Error uploading images:', error);
            app.showNotification('Error uploading images. Please try again.', 'error');
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
            window.adminApp.showNotification(
                'Enter a valid image URL (http:// or https://) or use Browse to select files.',
                'error'
            );
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
    unifiedInput.addEventListener('paste', function () {
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
            imageCard.style.minWidth = '0';
            imageCard.style.boxSizing = 'border-box';
            imageCard.style.overflow = 'hidden';

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
            buttonRow.style.flexDirection = 'column';
            buttonRow.style.gap = '0.5rem';
            buttonRow.style.marginTop = '0.5rem';
            buttonRow.style.width = '100%';
            buttonRow.style.minWidth = '0';

            if (!imageData.isPrimary) {
                const setPrimaryBtn = document.createElement('button');
                setPrimaryBtn.setAttribute('type', 'button');
                setPrimaryBtn.textContent = 'Set Primary';
                setPrimaryBtn.className = 'btn btn-sm btn-secondary';
                setPrimaryBtn.style.width = '100%';
                setPrimaryBtn.style.boxSizing = 'border-box';
                setPrimaryBtn.style.fontSize = '0.75rem';
                setPrimaryBtn.onclick = function () {
                    selectedImages.forEach(img => img.isPrimary = false);
                    imageData.isPrimary = true;
                    updateImagePreview();
                };
                buttonRow.appendChild(setPrimaryBtn);
            } else {
                // Reserve the same vertical space as "Set Primary" so Remove lines up with other cards
                const primarySlot = document.createElement('button');
                primarySlot.setAttribute('type', 'button');
                primarySlot.className = 'btn btn-sm btn-secondary';
                primarySlot.textContent = 'Set Primary';
                primarySlot.disabled = true;
                primarySlot.setAttribute('aria-hidden', 'true');
                primarySlot.tabIndex = -1;
                primarySlot.style.visibility = 'hidden';
                primarySlot.style.width = '100%';
                primarySlot.style.boxSizing = 'border-box';
                primarySlot.style.fontSize = '0.75rem';
                primarySlot.style.pointerEvents = 'none';
                primarySlot.style.margin = '0';
                buttonRow.appendChild(primarySlot);
            }

            const removeBtn = document.createElement('button');
            removeBtn.setAttribute('type', 'button');
            removeBtn.textContent = 'Remove';
            removeBtn.className = 'btn btn-sm btn-danger';
            removeBtn.style.width = '100%';
            removeBtn.style.boxSizing = 'border-box';
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

    // Cannabis / hemp — Certificate of Analysis (COA)
    const cannabisSection = document.createElement('div');
    cannabisSection.style.marginBottom = '2.5rem';
    cannabisSection.style.paddingBottom = '2rem';
    cannabisSection.style.borderBottom = '1px solid var(--gray-200)';

    const sectionTitleCoa = document.createElement('h3');
    sectionTitleCoa.textContent = 'Cannabis / hemp (COA)';
    sectionTitleCoa.style.fontSize = '1.1rem';
    sectionTitleCoa.style.fontWeight = '600';
    sectionTitleCoa.style.color = 'var(--primary-green)';
    sectionTitleCoa.style.marginBottom = '0.75rem';
    cannabisSection.appendChild(sectionTitleCoa);

    const coaHelp = document.createElement('p');
    coaHelp.textContent = 'Mark products that are hemp or cannabis-derived and link the current Certificate of Analysis (PDF).';
    coaHelp.style.fontSize = '0.875rem';
    coaHelp.style.color = 'var(--gray-600)';
    coaHelp.style.marginBottom = '1.25rem';
    coaHelp.style.lineHeight = '1.5';
    cannabisSection.appendChild(coaHelp);

    const cannabisCheckGroup = document.createElement('div');
    cannabisCheckGroup.className = 'form-group';
    cannabisCheckGroup.style.marginBottom = '1.25rem';
    const cannabisLabel = document.createElement('label');
    cannabisLabel.style.display = 'flex';
    cannabisLabel.style.alignItems = 'center';
    cannabisLabel.style.cursor = 'pointer';
    cannabisLabel.style.fontWeight = '500';
    const cannabisCb = document.createElement('input');
    cannabisCb.type = 'checkbox';
    cannabisCb.id = `${isEdit ? 'edit' : 'add'}-is-cannabis`;
    cannabisCb.name = 'is_cannabis';
    cannabisCb.style.marginRight = '0.75rem';
    cannabisCb.style.width = '1.25rem';
    cannabisCb.style.height = '1.25rem';
    cannabisLabel.appendChild(cannabisCb);
    cannabisLabel.appendChild(document.createTextNode(' Cannabis / hemp product (requires COA)'));
    cannabisCheckGroup.appendChild(cannabisLabel);
    cannabisSection.appendChild(cannabisCheckGroup);

    const coaUrlGroup = document.createElement('div');
    coaUrlGroup.className = 'form-group';
    coaUrlGroup.style.marginBottom = '1.25rem';
    const coaUrlLabel = document.createElement('label');
    coaUrlLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-coa-url`);
    coaUrlLabel.textContent = 'COA document URL (PDF)';
    coaUrlLabel.style.display = 'block';
    coaUrlLabel.style.marginBottom = '0.5rem';
    coaUrlLabel.style.fontWeight = '500';
    const coaUrlInput = document.createElement('input');
    coaUrlInput.type = 'text';
    coaUrlInput.id = `${isEdit ? 'edit' : 'add'}-coa-url`;
    coaUrlInput.name = 'coa_url';
    coaUrlInput.placeholder = 'Set automatically after upload, or paste https://… or /uploads/coa/…';
    coaUrlInput.className = 'form-input';
    coaUrlGroup.appendChild(coaUrlLabel);
    coaUrlGroup.appendChild(coaUrlInput);
    cannabisSection.appendChild(coaUrlGroup);

    const coaUploadGroup = document.createElement('div');
    coaUploadGroup.className = 'form-group';
    coaUploadGroup.style.marginBottom = '1.25rem';
    const uploadLabel = document.createElement('label');
    uploadLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-coa-file`);
    uploadLabel.textContent = 'Upload COA (PDF, max 15MB)';
    uploadLabel.style.display = 'block';
    uploadLabel.style.marginBottom = '0.5rem';
    uploadLabel.style.fontWeight = '500';
    const coaFileInput = document.createElement('input');
    coaFileInput.type = 'file';
    coaFileInput.accept = '.pdf,application/pdf';
    coaFileInput.id = `${isEdit ? 'edit' : 'add'}-coa-file`;
    coaFileInput.className = 'form-input';
    coaFileInput.style.padding = '0.35rem 0';
    const coaUploadStatus = document.createElement('p');
    coaUploadStatus.id = `${isEdit ? 'edit' : 'add'}-coa-upload-status`;
    coaUploadStatus.style.fontSize = '0.8125rem';
    coaUploadStatus.style.color = 'var(--gray-600)';
    coaUploadStatus.style.marginTop = '0.5rem';
    coaUploadStatus.style.marginBottom = '0';
    coaUploadStatus.textContent = '';

    coaFileInput.addEventListener('change', async function handleCoaFile() {
        const file = coaFileInput.files && coaFileInput.files[0];
        if (!file) return;
        coaUploadStatus.textContent = '';
        coaUploadStatus.style.color = 'var(--gray-600)';
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            coaUploadStatus.textContent = 'Please choose a .pdf file.';
            coaUploadStatus.style.color = '#b91c1c';
            coaFileInput.value = '';
            return;
        }
        const app = window.adminApp;
        if (!app || !app.authToken) {
            coaUploadStatus.textContent = 'Please log in to upload.';
            coaUploadStatus.style.color = '#b91c1c';
            return;
        }
        coaUploadStatus.textContent = 'Uploading…';
        try {
            const fd = new FormData();
            fd.append('coa', file);
            const response = await fetch(`${app.apiBaseUrl}/admin/products/upload-coa`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.authToken}`
                },
                body: fd
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.url) {
                coaUrlInput.value = data.url;
                const dateEl = document.getElementById(`${isEdit ? 'edit' : 'add'}-coa-updated-at`);
                if (dateEl && !dateEl.value) {
                    dateEl.value = new Date().toISOString().slice(0, 10);
                }
                coaUploadStatus.textContent = 'Uploaded — URL filled below. Save the product to keep changes.';
                coaUploadStatus.style.color = 'var(--primary-green, #059669)';
            } else {
                coaUploadStatus.textContent = data.error || 'Upload failed.';
                coaUploadStatus.style.color = '#b91c1c';
            }
        } catch (err) {
            console.error('COA upload error:', err);
            coaUploadStatus.textContent = 'Upload failed. Check your connection and try again.';
            coaUploadStatus.style.color = '#b91c1c';
        } finally {
            coaFileInput.value = '';
        }
    });

    coaUploadGroup.appendChild(uploadLabel);
    coaUploadGroup.appendChild(coaFileInput);
    coaUploadGroup.appendChild(coaUploadStatus);
    cannabisSection.appendChild(coaUploadGroup);

    const coaDateGroup = document.createElement('div');
    coaDateGroup.className = 'form-group';
    coaDateGroup.style.marginBottom = '0';
    const coaDateLabel = document.createElement('label');
    coaDateLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-coa-updated-at`);
    coaDateLabel.textContent = 'COA date (batch / as-of)';
    coaDateLabel.style.display = 'block';
    coaDateLabel.style.marginBottom = '0.5rem';
    coaDateLabel.style.fontWeight = '500';
    const coaDateInput = document.createElement('input');
    coaDateInput.type = 'date';
    coaDateInput.id = `${isEdit ? 'edit' : 'add'}-coa-updated-at`;
    coaDateInput.name = 'coa_updated_at';
    coaDateInput.className = 'form-input';
    coaDateGroup.appendChild(coaDateLabel);
    coaDateGroup.appendChild(coaDateInput);
    cannabisSection.appendChild(coaDateGroup);

    form.appendChild(cannabisSection);

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
    cancelBtn.className = 'btn btn-danger';
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
            const costEl = document.getElementById('edit-cost-price');
            if (costEl) costEl.value = product.cost_price != null ? product.cost_price : '';
            document.getElementById('edit-compare-price').value = product.compare_price || '';
            const octStatus = document.getElementById('edit-octopos-cost-status');
            if (octStatus) {
                if (product.octopos_product_id) {
                    const synced = product.cost_synced_at
                        ? ` · last sync ${new Date(product.cost_synced_at).toLocaleString()}`
                        : '';
                    octStatus.textContent = `Linked to Octopos product #${product.octopos_product_id}${synced}`;
                    octStatus.style.color = 'var(--gray-600)';
                } else {
                    octStatus.textContent = 'Not linked to Octopos — use Pull cost from Octopos to match by SKU.';
                    octStatus.style.color = 'var(--gray-500)';
                }
            }
            const pullOctBtn = document.getElementById('edit-pull-octopos-cost-btn');
            if (pullOctBtn && !pullOctBtn.dataset.bound) {
                pullOctBtn.dataset.bound = '1';
                pullOctBtn.addEventListener('click', () => window.adminApp.syncOneProductCostFromOctopos(productId));
            }
            const pushOctBtn = document.getElementById('edit-push-octopos-cost-btn');
            if (pushOctBtn && !pushOctBtn.dataset.bound) {
                pushOctBtn.dataset.bound = '1';
                pushOctBtn.addEventListener('click', () => window.adminApp.pushOneProductCostToOctopos(productId));
            }
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

            const editCannabis = document.getElementById('edit-is-cannabis');
            if (editCannabis) {
                editCannabis.checked = product.is_cannabis === true ||
                    product.is_cannabis === 1 ||
                    product.is_cannabis === '1' ||
                    product.is_cannabis === 'true';
            }
            const editCoaUrl = document.getElementById('edit-coa-url');
            if (editCoaUrl) editCoaUrl.value = product.coa_url || '';
            const editCoaDate = document.getElementById('edit-coa-updated-at');
            if (editCoaDate && product.coa_updated_at) {
                const raw = product.coa_updated_at;
                const ymd = typeof raw === 'string' ? raw.slice(0, 10) : '';
                editCoaDate.value = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : '';
            }

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
            if (key === 'is_active' || key === 'is_featured' || key === 'is_cannabis') {
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
        if (!formData.has('is_cannabis')) productData.is_cannabis = false;

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
            if (key === 'is_active' || key === 'is_featured' || key === 'is_cannabis') {
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
        if (!formData.has('is_cannabis')) productData.is_cannabis = false;

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
            if (window.adminApp && typeof window.adminApp.loadProducts === 'function') {
                window.adminApp.loadProducts();
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
    if (window.adminApp && typeof window.adminApp.showOrderDetail === 'function') {
        window.adminApp.showOrderDetail(orderId);
    }
}

function editEDSABooking(bookingId) {
    if (window.adminApp && typeof window.adminApp.openEdsaBookingModal === 'function') {
        window.adminApp.openEdsaBookingModal(bookingId);
    }
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
    closeBtn.innerHTML = HM_CLOSE_ICON_SVG;
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
    logoLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-brand-logo-file`);
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

    const urlFieldLabel = document.createElement('label');
    urlFieldLabel.setAttribute('for', `${isEdit ? 'edit' : 'add'}-brand-logo`);
    urlFieldLabel.textContent = 'Or enter logo URL';
    urlFieldLabel.style.display = 'block';
    urlFieldLabel.style.marginTop = '0.75rem';
    urlFieldLabel.style.marginBottom = '0.35rem';
    urlFieldLabel.style.fontWeight = '500';
    urlFieldLabel.style.color = 'var(--gray-700)';
    urlFieldLabel.style.fontSize = '0.875rem';
    logoSection.appendChild(urlFieldLabel);

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
    cancelBtn.className = 'btn btn-danger';
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
    const app = window.adminApp;
    let name = brandName;
    if (!name) {
        const id = Number(brandId);
        const found = (app.allBrands || []).find((b) => Number(b.id) === id);
        name = found?.name || `Brand #${brandId}`;
    }
    const ok = await app.showAdminConfirm({
        title: 'Delete this brand?',
        message: `Remove “${name}” from the catalog? This cannot be undone.`,
        confirmLabel: 'Delete brand',
        cancelLabel: 'Cancel',
        danger: true,
    });
    if (!ok) return;

    try {
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
    closeBtn.innerHTML = HM_CLOSE_ICON_SVG;
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
    cancelBtn.className = 'btn btn-danger';
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
    const app = window.adminApp;
    let name = categoryName;
    if (!name) {
        const id = Number(categoryId);
        const found = (app.allCategories || []).find((c) => Number(c.id) === id);
        name = found?.name || `Category #${categoryId}`;
    }
    const okCat = await app.showAdminConfirm({
        title: 'Delete this category?',
        message: `Remove “${name}”? This cannot be undone.`,
        confirmLabel: 'Delete category',
        cancelLabel: 'Cancel',
        danger: true,
    });
    if (!okCat) return;

    try {
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
    const app = window.adminApp;
    let name = productName;
    if (!name) {
        const id = Number(productId);
        const found = (app.allProducts || []).find((p) => Number(p.id) === id);
        name = found?.name || `Product #${productId}`;
    }
    const okDel = await app.showAdminConfirm({
        title: 'Delete this product?',
        message: `Remove “${productName}” from the catalog? This cannot be undone.`,
        confirmLabel: 'Delete product',
        cancelLabel: 'Cancel',
        danger: true,
    });
    if (!okDel) return;

    try {
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

    const go = await app.showAdminConfirm({
        title: 'Match products to categories?',
        message:
            'H&M Herbs will match catalog products to categories using names and descriptions. Many rows may be updated. Continue?',
        confirmLabel: 'Run match',
        cancelLabel: 'Cancel',
    });
    if (!go) return;

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

    const marketingHubForm = document.getElementById('marketing-hub-form');
    if (marketingHubForm && window.adminApp) {
        marketingHubForm.addEventListener('submit', (ev) => window.adminApp.saveMarketingHub(ev));
    }
    const adminTeamForm = document.getElementById('admin-team-create-form');
    if (adminTeamForm && window.adminApp) {
        adminTeamForm.addEventListener('submit', (ev) => window.adminApp.handleCreateTeamMember(ev));
    }
    const adminTeamRefresh = document.getElementById('admin-team-refresh-btn');
    if (adminTeamRefresh && window.adminApp) {
        adminTeamRefresh.addEventListener('click', () => window.adminApp.loadAdminTeam());
    }
    const employeeDiscountForm = document.getElementById('employee-discount-settings-form');
    if (employeeDiscountForm && window.adminApp) {
        employeeDiscountForm.addEventListener('submit', (ev) => window.adminApp.saveEmployeeDiscountSettings(ev));
    }
    const employeeDiscountReloadBtn = document.getElementById('employee-discount-reload-btn');
    if (employeeDiscountReloadBtn && window.adminApp) {
        employeeDiscountReloadBtn.addEventListener('click', () => window.adminApp.loadEmployeeDiscountSettings());
    }
    const storeInfoForm = document.getElementById('store-info-settings-form');
    if (storeInfoForm && window.adminApp) {
        storeInfoForm.addEventListener('submit', (ev) => window.adminApp.saveStoreInfoSettings(ev));
    }
    const storeInfoReloadBtn = document.getElementById('store-info-reload-btn');
    if (storeInfoReloadBtn && window.adminApp) {
        storeInfoReloadBtn.addEventListener('click', () => window.adminApp.loadStoreInfoSettings());
    }
    const storeHoursSyncGoogleBtn = document.getElementById('store-hours-sync-google-btn');
    if (storeHoursSyncGoogleBtn && window.adminApp) {
        storeHoursSyncGoogleBtn.addEventListener('click', () => window.adminApp.syncStoreHoursToGoogleBusiness());
    }
    const gbpConnectBtn = document.getElementById('gbp-connect-btn');
    if (gbpConnectBtn && window.adminApp) {
        gbpConnectBtn.addEventListener('click', () => window.adminApp.connectGoogleBusiness());
    }
    const gbpDisconnectBtn = document.getElementById('gbp-disconnect-btn');
    if (gbpDisconnectBtn && window.adminApp) {
        gbpDisconnectBtn.addEventListener('click', () => window.adminApp.disconnectGoogleBusiness());
    }
    const gbpSaveLocationBtn = document.getElementById('gbp-save-location-btn');
    if (gbpSaveLocationBtn && window.adminApp) {
        gbpSaveLocationBtn.addEventListener('click', () => window.adminApp.saveGoogleBusinessLocation());
    }
    const gcalConnectBtn = document.getElementById('gcal-connect-btn');
    if (gcalConnectBtn && window.adminApp) {
        gcalConnectBtn.addEventListener('click', () => window.adminApp.connectGoogleCalendar());
    }
    const gcalDisconnectBtn = document.getElementById('gcal-disconnect-btn');
    if (gcalDisconnectBtn && window.adminApp) {
        gcalDisconnectBtn.addEventListener('click', () => window.adminApp.disconnectGoogleCalendar());
    }
    const gcalSaveCalendarBtn = document.getElementById('gcal-save-calendar-btn');
    if (gcalSaveCalendarBtn && window.adminApp) {
        gcalSaveCalendarBtn.addEventListener('click', () => window.adminApp.saveGoogleCalendarSelection());
    }
    const gcalCalendarSelect = document.getElementById('gcal-calendar-select');
    if (gcalCalendarSelect && window.adminApp) {
        gcalCalendarSelect.addEventListener('change', () => {
            const manual = document.getElementById('gcal-calendar-manual');
            if (manual && gcalCalendarSelect.value) manual.value = gcalCalendarSelect.value;
        });
    }
    const promoPresetSelect = document.getElementById('promo-preset');
    if (promoPresetSelect && window.adminApp) {
        promoPresetSelect.addEventListener('change', () => window.adminApp._togglePromoCustomColors());
    }
    const promoIconUploadBtn = document.getElementById('promo-icon-upload-btn');
    if (promoIconUploadBtn && window.adminApp) {
        promoIconUploadBtn.addEventListener('click', () => window.adminApp.uploadPromoBannerIcon());
    }
    const promoIconClearBtn = document.getElementById('promo-icon-clear-btn');
    if (promoIconClearBtn && window.adminApp) {
        promoIconClearBtn.addEventListener('click', () => window.adminApp.clearPromoBannerUploadedIcon());
    }
    const promoBannerSaveBtn = document.getElementById('promo-banner-save-btn');
    if (promoBannerSaveBtn && window.adminApp) {
        promoBannerSaveBtn.addEventListener('click', () => window.adminApp.savePromoBannerSettings());
    }
    if (window.adminApp) {
        window.adminApp.bindPromoProductLinkSearch();
    }
    const holidayTemplateType = document.getElementById('holiday-template-type');
    if (holidayTemplateType && window.adminApp) {
        holidayTemplateType.addEventListener('change', () => window.adminApp._toggleCustomHolidayFields());
    }
    const holidayCustomStatus = document.getElementById('holiday-custom-status');
    if (holidayCustomStatus && window.adminApp) {
        holidayCustomStatus.addEventListener('change', () => window.adminApp._toggleCustomHolidayTimeRange());
    }
    const holidayAddBtn = document.getElementById('holiday-add-btn');
    if (holidayAddBtn && window.adminApp) {
        holidayAddBtn.addEventListener('click', () => window.adminApp.addHolidayFromSelection());
    }
    const holidayList = document.getElementById('holiday-list');
    if (holidayList && window.adminApp) {
        holidayList.addEventListener('click', (ev) => {
            const target = ev.target;
            if (!(target instanceof Element)) return;
            const revertBtn = target.closest('[data-holiday-revert]');
            if (revertBtn) {
                const revertIdx = Number(revertBtn.getAttribute('data-holiday-revert'));
                if (Number.isFinite(revertIdx)) window.adminApp.revertHolidayToDefaultAt(revertIdx);
                return;
            }
            const btn = target.closest('[data-holiday-remove]');
            if (!btn) return;
            const idx = Number(btn.getAttribute('data-holiday-remove'));
            if (Number.isFinite(idx)) window.adminApp.removeHolidayAt(idx);
        });
    }
    const integrationLogsRefreshBtn = document.getElementById('integration-logs-refresh-btn');
    if (integrationLogsRefreshBtn && window.adminApp) {
        integrationLogsRefreshBtn.addEventListener('click', () => window.adminApp.loadIntegrationLogs());
    }
    const integrationLogsClearBtn = document.getElementById('integration-logs-clear-btn');
    if (integrationLogsClearBtn && window.adminApp) {
        integrationLogsClearBtn.addEventListener('click', () => window.adminApp.clearIntegrationLogs());
    }
    const devToolsBackupBtn = document.getElementById('dev-tools-backup-btn');
    if (devToolsBackupBtn && window.adminApp) {
        devToolsBackupBtn.addEventListener('click', () => window.adminApp.downloadDatabaseBackup());
    }
    const devToolsRunMigrationsBtn = document.getElementById('dev-tools-run-migrations-btn');
    if (devToolsRunMigrationsBtn && window.adminApp) {
        devToolsRunMigrationsBtn.addEventListener('click', () => window.adminApp.runPendingMigrations());
    }
    const promoForm = document.getElementById('promo-editor-form');
    if (promoForm && window.adminApp) {
        window.adminApp.initPromoProductPickers();
        window.adminApp.initPromoDatetimeUi();
        window.adminApp._promoFillDatetimePartsFromHidden('starts');
        window.adminApp._promoFillDatetimePartsFromHidden('ends');
        promoForm.addEventListener('submit', (ev) => window.adminApp.submitPromoForm(ev));
    }
    const promoResetBtn = document.getElementById('promo-editor-reset-btn');
    if (promoResetBtn && window.adminApp) {
        promoResetBtn.addEventListener('click', () => window.adminApp.resetPromoEditor());
    }
    const promoScopeSel = document.getElementById('promo-form-scope');
    if (promoScopeSel && window.adminApp) {
        promoScopeSel.addEventListener('change', () => window.adminApp._togglePromoScopeHints());
    }

    const promoEditorOpenNewBtn = document.getElementById('promo-editor-open-new-btn');
    if (promoEditorOpenNewBtn && window.adminApp) {
        promoEditorOpenNewBtn.addEventListener('click', () => {
            window.adminApp.resetPromoEditor();
            window.adminApp.openPromoEditorModal();
        });
    }
    const promoEditorModalClose = document.getElementById('promo-editor-modal-close');
    if (promoEditorModalClose && window.adminApp) {
        promoEditorModalClose.addEventListener('click', () => window.adminApp.closePromoEditorModal());
    }
    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        const m = document.getElementById('promo-editor-modal');
        if (!m || m.hidden || !window.adminApp) return;
        if (document.querySelector('.admin-branded-dialog-overlay')) return;

        const app = window.adminApp;
        const linkRes = document.getElementById('promo-product-link-results');
        if (
            linkRes &&
            !linkRes.hasAttribute('hidden') &&
            String(linkRes.style.display || '') !== 'none'
        ) {
            app._promoProductLinkHidePanel();
            ev.preventDefault();
            return;
        }
        let closedPanel = false;
        for (const k of app._promoAllProdSearchKinds()) {
            const res = app._promoProdPickerElements(k)?.res;
            if (res && !res.hidden) {
                app._promoHideProdResults(k);
                closedPanel = true;
            }
        }
        if (closedPanel) {
            ev.preventDefault();
            return;
        }
        app.closePromoEditorModal();
        ev.preventDefault();
    });

    const promotionsTableBody = document.getElementById('promotions-table-body');
    if (promotionsTableBody && window.adminApp) {
        promotionsTableBody.addEventListener('click', (ev) => {
            const target = ev.target;
            if (!(target instanceof Element)) return;
            const editBtn = target.closest('[data-promo-edit]');
            if (editBtn) {
                const id = Number(editBtn.getAttribute('data-promo-edit'));
                if (!window.adminApp) return;
                window.adminApp
                    .apiRequest(`/admin/promotions/${id}`)
                    .then((row) => {
                        if (row && row.id) window.adminApp.fillPromoEditor(row);
                    })
                    .catch(() => window.adminApp.showToast('Could not load promotion for editing.', 'error'));
                return;
            }
            const delBtn = target.closest('[data-promo-delete]');
            if (delBtn && window.adminApp) {
                const id = Number(delBtn.getAttribute('data-promo-delete'));
                window.adminApp.deletePromoById(id);
            }
        });
    }

    // Sidebar toggle functionality (desktop and mobile)
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const mobileToggle = document.getElementById('mobileSidebarToggle');
    const sidebar = document.getElementById('adminSidebar');
    const mainContent = document.querySelector('.main-content');

    if (sidebar && mainContent) {
        // Helper: keeps body class in sync with sidebar state so the toggle
        // button can be repositioned via CSS (fallback when :has() is unavailable).
        const syncSidebarState = () => {
            const isCollapsed = sidebar.classList.contains('collapsed');
            document.body.classList.toggle('sidebar-is-collapsed', isCollapsed);
            const icon = document.getElementById('sidebarToggleIcon');
            if (icon) icon.className = isCollapsed ? 'fas fa-bars' : 'fas fa-times';
        };

        // Desktop sidebar toggle
        if (sidebarToggleBtn) {
            sidebarToggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('sidebar-collapsed');
                syncSidebarState();
                localStorage.setItem('adminSidebarCollapsed', sidebar.classList.contains('collapsed'));
            });

            // Restore sidebar state
            const wasCollapsed = localStorage.getItem('adminSidebarCollapsed') === 'true';
            if (wasCollapsed) {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('sidebar-collapsed');
            }
            syncSidebarState();
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

// HM Herbs Admin Panel - Customers & Gift Cards module.
/* global AdminApp */
// Augments AdminApp.prototype with the methods used by the Customers and
// Gift Cards admin sections. This file must load AFTER admin-app.js.

(function () {
    'use strict';
    if (typeof AdminApp === 'undefined') {
        console.error('admin-customers.js: AdminApp not found - load admin-app.js first');
        return;
    }

    const $ = (id) => document.getElementById(id);
    const fmtMoney = (n, currency = 'USD') => {
        const v = Number(n) || 0;
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v);
    };
    const fmtNumber = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';
    const fmtDateTime = (d) => d ? new Date(d).toLocaleString() : '—';
    /** mysql2 / JSON may yield Date, ISO string, or YYYY-MM-DD — <input type="date"> needs YYYY-MM-DD */
    const toDateInputValue = (raw) => {
        if (raw == null || raw === '') return '';
        if (typeof raw === 'string') {
            const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
            if (m) return m[1];
        }
        const d = raw instanceof Date ? raw : new Date(raw);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`;
    };
    const esc = (s) => {
        if (s === null || s === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    };

    function debounce(fn, ms = 300) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    const HM_MODAL_CLOSE_BTN =
        '<button type="button" class="modal-close" onclick="this.closest(\'.modal\').remove()" aria-label="Close">' +
        '<svg class="cart-close-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
        '<path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg></button>';

    // -----------------------------------------------------------------------
    // Modal helpers
    // -----------------------------------------------------------------------
    function openModal(html) {
        const root = $('adminModalRoot');
        if (!root) return null;
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = 'display:flex;position:fixed;z-index:10000;inset:0;background:rgba(0,0,0,0.6);align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow-y:auto;';
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
    function closeAllModals() {
        document.querySelectorAll('#adminModalRoot .modal').forEach(m => m.remove());
    }

    // =======================================================================
    // CUSTOMERS
    // =======================================================================

    AdminApp.prototype._customerState = function _customerState() {
        if (!this.customersState) {
            this.customersState = { page: 1, limit: 25, total: 0, sort: 'recent', search: '', status: '', type: '' };
        }
        return this.customersState;
    };

    AdminApp.prototype.loadCustomers = async function () {
        if (!this._customerListenersBound) {
            this._customerListenersBound = true;
            const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
            $('customersSearchInput')?.addEventListener('input', debounce(() => {
                this._customerState().search = $('customersSearchInput').value.trim();
                this._customerState().page = 1;
                this.loadCustomers();
            }));
            ['customersStatusFilter','customersTypeFilter','customersSortFilter'].forEach(id => {
                $(id)?.addEventListener('change', () => {
                    const s = this._customerState();
                    s.status = $('customersStatusFilter').value;
                    s.type   = $('customersTypeFilter').value;
                    s.sort   = $('customersSortFilter').value;
                    s.page   = 1;
                    this.loadCustomers();
                });
            });
        }

        await this.loadCustomerStats();

        const container = $('customersTable');
        if (!container) return;
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading customers...</div>';

        const s = this._customerState();
        const params = new URLSearchParams({
            page: s.page, limit: s.limit, sort: s.sort
        });
        if (s.search) params.set('search', s.search);
        if (s.status) params.set('status', s.status);
        if (s.type) params.set('type', s.type);

        try {
            const data = await this.apiRequest(`/admin/customers?${params}`);
            if (!data) return;

            if (!data.customers || data.customers.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--gray-500);"><i class="fas fa-users" style="font-size:3rem;opacity:0.3;display:block;margin-bottom:1rem;"></i><p>No customers found.</p></div>';
                $('customersPagination').innerHTML = '';
                return;
            }

            container.innerHTML = `
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Customer #</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th>Orders</th>
                                <th>Spent</th>
                                <th>Loyalty</th>
                                <th>Gift Cards</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.customers.map(c => `
                                <tr>
                                    <td><code style="font-size:0.85em;">${esc(c.customer_number || '—')}</code></td>
                                    <td><strong>${esc((c.first_name || '') + ' ' + (c.last_name || ''))}</strong></td>
                                    <td>${esc(c.email)}</td>
                                    <td>${esc(c.phone || '—')}</td>
                                    <td>${this._statusBadge(c.customer_status)}</td>
                                    <td>${fmtNumber(c.total_orders)}</td>
                                    <td>${fmtMoney(c.lifetime_value)}</td>
                                    <td>${fmtNumber(c.points_balance || 0)} pts ${c.tier ? `<small style="color:var(--gray-500);">(${esc(c.tier)})</small>` : ''}</td>
                                    <td>${c.gift_card_count > 0 ? `${c.gift_card_count} (${fmtMoney(c.gift_card_balance)})` : '—'}</td>
                                    <td>${fmtDate(c.created_at)}</td>
                                    <td>
                                        <button class="btn btn-sm btn-secondary" onclick="adminApp.showCustomerProfile(${c.id})">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;

            this._renderPagination('customersPagination', data.pagination, (page) => {
                this._customerState().page = page;
                this.loadCustomers();
            });
        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--error);">Failed to load customers: ${esc(err.message)}</div>`;
        }
    };

    AdminApp.prototype._statusBadge = function (status) {
        const colors = {
            active:    'background:#dcfce7;color:#166534;',
            vip:       'background:#fef3c7;color:#92400e;',
            inactive:  'background:#f3f4f6;color:#374151;',
            blocked:   'background:#fee2e2;color:#991b1b;',
        };
        const style = colors[status] || colors.active;
        return `<span style="display:inline-block;padding:0.125rem 0.5rem;border-radius:9999px;font-size:0.75rem;font-weight:600;text-transform:capitalize;${style}">${esc(status || 'active')}</span>`;
    };

    AdminApp.prototype.loadCustomerStats = async function () {
        try {
            const stats = await this.apiRequest('/admin/customers/stats');
            if (!stats) return;
            $('statTotalCustomers').textContent = fmtNumber(stats.total_customers);
            $('statNewCustomers').textContent = fmtNumber(stats.new_30_days);
            $('statLoyaltyMembers').textContent = fmtNumber(stats.loyalty_members);
            $('statLoyaltyPoints').textContent = fmtNumber(stats.total_points_outstanding);
            $('statAvgLTV').textContent = fmtMoney(stats.avg_lifetime_value);
        } catch (err) {
            console.warn('Failed to load customer stats', err);
        }
    };

    AdminApp.prototype._renderPagination = function (containerId, pagination, onPage) {
        const el = $(containerId);
        if (!el || !pagination) return;
        const { page, totalPages } = pagination;
        if (totalPages <= 1) { el.innerHTML = ''; return; }
        const btn = (label, target, disabled, active) =>
            `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}" ${disabled ? 'disabled' : ''} onclick="(${onPage.toString()})(${target})">${label}</button>`;
        let html = '';
        html += btn('« First', 1, page === 1);
        html += btn('‹ Prev', page - 1, page === 1);
        const start = Math.max(1, page - 2);
        const end = Math.min(totalPages, page + 2);
        for (let p = start; p <= end; p++) html += btn(p, p, false, p === page);
        html += btn('Next ›', page + 1, page === totalPages);
        html += btn('Last »', totalPages, page === totalPages);
        el.innerHTML = html;
    };

    // -----------------------------------------------------------------------
    // CUSTOMER DETAIL MODAL (tabs)
    // -----------------------------------------------------------------------
    AdminApp.prototype.showCustomerProfile = async function (id) {
        const data = await this.apiRequest(`/admin/customers/${id}`);
        if (!data) return;
        const c = data.customer;
        const tags = (() => {
            try { return Array.isArray(c.tags) ? c.tags : (c.tags ? JSON.parse(c.tags) : []); }
            catch { return []; }
        })();

        const modal = openModal(`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:1.5rem;border-bottom:1px solid var(--gray-200);">
                <div>
                    <h3 style="margin:0;color:var(--primary-green);">${esc(c.first_name)} ${esc(c.last_name)}</h3>
                    <div style="font-size:0.85rem;color:var(--gray-500);"><code>${esc(c.customer_number)}</code> • ${esc(c.email)}</div>
                </div>
                ${HM_MODAL_CLOSE_BTN}
            </div>

            <div style="border-bottom:1px solid var(--gray-200);padding:0 1.5rem;display:flex;gap:0;overflow-x:auto;">
                ${['profile','addresses','orders','gift-cards','loyalty','communications'].map((tab, i) => `
                    <button class="cust-tab" data-tab="${tab}" style="background:none;border:none;padding:1rem 1.25rem;cursor:pointer;font-weight:500;color:${i===0?'var(--primary-green)':'var(--gray-600)'};border-bottom:3px solid ${i===0?'var(--primary-green)':'transparent'};text-transform:capitalize;white-space:nowrap;">${tab.replace('-',' ')}</button>
                `).join('')}
            </div>

            <div id="custTabContent" style="padding:1.5rem;"></div>
        `);

        const tabs = modal.querySelectorAll('.cust-tab');
        const content = modal.querySelector('#custTabContent');
        const renderTab = (name) => {
            tabs.forEach(t => {
                const active = t.dataset.tab === name;
                t.style.color = active ? 'var(--primary-green)' : 'var(--gray-600)';
                t.style.borderBottom = `3px solid ${active ? 'var(--primary-green)' : 'transparent'}`;
            });
            content.innerHTML = this._renderCustomerTab(name, data, tags);
            this._wireCustomerTabActions(content, data, name);
        };
        tabs.forEach(t => t.addEventListener('click', () => renderTab(t.dataset.tab)));
        renderTab('profile');
    };

    AdminApp.prototype._renderCustomerTab = function (tab, data, tags) {
        const c = data.customer;
        if (tab === 'profile') {
            return `
                <form id="custProfileForm" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div class="form-group" style="grid-column:1/-1;"><h4 style="margin:0 0 0.5rem 0;">Personal Info</h4></div>
                    <div class="form-group"><label for="cust-${c.id}-first_name">First Name</label><input class="form-input" id="cust-${c.id}-first_name" name="first_name" value="${esc(c.first_name||'')}"></div>
                    <div class="form-group"><label for="cust-${c.id}-middle_name">Middle Name</label><input class="form-input" id="cust-${c.id}-middle_name" name="middle_name" value="${esc(c.middle_name||'')}"></div>
                    <div class="form-group"><label for="cust-${c.id}-last_name">Last Name</label><input class="form-input" id="cust-${c.id}-last_name" name="last_name" value="${esc(c.last_name||'')}"></div>
                    <div class="form-group"><label for="cust-${c.id}-preferred_name">Preferred Name</label><input class="form-input" id="cust-${c.id}-preferred_name" name="preferred_name" value="${esc(c.preferred_name||'')}"></div>
                    <div class="form-group"><label for="cust-${c.id}-email">Email</label><input class="form-input" id="cust-${c.id}-email" type="email" name="email" value="${esc(c.email||'')}"></div>
                    <div class="form-group"><label for="cust-${c.id}-phone">Phone</label><input class="form-input" id="cust-${c.id}-phone" name="phone" value="${esc(c.phone||'')}"></div>
                    <div class="form-group"><label for="cust-${c.id}-dob">Date of Birth</label><input class="form-input" id="cust-${c.id}-dob" type="date" name="date_of_birth" value="${toDateInputValue(c.date_of_birth)}"></div>
                    <div class="form-group"><label for="cust-${c.id}-gender">Gender</label>
                        <select class="form-input" id="cust-${c.id}-gender" name="gender">
                            <option value="">Prefer not to say</option>
                            ${['male','female','non_binary','prefer_not_to_say','other'].map(g => `<option value="${g}" ${c.gender===g?'selected':''}>${g.replace('_',' ')}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="grid-column:1/-1;"><h4 style="margin:1rem 0 0.5rem 0;">Account</h4></div>
                    <div class="form-group"><label for="cust-${c.id}-customer_status">Status</label>
                        <select class="form-input" id="cust-${c.id}-customer_status" name="customer_status">
                            ${['active','vip','inactive','blocked'].map(s => `<option value="${s}" ${c.customer_status===s?'selected':''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label for="cust-${c.id}-customer_type">Type</label>
                        <select class="form-input" id="cust-${c.id}-customer_type" name="customer_type">
                            ${['retail','wholesale','employee','staff'].map(s => `<option value="${s}" ${c.customer_type===s?'selected':''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label for="cust-${c.id}-preferred_contact">Preferred Contact</label>
                        <select class="form-input" id="cust-${c.id}-preferred_contact" name="preferred_contact">
                            ${['email','sms','phone','none'].map(s => `<option value="${s}" ${c.preferred_contact===s?'selected':''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label for="cust-${c.id}-referral_source">Referral Source</label><input class="form-input" id="cust-${c.id}-referral_source" name="referral_source" value="${esc(c.referral_source||'')}"></div>

                    <div class="form-group" style="grid-column:1/-1;"><h4 style="margin:1rem 0 0.5rem 0;">Tax</h4></div>
                    <div class="form-group"><label><input type="checkbox" name="tax_exempt" ${c.tax_exempt?'checked':''}> Tax exempt</label></div>
                    <div class="form-group" style="grid-column:1/-1;"><label for="cust-${c.id}-tax_exempt_id">Tax Exempt ID</label><input class="form-input" id="cust-${c.id}-tax_exempt_id" name="tax_exempt_id" value="${esc(c.tax_exempt_id||'')}"></div>

                    <div class="form-group" style="grid-column:1/-1;"><label for="cust-${c.id}-tags">Tags (comma separated)</label><input class="form-input" id="cust-${c.id}-tags" name="tags" value="${esc(tags.join(', '))}"></div>

                    <div style="grid-column:1/-1;display:flex;gap:0.5rem;justify-content:space-between;border-top:1px solid var(--gray-200);padding-top:1rem;">
                        <button type="button" class="btn btn-danger" data-action="deactivate">Deactivate Account</button>
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </div>
                </form>`;
        }
        if (tab === 'addresses') {
            return `
                <div style="display:flex;justify-content:flex-end;margin-bottom:1rem;">
                    <button class="btn btn-primary" data-action="add-address"><i class="fas fa-plus"></i> Add Address</button>
                </div>
                ${data.addresses.length ? `
                <div class="table-container"><table class="table">
                    <thead><tr><th>Type</th><th>Name</th><th>Address</th><th>City/State</th><th>Default</th><th></th></tr></thead>
                    <tbody>
                    ${data.addresses.map(a => `
                        <tr>
                            <td>${esc(a.type)}</td>
                            <td>${esc(a.first_name||'')} ${esc(a.last_name||'')}</td>
                            <td>${esc(a.address_line_1)} ${esc(a.address_line_2||'')}</td>
                            <td>${esc(a.city)}, ${esc(a.state)} ${esc(a.postal_code)}</td>
                            <td>${a.is_default ? '<i class="fas fa-check" style="color:var(--success);"></i>' : ''}</td>
                            <td><button class="btn btn-sm btn-danger" data-action="delete-address" data-id="${a.id}"><i class="fas fa-trash"></i></button></td>
                        </tr>`).join('')}
                    </tbody>
                </table></div>` : '<p style="color:var(--gray-500);">No addresses on file.</p>'}`;
        }
        if (tab === 'orders') {
            return data.orders.length ? `
                <div class="table-container"><table class="table">
                    <thead><tr><th>Order #</th><th>Status</th><th>Payment</th><th>Total</th><th>Date</th><th></th></tr></thead>
                    <tbody>${data.orders.map(o => `
                        <tr>
                            <td><strong>${esc(o.order_number)}</strong></td>
                            <td><span style="text-transform:capitalize;">${esc(o.status)}</span></td>
                            <td>${esc(o.payment_status||'-')}</td>
                            <td>${fmtMoney(o.total_amount)}</td>
                            <td>${fmtDateTime(o.created_at)}</td>
                            <td><button type="button" class="btn btn-sm btn-secondary" onclick="viewOrder(${o.id})" title="View order"><i class="fas fa-eye"></i></button></td>
                        </tr>`).join('')}</tbody>
                </table></div>` : '<p style="color:var(--gray-500);">No orders yet.</p>';
        }
        if (tab === 'gift-cards') {
            return `
                <div style="display:flex;justify-content:flex-end;margin-bottom:1rem;">
                    <button class="btn btn-primary" data-action="issue-card-for-customer"><i class="fas fa-gift"></i> Issue Gift Card</button>
                </div>
                ${data.gift_cards.length ? `
                <div class="table-container"><table class="table">
                    <thead><tr><th>Code</th><th>Type</th><th>Status</th><th>Initial</th><th>Balance</th><th>Issued</th><th>Expires</th><th></th></tr></thead>
                    <tbody>${data.gift_cards.map(g => `
                        <tr>
                            <td><code>${esc(g.code)}</code></td>
                            <td>${esc(g.card_type)}</td>
                            <td>${esc(g.status)}</td>
                            <td>${fmtMoney(g.initial_balance)}</td>
                            <td><strong>${fmtMoney(g.current_balance)}</strong></td>
                            <td>${fmtDate(g.issued_at)}</td>
                            <td>${fmtDate(g.expires_at)}</td>
                            <td><button class="btn btn-sm btn-secondary" onclick="adminApp.showGiftCardDetail(${g.id})"><i class="fas fa-eye"></i></button></td>
                        </tr>`).join('')}</tbody>
                </table></div>` : '<p style="color:var(--gray-500);">No gift cards.</p>'}`;
        }
        if (tab === 'loyalty') {
            const c = data.customer;
            return `
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;">
                    <div class="stat-card"><div class="stat-title">Points Balance</div><div class="stat-value">${fmtNumber(c.points_balance||0)}</div></div>
                    <div class="stat-card"><div class="stat-title">Lifetime Earned</div><div class="stat-value">${fmtNumber(c.lifetime_points_earned||0)}</div></div>
                    <div class="stat-card"><div class="stat-title">Lifetime Redeemed</div><div class="stat-value">${fmtNumber(c.lifetime_points_redeemed||0)}</div></div>
                    <div class="stat-card"><div class="stat-title">Tier</div><div class="stat-value" style="font-size:1.25rem;">${esc(c.tier||'—')}</div></div>
                </div>

                <div style="display:flex;gap:1rem;flex-wrap:wrap;background:var(--gray-50, #f9fafb);padding:1rem;border-radius:8px;margin-bottom:1.5rem;">
                    <div style="flex:1;min-width:250px;">
                        <strong>Octopos Reward Card:</strong>
                        <div>${c.octopos_reward_card_number ? `<code>${esc(c.octopos_reward_card_number)}</code>` : '<em>not linked</em>'}</div>
                        <div style="font-size:0.85em;color:var(--gray-500);">Last synced: ${fmtDateTime(c.loyalty_synced_at)} (${esc(c.loyalty_sync_status||'never')})</div>
                    </div>
                    <div style="display:flex;gap:0.5rem;align-items:center;">
                        <button class="btn btn-secondary" data-action="link-card"><i class="fas fa-link"></i> Link Card</button>
                        ${c.octopos_reward_card_id ? '<button class="btn btn-secondary" data-action="sync-card"><i class="fas fa-sync"></i> Sync Now</button>' : ''}
                        ${c.octopos_reward_card_number ? '<button class="btn btn-secondary" data-action="unlink-card"><i class="fas fa-unlink"></i></button>' : ''}
                    </div>
                </div>

                <div style="display:flex;gap:0.5rem;align-items:end;background:#fefce8;padding:1rem;border-radius:8px;margin-bottom:1.5rem;">
                    <div style="flex:1;"><label for="adjustPointsAmount" style="display:block;font-size:0.85em;font-weight:600;">Adjust Points</label><input class="form-input" id="adjustPointsAmount" type="number" placeholder="e.g. 100 or -50"></div>
                    <div style="flex:2;"><label for="adjustPointsReason" style="display:block;font-size:0.85em;font-weight:600;">Reason</label><input class="form-input" id="adjustPointsReason" placeholder="Reason for adjustment"></div>
                    <button class="btn btn-primary" data-action="adjust-points">Apply</button>
                </div>

                ${data.loyalty_transactions.length ? `
                <h4>Recent Transactions</h4>
                <div class="table-container"><table class="table">
                    <thead><tr><th>Date</th><th>Type</th><th>Points</th><th>Balance</th><th>Source</th><th>Description</th></tr></thead>
                    <tbody>${data.loyalty_transactions.map(t => `
                        <tr>
                            <td>${fmtDateTime(t.created_at)}</td>
                            <td>${esc(t.transaction_type)}</td>
                            <td style="color:${t.points_change>=0?'var(--success)':'var(--error)'};font-weight:600;">${t.points_change>=0?'+':''}${fmtNumber(t.points_change)}</td>
                            <td>${fmtNumber(t.points_balance_after)}</td>
                            <td>${esc(t.source)}</td>
                            <td>${esc(t.description||'—')}</td>
                        </tr>`).join('')}</tbody>
                </table></div>` : ''}`;
        }
        if (tab === 'communications') {
            return data.communications.length ? `
                <div class="table-container"><table class="table">
                    <thead><tr><th>Date</th><th>Channel</th><th>Direction</th><th>Subject</th><th>Status</th></tr></thead>
                    <tbody>${data.communications.map(m => `
                        <tr>
                            <td>${fmtDateTime(m.created_at)}</td>
                            <td>${esc(m.channel)}</td>
                            <td>${esc(m.direction)}</td>
                            <td>${esc(m.subject||'—')}</td>
                            <td>${esc(m.status)}</td>
                        </tr>`).join('')}</tbody>
                </table></div>` : '<p style="color:var(--gray-500);">No communications logged.</p>';
        }
        return '';
    };

    AdminApp.prototype._wireCustomerTabActions = function (content, data, tab) {
        const cId = data.customer.id;
        if (tab === 'profile') {
            const form = content.querySelector('#custProfileForm');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const fd = new FormData(form);
                const payload = {};
                for (const [k, v] of fd.entries()) payload[k] = v;
                ['marketing_email_opt_in','marketing_sms_opt_in','marketing_postal_opt_in','tax_exempt']
                    .forEach(k => {
                        const field = form.querySelector(`[name="${k}"]`);
                        if (field) payload[k] = field.checked;
                    });
                if (payload.tags !== undefined) payload.tags = String(payload.tags).split(',').map(s => s.trim()).filter(Boolean);
                if (!payload.date_of_birth) delete payload.date_of_birth;
                try {
                    await this.apiRequest(`/admin/customers/${cId}`, { method: 'PUT', body: JSON.stringify(payload) });
                    this.showToast('Customer updated', 'success');
                    closeAllModals();
                    this.loadCustomers();
                } catch (err) {
                    this.showToast('Update failed: ' + err.message, 'error');
                }
            });
            content.querySelector('[data-action="deactivate"]').addEventListener('click', async () => {
                const ok = await this.showAdminConfirm({
                    title: 'Deactivate this customer?',
                    message:
                        'They will no longer be able to sign in. You can still view their history in admin. Continue?',
                    confirmLabel: 'Deactivate',
                    cancelLabel: 'Cancel',
                    danger: true,
                });
                if (!ok) return;
                await this.apiRequest(`/admin/customers/${cId}`, { method: 'DELETE' });
                closeAllModals();
                this.loadCustomers();
            });
        }
        if (tab === 'addresses') {
            content.querySelector('[data-action="add-address"]')?.addEventListener('click', () => this._addAddressPrompt(cId));
            content.querySelectorAll('[data-action="delete-address"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const ok = await this.showAdminConfirm({
                        title: 'Remove this address?',
                        message: 'It will be deleted from this customer’s saved addresses.',
                        confirmLabel: 'Delete address',
                        cancelLabel: 'Cancel',
                        danger: true,
                    });
                    if (!ok) return;
                    await this.apiRequest(`/admin/customers/${cId}/addresses/${btn.dataset.id}`, { method: 'DELETE' });
                    this.showCustomerProfile(cId);
                });
            });
        }
        if (tab === 'gift-cards') {
            content.querySelector('[data-action="issue-card-for-customer"]')?.addEventListener('click', () => {
                closeAllModals();
                this.showCreateGiftCardModal(cId);
            });
        }
        if (tab === 'loyalty') {
            content.querySelector('[data-action="adjust-points"]')?.addEventListener('click', async () => {
                const amount = parseInt($('adjustPointsAmount').value, 10);
                const reason = $('adjustPointsReason').value;
                if (!amount) {
                    this.showToast('Enter a non-zero number of points.', 'error');
                    return;
                }
                await this.apiRequest(`/admin/customers/${cId}/loyalty/adjust`, {
                    method: 'POST',
                    body: JSON.stringify({ points_change: amount, description: reason }),
                });
                this.showCustomerProfile(cId);
            });
            content.querySelector('[data-action="link-card"]')?.addEventListener('click', async () => {
                const vals = await this.showAdminInputModal({
                    title: 'Link Octopos reward card',
                    message:
                        'Enter the in-store reward card number. Octopos card ID is optional if the number alone can look up the card.',
                    inputs: [
                        { key: 'number', label: 'Reward card number', required: true },
                        { key: 'id', label: 'Octopos card ID (optional)', required: false },
                    ],
                    submitLabel: 'Link card',
                    cancelLabel: 'Cancel',
                });
                if (!vals || !vals.number) return;
                await this.apiRequest(`/admin/customers/${cId}/loyalty/link`, {
                    method: 'POST',
                    body: JSON.stringify({
                        octopos_reward_card_number: vals.number,
                        octopos_reward_card_id: vals.id || null,
                    }),
                });
                this.showCustomerProfile(cId);
            });
            content.querySelector('[data-action="sync-card"]')?.addEventListener('click', async () => {
                await this.apiRequest(`/admin/customers/${cId}/loyalty/sync`, { method: 'POST' });
                this.showCustomerProfile(cId);
            });
            content.querySelector('[data-action="unlink-card"]')?.addEventListener('click', async () => {
                const ok = await this.showAdminConfirm({
                    title: 'Unlink reward card?',
                    message:
                        'Loyalty balances stay in H&M Herbs until you link a new card. Octopos will not sync for this customer until then.',
                    confirmLabel: 'Unlink',
                    cancelLabel: 'Cancel',
                    danger: true,
                });
                if (!ok) return;
                await this.apiRequest(`/admin/customers/${cId}/loyalty/link`, { method: 'DELETE' });
                this.showCustomerProfile(cId);
            });
        }
    };

    AdminApp.prototype._addAddressPrompt = async function (customerId) {
        const modal = openModal(`
            <div style="padding:1.5rem;">
                <h3 style="margin-top:0;">Add Address</h3>
                <form id="addAddrForm" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div class="form-group"><label for="admin-add-addr-type">Type</label><select class="form-input" id="admin-add-addr-type" name="type"><option value="shipping">Shipping</option><option value="billing">Billing</option></select></div>
                    <div class="form-group"><label><input type="checkbox" name="is_default"> Default address</label></div>
                    <div class="form-group"><label for="admin-add-addr-first_name">First Name</label><input class="form-input" id="admin-add-addr-first_name" name="first_name" required></div>
                    <div class="form-group"><label for="admin-add-addr-last_name">Last Name</label><input class="form-input" id="admin-add-addr-last_name" name="last_name" required></div>
                    <div class="form-group" style="grid-column:1/-1;"><label for="admin-add-addr-company">Company</label><input class="form-input" id="admin-add-addr-company" name="company"></div>
                    <div class="form-group" style="grid-column:1/-1;"><label for="admin-add-addr-line1">Address Line 1</label><input class="form-input" id="admin-add-addr-line1" name="address_line_1" required></div>
                    <div class="form-group" style="grid-column:1/-1;"><label for="admin-add-addr-line2">Address Line 2</label><input class="form-input" id="admin-add-addr-line2" name="address_line_2"></div>
                    <div class="form-group"><label for="admin-add-addr-city">City</label><input class="form-input" id="admin-add-addr-city" name="city" required></div>
                    <div class="form-group"><label for="admin-add-addr-state">State</label><input class="form-input" id="admin-add-addr-state" name="state" required></div>
                    <div class="form-group"><label for="admin-add-addr-postal">Postal Code</label><input class="form-input" id="admin-add-addr-postal" name="postal_code" required></div>
                    <div class="form-group"><label for="admin-add-addr-country">Country</label><input class="form-input" id="admin-add-addr-country" name="country" value="United States"></div>
                    <div style="grid-column:1/-1;display:flex;gap:0.5rem;justify-content:flex-end;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Add Address</button>
                    </div>
                </form>
            </div>`);
        modal.querySelector('#addAddrForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const payload = Object.fromEntries(fd.entries());
            payload.is_default = e.target.querySelector('[name="is_default"]').checked;
            await this.apiRequest(`/admin/customers/${customerId}/addresses`, {
                method: 'POST', body: JSON.stringify(payload)
            });
            modal.remove();
            this.showCustomerProfile(customerId);
        });
    };

    // -----------------------------------------------------------------------
    // ADD CUSTOMER MODAL
    // -----------------------------------------------------------------------
    AdminApp.prototype.showAddCustomerModal = function () {
        const modal = openModal(`
            <div style="padding:1.5rem;">
                <h3 style="margin-top:0;color:var(--primary-green);">Add New Customer</h3>
                <form id="addCustForm" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div class="form-group"><label for="admin-new-cust-first_name">First Name *</label><input class="form-input" id="admin-new-cust-first_name" name="first_name" required></div>
                    <div class="form-group"><label for="admin-new-cust-last_name">Last Name *</label><input class="form-input" id="admin-new-cust-last_name" name="last_name" required></div>
                    <div class="form-group"><label for="admin-new-cust-email">Email *</label><input class="form-input" id="admin-new-cust-email" type="email" name="email" required></div>
                    <div class="form-group"><label for="admin-new-cust-phone">Phone</label><input class="form-input" id="admin-new-cust-phone" name="phone"></div>
                    <div class="form-group"><label for="admin-new-cust-dob">Date of Birth</label><input class="form-input" id="admin-new-cust-dob" type="date" name="date_of_birth"></div>
                    <div class="form-group"><label for="admin-new-cust-type">Type</label>
                        <select class="form-input" id="admin-new-cust-type" name="customer_type">
                            <option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="employee">Employee</option><option value="staff">Staff</option>
                        </select>
                    </div>
                    <div class="form-group"><label><input type="checkbox" name="marketing_email_opt_in"> Email opt-in</label></div>
                    <div class="form-group"><label><input type="checkbox" name="marketing_sms_opt_in"> SMS opt-in</label></div>
                    <div class="form-group" style="grid-column:1/-1;"><h4 style="margin:0.5rem 0;">Default Shipping Address (optional)</h4></div>
                    <div class="form-group" style="grid-column:1/-1;"><label for="admin-new-cust-addr1">Address Line 1</label><input class="form-input" id="admin-new-cust-addr1" name="address_line_1"></div>
                    <div class="form-group"><label for="admin-new-cust-city">City</label><input class="form-input" id="admin-new-cust-city" name="city"></div>
                    <div class="form-group"><label for="admin-new-cust-state">State</label><input class="form-input" id="admin-new-cust-state" name="state"></div>
                    <div class="form-group"><label for="admin-new-cust-postal">Postal Code</label><input class="form-input" id="admin-new-cust-postal" name="postal_code"></div>
                    <div class="form-group"><label for="admin-new-cust-country">Country</label><input class="form-input" id="admin-new-cust-country" name="country" value="United States"></div>
                    <div style="grid-column:1/-1;display:flex;gap:0.5rem;justify-content:flex-end;border-top:1px solid var(--gray-200);padding-top:1rem;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Customer</button>
                    </div>
                </form>
            </div>`);
        modal.querySelector('#addCustForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const payload = {
                email: fd.get('email'),
                first_name: fd.get('first_name'),
                last_name: fd.get('last_name'),
                phone: fd.get('phone') || null,
                date_of_birth: fd.get('date_of_birth') || null,
                customer_type: fd.get('customer_type'),
                marketing_email_opt_in: e.target.querySelector('[name="marketing_email_opt_in"]').checked,
                marketing_sms_opt_in: e.target.querySelector('[name="marketing_sms_opt_in"]').checked,
            };
            const addr1 = fd.get('address_line_1');
            if (addr1) {
                payload.address = {
                    address_line_1: addr1, city: fd.get('city'), state: fd.get('state'),
                    postal_code: fd.get('postal_code'), country: fd.get('country'),
                };
            }
            try {
                const res = await this.apiRequest('/admin/customers', { method: 'POST', body: JSON.stringify(payload) });
                modal.remove();
                this.loadCustomers();
                this.showCustomerProfile(res.id);
            } catch (err) {
                this.showToast('Create failed: ' + err.message, 'error');
            }
        });
    };

    AdminApp.prototype.syncOctoposCustomers = async function () {
        const ok = await this.showAdminConfirm({
            title: 'Sync reward cards from Octopos?',
            message:
                'H&M Herbs will pull reward cards from Octopos, update linked customers, and (if OCTOPOS_SYNC_POS_TO_WEB=true on the server) create website accounts for unmatched cards that have an email. This can take a while—please keep this tab open.',
            confirmLabel: 'Start sync',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;
        try {
            const res = await this.apiRequest('/admin/customers/sync/octopos/all', { method: 'POST' });
            const s = res.stats || {};
            await this.showAdminAlert({
                title: 'Octopos sync complete',
                message: `Matched: ${s.matched || 0}\nCached for review: ${s.cached_for_review || 0}\nNew web accounts from POS: ${s.created_web_users || 0}\nErrors: ${s.errors || 0}`,
                okLabel: 'Close',
            });
            this.loadCustomers();
        } catch (err) {
            this.showToast('Sync failed: ' + err.message, 'error');
        }
    };

    // =======================================================================
    // GIFT CARDS
    // =======================================================================

    AdminApp.prototype._giftCardState = function () {
        if (!this.giftCardsState) {
            this.giftCardsState = { page: 1, limit: 25, total: 0, search: '', card_type: '', status: '' };
        }
        return this.giftCardsState;
    };

    AdminApp.prototype.loadGiftCards = async function () {
        if (!this._gcListenersBound) {
            this._gcListenersBound = true;
            const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
            $('giftCardsSearchInput')?.addEventListener('input', debounce(() => {
                this._giftCardState().search = $('giftCardsSearchInput').value.trim();
                this._giftCardState().page = 1;
                this.loadGiftCards();
            }));
            ['giftCardsTypeFilter','giftCardsStatusFilter'].forEach(id => {
                $(id)?.addEventListener('change', () => {
                    const s = this._giftCardState();
                    s.card_type = $('giftCardsTypeFilter').value;
                    s.status    = $('giftCardsStatusFilter').value;
                    s.page = 1;
                    this.loadGiftCards();
                });
            });
        }

        await this.loadGiftCardStats();

        const container = $('giftCardsTable');
        if (!container) return;
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading gift cards...</div>';

        const s = this._giftCardState();
        const params = new URLSearchParams({ page: s.page, limit: s.limit });
        if (s.search) params.set('search', s.search);
        if (s.card_type) params.set('card_type', s.card_type);
        if (s.status) params.set('status', s.status);

        try {
            const data = await this.apiRequest(`/admin/gift-cards?${params}`);
            if (!data) return;
            if (!data.gift_cards.length) {
                container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--gray-500);"><i class="fas fa-gift" style="font-size:3rem;opacity:0.3;display:block;margin-bottom:1rem;"></i><p>No gift cards yet.</p></div>';
                $('giftCardsPagination').innerHTML = '';
                return;
            }
            container.innerHTML = `
                <div class="table-container">
                    <table class="table">
                        <thead><tr>
                            <th>Code</th><th>Type</th><th>Status</th><th>Initial</th><th>Balance</th>
                            <th>Customer</th><th>Recipient</th><th>Issued</th><th>Expires</th><th></th>
                        </tr></thead>
                        <tbody>${data.gift_cards.map(g => `
                            <tr>
                                <td><code>${esc(g.code)}</code>${g.physical_serial_number?`<br><small style="color:var(--gray-500);">SN: ${esc(g.physical_serial_number)}</small>`:''}</td>
                                <td><span style="text-transform:capitalize;">${esc(g.card_type)}</span></td>
                                <td>${this._gcStatusBadge(g.status)}</td>
                                <td>${fmtMoney(g.initial_balance, g.currency)}</td>
                                <td><strong>${fmtMoney(g.current_balance, g.currency)}</strong></td>
                                <td>${g.customer_id ? `<a href="#" onclick="event.preventDefault();adminApp.showCustomerProfile(${g.customer_id})">${esc(g.customer_first_name||'')} ${esc(g.customer_last_name||'')}</a>` : '—'}</td>
                                <td>${esc(g.recipient_email||g.recipient_name||'—')}</td>
                                <td>${fmtDate(g.issued_at)}</td>
                                <td>${fmtDate(g.expires_at)}</td>
                                <td><button class="btn btn-sm btn-secondary" onclick="adminApp.showGiftCardDetail(${g.id})"><i class="fas fa-eye"></i></button></td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>`;
            this._renderPagination('giftCardsPagination', data.pagination, (page) => {
                this._giftCardState().page = page;
                this.loadGiftCards();
            });
        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--error);">Failed to load gift cards: ${esc(err.message)}</div>`;
        }
    };

    AdminApp.prototype._gcStatusBadge = function (status) {
        const colors = {
            active:    'background:#dcfce7;color:#166534;',
            inactive:  'background:#f3f4f6;color:#374151;',
            redeemed:  'background:#dbeafe;color:#1e40af;',
            expired:   'background:#fef3c7;color:#92400e;',
            cancelled: 'background:#fee2e2;color:#991b1b;',
            lost:      'background:#fee2e2;color:#991b1b;',
        };
        const style = colors[status] || colors.inactive;
        return `<span style="display:inline-block;padding:0.125rem 0.5rem;border-radius:9999px;font-size:0.75rem;font-weight:600;text-transform:capitalize;${style}">${esc(status)}</span>`;
    };

    AdminApp.prototype.loadGiftCardStats = async function () {
        try {
            const s = await this.apiRequest('/admin/gift-cards/stats');
            if (!s) return;
            $('statTotalGiftCards').textContent = fmtNumber(s.total_cards);
            $('statActiveGiftCards').textContent = fmtNumber(s.active_cards);
            $('statGCBalance').textContent = fmtMoney(s.active_balance);
            $('statGCIssued').textContent = fmtMoney(s.lifetime_issued);
            $('statGCRedeemed').textContent = fmtMoney(s.lifetime_redeemed);
        } catch (err) { /* ignore */ }
    };

    AdminApp.prototype.showCreateGiftCardModal = function (preselectCustomerId = null) {
        const modal = openModal(`
            <div style="padding:1.5rem;">
                <h3 style="margin-top:0;color:var(--primary-green);">Issue Gift Card</h3>
                <form id="newGCForm" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div class="form-group"><label for="newgc-card-type">Type</label>
                        <select class="form-input" id="newgc-card-type" name="card_type">
                            <option value="digital">Digital</option><option value="physical">Physical</option>
                        </select>
                    </div>
                    <div class="form-group"><label for="newgc-initial-balance">Initial Balance ($) *</label><input class="form-input" id="newgc-initial-balance" name="initial_balance" type="number" step="5" min="5" placeholder="5" required title="Whole dollars in $5 steps (use arrows for $5, $10, $15…)"></div>
                    <div class="form-group" style="grid-column:1/-1;"><label for="newGC-customer-email">Customer (optional - search by email)</label>
                        <input class="form-input" name="customer_email" id="newGC-customer-email" autocomplete="off"
                            placeholder="Type name or email — pick a match to link the account" list="custEmailList">
                        <datalist id="custEmailList"></datalist>
                    </div>
                    <div class="form-group"><label for="newgc-recipient-name">Recipient Name</label><input class="form-input" id="newgc-recipient-name" name="recipient_name"></div>
                    <div class="form-group"><label for="newgc-recipient-email">Recipient Email</label><input class="form-input" id="newgc-recipient-email" type="email" name="recipient_email"></div>
                    <div class="form-group"><label for="newgc-sender-name">Sender Name</label><input class="form-input" id="newgc-sender-name" name="sender_name"></div>
                    <div class="form-group"><label for="newgc-delivery-date">Delivery Date</label><input class="form-input" id="newgc-delivery-date" type="date" name="delivery_date"></div>
                    <div class="form-group" style="grid-column:1/-1;"><label for="newgc-personal-message">Personal Message</label><textarea class="form-input" id="newgc-personal-message" name="personal_message" rows="2"></textarea></div>
                    <div class="form-group"><label for="newgc-expires-at">Expires At</label><input class="form-input" id="newgc-expires-at" type="date" name="expires_at"></div>
                    <div class="form-group"><label for="newgc-custom-code">Custom Code (optional)</label><input class="form-input" id="newgc-custom-code" name="code" placeholder="leave blank to auto-generate"></div>
                    <div class="physical-only" style="display:none;grid-column:1/-1;border-top:1px solid var(--gray-200);padding-top:1rem;"><h4>Physical Card</h4></div>
                    <div class="form-group physical-only" style="display:none;"><label for="newgc-physical-serial">Serial Number</label><input class="form-input" id="newgc-physical-serial" name="physical_serial_number"></div>
                    <div class="form-group physical-only" style="display:none;"><label for="newgc-physical-batch">Batch ID</label><input class="form-input" id="newgc-physical-batch" name="physical_batch_id"></div>
                    <div class="form-group physical-only" style="display:none;"><label for="newgc-physical-design">Design</label><input class="form-input" id="newgc-physical-design" name="physical_design"></div>
                    <div class="form-group" style="grid-column:1/-1;"><label><input type="checkbox" name="activate" checked> Activate immediately</label></div>
                    <div style="grid-column:1/-1;display:flex;gap:0.5rem;justify-content:flex-end;border-top:1px solid var(--gray-200);padding-top:1rem;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Issue Gift Card</button>
                    </div>
                </form>
            </div>`);

        const typeSelect = modal.querySelector('[name="card_type"]');
        const emailInput = modal.querySelector('[name="customer_email"]');
        const datalist = modal.querySelector('#custEmailList');
        const recipName = modal.querySelector('[name="recipient_name"]');
        const recipEmail = modal.querySelector('[name="recipient_email"]');
        const customerByEmail = new Map();

        const applyCustomerRow = (c) => {
            if (!c || !emailInput) return;
            const em = String(c.email || '').trim();
            if (!em) return;
            emailInput._gcSilent = true;
            emailInput.value = em;
            emailInput.dataset.customerId = String(c.id);
            delete emailInput._gcSilent;
            if (recipEmail && !String(recipEmail.value || '').trim()) {
                recipEmail.value = em;
            }
            const nm = `${c.first_name || ''} ${c.last_name || ''}`.trim();
            if (recipName && !String(recipName.value || '').trim() && nm) {
                recipName.value = nm;
            }
        };

        const fetchCustomerSuggestions = async () => {
            if (!datalist || !emailInput) return;
            const q = String(emailInput.value || '').trim();
            datalist.innerHTML = '';
            customerByEmail.clear();
            if (q.length < 2) return;
            try {
                const r = await this.apiRequest(
                    `/admin/customers?search=${encodeURIComponent(q)}&limit=25&sort=name_asc`
                );
                const list = Array.isArray(r?.customers) ? r.customers : [];
                for (const c of list) {
                    const em = String(c.email || '').trim();
                    if (!em) continue;
                    customerByEmail.set(em.toLowerCase(), c);
                    const opt = document.createElement('option');
                    opt.value = em;
                    const label = [`${c.first_name || ''} ${c.last_name || ''}`.trim(), em].filter(Boolean).join(' — ');
                    opt.label = label || em;
                    datalist.appendChild(opt);
                }
            } catch (_) {
                /* ignore */
            }
        };

        const debouncedSuggest = debounce(() => {
            void fetchCustomerSuggestions.call(this);
        }, 280);

        if (emailInput) {
            emailInput.addEventListener('input', () => {
                if (emailInput._gcSilent) return;
                delete emailInput.dataset.customerId;
                debouncedSuggest();
            });
            emailInput.addEventListener('change', () => {
                const em = String(emailInput.value || '').trim().toLowerCase();
                const c = customerByEmail.get(em);
                if (c) applyCustomerRow(c);
            });
            emailInput.addEventListener('blur', async () => {
                const em = String(emailInput.value || '').trim();
                if (!em || emailInput.dataset.customerId) return;
                try {
                    const r = await this.apiRequest(
                        `/admin/customers?search=${encodeURIComponent(em)}&limit=15&sort=name_asc`
                    );
                    const list = Array.isArray(r?.customers) ? r.customers : [];
                    const exact = list.filter(
                        (c) => String(c.email || '').toLowerCase() === em.toLowerCase()
                    );
                    if (exact.length === 1) applyCustomerRow(exact[0]);
                } catch (_) {
                    /* ignore */
                }
            });
        }

        const togglePhysical = () => {
            const isPhysical = typeSelect.value === 'physical';
            modal.querySelectorAll('.physical-only').forEach(el => {
                el.style.display = isPhysical ? '' : 'none';
            });
        };
        typeSelect.addEventListener('change', togglePhysical);
        togglePhysical();

        if (preselectCustomerId) {
            emailInput.dataset.customerId = String(preselectCustomerId);
            (async () => {
                try {
                    const r = await this.apiRequest(`/admin/customers/${preselectCustomerId}`);
                    const c = r?.customer;
                    if (c) applyCustomerRow(c);
                } catch (_) {
                    /* ignore */
                }
            })();
        }

        modal.querySelector('#newGCForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const payload = Object.fromEntries(fd.entries());
            payload.activate = e.target.querySelector('[name="activate"]').checked;
            payload.initial_balance = parseFloat(payload.initial_balance);
            const emailEl = modal.querySelector('[name="customer_email"]');
            if (preselectCustomerId) {
                payload.customer_id = Number(preselectCustomerId);
            } else if (emailEl?.dataset?.customerId) {
                payload.customer_id = Number(emailEl.dataset.customerId);
            } else if (payload.customer_email) {
                const r = await this.apiRequest(
                    `/admin/customers?search=${encodeURIComponent(payload.customer_email)}&limit=5`
                );
                const list = Array.isArray(r?.customers) ? r.customers : [];
                const want = String(payload.customer_email).trim().toLowerCase();
                const exact = list.find((c) => String(c.email || '').toLowerCase() === want);
                if (exact) payload.customer_id = exact.id;
                else if (list.length === 1) payload.customer_id = list[0].id;
            }
            delete payload.customer_email;
            for (const key in payload) if (!payload[key]) delete payload[key];

            try {
                const res = await this.apiRequest('/admin/gift-cards', { method: 'POST', body: JSON.stringify(payload) });
                modal.remove();
                this.loadGiftCards();
                this.showGiftCardDetail(res.id, { justCreated: { code: res.code, pin: res.pin } });
            } catch (err) {
                this.showToast('Failed: ' + err.message, 'error');
            }
        });
    };

    AdminApp.prototype.showBulkPhysicalGiftCardModal = function () {
        const modal = openModal(`
            <div style="padding:1.5rem;">
                <h3 style="margin-top:0;color:var(--primary-green);">Bulk Register Physical Gift Cards</h3>
                <p style="color:var(--gray-600);">Paste one card per line as <code>CODE,SERIAL,BALANCE</code>. SERIAL and BALANCE are optional (BALANCE falls back to default below).</p>
                <form id="bulkGCForm" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div class="form-group"><label for="bulkgc-default-balance">Default Balance ($)</label><input class="form-input" id="bulkgc-default-balance" type="number" step="0.01" name="default_balance" value="25.00"></div>
                    <div class="form-group"><label for="bulkgc-batch-id">Batch ID</label><input class="form-input" id="bulkgc-batch-id" name="batch_id"></div>
                    <div class="form-group"><label for="bulkgc-design">Design</label><input class="form-input" id="bulkgc-design" name="design"></div>
                    <div class="form-group"><label><input type="checkbox" name="activate"> Activate on register</label></div>
                    <div class="form-group" style="grid-column:1/-1;"><label for="bulkgc-cards-csv">Cards (CSV)</label>
                        <textarea class="form-input" id="bulkgc-cards-csv" name="cards_csv" rows="10" placeholder="ABCD-1234-EFGH-5678,SN001,25.00&#10;WXYZ-9876-LMNO-5432,SN002,50.00"></textarea>
                    </div>
                    <div style="grid-column:1/-1;display:flex;gap:0.5rem;justify-content:flex-end;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Register Cards</button>
                    </div>
                </form>
            </div>`);

        modal.querySelector('#bulkGCForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const csv = String(fd.get('cards_csv') || '').trim();
            if (!csv) {
                this.showToast('Paste at least one card line.', 'error');
                return;
            }
            const cards = csv.split('\n').map(line => {
                const [code, serial, balance] = line.split(',').map(p => p.trim());
                return {
                    code: code || null,
                    physical_serial_number: serial || null,
                    initial_balance: balance ? parseFloat(balance) : null,
                };
            }).filter(c => c.code || c.physical_serial_number);
            const payload = {
                cards,
                default_balance: parseFloat(fd.get('default_balance')) || null,
                batch_id: fd.get('batch_id') || null,
                design: fd.get('design') || null,
                activate: e.target.querySelector('[name="activate"]').checked,
            };
            try {
                const res = await this.apiRequest('/admin/gift-cards/bulk-physical', { method: 'POST', body: JSON.stringify(payload) });
                this.showToast(`Registered ${res.created_count} card(s).`, 'success');
                modal.remove();
                this.loadGiftCards();
            } catch (err) {
                this.showToast('Failed: ' + err.message, 'error');
            }
        });
    };

    AdminApp.prototype.showGiftCardDetail = async function (id, opts = {}) {
        const data = await this.apiRequest(`/admin/gift-cards/${id}`);
        if (!data) return;
        const g = data.gift_card;
        const created = opts.justCreated;

        const modal = openModal(`
            <div style="padding:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                    <h3 style="margin:0;color:var(--primary-green);">Gift Card</h3>
                    ${HM_MODAL_CLOSE_BTN}
                </div>

                ${created ? `
                <div style="background:#dcfce7;border:1px solid #16a34a;border-radius:8px;padding:1rem;margin-bottom:1rem;">
                    <strong>Card created!</strong>
                    <div style="margin-top:0.5rem;font-family:monospace;font-size:1.1em;">Code: <strong>${esc(created.code)}</strong></div>
                    <div style="font-family:monospace;">PIN: <strong>${esc(created.pin)}</strong></div>
                </div>` : ''}

                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;">
                    <div class="stat-card"><div class="stat-title">Balance</div><div class="stat-value">${fmtMoney(g.current_balance,g.currency)}</div></div>
                    <div class="stat-card"><div class="stat-title">Initial</div><div class="stat-value" style="font-size:1.25rem;">${fmtMoney(g.initial_balance,g.currency)}</div></div>
                    <div class="stat-card"><div class="stat-title">Status</div><div class="stat-value" style="font-size:1.1rem;">${this._gcStatusBadge(g.status)}</div></div>
                    <div class="stat-card"><div class="stat-title">Type</div><div class="stat-value" style="font-size:1.25rem;text-transform:capitalize;">${esc(g.card_type)}</div></div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;font-size:0.9rem;">
                    <div><strong>Code:</strong> <code>${esc(g.code)}</code></div>
                    <div><strong>PIN:</strong> <code>${esc(g.pin||'—')}</code></div>
                    <div><strong>Customer:</strong> ${g.customer_id ? `${esc(g.customer_first_name||'')} ${esc(g.customer_last_name||'')} (${esc(g.customer_email||'')})` : '—'}</div>
                    <div><strong>Recipient:</strong> ${esc(g.recipient_name||g.recipient_email||'—')}</div>
                    <div><strong>Issued:</strong> ${fmtDateTime(g.issued_at)}</div>
                    <div><strong>Expires:</strong> ${fmtDate(g.expires_at)}</div>
                    ${g.physical_serial_number?`<div><strong>Serial:</strong> ${esc(g.physical_serial_number)}</div>`:''}
                    ${g.physical_batch_id?`<div><strong>Batch:</strong> ${esc(g.physical_batch_id)}</div>`:''}
                </div>

                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem;">
                    <button class="btn btn-secondary" data-action="reload"><i class="fas fa-plus"></i> Reload</button>
                    <button class="btn btn-secondary" data-action="redeem"><i class="fas fa-minus"></i> Redeem</button>
                    ${g.status === 'inactive' ? '<button class="btn btn-primary" data-action="activate">Activate</button>' : ''}
                    ${g.status === 'active' ? '<button class="btn btn-secondary" data-action="cancel"><i class="fas fa-ban"></i> Cancel</button>' : ''}
                    ${g.status !== 'lost' ? '<button class="btn btn-secondary" data-action="lost"><i class="fas fa-question-circle"></i> Mark Lost</button>' : ''}
                </div>

                <h4>Transaction History</h4>
                ${data.transactions.length ? `
                <div class="table-container"><table class="table">
                    <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Source</th><th>Description</th></tr></thead>
                    <tbody>${data.transactions.map(t => `
                        <tr>
                            <td>${fmtDateTime(t.created_at)}</td>
                            <td>${esc(t.transaction_type)}</td>
                            <td style="color:${t.amount>=0?'var(--success)':'var(--error)'};font-weight:600;">${t.amount>=0?'+':''}${fmtMoney(t.amount)}</td>
                            <td>${fmtMoney(t.balance_after)}</td>
                            <td>${esc(t.source)}</td>
                            <td>${esc(t.description||'—')}</td>
                        </tr>`).join('')}</tbody>
                </table></div>` : '<p style="color:var(--gray-500);">No transactions yet.</p>'}
            </div>`);

        modal.querySelector('[data-action="reload"]')?.addEventListener('click', async () => {
            const vals = await this.showAdminInputModal({
                title: 'Reload gift card',
                message: 'Add store credit to this card.',
                inputs: [
                    { key: 'amount', label: 'Amount ($)', inputType: 'number', placeholder: '0.00', required: true },
                    { key: 'reason', label: 'Reason (optional)', placeholder: 'Admin reload', required: false },
                ],
                submitLabel: 'Apply reload',
                cancelLabel: 'Cancel',
            });
            if (!vals) return;
            const amt = parseFloat(String(vals.amount));
            if (!amt || amt <= 0) {
                this.showToast('Enter a valid amount greater than zero.', 'error');
                return;
            }
            const reason = vals.reason || 'Admin reload';
            await this.apiRequest(`/admin/gift-cards/${id}/adjust`, {
                method: 'POST', body: JSON.stringify({ amount: amt, description: reason }),
            });
            modal.remove();
            this.showGiftCardDetail(id);
        });
        modal.querySelector('[data-action="redeem"]')?.addEventListener('click', async () => {
            const vals = await this.showAdminInputModal({
                title: 'Redeem gift card',
                message: 'Subtract value from this card (e.g. in-store use).',
                inputs: [
                    { key: 'amount', label: 'Amount ($)', inputType: 'number', placeholder: '0.00', required: true },
                    { key: 'reason', label: 'Reason (optional)', placeholder: 'Manual redemption', required: false },
                ],
                submitLabel: 'Apply redemption',
                cancelLabel: 'Cancel',
            });
            if (!vals) return;
            const amt = parseFloat(String(vals.amount));
            if (!amt || amt <= 0) {
                this.showToast('Enter a valid amount greater than zero.', 'error');
                return;
            }
            const reason = vals.reason || 'Manual redemption';
            try {
                await this.apiRequest(`/admin/gift-cards/${id}/redeem`, {
                    method: 'POST', body: JSON.stringify({ amount: amt, description: reason }),
                });
                modal.remove();
                this.showGiftCardDetail(id);
            } catch (err) {
                this.showToast(err.message, 'error');
            }
        });
        ['activate','cancel','lost'].forEach(action => {
            modal.querySelector(`[data-action="${action}"]`)?.addEventListener('click', async () => {
                const statusMap = { activate: 'active', cancel: 'cancelled', lost: 'lost' };
                if (action !== 'activate') {
                    const ok = await this.showAdminConfirm({
                        title: 'Update gift card status?',
                        message: `Mark this card as “${statusMap[action]}”?`,
                        confirmLabel: 'Update status',
                        cancelLabel: 'Cancel',
                        danger: action !== 'activate',
                    });
                    if (!ok) return;
                }
                await this.apiRequest(`/admin/gift-cards/${id}/status`, {
                    method: 'POST', body: JSON.stringify({ status: statusMap[action] }),
                });
                modal.remove();
                this.showGiftCardDetail(id);
                this.loadGiftCards();
            });
        });
    };

})();

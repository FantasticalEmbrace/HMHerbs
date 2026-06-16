// HM Herbs Admin Panel - Customer Groups module.
/* global AdminApp */
(function () {
    'use strict';
    if (typeof AdminApp === 'undefined') {
        console.error('admin-customer-groups.js: AdminApp not found');
        return;
    }

    const esc = (s) => {
        if (s === null || s === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    };

    const HM_MODAL_CLOSE_BTN =
        '<button type="button" class="modal-close" onclick="this.closest(\'.modal\').remove()" aria-label="Close">' +
        '<svg class="cart-close-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
        '<path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg></button>';

    function openModal(html) {
        const root = document.getElementById('adminModalRoot');
        if (!root) return null;
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = 'display:flex;position:fixed;z-index:10000;inset:0;background:rgba(0,0,0,0.6);align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow-y:auto;';
        modal.innerHTML = `<div class="modal-content" style="background:#fff;border-radius:8px;max-width:640px;width:100%;position:relative;box-shadow:0 25px 50px -12px rgba(0,0,0,0.3);">${html}</div>`;
        root.appendChild(modal);
        return modal;
    }

    AdminApp.prototype.canManageCustomerGroups = function () {
        const role = this.currentUser?.role;
        return this.isFullAdmin || role === 'manager';
    };

    AdminApp.prototype.loadCustomerGroups = async function () {
        const container = document.getElementById('customerGroupsTable');
        if (!container) return;

        const addBtn = document.getElementById('customerGroupsAddBtn');
        if (addBtn) {
            addBtn.style.display = this.canManageCustomerGroups() ? '' : 'none';
        }

        if (!this.authToken) {
            container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--gray-500);">Please log in to view customer groups.</p>';
            return;
        }

        container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading customer groups...</div>';

        try {
            const groups = await this.apiRequest('/admin/customer-groups');
            if (!groups) {
                container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--gray-500);">Please log in to view customer groups.</p>';
                return;
            }

            if (!groups.length) {
                container.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--gray-500);">
                        <i class="fas fa-user-friends" style="font-size:3rem;opacity:0.3;display:block;margin-bottom:1rem;"></i>
                        <p>No customer groups yet.</p>
                        ${this.canManageCustomerGroups() ? '<p style="font-size:0.9rem;">Click <strong>Add Group</strong> to create your first group.</p>' : ''}
                    </div>`;
                return;
            }

            const canEdit = this.canManageCustomerGroups();
            container.innerHTML = `
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Slug</th>
                                <th>Members</th>
                                <th>Status</th>
                                ${canEdit ? '<th>Actions</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${groups.map((g) => `
                                <tr>
                                    <td><strong>${esc(g.name)}</strong>${g.description ? `<br><small style="color:var(--gray-500);">${esc(g.description)}</small>` : ''}</td>
                                    <td><code>${esc(g.slug)}</code></td>
                                    <td>${Number(g.member_count) || 0}</td>
                                    <td>
                                        <span class="badge ${g.is_active ? 'badge-success' : 'badge-danger'}">
                                            ${g.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    ${canEdit ? `
                                    <td>
                                        <button type="button" class="btn btn-sm btn-secondary" onclick="adminApp.editCustomerGroup(${g.id})" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-danger" style="margin-left:0.5rem;" onclick="adminApp.deleteCustomerGroup(${g.id})" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>` : ''}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;
        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--error);">Failed to load groups: ${esc(err.message)}</div>`;
        }
    };

    AdminApp.prototype.showAddCustomerGroupModal = function () {
        if (!this.canManageCustomerGroups()) {
            this.showToast('Manager access required to create customer groups.', 'error');
            return;
        }
        const modal = openModal(`
            <div style="padding:1.5rem;position:relative;">
                ${HM_MODAL_CLOSE_BTN}
                <h3 style="margin-top:0;color:var(--primary-green);">Add Customer Group</h3>
                <form id="addCustomerGroupForm">
                    <div class="form-group">
                        <label for="cg-add-name">Name *</label>
                        <input class="form-input" id="cg-add-name" name="name" required placeholder="e.g. Wholesale, VIP, Staff">
                    </div>
                    <div class="form-group">
                        <label for="cg-add-description">Description</label>
                        <textarea class="form-input" id="cg-add-description" name="description" rows="3" placeholder="Optional notes about this group"></textarea>
                    </div>
                    <div class="form-group">
                        <label><input type="checkbox" name="is_active" checked> Active</label>
                    </div>
                    <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Group</button>
                    </div>
                </form>
            </div>
        `);

        modal.querySelector('#addCustomerGroupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await this.apiRequest('/admin/customer-groups', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: fd.get('name'),
                        description: fd.get('description') || null,
                        is_active: fd.get('is_active') === 'on',
                    }),
                });
                modal.remove();
                this.showToast('Customer group created', 'success');
                this.loadCustomerGroups();
            } catch (err) {
                this.showToast(err.message || 'Failed to create group', 'error');
            }
        });
    };

    AdminApp.prototype.editCustomerGroup = async function (id) {
        if (!this.canManageCustomerGroups()) {
            this.showToast('Manager access required to edit customer groups.', 'error');
            return;
        }
        const group = await this.apiRequest(`/admin/customer-groups/${id}`);
        if (!group) return;

        const modal = openModal(`
            <div style="padding:1.5rem;position:relative;">
                ${HM_MODAL_CLOSE_BTN}
                <h3 style="margin-top:0;color:var(--primary-green);">Edit Customer Group</h3>
                <form id="editCustomerGroupForm">
                    <div class="form-group">
                        <label for="cg-edit-name">Name *</label>
                        <input class="form-input" id="cg-edit-name" name="name" required value="${esc(group.name)}">
                    </div>
                    <div class="form-group">
                        <label for="cg-edit-description">Description</label>
                        <textarea class="form-input" id="cg-edit-description" name="description" rows="3">${esc(group.description || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label><input type="checkbox" name="is_active" ${group.is_active ? 'checked' : ''}> Active</label>
                    </div>
                    ${group.members && group.members.length ? `
                        <div class="form-group">
                            <label>Members (${group.members.length})</label>
                            <div style="max-height:120px;overflow-y:auto;font-size:0.85rem;color:var(--gray-600);border:1px solid var(--gray-200);border-radius:6px;padding:0.5rem 0.75rem;">
                                ${group.members.slice(0, 20).map((m) => esc(`${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email)).join('<br>')}
                                ${group.members.length > 20 ? `<br><em>+${group.members.length - 20} more</em>` : ''}
                            </div>
                            <small style="color:var(--gray-500);">Assign members from each customer’s profile.</small>
                        </div>
                    ` : ''}
                    <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        `);

        modal.querySelector('#editCustomerGroupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await this.apiRequest(`/admin/customer-groups/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        name: fd.get('name'),
                        description: fd.get('description') || null,
                        is_active: fd.get('is_active') === 'on',
                    }),
                });
                modal.remove();
                this.showToast('Customer group updated', 'success');
                this.loadCustomerGroups();
            } catch (err) {
                this.showToast(err.message || 'Failed to update group', 'error');
            }
        });
    };

    AdminApp.prototype.deleteCustomerGroup = async function (id) {
        if (!this.canManageCustomerGroups()) {
            this.showToast('Manager access required to delete customer groups.', 'error');
            return;
        }
        let name = 'this group';
        try {
            const g = await this.apiRequest(`/admin/customer-groups/${id}`);
            if (g?.name) name = g.name;
        } catch { /* use default label */ }
        const ok = await this.showAdminConfirm({
            title: `Delete group “${name}”?`,
            message: 'Customers in this group will be unassigned. This cannot be undone.',
            confirmLabel: 'Delete group',
            cancelLabel: 'Cancel',
            danger: true,
        });
        if (!ok) return;

        try {
            await this.apiRequest(`/admin/customer-groups/${id}`, { method: 'DELETE' });
            this.showToast('Customer group deleted', 'success');
            this.loadCustomerGroups();
        } catch (err) {
            this.showToast(err.message || 'Failed to delete group', 'error');
        }
    };

    window.showAddCustomerGroup = function () {
        window.adminApp?.showAddCustomerGroupModal();
    };
})();

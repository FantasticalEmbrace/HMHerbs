/**
 * Admin Point of Sale — equipment catalog, tabs, hardware CRUD
 */
(function () {
    'use strict';

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    async function posApi(path, opts) {
        return window.adminApp.apiRequest('/admin/pos' + path, opts);
    }

    let equipmentTypes = [];
    let equipmentRows = [];
    let registerOptions = [];
    let tabsBound = false;

    function typeMeta(id) {
        return equipmentTypes.find((t) => t.id === id) || null;
    }

    function renderConfigFields(typeId, config) {
        const mount = document.getElementById('pos-equipment-config-fields');
        if (!mount) return;
        const meta = typeMeta(typeId);
        const fields = meta?.configFields || [];
        if (!fields.length) {
            mount.innerHTML = '';
            return;
        }
        mount.innerHTML = fields
            .map((f) => {
                const val = esc(config?.[f.key] ?? '');
                if (f.type === 'select') {
                    const opts = (f.options || [])
                        .map(
                            (o) =>
                                `<option value="${esc(o)}"${String(config?.[f.key] ?? '') === o ? ' selected' : ''}>${esc(o.replace(/_/g, ' '))}</option>`
                        )
                        .join('');
                    return `<div class="form-group"><label>${esc(f.label)}</label><select class="form-input pos-equipment-config-input" data-config-key="${esc(f.key)}">${opts}</select></div>`;
                }
                return `<div class="form-group"><label>${esc(f.label)}</label><input class="form-input pos-equipment-config-input" data-config-key="${esc(f.key)}" type="text" value="${val}" maxlength="200"></div>`;
            })
            .join('');
    }

    function readConfigFromForm() {
        const config = {};
        document.querySelectorAll('.pos-equipment-config-input').forEach((el) => {
            const key = el.getAttribute('data-config-key');
            if (key) config[key] = el.value;
        });
        return config;
    }

    function fillRegisterSelect(selectedId) {
        const sel = document.getElementById('pos-equipment-register');
        if (!sel) return;
        const base = '<option value="">— Any / unassigned —</option>';
        sel.innerHTML =
            base +
            registerOptions
                .filter((d) => d.isActive)
                .map(
                    (d) =>
                        `<option value="${d.id}"${Number(selectedId) === Number(d.id) ? ' selected' : ''}>${esc(d.deviceLabel)}</option>`
                )
                .join('');
    }

    function fillTypeSelect(selectedType) {
        const sel = document.getElementById('pos-equipment-type');
        const help = document.getElementById('pos-equipment-type-help');
        if (!sel) return;
        sel.innerHTML = equipmentTypes
            .map((t) => `<option value="${esc(t.id)}"${t.id === selectedType ? ' selected' : ''}>${esc(t.label)}</option>`)
            .join('');
        const meta = typeMeta(selectedType || sel.value);
        if (help) help.textContent = meta?.description || '';
    }

    function showEquipmentEditor(row) {
        const card = document.getElementById('pos-equipment-editor-card');
        const title = document.getElementById('pos-equipment-editor-title');
        if (!card) return;
        card.style.display = '';
        const isEdit = Boolean(row?.id);
        if (title) title.textContent = isEdit ? 'Edit equipment' : 'Add equipment';
        document.getElementById('pos-equipment-id').value = isEdit ? String(row.id) : '';
        fillTypeSelect(row?.equipmentType || 'card_terminal');
        document.getElementById('pos-equipment-label').value = row?.label || '';
        document.getElementById('pos-equipment-manufacturer').value = row?.manufacturer || '';
        document.getElementById('pos-equipment-model').value = row?.model || '';
        document.getElementById('pos-equipment-serial').value = row?.serialNumber || '';
        document.getElementById('pos-equipment-notes').value = row?.notes || '';
        document.getElementById('pos-equipment-active').checked = row ? row.isActive !== false : true;
        fillRegisterSelect(row?.posDeviceId);
        renderConfigFields(row?.equipmentType || document.getElementById('pos-equipment-type')?.value, row?.config || {});
        const msg = document.getElementById('pos-equipment-form-msg');
        if (msg) msg.textContent = '';
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideEquipmentEditor() {
        const card = document.getElementById('pos-equipment-editor-card');
        if (card) card.style.display = 'none';
    }

    async function loadEquipmentTypes() {
        const res = await posApi('/equipment/types');
        equipmentTypes = res.types || [];
        fillTypeSelect('card_terminal');
    }

    async function loadRegistersForEquipment() {
        const res = await posApi('/devices');
        registerOptions = res.devices || [];
        fillRegisterSelect();
    }

    async function loadEquipmentList() {
        const mount = document.getElementById('pos-equipment-list');
        if (!mount) return;
        mount.innerHTML = '<p class="form-help">Loading equipment…</p>';
        try {
            const res = await posApi('/equipment');
            equipmentRows = res.equipment || [];
            if (!equipmentRows.length) {
                mount.innerHTML =
                    '<p style="color:var(--gray-500);">No equipment yet. Click <strong>Add equipment</strong> to register your first terminal, printer, or scanner.</p>';
                return;
            }
            mount.innerHTML = `<table class="table"><thead><tr>
                <th>Name</th><th>Type</th><th>Register</th><th>Details</th><th>Status</th><th></th>
            </tr></thead><tbody>${equipmentRows
                .map((e) => {
                    const detail = [e.manufacturer, e.model, e.serialNumber].filter(Boolean).join(' · ') || '—';
                    return `<tr>
                        <td><strong>${esc(e.label)}</strong></td>
                        <td>${esc(e.equipmentTypeLabel)}</td>
                        <td>${esc(e.posDeviceLabel || '—')}</td>
                        <td style="font-size:0.88rem;color:var(--gray-600);">${esc(detail)}</td>
                        <td>${e.isActive ? '<span style="color:var(--success);">Active</span>' : 'Inactive'}</td>
                        <td style="white-space:nowrap;">
                            <button type="button" class="btn btn-secondary btn-sm" data-edit-equipment="${e.id}">Edit</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-delete-equipment="${e.id}">Delete</button>
                        </td>
                    </tr>`;
                })
                .join('')}</tbody></table>`;
            mount.querySelectorAll('[data-edit-equipment]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = Number(btn.getAttribute('data-edit-equipment'));
                    const row = equipmentRows.find((r) => r.id === id);
                    if (row) showEquipmentEditor(row);
                });
            });
            mount.querySelectorAll('[data-delete-equipment]').forEach((btn) => {
                btn.addEventListener('click', () => deleteEquipment(btn.getAttribute('data-delete-equipment')));
            });
        } catch (err) {
            mount.innerHTML = `<p style="color:var(--error);">${esc(err.message)}</p>`;
        }
    }

    async function deleteEquipment(id) {
        if (!window.confirm('Delete this equipment? This cannot be undone.')) return;
        try {
            await posApi('/equipment/' + id, { method: 'DELETE' });
            window.adminApp.showToast('Equipment deleted', 'success');
            hideEquipmentEditor();
            await loadEquipmentList();
        } catch (err) {
            window.adminApp.showToast(err.message || 'Delete failed', 'error');
        }
    }

    function bindPosTabs() {
        if (tabsBound) return;
        tabsBound = true;
        document.querySelectorAll('[data-pos-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-pos-tab');
                document.querySelectorAll('[data-pos-tab]').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('[data-pos-panel]').forEach((p) => {
                    p.style.display = p.getAttribute('data-pos-panel') === tab ? '' : 'none';
                });
                if (tab === 'equipment') {
                    loadEquipmentList();
                    loadRegistersForEquipment();
                }
                if (tab === 'registers' && window.adminApp?.loadPosDevices) {
                    window.adminApp.loadPosDevices();
                }
                if (tab === 'license' && window.adminApp?.loadPosLicense) {
                    window.adminApp.loadPosLicense();
                }
                if (tab === 'support' && window.adminApp?.loadPosSupport) {
                    window.adminApp.loadPosSupport();
                }
            });
        });

        document.getElementById('pos-equipment-add-btn')?.addEventListener('click', () => showEquipmentEditor(null));

        document.getElementById('pos-equipment-cancel-btn')?.addEventListener('click', hideEquipmentEditor);

        document.getElementById('pos-equipment-type')?.addEventListener('change', (e) => {
            const typeId = e.target.value;
            const help = document.getElementById('pos-equipment-type-help');
            const meta = typeMeta(typeId);
            if (help) help.textContent = meta?.description || '';
            renderConfigFields(typeId, {});
        });

        const eqForm = document.getElementById('pos-equipment-form');
        if (eqForm && !eqForm.dataset.bound) {
            eqForm.dataset.bound = '1';
            eqForm.addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const msg = document.getElementById('pos-equipment-form-msg');
                if (msg) msg.textContent = '';
                const id = document.getElementById('pos-equipment-id')?.value;
                const body = {
                    equipmentType: document.getElementById('pos-equipment-type')?.value,
                    label: document.getElementById('pos-equipment-label')?.value,
                    manufacturer: document.getElementById('pos-equipment-manufacturer')?.value,
                    model: document.getElementById('pos-equipment-model')?.value,
                    serialNumber: document.getElementById('pos-equipment-serial')?.value,
                    posDeviceId: document.getElementById('pos-equipment-register')?.value || null,
                    notes: document.getElementById('pos-equipment-notes')?.value,
                    isActive: document.getElementById('pos-equipment-active')?.checked,
                    config: readConfigFromForm()
                };
                try {
                    if (id) {
                        await posApi('/equipment/' + id, { method: 'PUT', body: JSON.stringify(body) });
                    } else {
                        await posApi('/equipment', { method: 'POST', body: JSON.stringify(body) });
                    }
                    window.adminApp.showToast('Equipment saved', 'success');
                    hideEquipmentEditor();
                    await loadEquipmentList();
                } catch (err) {
                    if (msg) {
                        msg.textContent = err.message || 'Save failed';
                        msg.style.color = 'var(--error)';
                    }
                    window.adminApp.showToast(err.message || 'Save failed', 'error');
                }
            });
        }
    }

    window.AdminPosHub = {
        async init() {
            bindPosTabs();
            try {
                await loadEquipmentTypes();
            } catch {
                /* types optional until equipment tab opened */
            }
        },
        refreshEquipment() {
            return loadEquipmentList();
        }
    };
})();

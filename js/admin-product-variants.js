/**
 * Product variant / matrix editor for admin product modal.
 */
(function () {
    'use strict';

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseValues(text) {
        return String(text || '')
            .split(/[,;\n]+/)
            .map((v) => v.trim())
            .filter(Boolean);
    }

    function cartesian(groups) {
        if (!groups.length) return [{}];
        const [first, ...rest] = groups;
        const tail = cartesian(rest);
        const combos = [];
        for (const value of first.values) {
            for (const combo of tail) {
                combos.push({ ...combo, [first.name]: value });
            }
        }
        return combos;
    }

    function buildVariantName(attrs, groups) {
        const parts = groups.map((g) => attrs[g.name]).filter(Boolean);
        return parts.length ? parts.join(' / ') : Object.values(attrs).join(' / ');
    }

    function mountVariantEditor(form, prefix) {
        const section = document.createElement('div');
        section.className = 'hm-variant-editor-section';
        section.style.marginBottom = '2.5rem';
        section.style.paddingBottom = '2rem';
        section.style.borderBottom = '1px solid var(--gray-200)';

        section.innerHTML = `
            <h3 style="font-size:1.1rem;font-weight:600;color:var(--primary-green);margin-bottom:0.5rem;">Variants &amp; Options</h3>
            <p style="font-size:0.85rem;color:var(--gray-500);margin-bottom:1.25rem;">
                Add option groups (Size, Form, Pack, etc.) and variant rows — like hmherbs.com pack dropdowns or size matrices.
            </p>
            <div class="hm-variant-groups-wrap" id="${prefix}-variant-groups-wrap">
                <label style="display:block;font-weight:500;margin-bottom:0.5rem;font-size:0.875rem;">Option groups (for matrix)</label>
                <div id="${prefix}-variant-groups"></div>
                <button type="button" class="btn btn-secondary btn-sm" id="${prefix}-add-option-group" style="margin-top:0.5rem;">
                    <i class="fas fa-plus"></i> Add option group
                </button>
            </div>
            <div style="margin:1.25rem 0;display:flex;gap:0.5rem;flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" id="${prefix}-generate-matrix">
                    <i class="fas fa-th"></i> Generate matrix from groups
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="${prefix}-add-variant-row">
                    <i class="fas fa-plus"></i> Add variant row
                </button>
            </div>
            <div style="overflow-x:auto;">
                <table class="hm-variant-table" id="${prefix}-variant-table" style="width:100%;border-collapse:collapse;font-size:0.875rem;">
                    <thead>
                        <tr style="background:var(--gray-50);text-align:left;">
                            <th style="padding:0.5rem;border-bottom:1px solid var(--gray-200);">Display name</th>
                            <th style="padding:0.5rem;border-bottom:1px solid var(--gray-200);">SKU</th>
                            <th style="padding:0.5rem;border-bottom:1px solid var(--gray-200);">Price</th>
                            <th style="padding:0.5rem;border-bottom:1px solid var(--gray-200);">Inventory</th>
                            <th style="padding:0.5rem;border-bottom:1px solid var(--gray-200);">Attributes (JSON)</th>
                            <th style="padding:0.5rem;border-bottom:1px solid var(--gray-200);"></th>
                        </tr>
                    </thead>
                    <tbody id="${prefix}-variant-rows"></tbody>
                </table>
            </div>
        `;

        const statusSection = form.querySelector('.hm-variant-editor-section') || form.querySelector('[id$="-is-active"]')?.closest('div')?.parentElement;
        const insertBefore = form.querySelector('.form-actions');
        if (insertBefore) {
            form.insertBefore(section, insertBefore);
        } else {
            form.appendChild(section);
        }

        const groupsEl = section.querySelector(`#${prefix}-variant-groups`);
        const rowsEl = section.querySelector(`#${prefix}-variant-rows`);

        function addOptionGroup(name = '', values = '') {
            const row = document.createElement('div');
            row.className = 'hm-variant-group-row';
            row.style.display = 'flex';
            row.style.gap = '0.5rem';
            row.style.marginBottom = '0.5rem';
            row.style.alignItems = 'center';
            row.innerHTML = `
                <input type="text" class="form-input hm-group-name" placeholder="Group name (e.g. Size)" value="${escapeHtml(name)}" style="flex:1;min-width:120px;">
                <input type="text" class="form-input hm-group-values" placeholder="Values: 2oz, 4oz, 8oz" value="${escapeHtml(values)}" style="flex:2;min-width:180px;">
                <button type="button" class="btn btn-danger btn-sm hm-remove-group" title="Remove group">&times;</button>
            `;
            row.querySelector('.hm-remove-group').addEventListener('click', () => row.remove());
            groupsEl.appendChild(row);
        }

        function addVariantRow(data = {}) {
            const tr = document.createElement('tr');
            if (data.id != null && data.id !== '') {
                tr.dataset.variantId = String(data.id);
            }
            tr.innerHTML = `
                <td style="padding:0.35rem;"><input type="text" class="form-input hm-v-name" value="${escapeHtml(data.name || '')}" placeholder="1 - Tube #19954 - $19.99" style="width:100%;min-width:160px;"></td>
                <td style="padding:0.35rem;"><input type="text" class="form-input hm-v-sku" value="${escapeHtml(data.sku || '')}" placeholder="Auto" style="width:100%;min-width:100px;"></td>
                <td style="padding:0.35rem;"><input type="number" class="form-input hm-v-price" step="0.01" min="0" value="${data.price != null ? escapeHtml(data.price) : ''}" style="width:90px;"></td>
                <td style="padding:0.35rem;"><input type="number" class="form-input hm-v-inventory" min="0" value="${data.inventory_quantity != null ? escapeHtml(data.inventory_quantity) : '100'}" style="width:70px;"></td>
                <td style="padding:0.35rem;"><input type="text" class="form-input hm-v-attrs" value="${escapeHtml(data.attributesJson || '')}" placeholder='{"Size":"4oz"}' style="width:100%;min-width:120px;font-size:0.8rem;"></td>
                <td style="padding:0.35rem;"><button type="button" class="btn btn-danger btn-sm hm-remove-variant">&times;</button></td>
            `;
            tr.querySelector('.hm-remove-variant').addEventListener('click', () => tr.remove());
            rowsEl.appendChild(tr);
        }

        function readOptionGroups() {
            return [...groupsEl.querySelectorAll('.hm-variant-group-row')].map((row) => {
                const name = row.querySelector('.hm-group-name').value.trim();
                const values = parseValues(row.querySelector('.hm-group-values').value);
                return name && values.length ? { name, values } : null;
            }).filter(Boolean);
        }

        section.querySelector(`#${prefix}-add-option-group`).addEventListener('click', () => addOptionGroup());
        section.querySelector(`#${prefix}-add-variant-row`).addEventListener('click', () => addVariantRow());

        section.querySelector(`#${prefix}-generate-matrix`).addEventListener('click', () => {
            const groups = readOptionGroups();
            if (!groups.length) {
                window.adminApp?.showNotification?.('Add at least one option group with values first.', 'error');
                return;
            }
            const basePriceEl = form.querySelector(`#${prefix}-price`);
            const basePrice = basePriceEl ? parseFloat(basePriceEl.value) : NaN;
            const combos = cartesian(groups);
            rowsEl.innerHTML = '';
            combos.forEach((attrs, idx) => {
                addVariantRow({
                    name: buildVariantName(attrs, groups),
                    price: Number.isFinite(basePrice) ? basePrice : '',
                    inventory_quantity: 100,
                    attributesJson: JSON.stringify(attrs),
                });
            });
        });

        form._hmVariantEditor = {
            prefix,
            addOptionGroup,
            addVariantRow,
            readOptionGroups,
            clear() {
                groupsEl.innerHTML = '';
                rowsEl.innerHTML = '';
            },
            load(product) {
                this.clear();
                const groups = product.variant_option_groups || [];
                if (groups.length) {
                    groups.forEach((g) => addOptionGroup(g.name || '', (g.values || []).join(', ')));
                }
                const variants = product.variants || [];
                variants.forEach((v) => {
                    addVariantRow({
                        id: v.id,
                        name: v.name,
                        sku: v.sku,
                        price: v.price,
                        inventory_quantity: v.inventory_quantity,
                        attributesJson: v.attributes ? JSON.stringify(v.attributes) : '',
                    });
                });
            },
            getPayload() {
                const variant_option_groups = readOptionGroups();
                const variants = [...rowsEl.querySelectorAll('tr')].map((tr, idx) => {
                    const name = tr.querySelector('.hm-v-name').value.trim();
                    if (!name) return null;
                    const idRaw = tr.dataset.variantId;
                    const id = idRaw ? parseInt(idRaw, 10) : undefined;
                    const sku = tr.querySelector('.hm-v-sku').value.trim();
                    const price = parseFloat(tr.querySelector('.hm-v-price').value);
                    const inventory_quantity = parseInt(tr.querySelector('.hm-v-inventory').value, 10) || 0;
                    let attributes = null;
                    const attrsRaw = tr.querySelector('.hm-v-attrs').value.trim();
                    if (attrsRaw) {
                        try {
                            attributes = JSON.parse(attrsRaw);
                        } catch {
                            attributes = null;
                        }
                    }
                    return {
                        ...(Number.isFinite(id) ? { id } : {}),
                        name,
                        sku: sku || undefined,
                        price,
                        inventory_quantity,
                        sort_order: idx,
                        attributes,
                    };
                }).filter((v) => v && Number.isFinite(v.price));

                return {
                    variant_option_groups: variant_option_groups.length ? variant_option_groups : null,
                    variants,
                };
            },
        };

        return form._hmVariantEditor;
    }

    function attachVariantPayload(productData, formElement) {
        if (formElement && formElement._hmVariantEditor) {
            const payload = formElement._hmVariantEditor.getPayload();
            productData.variant_option_groups = payload.variant_option_groups;
            productData.variants = payload.variants;
        }
    }

    window.HMProductVariantsEditor = {
        mountVariantEditor,
        attachVariantPayload,
    };
})();

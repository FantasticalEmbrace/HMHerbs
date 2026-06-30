/**
 * Product SKU field: barcode scanner wedge, manual entry, and custom SKU generation.
 */
(function () {
    'use strict';

    function normalizeScanValue(raw) {
        return String(raw || '').trim().replace(/\s+/g, '');
    }

    function generateRandomSku() {
        return `HM-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    }

    function generateSkuFromName(name) {
        const base = String(name || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 28) || 'ITEM';
        return `HM-${base}-${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
    }

    function enhanceProductForm(form, prefix, modal) {
        const skuInput = form.querySelector(`#${prefix}-sku`);
        if (!skuInput || skuInput.dataset.hmSkuEnhanced === '1') return;
        skuInput.dataset.hmSkuEnhanced = '1';

        skuInput.setAttribute('autocomplete', 'off');
        skuInput.setAttribute('spellcheck', 'false');
        skuInput.placeholder = 'Scan barcode or type SKU';

        const label = form.querySelector(`label[for="${prefix}-sku"]`);
        if (label) {
            label.textContent = 'SKU / Barcode';
        }

        skuInput.removeAttribute('required');

        const wrap = document.createElement('div');
        wrap.className = 'hm-sku-field-wrap';
        wrap.style.display = 'flex';
        wrap.style.gap = '0.5rem';
        wrap.style.flexWrap = 'wrap';
        wrap.style.alignItems = 'stretch';
        skuInput.parentNode.insertBefore(wrap, skuInput);
        wrap.appendChild(skuInput);
        skuInput.style.flex = '1';
        skuInput.style.minWidth = '220px';

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '0.35rem';
        btnRow.style.flexWrap = 'wrap';

        const genBtn = document.createElement('button');
        genBtn.type = 'button';
        genBtn.className = 'btn btn-secondary btn-sm';
        genBtn.innerHTML = '<i class="fas fa-barcode" aria-hidden="true"></i> Generate SKU';
        genBtn.title = 'Create a custom HM Herbs SKU when there is no manufacturer barcode';

        const fromNameBtn = document.createElement('button');
        fromNameBtn.type = 'button';
        fromNameBtn.className = 'btn btn-secondary btn-sm';
        fromNameBtn.textContent = 'From name';
        fromNameBtn.title = 'Build a SKU from the product name';

        btnRow.appendChild(genBtn);
        btnRow.appendChild(fromNameBtn);
        wrap.appendChild(btnRow);

        const hint = document.createElement('p');
        hint.className = 'hm-sku-scan-hint';
        hint.style.fontSize = '0.8rem';
        hint.style.color = 'var(--gray-500)';
        hint.style.marginTop = '0.35rem';
        hint.style.marginBottom = '0';
        hint.style.lineHeight = '1.45';
        hint.textContent =
            'Click this field, then scan with your USB barcode scanner — it fills in automatically. You can also type a SKU manually or generate one.';
        wrap.parentNode.insertBefore(hint, wrap.nextSibling);

        genBtn.addEventListener('click', () => {
            skuInput.value = generateRandomSku();
            skuInput.dispatchEvent(new Event('input', { bubbles: true }));
            window.adminApp?.showNotification?.('Generated custom SKU', 'success');
            skuInput.focus();
        });

        fromNameBtn.addEventListener('click', () => {
            const nameEl = form.querySelector(`#${prefix}-name`);
            const name = nameEl?.value?.trim();
            if (!name) {
                window.adminApp?.showNotification?.('Enter a product name first', 'error');
                nameEl?.focus();
                return;
            }
            skuInput.value = generateSkuFromName(name);
            window.adminApp?.showNotification?.('SKU generated from product name', 'success');
            skuInput.focus();
        });

        skuInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            skuInput.value = normalizeScanValue(skuInput.value);
            if (skuInput.value) {
                window.adminApp?.showNotification?.('Barcode / SKU captured', 'success');
            }
            const nameEl = form.querySelector(`#${prefix}-name`);
            if (nameEl && !nameEl.value.trim()) {
                nameEl.focus();
            }
        });

        skuInput.addEventListener('blur', () => {
            skuInput.value = normalizeScanValue(skuInput.value);
        });

        let wedgeBuffer = '';
        let wedgeTimer = null;

        const onModalKeyDown = (e) => {
            if (!modal.isConnected) return;

            const active = document.activeElement;
            const tag = active?.tagName || '';
            const isOtherField =
                active &&
                active !== skuInput &&
                (tag === 'TEXTAREA' ||
                    (tag === 'INPUT' && !['button', 'submit'].includes(active.type)) ||
                    tag === 'SELECT');

            if (isOtherField) {
                wedgeBuffer = '';
                return;
            }

            if (e.key === 'Enter' && wedgeBuffer.length >= 4) {
                e.preventDefault();
                skuInput.value = normalizeScanValue(wedgeBuffer);
                wedgeBuffer = '';
                skuInput.focus();
                window.adminApp?.showNotification?.('Barcode scanned into SKU', 'success');
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                wedgeBuffer += e.key;
                clearTimeout(wedgeTimer);
                wedgeTimer = setTimeout(() => {
                    wedgeBuffer = '';
                }, 150);
            }
        };

        modal.addEventListener('keydown', onModalKeyDown, true);

        const observer = new MutationObserver(() => {
            if (!modal.isConnected) {
                modal.removeEventListener('keydown', onModalKeyDown, true);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        if (prefix === 'add') {
            setTimeout(() => skuInput.focus(), 120);
        }

        form._hmSkuInput = skuInput;
    }

    window.HMProductSkuField = {
        enhanceProductForm,
        normalizeScanValue,
        generateRandomSku,
        generateSkuFromName,
    };
})();

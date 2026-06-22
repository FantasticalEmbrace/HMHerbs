/**
 * Admin-only POS platform billing (Collect.js) — Point of Sale → License tab.
 */
(function () {
    'use strict';

    let collectReady = false;

    function apiOrigin() {
        if (window.adminApp?.getApiBaseUrl) {
            const base = window.adminApp.getApiBaseUrl();
            return base.replace(/\/api\/?$/, '');
        }
        return window.location.origin;
    }

    function billingApi(path, options) {
        const token = window.adminApp?.authToken;
        return fetch(`${apiOrigin()}/api/pos-billing${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(options?.headers || {})
            }
        });
    }

    function setMsg(text, tone) {
        const el = document.getElementById('pos-license-billing-msg');
        if (!el) return;
        el.textContent = text || '';
        el.style.color =
            tone === 'ok' ? 'var(--success, #15803d)' : tone === 'err' ? 'var(--error, #b91c1c)' : '';
    }

    function setStatus(hasVault) {
        const el = document.getElementById('pos-license-billing-status');
        if (!el) return;
        el.innerHTML = hasVault
            ? '<strong>Status:</strong> Payment method on file. Enter new card details below to replace it.'
            : '<strong>Status:</strong> No payment method saved yet.';
    }

    async function submitPayment(paymentToken) {
        const authorize = document.getElementById('pos-license-billing-authorize');
        if (!authorize?.checked) {
            setMsg('Check the authorization box before saving.', 'err');
            return;
        }

        const form = document.getElementById('pos-license-form');
        setMsg('Saving payment method…', '');

        try {
            const r = await billingApi('/setup', {
                method: 'POST',
                body: JSON.stringify({
                    payment_token: paymentToken,
                    businessName: form?.querySelector('[name="businessName"]')?.value || '',
                    billingEmail: form?.querySelector('[name="billingEmail"]')?.value || '',
                    licensedStationCount:
                        Number(form?.querySelector('[name="licensedStationCount"]')?.value) || 1,
                    authorized: true,
                    paymentMethodType: 'card'
                })
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || 'Setup failed');
            setMsg('Payment method saved.', 'ok');
            setStatus(true);
            if (window.adminApp?.loadPosLicense) {
                await window.adminApp.loadPosLicense();
            }
        } catch (e) {
            setMsg(e.message || 'Setup failed', 'err');
        }
    }

    async function mountCollect(cfg) {
        const mount = document.getElementById('pos-license-collect-mount');
        const placeholder = document.getElementById('pos-license-collect-placeholder');
        const saveBtn = document.getElementById('pos-license-billing-save-btn');
        if (!mount || !placeholder) return;

        if (!cfg.enabled || !cfg.tokenizationKey) {
            placeholder.textContent =
                cfg.message || 'Platform billing keys are not configured on the server yet.';
            if (saveBtn) saveBtn.disabled = true;
            return;
        }

        placeholder.textContent = 'Enter card details below (processed securely by EPI):';

        if (collectReady && window.CollectJS) {
            window.CollectJS.configure({
                paymentSelector: '#pos-license-billing-save-btn',
                variant: 'inline',
                styleSniffer: false,
                customCSS: {
                    'border': 'none',
                    'background-color': 'transparent',
                    'padding': '0',
                    'margin': '0',
                    'height': '2.75rem',
                    'font-size': '16px'
                },
                fields: {
                    ccnumber: { selector: '#pos-license-ccnumber', placeholder: 'Card number' },
                    ccexp: { selector: '#pos-license-ccexp', placeholder: 'MM / YY' },
                    cvv: { selector: '#pos-license-cvv', placeholder: 'CVV' }
                },
                callback: (response) => {
                    if (response.token) submitPayment(response.token);
                }
            });
            if (saveBtn) saveBtn.disabled = false;
            return;
        }

        mount.innerHTML = `
          <div id="pos-license-ccnumber" style="margin-bottom:0.5rem;min-height:2.75rem;border:1px solid var(--gray-300,#d1d5db);border-radius:6px;background:#fafafa;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
            <div id="pos-license-ccexp" style="min-height:2.75rem;border:1px solid var(--gray-300,#d1d5db);border-radius:6px;background:#fafafa;"></div>
            <div id="pos-license-cvv" style="min-height:2.75rem;border:1px solid var(--gray-300,#d1d5db);border-radius:6px;background:#fafafa;"></div>
          </div>`;

        const existing = document.querySelector('script[data-pos-billing-collect]');
        if (existing) existing.remove();

        const script = document.createElement('script');
        script.src = cfg.collectJsUrl || 'https://secure.nmi.com/token/Collect.js';
        script.setAttribute('data-tokenization-key', cfg.tokenizationKey);
        script.setAttribute('data-pos-billing-collect', '1');
        script.onload = () => {
            collectReady = true;
            mountCollect(cfg);
        };
        script.onerror = () => {
            placeholder.textContent = 'Could not load the secure card form. Try again later.';
        };
        document.head.appendChild(script);
    }

    async function init(hasBillingVault) {
        const card = document.getElementById('pos-license-billing-card');
        if (!card || card.style.display === 'none') return;

        setStatus(Boolean(hasBillingVault));
        setMsg('', '');

        try {
            const r = await billingApi('/client-config');
            const cfg = await r.json().catch(() => ({}));
            await mountCollect(cfg);
        } catch (e) {
            setMsg(e.message || 'Could not load billing config', 'err');
        }
    }

    window.adminPosBilling = { init };
})();

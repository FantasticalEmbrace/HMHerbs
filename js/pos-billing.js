'use strict';

(function () {
    const apiOrigin = window.location.origin;

    function $(id) {
        return document.getElementById(id);
    }

    async function fetchJson(path) {
        const r = await fetch(`${apiOrigin}/api/pos-billing${path}`);
        return r.json();
    }

    async function updateQuote() {
        const stations = Math.max(1, Number($('station-count')?.value) || 1);
        const data = await fetchJson(`/pricing?stations=${stations}`);
        const q = data.quote || {};
        $('pricing-quote').textContent = `${q.formatted || ''} — ${q.summary || ''}`;
    }

    async function initCollect() {
        const cfg = await fetchJson('/client-config');
        const submit = $('billing-submit');
        if (!cfg.enabled || !cfg.tokenizationKey) {
            $('collect-placeholder').textContent =
                cfg.message || 'Platform billing is not configured yet. Ask your administrator to add EPI platform keys.';
            return;
        }

        $('collect-placeholder').textContent = 'Enter card details below:';
        const script = document.createElement('script');
        script.src = cfg.collectJsUrl || 'https://secure.nmi.com/token/Collect.js';
        script.setAttribute('data-tokenization-key', cfg.tokenizationKey);
        script.onload = () => {
            if (!window.CollectJS) return;
            window.CollectJS.configure({
                paymentSelector: '#billing-submit',
                variant: 'inline',
                fields: {
                    ccnumber: { selector: '#ccnumber', placeholder: 'Card number' },
                    ccexp: { selector: '#ccexp', placeholder: 'MM / YY' },
                    cvv: { selector: '#cvv', placeholder: 'CVV' }
                },
                callback: (response) => {
                    if (response.token) {
                        submitPayment(response.token);
                    }
                }
            });
            const mount = $('collect-mount');
            mount.innerHTML = `
              <div id="ccnumber" style="margin-bottom:0.5rem;min-height:2.5rem;border:1px solid #d1d5db;border-radius:6px;"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                <div id="ccexp" style="min-height:2.5rem;border:1px solid #d1d5db;border-radius:6px;"></div>
                <div id="cvv" style="min-height:2.5rem;border:1px solid #d1d5db;border-radius:6px;"></div>
              </div>`;
            if (submit) submit.disabled = false;
        };
        document.head.appendChild(script);
    }

    async function submitPayment(paymentToken) {
        const msg = $('billing-msg');
        msg.textContent = 'Saving…';
        msg.style.color = '';
        try {
            const r = await fetch(`${apiOrigin}/api/pos-billing/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payment_token: paymentToken,
                    businessName: $('business-name').value,
                    billingEmail: $('billing-email').value,
                    licensedStationCount: Number($('station-count').value) || 1,
                    authorized: $('billing-authorize').checked
                })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Setup failed');
            msg.style.color = 'green';
            msg.textContent = 'Payment method saved. Your POS license is ready when enforcement is enabled.';
        } catch (e) {
            msg.style.color = 'crimson';
            msg.textContent = e.message || 'Setup failed';
        }
    }

    $('station-count')?.addEventListener('input', () => updateQuote());
    $('billing-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = $('billing-msg');
        if (msg) msg.textContent = 'Use the Save button after card fields validate (Collect.js).';
    });

    updateQuote();
    initCollect();
})();

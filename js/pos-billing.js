'use strict';

(function () {
    const apiOrigin = window.location.origin;
    const urlParams = new URLSearchParams(window.location.search);
    const setupToken = urlParams.get('token') || '';

    let clientConfig = null;
    let paymentMethod = 'card';
    let collectReady = false;

    function $(id) {
        return document.getElementById(id);
    }

    function canSubmitBilling(cfg) {
        return cfg?.enabled && cfg?.tokenizationKey && (!cfg.requiresSetupAuth || setupToken);
    }

    function showSetupAuthMessage(cfg) {
        if (!cfg?.requiresSetupAuth || setupToken) return;
        const msg = $('billing-msg');
        if (msg) {
            msg.style.color = '#b45309';
            msg.textContent =
                'This page requires a secure signup link from your Business One administrator. Open the link they emailed or copied for you.';
        }
        const submit = $('billing-submit');
        if (submit) submit.disabled = true;
    }

    async function fetchJson(path) {
        const r = await fetch(`${apiOrigin}/api/pos-billing${path}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
        return data;
    }

    async function updateQuote() {
        const quoteEl = $('pricing-quote');
        try {
            const stations = Math.max(1, Number($('station-count')?.value) || 1);
            const data = await fetchJson(`/pricing?stations=${stations}`);
            const q = data.quote || {};
            if (quoteEl) quoteEl.textContent = `${q.formatted || ''} — ${q.summary || ''}`;
        } catch (e) {
            if (quoteEl) quoteEl.textContent = e.message || 'Could not load pricing quote.';
        }
    }

    function setPaymentMethod(method) {
        paymentMethod = method === 'ach' ? 'ach' : 'card';
        const cardTab = $('pay-tab-card');
        const achTab = $('pay-tab-ach');
        if (cardTab) cardTab.setAttribute('aria-selected', paymentMethod === 'card' ? 'true' : 'false');
        if (achTab) achTab.setAttribute('aria-selected', paymentMethod === 'ach' ? 'true' : 'false');

        const achWrap = $('ach-account-type-wrap');
        const cardAuth = $('card-authorize-wrap');
        const achAuth = $('ach-authorize-wrap');
        if (achWrap) achWrap.classList.toggle('visible', paymentMethod === 'ach');
        if (cardAuth) cardAuth.style.display = paymentMethod === 'card' ? 'flex' : 'none';
        if (achAuth) achAuth.style.display = paymentMethod === 'ach' ? 'flex' : 'none';

        const cardBox = $('billing-authorize');
        const achBox = $('billing-ach-authorize');
        if (cardBox) cardBox.required = paymentMethod === 'card';
        if (achBox) achBox.required = paymentMethod === 'ach';

        if (collectReady && clientConfig) {
            mountCollectFields();
        }
    }

    function mountCollectFields() {
        const mount = $('collect-mount');
        const placeholder = $('collect-placeholder');
        const collect = window.BusinessOneCollect;
        if (!mount || !window.CollectJS || !collect) return;

        const onToken = (response) => {
            if (response.token) submitPayment(response.token);
        };

        if (paymentMethod === 'ach') {
            if (placeholder) placeholder.textContent = 'Bank account (secure — processed by EPI)';
            mount.innerHTML = `
              <div class="pos-collect-fields">
                <div class="form-group"><label>Name on account</label><div id="checkname" class="pos-field-host"></div></div>
                <div class="form-group"><label>Routing number</label><div id="checkaba" class="pos-field-host"></div></div>
                <div class="form-group"><label>Account number</label><div id="checkaccount" class="pos-field-host"></div></div>
              </div>`;
            window.CollectJS.configure(
                collect.buildConfigureOptions({
                    fields: {
                        checkname: { selector: '#checkname', placeholder: 'Name on account' },
                        checkaba: { selector: '#checkaba', placeholder: 'Routing number' },
                        checkaccount: { selector: '#checkaccount', placeholder: 'Account number' }
                    },
                    callback: onToken
                })
            );
        } else {
            if (placeholder) placeholder.textContent = 'Card details (secure — processed by EPI)';
            mount.innerHTML = `
              <div class="pos-collect-fields">
                <div class="form-group"><label>Card number</label><div id="ccnumber" class="pos-field-host"></div></div>
                <div class="pos-field-row">
                  <div class="form-group"><label>Expiry</label><div id="ccexp" class="pos-field-host"></div></div>
                  <div class="form-group"><label>CVV</label><div id="cvv" class="pos-field-host"></div></div>
                </div>
              </div>`;
            window.CollectJS.configure(
                collect.buildConfigureOptions({
                    fields: {
                        ccnumber: { selector: '#ccnumber', placeholder: 'Card number' },
                        ccexp: { selector: '#ccexp', placeholder: 'MM / YY' },
                        cvv: { selector: '#cvv', placeholder: 'CVV' }
                    },
                    callback: onToken
                })
            );
        }

        const submit = $('billing-submit');
        if (submit && canSubmitBilling(clientConfig)) submit.disabled = false;
    }

    function loadCollectScript(cfg) {
        return new Promise((resolve, reject) => {
            if (window.CollectJS) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = cfg.collectJsUrl || 'https://secure.nmi.com/token/Collect.js';
            script.setAttribute('data-tokenization-key', cfg.tokenizationKey);
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Could not load the secure payment form.'));
            document.head.appendChild(script);
        });
    }

    async function initCollect() {
        clientConfig = await fetchJson('/client-config');
        showSetupAuthMessage(clientConfig);

        const achTab = $('pay-tab-ach');
        if (achTab && clientConfig.achEnabled) {
            achTab.hidden = false;
        }

        $('pay-tab-card')?.addEventListener('click', () => setPaymentMethod('card'));
        $('pay-tab-ach')?.addEventListener('click', () => {
            if (clientConfig.achEnabled) setPaymentMethod('ach');
        });

        const submit = $('billing-submit');
        if (!clientConfig.enabled || !clientConfig.tokenizationKey) {
            $('collect-placeholder').textContent =
                clientConfig.message ||
                'Platform billing is not configured yet. Ask your administrator to add EPI platform keys.';
            return;
        }

        if (clientConfig.requiresSetupAuth && !setupToken) {
            $('collect-placeholder').textContent = 'Payment entry is disabled until you open a valid signup link.';
            return;
        }

        try {
            await loadCollectScript(clientConfig);
            collectReady = true;
            mountCollectFields();
        } catch (e) {
            $('collect-placeholder').textContent = e.message || 'Could not load the secure payment form.';
            if (submit) submit.disabled = true;
        }
    }

    function selectedAchSecCode() {
        const accountType = $('ach-account-type')?.value || 'business';
        const codes = clientConfig?.achSecCodes || {};
        return accountType === 'personal' ? codes.personal || 'PPD' : codes.business || 'CCD';
    }

    async function submitPayment(paymentToken) {
        const msg = $('billing-msg');
        msg.textContent = 'Saving…';
        msg.style.color = '';

        const isAch = paymentMethod === 'ach';
        if (isAch && !$('billing-ach-authorize')?.checked) {
            msg.style.color = 'crimson';
            msg.textContent = 'Please authorize recurring ACH debits.';
            return;
        }
        if (!isAch && !$('billing-authorize')?.checked) {
            msg.style.color = 'crimson';
            msg.textContent = 'Please authorize recurring charges.';
            return;
        }

        try {
            const body = {
                payment_token: paymentToken,
                businessName: $('business-name').value,
                billingEmail: $('billing-email').value,
                licensedStationCount: Number($('station-count').value) || 1,
                authorized: $('billing-authorize')?.checked || $('billing-ach-authorize')?.checked,
                paymentMethodType: isAch ? 'ach' : 'card',
                setup_token: setupToken || undefined
            };
            if (isAch) {
                body.achAuthorized = true;
                body.achAccountType = $('ach-account-type')?.value || 'business';
                body.achSecCode = selectedAchSecCode();
            }

            const r = await fetch(`${apiOrigin}/api/pos-billing/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Setup failed');
            msg.style.color = 'green';
            msg.textContent = isAch
                ? 'Bank account saved. Monthly ACH debits will run through EPI when billing is enabled.'
                : 'Payment method saved. Your POS license is ready when enforcement is enabled.';
        } catch (e) {
            msg.style.color = 'crimson';
            msg.textContent = e.message || 'Setup failed';
        }
    }

    $('station-count')?.addEventListener('input', () => updateQuote());
    $('billing-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = $('billing-msg');
        if (msg) {
            msg.textContent =
                'Use Save payment method after the secure fields validate (Collect.js submits the token).';
        }
    });

    updateQuote();
    initCollect();
})();

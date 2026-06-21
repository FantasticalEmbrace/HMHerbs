'use strict';

(function () {
    function resolveApiOrigin() {
        if (typeof window === 'undefined' || !window.location) return '';
        if (window.location.protocol === 'file:') return 'http://127.0.0.1:3001';
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        if (isLocal && window.location.port && window.location.port !== '3001') {
            return 'http://127.0.0.1:3001';
        }
        return window.location.origin;
    }

    const apiOrigin = resolveApiOrigin();
    const apiBase = `${apiOrigin}/api/business-one/pos`;

    let clientConfig = null;
    let paymentMethod = 'card';
    let collectReady = false;

    function $(id) {
        return document.getElementById(id);
    }

    function setMsg(text, tone) {
        const msg = $('billing-msg');
        if (!msg) return;
        msg.textContent = text || '';
        msg.className = 'pos-form-msg' + (tone ? ` pos-form-msg--${tone}` : '');
    }

    async function fetchJson(path) {
        const r = await fetch(`${apiBase}${path}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
        return data;
    }

    async function updateQuote() {
        const quoteEl = $('pricing-quote');
        try {
            const stations = Math.max(1, Number($('station-count')?.value) || 1);
            const r = await fetch(`${apiBase}/pricing?stations=${stations}`);
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
            const q = data.quote || {};
            if (quoteEl) quoteEl.textContent = `${q.formatted || ''} — ${q.summary || ''}`;
        } catch (e) {
            if (quoteEl) quoteEl.textContent = e.message || 'Could not load pricing.';
        }
    }

    function setPaymentMethod(method) {
        paymentMethod = method === 'ach' ? 'ach' : 'card';
        $('pay-tab-card')?.setAttribute('aria-selected', paymentMethod === 'card' ? 'true' : 'false');
        $('pay-tab-ach')?.setAttribute('aria-selected', paymentMethod === 'ach' ? 'true' : 'false');
        $('ach-account-type-wrap')?.classList.toggle('visible', paymentMethod === 'ach');
        $('card-authorize-wrap').style.display = paymentMethod === 'card' ? 'flex' : 'none';
        $('ach-authorize-wrap').style.display = paymentMethod === 'ach' ? 'flex' : 'none';
        $('billing-authorize').required = paymentMethod === 'card';
        $('billing-ach-authorize').required = paymentMethod === 'ach';
        if (collectReady && clientConfig) mountCollectFields();
    }

    function mountCollectFields() {
        const mount = $('collect-mount');
        const collect = window.BusinessOneCollect;
        if (!mount || !window.CollectJS || !collect) return;

        const onToken = (response) => {
            if (response.token) submitSignup(response.token);
        };

        if (paymentMethod === 'ach') {
            $('collect-placeholder').textContent = 'Bank account (secure — processed by EPI)';
            mount.innerHTML = `
              <div class="pos-collect-fields">
                <div class="form-group">
                  <label for="checkname">Name on account</label>
                  <div id="checkname" class="pos-field-host"></div>
                </div>
                <div class="form-group">
                  <label for="checkaba">Routing number</label>
                  <div id="checkaba" class="pos-field-host"></div>
                </div>
                <div class="form-group">
                  <label for="checkaccount">Account number</label>
                  <div id="checkaccount" class="pos-field-host"></div>
                </div>
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
            $('collect-placeholder').textContent = 'Card details (secure — processed by EPI)';
            mount.innerHTML = `
              <div class="pos-collect-fields">
                <div class="form-group">
                  <label for="ccnumber">Card number</label>
                  <div id="ccnumber" class="pos-field-host"></div>
                </div>
                <div class="pos-field-row">
                  <div class="form-group">
                    <label for="ccexp">Expiry</label>
                    <div id="ccexp" class="pos-field-host"></div>
                  </div>
                  <div class="form-group">
                    <label for="cvv">CVV</label>
                    <div id="cvv" class="pos-field-host"></div>
                  </div>
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
        if (clientConfig?.enabled) $('billing-submit').disabled = false;
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
            script.onerror = () => reject(new Error('Could not load secure payment form.'));
            document.head.appendChild(script);
        });
    }

    function selectedAchSecCode() {
        const accountType = $('ach-account-type')?.value || 'business';
        const codes = clientConfig?.achSecCodes || {};
        return accountType === 'personal' ? codes.personal || 'PPD' : codes.business || 'CCD';
    }

    async function submitSignup(paymentToken) {
        setMsg('Submitting your signup…', '');
        const isAch = paymentMethod === 'ach';
        if (isAch && !$('billing-ach-authorize')?.checked) {
            setMsg('Please check the authorization box for bank debits.', 'err');
            return;
        }
        if (!isAch && !$('billing-authorize')?.checked) {
            setMsg('Please check the authorization box for card charges.', 'err');
            return;
        }
        try {
            const body = {
                payment_token: paymentToken,
                businessName: $('business-name').value,
                contactName: $('contact-name').value,
                phone: $('phone').value,
                billingEmail: $('billing-email').value,
                licensedStationCount: Number($('station-count').value) || 1,
                authorized: true,
                paymentMethodType: isAch ? 'ach' : 'card'
            };
            if (isAch) {
                body.achAuthorized = true;
                body.achAccountType = $('ach-account-type')?.value || 'business';
                body.achSecCode = selectedAchSecCode();
            }
            const r = await fetch(`${apiBase}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Signup failed');
            setMsg('', '');
            $('billing-msg').innerHTML =
                `<strong style="color:#15803d;">You’re signed up!</strong> ${data.message || ''} ` +
                `<a href="/pos/" target="_blank" rel="noopener">Try the demo</a> while we email your store access.`;
            $('billing-submit').disabled = true;
        } catch (e) {
            setMsg(e.message || 'Signup failed. Please try again or call (850) 290-2084.', 'err');
        }
    }

    function showHubOff() {
        $('hub-off-panel').hidden = false;
        $('signup-panel').hidden = true;
    }

    async function init() {
        try {
            const info = await fetch(`${apiBase}/info`).then((r) => r.json());
            if (!info.enabled) {
                showHubOff();
                return;
            }

            clientConfig = await fetchJson('/client-config');
            if (clientConfig.achEnabled) $('pay-tab-ach').hidden = false;

            $('pay-tab-card')?.addEventListener('click', () => setPaymentMethod('card'));
            $('pay-tab-ach')?.addEventListener('click', () => setPaymentMethod('ach'));

            if (!clientConfig.enabled || !clientConfig.tokenizationKey) {
                $('collect-placeholder').textContent =
                    clientConfig.message ||
                    'Payment setup is being configured. Call (850) 290-2084 to sign up by phone.';
                setMsg('Online payment fields are not ready yet — you can still call us to get started.', 'warn');
                return;
            }

            await loadCollectScript(clientConfig);
            collectReady = true;
            mountCollectFields();
        } catch (e) {
            showHubOff();
        }
    }

    $('station-count')?.addEventListener('input', () => updateQuote());
    $('billing-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        setMsg('Click Complete signup after the payment fields validate.', 'warn');
    });

    updateQuote();
    init();
})();

'use strict';

(function () {
    const form = document.getElementById('pos-signup-form');
    const stationsEl = document.getElementById('signup-stations');
    const quoteAmount = document.getElementById('signup-quote-amount');
    const quoteDetail = document.getElementById('signup-quote-detail');
    const formMsg = document.getElementById('signup-form-msg');
    const submitBtn = document.getElementById('signup-submit-btn');
    const formPanel = document.getElementById('signup-form-panel');
    const successPanel = document.getElementById('signup-success-panel');
    const successText = document.getElementById('signup-success-text');

    if (!form) return;

    function apiOrigin() {
        if (window.location.protocol === 'file:') return 'http://127.0.0.1:3001';
        return window.location.origin;
    }

    function setMsg(text, tone) {
        if (!formMsg) return;
        formMsg.textContent = text || '';
        formMsg.className = 'signup-msg' + (tone === 'ok' ? ' signup-msg--ok' : tone === 'err' ? ' signup-msg--err' : '');
    }

    async function refreshQuote() {
        const stations = Number(stationsEl?.value) || 1;
        try {
            const res = await fetch(`${apiOrigin()}/api/pos-billing/pricing?stations=${stations}`);
            const data = await res.json().catch(() => ({}));
            if (data.quote) {
                if (quoteAmount) quoteAmount.textContent = data.quote.formatted;
                if (quoteDetail) quoteDetail.textContent = data.quote.summary;
            }
        } catch (_) {
            /* pricing is decorative; form still works */
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setMsg('');

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const payload = {
            businessName: form.businessName.value.trim(),
            contactName: form.contactName.value.trim(),
            email: form.email.value.trim(),
            phone: form.phone.value.trim(),
            stationCount: Number(form.stationCount.value) || 1,
            message: form.message.value.trim()
        };

        submitBtn.disabled = true;
        setMsg('Submitting…');

        try {
            const res = await fetch(`${apiOrigin()}/api/pos-billing/signup-intake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Signup failed. Please try again.');

            if (formPanel) formPanel.hidden = true;
            if (successPanel) {
                successPanel.hidden = false;
                successPanel.classList.add('is-visible');
            }
            if (successText) {
                successText.textContent = data.message || 'Thank you — we’ll be in touch within one business day.';
            }
        } catch (err) {
            setMsg(err.message || 'Signup failed.', 'err');
            submitBtn.disabled = false;
        }
    });

    stationsEl?.addEventListener('change', refreshQuote);
    refreshQuote();
})();

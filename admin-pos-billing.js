/**
 * POS License tab — billing lives on businessonecomprehensive.com (ProCharge), not HM Herbs admin UI.
 */
(function () {
    'use strict';

    function billingPortalUrl() {
        if (window.BusinessOneUrls?.billingPortalUrl) {
            return window.BusinessOneUrls.billingPortalUrl();
        }
        return 'https://businessonecomprehensive.com/billing-portal.html';
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
        const portal = billingPortalUrl();
        el.innerHTML = hasVault
            ? `<strong>Status:</strong> Payment method on file (ProCharge). Update it on the <a href="${portal}" target="_blank" rel="noopener noreferrer">Business One billing portal</a>.`
            : `<strong>Status:</strong> No payment method saved. <a href="${portal}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display:inline-block;margin-top:0.5rem;text-decoration:none;">Open Business One billing</a>`;
    }

    async function init(hasBillingVault) {
        const card = document.getElementById('pos-license-billing-card');
        if (!card || card.style.display === 'none') return;

        setStatus(Boolean(hasBillingVault));
        setMsg('', '');

        const mount = document.getElementById('pos-license-collect-mount');
        const placeholder = document.getElementById('pos-license-collect-placeholder');
        const saveBtn = document.getElementById('pos-license-billing-save-btn');
        const authorize = document.getElementById('pos-license-billing-authorize');

        if (mount) mount.innerHTML = '';
        if (placeholder) {
            placeholder.textContent =
                'Platform billing (POS, hosting, internet, hardware) is managed on businessonecomprehensive.com — not on this store admin skin.';
        }
        if (saveBtn) {
            saveBtn.textContent = 'Open Business One billing portal';
            saveBtn.disabled = false;
            saveBtn.onclick = () => window.open(billingPortalUrl(), '_blank', 'noopener,noreferrer');
        }
        if (authorize) {
            authorize.closest('label')?.style.setProperty('display', 'none');
        }
    }

    window.adminPosBilling = { init };
})();

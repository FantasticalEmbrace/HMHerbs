'use strict';

/** Base URL for customer-facing storefront links (emails, thank-you page). */
function getStorefrontPublicBaseUrl() {
    let base = String(process.env.STOREFRONT_PUBLIC_URL || process.env.FRONTEND_URL || '').trim();
    base = base.replace(/\/+$/, '');
    if (!base) {
        const port = String(process.env.PORT || 3001).trim();
        base = `http://localhost:${port}`;
    }
    return base;
}

module.exports = { getStorefrontPublicBaseUrl };

'use strict';

/**
 * Business One central hub (businessonecomprehensive.com).
 * When enabled, public POS signup, demo, and billing live on this deployment — not per-merchant admin links.
 */
function isBusinessOneHubEnabled() {
    const raw = String(process.env.BUSINESS_ONE_HUB_ENABLED ?? '').trim().toLowerCase();
    if (raw === 'true' || raw === '1' || raw === 'yes') return true;
    if (raw === 'false' || raw === '0' || raw === 'no') return false;
    // Local / staging: signup works out of the box on the Business One website
    return process.env.NODE_ENV !== 'production';
}

function getBusinessOneHubPublicUrl() {
    const raw = String(
        process.env.BUSINESS_ONE_HUB_PUBLIC_URL ||
            process.env.PLATFORM_SUPPORT_HUB_PUBLIC_URL ||
            process.env.FRONTEND_URL ||
            ''
    ).trim();
    return raw.replace(/\/+$/, '');
}

function getBusinessOneSignupNotifyEmail() {
    return String(
        process.env.BUSINESS_ONE_SIGNUP_NOTIFY_EMAIL ||
            process.env.BUSINESS_ONE_CONTACT_EMAIL ||
            'info@businessonecomprehensive.com'
    ).trim();
}

module.exports = {
    isBusinessOneHubEnabled,
    getBusinessOneHubPublicUrl,
    getBusinessOneSignupNotifyEmail
};

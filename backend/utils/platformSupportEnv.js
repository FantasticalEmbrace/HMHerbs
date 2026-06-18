'use strict';

function getPlatformHubSecret() {
    return String(process.env.POS_PLATFORM_HUB_SECRET || '').trim();
}

function isPlatformHubEnabled() {
    return String(process.env.POS_PLATFORM_HUB_ENABLED || '').trim().toLowerCase() === 'true';
}

function isPlatformHubSyncConfigured() {
    const url = String(process.env.POS_PLATFORM_HUB_URL || '').trim();
    const secret = getPlatformHubSecret();
    const merchantId = String(process.env.POS_PLATFORM_MERCHANT_ID || '').trim();
    return Boolean(url && secret && merchantId);
}

function getPlatformMerchantId() {
    return String(process.env.POS_PLATFORM_MERCHANT_ID || '').trim();
}

function getPlatformHubUrl() {
    return String(process.env.POS_PLATFORM_HUB_URL || '').trim().replace(/\/+$/, '');
}

function getPlatformHubPublicUrl() {
    const explicit = String(process.env.PLATFORM_SUPPORT_HUB_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;
    return '';
}

function getStoreBaseUrl() {
    const explicit = String(process.env.POS_PLATFORM_STORE_URL || '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;
    return String(process.env.FRONTEND_URL || process.env.PUBLIC_STORE_URL || '').trim().replace(/\/+$/, '');
}

function verifyPlatformHubSecret(headerValue) {
    const secret = getPlatformHubSecret();
    if (!secret) return false;
    const provided = String(headerValue || '').trim();
    return provided.length > 0 && provided === secret;
}

module.exports = {
    getPlatformHubSecret,
    isPlatformHubEnabled,
    isPlatformHubSyncConfigured,
    getPlatformMerchantId,
    getPlatformHubUrl,
    getPlatformHubPublicUrl,
    getStoreBaseUrl,
    verifyPlatformHubSecret
};

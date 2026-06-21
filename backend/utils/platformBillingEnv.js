'use strict';

/**
 * Business One platform billing credentials (merchants pay YOU).
 * Falls back to store EPI keys only for local dev — use dedicated platform keys in production.
 */
function getPlatformPublicTokenizationKey() {
    return String(
        process.env.EPI_PLATFORM_PUBLIC_TOKENIZATION_KEY ||
            process.env.EPI_PUBLIC_TOKENIZATION_KEY ||
            process.env.NMI_PUBLIC_TOKENIZATION_KEY ||
            ''
    ).trim();
}

function getPlatformPrivateApiKey() {
    return String(
        process.env.EPI_PLATFORM_PRIVATE_API_KEY ||
            process.env.EPI_PRIVATE_API_KEY ||
            process.env.NMI_PRIVATE_API_KEY ||
            ''
    ).trim();
}

function isPlatformBillingConfigured() {
    return Boolean(getPlatformPublicTokenizationKey() && getPlatformPrivateApiKey());
}

/** When true, /pos-billing.html offers bank account (ACH) via Collect.js. */
function isPlatformAchEnabled() {
    const raw = String(process.env.POS_BILLING_ACH_ENABLED ?? 'true').trim().toLowerCase();
    return raw !== 'false' && raw !== '0' && raw !== 'no';
}

const VALID_ACH_SEC_CODES = new Set(['CCD', 'PPD', 'WEB', 'TEL']);

/** Default SEC code for recurring merchant billing when not specified at signup. */
function getDefaultAchSecCode() {
    const code = String(process.env.POS_BILLING_ACH_SEC_CODE || 'CCD').trim().toUpperCase();
    return VALID_ACH_SEC_CODES.has(code) ? code : 'CCD';
}

function normalizeAchSecCode(value, fallback = getDefaultAchSecCode()) {
    const code = String(value || '').trim().toUpperCase();
    if (VALID_ACH_SEC_CODES.has(code)) return code;
    return fallback;
}

module.exports = {
    getPlatformPublicTokenizationKey,
    getPlatformPrivateApiKey,
    isPlatformBillingConfigured,
    isPlatformAchEnabled,
    getDefaultAchSecCode,
    normalizeAchSecCode,
    VALID_ACH_SEC_CODES
};

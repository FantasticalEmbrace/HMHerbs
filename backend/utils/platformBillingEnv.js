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

module.exports = {
    getPlatformPublicTokenizationKey,
    getPlatformPrivateApiKey,
    isPlatformBillingConfigured
};

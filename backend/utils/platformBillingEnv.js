'use strict';

/**
 * Business One platform billing — merchants pay YOU via ProCharge (EPI ISO).
 * Store customer checkout: standard merchants use EPI; high-risk merchants use NMI/Durango — not this module.
 */
const { isProchargeConfigured } = require('./prochargeEnv');

function isPlatformBillingConfigured() {
    return isProchargeConfigured();
}

/** @deprecated ProCharge uses server-side tokenization — no public browser key. */
function getPlatformPublicTokenizationKey() {
    return '';
}

module.exports = {
    isPlatformBillingConfigured,
    getPlatformPublicTokenizationKey
};

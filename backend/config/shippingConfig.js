'use strict';

function numEnv(key, fallback) {
    const v = parseFloat(process.env[key]);
    return Number.isFinite(v) ? v : fallback;
}

const FREE_SHIPPING_THRESHOLD = numEnv('FREE_SHIPPING_THRESHOLD', 50);
const FIRST_CLASS_SHIPPING = numEnv('FIRST_CLASS_SHIPPING', 9.99);

module.exports = {
    FREE_SHIPPING_THRESHOLD,
    FIRST_CLASS_SHIPPING,
    SHIPPO_API_BASE: 'https://api.goshippo.com',
    SHIPPO_API_TOKEN: String(process.env.SHIPPO_API_TOKEN || '').trim(),
    SHIPPO_TEST_MODE: String(process.env.SHIPPO_TEST_MODE || 'true').toLowerCase() !== 'false',
    STORE_ORIGIN: {
        name: String(process.env.SHIPPO_FROM_NAME || process.env.STORE_NAME || 'H&M Herbs & Vitamins').trim(),
        company: String(process.env.SHIPPO_FROM_COMPANY || 'H&M Herbs & Vitamins').trim(),
        street1: String(process.env.SHIPPO_FROM_STREET1 || '').trim(),
        street2: String(process.env.SHIPPO_FROM_STREET2 || '').trim(),
        city: String(process.env.SHIPPO_FROM_CITY || '').trim(),
        state: String(process.env.SHIPPO_FROM_STATE || '').trim(),
        zip: String(process.env.SHIPPO_FROM_ZIP || '').trim(),
        country: String(process.env.SHIPPO_FROM_COUNTRY || 'US').trim(),
        phone: String(process.env.SHIPPO_FROM_PHONE || '').trim(),
        email: String(process.env.SHIPPO_FROM_EMAIL || process.env.SMTP_FROM || '').trim(),
    },
    CARRIER_FILTER: new Set(
        String(process.env.SHIPPO_CARRIERS || 'usps,ups,fedex')
            .split(',')
            .map((c) => c.trim().toLowerCase())
            .filter(Boolean)
    ),
};

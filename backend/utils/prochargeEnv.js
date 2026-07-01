'use strict';

const { Environment } = require('procharge');

function getProchargeApiHost() {
    const explicit = String(process.env.PROCHARGE_API_HOST || '').trim();
    if (explicit) return explicit.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const sandbox = String(process.env.PROCHARGE_SANDBOX ?? '1').trim().toLowerCase();
    const isProd = sandbox === '0' || sandbox === 'false' || sandbox === 'no';
    return isProd ? Environment.Production : Environment.Development;
}

function getProchargeApplicationKey() {
    return String(process.env.PROCHARGE_APPLICATION_KEY || '').trim();
}

function getProchargeMerchantNumber() {
    return String(process.env.PROCHARGE_MERCHANT_NUMBER || '').trim();
}

function getProchargeLoginCreds() {
    const email = String(
        process.env.PROCHARGE_EMAIL || process.env.PROCHARGE_USERNAME || ''
    ).trim();
    const passWord = String(process.env.PROCHARGE_PASSWORD || '').trim();
    const pin = String(process.env.PROCHARGE_PIN || '').trim();
    const application = String(process.env.PROCHARGE_APPLICATION || 'procharge').trim();
    return { email, passWord, pin: pin || undefined, application };
}

function isProchargeConfigured() {
    const creds = getProchargeLoginCreds();
    return Boolean(
        creds.email &&
            creds.passWord &&
            getProchargeApplicationKey() &&
            getProchargeMerchantNumber()
    );
}

function isProchargeSandbox() {
    const sandbox = String(process.env.PROCHARGE_SANDBOX ?? '1').trim().toLowerCase();
    return sandbox !== '0' && sandbox !== 'false' && sandbox !== 'no';
}

module.exports = {
    getProchargeApiHost,
    getProchargeApplicationKey,
    getProchargeMerchantNumber,
    getProchargeLoginCreds,
    isProchargeConfigured,
    isProchargeSandbox
};

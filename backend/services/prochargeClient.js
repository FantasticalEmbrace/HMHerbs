'use strict';

const axios = require('axios');
const { Client, Transaction, Environment } = require('procharge');
const logger = require('../utils/logger');
const {
    getProchargeApiHost,
    getProchargeApplicationKey,
    getProchargeMerchantNumber,
    getProchargeLoginCreds,
    isProchargeConfigured,
    isProchargeSandbox
} = require('../utils/prochargeEnv');

let cachedAuth = null;

function apiBaseUrl() {
    return `https://${getProchargeApiHost()}`;
}

function authExpired() {
    if (!cachedAuth?.access_token) return true;
    const expiresAt = cachedAuth.expiresAt || 0;
    return Date.now() >= expiresAt - 60_000;
}

async function getAuthToken() {
    if (!isProchargeConfigured()) {
        const err = new Error('ProCharge is not configured on the server.');
        err.code = 'PROCHARGE_NOT_CONFIGURED';
        throw err;
    }
    if (!authExpired()) {
        return cachedAuth.access_token;
    }

    const creds = getProchargeLoginCreds();
    const client = new Client({ env: getProchargeApiHost() });
    const response = await client.getAccessToken(creds);
    const token = response?.access_token || response?.accessToken;
    if (!token) {
        const err = new Error(response?.responseText || 'ProCharge authentication failed');
        err.code = 'PROCHARGE_AUTH_FAILED';
        throw err;
    }
    const ttlSec = Number(response.expires_in || response.expiresIn || 3600);
    cachedAuth = {
        access_token: token,
        refresh_token: response.refresh_token || response.refreshToken || null,
        expiresAt: Date.now() + ttlSec * 1000
    };
    return cachedAuth.access_token;
}

function bearerHeader(token) {
    const raw = String(token || '').trim();
    return raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
}

async function prochargeRequest(method, path, body) {
    const token = await getAuthToken();
    const headers = {
        Authorization: bearerHeader(token),
        'x-api-key': getProchargeApplicationKey(),
        Accept: 'application/json',
        'Content-Type': 'application/json'
    };
    const res = await axios({
        method,
        url: `${apiBaseUrl()}${path}`,
        headers,
        data: body,
        timeout: 60_000,
        validateStatus: () => true
    });
    return res;
}

function normalizeTransactionResponse(response) {
    const fields = response || {};
    const responseCode = String(
        fields.responseCode ?? fields.ResponseCode ?? fields.response_code ?? ''
    );
    const ok =
        responseCode === '0' ||
        responseCode === '00' ||
        Number(responseCode) === 0 ||
        String(fields.responseText || fields.ResponseText || '')
            .toLowerCase()
            .includes('approved');
    return {
        ok,
        responseCode,
        responseText: String(fields.responseText || fields.ResponseText || fields.message || ''),
        transactionId: String(
            fields.transactionID ||
                fields.transactionId ||
                fields.TransactionID ||
                fields.id ||
                ''
        ),
        approvalCode: String(fields.authorizationNumber || fields.AuthorizationNumber || ''),
        profileId: fields.profileID || fields.profileId || fields.ProfileID || null,
        token: fields.token || fields.Token || null,
        raw: fields
    };
}

/**
 * Tokenize card for vault storage (POST /api/token).
 */
async function tokenizeCard({
    cardNumber,
    ccExpMonth,
    ccExpYear,
    cvv,
    name,
    postalCode,
    street1,
    email
}) {
    const merchantNumber = getProchargeMerchantNumber();
    const body = {
        merchantNumber,
        cardNumber: String(cardNumber || '').replace(/\s+/g, ''),
        ccExpMonth: String(ccExpMonth || '').padStart(2, '0'),
        ccExpYear: String(ccExpYear || '').slice(-2),
        cvv: cvv ? String(cvv) : undefined,
        name: name || undefined,
        postalCode: postalCode || undefined,
        street1: street1 || undefined,
        email: email || undefined,
        sandbox: isProchargeSandbox() ? 'y' : 'n'
    };
    const res = await prochargeRequest('POST', '/api/token', body);
    if (res.status >= 400) {
        return {
            ok: false,
            responseText: res.data?.message || res.data?.responseText || `Tokenize HTTP ${res.status}`
        };
    }
    const token =
        res.data?.token ||
        res.data?.Token ||
        res.data?.paymentToken ||
        (typeof res.data === 'string' ? res.data : null);
    if (!token) {
        return {
            ok: false,
            responseText: res.data?.responseText || 'Tokenization did not return a token'
        };
    }
    return { ok: true, token: String(token), raw: res.data };
}

/**
 * Charge a stored ProCharge token.
 */
async function chargeToken({
    amount,
    token,
    orderNumber,
    email,
    name,
    isRecurring = false,
    isInstallment = false,
    description
}) {
    const client = new Client({
        env: getProchargeApiHost(),
        applicationKey: getProchargeApplicationKey(),
        authToken: bearerHeader(await getAuthToken())
    });
    const transaction = new Transaction();
    transaction.merchantNumber = getProchargeMerchantNumber();
    transaction.amount = Number(amount).toFixed(2);
    transaction.token = String(token);
    transaction.isEcommerce = true;
    transaction.isRecurring = Boolean(isRecurring);
    transaction.isInstallment = Boolean(isInstallment);
    transaction.sandbox = isProchargeSandbox() ? 'y' : 'n';
    if (orderNumber) transaction.orderNumber = String(orderNumber).slice(0, 64);
    if (email) transaction.email = String(email).slice(0, 255);
    if (name) transaction.name = String(name).slice(0, 120);
    if (description) transaction.description = String(description).slice(0, 255);

    try {
        const response = await client.processSale(transaction);
        return normalizeTransactionResponse(response);
    } catch (e) {
        logger.warn('[procharge] chargeToken failed', { message: e.message });
        return {
            ok: false,
            responseText: e.responseText || e.message || 'Charge failed'
        };
    }
}

/**
 * One-time card sale (hardware pay-in-full).
 */
async function chargeCard({
    amount,
    cardNumber,
    ccExpMonth,
    ccExpYear,
    cvv,
    name,
    postalCode,
    street1,
    email,
    orderNumber,
    description
}) {
    const tokenized = await tokenizeCard({
        cardNumber,
        ccExpMonth,
        ccExpYear,
        cvv,
        name,
        postalCode,
        street1,
        email
    });
    if (!tokenized.ok) return tokenized;
    return chargeToken({
        amount,
        token: tokenized.token,
        orderNumber,
        email,
        name,
        description
    });
}

async function achAuthenticate() {
    const res = await prochargeRequest('GET', '/api/ach/authenticate');
    if (res.status >= 400) {
        throw new Error(res.data?.message || `ACH auth HTTP ${res.status}`);
    }
    return res.data;
}

async function achAddCustomer({ name, email, bankAccount }) {
    const res = await prochargeRequest('POST', '/api/ach/customer', {
        name,
        email,
        bank_account: bankAccount
    });
    if (res.status >= 400) {
        return { ok: false, responseText: res.data?.message || `ACH customer HTTP ${res.status}` };
    }
    const uuid = res.data?.customer_uuid || res.data?.uuid || res.data?.id;
    return { ok: Boolean(uuid), customerUuid: uuid ? String(uuid) : null, raw: res.data };
}

async function achChargeToken({ customerUuid, amount, description }) {
    const res = await prochargeRequest('POST', '/api/ach/payment/token', {
        customer_uuid: customerUuid,
        amount: Number(amount).toFixed(2),
        description: description || 'Business One billing'
    });
    if (res.status >= 400) {
        return { ok: false, responseText: res.data?.message || `ACH payment HTTP ${res.status}` };
    }
    const paymentUuid = res.data?.payment_uuid || res.data?.uuid;
    return {
        ok: true,
        transactionId: paymentUuid ? String(paymentUuid) : null,
        approvalCode: String(res.data?.approval_code || res.data?.approvalCode || ''),
        raw: res.data
    };
}

function buildProchargeClient(authToken) {
    return new Client({
        env: getProchargeApiHost(),
        applicationKey: getProchargeApplicationKey(),
        authToken: bearerHeader(authToken)
    });
}

function baseTransactionFields({ profileId } = {}) {
    const transaction = new Transaction();
    transaction.merchantNumber = getProchargeMerchantNumber();
    transaction.isEcommerce = true;
    transaction.sandbox = isProchargeSandbox() ? 'y' : 'n';
    if (profileId) transaction.profileID = profileId;
    return transaction;
}

/**
 * Void a sale in the same open batch (before settlement).
 * Requires transactionID + approvalCode from the original sale.
 */
async function voidSale({ transactionId, approvalCode, profileId }) {
    if (!transactionId || !approvalCode) {
        return { ok: false, responseText: 'transactionId and approvalCode required for void' };
    }
    const transaction = baseTransactionFields({ profileId });
    transaction.transactionID = String(transactionId);
    transaction.approvalCode = String(approvalCode);
    transaction.cardNotPresent = true;
    transaction.cardTypeIndicator = 'C';

    try {
        const client = buildProchargeClient(await getAuthToken());
        const response = await client.voidSale(transaction);
        return normalizeTransactionResponse(response);
    } catch (e) {
        logger.warn('[procharge] voidSale failed', { message: e.message, transactionId });
        return {
            ok: false,
            responseText: e.responseText || e.message || 'Void failed'
        };
    }
}

/**
 * Refund to card via stored vault token (closed batch / after settlement).
 */
async function refundToken({
    amount,
    token,
    orderNumber,
    email,
    name,
    description,
    profileId,
    transactionId,
    approvalCode
}) {
    if (!token) {
        return { ok: false, responseText: 'Payment token required for refund' };
    }
    const transaction = baseTransactionFields({ profileId });
    transaction.amount = Number(amount).toFixed(2);
    transaction.token = String(token);
    transaction.cardTypeIndicator = 'C';
    transaction.aci = 'N';
    if (orderNumber) transaction.orderNumber = String(orderNumber).slice(0, 64);
    if (email) transaction.email = String(email).slice(0, 255);
    if (name) transaction.name = String(name).slice(0, 120);
    if (description) transaction.description = String(description).slice(0, 255);
    if (transactionId) transaction.transactionID = String(transactionId);
    if (approvalCode) transaction.approvalCode = String(approvalCode);

    try {
        const client = buildProchargeClient(await getAuthToken());
        const response = await client.processRefund(transaction);
        return normalizeTransactionResponse(response);
    } catch (e) {
        logger.warn('[procharge] refundToken failed', { message: e.message });
        return {
            ok: false,
            responseText: e.responseText || e.message || 'Refund failed'
        };
    }
}

function resetAuthCache() {
    cachedAuth = null;
}

module.exports = {
    getAuthToken,
    tokenizeCard,
    chargeToken,
    chargeCard,
    achAuthenticate,
    achAddCustomer,
    achChargeToken,
    voidSale,
    refundToken,
    normalizeTransactionResponse,
    resetAuthCache,
    Environment
};

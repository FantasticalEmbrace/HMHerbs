'use strict';

const axios = require('axios');
const { getNmiTransactUrl } = require('../utils/nmiEnv');

function parseNmiBody(raw) {
    const text = typeof raw === 'string' ? raw : String(raw || '');
    const out = {};
    for (const part of text.split('&')) {
        if (!part) continue;
        const eq = part.indexOf('=');
        const k = eq === -1 ? part : part.slice(0, eq);
        const v = eq === -1 ? '' : part.slice(eq + 1);
        try {
            out[decodeURIComponent(k.replace(/\+/g, '%20'))] = decodeURIComponent(
                v.replace(/\+/g, '%20')
            );
        } catch {
            out[k] = v;
        }
    }
    return out;
}

/**
 * Direct Post API sale using a Collect.js payment_token.
 * @param {{ securityKey: string, amount: string, paymentToken: string, orderId?: number }} opts
 * @returns {Promise<{ ok: boolean, fields: Record<string, string>, responseCode: string, responseText: string, transactionId: string | null }>}
 */
async function nmiSale(opts) {
    const { securityKey, amount, paymentToken, customerVaultId, billingId, customerVaultAction, transactUrl } =
        opts;
    const url = transactUrl || getNmiTransactUrl();

    const body = new URLSearchParams();
    body.set('security_key', securityKey);
    body.set('type', 'sale');
    body.set('amount', amount);

    if (paymentToken) {
        body.set('payment_token', paymentToken);
    }
    if (customerVaultId && billingId) {
        body.set('customer_vault_id', customerVaultId);
        body.set('billing_id', billingId);
    }
    if (customerVaultAction) {
        body.set('customer_vault', customerVaultAction);
    }

    const res = await axios.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 60000,
        validateStatus: () => true
    });

    const fields = parseNmiBody(res.data);
    const responseCode = String(fields.response ?? '');
    const ok = responseCode === '1';
    const responseText = String(fields.responsetext || 'Unknown gateway response');
    const transactionId = fields.transactionid ? String(fields.transactionid) : null;

    return { ok, fields, responseCode, responseText, transactionId };
}

/** Add payment method to NMI Customer Vault using Collect.js token. */
async function nmiVaultAddCustomer(opts) {
    const { securityKey, paymentToken } = opts;
    const url = getNmiTransactUrl();
    const body = new URLSearchParams();
    body.set('security_key', securityKey);
    body.set('customer_vault', 'add_customer');
    body.set('payment_token', paymentToken);

    const res = await axios.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 60000,
        validateStatus: () => true
    });

    const fields = parseNmiBody(res.data);
    const responseCode = String(fields.response ?? '');
    const ok = responseCode === '1';
    return {
        ok,
        fields,
        responseCode,
        responseText: String(fields.responsetext || ''),
        customerVaultId: fields.customer_vault_id ? String(fields.customer_vault_id) : null,
        billingId: fields.billing_id ? String(fields.billing_id) : null
    };
}

async function nmiVaultSale(opts) {
    return nmiSale({
        securityKey: opts.securityKey,
        amount: opts.amount,
        customerVaultId: opts.customerVaultId,
        billingId: opts.billingId
    });
}

/**
 * Customer-Present Cloud sale on a registered POI device (e.g. PAX A3700 via Durango/NMI).
 * Durango/NMI controls the payment UI on the terminal — not the POS web app.
 */
async function nmiPoiSale(opts) {
    const { securityKey, amount, poiDeviceId, orderId, responseMethod = 'synchronous', transactUrl } = opts;
    const url = transactUrl || getNmiTransactUrl();
    const body = new URLSearchParams();
    body.set('security_key', securityKey);
    body.set('type', 'sale');
    body.set('amount', amount);
    body.set('poi_device_id', String(poiDeviceId || '').trim());
    body.set('response_method', responseMethod);
    if (orderId) {
        body.set('orderid', String(orderId).slice(0, 128));
    }

    const res = await axios.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 120000,
        validateStatus: () => true
    });

    const fields = parseNmiBody(res.data);
    const responseCode = String(fields.response ?? '');
    const ok = responseCode === '1';
    const responseText = String(fields.responsetext || 'Unknown gateway response');
    const transactionId = fields.transactionid ? String(fields.transactionid) : null;
    const asyncStatusGuid = fields.async_status_guid ? String(fields.async_status_guid) : null;

    return { ok, fields, responseCode, responseText, transactionId, asyncStatusGuid };
}

/**
 * Void a captured sale by transaction id (same-day void when supported by processor).
 */
async function nmiVoid(opts) {
    const { securityKey, transactionId, transactUrl } = opts;
    if (!transactionId) {
        return { ok: false, responseText: 'transactionId required', fields: {} };
    }
    const url = transactUrl || getNmiTransactUrl();
    const body = new URLSearchParams();
    body.set('security_key', securityKey);
    body.set('type', 'void');
    body.set('transactionid', String(transactionId));

    const res = await axios.post(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 60000,
        validateStatus: () => true
    });

    const fields = parseNmiBody(res.data);
    const responseCode = String(fields.response ?? '');
    const ok = responseCode === '1';
    return {
        ok,
        fields,
        responseCode,
        responseText: String(fields.responsetext || 'Unknown gateway response')
    };
}

module.exports = { nmiSale, nmiPoiSale, nmiVaultAddCustomer, nmiVaultSale, nmiVoid, parseNmiBody };

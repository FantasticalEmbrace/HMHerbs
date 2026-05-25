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
    const { securityKey, amount, paymentToken } = opts;
    const url = getNmiTransactUrl();

    const body = new URLSearchParams();
    body.set('security_key', securityKey);
    body.set('type', 'sale');
    body.set('amount', amount);
    body.set('payment_token', paymentToken);

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

module.exports = { nmiSale, parseNmiBody };

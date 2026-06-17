'use strict';

const crypto = require('crypto');
const { resolvePosProcessorCredentials } = require('./storePaymentProcessor');
const { nmiSale, nmiPoiSale } = require('./nmiGateway');
const { loadPosCardCheckoutSettings } = require('./posCardCheckoutSettings');

const INTENT_TTL_MS = 15 * 60 * 1000;

function mapIntentRow(row) {
    if (!row) return null;
    let cart = row.cart_json;
    if (typeof cart === 'string') {
        try {
            cart = JSON.parse(cart);
        } catch {
            cart = null;
        }
    }
    return {
        id: row.id,
        deviceId: row.device_id,
        status: row.status,
        amount: Number(row.amount),
        cart,
        checkoutMode: row.checkout_mode || '',
        authCode: row.auth_code || '',
        lastFour: row.last_four || '',
        cardBrand: row.card_brand || '',
        transactionId: row.nmi_transaction_id || '',
        errorMessage: row.error_message || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at
    };
}

function checkoutPhaseForIntent(intent) {
    if (!intent) return 'idle';
    if (intent.status === 'awaiting') return 'awaiting_payment';
    if (intent.status === 'processing') return 'processing';
    return intent.status;
}

async function upsertDisplayCheckout(pool, deviceId, intent, checkoutMode) {
    const [rows] = await pool.execute(
        'SELECT payload FROM pos_display_snapshots WHERE device_id = ? LIMIT 1',
        [deviceId]
    );
    let existing = {};
    if (rows[0]?.payload) {
        try {
            existing = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
        } catch {
            existing = {};
        }
    }
    const mode = checkoutMode || intent?.checkoutMode || '';
    const payload = {
        ...existing,
        checkout: intent
            ? {
                  phase: checkoutPhaseForIntent(intent),
                  intentId: intent.id,
                  amount: intent.amount,
                  mode,
                  updatedAt: new Date().toISOString()
              }
            : { phase: 'idle' }
    };
    await pool.execute(
        `INSERT INTO pos_display_snapshots (device_id, payload) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
        [deviceId, JSON.stringify(payload)]
    );
}

async function cancelStaleIntentsForDevice(pool, deviceId) {
    await pool.execute(
        `UPDATE pos_checkout_intents
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE device_id = ? AND status IN ('awaiting', 'processing')`,
        [String(deviceId || '').slice(0, 64)]
    );
    await upsertDisplayCheckout(pool, deviceId, null);
}

async function claimIntentForProcessing(pool, intentId) {
    const [result] = await pool.execute(
        `UPDATE pos_checkout_intents
         SET status = 'processing', error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'awaiting'`,
        [intentId]
    );
    if (!result.affectedRows) {
        const existing = await getCheckoutIntent(pool, intentId);
        if (existing?.status === 'approved') return existing;
        const err = new Error(
            existing?.status === 'processing'
                ? 'Checkout is already processing'
                : 'Checkout is no longer active'
        );
        err.code = existing ? 'INVALID_STATE' : 'NOT_FOUND';
        throw err;
    }
    return getCheckoutIntent(pool, intentId);
}

async function revertIntentToAwaiting(pool, intentId, message) {
    await pool.execute(
        `UPDATE pos_checkout_intents
         SET status = 'awaiting', error_message = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'processing'`,
        [String(message || 'Payment could not be completed').slice(0, 500), intentId]
    );
}

function resolveCredentialsForMode(checkoutMode) {
    const posProcessor = 'nmi_durango';
    return resolvePosProcessorCredentials(posProcessor);
}

async function applySaleResult(pool, intentId, deviceId, sale) {
    if (sale.asyncStatusGuid && !sale.ok) {
        return getCheckoutIntent(pool, intentId);
    }

    if (!sale.ok) {
        const message = sale.responseText || 'Card declined';
        await pool.execute(
            `UPDATE pos_checkout_intents SET status = 'declined', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [message.slice(0, 500), intentId]
        );
        const declined = await getCheckoutIntent(pool, intentId);
        await upsertDisplayCheckout(pool, deviceId, declined, declined?.checkoutMode);
        const err = new Error(message);
        err.code = 'CARD_DECLINED';
        err.data = { intent: declined };
        throw err;
    }

    const authCode = String(sale.fields.authcode || sale.fields.authorizationcode || '').trim();
    const lastFour = String(sale.fields.cc_number || sale.fields.ccnumber || '')
        .replace(/\D/g, '')
        .slice(-4);
    const cardBrand = String(sale.fields.cc_type || sale.fields.cctype || 'card').trim();

    await pool.execute(
        `UPDATE pos_checkout_intents SET
            status = 'approved',
            auth_code = ?,
            last_four = ?,
            card_brand = ?,
            nmi_transaction_id = ?,
            error_message = NULL,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [authCode || null, lastFour || null, cardBrand || null, sale.transactionId || null, intentId]
    );
    const approved = await getCheckoutIntent(pool, intentId);
    await upsertDisplayCheckout(pool, deviceId, approved, approved?.checkoutMode);
    setTimeout(() => {
        upsertDisplayCheckout(pool, deviceId, null).catch(() => {});
    }, 4000);
    return approved;
}

async function createCheckoutIntent(pool, { deviceId, amount, cart, employeeId }) {
    const checkoutSettings = await loadPosCardCheckoutSettings(pool);
    const id = crypto.randomUUID();
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
        const err = new Error('Invalid checkout amount');
        err.code = 'INVALID_AMOUNT';
        throw err;
    }
    if (!checkoutSettings.displayCardCheckout) {
        const err = new Error('Customer display card checkout is disabled');
        err.code = 'CHECKOUT_DISABLED';
        throw err;
    }

    await cancelStaleIntentsForDevice(pool, deviceId);

    const checkoutMode = checkoutSettings.displayMode;
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    await pool.execute(
        `INSERT INTO pos_checkout_intents
         (id, device_id, employee_id, status, amount, cart_json, checkout_mode, expires_at)
         VALUES (?, ?, ?, 'awaiting', ?, ?, ?, ?)`,
        [
            id,
            String(deviceId || '').slice(0, 64),
            employeeId || null,
            amt,
            JSON.stringify(cart || {}),
            checkoutMode,
            expiresAt
        ]
    );
    let intent = await getCheckoutIntent(pool, id);
    await upsertDisplayCheckout(pool, deviceId, intent, checkoutMode);

    if (checkoutMode === 'durango_terminal') {
        intent = await chargeTerminalCheckoutIntent(pool, id, deviceId);
    }
    return intent;
}

async function getCheckoutIntent(pool, intentId) {
    const [rows] = await pool.execute(`SELECT * FROM pos_checkout_intents WHERE id = ? LIMIT 1`, [
        String(intentId)
    ]);
    return rows[0] ? mapIntentRow(rows[0]) : null;
}

async function cancelCheckoutIntent(pool, intentId, deviceId) {
    const existing = await getCheckoutIntent(pool, intentId);
    if (!existing) return null;
    if (deviceId && existing.deviceId !== deviceId) {
        const err = new Error('Checkout not found');
        err.code = 'NOT_FOUND';
        throw err;
    }
    if (existing.status === 'approved') return existing;
    await pool.execute(
        `UPDATE pos_checkout_intents SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [intentId]
    );
    const intent = await getCheckoutIntent(pool, intentId);
    await upsertDisplayCheckout(pool, existing.deviceId, null);
    return intent;
}

async function chargeTerminalCheckoutIntent(pool, intentId, deviceId) {
    const existing = await getCheckoutIntent(pool, intentId);
    if (!existing) {
        const err = new Error('Checkout not found');
        err.code = 'NOT_FOUND';
        throw err;
    }
    if (deviceId && existing.deviceId !== deviceId) {
        const err = new Error('Checkout not found');
        err.code = 'NOT_FOUND';
        throw err;
    }
    if (existing.status === 'approved') return existing;
    if (existing.status === 'processing') return existing;
    if (existing.status !== 'awaiting') {
        const err = new Error('Checkout is no longer active');
        err.code = 'INVALID_STATE';
        throw err;
    }
    if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
        await pool.execute(
            `UPDATE pos_checkout_intents SET status = 'expired', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            ['Checkout expired', intentId]
        );
        const err = new Error('Checkout expired');
        err.code = 'EXPIRED';
        throw err;
    }

    const checkoutSettings = await loadPosCardCheckoutSettings(pool);
    if (checkoutSettings.displayMode !== 'durango_terminal' || !checkoutSettings.poiDeviceId) {
        const err = new Error('Durango terminal checkout is not configured');
        err.code = 'TERMINAL_NOT_CONFIGURED';
        throw err;
    }

    const claimed = await claimIntentForProcessing(pool, intentId);
    await upsertDisplayCheckout(pool, existing.deviceId, claimed, 'durango_terminal');

    const creds = resolveCredentialsForMode('durango_terminal');
    if (!creds.privateKey) {
        await revertIntentToAwaiting(pool, intentId, 'Durango/NMI is not configured on the server');
        const err = new Error('Card processor is not configured on the server');
        err.code = 'PROCESSOR_NOT_CONFIGURED';
        throw err;
    }

    try {
        const sale = await nmiPoiSale({
            securityKey: creds.privateKey,
            amount: existing.amount.toFixed(2),
            poiDeviceId: checkoutSettings.poiDeviceId,
            transactUrl: creds.transactUrl
        });
        return await applySaleResult(pool, intentId, existing.deviceId, sale);
    } catch (e) {
        if (e.code === 'CARD_DECLINED') throw e;
        await revertIntentToAwaiting(pool, intentId, e.message || 'Terminal payment failed');
        throw e;
    }
}

async function completeCheckoutIntent(pool, intentId, { paymentToken, deviceId }) {
    const checkoutSettings = await loadPosCardCheckoutSettings(pool);
    if (!checkoutSettings.displayCardCheckout) {
        const err = new Error('Customer display card checkout is disabled');
        err.code = 'CHECKOUT_DISABLED';
        throw err;
    }

    const existing = await getCheckoutIntent(pool, intentId);
    if (!existing) {
        const err = new Error('Checkout not found');
        err.code = 'NOT_FOUND';
        throw err;
    }
    if (deviceId && existing.deviceId !== deviceId) {
        const err = new Error('Checkout not found');
        err.code = 'NOT_FOUND';
        throw err;
    }
    if (existing.status === 'approved') return existing;
    if (existing.checkoutMode === 'durango_terminal') {
        const err = new Error('This checkout is handled on the card terminal');
        err.code = 'TERMINAL_MODE';
        throw err;
    }
    if (existing.status === 'processing') {
        return existing;
    }
    if (existing.status !== 'awaiting') {
        const err = new Error('Checkout is no longer active');
        err.code = 'INVALID_STATE';
        throw err;
    }
    if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
        await pool.execute(
            `UPDATE pos_checkout_intents SET status = 'expired', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            ['Checkout expired', intentId]
        );
        const err = new Error('Checkout expired');
        err.code = 'EXPIRED';
        throw err;
    }
    const token = String(paymentToken || '').trim();
    if (!token) {
        const err = new Error('Payment token required');
        err.code = 'TOKEN_REQUIRED';
        throw err;
    }

    const claimed = await claimIntentForProcessing(pool, intentId);
    await upsertDisplayCheckout(pool, existing.deviceId, claimed, existing.checkoutMode);

    const creds = resolveCredentialsForMode(existing.checkoutMode);
    if (!creds.privateKey) {
        await revertIntentToAwaiting(pool, intentId, 'In-store Durango/NMI is not configured (POS_NMI_* keys)');
        const err = new Error('In-store card processor is not configured on the server');
        err.code = 'PROCESSOR_NOT_CONFIGURED';
        throw err;
    }

    try {
        const sale = await nmiSale({
            securityKey: creds.privateKey,
            amount: existing.amount.toFixed(2),
            paymentToken: token,
            transactUrl: creds.transactUrl
        });
        return await applySaleResult(pool, intentId, existing.deviceId, sale);
    } catch (e) {
        if (e.code === 'CARD_DECLINED') throw e;
        await revertIntentToAwaiting(pool, intentId, e.message || 'Card payment failed');
        throw e;
    }
}

module.exports = {
    createCheckoutIntent,
    getCheckoutIntent,
    cancelCheckoutIntent,
    completeCheckoutIntent,
    chargeTerminalCheckoutIntent,
    upsertDisplayCheckout
};

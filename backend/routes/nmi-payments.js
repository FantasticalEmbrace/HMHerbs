'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const promoEngine = require('../services/webPromotionEngine');
const { nmiSale } = require('../services/nmiGateway');
const { finalizePaidOrder } = require('../services/finalizePaidOrder');
const { cartLookupBinds, hasCartIdentity } = require('../utils/cartSession');
const {
    getNmiPublicTokenizationKey,
    getNmiPrivateApiKey,
    getNmiCollectJsUrl,
    isNmiSandboxHint,
    isNmiWalletsDisabled,
    nmiResolveTokenizationCollectJs,
    shouldSkipNmiTokenizationPreflight
} = require('../utils/nmiEnv');

const router = express.Router();

/** Payment method is stored in orders.notes (no payment_method column). */
function getOrderPaymentMethod(orderRow) {
    const notes = String(orderRow?.notes || '');
    const match = notes.match(/Payment method:\s*([a-z_]+)/i);
    if (match) return match[1].toLowerCase();
    return String(orderRow?.payment_method || '').toLowerCase();
}

async function getAuthenticatedUserFromRequest(req) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = Number(decoded?.userId);
        if (!Number.isInteger(userId) || userId <= 0) return null;

        const [rows] = await req.pool.execute(
            'SELECT id, email, tax_exempt, tax_exempt_id FROM users WHERE id = ? LIMIT 1',
            [userId]
        );
        return rows[0] || null;
    } catch {
        return null;
    }
}

async function assertCanPayOrder(req, orderRow, body) {
    const sessionId = String(req.headers['x-session-id'] || req.sessionID || '');
    const email = String(body?.customerEmail || body?.email || '').trim().toLowerCase();

    if (orderRow.user_id) {
        const authUser = await getAuthenticatedUserFromRequest(req);
        if (!authUser || Number(authUser.id) !== Number(orderRow.user_id)) {
            const err = new Error('FORBIDDEN');
            err.status = 403;
            throw err;
        }
        return;
    }
    if (email && String(orderRow.email || '').trim().toLowerCase() === email) return;

    const err = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
}

/** Public: Collect.js URL + tokenization key (never the private security key). */
router.get('/nmi-client-config', async (req, res) => {
    const tokenizationKey = getNmiPublicTokenizationKey();
    if (!tokenizationKey) {
        return res.json({
            enabled: false,
            tokenizationKey: '',
            collectJsUrl: getNmiCollectJsUrl(),
            disableWallets: isNmiWalletsDisabled()
        });
    }

    try {
        const resolved = await nmiResolveTokenizationCollectJs(tokenizationKey);
        if (!resolved.ok) {
            if (shouldSkipNmiTokenizationPreflight()) {
                return res.json({
                    enabled: true,
                    tokenizationKey,
                    collectJsUrl: getNmiCollectJsUrl(),
                    variant: 'inline',
                    sandbox: isNmiSandboxHint(),
                    disableWallets: isNmiWalletsDisabled(),
                    preflightSkipped: true
                });
            }
            logger.warn(
                'NMI tokenization key rejected by token preflight (401/403). Use the Collect.js public tokenization key from the Durango/NMI merchant portal (not the Direct Post security key), set NMI_COLLECT_JS_URL for sandbox, or set NMI_SKIP_TOKENIZATION_PREFLIGHT=1.'
            );
            return res.json({
                enabled: false,
                tokenizationKey: '',
                collectJsUrl: resolved.collectJsUrl || getNmiCollectJsUrl(),
                variant: 'inline',
                sandbox: isNmiSandboxHint(),
                disableWallets: isNmiWalletsDisabled(),
                preflightRejected: true
            });
        }
        return res.json({
            enabled: true,
            tokenizationKey,
            collectJsUrl: resolved.collectJsUrl,
            variant: 'inline',
            sandbox: isNmiSandboxHint(),
            disableWallets: isNmiWalletsDisabled()
        });
    } catch (e) {
        logger.warn('NMI tokenization preflight error; still offering Collect.js', { err: e && e.message });
        return res.json({
            enabled: true,
            tokenizationKey,
            collectJsUrl: getNmiCollectJsUrl(),
            variant: 'inline',
            sandbox: isNmiSandboxHint(),
            disableWallets: isNmiWalletsDisabled()
        });
    }
});

/**
 * POST { orderId, payment_token, customerEmail? }
 * Re-prices from order lines, charges NMI, finalizes order, clears server cart when session matches.
 */
router.post('/process-payment', async (req, res) => {
    try {
        const securityKey = getNmiPrivateApiKey();
        if (!securityKey) {
            return res.status(503).json({ error: 'Payment processing is not configured.' });
        }

        const { orderId, payment_token: paymentTokenRaw, customerEmail } = req.body || {};
        const oid = Number(orderId);
        const payment_token = String(paymentTokenRaw || '').trim();
        if (!Number.isFinite(oid) || oid < 1 || !payment_token) {
            return res.status(400).json({ error: 'orderId and payment_token are required' });
        }

        const [orders] = await req.pool.execute('SELECT * FROM orders WHERE id = ? AND status = ?', [
            oid,
            'pending'
        ]);
        if (!orders.length) {
            return res.status(404).json({ error: 'Order not found or already paid' });
        }
        const orderRow = orders[0];

        try {
            await assertCanPayOrder(req, orderRow, { ...req.body, customerEmail });
        } catch (e) {
            if (e.status === 403) {
                return res.status(403).json({ error: 'Not allowed to pay for this order' });
            }
            throw e;
        }

        const method = getOrderPaymentMethod(orderRow);
        if (method !== 'credit_card' && method !== 'debit_card') {
            return res.status(400).json({ error: 'This order does not use card payment.' });
        }

        const [items] = await req.pool.execute(
            'SELECT product_id, variant_id, quantity, price FROM order_items WHERE order_id = ?',
            [oid]
        );
        const normalized = items.map((oi) => ({
            product_id: Number(oi.product_id),
            variant_id: oi.variant_id,
            quantity: Number(oi.quantity),
            price: 0
        }));

        let applyTaxExemption = false;
        let customerType = null;
        if (orderRow.user_id) {
            const [[user]] = await req.pool.execute(
                'SELECT tax_exempt, tax_exempt_id, customer_type FROM users WHERE id = ? LIMIT 1',
                [orderRow.user_id]
            );
            customerType = user?.customer_type;
            const hasTaxExemptProof = Boolean(user?.tax_exempt_id && String(user.tax_exempt_id).trim().length >= 3);
            applyTaxExemption = Boolean(user?.tax_exempt) && hasTaxExemptProof;
        }

        let recheck;
        try {
            recheck = await promoEngine.previewOrApplyTotals(req.pool, {
                cartItems: normalized,
                promoCode: String(orderRow.promo_code || '').trim(),
                email: orderRow.email,
                applyTaxExemption,
                customerType
            });
        } catch (e) {
            logger.error('NMI price recheck failed:', e);
            return res.status(400).json({ error: 'Unable to verify order pricing.' });
        }

        const expected = promoEngine.roundMoney(recheck.totals.totalAmount);
        const stored = promoEngine.roundMoney(Number(orderRow.total_amount));
        if (Math.abs(expected - stored) > 0.02) {
            return res.status(400).json({
                error: 'Order total no longer matches current prices or promotions. Please start checkout again.'
            });
        }

        const amountStr = expected.toFixed(2);
        const sale = await nmiSale({
            securityKey,
            amount: amountStr,
            paymentToken: payment_token
        });

        if (!sale.ok) {
            return res.status(402).json({
                success: false,
                error: sale.responseText,
                nmiResponse: sale.responseCode,
                nmi: sale.fields
            });
        }

        const payId = sale.transactionId || sale.fields?.authcode || `nmi-${oid}`;

        let finalizeResult;
        try {
            finalizeResult = await finalizePaidOrder(req.pool, {
                orderId: oid,
                paymentId: String(payId),
                paymentStatus: 'paid'
            });
        } catch (e) {
            if (e.code === 'ORDER_NOT_PENDING') {
                return res.status(409).json({ error: 'Order was already processed.' });
            }
            throw e;
        }

        const authUser = await getAuthenticatedUserFromRequest(req);
        const cartUserId = authUser?.id ?? null;
        const cartSessionId = req.headers['x-session-id'] || req.sessionID || null;
        if (hasCartIdentity(cartUserId, cartSessionId)) {
            try {
                const [userId, sessionId] = cartLookupBinds(cartUserId, cartSessionId);
                const [carts] = await req.pool.execute(
                    'SELECT id FROM shopping_carts WHERE user_id = ? OR session_id = ?',
                    [userId, sessionId]
                );
                if (carts.length > 0) {
                    await req.pool.execute('DELETE FROM cart_items WHERE cart_id = ?', [carts[0].id]);
                }
            } catch (cartErr) {
                logger.warn('Cart clear after NMI payment failed (payment already captured)', {
                    orderId: oid,
                    err: cartErr && cartErr.message
                });
            }
        }

        res.json({
            success: true,
            transactionId: String(payId),
            orderId: oid,
            orderNumber: finalizeResult?.orderNumber || orderRow.order_number,
            trackingNumber: finalizeResult?.trackingNumber || null,
            nmi: sale.fields
        });
    } catch (err) {
        logger.error('NMI process-payment error:', err);
        res.status(500).json({ error: err.message || 'Payment failed' });
    }
});

module.exports = router;

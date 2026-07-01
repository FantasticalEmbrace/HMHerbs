'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const router = express.Router();
const logger = require('../utils/logger');
const { isPlatformBillingConfigured } = require('../utils/platformBillingEnv');
const { isProchargeSandbox } = require('../utils/prochargeEnv');
const {
    ensureDefaultAccount,
    getAccountById,
    listSubscriptions,
    listHardwareCatalog,
    savePaymentMethod,
    upsertSubscription,
    updateAccount
} = require('../services/platformBillingAccount');
const {
    computeMonthlyTotal,
    chargeAccount,
    purchaseHardware,
    waivePastDue
} = require('../services/platformBillingRunner');
const {
    describeMonthlyPricing,
    HOSTING_TIERS_STANDARD,
    INTERNET_PLANS,
    HARDWARE_MIN_INSTALLMENT,
    HARDWARE_MAX_INSTALLMENT_MONTHS
} = require('../services/platformBillingPricing');
const { billingPortalUrl } = require('../services/platformBillingEmail');

async function assertBillingAuth(req) {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!bearer || !process.env.JWT_SECRET) return null;
    try {
        const decoded = jwt.verify(bearer, process.env.JWT_SECRET);
        const [rows] = await req.pool.execute(
            'SELECT id, role FROM admin_users WHERE id = ? AND is_active = 1',
            [decoded.adminId]
        );
        if (!rows.length) return null;
        const role = String(rows[0].role || '').toLowerCase();
        if (!['admin', 'developer', 'super_admin'].includes(role)) return null;
        return { adminId: rows[0].id, role };
    } catch {
        return null;
    }
}

const setupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false
});

router.get('/client-config', async (_req, res) => {
    const configured = isPlatformBillingConfigured();
    res.json({
        enabled: configured,
        configured,
        processor: 'procharge',
        sandbox: isProchargeSandbox(),
        achEnabled: true,
        cardFields: true,
        portalUrl: billingPortalUrl(),
        message: configured
            ? 'Enter card details below. Charges are processed by ProCharge (EPI).'
            : 'ProCharge platform billing is not configured on the server yet.'
    });
});

router.get('/account', async (req, res) => {
    try {
        const account = await ensureDefaultAccount(req.pool);
        const subscriptions = await listSubscriptions(req.pool, account.id);
        const statement = await computeMonthlyTotal(req.pool, account.id);
        res.json({ account, subscriptions, statement });
    } catch (e) {
        logger.error('Platform billing account fetch', { err: e.message });
        res.status(500).json({ error: 'Failed to load billing account' });
    }
});

router.get('/pricing/pos', (req, res) => {
    const stations = Math.max(1, Number(req.query.stations) || 1);
    res.json({ quote: describeMonthlyPricing(stations) });
});

router.get('/pricing/hosting', (_req, res) => {
    res.json({ tiers: HOSTING_TIERS_STANDARD });
});

router.get('/pricing/internet', (_req, res) => {
    res.json({ plans: INTERNET_PLANS });
});

router.get('/hardware', async (req, res) => {
    try {
        const catalog = await listHardwareCatalog(req.pool);
        res.json({
            catalog,
            installmentMin: HARDWARE_MIN_INSTALLMENT,
            maxInstallmentMonths: HARDWARE_MAX_INSTALLMENT_MONTHS
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load hardware catalog' });
    }
});

router.post('/setup', setupLimiter, async (req, res) => {
    try {
        const auth = await assertBillingAuth(req);
        const openDev =
            (process.env.NODE_ENV !== 'production' &&
                String(process.env.POS_BILLING_ALLOW_OPEN_SETUP || '').toLowerCase() === 'true') ||
            String(process.env.BILLING_PORTAL_ALLOW_OPEN_SETUP || '').toLowerCase() === 'true';
        if (!auth && !openDev) {
            return res.status(401).json({ error: 'Admin login required', code: 'ADMIN_AUTH_REQUIRED' });
        }
        if (!req.body?.authorized) {
            return res.status(400).json({ error: 'Authorization required', code: 'AUTHORIZATION_REQUIRED' });
        }

        const account = await ensureDefaultAccount(req.pool);
        const saved = await savePaymentMethod(req.pool, account.id, {
            paymentMethodType: req.body.paymentMethodType || 'card',
            paymentToken: req.body.payment_token,
            cardNumber: req.body.cardNumber,
            ccExpMonth: req.body.ccExpMonth,
            ccExpYear: req.body.ccExpYear,
            cvv: req.body.cvv,
            cardholderName: req.body.cardholderName,
            postalCode: req.body.postalCode,
            street1: req.body.street1,
            billingEmail: req.body.billingEmail || req.body.billing_email,
            businessName: req.body.businessName || req.body.business_name,
            bankAccount: req.body.bankAccount
        });

        if (req.body.licensedStationCount != null) {
            const { updateMerchantLicense } = require('../services/posMerchantLicense');
            await updateMerchantLicense(req.pool, {
                licensedStationCount: req.body.licensedStationCount,
                status: 'active'
            });
        }

        res.status(201).json({ success: true, account: saved });
    } catch (e) {
        const status = e.code === 'BILLING_NOT_CONFIGURED' ? 503 : e.code ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.put('/subscriptions/:productType', async (req, res) => {
    try {
        const auth = await assertBillingAuth(req);
        if (!auth) return res.status(401).json({ error: 'Admin login required' });
        const account = await ensureDefaultAccount(req.pool);
        const productType = String(req.params.productType || '').toLowerCase();
        if (!['pos', 'hosting', 'internet'].includes(productType)) {
            return res.status(400).json({ error: 'Invalid product type' });
        }
        await upsertSubscription(req.pool, account.id, productType, {
            status: req.body.status || 'active',
            config: req.body.config || {},
            monthlyAmountOverride:
                req.body.monthlyAmountOverride !== undefined
                    ? req.body.monthlyAmountOverride
                    : undefined
        });
        const subscriptions = await listSubscriptions(req.pool, account.id);
        const statement = await computeMonthlyTotal(req.pool, account.id);
        res.json({ subscriptions, statement });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/run-billing', async (req, res) => {
    try {
        const auth = await assertBillingAuth(req);
        if (!auth) return res.status(401).json({ error: 'Admin login required' });
        const account = await ensureDefaultAccount(req.pool);
        const result = await chargeAccount(req.pool, account.id, { reason: 'manual', force: true });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/waive-past-due', async (req, res) => {
    try {
        const auth = await assertBillingAuth(req);
        if (!auth) return res.status(401).json({ error: 'Admin login required' });
        const account = await ensureDefaultAccount(req.pool);
        const updated = await waivePastDue(req.pool, account.id, {
            note: req.body.note,
            notify: req.body.notify !== false
        });
        res.json({ account: updated });
    } catch (e) {
        res.status(400).json({ error: e.message, code: e.code });
    }
});

router.post('/hardware/purchase', setupLimiter, async (req, res) => {
    try {
        const auth = await assertBillingAuth(req);
        if (!auth) return res.status(401).json({ error: 'Admin login required' });
        const account = await ensureDefaultAccount(req.pool);
        const result = await purchaseHardware(req.pool, account.id, {
            sku: req.body.sku,
            quantity: req.body.quantity,
            installmentMonths: req.body.installmentMonths,
            cardPayload: req.body.card
        });
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message, code: e.code });
    }
});

router.post('/webhook/procharge', async (req, res) => {
    try {
        const secret = String(process.env.PROCHARGE_WEBHOOK_SECRET || '').trim();
        if (secret) {
            const incoming = String(req.headers['x-procharge-webhook-secret'] || '').trim();
            if (incoming !== secret) return res.status(401).json({ error: 'Invalid webhook secret' });
        }
        const eventType = String(req.body?.event_type || req.body?.type || 'unknown').toLowerCase();
        if (/ach|return|chargeback|void|decline|failed/.test(eventType)) {
            const { markPastDueFromWebhook } = require('../services/posMerchantLicense');
            const license = await markPastDueFromWebhook(req.pool, {
                reason: eventType,
                transactionId: req.body?.transaction_id || req.body?.transactionid
            });
            return res.json({ received: true, handled: true, licenseStatus: license.status });
        }
        res.json({ received: true, handled: false, eventType });
    } catch (e) {
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;

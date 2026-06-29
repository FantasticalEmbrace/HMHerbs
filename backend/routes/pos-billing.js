'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const router = express.Router();
const logger = require('../utils/logger');
const {
    getPlatformPublicTokenizationKey,
    isPlatformBillingConfigured
} = require('../utils/platformBillingEnv');
const {
    getNmiCollectJsUrl,
    isNmiSandboxHint,
    nmiResolveTokenizationCollectJs,
    shouldSkipNmiTokenizationPreflight
} = require('../utils/nmiEnv');
const { saveBillingVault, loadMerchantLicense } = require('../services/posMerchantLicense');
const { describeMonthlyPricing, FAILOVER_INCLUDED_GB, FAILOVER_OVERAGE_PER_GB } = require('../services/posBillingPricing');
const { createPosSignupRequest } = require('../services/posSignupIntake');

function isOpenBillingSetupAllowed() {
    return (
        process.env.NODE_ENV !== 'production' &&
        String(process.env.POS_BILLING_ALLOW_OPEN_SETUP || '').toLowerCase() === 'true'
    );
}

async function assertBillingSetupAuthorized(req) {
    if (isOpenBillingSetupAllowed()) return { type: 'dev_open' };

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
        if (!['admin', 'developer', 'super_admin'].includes(role)) {
            return null;
        }
        return { type: 'admin', adminId: rows[0].id, role };
    } catch {
        return null;
    }
}

const setupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many billing setup attempts. Please try again later.', code: 'RATE_LIMITED' }
});

const signupIntakeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many signup attempts. Please try again later.', code: 'RATE_LIMITED' }
});

/** Public merchant signup intake (Business One platform — signup.businessonecomprehensive.com) */
router.post('/signup-intake', signupIntakeLimiter, async (req, res) => {
    try {
        const record = await createPosSignupRequest(req.pool, req.body || {}, {
            signup_ip: req.ip || req.connection?.remoteAddress,
            signup_user_agent: req.get('User-Agent'),
            signup_referrer: req.get('Referer')
        });
        res.status(201).json({
            success: true,
            requestId: record.id,
            quote: record.quote,
            message:
                'Thank you — your request was received. A Business One representative will contact you within one business day to complete setup and billing.'
        });
    } catch (e) {
        const status = e.code === 'VALIDATION' ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code || 'SIGNUP_FAILED' });
    }
});

/** Public pricing summary for signup page */
router.get('/pricing', (req, res) => {
    const stations = Math.max(1, Math.min(99, Number(req.query.stations) || 1));
    res.json({
        tiers: {
            base: { stations: 1, monthly: 100, includesFailoverInternet: true, failoverIncludedGb: FAILOVER_INCLUDED_GB },
            mid: { stations: '2–5', ratePerStation: 50 },
            volume: { stations: '6+', ratePerStation: 25 }
        },
        failover: {
            includedWithFirstStation: true,
            includedGb: FAILOVER_INCLUDED_GB,
            overagePerGb: FAILOVER_OVERAGE_PER_GB,
            description: `The first station includes ${FAILOVER_INCLUDED_GB} GB of failover internet. Each additional GB used after that is $${FAILOVER_OVERAGE_PER_GB}.`
        },
        quote: describeMonthlyPricing(stations)
    });
});

/** Collect.js config for Business One platform billing (not store checkout) */
router.get('/client-config', async (req, res) => {
    const tokenizationKey = getPlatformPublicTokenizationKey();
    if (!tokenizationKey) {
        return res.json({
            enabled: false,
            configured: false,
            message: 'Platform billing keys are not configured on the server yet.',
            requiresSetupAuth: !isOpenBillingSetupAllowed(),
            setupHint: 'Save payment in Admin → Point of Sale → License (Admin or Developer login required).'
        });
    }

    try {
        if (shouldSkipNmiTokenizationPreflight()) {
            return res.json({
                enabled: true,
                configured: true,
                tokenizationKey,
                collectJsUrl: getNmiCollectJsUrl(),
                sandbox: isNmiSandboxHint(),
                preflightSkipped: true,
                requiresSetupAuth: !isOpenBillingSetupAllowed(),
            setupHint: 'Save payment in Admin → Point of Sale → License (Admin or Developer login required).'
            });
        }
        const resolved = await nmiResolveTokenizationCollectJs(tokenizationKey);
        return res.json({
            enabled: resolved.ok,
            configured: isPlatformBillingConfigured(),
            tokenizationKey: resolved.ok ? tokenizationKey : '',
            collectJsUrl: resolved.collectJsUrl || getNmiCollectJsUrl(),
            sandbox: isNmiSandboxHint(),
            requiresSetupAuth: !isOpenBillingSetupAllowed(),
            setupHint: 'Save payment in Admin → Point of Sale → License (Admin or Developer login required).'
        });
    } catch (e) {
        logger.warn('Platform billing client config error', { err: e.message });
        return res.json({
            enabled: true,
            configured: isPlatformBillingConfigured(),
            tokenizationKey,
            collectJsUrl: getNmiCollectJsUrl(),
            sandbox: isNmiSandboxHint(),
            requiresSetupAuth: !isOpenBillingSetupAllowed(),
            setupHint: 'Save payment in Admin → Point of Sale → License (Admin or Developer login required).'
        });
    }
});

router.post('/setup', setupLimiter, async (req, res) => {
    try {
        const auth = await assertBillingSetupAuthorized(req);
        if (!auth) {
            return res.status(401).json({
                error: 'Admin login is required to save POS billing.',
                code: 'ADMIN_AUTH_REQUIRED'
            });
        }

        if (!req.body?.authorized) {
            return res.status(400).json({
                error: 'You must authorize recurring monthly charges.',
                code: 'AUTHORIZATION_REQUIRED'
            });
        }
        const license = await saveBillingVault(req.pool, {
            paymentToken: req.body.payment_token,
            billingEmail: req.body.billingEmail || req.body.billing_email,
            businessName: req.body.businessName || req.body.business_name,
            paymentMethodType: req.body.paymentMethodType || 'card'
        });
        if (req.body.licensedStationCount != null) {
            const { updateMerchantLicense } = require('../services/posMerchantLicense');
            await updateMerchantLicense(req.pool, {
                licensedStationCount: req.body.licensedStationCount,
                status: 'active'
            });
        }
        res.status(201).json({
            success: true,
            license: await loadMerchantLicense(req.pool)
        });
    } catch (e) {
        const status = e.code === 'BILLING_NOT_CONFIGURED' ? 503 : e.code ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

/**
 * EPI / NMI webhook stub for ACH returns and chargebacks.
 * Configure EPI to POST here when platform billing webhooks are available.
 * Optional header: x-epi-webhook-secret must match EPI_PLATFORM_WEBHOOK_SECRET when set.
 */
router.post('/webhook/epi', async (req, res) => {
    try {
        const secret = String(process.env.EPI_PLATFORM_WEBHOOK_SECRET || '').trim();
        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                return res.status(503).json({ error: 'Webhook secret is not configured' });
            }
        } else {
            const incoming = String(req.headers['x-epi-webhook-secret'] || req.headers['x-nmi-webhook-secret'] || '').trim();
            if (incoming !== secret) {
                return res.status(401).json({ error: 'Invalid webhook secret' });
            }
        }

        const eventType = String(req.body?.event_type || req.body?.type || req.body?.event || 'unknown').toLowerCase();
        const transactionId = req.body?.transaction_id || req.body?.transactionid || req.body?.id || null;
        const achReturn = /ach|return|chargeback|void|decline|failed/.test(eventType);

        if (achReturn) {
            const { markPastDueFromWebhook } = require('../services/posMerchantLicense');
            const license = await markPastDueFromWebhook(req.pool, {
                reason: eventType,
                transactionId
            });
            return res.json({ received: true, handled: true, licenseStatus: license.status });
        }

        res.json({ received: true, handled: false, eventType });
    } catch (e) {
        logger.error('Platform billing webhook error', { err: e.message });
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;

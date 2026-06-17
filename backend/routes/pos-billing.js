'use strict';

const express = require('express');
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
const { describeMonthlyPricing } = require('../services/posBillingPricing');

/** Public pricing summary for signup page */
router.get('/pricing', (req, res) => {
    const stations = Math.max(1, Math.min(99, Number(req.query.stations) || 1));
    res.json({
        tiers: {
            base: { stations: 1, monthly: 100 },
            mid: { stations: '2–5', ratePerStation: 50 },
            volume: { stations: '6+', ratePerStation: 25 }
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
            message: 'Platform billing keys are not configured on the server yet.'
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
                preflightSkipped: true
            });
        }
        const resolved = await nmiResolveTokenizationCollectJs(tokenizationKey);
        return res.json({
            enabled: resolved.ok,
            configured: isPlatformBillingConfigured(),
            tokenizationKey: resolved.ok ? tokenizationKey : '',
            collectJsUrl: resolved.collectJsUrl || getNmiCollectJsUrl(),
            sandbox: isNmiSandboxHint()
        });
    } catch (e) {
        logger.warn('Platform billing client config error', { err: e.message });
        return res.json({
            enabled: true,
            configured: isPlatformBillingConfigured(),
            tokenizationKey,
            collectJsUrl: getNmiCollectJsUrl(),
            sandbox: isNmiSandboxHint()
        });
    }
});

router.post('/setup', async (req, res) => {
    try {
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
        if (secret) {
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

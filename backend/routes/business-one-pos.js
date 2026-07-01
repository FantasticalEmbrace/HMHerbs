'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const logger = require('../utils/logger');
const { isPlatformBillingConfigured } = require('../utils/platformBillingEnv');
const { isProchargeSandbox } = require('../utils/prochargeEnv');
const { describeMonthlyPricing, computeHardwareCheckout, hardwareSalesTaxRate } = require('../services/platformBillingPricing');
const { saveBillingVault, updateMerchantLicense } = require('../services/posMerchantLicense');
const {
    upsertSubscription,
    ensureDefaultAccount,
    listHardwareCatalog
} = require('../services/platformBillingAccount');
const { purchaseHardware } = require('../services/platformBillingRunner');

function isSignupEnabled() {
    return String(process.env.BUSINESS_ONE_POS_SIGNUP_ENABLED || 'false').toLowerCase() === 'true';
}

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false
});

router.get('/info', (_req, res) => {
    res.json({
        enabled: isSignupEnabled(),
        configured: isPlatformBillingConfigured(),
        processor: 'procharge'
    });
});

router.get('/client-config', (_req, res) => {
    const configured = isPlatformBillingConfigured();
    res.json({
        enabled: isSignupEnabled() && configured,
        configured,
        processor: 'procharge',
        sandbox: isProchargeSandbox(),
        achEnabled: true,
        cardFields: true,
        message: configured
            ? 'Secure card entry — processed by ProCharge (EPI).'
            : 'Online signup payment is not configured yet. Call (850) 290-2084.'
    });
});

router.get('/pricing', (req, res) => {
    const stations = Math.max(1, Number(req.query.stations) || 1);
    const quote = describeMonthlyPricing(stations);
    res.json({ quote, failover: quote.failover });
});

router.get('/hardware', async (req, res) => {
    try {
        const catalog = await listHardwareCatalog(req.pool, { signupOnly: true });
        const taxRate = hardwareSalesTaxRate();
        res.json({
            catalog: catalog.map((item) => ({
                ...item,
                ...computeHardwareCheckout(item.price)
            })),
            taxRate,
            requiredWithPos: true
        });
    } catch (e) {
        logger.error('[business-one-pos] hardware catalog', { err: e.message });
        res.status(500).json({ error: 'Failed to load hardware catalog' });
    }
});

function validateHardwareShipTo(shipTo) {
    const street = String(shipTo?.street1 || shipTo?.street || '').trim();
    const city = String(shipTo?.city || '').trim();
    const state = String(shipTo?.state || '').trim();
    const postalCode = String(shipTo?.postalCode || shipTo?.zip || '').trim();
    if (!street || !city || !state || !postalCode) {
        return null;
    }
    return {
        name: String(shipTo?.name || shipTo?.shipName || '').trim(),
        street1: street,
        city,
        state,
        postalCode
    };
}

router.post('/signup', signupLimiter, async (req, res) => {
    try {
        if (!isSignupEnabled()) {
            return res.status(503).json({
                error: 'Online signup is not open yet. Call (850) 290-2084.',
                code: 'SIGNUP_DISABLED'
            });
        }
        if (!req.body?.authorized) {
            return res.status(400).json({ error: 'Authorization required', code: 'AUTHORIZATION_REQUIRED' });
        }

        const businessName = String(req.body.businessName || '').trim();
        const billingEmail = String(req.body.billingEmail || '').trim();
        const licensedStationCount = Math.max(1, Number(req.body.licensedStationCount) || 1);
        const hardware = req.body.hardware || {};
        const hardwareSku = String(hardware.sku || '').trim();
        const hardwareQty = Math.max(1, Math.min(10, Number(hardware.quantity) || 1));

        if (!businessName || !billingEmail) {
            return res.status(400).json({ error: 'Business name and billing email are required.' });
        }

        if (!hardwareSku) {
            return res.status(400).json({
                error: 'Choose a setup modem — one is included with every POS signup.',
                code: 'ROUTER_REQUIRED'
            });
        }

        const shipTo = validateHardwareShipTo(hardware.shipTo || {});
        if (!shipTo) {
            return res.status(400).json({
                error: 'Shipping address is required for your setup modem.',
                code: 'SHIPPING_REQUIRED'
            });
        }

        const isAch = req.body.paymentMethodType === 'ach';
        if (isAch) {
            return res.status(400).json({
                error: 'Card payment is required at signup — your setup modem is charged today (plus sales tax).',
                code: 'CARD_REQUIRED'
            });
        }
        const cardPayload = isAch
            ? null
            : {
                  cardNumber: req.body.cardNumber,
                  ccExpMonth: req.body.ccExpMonth,
                  ccExpYear: req.body.ccExpYear,
                  cvv: req.body.cvv,
                  cardholderName: req.body.cardholderName || businessName,
                  postalCode: req.body.postalCode
              };

        await saveBillingVault(req.pool, {
            paymentMethodType: req.body.paymentMethodType || 'card',
            paymentToken: req.body.payment_token,
            cardNumber: req.body.cardNumber,
            ccExpMonth: req.body.ccExpMonth,
            ccExpYear: req.body.ccExpYear,
            cvv: req.body.cvv,
            cardholderName: req.body.cardholderName || businessName,
            postalCode: req.body.postalCode,
            street1: req.body.street1,
            billingEmail,
            businessName,
            bankAccount: req.body.bankAccount
        });

        await updateMerchantLicense(req.pool, {
            businessName,
            billingEmail,
            licensedStationCount,
            status: 'active'
        });

        const account = await ensureDefaultAccount(req.pool);

        await upsertSubscription(req.pool, account.id, 'pos', {
            status: 'active',
            config: {
                stationCount: licensedStationCount,
                licensedStationCount
            }
        });

        if (req.body.hostingTier) {
            await upsertSubscription(req.pool, account.id, 'hosting', {
                status: 'active',
                config: {
                    tier: req.body.hostingTier
                }
            });
        }

        let hardwareResult = null;
        hardwareResult = await purchaseHardware(req.pool, account.id, {
            sku: hardwareSku,
            quantity: hardwareQty,
            installmentMonths: 0,
            shipTo,
            cardPayload
        });

        logger.info('[business-one-pos] New signup', {
            businessName,
            billingEmail,
            licensedStationCount,
            hardwareSku: hardwareSku || null
        });

        const hardwareMsg = hardwareResult?.total
            ? ` Your setup modem was charged $${Number(hardwareResult.total).toFixed(2)} (includes sales tax) — we will program and ship it shortly.`
            : '';

        res.status(201).json({
            success: true,
            message: `Welcome to Business One! We will email your store access shortly.${hardwareMsg}`,
            hardware: hardwareResult
        });
    } catch (e) {
        const status = e.code === 'BILLING_NOT_CONFIGURED' ? 503 : e.code ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

module.exports = router;

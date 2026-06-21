'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const logger = require('../utils/logger');
const { isBusinessOneHubEnabled, getBusinessOneHubPublicUrl } = require('../utils/businessOneHubEnv');
const {
    getPlatformPublicTokenizationKey,
    isPlatformBillingConfigured,
    isPlatformAchEnabled,
    getDefaultAchSecCode,
    normalizeAchSecCode
} = require('../utils/platformBillingEnv');
const {
    getNmiCollectJsUrl,
    isNmiSandboxHint,
    nmiResolveTokenizationCollectJs,
    shouldSkipNmiTokenizationPreflight
} = require('../utils/nmiEnv');
const {
    createPosSignup,
    saveSignupBillingVault,
    notifySignupReceived,
    listSignups
} = require('../services/businessOnePosSignup');
const { describeMonthlyPricing } = require('../services/posBillingPricing');

function hubGate(req, res, next) {
    if (!isBusinessOneHubEnabled()) {
        return res.status(404).json({
            error: 'Business One hub signup is not enabled on this server.',
            code: 'HUB_DISABLED'
        });
    }
    next();
}

const signupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many signup attempts. Please try again later.', code: 'RATE_LIMITED' }
});

router.get('/info', (req, res) => {
    const enabled = isBusinessOneHubEnabled();
    const base = getBusinessOneHubPublicUrl() || `${req.protocol}://${req.get('host') || ''}`.replace(/\/+$/, '');
    res.json({
        enabled,
        hubPublicUrl: base,
        pages: {
            home: '/business-one-menu.html',
            posProduct: '/business-one-pos.html',
            signup: '/pos-signup.html',
            demoPos: '/pos/'
        },
        message: enabled
            ? 'Public POS signup and demo are served from this Business One hub.'
            : 'Set BUSINESS_ONE_HUB_ENABLED=true on your Business One website server.'
    });
});

router.get('/pricing', hubGate, (req, res) => {
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

router.get('/client-config', hubGate, async (req, res) => {
    const tokenizationKey = getPlatformPublicTokenizationKey();
    const basePayload = {
        requiresSetupAuth: false,
        achEnabled: isPlatformAchEnabled(),
        achSecCodes: { business: 'CCD', personal: 'PPD' },
        defaultAchSecCode: getDefaultAchSecCode()
    };
    if (!tokenizationKey) {
        return res.json({
            ...basePayload,
            enabled: false,
            configured: false,
            message: 'Platform billing keys are not configured yet.'
        });
    }
    try {
        if (shouldSkipNmiTokenizationPreflight()) {
            return res.json({
                ...basePayload,
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
            ...basePayload,
            enabled: resolved.ok,
            configured: isPlatformBillingConfigured(),
            tokenizationKey: resolved.ok ? tokenizationKey : '',
            collectJsUrl: resolved.collectJsUrl || getNmiCollectJsUrl(),
            sandbox: isNmiSandboxHint()
        });
    } catch (e) {
        logger.warn('[business-one] POS client config error', { err: e.message });
        return res.json({
            ...basePayload,
            enabled: true,
            configured: isPlatformBillingConfigured(),
            tokenizationKey,
            collectJsUrl: getNmiCollectJsUrl(),
            sandbox: isNmiSandboxHint()
        });
    }
});

router.post('/signup', hubGate, signupLimiter, async (req, res) => {
    try {
        if (!req.body?.authorized) {
            return res.status(400).json({
                error: 'You must authorize recurring monthly charges.',
                code: 'AUTHORIZATION_REQUIRED'
            });
        }

        const paymentMethodType = String(req.body.paymentMethodType || 'card').trim().toLowerCase();
        const isAch = paymentMethodType === 'ach';
        if (isAch && !isPlatformAchEnabled()) {
            return res.status(400).json({ error: 'Bank account billing is not enabled.', code: 'ACH_DISABLED' });
        }
        if (isAch && !req.body?.achAuthorized) {
            return res.status(400).json({
                error: 'You must authorize recurring ACH debits.',
                code: 'ACH_AUTHORIZATION_REQUIRED'
            });
        }

        const achAccountType = String(req.body.achAccountType || 'business').trim().toLowerCase();
        const achSecCode = isAch
            ? normalizeAchSecCode(
                  req.body.achSecCode || (achAccountType === 'personal' ? 'PPD' : 'CCD')
              )
            : null;

        const clientIp =
            String(req.headers['x-forwarded-for'] || '')
                .split(',')[0]
                .trim() || req.ip || '';

        const draft = await createPosSignup(req.pool, {
            businessName: req.body.businessName,
            billingEmail: req.body.billingEmail,
            contactName: req.body.contactName,
            phone: req.body.phone,
            licensedStationCount: req.body.licensedStationCount
        });

        const signup = await saveSignupBillingVault(req.pool, draft.id, {
            paymentToken: req.body.payment_token,
            paymentMethodType: isAch ? 'ach' : 'card',
            achSecCode,
            businessName: req.body.businessName,
            billingEmail: req.body.billingEmail,
            contactName: req.body.contactName,
            phone: req.body.phone,
            licensedStationCount: req.body.licensedStationCount,
            authMeta: isAch ? { ip: clientIp, secCode: achSecCode, accountType: achAccountType } : { ip: clientIp }
        });

        await notifySignupReceived(signup);

        res.status(201).json({
            success: true,
            signup,
            demoUrl: '/pos/',
            message: 'Signup complete. We will email your store login details shortly.'
        });
    } catch (e) {
        const status = e.code === 'BILLING_NOT_CONFIGURED' ? 503 : e.code ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

/** ISO: list recent signups (admin JWT on hub server) */
router.get('/signups', hubGate, async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!bearer || !process.env.JWT_SECRET) {
        return res.status(401).json({ error: 'Admin sign-in required' });
    }
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(bearer, process.env.JWT_SECRET);
        const [rows] = await req.pool.execute(
            'SELECT id FROM admin_users WHERE id = ? AND is_active = 1',
            [decoded.adminId]
        );
        if (!rows.length) return res.status(401).json({ error: 'Invalid sign-in token' });
        const signups = await listSignups(req.pool);
        res.json({ signups });
    } catch {
        res.status(403).json({ error: 'Invalid or expired sign-in token' });
    }
});

module.exports = router;

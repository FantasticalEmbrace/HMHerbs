'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticatePlatformHubSecret } = require('../middleware/platformSupportAuth');
const {
    upsertQueueEntry,
    listSupportQueue,
    purgeExpiredQueueEntries
} = require('../services/posPlatformSupportHub');
const { isPlatformHubEnabled, getPlatformHubSecret, getPlatformHubPublicUrl, getStoreBaseUrl } = require('../utils/platformSupportEnv');
const {
    verifyTechnicianCredentials,
    signTechnicianToken,
    verifyTechnicianToken,
    isTechnicianAuthConfigured,
    isGoogleTechnicianAuthConfigured,
    authorizeGoogleTechnician
} = require('../services/platformSupportTechnicianAuth');
const {
    isGoogleConfigured,
    createOAuthState,
    verifyOAuthState,
    googleOAuthClient,
    getGoogleRedirectUri,
    fetchGoogleProfile,
    safeReturnPath,
    GOOGLE_SCOPES,
    encodeUserPayload
} = require('../services/socialOAuth');
const { getStorefrontPublicBaseUrl } = require('../utils/storefrontUrl');

function staffDisplayName(staff) {
    if (!staff) return 'Platform support';
    if (staff.kind === 'technician') return staff.name || staff.email || 'Support technician';
    return (
        `${staff.first_name || ''} ${staff.last_name || ''}`.trim() ||
        staff.email ||
        'Platform support'
    );
}

async function authenticateHubStaff(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Support desk sign-in required' });
    if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'Server configuration error' });

    const technician = verifyTechnicianToken(token);
    if (technician) {
        req.hubStaff = { kind: 'technician', ...technician };
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await req.pool.execute(
            'SELECT id, email, first_name, last_name, role FROM admin_users WHERE id = ? AND is_active = 1',
            [decoded.adminId]
        );
        if (!rows.length) return res.status(401).json({ error: 'Invalid sign-in token' });
        const role = rows[0].role;
        if (!['admin', 'developer', 'manager', 'assistant_manager', 'super_admin'].includes(role)) {
            return res.status(403).json({ error: 'Manager access required' });
        }
        req.hubStaff = { kind: 'admin', ...rows[0] };
        return next();
    } catch {
        return res.status(403).json({ error: 'Invalid or expired sign-in token' });
    }
}

router.use((req, res, next) => {
    if (!isPlatformHubEnabled()) {
        return res.status(404).json({ error: 'Platform support hub is not enabled on this server' });
    }
    next();
});

router.get('/info', (req, res) => {
    const storeUrl = getStoreBaseUrl();
    const hubPublicUrl = getPlatformHubPublicUrl();
    res.json({
        hubEnabled: true,
        queuePage: '/support-desk',
        deskPage: '/support-desk',
        technicianLoginConfigured: isTechnicianAuthConfigured(),
        googleLoginConfigured: isGoogleConfigured() && isGoogleTechnicianAuthConfigured(),
        hubTitle: process.env.PLATFORM_SUPPORT_HUB_TITLE || 'Business One Support Desk',
        hubPublicUrl,
        merchantStoreUrl: storeUrl || null,
        hubNote:
            'Business One technicians sign in here — not on merchant store sites (e.g. HM Herbs). Merchants only push help requests to this hub.'
    });
});

router.post('/technician/login', async (req, res) => {
    if (!isTechnicianAuthConfigured()) {
        return res.status(503).json({
            error: 'Support desk technician login is not configured on this server.',
            code: 'TECH_LOGIN_NOT_CONFIGURED'
        });
    }
    const email = req.body?.email;
    const password = req.body?.password;
    const technician = verifyTechnicianCredentials(email, password);
    if (!technician) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    try {
        const token = signTechnicianToken(technician);
        res.json({
            token,
            technician: { email: technician.email, name: technician.name },
            queuePage: '/support-desk'
        });
    } catch (e) {
        logger.error('[platform-support] Technician login error:', e);
        res.status(500).json({ error: 'Could not sign in' });
    }
});

router.get('/google/start', (req, res) => {
    if (!isGoogleConfigured()) {
        return res.status(503).json({ error: 'Google sign-in is not configured on this server' });
    }
    if (!isGoogleTechnicianAuthConfigured()) {
        return res.status(503).json({
            error: 'Google sign-in is not enabled for support technicians. Set PLATFORM_SUPPORT_GOOGLE_EMAILS.'
        });
    }
    const returnTo = safeReturnPath(req.query.returnTo, '/support-desk');
    const redirectUri = getGoogleRedirectUri(req, 'support');
    const state = createOAuthState('support_desk_google_oauth', { returnTo });
    const client = googleOAuthClient(redirectUri);
    const authUrl = client.generateAuthUrl({
        access_type: 'online',
        scope: GOOGLE_SCOPES,
        state,
        prompt: 'select_account',
        include_granted_scopes: true
    });
    res.redirect(authUrl);
});

router.get('/google/callback', async (req, res) => {
    const base = `${getStorefrontPublicBaseUrl()}/support-desk`;
    try {
        const { code, state, error: oauthError } = req.query;
        if (oauthError) {
            return res.redirect(`${base}?error=${encodeURIComponent(String(oauthError))}`);
        }
        if (!code || !state) {
            return res.redirect(`${base}?error=${encodeURIComponent('Missing Google authorization code')}`);
        }
        const decoded = verifyOAuthState(state, 'support_desk_google_oauth');
        const returnTo = safeReturnPath(decoded.returnTo, '/support-desk');
        const redirectUri = getGoogleRedirectUri(req, 'support');
        const profile = await fetchGoogleProfile(String(code), redirectUri);
        const technician = authorizeGoogleTechnician(profile);
        if (!technician) {
            return res.redirect(
                `${base}?error=${encodeURIComponent('This Google account is not authorized for Business One support.')}`
            );
        }
        const token = signTechnicianToken(technician);
        const techPayload = encodeUserPayload({ email: technician.email, name: technician.name });
        const dest = `${getStorefrontPublicBaseUrl()}${returnTo}`;
        res.redirect(`${dest}#token=${encodeURIComponent(token)}&technician=${encodeURIComponent(techPayload)}`);
    } catch (e) {
        logger.error('[platform-support] Google callback error:', e);
        res.redirect(
            `${base}?error=${encodeURIComponent(e.message || 'Google sign-in failed')}`
        );
    }
});

router.post('/sync', authenticatePlatformHubSecret, async (req, res) => {
    try {
        await purgeExpiredQueueEntries(req.pool);
        const body = req.body || {};
        if (!body.merchantId || !body.storeSessionId || !body.storeBaseUrl) {
            return res.status(400).json({ error: 'merchantId, storeSessionId, and storeBaseUrl are required' });
        }
        const entry = await upsertQueueEntry(req.pool, body);
        res.json({ ok: true, entry });
    } catch (e) {
        logger.error('[platform-support] Sync error:', e);
        res.status(500).json({ error: 'Failed to sync support session' });
    }
});

router.get('/queue', authenticateHubStaff, async (req, res) => {
    try {
        await purgeExpiredQueueEntries(req.pool);
        const queue = await listSupportQueue(req.pool);
        res.json({
            ...queue,
            viewerPage: '/support-viewer.html',
            hubEnabled: true,
            platformViewerKey: getPlatformHubSecret() || null
        });
    } catch (e) {
        logger.error('[platform-support] Queue list error:', e);
        res.status(500).json({ error: 'Failed to load support queue' });
    }
});

router.get('/config', authenticateHubStaff, (req, res) => {
    res.json({
        hubEnabled: true,
        viewerPage: '/support-viewer.html',
        queuePage: '/support-desk'
    });
});

router.post('/connect', authenticateHubStaff, async (req, res) => {
    try {
        const storeSessionId = Number(req.body?.storeSessionId || req.body?.sessionId);
        const merchantId = String(req.body?.merchantId || '').trim();
        if (!storeSessionId) {
            return res.status(400).json({ error: 'storeSessionId is required' });
        }

        const [rows] = await req.pool.execute(
            `SELECT * FROM pos_platform_support_queue
             WHERE store_session_id = ?${merchantId ? ' AND merchant_id = ?' : ''}
             LIMIT 1`,
            merchantId ? [storeSessionId, merchantId] : [storeSessionId]
        );
        const entry = rows[0];
        if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

        const storeBase = String(entry.store_base_url || '').replace(/\/+$/, '');
        const secret = getPlatformHubSecret();
        if (!storeBase || !secret) {
            return res.status(500).json({ error: 'Hub is not configured for store connections' });
        }

        const claimedBy = staffDisplayName(req.hubStaff);

        const joinRes = await fetch(`${storeBase}/api/platform/support/store/sessions/${storeSessionId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Platform-Hub-Secret': secret
            },
            body: JSON.stringify({ claimedBy })
        });
        const joinBody = await joinRes.json().catch(() => ({}));
        if (!joinRes.ok) {
            return res.status(joinRes.status).json({ error: joinBody.error || 'Store rejected connection' });
        }

        await upsertQueueEntry(req.pool, {
            merchantId: entry.merchant_id,
            merchantName: entry.merchant_name,
            storeBaseUrl: storeBase,
            storeSessionId: entry.store_session_id,
            storeDeviceId: entry.store_device_id,
            deviceLabel: entry.device_label,
            platform: entry.platform,
            sessionCode: entry.session_code,
            status: 'awaiting_consent',
            registerOnline: Boolean(entry.register_online),
            claimedBy,
            sessionCreatedAt: entry.session_created_at,
            expiresAt: entry.expires_at
        });

        res.json({
            ok: true,
            storeBaseUrl: storeBase,
            storeSessionId,
            viewerUrl: `${storeBase}/support-viewer.html?session=${storeSessionId}&mode=platform&store=${encodeURIComponent(storeBase)}`,
            session: joinBody.session || null
        });
    } catch (e) {
        logger.error('[platform-support] Connect proxy error:', e);
        res.status(500).json({ error: 'Failed to connect to store' });
    }
});

module.exports = router;

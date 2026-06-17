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
const { isPlatformHubEnabled, getPlatformHubSecret } = require('../utils/platformSupportEnv');

async function authenticateHubAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Admin access token required' });
    if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'Server configuration error' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await req.pool.execute(
            'SELECT id, email, first_name, last_name, role FROM admin_users WHERE id = ? AND is_active = 1',
            [decoded.adminId]
        );
        if (!rows.length) return res.status(401).json({ error: 'Invalid admin token' });
        const role = rows[0].role;
        if (!['admin', 'developer', 'manager', 'assistant_manager', 'super_admin'].includes(role)) {
            return res.status(403).json({ error: 'Manager access required' });
        }
        req.admin = rows[0];
        next();
    } catch {
        return res.status(403).json({ error: 'Invalid admin token' });
    }
}

router.use((req, res, next) => {
    if (!isPlatformHubEnabled()) {
        return res.status(404).json({ error: 'Platform support hub is not enabled on this server' });
    }
    next();
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

router.get('/queue', authenticateHubAdmin, async (req, res) => {
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

router.get('/config', authenticateHubAdmin, (req, res) => {
    res.json({
        hubEnabled: true,
        viewerPage: '/support-viewer.html',
        queuePage: '/platform-support.html'
    });
});

router.post('/connect', authenticateHubAdmin, async (req, res) => {
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

        const claimedBy =
            `${req.admin.first_name || ''} ${req.admin.last_name || ''}`.trim() ||
            req.admin.email ||
            'Platform support';

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
            viewerUrl: `${storeBase}/support-viewer.html?session=${storeSessionId}&mode=platform`,
            session: joinBody.session || null
        });
    } catch (e) {
        logger.error('[platform-support] Connect proxy error:', e);
        res.status(500).json({ error: 'Failed to connect to store' });
    }
});

module.exports = router;

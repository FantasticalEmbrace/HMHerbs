'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const logger = require('../utils/logger');
const { POS_SETTING_KEYS, POS_SETTING_META, loadPosSettings } = require('../services/posSettings');
const {
    listDevices,
    createDevice,
    regenerateDeviceKey,
    revokeDevice
} = require('../services/posDeviceRegistry');
const {
    listEquipment,
    getEquipmentById,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    listEquipmentTypeCatalog
} = require('../services/posEquipment');
const {
    loadMerchantLicense,
    updateMerchantLicense,
    waivePastDuePayment,
    assertCanAddDevice,
    runMonthlyBillingForMerchant,
    countActiveDevices,
    isLicenseEnforcementEnabled,
    isBillingDryRun,
    getDefaultGraceDays,
    getMaxBillingRetries
} = require('../services/posMerchantLicense');
const { scheduleSupportSessionSync } = require('../services/posPlatformSupportSync');
const { isPlatformHubEnabled } = require('../utils/platformSupportEnv');
const {
    listDisplayAds,
    createDisplayAd,
    updateDisplayAd,
    deleteDisplayAd
} = require('../services/posDisplayAds');

const displayAdUploadDir = path.join(__dirname, '..', 'uploads', 'pos-display-ads');
if (!fs.existsSync(displayAdUploadDir)) {
    fs.mkdirSync(displayAdUploadDir, { recursive: true });
}
const uploadDisplayAdImage = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, displayAdUploadDir),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
            const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
            cb(null, `display-ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
    }
});

async function authenticateAdmin(req, res, next) {
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
        req.admin = rows[0];
        next();
    } catch {
        return res.status(403).json({ error: 'Invalid admin token' });
    }
}

function requireManager(req, res, next) {
    const role = req.admin?.role;
    if (!['admin', 'developer', 'manager', 'assistant_manager', 'super_admin'].includes(role)) {
        return res.status(403).json({ error: 'Manager access required' });
    }
    next();
}

router.use(authenticateAdmin);
router.use(requireManager);

router.get('/settings', async (req, res) => {
    try {
        const values = await loadPosSettings(req.pool);
        const settings = POS_SETTING_KEYS.map((key) => ({
            key_name: key,
            value: values[key] ?? '',
            description: POS_SETTING_META[key]?.description || key,
            type: POS_SETTING_META[key]?.type || 'string'
        }));
        res.json({ settings });
    } catch (e) {
        logger.error('POS settings fetch error:', e);
        res.status(500).json({ error: 'Failed to load POS settings' });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const incoming = Array.isArray(req.body?.settings) ? req.body.settings : [];
        const allowed = new Set(POS_SETTING_KEYS);
        const filtered = incoming.filter((s) => s?.key_name && allowed.has(s.key_name));
        if (!filtered.length) {
            return res.status(400).json({ error: 'No valid POS settings provided' });
        }
        const connection = await req.pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const setting of filtered) {
                const meta = POS_SETTING_META[setting.key_name] || {};
                await connection.execute(
                    `INSERT INTO settings (key_name, value, description, type)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
                    [
                        setting.key_name,
                        setting.value ?? '',
                        setting.description || meta.description || setting.key_name,
                        setting.type || meta.type || 'string'
                    ]
                );
            }
            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }
        res.json({ success: true });
    } catch (e) {
        logger.error('POS settings save error:', e);
        res.status(500).json({ error: 'Failed to save POS settings' });
    }
});

router.get('/devices', async (req, res) => {
    try {
        const devices = await listDevices(req.pool);
        res.json({
            devices: devices.map((d) => ({
                id: d.id,
                deviceLabel: d.device_label,
                keyPrefix: d.key_prefix,
                isActive: Boolean(d.is_active),
                lastSeenAt: d.last_seen_at,
                createdAt: d.created_at
            }))
        });
    } catch (e) {
        logger.error('List POS devices error:', e);
        res.status(500).json({ error: 'Failed to list registers' });
    }
});

router.post('/devices', async (req, res) => {
    try {
        const gate = await assertCanAddDevice(req.pool);
        if (!gate.ok) {
            return res.status(402).json({ error: gate.message, code: gate.code, license: gate.license });
        }
        const created = await createDevice(req.pool, req.body?.deviceLabel || req.body?.device_label);
        res.status(201).json({
            device: {
                id: created.id,
                deviceLabel: created.deviceLabel,
                keyPrefix: created.keyPrefix
            },
            apiKey: created.apiKey,
            licenseWarning: gate.warning || null
        });
    } catch (e) {
        const status = e.code === 'DUPLICATE_DEVICE_LABEL' ? 409 : e.code ? 400 : 500;
        res.status(status).json({
            error: e.message,
            code: e.code,
            existingDeviceId: e.existingDeviceId
        });
    }
});

router.post('/devices/:id/regenerate-key', async (req, res) => {
    try {
        const regenerated = await regenerateDeviceKey(req.pool, Number(req.params.id));
        res.json({
            device: {
                id: regenerated.id,
                deviceLabel: regenerated.deviceLabel,
                keyPrefix: regenerated.keyPrefix
            },
            apiKey: regenerated.apiKey
        });
    } catch (e) {
        const status = e.code === 'DEVICE_NOT_FOUND' ? 404 : e.code ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.delete('/devices/:id', async (req, res) => {
    try {
        const ok = await revokeDevice(req.pool, Number(req.params.id));
        if (!ok) return res.status(404).json({ error: 'Register not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to revoke register' });
    }
});

router.get('/equipment/types', (req, res) => {
    res.json({ types: listEquipmentTypeCatalog() });
});

router.get('/equipment', async (req, res) => {
    try {
        const equipment = await listEquipment(req.pool);
        res.json({ equipment });
    } catch (e) {
        logger.error('List POS equipment error:', e);
        res.status(500).json({ error: 'Failed to list equipment' });
    }
});

router.post('/equipment', async (req, res) => {
    try {
        const equipment = await createEquipment(req.pool, req.body);
        res.status(201).json({ equipment });
    } catch (e) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.put('/equipment/:id', async (req, res) => {
    try {
        const equipment = await updateEquipment(req.pool, req.params.id, req.body);
        res.json({ equipment });
    } catch (e) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.delete('/equipment/:id', async (req, res) => {
    try {
        const ok = await deleteEquipment(req.pool, Number(req.params.id));
        if (!ok) return res.status(404).json({ error: 'Equipment not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete equipment' });
    }
});

router.get('/license', async (req, res) => {
    try {
        const license = await loadMerchantLicense(req.pool);
        const activeDevices = await countActiveDevices(req.pool);
        res.json({
            license,
            activeDevices,
            pricingTiers: {
                base: 100,
                midRate: 50,
                midThroughStation: 5,
                volumeRate: 25
            },
            flags: {
                enforcementEnabled: isLicenseEnforcementEnabled(),
                billingDryRun: isBillingDryRun(),
                billingSchedulerEnabled:
                    String(process.env.POS_BILLING_SCHEDULER_ENABLED || '').toLowerCase() === 'true',
                graceDaysDefault: getDefaultGraceDays(),
                maxBillingRetries: getMaxBillingRetries(),
                revokeDevicesOnCancel:
                    String(process.env.POS_REVOKE_DEVICES_ON_CANCEL ?? 'true').toLowerCase() !== 'false'
            }
        });
    } catch (e) {
        logger.error('POS license fetch error:', e);
        res.status(500).json({ error: 'Failed to load license' });
    }
});

router.put('/license', async (req, res) => {
    try {
        const body = req.body || {};
        const license = await updateMerchantLicense(req.pool, {
            status: body.status,
            licensedStationCount: body.licensedStationCount ?? body.licensed_station_count,
            businessName: body.businessName ?? body.business_name,
            billingEmail: body.billingEmail ?? body.billing_email,
            notes: body.notes,
            licenseExpiresAt: body.licenseExpiresAt ?? body.license_expires_at,
            nextBillDate: body.nextBillDate ?? body.next_bill_date,
            serviceCompedUntil: body.serviceCompedUntil ?? body.service_comped_until,
            graceDaysOverride: body.graceDaysOverride ?? body.grace_days_override
        });
        res.json({ license });
    } catch (e) {
        const status = e.code ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.post('/license/run-billing', async (req, res) => {
    try {
        const result = await runMonthlyBillingForMerchant(req.pool, { force: true });
        res.json({ result });
    } catch (e) {
        logger.error('POS manual billing run error:', e);
        res.status(500).json({ error: e.message || 'Billing run failed' });
    }
});

router.post('/license/waive-past-due', async (req, res) => {
    try {
        const note = req.body?.note || req.body?.reason || '';
        const notify = req.body?.notify !== false;
        const license = await waivePastDuePayment(req.pool, { note, notify });
        res.json({ license });
    } catch (e) {
        const status =
            e.code === 'NOT_PAST_DUE' || e.code === 'NO_AMOUNT_OWED' ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

/** @deprecated use POST /license/waive-past-due */
router.post('/license/credit', async (req, res) => {
    try {
        const note = req.body?.note || req.body?.reason || '';
        const notify = req.body?.notify !== false;
        const license = await waivePastDuePayment(req.pool, { note, notify });
        res.json({ license });
    } catch (e) {
        const status =
            e.code === 'NOT_PAST_DUE' || e.code === 'NO_AMOUNT_OWED' ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.get('/support/registers', async (req, res) => {
    try {
        const registerSupport = require('../services/posRegisterSupport');
        const { listSupportAgents, isEnrollConfigured, rustDeskServerConfig } = require('../services/posSupportAgent');
        const [registers, agents] = await Promise.all([
            registerSupport.listRegistersForSupport(req.pool),
            listSupportAgents(req.pool)
        ]);
        res.json({
            registers,
            windowsAgents: agents,
            rustdesk: rustDeskServerConfig(),
            windowsAgentDownloadUrl: '/support-agent/',
            viewerPage: '/support-viewer.html',
            enrollConfigured: isEnrollConfigured(),
            platformHubEnabled: isPlatformHubEnabled(),
            platformQueuePage: '/platform-support.html'
        });
    } catch (e) {
        logger.error('POS support registers list error:', e);
        res.status(500).json({ error: 'Failed to load support registers' });
    }
});

/** @deprecated use GET /support/registers */
router.get('/support/agents', async (req, res) => {
    req.url = '/support/registers';
    return router.handle(req, res);
});

router.post('/support/registers/:deviceId/session', async (req, res) => {
    try {
        const registerSupport = require('../services/posRegisterSupport');
        const deviceId = Number(req.params.deviceId);
        const [devices] = await req.pool.execute(
            `SELECT id, platform FROM pos_devices WHERE id = ? AND is_active = 1 LIMIT 1`,
            [deviceId]
        );
        if (!devices[0]) return res.status(404).json({ error: 'Register not found' });

        let sessionRow = await registerSupport.getActiveSessionForDevice(req.pool, deviceId);
        if (!sessionRow) {
            const platform = devices[0].platform || 'windows';
            await registerSupport.requestSupportSession(req.pool, deviceId, {
                platform,
                diagnostics: { initiatedBy: 'admin', adminId: req.admin.id }
            });
            sessionRow = await registerSupport.getActiveSessionForDevice(req.pool, deviceId);
        }
        if (!sessionRow) {
            return res.status(500).json({ error: 'Could not create support session' });
        }

        const session = await registerSupport.adminJoinSession(req.pool, sessionRow.id, req.admin.id);
        scheduleSupportSessionSync(req.pool, session.id, {
            claimedBy: `${req.admin.first_name || ''} ${req.admin.last_name || ''}`.trim() || req.admin.email
        });
        const base = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
        res.json({
            session,
            viewerUrl: `${base || ''}/support-viewer.html?session=${session.id}`
        });
    } catch (e) {
        const status = e.code === 'SESSION_UNAVAILABLE' || e.code === 'SESSION_EXPIRED' ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.post('/support/sessions/:id/join', async (req, res) => {
    try {
        const registerSupport = require('../services/posRegisterSupport');
        const session = await registerSupport.adminJoinSession(req.pool, req.params.id, req.admin.id);
        scheduleSupportSessionSync(req.pool, session.id, {
            claimedBy: `${req.admin.first_name || ''} ${req.admin.last_name || ''}`.trim() || req.admin.email
        });
        res.json({ session });
    } catch (e) {
        const status = e.code === 'SESSION_UNAVAILABLE' || e.code === 'SESSION_EXPIRED' ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.post('/support/sessions/:id/answer', async (req, res) => {
    try {
        const registerSupport = require('../services/posRegisterSupport');
        const session = await registerSupport.setAnswerSdp(
            req.pool,
            req.params.id,
            req.admin.id,
            req.body?.sdp
        );
        scheduleSupportSessionSync(req.pool, session.id);
        res.json({ session });
    } catch (e) {
        res.status(400).json({ error: e.message, code: e.code });
    }
});

router.post('/support/sessions/:id/ice', async (req, res) => {
    try {
        const registerSupport = require('../services/posRegisterSupport');
        await registerSupport.appendIceCandidate(req.pool, req.params.id, 'admin', req.body?.candidate);
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/support/sessions/:id/signal', async (req, res) => {
    try {
        const registerSupport = require('../services/posRegisterSupport');
        const sinceVersion = Number(req.query.since) || 0;
        const state = await registerSupport.getSignalState(req.pool, req.params.id, { sinceVersion });
        res.json(state);
    } catch (e) {
        res.status(404).json({ error: e.message, code: e.code });
    }
});

router.post('/support/sessions/:id/end', async (req, res) => {
    try {
        const registerSupport = require('../services/posRegisterSupport');
        await registerSupport.endSession(req.pool, req.params.id, { byAdmin: true });
        scheduleSupportSessionSync(req.pool, req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to end session' });
    }
});

router.post('/support/agents/:id/connect', async (req, res) => {
    try {
        const { beginRemoteSession } = require('../services/posSupportAgent');
        const session = await beginRemoteSession(req.pool, req.params.id, req.admin.id);
        res.json(session);
    } catch (e) {
        const status = e.code === 'NOT_FOUND' || e.code === 'NO_RUSTDESK_ID' ? 404 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.delete('/support/agents/:id', async (req, res) => {
    try {
        const { revokeSupportAgent } = require('../services/posSupportAgent');
        const ok = await revokeSupportAgent(req.pool, req.params.id);
        if (!ok) return res.status(404).json({ error: 'Agent not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to revoke agent' });
    }
});

router.get('/display-ads', async (req, res) => {
    try {
        const ads = await listDisplayAds(req.pool);
        res.json({ ads });
    } catch (e) {
        logger.error('List POS display ads error:', e);
        res.status(500).json({ error: 'Failed to load display ads' });
    }
});

router.post('/display-ads/upload-image', (req, res, next) => {
    uploadDisplayAdImage.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        res.json({
            success: true,
            url: `/uploads/pos-display-ads/${req.file.filename}`,
            filename: req.file.filename
        });
    } catch (e) {
        logger.error('POS display ad upload error:', e);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

router.post('/display-ads', async (req, res) => {
    try {
        const ad = await createDisplayAd(req.pool, req.body, req.admin.id);
        res.status(201).json({ ad });
    } catch (e) {
        const status = e.code === 'IMAGE_REQUIRED' ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.put('/display-ads/:id', async (req, res) => {
    try {
        const ad = await updateDisplayAd(req.pool, req.params.id, req.body);
        res.json({ ad });
    } catch (e) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'IMAGE_REQUIRED' ? 400 : 500;
        res.status(status).json({ error: e.message, code: e.code });
    }
});

router.delete('/display-ads/:id', async (req, res) => {
    try {
        const ok = await deleteDisplayAd(req.pool, req.params.id);
        if (!ok) return res.status(404).json({ error: 'Ad not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete ad' });
    }
});

module.exports = router;

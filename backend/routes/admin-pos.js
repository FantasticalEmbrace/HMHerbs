'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
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
        const created = await createDevice(req.pool, req.body?.deviceLabel || req.body?.device_label);
        res.status(201).json({
            device: {
                id: created.id,
                deviceLabel: created.deviceLabel,
                keyPrefix: created.keyPrefix
            },
            apiKey: created.apiKey
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

module.exports = router;

'use strict';

const crypto = require('crypto');

function hashDeviceKey(apiKey) {
    const pepper = String(process.env.POS_DEVICE_KEY_PEPPER || process.env.JWT_SECRET || 'pos-device').trim();
    return crypto.createHash('sha256').update(`${pepper}:${String(apiKey || '')}`).digest('hex');
}

function generateDeviceApiKey() {
    return `pos_${crypto.randomBytes(24).toString('hex')}`;
}

function keyPrefix(apiKey) {
    return String(apiKey || '').slice(0, 10);
}

async function listDevices(pool) {
    const [rows] = await pool.execute(
        `SELECT id, device_label, key_prefix, is_active, last_seen_at, created_at, updated_at
         FROM pos_devices
         ORDER BY device_label ASC`
    );
    return rows || [];
}

async function findDeviceByLabel(pool, deviceLabel) {
    const label = String(deviceLabel || '').trim().slice(0, 64);
    if (!label) return null;
    const [rows] = await pool.execute(
        `SELECT id, device_label, is_active FROM pos_devices WHERE device_label = ? LIMIT 1`,
        [label]
    );
    return rows[0] || null;
}

async function createDevice(pool, deviceLabel) {
    const label = String(deviceLabel || '').trim().slice(0, 64);
    if (label.length < 2) {
        const err = new Error('Register name must be at least 2 characters');
        err.code = 'INVALID_DEVICE_LABEL';
        throw err;
    }

    const existing = await findDeviceByLabel(pool, label);
    if (existing) {
        const err = new Error(
            `Register "${label}" already exists. Click "New key" on that register to generate a replacement key.`
        );
        err.code = 'DUPLICATE_DEVICE_LABEL';
        err.existingDeviceId = existing.id;
        throw err;
    }

    const apiKey = generateDeviceApiKey();
    const apiKeyHash = hashDeviceKey(apiKey);
    const prefix = keyPrefix(apiKey);

    const [result] = await pool.execute(
        `INSERT INTO pos_devices (device_label, api_key_hash, key_prefix, is_active)
         VALUES (?, ?, ?, 1)`,
        [label, apiKeyHash, prefix]
    );

    return {
        id: result.insertId,
        deviceLabel: label,
        apiKey,
        keyPrefix: prefix
    };
}

async function revokeDevice(pool, deviceId) {
    const [result] = await pool.execute(`UPDATE pos_devices SET is_active = 0 WHERE id = ?`, [deviceId]);
    return result.affectedRows > 0;
}

async function regenerateDeviceKey(pool, deviceId) {
    const id = Number(deviceId);
    if (!Number.isInteger(id) || id <= 0) {
        const err = new Error('Invalid register id');
        err.code = 'INVALID_DEVICE_ID';
        throw err;
    }

    const [rows] = await pool.execute(
        `SELECT id, device_label FROM pos_devices WHERE id = ? LIMIT 1`,
        [id]
    );
    if (!rows.length) {
        const err = new Error('Register not found');
        err.code = 'DEVICE_NOT_FOUND';
        throw err;
    }

    const apiKey = generateDeviceApiKey();
    const apiKeyHash = hashDeviceKey(apiKey);
    const prefix = keyPrefix(apiKey);

    await pool.execute(
        `UPDATE pos_devices
         SET api_key_hash = ?, key_prefix = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [apiKeyHash, prefix, id]
    );

    return {
        id,
        deviceLabel: rows[0].device_label,
        apiKey,
        keyPrefix: prefix,
    };
}

async function touchDeviceSeen(pool, deviceRowId) {
    if (!deviceRowId) return;
    await pool.execute(`UPDATE pos_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`, [deviceRowId]).catch(() => {});
}

async function authenticateDevice(pool, deviceLabel, providedKey) {
    const label = String(deviceLabel || 'register-1').trim().slice(0, 64);
    const key = String(providedKey || '').trim();
    if (!key) {
        return { ok: false, code: 'POS_AUTH_FAILED' };
    }

    const [rows] = await pool.execute(
        `SELECT id, device_label, api_key_hash, is_active FROM pos_devices WHERE device_label = ? LIMIT 1`,
        [label]
    );
    const registered = rows[0];

    if (registered) {
        if (!registered.is_active) {
            return { ok: false, code: 'POS_DEVICE_REVOKED' };
        }
        const hash = hashDeviceKey(key);
        if (hash !== registered.api_key_hash) {
            return { ok: false, code: 'POS_AUTH_FAILED' };
        }
        await touchDeviceSeen(pool, registered.id);
        return { ok: true, deviceId: registered.device_label, deviceRecordId: registered.id };
    }

    const expected = String(process.env.POS_DEVICE_API_KEY || '').trim();
    if (!expected) {
        return { ok: false, code: 'POS_API_DISABLED' };
    }

    const left = Buffer.from(key, 'utf8');
    const right = Buffer.from(expected, 'utf8');
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
        return { ok: false, code: 'POS_AUTH_FAILED' };
    }

    return { ok: true, deviceId: label, deviceRecordId: null };
}

module.exports = {
    hashDeviceKey,
    listDevices,
    createDevice,
    regenerateDeviceKey,
    revokeDevice,
    authenticateDevice
};

'use strict';

const EQUIPMENT_TYPES = Object.freeze({
    card_terminal: {
        id: 'card_terminal',
        label: 'Card terminal',
        description: 'Countertop or integrated card reader for customer payments.',
        configFields: [
            { key: 'paymentAdapter', label: 'Payment adapter', type: 'select', options: ['inherit', 'external_terminal', 'integrated', 'custom'] },
            { key: 'connection', label: 'Connection', type: 'select', options: ['standalone', 'integrated', 'bluetooth', 'usb'] },
            { key: 'terminalId', label: 'Terminal ID (optional)', type: 'text' }
        ]
    },
    receipt_printer: {
        id: 'receipt_printer',
        label: 'Receipt printer',
        description: 'Thermal printer for customer receipts.',
        configFields: [
            { key: 'connection', label: 'Connection', type: 'select', options: ['usb', 'network', 'bluetooth'] },
            { key: 'address', label: 'IP or device name', type: 'text' },
            { key: 'paperWidth', label: 'Paper width (mm)', type: 'select', options: ['58', '80'] }
        ]
    },
    barcode_scanner: {
        id: 'barcode_scanner',
        label: 'Barcode scanner',
        description: 'USB or Bluetooth scanner for SKU lookup.',
        configFields: [
            { key: 'connection', label: 'Connection', type: 'select', options: ['keyboard_wedge', 'usb', 'bluetooth'] }
        ]
    },
    cash_drawer: {
        id: 'cash_drawer',
        label: 'Cash drawer',
        description: 'Cash drawer kicked from printer or register.',
        configFields: [
            { key: 'kickVia', label: 'Opens via', type: 'select', options: ['receipt_printer', 'register'] }
        ]
    },
    customer_display: {
        id: 'customer_display',
        label: 'Customer display',
        description: 'Second screen or pole display for cart totals.',
        configFields: [
            { key: 'mode', label: 'Display mode', type: 'select', options: ['browser', 'hdmi', 'pole'] },
            { key: 'url', label: 'Display URL (if browser)', type: 'text' }
        ]
    },
    label_printer: {
        id: 'label_printer',
        label: 'Label printer',
        description: 'Shelf or product label printer.',
        configFields: [
            { key: 'connection', label: 'Connection', type: 'select', options: ['usb', 'network', 'bluetooth'] },
            { key: 'address', label: 'IP or device name', type: 'text' }
        ]
    },
    scale: {
        id: 'scale',
        label: 'Scale',
        description: 'Weighing scale for bulk items.',
        configFields: [
            { key: 'connection', label: 'Connection', type: 'select', options: ['usb', 'serial', 'network'] },
            { key: 'unit', label: 'Unit', type: 'select', options: ['lb', 'oz', 'kg', 'g'] }
        ]
    },
    other: {
        id: 'other',
        label: 'Other',
        description: 'Any other POS peripheral.',
        configFields: []
    }
});

function normalizeEquipmentType(raw) {
    const id = String(raw || '').trim().toLowerCase();
    return EQUIPMENT_TYPES[id] ? id : 'other';
}

function parseConfig(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(String(raw));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function mapEquipmentRow(row) {
    return {
        id: row.id,
        equipmentType: row.equipment_type,
        equipmentTypeLabel: EQUIPMENT_TYPES[row.equipment_type]?.label || row.equipment_type,
        label: row.label,
        manufacturer: row.manufacturer || '',
        model: row.model || '',
        serialNumber: row.serial_number || '',
        posDeviceId: row.pos_device_id != null ? Number(row.pos_device_id) : null,
        posDeviceLabel: row.pos_device_label || null,
        config: parseConfig(row.config_json),
        notes: row.notes || '',
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function listEquipment(pool, { includeInactive = true } = {}) {
    const where = includeInactive ? '' : 'WHERE e.is_active = 1';
    const [rows] = await pool.execute(
        `SELECT e.*, d.device_label AS pos_device_label
         FROM pos_equipment e
         LEFT JOIN pos_devices d ON d.id = e.pos_device_id
         ${where}
         ORDER BY e.is_active DESC, e.label ASC`
    );
    return (rows || []).map(mapEquipmentRow);
}

async function listEquipmentForRegister(pool, posDeviceRecordId) {
    const id = Number(posDeviceRecordId);
    if (!Number.isInteger(id) || id <= 0) return [];
    const [rows] = await pool.execute(
        `SELECT e.*, d.device_label AS pos_device_label
         FROM pos_equipment e
         LEFT JOIN pos_devices d ON d.id = e.pos_device_id
         WHERE e.is_active = 1 AND e.pos_device_id = ?
         ORDER BY e.equipment_type ASC, e.label ASC`,
        [id]
    );
    return (rows || []).map(mapEquipmentRow);
}

async function getEquipmentById(pool, equipmentId) {
    const id = Number(equipmentId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const [rows] = await pool.execute(
        `SELECT e.*, d.device_label AS pos_device_label
         FROM pos_equipment e
         LEFT JOIN pos_devices d ON d.id = e.pos_device_id
         WHERE e.id = ? LIMIT 1`,
        [id]
    );
    return rows[0] ? mapEquipmentRow(rows[0]) : null;
}

async function createEquipment(pool, body) {
    const equipmentType = normalizeEquipmentType(body.equipmentType || body.equipment_type);
    const label = String(body.label || '').trim().slice(0, 128);
    if (label.length < 2) {
        const err = new Error('Equipment name must be at least 2 characters');
        err.code = 'INVALID_LABEL';
        throw err;
    }
    const posDeviceId = body.posDeviceId != null && body.posDeviceId !== ''
        ? Number(body.posDeviceId)
        : null;
    if (posDeviceId != null && (!Number.isInteger(posDeviceId) || posDeviceId <= 0)) {
        const err = new Error('Invalid register assignment');
        err.code = 'INVALID_DEVICE';
        throw err;
    }
    const config = parseConfig(body.config || body.config_json);
    const [result] = await pool.execute(
        `INSERT INTO pos_equipment
         (equipment_type, label, manufacturer, model, serial_number, pos_device_id, config_json, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            equipmentType,
            label,
            String(body.manufacturer || '').trim().slice(0, 128) || null,
            String(body.model || '').trim().slice(0, 128) || null,
            String(body.serialNumber || body.serial_number || '').trim().slice(0, 128) || null,
            posDeviceId,
            JSON.stringify(config),
            String(body.notes || '').trim().slice(0, 2000) || null,
            body.isActive === false || body.is_active === false ? 0 : 1
        ]
    );
    return getEquipmentById(pool, result.insertId);
}

async function updateEquipment(pool, equipmentId, body) {
    const existing = await getEquipmentById(pool, equipmentId);
    if (!existing) {
        const err = new Error('Equipment not found');
        err.code = 'NOT_FOUND';
        throw err;
    }
    const equipmentType = body.equipmentType != null
        ? normalizeEquipmentType(body.equipmentType)
        : existing.equipmentType;
    const label = body.label != null ? String(body.label).trim().slice(0, 128) : existing.label;
    if (label.length < 2) {
        const err = new Error('Equipment name must be at least 2 characters');
        err.code = 'INVALID_LABEL';
        throw err;
    }
    let posDeviceId = existing.posDeviceId;
    if (body.posDeviceId !== undefined || body.pos_device_id !== undefined) {
        const raw = body.posDeviceId !== undefined ? body.posDeviceId : body.pos_device_id;
        posDeviceId = raw === '' || raw == null ? null : Number(raw);
        if (posDeviceId != null && (!Number.isInteger(posDeviceId) || posDeviceId <= 0)) {
            const err = new Error('Invalid register assignment');
            err.code = 'INVALID_DEVICE';
            throw err;
        }
    }
    const config = body.config !== undefined ? parseConfig(body.config) : existing.config;
    await pool.execute(
        `UPDATE pos_equipment SET
            equipment_type = ?,
            label = ?,
            manufacturer = ?,
            model = ?,
            serial_number = ?,
            pos_device_id = ?,
            config_json = ?,
            notes = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            equipmentType,
            label,
            body.manufacturer !== undefined
                ? String(body.manufacturer || '').trim().slice(0, 128) || null
                : existing.manufacturer || null,
            body.model !== undefined
                ? String(body.model || '').trim().slice(0, 128) || null
                : existing.model || null,
            body.serialNumber !== undefined || body.serial_number !== undefined
                ? String(body.serialNumber || body.serial_number || '').trim().slice(0, 128) || null
                : existing.serialNumber || null,
            posDeviceId,
            JSON.stringify(config),
            body.notes !== undefined ? String(body.notes || '').trim().slice(0, 2000) || null : existing.notes || null,
            body.isActive === false || body.is_active === false ? 0 : 1,
            Number(equipmentId)
        ]
    );
    return getEquipmentById(pool, equipmentId);
}

async function deleteEquipment(pool, equipmentId) {
    const [result] = await pool.execute(`DELETE FROM pos_equipment WHERE id = ?`, [Number(equipmentId)]);
    return result.affectedRows > 0;
}

function listEquipmentTypeCatalog() {
    return Object.values(EQUIPMENT_TYPES).map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        configFields: t.configFields
    }));
}

module.exports = {
    EQUIPMENT_TYPES,
    normalizeEquipmentType,
    listEquipment,
    listEquipmentForRegister,
    getEquipmentById,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    listEquipmentTypeCatalog
};

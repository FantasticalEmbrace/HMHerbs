'use strict';

const logger = require('./logger');

const ORDER_PATCHES = [
    {
        column: 'pos_client_transaction_id',
        sql: `ALTER TABLE orders ADD COLUMN pos_client_transaction_id VARCHAR(64) NULL
              COMMENT 'Idempotency key from Business One POS offline queue'`
    },
    {
        column: 'pos_device_id',
        sql: `ALTER TABLE orders ADD COLUMN pos_device_id VARCHAR(64) NULL
              COMMENT 'Register/device identifier from POS'`
    }
];

async function columnExists(pool, tableName, columnName) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );
    return Number(rows[0].c) > 0;
}

async function tableExists(pool, tableName) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
    );
    return Number(rows[0].c) > 0;
}

function isDuplicateError(e) {
    return e?.errno === 1060 || e?.code === 'ER_DUP_FIELDNAME' || /duplicate column/i.test(e?.message || '');
}

async function applyColumnPatches(pool, tableName, patches) {
    if (!(await tableExists(pool, tableName))) return;
    for (const { column, sql } of patches) {
        try {
            if (await columnExists(pool, tableName, column)) continue;
            await pool.query(sql);
            logger.info(`Database: ${tableName} added column ${column}`);
        } catch (e) {
            if (isDuplicateError(e)) continue;
            logger.warn(`Database: POS patch failed — ${logger.formatMysqlError(e)}`);
        }
    }
}

async function ensurePosIndex(pool) {
    if (!(await columnExists(pool, 'orders', 'pos_client_transaction_id'))) return;
    try {
        await pool.query(
            `CREATE UNIQUE INDEX idx_orders_pos_client_tx ON orders (pos_client_transaction_id)`
        );
        logger.info('Database: orders added index idx_orders_pos_client_tx');
    } catch (e) {
        if (e?.errno === 1061 || /duplicate key/i.test(e?.message || '')) return;
        logger.warn(`Database: POS index patch failed — ${logger.formatMysqlError(e)}`);
    }
}

async function ensurePosSchema(pool) {
    await applyColumnPatches(pool, 'orders', ORDER_PATCHES);
    await ensurePosIndex(pool);
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pos_display_snapshots (
                device_id VARCHAR(64) NOT NULL PRIMARY KEY,
                payload JSON NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`);
    } catch (e) {
        logger.warn(`Database: pos_display_snapshots — ${logger.formatMysqlError(e)}`);
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pos_pin_attempts (
                attempt_key VARCHAR(128) NOT NULL PRIMARY KEY,
                fail_count INT NOT NULL DEFAULT 0,
                locked_until TIMESTAMP NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`);
    } catch (e) {
        logger.warn(`Database: pos_pin_attempts — ${logger.formatMysqlError(e)}`);
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pos_devices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_label VARCHAR(64) NOT NULL,
                api_key_hash CHAR(64) NOT NULL,
                key_prefix VARCHAR(12) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                last_seen_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_pos_devices_label (device_label)
            )`);
    } catch (e) {
        logger.warn(`Database: pos_devices — ${logger.formatMysqlError(e)}`);
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pos_equipment (
                id INT AUTO_INCREMENT PRIMARY KEY,
                equipment_type VARCHAR(32) NOT NULL,
                label VARCHAR(128) NOT NULL,
                manufacturer VARCHAR(128) NULL,
                model VARCHAR(128) NULL,
                serial_number VARCHAR(128) NULL,
                pos_device_id INT NULL,
                config_json JSON NULL,
                notes TEXT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_pos_equipment_device (pos_device_id),
                INDEX idx_pos_equipment_type (equipment_type)
            )`);
    } catch (e) {
        logger.warn(`Database: pos_equipment — ${logger.formatMysqlError(e)}`);
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pos_admin_handoffs (
                code VARCHAR(64) NOT NULL PRIMARY KEY,
                admin_user_id INT NOT NULL,
                employee_id INT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pos_handoff_expires (expires_at)
            )`);
    } catch (e) {
        logger.warn(`Database: pos_admin_handoffs — ${logger.formatMysqlError(e)}`);
    }
    try {
        await pool.query(`
            INSERT IGNORE INTO settings (key_name, value, description, type) VALUES
            ('pos_cash_discount_enabled', 'true', 'Enable in-store cash discount (card price vs lower cash price)', 'boolean'),
            ('pos_cash_discount_percent', '3.5', 'Cash discount percent off merchandise (max 15)', 'number'),
            ('pos_store_logo_url', '', 'Optional store logo URL for POS customer display', 'string'),
            ('pos_receipt_header_text', '', 'Optional extra line printed under store name on POS receipts', 'string'),
            ('pos_receipt_footer_text', 'Thank you for your purchase!', 'Closing message on POS receipts', 'string'),
            ('pos_receipt_show_address', 'true', 'Show store address on POS receipts', 'boolean'),
            ('pos_receipt_show_phone', 'true', 'Show store phone on POS receipts', 'boolean'),
            ('pos_receipt_show_logo', 'true', 'Show logo on POS receipts', 'boolean'),
            ('pos_receipt_show_sku', 'true', 'Show SKU on each line item on POS receipts', 'boolean'),
            ('pos_receipt_show_platform_line', 'true', 'Show Business One POS line on receipts', 'boolean'),
            ('pos_session_timeout_minutes', '30', 'Minutes before POS employee must re-enter PIN', 'number'),
            ('pos_pin_max_attempts', '10', 'Failed PIN attempts before lockout', 'number'),
            ('pos_pin_lockout_minutes', '15', 'Minutes to lock PIN entry after too many failures', 'number'),
            ('store_card_payment_processor', 'epi', 'Store card processor for website and integrated POS: epi or nmi_durango', 'string'),
            ('pos_card_payment_adapter', 'external_terminal', 'POS card payment mode: external_terminal, integrated, or custom', 'string'),
            ('pos_custom_payment_driver_url', '', 'Optional URL to custom POS payment driver script when adapter is custom', 'string')
        `);
    } catch (e) {
        logger.warn(`Database: pos cash discount settings — ${logger.formatMysqlError(e)}`);
    }
    try {
        await pool.query(
            `UPDATE settings SET value = '10' WHERE key_name = 'pos_pin_max_attempts' AND value = '5'`
        );
    } catch (e) {
        logger.warn(`Database: pos_pin_max_attempts migration — ${logger.formatMysqlError(e)}`);
    }
    try {
        const [legacyRows] = await pool.execute(
            `SELECT value FROM settings WHERE key_name = 'pos_card_payment_adapter' LIMIT 1`
        );
        const legacyAdapter = String(legacyRows[0]?.value || '').toLowerCase();
        if (legacyAdapter === 'nmi_durango' || legacyAdapter === 'epi') {
            await pool.execute(
                `UPDATE settings SET value = 'integrated' WHERE key_name = 'pos_card_payment_adapter'`
            );
            const [storeRows] = await pool.execute(
                `SELECT value FROM settings WHERE key_name = 'store_card_payment_processor' LIMIT 1`
            );
            if (!storeRows.length) {
                await pool.execute(
                    `INSERT INTO settings (key_name, value, description, type) VALUES (?, ?, ?, ?)`,
                    [
                        'store_card_payment_processor',
                        legacyAdapter,
                        'Store card processor for website and integrated POS: epi or nmi_durango',
                        'string'
                    ]
                );
            }
        }
    } catch (e) {
        logger.warn(`Database: payment processor migration — ${logger.formatMysqlError(e)}`);
    }
}

module.exports = { ensurePosSchema };

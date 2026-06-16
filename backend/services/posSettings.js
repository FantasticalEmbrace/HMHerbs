'use strict';

/** Settings keys owned by the Point of Sale admin section (not general Settings). */
const POS_SETTING_KEYS = Object.freeze([
    'pos_cash_discount_enabled',
    'pos_cash_discount_percent',
    'pos_store_logo_url',
    'store_card_payment_processor',
    'pos_card_payment_adapter',
    'pos_custom_payment_driver_url',
    'pos_receipt_header_text',
    'pos_receipt_footer_text',
    'pos_receipt_show_address',
    'pos_receipt_show_phone',
    'pos_receipt_show_logo',
    'pos_receipt_show_sku',
    'pos_receipt_show_platform_line',
    'pos_session_timeout_minutes',
    'pos_pin_max_attempts',
    'pos_pin_lockout_minutes'
]);

const POS_SETTING_META = Object.freeze({
    pos_cash_discount_enabled: { description: 'Enable in-store cash discount', type: 'boolean' },
    pos_cash_discount_percent: { description: 'Cash discount percent (max 15)', type: 'number' },
    pos_store_logo_url: { description: 'Store logo URL for POS customer display', type: 'string' },
    store_card_payment_processor: { description: 'Store card processor: epi or nmi_durango', type: 'string' },
    pos_card_payment_adapter: { description: 'POS card payment mode: external_terminal, integrated, or custom', type: 'string' },
    pos_custom_payment_driver_url: { description: 'Custom POS payment driver script URL', type: 'string' },
    pos_receipt_header_text: { description: 'POS receipt header line', type: 'string' },
    pos_receipt_footer_text: { description: 'POS receipt footer message', type: 'string' },
    pos_receipt_show_address: { description: 'Show address on POS receipts', type: 'boolean' },
    pos_receipt_show_phone: { description: 'Show phone on POS receipts', type: 'boolean' },
    pos_receipt_show_logo: { description: 'Show logo on POS receipts', type: 'boolean' },
    pos_receipt_show_sku: { description: 'Show SKU on POS receipts', type: 'boolean' },
    pos_receipt_show_platform_line: { description: 'Show Business One line on receipts', type: 'boolean' },
    pos_session_timeout_minutes: { description: 'POS PIN session timeout minutes', type: 'number' },
    pos_pin_max_attempts: { description: 'Max failed PIN attempts', type: 'number' },
    pos_pin_lockout_minutes: { description: 'PIN lockout minutes', type: 'number' }
});

async function loadPosSettings(pool) {
    if (!pool || !POS_SETTING_KEYS.length) return {};
    const placeholders = POS_SETTING_KEYS.map(() => '?').join(', ');
    const [rows] = await pool.execute(
        `SELECT key_name, value FROM settings WHERE key_name IN (${placeholders})`,
        [...POS_SETTING_KEYS]
    );
    const out = {};
    for (const row of rows || []) {
        out[row.key_name] = row.value != null ? String(row.value) : '';
    }
    return out;
}

module.exports = {
    POS_SETTING_KEYS,
    POS_SETTING_META,
    loadPosSettings
};

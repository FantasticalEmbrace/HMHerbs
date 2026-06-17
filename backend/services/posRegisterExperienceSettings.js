'use strict';

const SETTING_LARGE_TOUCH = 'pos_large_touch_mode';
const SETTING_SCAN_BEEP = 'pos_scan_beep_enabled';
const SETTING_QUICK_KEYS = 'pos_quick_keys';
const SETTING_DISPLAY_HOURS_IDLE = 'pos_display_store_hours_idle';
const SETTING_PERSONNEL_MODE = 'pos_personnel_mode';

const SETTING_SHOW_COST_IN_CART = 'pos_show_cost_in_cart';
const SETTING_HARDWARE_PRINTER = 'pos_hardware_printer';
const SETTING_DISPLAY_CARD_CHECKOUT = 'pos_display_card_checkout';

const PERSONNEL_MODES = Object.freeze(['time_clock_only', 'time_clock_and_pos']);

const DEFAULTS = {
    largeTouchMode: false,
    scanBeepEnabled: true,
    quickKeys: [],
    displayStoreHoursIdle: false,
    personnelMode: 'time_clock_and_pos',
    showCostInCart: false,
    hardwarePrinter: 'auto',
    displayCardCheckout: true
};

function parseBool(value, fallback = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return fallback;
}

function normalizeQuickKey(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const type = String(entry.type || '').trim().toLowerCase();
    const value = String(entry.value || '').trim();
    const label = String(entry.label || '').trim().slice(0, 40);
    if (!value) return null;
    if (type === 'sku' || type === 'product') {
        return { type: 'sku', value, label: label || value };
    }
    if (type === 'category' || type === 'department' || type === 'cat') {
        return { type: 'category', value, label: label || value };
    }
    return null;
}

function parseQuickKeys(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map(normalizeQuickKey).filter(Boolean).slice(0, 24);
    }
    const text = String(raw).trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed.map(normalizeQuickKey).filter(Boolean).slice(0, 24);
        }
    } catch {
        /* line format below */
    }
    const keys = [];
    for (const line of text.split('\n')) {
        const row = line.trim();
        if (!row || row.startsWith('#')) continue;
        const pipe = row.indexOf('|');
        const head = pipe >= 0 ? row.slice(0, pipe).trim() : row;
        const label = pipe >= 0 ? row.slice(pipe + 1).trim() : '';
        const colon = head.indexOf(':');
        if (colon < 0) continue;
        const typeRaw = head.slice(0, colon).trim().toLowerCase();
        const value = head.slice(colon + 1).trim();
        const key = normalizeQuickKey({
            type: typeRaw,
            value,
            label
        });
        if (key) keys.push(key);
    }
    return keys.slice(0, 24);
}

function serializeQuickKeys(keys) {
    return JSON.stringify(parseQuickKeys(keys));
}

function normalizePersonnelMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return PERSONNEL_MODES.includes(mode) ? mode : DEFAULTS.personnelMode;
}

async function loadPosRegisterExperienceSettings(pool) {
    const keys = [
        SETTING_LARGE_TOUCH,
        SETTING_SCAN_BEEP,
        SETTING_QUICK_KEYS,
        SETTING_DISPLAY_HOURS_IDLE,
        SETTING_PERSONNEL_MODE,
        SETTING_SHOW_COST_IN_CART,
        SETTING_HARDWARE_PRINTER,
        SETTING_DISPLAY_CARD_CHECKOUT
    ];
    const placeholders = keys.map(() => '?').join(', ');
    let map = new Map();
    try {
        const [rows] = await pool.execute(
            `SELECT key_name, value FROM settings WHERE key_name IN (${placeholders})`,
            keys
        );
        map = new Map((rows || []).map((r) => [r.key_name, r.value]));
    } catch {
        /* defaults */
    }

    return {
        largeTouchMode: parseBool(map.get(SETTING_LARGE_TOUCH), DEFAULTS.largeTouchMode),
        scanBeepEnabled: parseBool(map.get(SETTING_SCAN_BEEP), DEFAULTS.scanBeepEnabled),
        quickKeys: parseQuickKeys(map.get(SETTING_QUICK_KEYS)),
        displayStoreHoursIdle: parseBool(
            map.get(SETTING_DISPLAY_HOURS_IDLE),
            DEFAULTS.displayStoreHoursIdle
        ),
        personnelMode: normalizePersonnelMode(map.get(SETTING_PERSONNEL_MODE)),
        showCostInCart: parseBool(map.get(SETTING_SHOW_COST_IN_CART), DEFAULTS.showCostInCart),
        hardwarePrinter: String(map.get(SETTING_HARDWARE_PRINTER) || DEFAULTS.hardwarePrinter).trim() || DEFAULTS.hardwarePrinter,
        displayCardCheckout: parseBool(map.get(SETTING_DISPLAY_CARD_CHECKOUT), DEFAULTS.displayCardCheckout)
    };
}

module.exports = {
    SETTING_LARGE_TOUCH,
    SETTING_SCAN_BEEP,
    SETTING_QUICK_KEYS,
    SETTING_DISPLAY_HOURS_IDLE,
    SETTING_PERSONNEL_MODE,
    SETTING_SHOW_COST_IN_CART,
    SETTING_HARDWARE_PRINTER,
    SETTING_DISPLAY_CARD_CHECKOUT,
    PERSONNEL_MODES,
    DEFAULTS,
    parseQuickKeys,
    serializeQuickKeys,
    normalizePersonnelMode,
    loadPosRegisterExperienceSettings
};

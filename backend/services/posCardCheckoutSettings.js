'use strict';

const SETTING_POI_DEVICE_ID = 'pos_poi_device_id';
const SETTING_DISPLAY_MODE = 'pos_card_display_mode';
const SETTING_DISPLAY_CARD_CHECKOUT = 'pos_display_card_checkout';

const DISPLAY_MODES = Object.freeze(['durango_terminal', 'pos_display']);

const DEFAULTS = {
    poiDeviceId: '',
    displayMode: 'durango_terminal',
    displayCardCheckout: true
};

function parseBool(value, fallback = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return fallback;
}

function normalizeDisplayMode(raw) {
    const id = String(raw || '').trim().toLowerCase();
    return DISPLAY_MODES.includes(id) ? id : DEFAULTS.displayMode;
}

async function loadPosCardCheckoutSettings(pool) {
    const keys = [SETTING_POI_DEVICE_ID, SETTING_DISPLAY_MODE, SETTING_DISPLAY_CARD_CHECKOUT];
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

    const poiDeviceId = String(map.get(SETTING_POI_DEVICE_ID) || '').trim();
    const rawMode = normalizeDisplayMode(map.get(SETTING_DISPLAY_MODE));
    const displayCardCheckout = parseBool(
        map.get(SETTING_DISPLAY_CARD_CHECKOUT),
        DEFAULTS.displayCardCheckout
    );

    let displayMode = rawMode;
    if (displayMode === 'durango_terminal' && !poiDeviceId) {
        displayMode = 'pos_display';
    }

    return {
        poiDeviceId,
        displayMode,
        rawDisplayMode: rawMode,
        displayCardCheckout,
        durangoControlsTerminal: displayMode === 'durango_terminal' && Boolean(poiDeviceId)
    };
}

module.exports = {
    SETTING_POI_DEVICE_ID,
    SETTING_DISPLAY_MODE,
    SETTING_DISPLAY_CARD_CHECKOUT,
    DISPLAY_MODES,
    DEFAULTS,
    loadPosCardCheckoutSettings
};

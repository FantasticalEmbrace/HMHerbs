'use strict';

const SETTING_POI_DEVICE_ID = 'pos_poi_device_id';
const SETTING_DISPLAY_MODE = 'pos_card_display_mode';
const SETTING_DISPLAY_CARD_CHECKOUT = 'pos_display_card_checkout';

/** Semi-integrated Durango on A3700 only — no in-POS or customer-display card entry. */
const DISPLAY_MODE = 'durango_terminal';

const DEFAULTS = {
    poiDeviceId: '',
    displayMode: DISPLAY_MODE,
    displayCardCheckout: true
};

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

    return {
        poiDeviceId,
        displayMode: DISPLAY_MODE,
        rawDisplayMode: DISPLAY_MODE,
        displayCardCheckout: true,
        durangoControlsTerminal: Boolean(poiDeviceId)
    };
}

module.exports = {
    SETTING_POI_DEVICE_ID,
    SETTING_DISPLAY_MODE,
    SETTING_DISPLAY_CARD_CHECKOUT,
    DISPLAY_MODE,
    DEFAULTS,
    loadPosCardCheckoutSettings
};

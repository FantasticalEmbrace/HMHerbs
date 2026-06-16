'use strict';

const SETTING_SESSION_TIMEOUT = 'pos_session_timeout_minutes';
const SETTING_PIN_MAX_ATTEMPTS = 'pos_pin_max_attempts';
const SETTING_PIN_LOCKOUT_MINUTES = 'pos_pin_lockout_minutes';

const DEFAULTS = {
    sessionTimeoutMinutes: 30,
    pinMaxAttempts: 10,
    pinLockoutMinutes: 15
};

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

async function loadPosSecuritySettings(pool) {
    const keys = [SETTING_SESSION_TIMEOUT, SETTING_PIN_MAX_ATTEMPTS, SETTING_PIN_LOCKOUT_MINUTES];
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

    const envTimeout = Number(process.env.POS_SESSION_TIMEOUT_MINUTES);
    const sessionTimeoutMinutes = clampInt(
        map.get(SETTING_SESSION_TIMEOUT) ?? (Number.isFinite(envTimeout) ? envTimeout : DEFAULTS.sessionTimeoutMinutes),
        5,
        480,
        DEFAULTS.sessionTimeoutMinutes
    );
    const pinMaxAttempts = clampInt(
        map.get(SETTING_PIN_MAX_ATTEMPTS),
        3,
        20,
        DEFAULTS.pinMaxAttempts
    );
    const pinLockoutMinutes = clampInt(
        map.get(SETTING_PIN_LOCKOUT_MINUTES),
        5,
        120,
        DEFAULTS.pinLockoutMinutes
    );

    return { sessionTimeoutMinutes, pinMaxAttempts, pinLockoutMinutes };
}

module.exports = {
    SETTING_SESSION_TIMEOUT,
    SETTING_PIN_MAX_ATTEMPTS,
    SETTING_PIN_LOCKOUT_MINUTES,
    DEFAULTS,
    loadPosSecuritySettings
};

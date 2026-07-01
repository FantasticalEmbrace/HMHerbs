'use strict';

/**
 * Developer-managed integration credentials stored in settings (cred_* keys).
 * Falls back to process.env when a DB value is unset.
 */

const REDACT_PLACEHOLDER = '[configured]';

const SECRET_KEYS = new Set([
    'cred_epi_public_tokenization_key',
    'cred_epi_private_api_key',
    'cred_nmi_public_tokenization_key',
    'cred_nmi_private_api_key',
    'cred_pos_nmi_public_tokenization_key',
    'cred_pos_nmi_private_api_key',
    'cred_shippo_api_token',
]);

const EXTRA_SETTING_KEYS = ['pos_poi_device_id', 'store_card_payment_processor'];

function normalizeStoreProcessor(raw) {
    const id = String(raw || '').trim().toLowerCase();
    return id === 'nmi_durango' ? 'nmi_durango' : 'epi';
}

const ALL_KEYS = [
    'cred_epi_deployment_mode',
    'cred_epi_public_tokenization_key',
    'cred_epi_private_api_key',
    'cred_epi_poi_device_id',
    'cred_durango_deployment_mode',
    'cred_nmi_public_tokenization_key',
    'cred_nmi_private_api_key',
    'cred_nmi_sandbox',
    'cred_pos_nmi_public_tokenization_key',
    'cred_pos_nmi_private_api_key',
    'cred_pos_nmi_sandbox',
    'cred_pos_poi_device_id',
    'cred_shippo_api_token',
    'cred_shippo_test_mode',
    'cred_shippo_carriers',
    'cred_shippo_from_name',
    'cred_shippo_from_street1',
    'cred_shippo_from_city',
    'cred_shippo_from_state',
    'cred_shippo_from_zip',
    'cred_shippo_from_phone',
    'cred_shippo_from_email',
];

const ENV_FALLBACKS = Object.freeze({
    cred_epi_public_tokenization_key: ['EPI_PUBLIC_TOKENIZATION_KEY', 'EPI_PUBLIC_KEY'],
    cred_epi_private_api_key: ['EPI_PRIVATE_API_KEY', 'EPI_API_KEY', 'EPI_SECURITY_KEY'],
    cred_epi_poi_device_id: [],
    cred_epi_deployment_mode: [],
    cred_durango_deployment_mode: [],
    cred_nmi_public_tokenization_key: ['NMI_PUBLIC_TOKENIZATION_KEY', 'NMI_PUBLIC_KEY'],
    cred_nmi_private_api_key: [
        'NMI_PRIVATE_API_KEY',
        'NMI_PRIVATE_KEY',
        'NMI_API_KEY',
        'DURANGO_API_KEY',
    ],
    cred_nmi_sandbox: ['NMI_SANDBOX'],
    cred_pos_nmi_public_tokenization_key: ['POS_NMI_PUBLIC_TOKENIZATION_KEY', 'POS_NMI_PUBLIC_KEY'],
    cred_pos_nmi_private_api_key: [
        'POS_NMI_PRIVATE_API_KEY',
        'POS_NMI_PRIVATE_KEY',
        'POS_DURANGO_API_KEY',
        'POS_NMI_API_KEY',
    ],
    cred_pos_nmi_sandbox: ['POS_NMI_SANDBOX'],
    cred_pos_poi_device_id: [],
    cred_shippo_api_token: ['SHIPPO_API_TOKEN'],
    cred_shippo_test_mode: ['SHIPPO_TEST_MODE'],
    cred_shippo_carriers: ['SHIPPO_CARRIERS'],
    cred_shippo_from_name: ['SHIPPO_FROM_NAME', 'STORE_NAME'],
    cred_shippo_from_street1: ['SHIPPO_FROM_STREET1'],
    cred_shippo_from_city: ['SHIPPO_FROM_CITY'],
    cred_shippo_from_state: ['SHIPPO_FROM_STATE'],
    cred_shippo_from_zip: ['SHIPPO_FROM_ZIP'],
    cred_shippo_from_phone: ['SHIPPO_FROM_PHONE'],
    cred_shippo_from_email: ['SHIPPO_FROM_EMAIL', 'SMTP_FROM'],
});

/** @type {Record<string, string>} */
let cache = {};

function trim(v) {
    return v != null ? String(v).trim() : '';
}

function firstEnv(keys) {
    for (const key of keys || []) {
        const v = trim(process.env[key]);
        if (v) return v;
    }
    return '';
}

function resolve(key) {
    const db = trim(cache[key]);
    if (db) return db;
    return firstEnv(ENV_FALLBACKS[key]);
}

function isTruthyFlag(raw) {
    const s = trim(raw).toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
}

function isSecretPlaceholder(value) {
    const v = trim(value);
    if (!v) return true;
    if (v === '••••••••' || v === '********') return true;
    return v === REDACT_PLACEHOLDER || v.startsWith(REDACT_PLACEHOLDER);
}

async function hydrateFromDatabase(pool) {
    if (!pool) {
        cache = {};
        return;
    }
    const queryKeys = [...ALL_KEYS, ...EXTRA_SETTING_KEYS];
    const placeholders = queryKeys.map(() => '?').join(', ');
    const [rows] = await pool.execute(
        `SELECT key_name, value FROM settings WHERE key_name IN (${placeholders})`,
        queryKeys
    );
    const next = {};
    for (const row of rows || []) {
        next[row.key_name] = row.value != null ? String(row.value) : '';
    }
    if (!trim(next.cred_pos_poi_device_id) && trim(next.pos_poi_device_id)) {
        next.cred_pos_poi_device_id = trim(next.pos_poi_device_id);
    }
    cache = next;
}

function getStoreProcessor() {
    return normalizeStoreProcessor(cache.store_card_payment_processor);
}

function maskSecret(value) {
    const v = trim(value);
    if (!v) return '';
    if (v.length <= 4) return REDACT_PLACEHOLDER;
    return `${REDACT_PLACEHOLDER} (…${v.slice(-4)})`;
}

function buildApiPayload() {
    const fields = {};
    for (const key of ALL_KEYS) {
        const resolved = resolve(key);
        if (SECRET_KEYS.has(key)) {
            fields[key] = resolved ? maskSecret(resolved) : '';
        } else {
            fields[key] = resolved;
        }
    }

    const epiPublic = resolve('cred_epi_public_tokenization_key');
    const epiPrivate = resolve('cred_epi_private_api_key');
    const nmiPublic = resolve('cred_nmi_public_tokenization_key');
    const nmiPrivate = resolve('cred_nmi_private_api_key');
    const posPublic = resolve('cred_pos_nmi_public_tokenization_key');
    const posPrivate = resolve('cred_pos_nmi_private_api_key');
    const shippoToken = resolve('cred_shippo_api_token');
    const shippoOrigin = resolve('cred_shippo_from_street1');

    return {
        fields,
        storeProcessor: getStoreProcessor(),
        status: {
            epi: {
                configured: Boolean(epiPublic && epiPrivate),
                deploymentMode: resolve('cred_epi_deployment_mode') || 'virtual',
            },
            durango: {
                websiteConfigured: Boolean(nmiPublic && nmiPrivate),
                posConfigured: Boolean(posPublic && posPrivate),
                deploymentMode: resolve('cred_durango_deployment_mode') || 'virtual',
                poiDeviceId: resolve('cred_pos_poi_device_id') || resolve('cred_epi_poi_device_id') || '',
            },
            shippo: {
                configured: Boolean(shippoToken),
                originConfigured: Boolean(
                    shippoOrigin && resolve('cred_shippo_from_city') && resolve('cred_shippo_from_state')
                ),
            },
        },
    };
}

async function upsertSetting(pool, key, value, type = 'string') {
    await pool.execute(
        `INSERT INTO settings (key_name, value, description, type)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)`,
        [key, value, `Integration credential: ${key}`, type]
    );
}

async function saveCredentials(pool, updates = {}) {
    if (!pool) throw new Error('Database not available');

    const saved = [];
    for (const key of ALL_KEYS) {
        if (!(key in updates)) continue;
        let value = trim(updates[key]);

        if (SECRET_KEYS.has(key) && isSecretPlaceholder(value)) {
            continue;
        }

        if (key === 'cred_epi_deployment_mode' || key === 'cred_durango_deployment_mode') {
            value = value === 'physical' ? 'physical' : 'virtual';
        }

        if (key === 'cred_nmi_sandbox' || key === 'cred_pos_nmi_sandbox' || key === 'cred_shippo_test_mode') {
            value = isTruthyFlag(value) ? 'true' : 'false';
        }

        await upsertSetting(pool, key, value);
        cache[key] = value;
        saved.push(key);
    }

    if ('cred_pos_poi_device_id' in updates && !isSecretPlaceholder(updates.cred_pos_poi_device_id)) {
        const poi = trim(updates.cred_pos_poi_device_id);
        await upsertSetting(pool, 'pos_poi_device_id', poi, 'string');
        cache.pos_poi_device_id = poi;
    }

    if ('store_card_payment_processor' in updates) {
        const processor = normalizeStoreProcessor(updates.store_card_payment_processor);
        await upsertSetting(
            pool,
            'store_card_payment_processor',
            processor,
            'string'
        );
        cache.store_card_payment_processor = processor;
        saved.push('store_card_payment_processor');
    }

    return { saved, payload: buildApiPayload() };
}

function getEpiPublicTokenizationKey() {
    return resolve('cred_epi_public_tokenization_key');
}

function getEpiPrivateApiKey() {
    return resolve('cred_epi_private_api_key');
}

function getNmiPublicTokenizationKey() {
    return resolve('cred_nmi_public_tokenization_key');
}

function getNmiPrivateApiKey() {
    return resolve('cred_nmi_private_api_key');
}

function getPosNmiPublicTokenizationKey() {
    return resolve('cred_pos_nmi_public_tokenization_key');
}

function getPosNmiPrivateApiKey() {
    return resolve('cred_pos_nmi_private_api_key');
}

function isNmiSandboxHint() {
    const raw = resolve('cred_nmi_sandbox');
    if (raw) return isTruthyFlag(raw);
    return isTruthyFlag(process.env.NMI_SANDBOX);
}

function isPosNmiSandboxHint() {
    const raw = resolve('cred_pos_nmi_sandbox');
    if (raw) return isTruthyFlag(raw);
    const envRaw = process.env.POS_NMI_SANDBOX;
    if (envRaw !== undefined && trim(envRaw) !== '') {
        return isTruthyFlag(envRaw);
    }
    return isNmiSandboxHint();
}

function getShippoApiToken() {
    return resolve('cred_shippo_api_token');
}

function isShippoTestMode() {
    const raw = resolve('cred_shippo_test_mode');
    if (raw) return isTruthyFlag(raw);
    return trim(process.env.SHIPPO_TEST_MODE || 'true').toLowerCase() !== 'false';
}

function getShippoStoreOrigin() {
    return {
        name: resolve('cred_shippo_from_name') || 'H&M Herbs & Vitamins',
        company: resolve('cred_shippo_from_name') || 'H&M Herbs & Vitamins',
        street1: resolve('cred_shippo_from_street1'),
        street2: '',
        city: resolve('cred_shippo_from_city'),
        state: resolve('cred_shippo_from_state'),
        zip: resolve('cred_shippo_from_zip'),
        country: 'US',
        phone: resolve('cred_shippo_from_phone'),
        email: resolve('cred_shippo_from_email'),
    };
}

function getShippoCarrierFilter() {
    const raw =
        resolve('cred_shippo_carriers') ||
        String(process.env.SHIPPO_CARRIERS || 'usps,ups,fedex');
    return new Set(
        raw
            .split(',')
            .map((c) => c.trim().toLowerCase())
            .filter(Boolean)
    );
}

function getPosPoiDeviceId() {
    return resolve('cred_pos_poi_device_id') || trim(cache.pos_poi_device_id) || firstEnv(['POS_POI_DEVICE_ID']);
}

module.exports = {
    REDACT_PLACEHOLDER,
    SECRET_KEYS,
    ALL_KEYS,
    hydrateFromDatabase,
    buildApiPayload,
    saveCredentials,
    getEpiPublicTokenizationKey,
    getEpiPrivateApiKey,
    getNmiPublicTokenizationKey,
    getNmiPrivateApiKey,
    getPosNmiPublicTokenizationKey,
    getPosNmiPrivateApiKey,
    isNmiSandboxHint,
    isPosNmiSandboxHint,
    getShippoApiToken,
    isShippoTestMode,
    getShippoStoreOrigin,
    getShippoCarrierFilter,
    getPosPoiDeviceId,
    getStoreProcessor,
    normalizeStoreProcessor,
};

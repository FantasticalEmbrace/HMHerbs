'use strict';

const {
    loadStorePaymentProcessor,
    loadPosPaymentProcessor,
    resolveProcessorCredentials,
    resolvePosProcessorCredentials,
    processorConfigured,
    posProcessorConfigured
} = require('./storePaymentProcessor');

/** Built-in card payment adapters exposed to POS clients (no secrets). */
const POS_CARD_ADAPTERS = {
    external_terminal: {
        id: 'external_terminal',
        label: 'External card terminal',
        description:
            'Customer pays on a countertop terminal. The register records approval only — lightest PCI scope (SAQ-B).',
        integrated: false,
        pciScope: 'SAQ-B / out of scope for card data — terminal handles PAN',
        driverScript: 'js/payment-drivers/external-terminal.js',
        serverCharge: false
    },
    integrated: {
        id: 'integrated',
        label: 'Integrated card (in register)',
        description:
            'Card fields in the register using your store processor (EPI or Durango) from admin Payments.',
        integrated: true,
        pciScope: 'SAQ-A when using hosted tokenization (Collect.js)',
        driverScript: null,
        serverCharge: true,
        resolvesStoreProcessor: true
    },
    epi: {
        id: 'epi',
        label: 'EPI (integrated)',
        description:
            'Standard EPI gateway — same processor as website checkout when EPI is selected in admin.',
        integrated: true,
        pciScope: 'SAQ-A when using hosted tokenization (Collect.js)',
        driverScript: 'js/payment-drivers/epi.js',
        serverCharge: true,
        storeProcessor: 'epi'
    },
    nmi_durango: {
        id: 'nmi_durango',
        label: 'Durango / NMI (integrated)',
        description:
            'In-store Durango/NMI — uses the separate POS merchant account (POS_NMI_* keys in .env), not website checkout.',
        integrated: true,
        pciScope: 'SAQ-A when using hosted tokenization (Collect.js)',
        driverScript: 'js/payment-drivers/nmi-durango.js',
        serverCharge: true,
        storeProcessor: 'nmi_durango'
    },
    custom: {
        id: 'custom',
        label: 'Custom (developer)',
        description:
            'Load a custom driver script URL from admin or register a driver in js/payment-drivers/.',
        integrated: true,
        pciScope: 'Depends on your integration',
        driverScript: null,
        serverCharge: false
    }
};

const DEFAULT_ADAPTER_ID = 'external_terminal';
const SETTING_KEY = 'pos_card_payment_adapter';
const CUSTOM_SCRIPT_KEY = 'pos_custom_payment_driver_url';

const POS_MODE_IDS = new Set(['external_terminal', 'integrated', 'custom']);

function normalizePosMode(raw) {
    const id = String(raw || '').trim().toLowerCase();
    if (POS_MODE_IDS.has(id)) return id;
    if (id === 'epi' || id === 'nmi_durango') return 'integrated';
    return DEFAULT_ADAPTER_ID;
}

function normalizeAdapterId(raw) {
    const id = String(raw || '').trim().toLowerCase();
    if (POS_CARD_ADAPTERS[id]) return id;
    if (id === 'integrated') return 'integrated';
    return DEFAULT_ADAPTER_ID;
}

async function readSetting(pool, key) {
    const [rows] = await pool.execute('SELECT value FROM settings WHERE key_name = ? LIMIT 1', [key]);
    return rows[0]?.value != null ? String(rows[0].value).trim() : '';
}

function adapterConfigured(adapterId) {
    const meta = POS_CARD_ADAPTERS[adapterId];
    if (!meta) return false;
    if (adapterId === 'nmi_durango') return posProcessorConfigured('nmi_durango');
    if (meta.storeProcessor) return processorConfigured(meta.storeProcessor);
    if (!meta.requiresEnv?.length) return true;
    return meta.requiresEnv.every((key) => String(process.env[key] || '').trim());
}

function listPublicAdapters() {
    return [
        POS_CARD_ADAPTERS.external_terminal,
        POS_CARD_ADAPTERS.integrated,
        POS_CARD_ADAPTERS.custom
    ].map((a) => ({
        id: a.id,
        label: a.label,
        description: a.description,
        integrated: a.integrated,
        pciScope: a.pciScope,
        driverScript: a.driverScript,
        serverCharge: Boolean(a.serverCharge),
        requiresEnv: a.requiresEnv || []
    }));
}

/**
 * Resolve POS mode + effective driver id (epi, nmi_durango, external_terminal, custom).
 * @param {import('mysql2/promise').Pool|null} pool
 * @param {string} [adapterOverride] optional equipment or env override
 */
async function resolveEffectivePaymentAdapter(pool, adapterOverride) {
    const storeProcessor = pool ? await loadStorePaymentProcessor(pool) : 'epi';
    const posProcessor = pool ? await loadPosPaymentProcessor(pool) : storeProcessor;
    const envAdapter = normalizePosMode(process.env.POS_CARD_PAYMENT_ADAPTER);
    let posMode = envAdapter;
    let customDriverUrl = String(process.env.POS_CUSTOM_PAYMENT_DRIVER_URL || '').trim();

    if (pool) {
        try {
            const dbAdapter = adapterOverride || (await readSetting(pool, SETTING_KEY));
            if (dbAdapter) posMode = normalizePosMode(dbAdapter);
            const dbCustom = await readSetting(pool, CUSTOM_SCRIPT_KEY);
            if (dbCustom) customDriverUrl = dbCustom;
        } catch {
            /* use env defaults */
        }
    } else if (adapterOverride) {
        posMode = normalizePosMode(adapterOverride);
    }

    let effectiveDriverId = posMode;
    if (posMode === 'integrated') {
        effectiveDriverId = posProcessor;
    }

    const meta = POS_CARD_ADAPTERS[effectiveDriverId] || POS_CARD_ADAPTERS.external_terminal;
    let configured = adapterConfigured(effectiveDriverId);
    if (posMode === 'integrated' && !configured) {
        configured = false;
    }
    if (posMode === 'external_terminal') {
        configured = true;
        effectiveDriverId = 'external_terminal';
    }

    let driverScript = meta.driverScript;
    if (effectiveDriverId === 'custom' && customDriverUrl) {
        driverScript = customDriverUrl;
    }

    const modeMeta = POS_CARD_ADAPTERS[posMode] || POS_CARD_ADAPTERS.external_terminal;

    return {
        posMode,
        posModeLabel: modeMeta.label,
        cardAdapter: effectiveDriverId,
        cardAdapterLabel: meta.label,
        storeProcessor,
        posProcessor,
        driverScript,
        customDriverUrl: effectiveDriverId === 'custom' ? customDriverUrl : '',
        integrated: Boolean(meta.integrated),
        serverCharge: Boolean(meta.serverCharge),
        configured,
        configurationNote: configured
            ? null
            : posMode === 'integrated'
              ? effectiveDriverId === 'nmi_durango'
                  ? 'Integrated in-store Durango needs POS_NMI_PUBLIC_TOKENIZATION_KEY and POS_NMI_PRIVATE_API_KEY in backend .env (separate from website NMI_* keys).'
                  : `Integrated ${posProcessor === 'nmi_durango' ? 'Durango' : 'EPI'} needs server API keys in backend .env. Use External terminal until configured.`
              : `Adapter "${meta.label}" needs server keys. Falling back to external terminal behavior until configured.`,
        compliance: {
            cardDataInApp: Boolean(meta.integrated),
            useExternalTerminalForCards: !meta.integrated,
            pciScope: meta.pciScope
        },
        envOverride: Boolean(process.env.POS_CARD_PAYMENT_ADAPTER)
    };
}

/**
 * Resolve active POS card adapter from DB settings with env fallback.
 * @param {import('mysql2/promise').Pool} pool
 */
async function loadPosPaymentConfig(pool) {
    const resolved = await resolveEffectivePaymentAdapter(pool);
    return {
        cardAdapter: resolved.cardAdapter,
        cardAdapterLabel: resolved.cardAdapterLabel,
        posMode: resolved.posMode,
        posModeLabel: resolved.posModeLabel,
        storeProcessor: resolved.storeProcessor,
        adapters: listPublicAdapters(),
        driverScript: resolved.driverScript,
        customDriverUrl: resolved.customDriverUrl,
        integrated: resolved.integrated,
        serverCharge: resolved.serverCharge,
        configured: resolved.configured,
        configurationNote: resolved.configurationNote,
        compliance: resolved.compliance,
        envOverride: resolved.envOverride
    };
}

module.exports = {
    POS_CARD_ADAPTERS,
    DEFAULT_ADAPTER_ID,
    SETTING_KEY,
    CUSTOM_SCRIPT_KEY,
    normalizeAdapterId,
    normalizePosMode,
    adapterConfigured,
    loadPosPaymentConfig,
    resolveEffectivePaymentAdapter,
    listPublicAdapters
};

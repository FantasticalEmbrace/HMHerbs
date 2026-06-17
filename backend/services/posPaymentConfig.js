'use strict';

const { loadStorePaymentProcessor, posProcessorConfigured } = require('./storePaymentProcessor');

/** Semi-integrated Durango on A3700 — the only POS card payment mode. */
const SEMI_INTEGRATED_ADAPTER = Object.freeze({
    id: 'nmi_durango',
    label: 'Durango / NMI (semi-integrated terminal)',
    description:
        'Total is sent to the A3700; the register completes the sale when the terminal approves. Card data never enters the POS.',
    integrated: true,
    pciScope: 'SAQ B / P2PE — certified terminal handles card data',
    driverScript: 'js/payment-drivers/nmi-durango.js',
    serverCharge: true
});

const SETTING_KEY = 'pos_card_payment_adapter';

function adapterConfigured() {
    return posProcessorConfigured('nmi_durango');
}

function listPublicAdapters() {
    return [
        {
            id: SEMI_INTEGRATED_ADAPTER.id,
            label: SEMI_INTEGRATED_ADAPTER.label,
            description: SEMI_INTEGRATED_ADAPTER.description,
            integrated: true,
            pciScope: SEMI_INTEGRATED_ADAPTER.pciScope,
            driverScript: SEMI_INTEGRATED_ADAPTER.driverScript,
            serverCharge: true,
            requiresEnv: ['POS_NMI_PRIVATE_API_KEY', 'POS_NMI_PUBLIC_TOKENIZATION_KEY']
        }
    ];
}

/**
 * Resolve POS payment — always semi-integrated Durango terminal.
 * @param {import('mysql2/promise').Pool|null} _pool
 */
async function resolveEffectivePaymentAdapter(_pool) {
    const storeProcessor = _pool ? await loadStorePaymentProcessor(_pool) : 'epi';
    const configured = adapterConfigured();

    return {
        posMode: 'integrated',
        posModeLabel: 'Semi-integrated Durango terminal',
        cardAdapter: SEMI_INTEGRATED_ADAPTER.id,
        cardAdapterLabel: SEMI_INTEGRATED_ADAPTER.label,
        storeProcessor,
        posProcessor: 'nmi_durango',
        driverScript: SEMI_INTEGRATED_ADAPTER.driverScript,
        customDriverUrl: '',
        integrated: true,
        serverCharge: true,
        configured,
        configurationNote: configured
            ? null
            : 'Add POS_NMI_PUBLIC_TOKENIZATION_KEY and POS_NMI_PRIVATE_API_KEY to backend .env, then set the A3700 POI device ID in admin.',
        compliance: {
            cardDataInApp: false,
            useExternalTerminalForCards: false,
            pciScope: SEMI_INTEGRATED_ADAPTER.pciScope
        },
        envOverride: false
    };
}

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
        customDriverUrl: '',
        integrated: true,
        serverCharge: true,
        configured: resolved.configured,
        configurationNote: resolved.configurationNote,
        compliance: resolved.compliance,
        envOverride: false
    };
}

/** @deprecated Legacy ids map to semi-integrated Durango. */
function normalizeAdapterId() {
    return SEMI_INTEGRATED_ADAPTER.id;
}

/** @deprecated Legacy modes map to integrated semi-integrated. */
function normalizePosMode() {
    return 'integrated';
}

module.exports = {
    POS_CARD_ADAPTERS: { nmi_durango: SEMI_INTEGRATED_ADAPTER },
    DEFAULT_ADAPTER_ID: SEMI_INTEGRATED_ADAPTER.id,
    SETTING_KEY,
    normalizeAdapterId,
    normalizePosMode,
    adapterConfigured,
    loadPosPaymentConfig,
    resolveEffectivePaymentAdapter,
    listPublicAdapters
};

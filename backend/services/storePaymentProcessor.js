'use strict';

const {
    getEpiPublicTokenizationKey,
    getEpiPrivateApiKey,
    getNmiPublicTokenizationKey,
    getNmiPrivateApiKey,
    getPosNmiPublicTokenizationKey,
    getPosNmiPrivateApiKey,
    getNmiCollectJsUrl,
    getPosNmiCollectJsUrl,
    getNmiTransactUrl,
    getPosNmiTransactUrl,
    isNmiSandboxHint,
    isPosNmiSandboxHint
} = require('../utils/nmiEnv');

const DEFAULT_PROCESSOR = 'epi';
const SETTING_KEY = 'store_card_payment_processor';
const POS_SETTING_KEY = 'pos_card_payment_processor';

const STORE_PROCESSORS = Object.freeze({
    epi: {
        id: 'epi',
        label: 'EPI',
        description: 'Standard card processing for most products (default).',
        highRisk: false
    },
    nmi_durango: {
        id: 'nmi_durango',
        label: 'Durango / NMI',
        description: 'High-risk or restricted products only.',
        highRisk: true
    }
});

function normalizeStoreProcessor(raw) {
    const id = String(raw || '').trim().toLowerCase();
    return STORE_PROCESSORS[id] ? id : DEFAULT_PROCESSOR;
}

async function readSetting(pool, key) {
    const [rows] = await pool.execute('SELECT value FROM settings WHERE key_name = ? LIMIT 1', [key]);
    return rows[0]?.value != null ? String(rows[0].value).trim() : '';
}

async function loadStorePaymentProcessor(pool) {
    if (pool) {
        try {
            const db = await readSetting(pool, SETTING_KEY);
            if (db) return normalizeStoreProcessor(db);
        } catch {
            /* use default */
        }
    }
    return DEFAULT_PROCESSOR;
}

/** Processor for in-store POS card charges (may differ from website). */
async function loadPosPaymentProcessor(pool) {
    if (pool) {
        try {
            const posRaw = await readSetting(pool, POS_SETTING_KEY);
            const posId = String(posRaw || 'inherit').trim().toLowerCase();
            if (posId && posId !== 'inherit') {
                return normalizeStoreProcessor(posId);
            }
        } catch {
            /* fall through */
        }
    }
    return loadStorePaymentProcessor(pool);
}

function processorConfigured(processorId) {
    const creds = resolveProcessorCredentials(processorId);
    return Boolean(creds.publicKey && creds.privateKey);
}

function posProcessorConfigured(processorId) {
    const id = normalizeStoreProcessor(processorId);
    if (id === 'nmi_durango') {
        const creds = resolvePosProcessorCredentials('nmi_durango');
        return Boolean(creds.publicKey && creds.privateKey);
    }
    return processorConfigured(id);
}

/**
 * Resolve Collect.js + Direct Post keys for the active store processor.
 * EPI falls back to NMI env names when EPI_* keys are not set (legacy deployments).
 */
function resolveProcessorCredentials(processorId) {
    const processor = normalizeStoreProcessor(processorId);
    const meta = STORE_PROCESSORS[processor];

    if (processor === 'nmi_durango') {
        return {
            processor,
            label: meta.label,
            publicKey: getNmiPublicTokenizationKey(),
            privateKey: getNmiPrivateApiKey(),
            collectJsUrl: getNmiCollectJsUrl(),
            transactUrl: getNmiTransactUrl(),
            sandbox: isNmiSandboxHint(),
            accountScope: 'website'
        };
    }

    const epiPublic = getEpiPublicTokenizationKey();
    const epiPrivate = getEpiPrivateApiKey();
    const publicKey = epiPublic || getNmiPublicTokenizationKey();
    const privateKey = epiPrivate || getNmiPrivateApiKey();

    return {
        processor,
        label: meta.label,
        publicKey,
        privateKey,
        collectJsUrl: getNmiCollectJsUrl(),
        transactUrl: getNmiTransactUrl(),
        sandbox: isNmiSandboxHint(),
        accountScope: 'website'
    };
}

/**
 * Durango/NMI credentials for in-store POS (terminal + customer display).
 * Uses POS_NMI_* env vars — separate merchant account from website NMI_* keys.
 */
function resolvePosProcessorCredentials(processorId) {
    const processor = normalizeStoreProcessor(processorId);

    if (processor === 'nmi_durango') {
        return {
            processor,
            label: 'Durango / NMI (in-store)',
            publicKey: getPosNmiPublicTokenizationKey(),
            privateKey: getPosNmiPrivateApiKey(),
            collectJsUrl: getPosNmiCollectJsUrl(),
            transactUrl: getPosNmiTransactUrl(),
            sandbox: isPosNmiSandboxHint(),
            accountScope: 'pos'
        };
    }

    const epiPublic = getEpiPublicTokenizationKey();
    const epiPrivate = getEpiPrivateApiKey();
    const meta = STORE_PROCESSORS[processor];

    return {
        processor,
        label: meta?.label || processor,
        publicKey: epiPublic || getNmiPublicTokenizationKey(),
        privateKey: epiPrivate || getNmiPrivateApiKey(),
        collectJsUrl: getNmiCollectJsUrl(),
        transactUrl: getNmiTransactUrl(),
        sandbox: isNmiSandboxHint(),
        accountScope: 'pos'
    };
}

function listStoreProcessors() {
    return Object.values(STORE_PROCESSORS).map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        highRisk: p.highRisk
    }));
}

module.exports = {
    DEFAULT_PROCESSOR,
    SETTING_KEY,
    POS_SETTING_KEY,
    STORE_PROCESSORS,
    normalizeStoreProcessor,
    loadStorePaymentProcessor,
    loadPosPaymentProcessor,
    resolveProcessorCredentials,
    resolvePosProcessorCredentials,
    processorConfigured,
    posProcessorConfigured,
    listStoreProcessors
};

'use strict';

const {
    getEpiPublicTokenizationKey,
    getEpiPrivateApiKey,
    getNmiPublicTokenizationKey,
    getNmiPrivateApiKey,
    getNmiCollectJsUrl,
    isNmiSandboxHint
} = require('../utils/nmiEnv');

const DEFAULT_PROCESSOR = 'epi';
const SETTING_KEY = 'store_card_payment_processor';

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

function processorConfigured(processorId) {
    const creds = resolveProcessorCredentials(processorId);
    return Boolean(creds.publicKey && creds.privateKey);
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
            sandbox: isNmiSandboxHint()
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
        sandbox: isNmiSandboxHint()
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
    STORE_PROCESSORS,
    normalizeStoreProcessor,
    loadStorePaymentProcessor,
    resolveProcessorCredentials,
    processorConfigured,
    listStoreProcessors
};

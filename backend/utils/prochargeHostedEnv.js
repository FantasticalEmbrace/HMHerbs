'use strict';

const { isProchargeSandbox } = require('./prochargeEnv');

function truthyEnv(name, defaultValue) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return defaultValue;
    }
    const v = String(raw).trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function getProchargeHostedTokenizerHost() {
    const explicit = String(process.env.PROCHARGE_HOSTED_TOKENIZER_HOST || '').trim();
    if (explicit) return explicit.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    const site = String(process.env.PROCHARGE_CARDPOINTE_SITE || '').trim();
    if (site) return site.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    return '';
}

function getProchargeHostedTokenizerPath() {
    const path = String(process.env.PROCHARGE_HOSTED_TOKENIZER_PATH || '/itoke/ajax-tokenizer.html').trim();
    if (!path.startsWith('/')) return `/${path}`;
    return path;
}

function getProchargeHostedTokenizerUrlOverride() {
    return String(process.env.PROCHARGE_HOSTED_TOKENIZER_URL || '').trim();
}

function defaultHostedTokenizerHost() {
    return isProchargeSandbox() ? 'fts-uat.cardconnect.com' : 'fts.cardconnect.com';
}

function isProchargeHostedTokenizerConfigured() {
    return Boolean(getProchargeHostedTokenizerHost() || getProchargeHostedTokenizerUrlOverride());
}

function isProchargeRequireHostedFields() {
    if (process.env.PROCHARGE_REQUIRE_HOSTED_FIELDS !== undefined) {
        return truthyEnv('PROCHARGE_REQUIRE_HOSTED_FIELDS', false);
    }
    return isProchargeHostedTokenizerConfigured();
}

function resolveHostedTokenizerHost() {
    return getProchargeHostedTokenizerHost() || defaultHostedTokenizerHost();
}

function buildHostedTokenizerQuery(mode) {
    const params = new URLSearchParams();
    params.set('tokenizewheninactive', 'true');
    params.set('inactivityto', '2000');
    params.set('invalidinputevent', 'true');

    if (mode === 'ach') {
        params.set('fullmobilekeyboard', 'true');
        params.set('useexpiry', 'false');
        params.set('usecvv', 'false');
    } else {
        params.set('useexpiry', 'true');
        params.set('usecvv', 'true');
    }

    return params.toString();
}

function buildHostedTokenizerUrl(mode = 'card') {
    const override = getProchargeHostedTokenizerUrlOverride();
    const query = buildHostedTokenizerQuery(mode);

    if (override) {
        const sep = override.includes('?') ? '&' : '?';
        return `${override}${sep}${query}`;
    }

    const host = resolveHostedTokenizerHost();
    const path = getProchargeHostedTokenizerPath();
    return `https://${host}${path}?${query}`;
}

function getHostedMessageOrigin() {
    const override = getProchargeHostedTokenizerUrlOverride();
    if (override) {
        try {
            return new URL(override).origin;
        } catch {
            /* fall through */
        }
    }
    const host = resolveHostedTokenizerHost();
    return `https://${host}`;
}

function getHostedFieldsClientConfig() {
    const enabled = isProchargeHostedTokenizerConfigured();
    const required = isProchargeRequireHostedFields();
    const messageOrigin = getHostedMessageOrigin();

    return {
        enabled,
        required,
        ready: enabled,
        cardTokenizerUrl: enabled ? buildHostedTokenizerUrl('card') : '',
        achTokenizerUrl: enabled ? buildHostedTokenizerUrl('ach') : '',
        messageOrigin,
        achHint:
            'Enter routing and account numbers in one field, separated by a slash (e.g. 123456789/987654321).'
    };
}

module.exports = {
    getProchargeHostedTokenizerHost,
    getProchargeHostedTokenizerPath,
    getProchargeHostedTokenizerUrlOverride,
    isProchargeHostedTokenizerConfigured,
    isProchargeRequireHostedFields,
    buildHostedTokenizerUrl,
    getHostedMessageOrigin,
    getHostedFieldsClientConfig
};

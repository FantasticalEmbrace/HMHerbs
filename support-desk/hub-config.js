'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_HUB = 'http://127.0.0.1:3001';

function normalizeHubUrl(raw) {
    const trimmed = String(raw || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

function readTextFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8').trim();
        }
    } catch {
        /* ignore */
    }
    return '';
}

/**
 * Hub URL resolution order:
 * 1. BUSINESS_ONE_HUB_URL environment variable
 * 2. hub-url.txt next to the executable (portable) or in install folder
 * 3. userData/hub-url.txt (saved from in-app settings)
 * 4. default local dev URL
 */
function resolveHubUrl({ execDir, userDataDir }) {
    const fromEnv = normalizeHubUrl(process.env.BUSINESS_ONE_HUB_URL);
    if (fromEnv) return fromEnv;

    const besideExe = readTextFile(path.join(execDir, 'hub-url.txt'));
    if (besideExe) return normalizeHubUrl(besideExe);

    const inUserData = readTextFile(path.join(userDataDir, 'hub-url.txt'));
    if (inUserData) return normalizeHubUrl(inUserData);

    return normalizeHubUrl(DEFAULT_HUB);
}

function deskPageUrl(hubOrigin) {
    const base = normalizeHubUrl(hubOrigin);
    return `${base}/support-desk`;
}

function saveUserHubUrl(userDataDir, hubOrigin) {
    const base = normalizeHubUrl(hubOrigin);
    if (!base) return;
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(path.join(userDataDir, 'hub-url.txt'), `${base}\n`, 'utf8');
}

module.exports = {
    DEFAULT_HUB,
    normalizeHubUrl,
    resolveHubUrl,
    deskPageUrl,
    saveUserHubUrl
};

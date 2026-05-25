'use strict';

const logger = require('../utils/logger');
const CustomerOctoposSyncService = require('./customer-octopos-sync');

function credentialsOk() {
    const url = process.env.OCTOPOS_API_URL && String(process.env.OCTOPOS_API_URL).trim();
    const tok = process.env.OCTOPOS_TOKEN && String(process.env.OCTOPOS_TOKEN).trim();
    return !!(url && tok);
}

/** Minimum 60s between runs (override via ms env only if >= 60000). */
function parseIntervalMs() {
    const raw = process.env.OCTOPOS_AUTO_SYNC_INTERVAL_MS;
    if (raw != null && String(raw).trim() !== '') {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 60000) return Math.floor(n);
    }
    const mins = process.env.OCTOPOS_AUTO_SYNC_INTERVAL_MINUTES;
    if (mins != null && String(mins).trim() !== '') {
        const m = Number(mins);
        if (Number.isFinite(m) && m >= 1) return Math.floor(m * 60 * 1000);
    }
    return 15 * 60 * 1000;
}

/**
 * Periodically runs the same reward-card sync as POST /api/admin/customers/sync/octopos/all
 * (updates points, links cards, optional POS→web user creation when OCTOPOS_SYNC_POS_TO_WEB=true).
 *
 * Env:
 * - OCTOPOS_AUTO_SYNC_ENABLED=true
 * - OCTOPOS_API_URL, OCTOPOS_TOKEN
 * - OCTOPOS_AUTO_SYNC_INTERVAL_MINUTES (default 15) or OCTOPOS_AUTO_SYNC_INTERVAL_MS (>= 60000)
 *
 * @param {import('mysql2/promise').Pool} pool
 * @returns {function} stop() to clear the interval
 */
function startOctoposAutoSync(pool) {
    if (process.env.OCTOPOS_AUTO_SYNC_ENABLED !== 'true') {
        return () => {};
    }
    if (!credentialsOk()) {
        logger.warn('[octopos] OCTOPOS_AUTO_SYNC_ENABLED but OCTOPOS_API_URL / OCTOPOS_TOKEN missing; scheduler not started');
        return () => {};
    }

    const ms = parseIntervalMs();
    let running = false;
    const syncSvc = new CustomerOctoposSyncService(pool);

    const tick = async () => {
        if (running) {
            logger.warn('[octopos] Auto sync skipped (previous run still in progress)');
            return;
        }
        running = true;
        try {
            const result = await syncSvc.syncAllRewardCards({});
            if (result.success) {
                logger.info('[octopos] Auto sync finished', result.stats || {});
            } else {
                logger.warn('[octopos] Auto sync failed', result.error || {});
            }
        } catch (e) {
            logger.error('[octopos] Auto sync error', { message: e.message });
        } finally {
            running = false;
        }
    };

    logger.info(`[octopos] Auto sync enabled: every ${Math.round(ms / 60000)} min (${ms} ms)`);
    const id = setInterval(tick, ms);
    const bootDelay = Math.min(30000, Math.max(5000, Math.floor(ms / 10)));
    setTimeout(tick, bootDelay);

    return () => clearInterval(id);
}

module.exports = { startOctoposAutoSync, parseIntervalMs };

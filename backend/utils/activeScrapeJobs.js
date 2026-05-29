'use strict';

/** Tracks the single in-flight HM Herbs scrape (SSE) so admin can cancel it. */
let activeJob = null;

function registerScraper(scraper, res) {
    activeJob = { scraper, res, cancelled: false, startedAt: Date.now() };
    return activeJob;
}

function cancelActive(reason = 'Cancelled by user') {
    if (activeJob) {
        activeJob.cancelled = true;
        if (activeJob.scraper && typeof activeJob.scraper.cancel === 'function') {
            activeJob.scraper.cancel(reason);
        }
        return true;
    }
    if (global.__hmHerbsActiveScraper && typeof global.__hmHerbsActiveScraper.cancel === 'function') {
        global.__hmHerbsActiveScraper.cancel(reason);
        return true;
    }
    return false;
}

function clearActive() {
    activeJob = null;
}

function getActive() {
    return activeJob;
}

module.exports = {
    registerScraper,
    cancelActive,
    clearActive,
    getActive,
};

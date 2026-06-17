'use strict';

const logger = require('../utils/logger');
const { processMerchantBillingMaintenance } = require('./posMerchantLicense');

function isEnabled() {
    return String(process.env.POS_BILLING_SCHEDULER_ENABLED || '').trim().toLowerCase() === 'true';
}

function shouldRunNow(date) {
    const hour = Number(process.env.POS_BILLING_HOUR ?? 6);
    const minute = Number(process.env.POS_BILLING_MINUTE ?? 0);
    return date.getHours() === hour && date.getMinutes() === minute;
}

function startPosBillingScheduler(pool) {
    if (!isEnabled()) {
        logger.info('[pos-billing] Scheduler disabled (set POS_BILLING_SCHEDULER_ENABLED=true to enable)');
        return () => {};
    }

    let running = false;
    let lastRunKey = '';

    const tick = async () => {
        const now = new Date();
        const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
        if (!shouldRunNow(now)) return;
        if (lastRunKey === key) return;
        if (running) return;

        running = true;
        try {
            const result = await processMerchantBillingMaintenance(pool);
            lastRunKey = key;
            logger.info('[pos-billing] Daily maintenance complete', result);
        } catch (error) {
            logger.error('[pos-billing] Daily maintenance failed', { message: error.message });
        } finally {
            running = false;
        }
    };

    logger.info('[pos-billing] Scheduler enabled (daily maintenance at configured hour)');
    const intervalId = setInterval(tick, 60 * 1000);
    return () => clearInterval(intervalId);
}

module.exports = { startPosBillingScheduler };

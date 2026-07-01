'use strict';

const { calculateFailoverOverage, FAILOVER_INCLUDED_GB, FAILOVER_OVERAGE_PER_GB } = require('./posBillingPricing');

const BYTES_PER_GB = 1024 ** 3;

function currentPeriodMonth(date = new Date()) {
    return date.toISOString().slice(0, 7);
}

function bytesToGb(bytes) {
    return Math.round((Math.max(0, Number(bytes) || 0) / BYTES_PER_GB) * 100) / 100;
}

async function getPeriodBytes(pool, periodMonth = currentPeriodMonth()) {
    const [rows] = await pool.execute(
        `SELECT bytes_used FROM pos_failover_usage_period WHERE period_month = ? LIMIT 1`,
        [periodMonth]
    );
    return Number(rows[0]?.bytes_used) || 0;
}

async function getMeteredFailoverGb(pool, periodMonth = currentPeriodMonth()) {
    return bytesToGb(await getPeriodBytes(pool, periodMonth));
}

async function recordFailoverUsage(pool, { bytesDelta, bytesTotal, source = 'register' } = {}) {
    const periodMonth = currentPeriodMonth();
    const delta = Math.max(0, Math.floor(Number(bytesDelta) || 0));
    const total = bytesTotal != null ? Math.max(0, Math.floor(Number(bytesTotal))) : null;

    if (total == null && delta <= 0) {
        return { periodMonth, bytesUsed: await getPeriodBytes(pool, periodMonth), gbUsed: await getMeteredFailoverGb(pool, periodMonth) };
    }

    if (total != null) {
        await pool.execute(
            `INSERT INTO pos_failover_usage_period (period_month, bytes_used, last_source, last_reported_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                bytes_used = GREATEST(bytes_used, VALUES(bytes_used)),
                last_source = VALUES(last_source),
                last_reported_at = CURRENT_TIMESTAMP`,
            [periodMonth, total, String(source).slice(0, 32)]
        );
    } else {
        await pool.execute(
            `INSERT INTO pos_failover_usage_period (period_month, bytes_used, last_source, last_reported_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                bytes_used = bytes_used + VALUES(bytes_used),
                last_source = VALUES(last_source),
                last_reported_at = CURRENT_TIMESTAMP`,
            [periodMonth, delta, String(source).slice(0, 32)]
        );
    }

    const bytesUsed = await getPeriodBytes(pool, periodMonth);
    const gbUsed = bytesToGb(bytesUsed);

    try {
        const { ensureDefaultAccount } = require('./platformBillingAccount');
        const account = await ensureDefaultAccount(pool);
        await syncFailoverToBilling(pool, account.id, periodMonth, { gbUsed, bytesUsed });
    } catch {
        /* platform billing optional during migration */
    }

    await pool.execute(`UPDATE pos_merchant_license SET failover_gb_used = ? WHERE id = 1`, [gbUsed]);

    return { periodMonth, bytesUsed, gbUsed };
}

async function syncFailoverToBilling(pool, accountId, periodMonth = currentPeriodMonth(), precomputed) {
    const gbUsed = precomputed?.gbUsed ?? (await getMeteredFailoverGb(pool, periodMonth));
    const overage = calculateFailoverOverage(gbUsed);

    await pool.execute(
        `DELETE FROM billing_usage_lines
         WHERE account_id = ? AND period_month = ? AND usage_type = 'failover_overage' AND billed_charge_id IS NULL`,
        [accountId, periodMonth]
    );

    if (overage > 0) {
        const label = `Failover data over ${FAILOVER_INCLUDED_GB} GB (${gbUsed.toFixed(1)} GB used @ $${FAILOVER_OVERAGE_PER_GB}/GB)`;
        await pool.execute(
            `INSERT INTO billing_usage_lines (account_id, period_month, usage_type, quantity, amount, label)
             VALUES (?, ?, 'failover_overage', ?, ?, ?)`,
            [accountId, periodMonth, gbUsed, overage, label]
        );
    }

    await pool.execute(`UPDATE pos_merchant_license SET failover_gb_used = ? WHERE id = 1`, [gbUsed]);

    return { gbUsed, overage };
}

async function refreshFailoverBillingForAccount(pool, accountId, periodMonth = currentPeriodMonth()) {
    return syncFailoverToBilling(pool, accountId, periodMonth);
}

async function resetFailoverPeriodAfterBilling(pool, periodMonth = currentPeriodMonth()) {
    await pool.execute(`DELETE FROM pos_failover_usage_period WHERE period_month = ?`, [periodMonth]);
    await pool.execute(`UPDATE pos_merchant_license SET failover_gb_used = 0 WHERE id = 1`);
}

module.exports = {
    currentPeriodMonth,
    bytesToGb,
    getPeriodBytes,
    getMeteredFailoverGb,
    recordFailoverUsage,
    syncFailoverToBilling,
    refreshFailoverBillingForAccount,
    resetFailoverPeriodAfterBilling
};

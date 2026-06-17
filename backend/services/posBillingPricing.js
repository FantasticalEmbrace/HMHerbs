'use strict';

const BASE_MONTHLY = 100;
const MID_TIER_STATIONS = 5;
const MID_TIER_RATE = 50;
const VOLUME_RATE = 25;

/**
 * Monthly Business One POS fee from active station count.
 * 1 station: $100 | 2–5: +$50 each | 6+: +$25 each
 */
function calculateMonthlyAmount(stationCount) {
    const n = Math.max(1, Math.floor(Number(stationCount) || 1));
    if (n <= 1) return BASE_MONTHLY;
    if (n <= MID_TIER_STATIONS) return BASE_MONTHLY + (n - 1) * MID_TIER_RATE;
    const midTotal = BASE_MONTHLY + (MID_TIER_STATIONS - 1) * MID_TIER_RATE;
    return midTotal + (n - MID_TIER_STATIONS) * VOLUME_RATE;
}

function describeMonthlyPricing(stationCount) {
    const n = Math.max(1, Math.floor(Number(stationCount) || 1));
    const amount = calculateMonthlyAmount(n);
    const parts = [`$${BASE_MONTHLY} base (1 station)`];
    if (n > 1) {
        const mid = Math.min(n, MID_TIER_STATIONS) - 1;
        if (mid > 0) parts.push(`${mid} × $${MID_TIER_RATE} (stations 2–5)`);
    }
    if (n > MID_TIER_STATIONS) {
        parts.push(`${n - MID_TIER_STATIONS} × $${VOLUME_RATE} (station 6+)`);
    }
    return {
        stationCount: n,
        monthlyAmount: amount,
        summary: parts.join(' + '),
        formatted: `$${amount.toFixed(2)}/mo`
    };
}

module.exports = {
    BASE_MONTHLY,
    MID_TIER_STATIONS,
    MID_TIER_RATE,
    VOLUME_RATE,
    calculateMonthlyAmount,
    describeMonthlyPricing
};

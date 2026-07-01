'use strict';

const { computeMilestoneAmounts, describeBuildMilestones } = require('../services/websiteBuildBilling');

describe('websiteBuildBilling', () => {
    test('milestone amounts sum to build total', () => {
        const amounts = computeMilestoneAmounts(10000);
        const sum = amounts.reduce((s, m) => s + m.amount, 0);
        expect(sum).toBe(10000);
    });

    test('deposit is 25% of basic tier', () => {
        const info = describeBuildMilestones('basic');
        expect(info.depositAmount).toBe(375);
        expect(info.buildAmount).toBe(1500);
    });
});

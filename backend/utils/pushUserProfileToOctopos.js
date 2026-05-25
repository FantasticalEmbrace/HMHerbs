'use strict';

const OctoposService = require('../services/octopos');
const {
    octoposCredentialsConfigured,
    phoneToOctoposNumber,
    dobToBirthParts,
} = require('./createOctoposRewardCardForWebUser');

function profilePushEnabled() {
    if (process.env.OCTOPOS_SYNC_PROFILE_TO_POS === 'false') return false;
    return octoposCredentialsConfigured();
}

/**
 * After a web profile save, push name/email/phone/DOB to the linked Octopos reward card (best-effort).
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} userId
 * @param {{ warn?: Function }} [log]
 */
async function pushUserProfileToOctopos(pool, userId, log = console) {
    if (!profilePushEnabled()) return { skipped: true };

    let cardId = null;
    try {
        const [[row]] = await pool.execute(
            'SELECT octopos_reward_card_id FROM customer_loyalty WHERE user_id = ? LIMIT 1',
            [userId]
        );
        cardId =
            row && row.octopos_reward_card_id != null && String(row.octopos_reward_card_id).trim() !== ''
                ? String(row.octopos_reward_card_id).trim()
                : null;
    } catch (e) {
        return { skipped: true };
    }
    if (!cardId) return { skipped: true, reason: 'no_card' };

    const [[u]] = await pool.execute(
        'SELECT email, first_name, last_name, phone, date_of_birth FROM users WHERE id = ?',
        [userId]
    );
    if (!u) return { skipped: true };

    const { birth_month, birth_year } = dobToBirthParts(u.date_of_birth);
    const phoneNum = phoneToOctoposNumber(u.phone);

    const body = {
        first_name: String(u.first_name || '').slice(0, 255),
        last_name: String(u.last_name || '').slice(0, 255),
        email: String(u.email || '').trim().toLowerCase().slice(0, 191),
    };
    if (phoneNum != null) body.phone = phoneNum;
    if (birth_month) body.birth_month = birth_month;
    if (birth_year) body.birth_year = birth_year;

    const svc = new OctoposService(process.env.OCTOPOS_API_URL, process.env.OCTOPOS_TOKEN);
    const res = await svc.updateRewardCard(cardId, body);
    if (!res.success) {
        log.warn?.('[octopos] updateRewardCard after profile save failed', { userId, err: res.error });
        return { success: false, error: res.error };
    }
    try {
        await pool.execute('UPDATE users SET octopos_synced_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
    } catch (e) {
        if (e.errno !== 1054) throw e;
    }
    return { success: true };
}

module.exports = { pushUserProfileToOctopos, profilePushEnabled };

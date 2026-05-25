'use strict';

const OctoposService = require('../services/octopos');

function octoposCredentialsConfigured() {
    const url = process.env.OCTOPOS_API_URL && String(process.env.OCTOPOS_API_URL).trim();
    const tok = process.env.OCTOPOS_TOKEN && String(process.env.OCTOPOS_TOKEN).trim();
    return !!(url && tok);
}

function syncWebToPosEnabled() {
    if (process.env.OCTOPOS_SYNC_WEB_TO_POS === 'false') return false;
    return octoposCredentialsConfigured();
}

function phoneToOctoposNumber(phone) {
    if (phone == null || String(phone).trim() === '') return undefined;
    const d = String(phone).replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) return Number(d.slice(1));
    if (d.length === 10) return Number(d);
    return undefined;
}

function dobToBirthParts(isoDateStr) {
    if (!isoDateStr || String(isoDateStr).length < 7) return { birth_month: undefined, birth_year: undefined };
    const m = String(isoDateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return { birth_month: undefined, birth_year: undefined };
    return { birth_month: Number(m[2]), birth_year: Number(m[1]) };
}

/**
 * After web registration, create the Octopos reward card (in-store customer record) when API credentials exist.
 * Safe to run in the background; failures are logged only.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ id: number, email: string, first_name: string, last_name: string, phone?: string|null, date_of_birth?: string|null }} userRow
 * @param {{ warn?: Function, error?: Function }} [log]
 */
async function createOctoposRewardCardForWebUser(pool, userRow, log = console) {
    if (!syncWebToPosEnabled()) return { skipped: true };

    const uid = userRow.id;
    if (!uid) return { skipped: true };

    try {
        const [[loy]] = await pool.execute(
            'SELECT octopos_reward_card_id FROM customer_loyalty WHERE user_id = ? LIMIT 1',
            [uid]
        );
        if (loy && loy.octopos_reward_card_id) return { skipped: true, reason: 'already_linked' };
    } catch (e) {
        log.warn?.('[octopos] loyalty lookup skipped', e.message);
    }

    const svc = new OctoposService(process.env.OCTOPOS_API_URL, process.env.OCTOPOS_TOKEN);
    const { birth_month, birth_year } = dobToBirthParts(userRow.date_of_birth);
    const phoneNum = phoneToOctoposNumber(userRow.phone);

    const body = {
        first_name: String(userRow.first_name || '').slice(0, 255),
        last_name: String(userRow.last_name || '').slice(0, 255),
        email: String(userRow.email || '').trim().toLowerCase().slice(0, 191),
        active: true,
        email_validated: false,
        email_subscription: false,
        sms_subscription: false,
        notes: 'Created from HM Herbs website registration',
    };
    if (phoneNum != null) body.phone = phoneNum;
    if (birth_month) body.birth_month = birth_month;
    if (birth_year) body.birth_year = birth_year;

    const res = await svc.createRewardCard(body);
    if (!res.success) {
        log.warn?.('[octopos] createRewardCard failed for new web user', { userId: uid, err: res.error });
        return { success: false, error: res.error };
    }

    const raw = res.data;
    const card = raw && typeof raw === 'object' ? raw.data || raw : null;
    const cardId = card && card.id != null ? String(card.id) : null;
    if (!cardId) {
        log.warn?.('[octopos] createRewardCard missing id', { userId: uid });
        return { success: false, error: 'missing_card_id' };
    }

    const cardNumber = card.card_number || card.number || card.code || null;
    const points = Number(card.points_balance ?? card.points ?? card.balance ?? 0) || 0;

    try {
        await pool.execute(
            `INSERT INTO customer_loyalty (user_id, points_balance, octopos_reward_card_id, octopos_reward_card_number, last_synced_at, sync_status)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'synced')
             ON DUPLICATE KEY UPDATE
                points_balance = VALUES(points_balance),
                octopos_reward_card_id = COALESCE(VALUES(octopos_reward_card_id), octopos_reward_card_id),
                octopos_reward_card_number = COALESCE(VALUES(octopos_reward_card_number), octopos_reward_card_number),
                last_synced_at = CURRENT_TIMESTAMP,
                sync_status = 'synced',
                sync_error = NULL`,
            [uid, points, cardId, cardNumber]
        );
    } catch (e) {
        log.warn?.('[octopos] loyalty upsert after createRewardCard', e.message);
    }

    try {
        await pool.execute(
            `UPDATE users SET octopos_customer_id = COALESCE(?, octopos_customer_id), octopos_synced_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [String(card.customer_id || (card.customer && card.customer.id) || cardId), uid]
        );
    } catch (e) {
        if (e.errno !== 1054) throw e;
    }

    return { success: true, octopos_reward_card_id: cardId };
}

module.exports = {
    createOctoposRewardCardForWebUser,
    syncWebToPosEnabled,
    octoposCredentialsConfigured,
    phoneToOctoposNumber,
    dobToBirthParts,
};

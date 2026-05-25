// Customer ↔ Octopos sync service.
// Syncs loyalty (reward card) data from Octopos into our website's
// `customer_loyalty` table for a given user, and provides bulk sync helpers.
//
// Octopos exposes loyalty as "reward_cards" (per-customer) and "rewards"
// (catalogue of redeemable items). Reward cards carry a points balance and
// (optionally) customer contact data we can match to local users.

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const OctoposService = require('./octopos');
const logger = require('../utils/logger');
const { provisionWebCustomerProfile } = require('../utils/provisionCustomerProfile');

class CustomerOctoposSyncService {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Build an authenticated OctoposService instance using request headers
     * (X-Octopos-BaseUrl / X-Octopos-Token) or env fallbacks.
     */
    buildClient({ baseUrl, token } = {}) {
        const svc = new OctoposService(
            baseUrl || process.env.OCTOPOS_API_URL || '',
            token   || process.env.OCTOPOS_TOKEN || ''
        );
        return svc;
    }

    /**
     * Opt-in: set `OCTOPOS_SYNC_POS_TO_WEB=true` with API credentials so unmatched POS reward cards
     * with an email create a web `users` row (random password; see admin_notes).
     */
    _syncPosToWebEnabled() {
        if (process.env.OCTOPOS_SYNC_POS_TO_WEB !== 'true') return false;
        const url = process.env.OCTOPOS_API_URL && String(process.env.OCTOPOS_API_URL).trim();
        const tok = process.env.OCTOPOS_TOKEN && String(process.env.OCTOPOS_TOKEN).trim();
        return !!(url && tok);
    }

    /**
     * Create a website account from an Octopos reward card when the card has a usable email
     * and no matching user exists. Password is random; customer must use password reset (when available) or admin.
     * @returns {Promise<number|null>} new user id or null
     */
    async _tryProvisionWebUserFromPosRewardCard(card) {
        if (!this._syncPosToWebEnabled()) return null;

        const email = String(card.customer?.email || card.email || '')
            .trim()
            .toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

        const [existing] = await this.pool.execute(
            'SELECT id FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1',
            [email]
        );
        if (existing.length) return existing[0].id;

        const firstName = String(card.customer?.first_name || card.first_name || 'In-store').slice(0, 100);
        const lastName = String(card.customer?.last_name || card.last_name || 'Customer').slice(0, 100);

        let phone = card.customer?.phone ?? card.phone;
        if (phone != null && typeof phone === 'number') phone = String(phone);
        if (phone) phone = String(phone).replace(/\D/g, '').slice(0, 20) || null;
        else phone = null;

        let dob = null;
        const bm = card.birth_month ?? card.customer?.birth_month;
        const by = card.birth_year ?? card.customer?.birth_year;
        if (bm && by && bm >= 1 && bm <= 12) {
            dob = `${by}-${String(bm).padStart(2, '0')}-01`;
        }

        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

        try {
            const [ins] = await this.pool.execute(
                'INSERT INTO users (email, password_hash, first_name, last_name, phone, date_of_birth) VALUES (?, ?, ?, ?, ?, ?)',
                [email, passwordHash, firstName, lastName, phone, dob]
            );
            const uid = ins.insertId;
            await provisionWebCustomerProfile(this.pool, uid, logger);
            try {
                await this.pool.execute(
                    `UPDATE users SET admin_notes = CONCAT(COALESCE(admin_notes,''), ?) WHERE id = ?`,
                    [
                        '\n[Octopos] Web account created from in-store reward card. Set a password via storefront reset (when enabled) or admin.',
                        uid,
                    ]
                );
            } catch (e) {
                if (e.errno !== 1054) logger.warn('[octopos] admin_notes update skipped', e.message);
            }
            logger.info('[octopos] Created web user from POS reward card', { userId: uid, email });
            return uid;
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                const [r2] = await this.pool.execute(
                    'SELECT id FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1',
                    [email]
                );
                return r2[0]?.id || null;
            }
            logger.error('Octopos POS→web user create failed', { error: e.message, email });
            return null;
        }
    }

    /**
     * Pull a single reward card by Octopos id and update the local user.
     * @param {number} userId
     * @param {string|number} rewardCardId
     */
    async syncRewardCardForUser(userId, rewardCardId, octoposCtx = {}) {
        const svc = this.buildClient(octoposCtx);
        const res = await svc.getRewardCardById(rewardCardId);
        if (!res.success) {
            await this._markLoyaltyError(userId, res.error?.message || 'Octopos request failed');
            return { success: false, error: res.error };
        }
        const card = res.data || {};
        await this._upsertLoyaltyFromCard(userId, card);
        return { success: true, card };
    }

    /**
     * Sync ALL reward cards from Octopos and try to match them to website users.
     * Matching priority: reward_card_number on customer_loyalty -> email -> phone.
     * Unmatched cards are stored in `octopos_customers_cache` for admin review.
     */
    async syncAllRewardCards(octoposCtx = {}) {
        const svc = this.buildClient(octoposCtx);
        const res = await svc.getRewardCards({ limit: 1000 });
        if (!res.success) {
            return { success: false, error: res.error };
        }

        const cards = Array.isArray(res.data)
            ? res.data
            : (res.data?.reward_cards || res.data?.data || []);

        let matched = 0;
        let cached = 0;
        let errors = 0;
        let created_web_users = 0;

        for (const card of cards) {
            try {
                let userId = await this._findUserForRewardCard(card);
                if (!userId) {
                    const newId = await this._tryProvisionWebUserFromPosRewardCard(card);
                    if (newId) {
                        userId = newId;
                        created_web_users++;
                    }
                }
                if (userId) {
                    await this._upsertLoyaltyFromCard(userId, card);
                    matched++;
                } else {
                    await this._upsertOctoposCache(card);
                    cached++;
                }
            } catch (err) {
                logger.error('Reward card sync failed', { error: err.message, card_id: card?.id });
                errors++;
            }
        }

        return {
            success: true,
            stats: {
                total: cards.length,
                matched,
                cached_for_review: cached,
                errors,
                created_web_users,
            }
        };
    }

    /**
     * Adjust a user's loyalty balance locally and (best-effort) reflect that
     * adjustment in Octopos via reward card update.
     */
    async adjustPoints(userId, pointsChange, { description, adminUserId, source = 'manual', orderId = null, metadata = null } = {}) {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();

            const [[loyalty]] = await conn.query(
                'SELECT * FROM customer_loyalty WHERE user_id = ? FOR UPDATE',
                [userId]
            );
            if (!loyalty) {
                await conn.query(
                    'INSERT INTO customer_loyalty (user_id, points_balance) VALUES (?, 0)',
                    [userId]
                );
            }

            const [[fresh]] = await conn.query(
                'SELECT * FROM customer_loyalty WHERE user_id = ?',
                [userId]
            );

            const newBalance = Math.max(0, (fresh.points_balance || 0) + pointsChange);
            const earnedDelta = pointsChange > 0 ? pointsChange : 0;
            const redeemedDelta = pointsChange < 0 ? Math.abs(pointsChange) : 0;

            await conn.query(
                `UPDATE customer_loyalty
                    SET points_balance = ?,
                        lifetime_points_earned = lifetime_points_earned + ?,
                        lifetime_points_redeemed = lifetime_points_redeemed + ?,
                        last_earned_at = CASE WHEN ? > 0 THEN CURRENT_TIMESTAMP ELSE last_earned_at END,
                        last_redeemed_at = CASE WHEN ? > 0 THEN CURRENT_TIMESTAMP ELSE last_redeemed_at END
                  WHERE user_id = ?`,
                [newBalance, earnedDelta, redeemedDelta, earnedDelta, redeemedDelta, userId]
            );

            const txType = pointsChange >= 0 ? 'earn' : 'redeem';
            await conn.query(
                `INSERT INTO loyalty_transactions
                    (user_id, transaction_type, points_change, points_balance_after,
                     source, order_id, description, admin_user_id, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    source === 'manual' ? 'adjust' : txType,
                    pointsChange,
                    newBalance,
                    source,
                    orderId,
                    description || null,
                    adminUserId || null,
                    metadata ? JSON.stringify(metadata) : null,
                ]
            );

            await conn.commit();
            return { success: true, newBalance };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // ---------- internal helpers ----------

    async _findUserForRewardCard(card) {
        const cardNumber = card.card_number || card.number || card.code;
        const email = card.customer?.email || card.email;
        const phone = card.customer?.phone || card.phone;

        if (cardNumber) {
            const [rows] = await this.pool.execute(
                'SELECT user_id FROM customer_loyalty WHERE octopos_reward_card_number = ? LIMIT 1',
                [cardNumber]
            );
            if (rows.length) return rows[0].user_id;
        }
        if (email) {
            const [rows] = await this.pool.execute(
                'SELECT id FROM users WHERE email = ? LIMIT 1',
                [String(email).toLowerCase()]
            );
            if (rows.length) return rows[0].id;
        }
        if (phone) {
            const [rows] = await this.pool.execute(
                'SELECT id FROM users WHERE phone = ? LIMIT 1',
                [phone]
            );
            if (rows.length) return rows[0].id;
        }
        return null;
    }

    async _upsertLoyaltyFromCard(userId, card) {
        const points = Number(card.points_balance ?? card.points ?? card.balance ?? 0) || 0;
        const tier = card.tier || card.tier_name || null;
        const cardNumber = card.card_number || card.number || card.code || null;

        await this.pool.execute(
            `INSERT INTO customer_loyalty
                (user_id, points_balance, tier, octopos_reward_card_id,
                 octopos_reward_card_number, last_synced_at, sync_status)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'synced')
             ON DUPLICATE KEY UPDATE
                points_balance = VALUES(points_balance),
                tier = COALESCE(VALUES(tier), tier),
                octopos_reward_card_id = COALESCE(VALUES(octopos_reward_card_id), octopos_reward_card_id),
                octopos_reward_card_number = COALESCE(VALUES(octopos_reward_card_number), octopos_reward_card_number),
                last_synced_at = CURRENT_TIMESTAMP,
                sync_status = 'synced',
                sync_error = NULL`,
            [userId, points, tier, card.id || null, cardNumber]
        );

        await this.pool.execute(
            `UPDATE users
                SET octopos_customer_id = COALESCE(?, octopos_customer_id),
                    octopos_synced_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [card.customer_id || card.customer?.id || null, userId]
        );
    }

    async _upsertOctoposCache(card) {
        await this.pool.execute(
            `INSERT INTO octopos_customers_cache
                (octopos_customer_id, octopos_reward_card_number, first_name, last_name,
                 email, phone, points_balance, tier, raw, last_synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                octopos_reward_card_number = VALUES(octopos_reward_card_number),
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                email = VALUES(email),
                phone = VALUES(phone),
                points_balance = VALUES(points_balance),
                tier = VALUES(tier),
                raw = VALUES(raw),
                last_synced_at = CURRENT_TIMESTAMP`,
            [
                String(card.customer_id || card.customer?.id || card.id),
                card.card_number || card.number || card.code || null,
                card.customer?.first_name || card.first_name || null,
                card.customer?.last_name || card.last_name || null,
                card.customer?.email || card.email || null,
                card.customer?.phone || card.phone || null,
                Number(card.points_balance ?? card.points ?? 0) || 0,
                card.tier || null,
                JSON.stringify(card),
            ]
        );
    }

    async _markLoyaltyError(userId, message) {
        await this.pool.execute(
            `UPDATE customer_loyalty
                SET sync_status = 'error', sync_error = ?, last_synced_at = CURRENT_TIMESTAMP
              WHERE user_id = ?`,
            [String(message || '').slice(0, 1000), userId]
        );
    }
}

module.exports = CustomerOctoposSyncService;

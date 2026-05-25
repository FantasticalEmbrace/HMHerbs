// Admin customer management routes.
// Mounted under /api/admin/customers in server.js.
//
// Provides full CRUD for the website's customer database, including:
//   - Search, filter, paginate
//   - Full customer profile (addresses, orders, loyalty, gift cards, notes)
//   - Loyalty point adjustments
//   - Per-customer Octopos sync
//   - Bulk Octopos reward-card sync
//   - Customer notes / tags / status

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { jsonSafeDeep } = require('../utils/jsonSafeMysql');
const CustomerOctoposSyncService = require('../services/customer-octopos-sync');

const router = express.Router();

// ---------------------------------------------------------------------------
// Local re-implementation of admin auth so this router works standalone.
// (Mirrors the pattern in routes/admin.js so we don't introduce a new shape.)
// ---------------------------------------------------------------------------
async function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Admin access token required' });
    if (!process.env.JWT_SECRET) {
        logger.error('JWT_SECRET missing');
        return res.status(500).json({ error: 'Server configuration error' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await req.pool.execute(
            'SELECT id, email, first_name, last_name, role, is_active FROM admin_users WHERE id = ? AND is_active = 1',
            [decoded.adminId]
        );
        if (!rows.length) return res.status(401).json({ error: 'Invalid admin token' });
        req.admin = rows[0];
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid admin token' });
    }
}

router.use(authenticateAdmin);

function octoposCtx(req) {
    return {
        baseUrl: req.headers['x-octopos-baseurl'] || null,
        token:   req.headers['x-octopos-token']   || null,
    };
}

// ---------------------------------------------------------------------------
// LIST customers (paginated, with search & filters)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
        const offset = (page - 1) * limit;

        const { search, status, type, has_loyalty, marketing_opt_in, sort } = req.query;

        const where = ['u.is_active <> 0'];
        const params = [];

        if (search) {
            where.push(`(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR u.customer_number LIKE ?)`);
            const like = `%${search}%`;
            params.push(like, like, like, like, like);
        }
        if (status)            { where.push('u.customer_status = ?'); params.push(status); }
        if (type)              { where.push('u.customer_type = ?');   params.push(type); }
        if (marketing_opt_in === 'true')  where.push('u.marketing_email_opt_in = 1');
        if (marketing_opt_in === 'false') where.push('u.marketing_email_opt_in = 0');
        if (has_loyalty === 'true')  where.push('cl.points_balance > 0');
        if (has_loyalty === 'false') where.push('(cl.points_balance IS NULL OR cl.points_balance = 0)');

        const sortOptions = {
            recent:        'u.created_at DESC',
            oldest:        'u.created_at ASC',
            spent_desc:    'u.lifetime_value DESC',
            spent_asc:     'u.lifetime_value ASC',
            orders_desc:   'u.total_orders DESC',
            last_order:    'u.last_order_at DESC',
            name_asc:      'u.last_name ASC, u.first_name ASC',
        };
        const orderBy = sortOptions[sort] || 'u.created_at DESC';

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        // Embed LIMIT/OFFSET as validated integers — mysql2 prepared statements often throw
        // ER_WRONG_ARGUMENTS (1210) with LIMIT ? OFFSET ? placeholders (see routes/admin.js).
        const limitSql = String(Math.min(200, Math.max(1, parseInt(String(limit), 10) || 1)));
        const offsetSql = String(Math.max(0, parseInt(String(offset), 10) || 0));

        const [rows] = await req.pool.query(
            `SELECT
                u.id, u.customer_number, u.email, u.first_name, u.last_name,
                u.phone, u.customer_status, u.customer_type, u.tags,
                u.lifetime_value, u.total_orders, u.last_order_at, u.avg_order_value,
                u.marketing_email_opt_in, u.marketing_sms_opt_in,
                u.octopos_customer_id, u.octopos_synced_at,
                u.created_at, u.last_login,
                cl.points_balance, cl.tier, cl.last_synced_at AS loyalty_synced_at,
                cl.octopos_reward_card_number,
                (SELECT COUNT(*) FROM gift_cards gc
                  WHERE gc.customer_id = u.id AND gc.status IN ('active','inactive')) AS gift_card_count,
                (SELECT COALESCE(SUM(gc.current_balance),0) FROM gift_cards gc
                  WHERE gc.customer_id = u.id AND gc.status = 'active') AS gift_card_balance
             FROM users u
             LEFT JOIN customer_loyalty cl ON cl.user_id = u.id
             ${whereSql}
             ORDER BY ${orderBy}
             LIMIT ${limitSql} OFFSET ${offsetSql}`,
            params
        );

        // Use query(), not execute(): same mysql2/MySQL builds throw ER_WRONG_ARGUMENTS (1210)
        // on some prepared statements even for simple COUNTs.
        const countSql =
            `SELECT COUNT(*) AS total
               FROM users u
               LEFT JOIN customer_loyalty cl ON cl.user_id = u.id
               ${whereSql}`;
        const [countRows] = await req.pool.query(countSql, params);
        const total = Number(countRows[0].total);

        res.json(
            jsonSafeDeep({
                customers: rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            })
        );
    } catch (err) {
        logger.error('List customers error', { error: err.message, code: err.code, errno: err.errno });

        // Graceful fallback (always attempt) for environments with partial schema drift.
        try {
            const page = Math.max(1, parseInt(req.query.page || '1', 10));
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
            const offset = (page - 1) * limit;
            const search = String(req.query.search || '').trim();

            const where = ['is_active <> 0'];
            const params = [];
            if (search) {
                where.push('(email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?)');
                const like = `%${search}%`;
                params.push(like, like, like, like);
            }
            const whereSql = `WHERE ${where.join(' AND ')}`;

            const fbLimit = String(Math.min(200, Math.max(1, parseInt(String(limit), 10) || 1)));
            const fbOffset = String(Math.max(0, parseInt(String(offset), 10) || 0));

            const [rows] = await req.pool.query(
                `SELECT
                    id, email, first_name, last_name, phone, created_at, last_login,
                    'active' AS customer_status,
                    'retail' AS customer_type,
                    0 AS lifetime_value,
                    0 AS total_orders,
                    NULL AS last_order_at,
                    0 AS avg_order_value,
                    0 AS marketing_email_opt_in,
                    0 AS marketing_sms_opt_in,
                    NULL AS octopos_customer_id,
                    NULL AS octopos_synced_at,
                    0 AS points_balance,
                    NULL AS tier,
                    NULL AS loyalty_synced_at,
                    NULL AS octopos_reward_card_number,
                    0 AS gift_card_count,
                    0 AS gift_card_balance
                 FROM users
                 ${whereSql}
                 ORDER BY created_at DESC
                 LIMIT ${fbLimit} OFFSET ${fbOffset}`,
                params
            );

            const [countRows] = await req.pool.query(
                `SELECT COUNT(*) AS total FROM users ${whereSql}`,
                params
            );
            const total = Number(countRows[0].total);

            return res.json(
                jsonSafeDeep({
                    customers: rows,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                    },
                    schema_warning: 'Using compatibility mode: advanced customer fields unavailable.',
                })
            );
        } catch (fallbackErr) {
            logger.error('List customers fallback error', { error: fallbackErr.message, code: fallbackErr.code });
        }

        res.status(500).json({ error: 'Failed to load customers' });
    }
});

// ---------------------------------------------------------------------------
// CUSTOMER STATISTICS (for top-of-page tiles)
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
    try {
        const [[totals]] = await req.pool.execute(
            `SELECT
                COUNT(*) AS total_customers,
                SUM(CASE WHEN customer_status = 'active' THEN 1 ELSE 0 END) AS active_customers,
                SUM(CASE WHEN customer_status = 'vip'    THEN 1 ELSE 0 END) AS vip_customers,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS new_30_days,
                SUM(CASE WHEN marketing_email_opt_in = 1 THEN 1 ELSE 0 END) AS email_subscribers,
                COALESCE(AVG(lifetime_value), 0) AS avg_lifetime_value,
                COALESCE(SUM(lifetime_value), 0) AS total_lifetime_value
              FROM users
              WHERE is_active <> 0`
        );

        const [[loyalty]] = await req.pool.execute(
            `SELECT
                COUNT(*) AS loyalty_members,
                COALESCE(SUM(points_balance), 0) AS total_points_outstanding,
                SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) AS synced_with_pos
              FROM customer_loyalty`
        );

        const [[gc]] = await req.pool.execute(
            `SELECT
                COUNT(*) AS total_gift_cards,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_gift_cards,
                COALESCE(SUM(CASE WHEN status = 'active' THEN current_balance ELSE 0 END), 0) AS total_outstanding_balance
              FROM gift_cards`
        );

        res.json({ ...totals, ...loyalty, ...gc });
    } catch (err) {
        logger.error('Customer stats error', { error: err.message, code: err.code });

        try {
            const [[totals]] = await req.pool.execute(
                `SELECT
                    COUNT(*) AS total_customers,
                    COUNT(*) AS active_customers,
                    0 AS vip_customers,
                    SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS new_30_days,
                    0 AS email_subscribers,
                    0 AS avg_lifetime_value,
                    0 AS total_lifetime_value
                  FROM users
                  WHERE is_active <> 0`
            );

            return res.json({
                ...totals,
                loyalty_members: 0,
                total_points_outstanding: 0,
                synced_with_pos: 0,
                total_gift_cards: 0,
                active_gift_cards: 0,
                total_outstanding_balance: 0,
                schema_warning: 'Using compatibility mode: advanced stats unavailable.',
            });
        } catch (fallbackErr) {
            logger.error('Customer stats fallback error', { error: fallbackErr.message, code: fallbackErr.code });
        }

        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// ---------------------------------------------------------------------------
// GET single customer profile (full)
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ error: 'Invalid customer id' });

        const [[customer]] = await req.pool.execute(
            `SELECT u.*, cl.points_balance, cl.tier, cl.lifetime_points_earned,
                    cl.lifetime_points_redeemed, cl.octopos_reward_card_number,
                    cl.octopos_reward_card_id, cl.last_synced_at AS loyalty_synced_at,
                    cl.sync_status AS loyalty_sync_status
               FROM users u
               LEFT JOIN customer_loyalty cl ON cl.user_id = u.id
              WHERE u.id = ?`,
            [id]
        );
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        delete customer.password_hash;

        const [addresses] = await req.pool.execute(
            'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC',
            [id]
        );

        const [orders] = await req.pool.execute(
            `SELECT id, order_number, status, payment_status, total_amount, created_at
               FROM orders
              WHERE user_id = ?
              ORDER BY created_at DESC
              LIMIT 50`,
            [id]
        );

        const [giftCards] = await req.pool.execute(
            `SELECT id, code, card_type, status, initial_balance, current_balance,
                    issued_at, expires_at, last_used_at, recipient_email
               FROM gift_cards
              WHERE customer_id = ?
              ORDER BY created_at DESC`,
            [id]
        );

        const [loyaltyTx] = await req.pool.execute(
            `SELECT id, transaction_type, points_change, points_balance_after,
                    source, order_id, description, created_at
               FROM loyalty_transactions
              WHERE user_id = ?
              ORDER BY created_at DESC
              LIMIT 50`,
            [id]
        );

        const [notes] = await req.pool.execute(
            `SELECT cn.*, au.first_name AS admin_first_name, au.last_name AS admin_last_name
               FROM customer_notes cn
               LEFT JOIN admin_users au ON au.id = cn.admin_user_id
              WHERE cn.user_id = ?
              ORDER BY cn.is_pinned DESC, cn.created_at DESC`,
            [id]
        );

        const [communications] = await req.pool.execute(
            `SELECT * FROM customer_communications
              WHERE user_id = ?
              ORDER BY created_at DESC
              LIMIT 50`,
            [id]
        );

        res.json({
            customer,
            addresses,
            orders,
            gift_cards: giftCards,
            loyalty_transactions: loyaltyTx,
            notes,
            communications,
        });
    } catch (err) {
        logger.error('Get customer profile error', { error: err.message });
        res.status(500).json({ error: 'Failed to load customer profile' });
    }
});

// ---------------------------------------------------------------------------
// CREATE customer (admin-side, no password required)
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
    const conn = await req.pool.getConnection();
    try {
        const {
            email, first_name, middle_name, last_name, preferred_name,
            phone, date_of_birth, gender,
            customer_status = 'active',
            customer_type = 'retail',
            tags,
            marketing_email_opt_in = false,
            marketing_sms_opt_in = false,
            marketing_postal_opt_in = false,
            preferred_contact = 'email',
            referral_source, referral_code, referred_by_user_id,
            tax_exempt = false, tax_exempt_id,
            admin_notes,
            address,
            password,
        } = req.body || {};

        if (!email || !first_name || !last_name) {
            return res.status(400).json({ error: 'email, first_name and last_name are required' });
        }

        await conn.beginTransaction();

        const [exists] = await conn.execute(
            'SELECT id FROM users WHERE email = ?',
            [String(email).toLowerCase()]
        );
        if (exists.length) {
            await conn.rollback();
            return res.status(409).json({ error: 'A customer with this email already exists' });
        }

        const password_hash = await bcrypt.hash(password || `hmh_${Date.now()}_${Math.random()}`, 10);

        const [result] = await conn.execute(
            `INSERT INTO users (
                email, password_hash, first_name, middle_name, last_name, preferred_name,
                phone, date_of_birth, gender,
                customer_status, customer_type, tags,
                marketing_email_opt_in, marketing_sms_opt_in, marketing_postal_opt_in, preferred_contact,
                referral_source, referral_code, referred_by_user_id,
                tax_exempt, tax_exempt_id, admin_notes
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                String(email).toLowerCase(), password_hash,
                first_name, middle_name || null, last_name, preferred_name || null,
                phone || null, date_of_birth || null, gender || null,
                customer_status, customer_type, tags ? JSON.stringify(tags) : null,
                !!marketing_email_opt_in, !!marketing_sms_opt_in, !!marketing_postal_opt_in, preferred_contact,
                referral_source || null, referral_code || null, referred_by_user_id || null,
                !!tax_exempt, tax_exempt_id || null, admin_notes || null,
            ]
        );

        const userId = result.insertId;

        await conn.execute(
            'UPDATE users SET customer_number = ? WHERE id = ?',
            [`HM-CUST-${String(userId).padStart(6, '0')}`, userId]
        );

        await conn.execute(
            'INSERT INTO customer_loyalty (user_id, member_since) VALUES (?, CURDATE())',
            [userId]
        );

        if (address && address.address_line_1) {
            await conn.execute(
                `INSERT INTO user_addresses
                    (user_id, type, first_name, last_name, company,
                     address_line_1, address_line_2, city, state, postal_code, country, is_default)
                 VALUES (?, 'shipping', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    userId,
                    address.first_name || first_name,
                    address.last_name || last_name,
                    address.company || null,
                    address.address_line_1,
                    address.address_line_2 || null,
                    address.city || '',
                    address.state || '',
                    address.postal_code || '',
                    address.country || 'United States',
                ]
            );
        }

        await conn.commit();
        res.status(201).json({ success: true, id: userId });
    } catch (err) {
        await conn.rollback();
        logger.error('Create customer error', { error: err.message });
        res.status(500).json({ error: 'Failed to create customer' });
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------------
// UPDATE customer
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ error: 'Invalid customer id' });

        const allowed = [
            'email', 'first_name', 'middle_name', 'last_name', 'preferred_name',
            'phone', 'date_of_birth', 'gender',
            'customer_status', 'customer_type',
            'marketing_email_opt_in', 'marketing_sms_opt_in', 'marketing_postal_opt_in',
            'preferred_contact', 'referral_source', 'referral_code', 'referred_by_user_id',
            'tax_exempt', 'tax_exempt_id', 'admin_notes',
        ];
        const fields = [];
        const params = [];
        for (const key of allowed) {
            if (key in req.body) {
                fields.push(`${key} = ?`);
                params.push(req.body[key]);
            }
        }
        if ('tags' in req.body) {
            fields.push('tags = ?');
            params.push(req.body.tags ? JSON.stringify(req.body.tags) : null);
        }
        if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

        params.push(id);
        await req.pool.execute(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            params
        );
        res.json({ success: true });
    } catch (err) {
        logger.error('Update customer error', { error: err.message });
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

// ---------------------------------------------------------------------------
// SOFT DELETE (deactivate) customer
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await req.pool.execute(
            "UPDATE users SET is_active = 0, customer_status = 'inactive' WHERE id = ?",
            [id]
        );
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete customer error', { error: err.message });
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

// ---------------------------------------------------------------------------
// ADDRESSES (list/create/update/delete on a customer)
// ---------------------------------------------------------------------------
router.post('/:id/addresses', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const a = req.body || {};
        if (!a.address_line_1) return res.status(400).json({ error: 'address_line_1 is required' });

        if (a.is_default) {
            await req.pool.execute(
                'UPDATE user_addresses SET is_default = 0 WHERE user_id = ? AND type = ?',
                [id, a.type || 'shipping']
            );
        }
        const [r] = await req.pool.execute(
            `INSERT INTO user_addresses
                (user_id, type, first_name, last_name, company,
                 address_line_1, address_line_2, city, state, postal_code, country, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, a.type || 'shipping', a.first_name || '', a.last_name || '', a.company || null,
                a.address_line_1, a.address_line_2 || null,
                a.city || '', a.state || '', a.postal_code || '',
                a.country || 'United States', !!a.is_default
            ]
        );
        res.status(201).json({ success: true, id: r.insertId });
    } catch (err) {
        logger.error('Add address error', { error: err.message });
        res.status(500).json({ error: 'Failed to add address' });
    }
});

router.put('/:id/addresses/:addressId', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const addressId = parseInt(req.params.addressId, 10);
        const a = req.body || {};
        const fields = [];
        const params = [];
        const allowed = ['type','first_name','last_name','company','address_line_1','address_line_2','city','state','postal_code','country','is_default'];
        for (const k of allowed) if (k in a) { fields.push(`${k} = ?`); params.push(a[k]); }
        if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
        params.push(addressId, id);
        await req.pool.execute(
            `UPDATE user_addresses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
            params
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update address' });
    }
});

router.delete('/:id/addresses/:addressId', async (req, res) => {
    try {
        await req.pool.execute(
            'DELETE FROM user_addresses WHERE id = ? AND user_id = ?',
            [parseInt(req.params.addressId, 10), parseInt(req.params.id, 10)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete address' });
    }
});

// ---------------------------------------------------------------------------
// NOTES
// ---------------------------------------------------------------------------
router.post('/:id/notes', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { content, note_type = 'general', is_pinned = false } = req.body || {};
        if (!content) return res.status(400).json({ error: 'content is required' });
        const [r] = await req.pool.execute(
            'INSERT INTO customer_notes (user_id, admin_user_id, note_type, content, is_pinned) VALUES (?, ?, ?, ?, ?)',
            [id, req.admin.id, note_type, content, !!is_pinned]
        );
        res.status(201).json({ success: true, id: r.insertId });
    } catch (err) {
        logger.error('Add note error', { error: err.message });
        res.status(500).json({ error: 'Failed to add note' });
    }
});

router.delete('/:id/notes/:noteId', async (req, res) => {
    try {
        await req.pool.execute(
            'DELETE FROM customer_notes WHERE id = ? AND user_id = ?',
            [parseInt(req.params.noteId, 10), parseInt(req.params.id, 10)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

// ---------------------------------------------------------------------------
// LOYALTY POINTS - manual adjust
// ---------------------------------------------------------------------------
router.post('/:id/loyalty/adjust', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { points_change, description } = req.body || {};
        const change = parseInt(points_change, 10);
        if (!change || isNaN(change)) return res.status(400).json({ error: 'points_change must be a non-zero integer' });

        const sync = new CustomerOctoposSyncService(req.pool);
        const result = await sync.adjustPoints(id, change, {
            description,
            adminUserId: req.admin.id,
            source: 'manual',
        });
        res.json({ success: true, new_balance: result.newBalance });
    } catch (err) {
        logger.error('Adjust loyalty error', { error: err.message });
        res.status(500).json({ error: 'Failed to adjust loyalty points' });
    }
});

// ---------------------------------------------------------------------------
// LOYALTY - sync from Octopos
// ---------------------------------------------------------------------------
router.post('/:id/loyalty/sync', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [[loyalty]] = await req.pool.execute(
            'SELECT octopos_reward_card_id, octopos_reward_card_number FROM customer_loyalty WHERE user_id = ?',
            [id]
        );
        if (!loyalty?.octopos_reward_card_id) {
            return res.status(400).json({ error: 'No Octopos reward card linked to this customer' });
        }
        const sync = new CustomerOctoposSyncService(req.pool);
        const result = await sync.syncRewardCardForUser(id, loyalty.octopos_reward_card_id, octoposCtx(req));
        res.json(result);
    } catch (err) {
        logger.error('Sync customer loyalty error', { error: err.message });
        res.status(500).json({ error: 'Failed to sync from Octopos' });
    }
});

// Link an Octopos reward card to a customer
router.post('/:id/loyalty/link', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { octopos_reward_card_id, octopos_reward_card_number } = req.body || {};
        if (!octopos_reward_card_id && !octopos_reward_card_number) {
            return res.status(400).json({ error: 'Provide octopos_reward_card_id or octopos_reward_card_number' });
        }
        await req.pool.execute(
            `INSERT INTO customer_loyalty (user_id, octopos_reward_card_id, octopos_reward_card_number, sync_status)
             VALUES (?, ?, ?, 'pending')
             ON DUPLICATE KEY UPDATE
                octopos_reward_card_id = COALESCE(VALUES(octopos_reward_card_id), octopos_reward_card_id),
                octopos_reward_card_number = COALESCE(VALUES(octopos_reward_card_number), octopos_reward_card_number),
                sync_status = 'pending'`,
            [id, octopos_reward_card_id || null, octopos_reward_card_number || null]
        );

        if (octopos_reward_card_id) {
            const sync = new CustomerOctoposSyncService(req.pool);
            await sync.syncRewardCardForUser(id, octopos_reward_card_id, octoposCtx(req));
        }

        res.json({ success: true });
    } catch (err) {
        logger.error('Link reward card error', { error: err.message });
        res.status(500).json({ error: 'Failed to link reward card' });
    }
});

// Unlink Octopos reward card
router.delete('/:id/loyalty/link', async (req, res) => {
    try {
        await req.pool.execute(
            `UPDATE customer_loyalty
                SET octopos_reward_card_id = NULL, octopos_reward_card_number = NULL,
                    sync_status = 'never', sync_error = NULL
              WHERE user_id = ?`,
            [parseInt(req.params.id, 10)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to unlink' });
    }
});

// ---------------------------------------------------------------------------
// BULK Octopos sync (all reward cards)
// ---------------------------------------------------------------------------
router.post('/sync/octopos/all', async (req, res) => {
    try {
        const sync = new CustomerOctoposSyncService(req.pool);
        const result = await sync.syncAllRewardCards(octoposCtx(req));
        res.json(result);
    } catch (err) {
        logger.error('Bulk octopos sync error', { error: err.message });
        res.status(500).json({ error: 'Bulk sync failed' });
    }
});

// Unmatched POS customers awaiting linkage
router.get('/sync/octopos/unmatched', async (req, res) => {
    try {
        const [rows] = await req.pool.execute(
            `SELECT * FROM octopos_customers_cache
              WHERE web_user_id IS NULL
              ORDER BY last_synced_at DESC
              LIMIT 500`
        );
        res.json({ customers: rows });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load unmatched POS customers' });
    }
});

// Link a cached POS customer to an existing user
router.post('/sync/octopos/link', async (req, res) => {
    try {
        const { user_id, octopos_customer_id } = req.body || {};
        if (!user_id || !octopos_customer_id) {
            return res.status(400).json({ error: 'user_id and octopos_customer_id required' });
        }
        const [[cached]] = await req.pool.execute(
            'SELECT * FROM octopos_customers_cache WHERE octopos_customer_id = ?',
            [octopos_customer_id]
        );
        if (!cached) return res.status(404).json({ error: 'Cached POS customer not found' });

        await req.pool.execute(
            'UPDATE users SET octopos_customer_id = ?, octopos_synced_at = CURRENT_TIMESTAMP WHERE id = ?',
            [octopos_customer_id, user_id]
        );
        await req.pool.execute(
            `INSERT INTO customer_loyalty (user_id, points_balance, tier, octopos_reward_card_number, sync_status, last_synced_at)
             VALUES (?, ?, ?, ?, 'synced', CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                points_balance = VALUES(points_balance),
                tier = COALESCE(VALUES(tier), tier),
                octopos_reward_card_number = COALESCE(VALUES(octopos_reward_card_number), octopos_reward_card_number),
                sync_status = 'synced',
                last_synced_at = CURRENT_TIMESTAMP`,
            [user_id, cached.points_balance || 0, cached.tier, cached.octopos_reward_card_number]
        );
        await req.pool.execute(
            'UPDATE octopos_customers_cache SET web_user_id = ? WHERE octopos_customer_id = ?',
            [user_id, octopos_customer_id]
        );
        res.json({ success: true });
    } catch (err) {
        logger.error('Link cached POS customer error', { error: err.message });
        res.status(500).json({ error: 'Failed to link customer' });
    }
});

module.exports = router;

#!/usr/bin/env node
/**
 * Permanently delete a customer account and associated history.
 * Usage:
 *   node scripts/purge-customer-account.js --email user@example.com --confirm PURGE
 *   node scripts/purge-customer-account.js --email a@x.com --email b@x.com --confirm PURGE
 */

'use strict';

const { loadBackendEnv, createConnection } = require('../utils/dbConfig');

loadBackendEnv();

async function tableExists(conn, tableName) {
    const [rows] = await conn.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
    );
    return Number(rows[0].c) > 0;
}

async function purgeCustomer(conn, email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return { email, status: 'skipped', reason: 'empty email' };

    const [users] = await conn.query(
        `SELECT id, email, first_name, last_name, is_active FROM users WHERE LOWER(TRIM(email)) = ?`,
        [normalized]
    );
    if (!users.length) {
        return { email: normalized, status: 'not_found' };
    }

    const userId = users[0].id;
    const summary = { email: normalized, userId, status: 'purged', deleted: {} };

    await conn.beginTransaction();
    try {
        const [orders] = await conn.query(`SELECT id FROM orders WHERE user_id = ?`, [userId]);
        const orderIds = orders.map((o) => o.id);
        if (orderIds.length) {
            const placeholders = orderIds.map(() => '?').join(',');
            if (await tableExists(conn, 'order_items')) {
                const [r] = await conn.query(
                    `DELETE FROM order_items WHERE order_id IN (${placeholders})`,
                    orderIds
                );
                summary.deleted.order_items = r.affectedRows;
            }
            const [rOrders] = await conn.query(
                `DELETE FROM orders WHERE user_id = ?`,
                [userId]
            );
            summary.deleted.orders = rOrders.affectedRows;
        }

        if (await tableExists(conn, 'edsa_bookings')) {
            const [r] = await conn.query(`DELETE FROM edsa_bookings WHERE user_id = ?`, [userId]);
            summary.deleted.edsa_bookings = r.affectedRows;
        }

        if (await tableExists(conn, 'product_reviews')) {
            const [r] = await conn.query(`DELETE FROM product_reviews WHERE user_id = ?`, [userId]);
            summary.deleted.product_reviews = r.affectedRows;
        }

        if (await tableExists(conn, 'gift_card_transactions')) {
            const [r] = await conn.query(
                `DELETE FROM gift_card_transactions WHERE customer_id = ?`,
                [userId]
            );
            summary.deleted.gift_card_transactions = r.affectedRows;
        }

        if (await tableExists(conn, 'gift_cards')) {
            const [r] = await conn.query(
                `UPDATE gift_cards SET customer_id = NULL, purchaser_user_id = NULL
                 WHERE customer_id = ? OR purchaser_user_id = ?`,
                [userId, userId]
            );
            summary.deleted.gift_cards_unlinked = r.affectedRows;
        }

        await conn.query(`UPDATE users SET referred_by_user_id = NULL WHERE referred_by_user_id = ?`, [
            userId,
        ]);

        const [rUser] = await conn.query(`DELETE FROM users WHERE id = ?`, [userId]);
        summary.deleted.users = rUser.affectedRows;

        await conn.commit();
        return summary;
    } catch (err) {
        await conn.rollback();
        throw err;
    }
}

function parseArgs(argv) {
    const emails = [];
    let confirm = '';
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--email') emails.push(argv[++i]);
        else if (argv[i] === '--confirm') confirm = argv[++i];
    }
    return { emails, confirm };
}

async function main() {
    const { emails, confirm } = parseArgs(process.argv);
    if (!emails.length) {
        console.error('Usage: node scripts/purge-customer-account.js --email user@example.com --confirm PURGE');
        process.exit(1);
    }
    if (confirm !== 'PURGE') {
        console.error('Refusing to run without --confirm PURGE');
        process.exit(1);
    }

    const conn = await createConnection();
    try {
        for (const email of emails) {
            const result = await purgeCustomer(conn, email);
            console.log(JSON.stringify(result, null, 2));
        }
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});

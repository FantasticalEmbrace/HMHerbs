'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const p = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hmherbs',
    });
    const [users] = await p.query(
        `SELECT id, email, first_name, last_name FROM users
         WHERE email LIKE '%rankin%' OR email LIKE '%donald%' OR id IN (2, 12)`
    );
    const [orders] = await p.query(
        `SELECT id, order_number, user_id, email, status, tracking_number, label_created_at
           FROM orders
          WHERE id = 15 OR user_id IN (2, 12)
          ORDER BY id DESC`
    );
    console.log('USERS:', JSON.stringify(users, null, 2));
    console.log('ORDERS:', JSON.stringify(orders, null, 2));
    await p.end();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});

'use strict';

const logger = require('./logger');

async function tableExists(pool, tableName) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
    );
    return Number(rows[0].c) > 0;
}

/**
 * Ensures customer_groups + user_customer_groups tables exist.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureCustomerGroupSchema(pool) {
    if (!(await tableExists(pool, 'users'))) return;

    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS customer_groups (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(100) NOT NULL UNIQUE,
                description TEXT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_customer_groups_slug (slug),
                INDEX idx_customer_groups_active (is_active)
            )
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS user_customer_groups (
                user_id INT NOT NULL,
                customer_group_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, customer_group_id),
                INDEX idx_ucg_group (customer_group_id),
                CONSTRAINT fk_ucg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT fk_ucg_group FOREIGN KEY (customer_group_id) REFERENCES customer_groups(id) ON DELETE CASCADE
            )
        `);
    } catch (err) {
        logger.warn(`[customer-groups] schema ensure skipped — ${logger.formatMysqlError(err)}`);
    }
}

module.exports = { ensureCustomerGroupSchema };

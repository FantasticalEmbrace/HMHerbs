'use strict';

const logger = require('./logger');

async function ensurePosSignupSchema(pool) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pos_signup_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_name VARCHAR(200) NOT NULL,
                contact_name VARCHAR(120) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(40) NULL,
                station_count INT NOT NULL DEFAULT 1,
                message TEXT NULL,
                monthly_quote DECIMAL(10,2) NULL,
                status ENUM('new','contacted','provisioned','declined') NOT NULL DEFAULT 'new',
                signup_ip VARCHAR(64) NULL,
                signup_user_agent VARCHAR(512) NULL,
                signup_referrer VARCHAR(512) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_pos_signup_status (status),
                INDEX idx_pos_signup_email (email),
                INDEX idx_pos_signup_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        logger.info('Database: pos_signup_requests ready');
    } catch (e) {
        logger.warn(`Database: pos_signup_requests — ${logger.formatMysqlError(e)}`);
    }
}

module.exports = { ensurePosSignupSchema };

'use strict';

const logger = require('../utils/logger');
const { sendMail, isSmtpConfigured } = require('../utils/mailTransporter');
const { describeMonthlyPricing } = require('./posBillingPricing');
const { isPlatformBillingConfigured } = require('../utils/platformBillingEnv');
const { normalizeAchSecCode } = require('../utils/platformBillingEnv');
const { getBusinessOneSignupNotifyEmail, getBusinessOneHubPublicUrl } = require('../utils/businessOneHubEnv');

async function ensureSignupTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS business_one_pos_signups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            business_name VARCHAR(200) NOT NULL,
            billing_email VARCHAR(255) NOT NULL,
            contact_name VARCHAR(200) NULL,
            phone VARCHAR(32) NULL,
            licensed_station_count INT NOT NULL DEFAULT 1,
            payment_method_type VARCHAR(16) NOT NULL DEFAULT 'none',
            ach_sec_code VARCHAR(8) NULL,
            epi_customer_vault_id VARCHAR(64) NULL,
            epi_billing_id VARCHAR(64) NULL,
            billing_authorized_at TIMESTAMP NULL,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_bo_signup_status (status),
            INDEX idx_bo_signup_email (billing_email)
        )`);
}

function mapSignupRow(row) {
    if (!row) return null;
    const stations = Math.max(1, Number(row.licensed_station_count) || 1);
    const pricing = describeMonthlyPricing(stations);
    return {
        id: row.id,
        status: row.status,
        businessName: row.business_name,
        billingEmail: row.billing_email,
        contactName: row.contact_name || '',
        phone: row.phone || '',
        licensedStationCount: stations,
        paymentMethodType: row.payment_method_type || 'none',
        hasBillingVault: Boolean(row.epi_customer_vault_id && row.epi_billing_id),
        monthlyFormatted: pricing.formatted,
        createdAt: row.created_at
    };
}

async function createPosSignup(pool, payload) {
    await ensureSignupTable(pool);
    const businessName = String(payload.businessName || '').trim().slice(0, 200);
    const billingEmail = String(payload.billingEmail || '').trim().slice(0, 255);
    const contactName = String(payload.contactName || '').trim().slice(0, 200) || null;
    const phone = String(payload.phone || '').trim().slice(0, 32) || null;
    const stations = Math.max(1, Math.min(99, Math.floor(Number(payload.licensedStationCount) || 1)));

    if (!businessName || !billingEmail) {
        const err = new Error('Business name and billing email are required.');
        err.code = 'VALIDATION';
        throw err;
    }

    const [result] = await pool.execute(
        `INSERT INTO business_one_pos_signups
         (status, business_name, billing_email, contact_name, phone, licensed_station_count)
         VALUES ('pending', ?, ?, ?, ?, ?)`,
        [businessName, billingEmail, contactName, phone, stations]
    );
    return mapSignupRow({
        id: result.insertId,
        status: 'pending',
        business_name: businessName,
        billing_email: billingEmail,
        contact_name: contactName,
        phone,
        licensed_station_count: stations,
        payment_method_type: 'none',
        created_at: new Date()
    });
}

async function saveSignupBillingVault(pool, signupId, payload) {
    const token = String(payload.paymentToken || '').trim();
    if (!token) {
        const err = new Error('payment_token required');
        err.code = 'PAYMENT_TOKEN_REQUIRED';
        throw err;
    }
    if (!isPlatformBillingConfigured()) {
        const err = new Error('Platform billing is not configured on the server.');
        err.code = 'BILLING_NOT_CONFIGURED';
        throw err;
    }

    await ensureSignupTable(pool);
    const isAch = String(payload.paymentMethodType || '').toLowerCase() === 'ach';
    const secCode = isAch ? normalizeAchSecCode(payload.achSecCode) : null;

    const { nmiVaultAddCustomer } = require('./nmiGateway');
    const { getPlatformPrivateApiKey } = require('../utils/platformBillingEnv');
    const vault = await nmiVaultAddCustomer({
        securityKey: getPlatformPrivateApiKey(),
        paymentToken: token,
        paymentType: isAch ? 'ach' : 'card',
        secCode: secCode || undefined
    });
    if (!vault.ok || !vault.customerVaultId || !vault.billingId) {
        const err = new Error(vault.responseText || 'Failed to save payment method');
        err.code = 'VAULT_ADD_FAILED';
        throw err;
    }

    const authNote = isAch
        ? `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ACH authorized (SEC ${secCode})${
              payload.authMeta?.ip ? ` from ${payload.authMeta.ip}` : ''
          }`
        : null;

    await pool.execute(
        `UPDATE business_one_pos_signups SET
            status = 'active',
            payment_method_type = ?,
            ach_sec_code = ?,
            epi_customer_vault_id = ?,
            epi_billing_id = ?,
            billing_authorized_at = CURRENT_TIMESTAMP,
            licensed_station_count = ?,
            business_name = COALESCE(?, business_name),
            billing_email = COALESCE(?, billing_email),
            contact_name = COALESCE(?, contact_name),
            phone = COALESCE(?, phone),
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            isAch ? 'ach' : 'card',
            isAch ? secCode : null,
            vault.customerVaultId,
            vault.billingId,
            Math.max(1, Math.min(99, Math.floor(Number(payload.licensedStationCount) || 1))),
            payload.businessName ? String(payload.businessName).trim().slice(0, 200) : null,
            payload.billingEmail ? String(payload.billingEmail).trim().slice(0, 255) : null,
            payload.contactName ? String(payload.contactName).trim().slice(0, 200) : null,
            payload.phone ? String(payload.phone).trim().slice(0, 32) : null,
            authNote,
            signupId
        ]
    );

    const [rows] = await pool.execute(`SELECT * FROM business_one_pos_signups WHERE id = ? LIMIT 1`, [signupId]);
    return mapSignupRow(rows[0]);
}

async function notifySignupReceived(signup) {
    const hub = getBusinessOneHubPublicUrl() || '';
    const pricing = describeMonthlyPricing(signup.licensedStationCount);
    const notifyTo = getBusinessOneSignupNotifyEmail();

    const isoSummary = [
        `New Business One POS signup #${signup.id}`,
        `Business: ${signup.businessName}`,
        `Billing email: ${signup.billingEmail}`,
        signup.contactName ? `Contact: ${signup.contactName}` : null,
        signup.phone ? `Phone: ${signup.phone}` : null,
        `Stations: ${signup.licensedStationCount}`,
        `Payment: ${signup.paymentMethodType === 'ach' ? 'ACH' : 'Card'} on file`,
        `Monthly: ${pricing.formatted}`,
        hub ? `Hub: ${hub}` : null
    ]
        .filter(Boolean)
        .join('\n');

    logger.info('[business-one] POS signup', {
        id: signup.id,
        business: signup.businessName,
        email: signup.billingEmail
    });

    if (!isSmtpConfigured()) return { sent: false };

    await sendMail({
        to: notifyTo,
        subject: `New POS signup — ${signup.businessName}`,
        text: isoSummary,
        html: isoSummary.replace(/\n/g, '<br>'),
        logTag: 'Business One POS signup (ISO)'
    });

    await sendMail({
        to: signup.billingEmail,
        subject: 'Business One POS — signup received',
        html: `
          <p>Hi${signup.contactName ? ` ${signup.contactName}` : ''},</p>
          <p>Thank you for signing up for <strong>Business One POS</strong> for <strong>${signup.businessName}</strong>.</p>
          <p>We received your billing authorization (${pricing.formatted}). Our team will provision your store and email login details shortly.</p>
          <p>Try the live demo anytime: <a href="${hub}/pos/">${hub}/pos/</a></p>
          <p>— Business One</p>`,
        logTag: 'Business One POS signup (merchant)'
    });

    return { sent: true };
}

async function listSignups(pool, { limit = 50 } = {}) {
    await ensureSignupTable(pool);
    const n = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));
    const [rows] = await pool.execute(
        `SELECT * FROM business_one_pos_signups ORDER BY created_at DESC LIMIT ${n}`
    );
    return rows.map(mapSignupRow);
}

module.exports = {
    ensureSignupTable,
    createPosSignup,
    saveSignupBillingVault,
    notifySignupReceived,
    listSignups,
    mapSignupRow
};

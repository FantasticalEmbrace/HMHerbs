'use strict';

const logger = require('../utils/logger');
const { sendMail, isSmtpConfigured } = require('../utils/mailTransporter');
const { describeMonthlyPricing } = require('./posBillingPricing');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function signupNotifyEmail() {
    return (
        String(process.env.BUSINESS_ONE_SIGNUP_NOTIFY_EMAIL || '').trim() ||
        String(process.env.BUSINESS_ONE_CONTACT_EMAIL || '').trim() ||
        String(process.env.EDSA_NOTIFY_EMAIL || '').trim() ||
        'info@businessonecomprehensive.com'
    );
}

async function createPosSignupRequest(pool, payload, meta = {}) {
    const businessName = String(payload.businessName || payload.business_name || '').trim();
    const contactName = String(payload.contactName || payload.contact_name || '').trim();
    const email = normalizeEmail(payload.email);
    const phone = String(payload.phone || '').trim() || null;
    const stationCount = Math.max(1, Math.min(99, Number(payload.stationCount || payload.station_count) || 1));
    const message = String(payload.message || '').trim() || null;
    const quote = describeMonthlyPricing(stationCount);

    if (!businessName || !contactName || !email) {
        const err = new Error('Business name, contact name, and email are required.');
        err.code = 'VALIDATION';
        throw err;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const err = new Error('Please enter a valid email address.');
        err.code = 'VALIDATION';
        throw err;
    }

    const [result] = await pool.execute(
        `INSERT INTO pos_signup_requests
            (business_name, contact_name, email, phone, station_count, message, monthly_quote,
             signup_ip, signup_user_agent, signup_referrer)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            businessName.slice(0, 200),
            contactName.slice(0, 120),
            email.slice(0, 255),
            phone ? phone.slice(0, 40) : null,
            stationCount,
            message,
            quote.monthlyAmount,
            meta.signup_ip || null,
            meta.signup_user_agent ? String(meta.signup_user_agent).slice(0, 512) : null,
            meta.signup_referrer ? String(meta.signup_referrer).slice(0, 512) : null
        ]
    );

    const record = {
        id: result.insertId,
        businessName,
        contactName,
        email,
        phone,
        stationCount,
        message,
        quote
    };

    await notifyIsoOfSignup(record).catch((e) => {
        logger.warn('[pos-signup] Email notification failed', { err: e.message, id: record.id });
    });

    logger.info('[pos-signup] New request', {
        id: record.id,
        businessName,
        email,
        stationCount
    });

    return record;
}

async function notifyIsoOfSignup(record) {
    const to = signupNotifyEmail();
    const subject = `Business One POS signup — ${record.businessName}`;
    const body = [
        'New Business One POS signup request',
        '',
        `Business: ${record.businessName}`,
        `Contact: ${record.contactName}`,
        `Email: ${record.email}`,
        record.phone ? `Phone: ${record.phone}` : null,
        `Stations: ${record.stationCount}`,
        `Quoted monthly: ${record.quote.formatted}`,
        '',
        record.message ? `Message:\n${record.message}` : null,
        '',
        `Request ID: ${record.id}`
    ]
        .filter(Boolean)
        .join('\n');

    if (!isSmtpConfigured()) {
        logger.info('[pos-signup] SMTP not configured — signup logged only', { to, id: record.id });
        return;
    }

    await sendMail({
        to,
        replyTo: record.email,
        subject,
        text: body
    });
}

module.exports = {
    createPosSignupRequest,
    signupNotifyEmail
};

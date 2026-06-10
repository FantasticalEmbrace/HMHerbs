'use strict';

const logger = require('../utils/logger');
const { getStorefrontPublicBaseUrl } = require('../utils/storefrontUrl');
const { resolveTrackingInfo } = require('../utils/trackingUrl');

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function getMailTransporter() {
    const smtpHost = String(process.env.SMTP_HOST || process.env.EMAIL_HOST || '').trim();
    const smtpUser = String(process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
    const smtpPass = String(process.env.SMTP_PASSWORD || process.env.EMAIL_PASS || '').trim();
    const smtpPort = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587) || 587;
    if (!smtpHost || !smtpUser) return null;
    const nodemailer = require('nodemailer');
    return {
        transporter: nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
        }),
        from: String(process.env.SMTP_FROM || process.env.EMAIL_FROM || smtpUser).trim(),
    };
}

/**
 * Branded shipped notification — sent when carrier first scans the package (Shippo TRANSIT).
 */
async function sendShippedNotificationEmail(pool, orderId) {
    const oid = Number(orderId);
    if (!Number.isFinite(oid) || oid < 1) return;

    const [orders] = await pool.execute(
        `SELECT id, order_number, email, shipping_first_name, tracking_number, tracking_url,
                shipping_carrier, status
           FROM orders WHERE id = ? LIMIT 1`,
        [oid]
    );
    if (!orders.length) return;
    const order = orders[0];
    const st = String(order.status || '').toLowerCase();
    if (!['shipped', 'in_transit', 'delivered'].includes(st)) return;

    const email = String(order.email || '').trim();
    const trackingInfo = resolveTrackingInfo(order);
    const tracking = trackingInfo.tracking_number || '';
    const trackingUrl = trackingInfo.tracking_url || '';
    if (!email || !tracking || !trackingUrl) return;

    const carrier = String(order.shipping_carrier || 'your carrier').trim();
    const first = String(order.shipping_first_name || '').trim() || 'there';
    const orderNumber = String(order.order_number || oid);
    const base = getStorefrontPublicBaseUrl();
    const accountUrl = `${base}/account.html`;

    const html = `
        <div style="font-family:Inter,system-ui,sans-serif;color:#111827;max-width:560px;">
            <h2 style="color:#10b981;margin:0 0 8px;">Your order has shipped!</h2>
            <p>Hello ${escapeHtml(first)},</p>
            <p>Great news — your H&amp;M Herbs order <strong>${escapeHtml(orderNumber)}</strong> is on its way via <strong>${escapeHtml(carrier)}</strong>.</p>
            <p style="margin:16px 0;padding:14px 18px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
                <strong>Tracking:</strong>
                <a href="${escapeHtml(trackingUrl)}" style="color:#10b981;font-weight:600;text-decoration:none;">${escapeHtml(tracking)}</a><br>
                <a href="${escapeHtml(trackingUrl)}" style="display:inline-block;margin-top:10px;padding:10px 18px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Track My Package</a>
            </p>
            <p>You can also view this order anytime in <a href="${escapeHtml(accountUrl)}" style="color:#10b981;">your account</a>.</p>
            <p style="font-size:13px;color:#6b7280;margin-top:20px;">
                Please allow up to 24 hours for the carrier to scan your package and update tracking information.
            </p>
            <p style="margin-top:24px;color:#6b7280;font-size:13px;">Thank you for shopping with H&amp;M Herbs &amp; Vitamins.</p>
        </div>
    `;

    const mail = await getMailTransporter();
    if (!mail) {
        logger.info(`Shipped email (SMTP not configured) order ${orderNumber} → ${email}`, {
            tracking,
            trackingUrl,
        });
        return;
    }

    await mail.transporter.sendMail({
        from: mail.from,
        to: email,
        subject: `Your H&M Herbs order ${orderNumber} has shipped`,
        html,
    });
    logger.info(`Shipped notification sent for order ${orderNumber} → ${email}`);
}

module.exports = { sendShippedNotificationEmail };

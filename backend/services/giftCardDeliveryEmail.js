'use strict';

const logger = require('../utils/logger');
const { getStorefrontPublicBaseUrl } = require('../utils/storefrontUrl');
const { sendMail } = require('../utils/mailTransporter');

function accountSetupUrl(resetToken) {
    const base = getStorefrontPublicBaseUrl();
    return `${base}/reset-password.html?token=${encodeURIComponent(resetToken)}`;
}

async function sendGiftCardRecipientEmail({
    to,
    recipientName,
    senderName,
    personalMessage,
    cardType,
    amount,
    code,
    pin,
    resetToken,
    isNewAccount
}) {
    const first = String(recipientName || '').trim() || 'there';
    const from = String(senderName || '').trim() || 'Someone special';
    const setupUrl = resetToken ? accountSetupUrl(resetToken) : `${getStorefrontPublicBaseUrl()}/account.html`;
    const isDigital = cardType === 'digital';

    const subject = isDigital
        ? `You received a $${amount} H&M Herbs gift card from ${from}`
        : `A $${amount} H&M Herbs gift card is on the way from ${from}`;

    const messageBlock = personalMessage
        ? `<p style="font-style:italic;border-left:3px solid #10b981;padding-left:12px;">${escapeHtml(personalMessage)}</p>`
        : '';

    const codeBlock = isDigital
        ? `<p><strong>Gift card code:</strong> ${escapeHtml(code)}<br>
           <strong>PIN:</strong> ${escapeHtml(pin)}</p>
           <p>Use this code at checkout or sign in to your account to apply it automatically.</p>`
        : `<p>Your physical gift card will be mailed soon. Once it arrives, you can check your balance anytime in your account.</p>`;

    const accountBlock = isNewAccount && resetToken
        ? `<p>We created an account for you so you can track your gift card balance.</p>
           <p><a href="${setupUrl}" style="background:#10b981;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">Set up your account</a></p>
           <p style="word-break:break-all;font-size:13px;">Or copy this link: ${setupUrl}</p>`
        : `<p><a href="${setupUrl}">View your gift cards in your account</a></p>`;

    const html = `
        <h2>You've received a gift!</h2>
        <p>Hello ${escapeHtml(first)},</p>
        <p>${escapeHtml(from)} sent you a <strong>$${Number(amount).toFixed(2)}</strong> H&M Herbs ${isDigital ? 'digital' : 'physical'} gift card.</p>
        ${messageBlock}
        ${codeBlock}
        ${accountBlock}
        <p>Thank you for choosing H&amp;M Herbs &amp; Vitamins.</p>
    `;

    try {
        const result = await sendMail({
            to,
            subject,
            html,
            logTag: 'Gift card recipient email'
        });
        if (!result.sent) {
            logger.info('Gift card recipient email (SMTP not configured):', { to, code: isDigital ? code : '(physical)' });
        }
        return result.sent;
    } catch (err) {
        logger.error('Gift card recipient email failed:', err);
        return false;
    }
}

async function sendGiftCardPurchaserConfirmation({ to, purchaserName, lines }) {
    const first = String(purchaserName || '').trim() || 'there';
    const list = (lines || [])
        .map(
            (l) =>
                `<li>${escapeHtml(l.cardType)} $${Number(l.amount).toFixed(2)}${
                    l.recipientEmail ? ` → ${escapeHtml(l.recipientEmail)}` : ''
                }</li>`
        )
        .join('');

    const html = `
        <h2>Gift card order confirmed</h2>
        <p>Hello ${escapeHtml(first)},</p>
        <p>Thank you for your gift card purchase:</p>
        <ul>${list}</ul>
        <p>Digital cards are delivered by email. Physical cards are prepared for mailing.</p>
    `;

    try {
        await sendMail({
            to,
            subject: 'H&M Herbs — gift card order confirmation',
            html,
            logTag: 'Gift card purchaser email'
        });
    } catch (err) {
        logger.error('Gift card purchaser email failed:', err);
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = { sendGiftCardRecipientEmail, sendGiftCardPurchaserConfirmation };

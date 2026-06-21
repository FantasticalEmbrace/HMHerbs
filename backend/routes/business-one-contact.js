'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { sendMail, isSmtpConfigured } = require('../utils/mailTransporter');

const CONTACT_TO = String(process.env.BUSINESS_ONE_CONTACT_EMAIL || 'info@businessonecomprehensive.com').trim();

router.post('/contact', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim();
        const phone = String(req.body?.phone || '').trim();
        const businessName = String(req.body?.businessName || '').trim();
        const message = String(req.body?.message || '').trim();
        const interests = Array.isArray(req.body?.interests)
            ? req.body.interests.map((v) => String(v).trim()).filter(Boolean)
            : [];

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }

        const summary = [
            `Name: ${name}`,
            `Email: ${email}`,
            phone ? `Phone: ${phone}` : null,
            businessName ? `Business: ${businessName}` : null,
            interests.length ? `Interests: ${interests.join(', ')}` : null,
            '',
            message
        ]
            .filter(Boolean)
            .join('\n');

        logger.info('[business-one] Contact form submission', {
            name,
            email,
            businessName: businessName || null,
            interests
        });

        if (isSmtpConfigured()) {
            await sendMail({
                to: CONTACT_TO,
                replyTo: email,
                subject: `Business One inquiry from ${name}`,
                text: summary,
                html: summary.replace(/\n/g, '<br>'),
                logTag: 'Business One contact form'
            });
        }

        res.json({ success: true });
    } catch (e) {
        logger.error('[business-one] Contact form error', { err: e.message });
        res.status(500).json({ error: 'Could not send your message. Please call us instead.' });
    }
});

module.exports = router;

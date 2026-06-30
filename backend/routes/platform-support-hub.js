'use strict';

const express = require('express');
const { getProviderStatus } = require('../services/socialOAuth');

const router = express.Router();

router.get('/info', (_req, res) => {
    const google = getProviderStatus().google;
    res.json({
        technicianLoginConfigured: Boolean(String(process.env.PLATFORM_SUPPORT_TECH_EMAIL || '').trim()),
        googleLoginConfigured: google.enabled,
        hubTitle: 'Business One Support Desk',
        hubPublicUrl: String(process.env.PLATFORM_SUPPORT_HUB_URL || process.env.STOREFRONT_PUBLIC_URL || '').trim(),
        merchantStoreUrl: String(process.env.STOREFRONT_PUBLIC_URL || '').trim(),
    });
});

router.all('*', (_req, res) => {
    res.status(501).json({ error: 'Support hub API is not fully configured on this node' });
});

module.exports = router;

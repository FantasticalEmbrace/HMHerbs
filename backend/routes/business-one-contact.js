'use strict';

const express = require('express');

const router = express.Router();

router.post('/contact', (_req, res) => {
    res.status(503).json({ error: 'Business One contact intake is not configured on this server' });
});

module.exports = router;

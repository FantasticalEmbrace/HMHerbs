'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateAdmin, requireDeveloperRole } = require('../middleware/adminAuth');
const { createDatabaseBackupStream, getDevToolsStatus } = require('../services/devDatabaseTools');
const { runPendingMigrations } = require('../utils/migrationRunner');
const { buildDbConfig } = require('../utils/dbConfig');

const devAuth = [authenticateAdmin, requireDeveloperRole];

router.get('/status', ...devAuth, async (req, res) => {
    try {
        const status = await getDevToolsStatus(req.pool);
        res.json(status);
    } catch (error) {
        logger.error('Dev tools status error:', error);
        res.status(500).json({ error: error.message || 'Failed to load developer tools status' });
    }
});

router.get('/backup', ...devAuth, async (req, res) => {
    const config = buildDbConfig();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const filename = `hmherbs-backup-${config.database}-${stamp}.sql`;

    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    try {
        const result = await createDatabaseBackupStream(req.pool, (chunk) => {
            res.write(chunk);
        });
        res.setHeader('X-Backup-Method', result.method);
        res.end();
    } catch (error) {
        logger.error('Database backup error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Backup failed' });
        } else {
            res.end(`\n-- Backup failed: ${error.message}\n`);
        }
    }
});

router.post('/run-migrations', ...devAuth, async (req, res) => {
    try {
        const confirm = String(req.body?.confirm || '').trim().toUpperCase();
        if (confirm !== 'RUN MIGRATIONS') {
            return res.status(400).json({
                error: 'Confirmation required. Send { "confirm": "RUN MIGRATIONS" } in the request body.',
            });
        }

        const result = await runPendingMigrations(req.pool);
        res.json({
            message:
                result.ran === 0
                    ? 'No pending migrations — database is up to date.'
                    : `Applied ${result.ran} migration file(s).`,
            ...result,
        });
    } catch (error) {
        logger.error('Run migrations error:', error);
        res.status(500).json({ error: error.message || 'Failed to run migrations' });
    }
});

module.exports = router;

'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { normalizeAdminRole, hasMinAdminRole } = require('../utils/adminRoles');

const router = express.Router();

function slugify(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Admin access token required' });
    if (!process.env.JWT_SECRET) {
        logger.error('JWT_SECRET missing');
        return res.status(500).json({ error: 'Server configuration error' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await req.pool.execute(
            'SELECT id, email, first_name, last_name, role, is_active FROM admin_users WHERE id = ? AND is_active = 1',
            [decoded.adminId]
        );
        if (!rows.length) return res.status(401).json({ error: 'Invalid admin token' });
        req.admin = { ...rows[0], role: normalizeAdminRole(rows[0].role) };
        next();
    } catch {
        return res.status(403).json({ error: 'Invalid admin token' });
    }
}

function requireManager(req, res, next) {
    if (!hasMinAdminRole(req.admin.role, 'manager')) {
        return res.status(403).json({ error: 'Manager access required' });
    }
    next();
}

router.use(authenticateAdmin);

router.get('/', async (req, res) => {
    try {
        const [rows] = await req.pool.execute(`
            SELECT cg.id, cg.name, cg.slug, cg.description, cg.is_active, cg.created_at, cg.updated_at,
                   COUNT(ucg.user_id) AS member_count
              FROM customer_groups cg
              LEFT JOIN user_customer_groups ucg ON ucg.customer_group_id = cg.id
             GROUP BY cg.id
             ORDER BY cg.name ASC
        `);
        res.json(rows);
    } catch (err) {
        logger.error('List customer groups error', { error: err.message });
        res.status(500).json({ error: 'Failed to load customer groups' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [[group]] = await req.pool.execute(
            `SELECT id, name, slug, description, is_active, created_at, updated_at
               FROM customer_groups WHERE id = ?`,
            [id]
        );
        if (!group) return res.status(404).json({ error: 'Customer group not found' });

        const [members] = await req.pool.execute(
            `SELECT u.id, u.email, u.first_name, u.last_name, u.customer_number
               FROM user_customer_groups ucg
               JOIN users u ON u.id = ucg.user_id
              WHERE ucg.customer_group_id = ?
              ORDER BY u.last_name, u.first_name
              LIMIT 500`,
            [id]
        );

        res.json({ ...group, members });
    } catch (err) {
        logger.error('Get customer group error', { error: err.message });
        res.status(500).json({ error: 'Failed to load customer group' });
    }
});

router.post('/', requireManager, async (req, res) => {
    try {
        const { name, description, is_active = true } = req.body || {};
        if (!name || !String(name).trim()) {
            return res.status(400).json({ error: 'Group name is required' });
        }

        const slug = slugify(name);
        const [existing] = await req.pool.execute(
            'SELECT id FROM customer_groups WHERE slug = ?',
            [slug]
        );
        if (existing.length) {
            return res.status(400).json({ error: 'A group with this name already exists' });
        }

        const [result] = await req.pool.execute(
            `INSERT INTO customer_groups (name, slug, description, is_active)
             VALUES (?, ?, ?, ?)`,
            [String(name).trim(), slug, description || null, is_active ? 1 : 0]
        );

        const [[created]] = await req.pool.execute(
            `SELECT id, name, slug, description, is_active, created_at, updated_at
               FROM customer_groups WHERE id = ?`,
            [result.insertId]
        );
        res.status(201).json(created);
    } catch (err) {
        logger.error('Create customer group error', { error: err.message });
        res.status(500).json({ error: 'Failed to create customer group' });
    }
});

router.put('/:id', requireManager, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, description, is_active } = req.body || {};

        const [[existing]] = await req.pool.execute(
            'SELECT id, name, slug FROM customer_groups WHERE id = ?',
            [id]
        );
        if (!existing) return res.status(404).json({ error: 'Customer group not found' });

        const fields = [];
        const params = [];

        if (name !== undefined) {
            const trimmed = String(name).trim();
            if (!trimmed) return res.status(400).json({ error: 'Group name cannot be empty' });
            const slug = slugify(trimmed);
            const [conflict] = await req.pool.execute(
                'SELECT id FROM customer_groups WHERE slug = ? AND id <> ?',
                [slug, id]
            );
            if (conflict.length) {
                return res.status(400).json({ error: 'A group with this name already exists' });
            }
            fields.push('name = ?', 'slug = ?');
            params.push(trimmed, slug);
        }
        if (description !== undefined) {
            fields.push('description = ?');
            params.push(description || null);
        }
        if (is_active !== undefined) {
            fields.push('is_active = ?');
            params.push(is_active ? 1 : 0);
        }
        if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

        params.push(id);
        await req.pool.execute(`UPDATE customer_groups SET ${fields.join(', ')} WHERE id = ?`, params);

        const [[updated]] = await req.pool.execute(
            `SELECT id, name, slug, description, is_active, created_at, updated_at
               FROM customer_groups WHERE id = ?`,
            [id]
        );
        res.json(updated);
    } catch (err) {
        logger.error('Update customer group error', { error: err.message });
        res.status(500).json({ error: 'Failed to update customer group' });
    }
});

router.delete('/:id', requireManager, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [result] = await req.pool.execute('DELETE FROM customer_groups WHERE id = ?', [id]);
        if (!result.affectedRows) {
            return res.status(404).json({ error: 'Customer group not found' });
        }
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete customer group error', { error: err.message });
        res.status(500).json({ error: 'Failed to delete customer group' });
    }
});

module.exports = router;

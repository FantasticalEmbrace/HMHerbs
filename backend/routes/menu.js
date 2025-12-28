// Business One Menu API Routes
// Handles menu item management and API key authentication

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');

// Middleware to validate API key
async function validateApiKey(req, res, next) {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                items: null,
                message: 'API key is required'
            });
        }
        
        const pool = req.pool;
        const [keys] = await pool.execute(
            'SELECT * FROM menu_api_keys WHERE api_key = ? AND is_active = 1',
            [apiKey]
        );
        
        if (keys.length === 0) {
            return res.status(401).json({
                success: false,
                items: null,
                message: 'Invalid API key'
            });
        }
        
        // Update last used timestamp
        await pool.execute(
            'UPDATE menu_api_keys SET last_used_at = NOW() WHERE id = ?',
            [keys[0].id]
        );
        
        req.apiKey = keys[0];
        next();
    } catch (error) {
        logger.error('API key validation error:', error);
        res.status(500).json({
            success: false,
            items: null,
            message: 'Internal server error'
        });
    }
}

// GET /api/menu/items - Get all menu items (requires API key)
router.get('/items', validateApiKey, async (req, res) => {
    try {
        const pool = req.pool;
        const { category } = req.query;
        
        let query = 'SELECT * FROM menu_items WHERE is_active = 1';
        let params = [];
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        query += ' ORDER BY display_order ASC, name ASC';
        
        const [items] = await pool.execute(query, params);
        
        // Format items to match expected API response
        const formattedItems = items.map(item => ({
            id: item.item_id,
            name: item.name,
            description: item.description,
            price: item.price ? item.price.toString() : null,
            imageUrl: item.image_url,
            category: item.category
        }));
        
        res.json({
            success: true,
            items: formattedItems,
            message: null
        });
    } catch (error) {
        logger.error('Get menu items error:', error);
        res.status(500).json({
            success: false,
            items: null,
            message: 'Internal server error'
        });
    }
});

// GET /api/menu - Get menu structure (requires API key)
router.get('/', validateApiKey, async (req, res) => {
    try {
        const pool = req.pool;
        const [items] = await pool.execute(
            'SELECT * FROM menu_items WHERE is_active = 1 ORDER BY display_order ASC, name ASC'
        );
        
        // Group by category
        const categories = {};
        items.forEach(item => {
            const category = item.category || 'other';
            if (!categories[category]) {
                categories[category] = {
                    id: category,
                    name: category.charAt(0).toUpperCase() + category.slice(1),
                    items: []
                };
            }
            categories[category].items.push({
                id: item.item_id,
                name: item.name,
                description: item.description,
                price: item.price ? item.price.toString() : null,
                imageUrl: item.image_url,
                category: item.category
            });
        });
        
        res.json({
            success: true,
            menu: {
                id: 'business_one_menu',
                name: 'Business One Services',
                categories: Object.values(categories)
            },
            message: null
        });
    } catch (error) {
        logger.error('Get menu error:', error);
        res.status(500).json({
            success: false,
            menu: null,
            message: 'Internal server error'
        });
    }
});

// Admin routes (require admin authentication - you may want to add your own auth middleware)
// For now, these are unprotected - you should add authentication

// GET /api/menu/admin/items - Get all menu items for admin (no API key required)
router.get('/admin/items', async (req, res) => {
    try {
        const pool = req.pool;
        const [items] = await pool.execute(
            'SELECT * FROM menu_items ORDER BY display_order ASC, name ASC'
        );
        
        res.json({ success: true, items });
    } catch (error) {
        logger.error('Get admin menu items error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/menu/admin/items - Create new menu item
router.post('/admin/items', async (req, res) => {
    try {
        const { item_id, name, description, price, image_url, category, display_order, is_active } = req.body;
        
        if (!item_id || !name) {
            return res.status(400).json({ success: false, error: 'item_id and name are required' });
        }
        
        const pool = req.pool;
        const [result] = await pool.execute(
            `INSERT INTO menu_items (item_id, name, description, price, image_url, category, display_order, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [item_id, name, description || null, price || null, image_url || null, category || null, display_order || 0, is_active !== undefined ? is_active : 1]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        logger.error('Create menu item error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'Item ID already exists' });
        }
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/menu/admin/items/:id - Update menu item
router.put('/admin/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, image_url, category, display_order, is_active } = req.body;
        
        const pool = req.pool;
        const updates = [];
        const values = [];
        
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (price !== undefined) { updates.push('price = ?'); values.push(price); }
        if (image_url !== undefined) { updates.push('image_url = ?'); values.push(image_url); }
        if (category !== undefined) { updates.push('category = ?'); values.push(category); }
        if (display_order !== undefined) { updates.push('display_order = ?'); values.push(display_order); }
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        
        values.push(id);
        await pool.execute(
            `UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Update menu item error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// DELETE /api/menu/admin/items/:id - Delete menu item
router.delete('/admin/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pool = req.pool;
        
        await pool.execute('DELETE FROM menu_items WHERE id = ?', [id]);
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete menu item error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API Key Management

// GET /api/menu/admin/keys - Get all API keys
router.get('/admin/keys', async (req, res) => {
    try {
        const pool = req.pool;
        const [keys] = await pool.execute(
            'SELECT id, name, is_active, created_at, last_used_at FROM menu_api_keys ORDER BY created_at DESC'
        );
        
        res.json({ success: true, keys });
    } catch (error) {
        logger.error('Get API keys error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/menu/admin/keys - Create new API key
router.post('/admin/keys', async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }
        
        // Generate a secure API key
        const apiKey = 'bo_' + crypto.randomBytes(32).toString('hex');
        
        const pool = req.pool;
        const [result] = await pool.execute(
            'INSERT INTO menu_api_keys (api_key, name) VALUES (?, ?)',
            [apiKey, name]
        );
        
        res.json({ success: true, apiKey, id: result.insertId });
    } catch (error) {
        logger.error('Create API key error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// PUT /api/menu/admin/keys/:id - Update API key (activate/deactivate)
router.put('/admin/keys/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active, name } = req.body;
        
        const pool = req.pool;
        const updates = [];
        const values = [];
        
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        
        values.push(id);
        await pool.execute(
            `UPDATE menu_api_keys SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Update API key error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// DELETE /api/menu/admin/keys/:id - Delete API key
router.delete('/admin/keys/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pool = req.pool;
        
        await pool.execute('DELETE FROM menu_api_keys WHERE id = ?', [id]);
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete API key error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;


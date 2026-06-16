'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticatePosDevice } = require('../middleware/posDeviceAuth');
const { authenticatePosEmployee } = require('../middleware/posEmployeeAuth');
const personnel = require('../services/posPersonnel');
const {
    createInStorePosOrder,
    syncPosOrderBatch,
    getDefaultTaxRate,
    ALLOWED_PAYMENT_METHODS
} = require('../services/posStoreOrder');
const { loadCashDiscountSettings } = require('../services/posCashDiscount');
const { loadPosStoreConfig } = require('../services/posStoreConfig');
const { loadPosReceiptSettings } = require('../services/posReceiptSettings');
const { loadPosSecuritySettings } = require('../services/posSecuritySettings');
const { loadPosPaymentConfig, resolveEffectivePaymentAdapter } = require('../services/posPaymentConfig');
const { listEquipmentForRegister } = require('../services/posEquipment');
const { createHandoffCode } = require('../services/posAdminHandoff');
const { storefrontPrimaryImageFromFields } = require('../utils/catalogOverrides');

const posPinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 40 : 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.posDeviceId || 'device'}:${req.ip || 'ip'}`,
    message: { error: 'Too many PIN attempts. Please wait and try again.', code: 'PIN_RATE_LIMITED' }
});

function publicStoreBaseUrl(req) {
    const fromEnv = String(process.env.FRONTEND_URL || process.env.PUBLIC_STORE_URL || '').trim().replace(/\/+$/, '');
    if (fromEnv) return fromEnv;
    return `${req.protocol}://${req.get('host')}`;
}

router.use(authenticatePosDevice);

router.get('/health', (req, res) => {
    res.json({
        ok: true,
        service: 'business-one-pos',
        version: '1.0.0',
        deviceId: req.posDeviceId,
        timestamp: new Date().toISOString()
    });
});

router.get('/config', async (req, res) => {
    try {
        const [cashDiscount, store, security, payment] = await Promise.all([
            loadCashDiscountSettings(req.pool),
            loadPosStoreConfig(req.pool),
            loadPosSecuritySettings(req.pool),
            loadPosPaymentConfig(req.pool)
        ]);
        const receipt = await loadPosReceiptSettings(req.pool, store.storeLogoUrl);
        const equipment = req.posDeviceRecordId
            ? await listEquipmentForRegister(req.pool, req.posDeviceRecordId)
            : [];
        const cardTerminal = equipment.find((e) => e.equipmentType === 'card_terminal');
        const terminalAdapter = cardTerminal?.config?.paymentAdapter;
        if (terminalAdapter && terminalAdapter !== 'inherit') {
            const resolved = await resolveEffectivePaymentAdapter(req.pool, terminalAdapter);
            payment.cardAdapter = resolved.cardAdapter;
            payment.cardAdapterLabel = resolved.cardAdapterLabel;
            payment.integrated = resolved.integrated;
            payment.serverCharge = resolved.serverCharge;
            payment.configured = resolved.configured;
            payment.driverScript = resolved.driverScript;
            payment.configurationNote = resolved.configurationNote;
            payment.equipmentOverride = {
                equipmentId: cardTerminal.id,
                label: cardTerminal.label
            };
        }
        res.json({
            storeName: store.storeName,
            storeLogoUrl: store.storeLogoUrl,
            platformName: 'Business One',
            taxRate: getDefaultTaxRate(),
            currency: 'USD',
            paymentMethods: [...ALLOWED_PAYMENT_METHODS],
            payment: {
                cardAdapter: payment.cardAdapter,
                cardAdapterLabel: payment.cardAdapterLabel,
                adapters: payment.adapters,
                driverScript: payment.driverScript,
                customDriverUrl: payment.customDriverUrl,
                integrated: payment.integrated,
                serverCharge: payment.serverCharge,
                configured: payment.configured,
                configurationNote: payment.configurationNote
            },
            receipt,
            security: {
                sessionTimeoutMinutes: security.sessionTimeoutMinutes,
                pinMaxAttempts: security.pinMaxAttempts,
                pinLockoutMinutes: security.pinLockoutMinutes
            },
            cashDiscount: {
                enabled: cashDiscount.enabled,
                percent: cashDiscount.percent,
                disclosure:
                    'Prices shown include standard payment pricing. Pay with cash to receive the cash discount.'
            },
            compliance: payment.compliance,
            equipment
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load config' });
    }
});

router.get('/catalog', async (req, res) => {
    try {
        const since = req.query.since ? new Date(req.query.since) : null;
        const sinceValid = since && !Number.isNaN(since.getTime()) ? since : null;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
        const offset = (page - 1) * limit;

        let where = 'p.is_active = 1';
        const params = [];
        if (sinceValid) {
            where += ' AND p.updated_at >= ?';
            params.push(sinceValid);
        }

        const [countRows] = await req.pool.execute(
            `SELECT COUNT(DISTINCT p.id) AS total
             FROM products p
             LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = 1
             WHERE ${where}`,
            params
        );
        const total = Number(countRows[0]?.total) || 0;

        const limitNum = Number(limit);
        const offsetNum = Number(offset);
        const [products] = await req.pool.execute(
            `SELECT p.id, p.sku, p.name, p.slug, p.price, p.inventory_quantity, p.track_inventory,
                    p.is_taxable, p.updated_at, p.category_id,
                    pc.name AS category_name,
                    pi.image_url AS primary_image_url
             FROM products p
             LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.is_active = 1
             LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
             WHERE p.is_active = 1
             ${sinceValid ? 'AND p.updated_at >= ?' : ''}
             ORDER BY p.id ASC
             LIMIT ${limitNum} OFFSET ${offsetNum}`,
            sinceValid ? [sinceValid] : []
        );

        const productIds = products.map((p) => p.id);
        let variants = [];
        if (productIds.length) {
            const placeholders = productIds.map(() => '?').join(',');
            const [variantRows] = await req.pool.execute(
                `SELECT id, product_id, sku, name, price, inventory_quantity
                 FROM product_variants
                 WHERE is_active = 1 AND product_id IN (${placeholders})`,
                productIds
            );
            variants = variantRows;
        }

        const variantsByProduct = variants.reduce((acc, v) => {
            if (!acc[v.product_id]) acc[v.product_id] = [];
            acc[v.product_id].push({
                id: v.id,
                sku: v.sku,
                name: v.name,
                price: Number(v.price),
                inventoryQuantity: Number(v.inventory_quantity) || 0
            });
            return acc;
        }, {});

        res.json({
            page,
            limit,
            total,
            syncedAt: new Date().toISOString(),
            products: products.map((p) => ({
                id: p.id,
                sku: p.sku,
                name: p.name,
                slug: p.slug,
                price: Number(p.price),
                inventoryQuantity: Number(p.inventory_quantity) || 0,
                trackInventory: Boolean(p.track_inventory),
                isTaxable: Boolean(p.is_taxable),
                updatedAt: p.updated_at,
                categoryId: p.category_id ? Number(p.category_id) : null,
                categoryName: p.category_name || null,
                imageUrl:
                    storefrontPrimaryImageFromFields({
                        slug: p.slug,
                        sku: p.sku,
                        primaryImageUrl: p.primary_image_url
                    }) || null,
                variants: variantsByProduct[p.id] || []
            }))
        });
    } catch (error) {
        logger.error('POS catalog error:', error);
        res.status(500).json({ error: 'Failed to load catalog' });
    }
});

router.get('/categories', async (req, res) => {
    try {
        const [rows] = await req.pool.execute(
            `SELECT pc.id, pc.name, pc.slug, pc.image_url, pc.description, pc.parent_id,
                    COALESCE(dp.direct_count, 0) AS direct_count,
                    COALESCE(cp.child_count, 0) AS child_count
             FROM product_categories pc
             LEFT JOIN (
                SELECT category_id, COUNT(*) AS direct_count
                  FROM products
                 WHERE is_active = 1
                 GROUP BY category_id
             ) dp ON dp.category_id = pc.id
             LEFT JOIN (
                SELECT c.parent_id, COUNT(p.id) AS child_count
                  FROM product_categories c
                  INNER JOIN products p ON p.category_id = c.id AND p.is_active = 1
                 WHERE c.is_active = 1 AND c.parent_id IS NOT NULL
                 GROUP BY c.parent_id
             ) cp ON cp.parent_id = pc.id
             WHERE pc.is_active = 1
               AND (COALESCE(dp.direct_count, 0) + COALESCE(cp.child_count, 0) > 0)
             ORDER BY pc.sort_order ASC, pc.name ASC`
        );
        const [uncatRows] = await req.pool.execute(
            `SELECT COUNT(*) AS product_count FROM products
             WHERE is_active = 1 AND (category_id IS NULL OR category_id = 0)`
        );
        const uncategorized = Number(uncatRows[0]?.product_count) || 0;
        const categories = (rows || []).map((row) => {
            const direct = Number(row.direct_count) || 0;
            const child = Number(row.child_count) || 0;
            return {
                id: Number(row.id),
                name: row.name,
                slug: row.slug,
                description: row.description || null,
                imageUrl: row.image_url || null,
                parentId: row.parent_id != null ? Number(row.parent_id) : null,
                directProductCount: direct,
                childProductCount: child,
                productCount: direct + child,
                hasChildren: child > 0,
            };
        });
        if (uncategorized > 0) {
            const supplementsId = categories.find((c) => c.slug === 'supplements')?.id ?? null;
            categories.push({
                id: 0,
                name: 'Other',
                slug: 'other',
                description: null,
                imageUrl: null,
                parentId: supplementsId,
                directProductCount: uncategorized,
                childProductCount: 0,
                productCount: uncategorized,
                hasChildren: false,
            });
            const supplements = categories.find((c) => c.slug === 'supplements');
            if (supplements) {
                supplements.hasChildren = true;
                supplements.childProductCount = (supplements.childProductCount || 0) + uncategorized;
                supplements.productCount =
                    (supplements.directProductCount || 0) + supplements.childProductCount;
            }
        }
        res.json({ categories });
    } catch (error) {
        logger.error('POS categories error:', error);
        res.status(500).json({ error: 'Failed to load categories' });
    }
});

router.get('/products/lookup', async (req, res) => {
    try {
        const q = String(req.query.q || req.query.sku || '').trim();
        if (!q) {
            return res.status(400).json({ error: 'Search query required (q or sku)' });
        }

        const [variantHits] = await req.pool.execute(
            `SELECT pv.id AS variant_id, pv.sku, pv.name AS variant_name, pv.price AS variant_price,
                    pv.inventory_quantity AS variant_inventory,
                    p.id, p.sku AS product_sku, p.name, p.slug, p.price, p.inventory_quantity,
                    p.track_inventory, p.is_taxable,
                    pi.image_url AS primary_image_url
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
             LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
             WHERE pv.is_active = 1 AND p.is_active = 1
               AND (pv.sku = ? OR p.sku = ?)
             LIMIT 5`,
            [q, q]
        );

        if (variantHits.length) {
            return res.json({
                matches: variantHits.map((row) => ({
                    productId: row.id,
                    variantId: row.variant_id,
                    sku: row.sku,
                    name: `${row.name} — ${row.variant_name}`,
                    price: Number(row.variant_price),
                    inventoryQuantity: Number(row.variant_inventory) || 0,
                    trackInventory: Boolean(row.track_inventory),
                    isTaxable: Boolean(row.is_taxable),
                    imageUrl:
                        storefrontPrimaryImageFromFields({
                            slug: row.slug,
                            sku: row.sku,
                            primaryImageUrl: row.primary_image_url
                        }) || null
                }))
            });
        }

        const [productHits] = await req.pool.execute(
            `SELECT p.id, p.sku, p.name, p.slug, p.price, p.inventory_quantity, p.track_inventory, p.is_taxable,
                    pi.image_url AS primary_image_url
             FROM products p
             LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
             WHERE p.is_active = 1 AND (p.sku = ? OR p.name LIKE ?)
             ORDER BY CASE WHEN p.sku = ? THEN 0 ELSE 1 END, p.name ASC
             LIMIT 10`,
            [q, `%${q}%`, q]
        );

        res.json({
            matches: productHits.map((row) => ({
                productId: row.id,
                variantId: null,
                sku: row.sku,
                name: row.name,
                price: Number(row.price),
                inventoryQuantity: Number(row.inventory_quantity) || 0,
                trackInventory: Boolean(row.track_inventory),
                isTaxable: Boolean(row.is_taxable),
                imageUrl:
                    storefrontPrimaryImageFromFields({
                        slug: row.slug,
                        sku: row.sku,
                        primaryImageUrl: row.primary_image_url
                    }) || null
            }))
        });
    } catch (error) {
        logger.error('POS product lookup error:', error);
        res.status(500).json({ error: 'Product lookup failed' });
    }
});

router.post('/orders', authenticatePosEmployee, async (req, res) => {
    try {
        const result = await createInStorePosOrder(req.pool, req.body, req.posDeviceId, req.posEmployee.id);
        res.status(result.duplicate ? 200 : 201).json({ success: true, ...result });
    } catch (error) {
        logger.error('POS create order error:', error);
        const code = error.code || 'ORDER_FAILED';
        const statusMap = {
            EMPTY_CART: 400,
            INVALID_PAYMENT: 400,
            INVALID_PAYMENT_METHOD: 400,
            TERMINAL_LAST_FOUR_REQUIRED: 400,
            TERMINAL_LAST_FOUR_INVALID: 400,
            TERMINAL_APPROVAL_REQUIRED: 400,
            CARD_DATA_NOT_ALLOWED: 400,
            EMPLOYEE_AUTH_REQUIRED: 401,
            EMPLOYEE_MISMATCH: 403,
            PRODUCT_NOT_FOUND: 404,
            INVALID_LINE_QUANTITY: 400
        };
        res.status(statusMap[code] || 500).json({
            error: error.message || 'Failed to create order',
            code
        });
    }
});

router.post('/sync', authenticatePosEmployee, async (req, res) => {
    try {
        const sales = Array.isArray(req.body?.sales) ? req.body.sales : [];
        if (!sales.length) {
            return res.status(400).json({ error: 'No sales to sync', code: 'EMPTY_BATCH' });
        }
        if (sales.length > 100) {
            return res.status(400).json({ error: 'Maximum 100 sales per sync batch', code: 'BATCH_TOO_LARGE' });
        }
        const results = await syncPosOrderBatch(req.pool, sales, req.posDeviceId, req.posEmployee.id);
        const failed = results.filter((r) => !r.success).length;
        res.json({
            success: failed === 0,
            synced: results.filter((r) => r.success).length,
            failed,
            results
        });
    } catch (error) {
        logger.error('POS sync batch error:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
});

// --- Employee auth & personnel (Phase 2+) ---

router.post('/employees/login', posPinLimiter, async (req, res) => {
    try {
        const pin = req.body?.pin;
        const result = await personnel.loginWithPin(req.pool, pin, {
            deviceId: req.posDeviceId,
            ip: req.ip
        });
        res.json({ success: true, ...result });
    } catch (e) {
        const status =
            e.code === 'PIN_LOCKED' || e.code === 'PIN_RATE_LIMITED'
                ? 429
                : e.code === 'INVALID_PIN'
                  ? 401
                  : 400;
        res.status(status).json({
            error: e.message,
            code: e.code,
            lockedUntil: e.lockedUntil || null
        });
    }
});

router.post('/admin/handoff', authenticatePosEmployee, async (req, res) => {
    try {
        const employee = await personnel.getEmployeeById(req.pool, req.posEmployee.id);
        if (!employee?.admin_user_id) {
            return res.status(403).json({
                error: 'This employee is not linked to an admin account.',
                code: 'ADMIN_ACCESS_DENIED'
            });
        }
        const hasAccess = await personnel.employeeHasAdminAccess(req.pool, employee);
        if (!hasAccess) {
            return res.status(403).json({
                error: 'Linked admin account is not active.',
                code: 'ADMIN_ACCESS_DENIED'
            });
        }
        const { code } = await createHandoffCode(req.pool, employee.id, employee.admin_user_id);
        const base = publicStoreBaseUrl(req);
        res.json({
            success: true,
            adminUrl: `${base}/admin.html?pos_handoff=${encodeURIComponent(code)}`
        });
    } catch (error) {
        logger.error('POS admin handoff error:', error);
        res.status(500).json({ error: 'Could not open admin session' });
    }
});

router.get('/employees/me', authenticatePosEmployee, async (req, res) => {
    const employee = await personnel.getEmployeeById(req.pool, req.posEmployee.id);
    res.json({ employee });
});

router.post('/timesheet/clock-in', authenticatePosEmployee, async (req, res) => {
    try {
        const shiftSessionId = req.body?.shiftSessionId ? Number(req.body.shiftSessionId) : null;
        const id = await personnel.clockIn(req.pool, req.posEmployee.id, shiftSessionId);
        res.json({ success: true, timeEntryId: id });
    } catch (e) {
        res.status(400).json({ error: e.message, code: e.code });
    }
});

router.post('/timesheet/clock-out', authenticatePosEmployee, async (req, res) => {
    try {
        const id = await personnel.clockOut(req.pool, req.posEmployee.id);
        res.json({ success: true, timeEntryId: id });
    } catch (e) {
        res.status(400).json({ error: e.message, code: e.code });
    }
});

router.get('/shift/current', authenticatePosEmployee, async (req, res) => {
    const shift = await personnel.getOpenShiftSession(req.pool, req.posEmployee.id, req.posDeviceId);
    if (!shift) return res.json({ shift: null });
    const expected = await personnel.computeExpectedCash(req.pool, shift);
    res.json({ shift, expectedCash: expected });
});

router.post('/shift/open', authenticatePosEmployee, async (req, res) => {
    try {
        const shift = await personnel.openShiftSession(req.pool, {
            employeeId: req.posEmployee.id,
            deviceId: req.posDeviceId,
            openingCash: req.body?.openingCash,
            scheduledShiftId: req.body?.scheduledShiftId ? Number(req.body.scheduledShiftId) : null
        });
        await personnel.clockIn(req.pool, req.posEmployee.id, shift.id).catch(() => {});
        res.status(201).json({ shift });
    } catch (e) {
        res.status(e.code === 'SHIFT_ALREADY_OPEN' ? 409 : 400).json({
            error: e.message,
            code: e.code,
            shiftSessionId: e.shiftSessionId
        });
    }
});

router.post('/shift/cash-event', authenticatePosEmployee, async (req, res) => {
    try {
        const shiftSessionId = Number(req.body?.shiftSessionId);
        const eventType = String(req.body?.eventType || '').trim();
        if (!['paid_out', 'drop', 'cash_in'].includes(eventType)) {
            return res.status(400).json({ error: 'Invalid event type' });
        }
        const id = await personnel.addCashDrawerEvent(req.pool, {
            shiftSessionId,
            eventType,
            amount: req.body?.amount,
            reason: req.body?.reason,
            employeeId: req.posEmployee.id
        });
        res.json({ success: true, eventId: id });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/shift/close', authenticatePosEmployee, async (req, res) => {
    try {
        const shift = await personnel.closeShiftSession(req.pool, {
            shiftSessionId: Number(req.body?.shiftSessionId),
            closingCash: req.body?.closingCash,
            notes: req.body?.notes
        });
        await personnel.clockOut(req.pool, req.posEmployee.id).catch(() => {});
        const report = await personnel.getShiftReport(req.pool, shift.id);
        res.json({ success: true, shift, report });
    } catch (e) {
        res.status(400).json({ error: e.message, code: e.code });
    }
});

router.get('/shifts/scheduled', authenticatePosEmployee, async (req, res) => {
    const shifts = await personnel.listScheduledShifts(req.pool, {
        employeeId: req.posEmployee.id,
        from: req.query.from,
        to: req.query.to
    });
    res.json({ shifts });
});

router.get('/reports/shift/:id', authenticatePosEmployee, async (req, res) => {
    const report = await personnel.getShiftReport(req.pool, Number(req.params.id));
    if (!report) return res.status(404).json({ error: 'Shift not found' });
    res.json(report);
});

router.put('/display', async (req, res) => {
    try {
        const payload = req.body && typeof req.body === 'object' ? req.body : {};
        await req.pool.execute(
            `INSERT INTO pos_display_snapshots (device_id, payload) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
            [req.posDeviceId, JSON.stringify(payload)]
        );
        res.json({ success: true });
    } catch (e) {
        logger.error('POS display push error:', e);
        res.status(500).json({ error: 'Failed to update display' });
    }
});

router.get('/display', async (req, res) => {
    try {
        const deviceId = String(req.query.deviceId || req.posDeviceId || '').trim();
        if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
        const [rows] = await req.pool.execute(
            'SELECT payload, updated_at FROM pos_display_snapshots WHERE device_id = ? LIMIT 1',
            [deviceId]
        );
        if (!rows.length) {
            return res.json({ status: 'idle', lines: [], card: null, cash: null, updatedAt: null });
        }
        let payload = rows[0].payload;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            } catch {
                payload = {};
            }
        }
        res.json({ ...payload, updatedAt: rows[0].updated_at });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load display' });
    }
});

module.exports = router;

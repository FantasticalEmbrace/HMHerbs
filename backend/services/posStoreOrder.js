'use strict';

const { finalizePaidOrder } = require('./finalizePaidOrder');
const { normalizeSalesChannel } = require('../utils/orderChannel');
const { recordSaleOnShift } = require('./posPersonnel');
const {
    loadCashDiscountSettings,
    computeDualPricing,
    resolveTotalsForPayment
} = require('./posCashDiscount');
const { loadStoreTaxRate } = require('../utils/storeTaxRate');
const {
    loadPosSecuritySettings,
    lineDiscountNeedsManagerPin
} = require('./posSecuritySettings');
const { verifyManagerPin } = require('./posPersonnel');
const InventoryService = require('./inventory');

const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'check', 'card_terminal']);
const FORBIDDEN_PAYMENT_KEYS = new Set([
    'card_number',
    'cardNumber',
    'pan',
    'cvv',
    'cvc',
    'card_cvv',
    'expiry',
    'expiration',
    'track_data',
    'magstripe'
]);

function roundMoney(value) {
    return Math.round(Number(value) * 100) / 100;
}

function sqlBind(value) {
    return value === undefined ? null : value;
}

function generatePosOrderNumber() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `POS${y}${m}${day}-${seq}`;
}

function parseTaxExemptSale(payload) {
    const root = payload && typeof payload === 'object' ? payload : {};
    const payment = root.payment && typeof root.payment === 'object' ? root.payment : {};
    const exempt = Boolean(
        root.taxExempt || root.tax_exempt || payment.taxExempt || payment.tax_exempt
    );
    const reason = String(
        root.taxExemptReason
        || root.tax_exempt_reason
        || payment.taxExemptReason
        || payment.tax_exempt_reason
        || ''
    ).trim().slice(0, 500);
    return { exempt, reason };
}

function getInStoreEmail() {
    return String(process.env.POS_IN_STORE_EMAIL || 'pos-instore@hmherbs.local').trim();
}

function assertCompliantPaymentPayload(body) {
    if (!body || typeof body !== 'object') {
        const err = new Error('INVALID_PAYMENT');
        err.code = 'INVALID_PAYMENT';
        throw err;
    }

    for (const key of Object.keys(body)) {
        if (FORBIDDEN_PAYMENT_KEYS.has(key)) {
            const err = new Error('CARD_DATA_NOT_ALLOWED');
            err.code = 'CARD_DATA_NOT_ALLOWED';
            err.message = 'Card numbers and CVV must never be sent to this POS API. Use the external card terminal.';
            throw err;
        }
    }

    const method = String(body.paymentMethod || body.payment_method || '').trim().toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(method)) {
        const err = new Error('INVALID_PAYMENT_METHOD');
        err.code = 'INVALID_PAYMENT_METHOD';
        throw err;
    }

    if (method === 'card_terminal') {
        const lastFour = String(body.terminalLastFour || body.terminal_last_four || '').replace(/\D/g, '');
        const auth = String(body.terminalAuthCode || body.terminal_auth_code || '').trim();
        const approved = body.terminalApprovedConfirmed || body.terminal_approved_confirmed;
        if (lastFour.length === 4 && /\d{13,19}/.test(lastFour)) {
            const err = new Error('CARD_DATA_NOT_ALLOWED');
            err.code = 'CARD_DATA_NOT_ALLOWED';
            throw err;
        }
        if (lastFour.length > 0 && lastFour.length !== 4) {
            const err = new Error('TERMINAL_LAST_FOUR_INVALID');
            err.code = 'TERMINAL_LAST_FOUR_INVALID';
            throw err;
        }
        if (!approved && lastFour.length !== 4 && !auth) {
            const err = new Error('TERMINAL_APPROVAL_REQUIRED');
            err.code = 'TERMINAL_APPROVAL_REQUIRED';
            err.message = 'Confirm card approval on the terminal before completing the sale.';
            throw err;
        }
    }

    return method;
}

function buildPaymentReference(method, paymentMeta = {}) {
    if (method === 'cash') return 'pos:cash';
    if (method === 'check') return `pos:check:${String(paymentMeta.checkNumber || paymentMeta.check_number || 'na').slice(0, 32)}`;

    const auth = String(paymentMeta.terminalAuthCode || paymentMeta.terminal_auth_code || '').trim();
    const lastFour = String(paymentMeta.terminalLastFour || paymentMeta.terminal_last_four || '').replace(/\D/g, '');
    const ref = String(paymentMeta.terminalReference || paymentMeta.terminal_reference || '').trim();
    const offline = paymentMeta.terminalOfflineApproved || paymentMeta.terminal_offline_approved ? 'offline' : 'online';
    return `pos:terminal:${offline}:${lastFour}:${auth || 'na'}:${ref || 'na'}`.slice(0, 120);
}

function buildOrderNotes(method, paymentMeta = {}, cashDiscountAmount = 0, taxExemptInfo = null) {
    const parts = [`Payment method: ${method}`, 'Channel: in_store POS'];
    if (taxExemptInfo?.exempt) {
        parts.push(`Tax exempt: ${taxExemptInfo.reason || 'no reason recorded'}`);
    }
    if (cashDiscountAmount > 0) {
        parts.push(`Cash discount: -$${cashDiscountAmount.toFixed(2)}`);
    }
    if (method === 'card_terminal') {
        const lastFour = String(paymentMeta.terminalLastFour || paymentMeta.terminal_last_four || '').replace(/\D/g, '');
        const auth = String(paymentMeta.terminalAuthCode || paymentMeta.terminal_auth_code || '').trim();
        const brand = String(paymentMeta.terminalCardBrand || paymentMeta.terminal_card_brand || 'card').trim();
        if (lastFour.length === 4) {
            parts.push(`Terminal: ${brand} •••• ${lastFour}`);
        } else {
            parts.push(`Terminal: ${brand} (approved on device)`);
        }
        if (auth) parts.push(`Auth: ${auth}`);
        if (paymentMeta.terminalOfflineApproved || paymentMeta.terminal_offline_approved) {
            parts.push('Terminal offline approval — batch may settle when online.');
        }
    }
    if (paymentMeta.note) parts.push(String(paymentMeta.note).trim());
    return parts.join('\n');
}

async function loadCatalogLines(pool, lineItems) {
    const enriched = [];
    for (const raw of lineItems) {
        const quantity = Number(raw.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
            const err = new Error('INVALID_LINE_QUANTITY');
            err.code = 'INVALID_LINE_QUANTITY';
            throw err;
        }

        const sku = String(raw.sku || '').trim();
        const productId = Number(raw.productId || raw.product_id || 0);
        const variantId = raw.variantId || raw.variant_id ? Number(raw.variantId || raw.variant_id) : null;

        let productRow = null;
        let variantRow = null;

        if (variantId) {
            const [variants] = await pool.execute(
                `SELECT pv.*, p.name AS product_name, p.is_taxable, p.track_inventory, p.is_active AS product_active
                 FROM product_variants pv
                 JOIN products p ON p.id = pv.product_id
                 WHERE pv.id = ? AND pv.is_active = 1 AND p.is_active = 1
                 LIMIT 1`,
                [variantId]
            );
            variantRow = variants[0] || null;
            if (variantRow) productRow = variantRow;
        }

        if (!productRow && sku) {
            const [byVariantSku] = await pool.execute(
                `SELECT pv.*, p.id AS parent_product_id, p.name AS product_name, p.is_taxable, p.track_inventory, p.is_active AS product_active
                 FROM product_variants pv
                 JOIN products p ON p.id = pv.product_id
                 WHERE pv.sku = ? AND pv.is_active = 1 AND p.is_active = 1
                 LIMIT 1`,
                [sku]
            );
            if (byVariantSku[0]) {
                variantRow = byVariantSku[0];
                productRow = byVariantSku[0];
            } else {
                const [byProductSku] = await pool.execute(
                    `SELECT id, sku, name, price, is_taxable, track_inventory, inventory_quantity
                     FROM products WHERE sku = ? AND is_active = 1 LIMIT 1`,
                    [sku]
                );
                productRow = byProductSku[0] || null;
            }
        }

        if (!productRow && productId) {
            const [byId] = await pool.execute(
                `SELECT id, sku, name, price, is_taxable, track_inventory, inventory_quantity
                 FROM products WHERE id = ? AND is_active = 1 LIMIT 1`,
                [productId]
            );
            productRow = byId[0] || null;
        }

        if (!productRow) {
            const err = new Error('PRODUCT_NOT_FOUND');
            err.code = 'PRODUCT_NOT_FOUND';
            err.sku = sku;
            throw err;
        }

        const unitPriceCatalog = variantRow
            ? roundMoney(variantRow.price)
            : roundMoney(productRow.price);
        const lineDiscountPercent = Math.min(
            100,
            Math.max(0, Number(raw.lineDiscountPercent || raw.line_discount_percent || 0))
        );
        const unitPrice = roundMoney(unitPriceCatalog * (1 - lineDiscountPercent / 100));
        const resolvedProductId = variantRow ? variantRow.product_id || variantRow.parent_product_id : productRow.id;
        const resolvedVariantId = variantRow ? variantRow.id : null;
        const lineSku = variantRow ? variantRow.sku : productRow.sku;
        const lineName = variantRow
            ? `${variantRow.product_name || productRow.name} — ${variantRow.name}`
            : productRow.name;

        enriched.push({
            product_id: resolvedProductId,
            variant_id: resolvedVariantId,
            sku: lineSku,
            name: lineName,
            quantity,
            unitPrice,
            catalogUnitPrice: unitPriceCatalog,
            lineDiscountPercent,
            lineTotal: roundMoney(unitPrice * quantity),
            is_taxable: Boolean(productRow.is_taxable)
        });
    }
    return enriched;
}

function computeTotals(enriched, taxRate) {
    const subtotal = roundMoney(enriched.reduce((sum, line) => sum + line.lineTotal, 0));
    const taxableSubtotal = roundMoney(
        enriched.filter((line) => line.is_taxable).reduce((sum, line) => sum + line.lineTotal, 0)
    );
    const taxAmount = roundMoney(taxableSubtotal * taxRate);
    const totalAmount = roundMoney(subtotal + taxAmount);
    return { subtotal, taxAmount, totalAmount };
}

async function findExistingByClientTx(pool, clientTransactionId) {
    if (!clientTransactionId) return null;
    const [rows] = await pool.execute(
        `SELECT id, order_number, payment_status, total_amount
         FROM orders WHERE pos_client_transaction_id = ? LIMIT 1`,
        [clientTransactionId]
    );
    return rows[0] || null;
}

async function validateSaleManagerAuth(pool, lineItems, managerPin, context = {}) {
    const settings = await loadPosSecuritySettings(pool);
    const needsPin = (lineItems || []).some((raw) =>
        lineDiscountNeedsManagerPin(raw.lineDiscountPercent || raw.line_discount_percent, settings)
    );
    if (!needsPin) return null;
    if (!managerPin) {
        const err = new Error('MANAGER_PIN_REQUIRED');
        err.code = 'MANAGER_PIN_REQUIRED';
        err.message = 'Manager PIN required for line discounts above the allowed limit.';
        throw err;
    }
    return verifyManagerPin(pool, managerPin, context);
}

/**
 * Create and finalize an in-store POS order (PCI-safe: no card PAN/CVV).
 */
async function createInStorePosOrder(pool, payload, deviceId, verifiedEmployeeId = null) {
    const clientTransactionId = String(
        payload.clientTransactionId || payload.client_transaction_id || ''
    ).trim().slice(0, 64);
    if (!verifiedEmployeeId) {
        const err = new Error('EMPLOYEE_AUTH_REQUIRED');
        err.code = 'EMPLOYEE_AUTH_REQUIRED';
        err.message = 'Employee sign-in required to complete sales.';
        throw err;
    }
    const employeeId = Number(verifiedEmployeeId);
    const payloadEmployeeId =
        payload.employeeId || payload.employee_id ? Number(payload.employeeId || payload.employee_id) : null;
    if (payloadEmployeeId && payloadEmployeeId !== employeeId) {
        const err = new Error('EMPLOYEE_MISMATCH');
        err.code = 'EMPLOYEE_MISMATCH';
        err.message = 'Sale employee does not match signed-in employee.';
        throw err;
    }
    const shiftSessionId = payload.shiftSessionId || payload.shift_session_id
        ? Number(payload.shiftSessionId || payload.shift_session_id)
        : null;

    if (clientTransactionId) {
        const existing = await findExistingByClientTx(pool, clientTransactionId);
        if (existing) {
            return {
                duplicate: true,
                orderId: existing.id,
                orderNumber: existing.order_number,
                paymentStatus: existing.payment_status,
                totalAmount: Number(existing.total_amount)
            };
        }
    }

    const lineItems = Array.isArray(payload.items) ? payload.items : [];
    if (!lineItems.length) {
        const err = new Error('EMPTY_CART');
        err.code = 'EMPTY_CART';
        throw err;
    }

    const managerPin = String(payload.managerPin || payload.manager_pin || '').replace(/\D/g, '').slice(0, 4);
    const authorizer = await validateSaleManagerAuth(pool, lineItems, managerPin || null, {
        deviceId,
        ip: payload.clientIp
    });

    const paymentMethod = assertCompliantPaymentPayload(payload.payment || payload);
    const paymentMeta = payload.payment || payload;
    const taxExemptInfo = parseTaxExemptSale(payload);
    if (taxExemptInfo.exempt && taxExemptInfo.reason.length < 3) {
        const err = new Error('TAX_EXEMPT_REASON_REQUIRED');
        err.code = 'TAX_EXEMPT_REASON_REQUIRED';
        err.message = 'A tax exemption reason note is required (at least 3 characters).';
        throw err;
    }
    const storeTaxRate = await loadStoreTaxRate(pool);
    const taxRate = taxExemptInfo.exempt ? 0 : storeTaxRate;
    const enriched = await loadCatalogLines(pool, lineItems);
    const cashSettings = await loadCashDiscountSettings(pool);
    const pricing = computeDualPricing(enriched, taxRate, cashSettings.enabled ? cashSettings.percent : 0);
    const totals = resolveTotalsForPayment(pricing, paymentMethod);
    const orderNumber = generatePosOrderNumber();
    const orderEmail = getInStoreEmail();
    const salesChannel = normalizeSalesChannel('in_store');
    const paymentReference = buildPaymentReference(paymentMethod, paymentMeta);
    const notes = buildOrderNotes(paymentMethod, paymentMeta, totals.discountAmount, taxExemptInfo);
    const notesWithAuth = authorizer
        ? `${notes}\nManager approval: ${authorizer.name} (${authorizer.employeeCode})`
        : notes;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const [orderResult] = await connection.execute(
            `INSERT INTO orders (
                order_number, user_id, email, status, payment_status,
                subtotal, tax_amount, shipping_amount, discount_amount, total_amount,
                shipping_first_name, shipping_last_name,
                billing_first_name, billing_last_name,
                notes, payment_method, payment_reference, sales_channel,
                pos_client_transaction_id, pos_device_id, pos_employee_id, pos_shift_session_id
            ) VALUES (?, NULL, ?, 'pending', 'pending', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderNumber,
                orderEmail,
                totals.subtotal,
                totals.taxAmount,
                totals.discountAmount,
                totals.totalAmount,
                'In-Store',
                'Customer',
                'In-Store',
                'Customer',
                notesWithAuth,
                paymentMethod,
                paymentReference,
                salesChannel,
                clientTransactionId || null,
                deviceId || null,
                employeeId,
                shiftSessionId
            ].map(sqlBind)
        );

        const orderId = orderResult.insertId;

        for (const line of enriched) {
            await connection.execute(
                `INSERT INTO order_items (
                    order_id, product_id, variant_id, product_name, product_sku,
                    variant_name, quantity, price, total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderId,
                    line.product_id,
                    line.variant_id,
                    line.name,
                    line.sku,
                    line.variant_id ? line.name.split(' — ').pop() : null,
                    line.quantity,
                    line.unitPrice,
                    line.lineTotal
                ].map(sqlBind)
            );
        }

        await connection.commit();

        const finalized = await finalizePaidOrder(pool, {
            orderId,
            paymentId: paymentReference,
            paymentStatus: 'paid',
            skipConfirmationEmail: true
        });

        if (shiftSessionId) {
            await recordSaleOnShift(pool, shiftSessionId, paymentMethod, totals.totalAmount);
        }

        return {
            duplicate: false,
            orderId: finalized.orderId,
            orderNumber: finalized.orderNumber,
            paymentStatus: 'paid',
            totalAmount: totals.totalAmount,
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            cashDiscountAmount: totals.discountAmount
        };
    } catch (e) {
        await connection.rollback();
        if (e?.code === 'ER_DUP_ENTRY' && clientTransactionId) {
            const existing = await findExistingByClientTx(pool, clientTransactionId);
            if (existing) {
                return {
                    duplicate: true,
                    orderId: existing.id,
                    orderNumber: existing.order_number,
                    paymentStatus: existing.payment_status,
                    totalAmount: Number(existing.total_amount)
                };
            }
        }
        throw e;
    } finally {
        connection.release();
    }
}

async function syncPosOrderBatch(pool, sales, deviceId, verifiedEmployeeId = null) {
    const results = [];
    for (const sale of sales) {
        try {
            const result = await createInStorePosOrder(pool, sale, deviceId, verifiedEmployeeId);
            results.push({
                clientTransactionId: sale.clientTransactionId || sale.client_transaction_id,
                success: true,
                duplicate: Boolean(result.duplicate),
                orderId: result.orderId,
                orderNumber: result.orderNumber,
                totalAmount: result.totalAmount
            });
        } catch (error) {
            results.push({
                clientTransactionId: sale.clientTransactionId || sale.client_transaction_id,
                success: false,
                code: error.code || 'SYNC_FAILED',
                error: error.message || 'Failed to sync sale'
            });
        }
    }
    return results;
}

async function refundInStorePosOrder(pool, orderNumber, payload, employeeId, deviceId, context = {}) {
    const settings = await loadPosSecuritySettings(pool);
    const managerPin = String(payload.managerPin || payload.manager_pin || '').replace(/\D/g, '').slice(0, 4);
    if (settings.requireManagerPinVoidRefund) {
        if (!managerPin) {
            const err = new Error('MANAGER_PIN_REQUIRED');
            err.code = 'MANAGER_PIN_REQUIRED';
            err.message = 'Manager PIN required to process refunds.';
            throw err;
        }
        await verifyManagerPin(pool, managerPin, { deviceId, ip: context.ip, scope: 'refund' });
    }

    const reason = String(payload.reason || payload.refundReason || '').trim().slice(0, 500);
    if (reason.length < 3) {
        const err = new Error('REFUND_REASON_REQUIRED');
        err.code = 'REFUND_REASON_REQUIRED';
        err.message = 'A refund reason is required (at least 3 characters).';
        throw err;
    }

    const orderNum = String(orderNumber || '').trim();
    const [orders] = await pool.execute(
        `SELECT id, order_number, payment_status, status, sales_channel, pos_employee_id
         FROM orders WHERE order_number = ? LIMIT 1`,
        [orderNum]
    );
    const order = orders[0];
    if (!order) {
        const err = new Error('ORDER_NOT_FOUND');
        err.code = 'ORDER_NOT_FOUND';
        throw err;
    }
    if (String(order.sales_channel || '').toLowerCase() !== 'in_store') {
        const err = new Error('ORDER_NOT_POS');
        err.code = 'ORDER_NOT_POS';
        err.message = 'Only in-store POS orders can be refunded from the register.';
        throw err;
    }
    if (order.payment_status === 'refunded') {
        const err = new Error('ORDER_ALREADY_REFUNDED');
        err.code = 'ORDER_ALREADY_REFUNDED';
        throw err;
    }
    if (order.payment_status !== 'paid') {
        const err = new Error('ORDER_NOT_REFUNDABLE');
        err.code = 'ORDER_NOT_REFUNDABLE';
        throw err;
    }

    const [orderItems] = await pool.execute(
        `SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?`,
        [order.id]
    );

    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        const refundNote = `POS refund by employee #${employeeId}: ${reason}`;
        await connection.execute(
            `UPDATE orders SET status = 'cancelled', payment_status = 'refunded',
                notes = CONCAT(COALESCE(notes, ''), IF(COALESCE(notes, '') = '', '', '\n'), ?)
             WHERE id = ?`,
            [refundNote, order.id]
        );

        const inventoryService = new InventoryService(pool);
        const inventoryItems = orderItems.map((item) => ({
            productId: item.product_id,
            variantId: item.variant_id,
            quantity: item.quantity
        }));
        await inventoryService.restoreInventoryForOrder(
            inventoryItems,
            order.id,
            `POS refund ${orderNum} — ${reason}`
        );

        await connection.commit();
        return {
            orderId: order.id,
            orderNumber: order.order_number,
            paymentStatus: 'refunded'
        };
    } catch (e) {
        await connection.rollback();
        throw e;
    } finally {
        connection.release();
    }
}

module.exports = {
    createInStorePosOrder,
    syncPosOrderBatch,
    refundInStorePosOrder,
    assertCompliantPaymentPayload,
    ALLOWED_PAYMENT_METHODS
};

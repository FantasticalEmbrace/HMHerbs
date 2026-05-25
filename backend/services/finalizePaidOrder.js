'use strict';

const logger = require('../utils/logger');
const InventoryService = require('./inventory');
const { generateTrackingNumber } = require('../utils/generateTrackingNumber');
const { sendOrderConfirmationEmail } = require('./orderConfirmationEmail');

async function recalcUserOrderAggregates(connection, userId) {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return;
    const [[agg]] = await connection.execute(
        `SELECT COUNT(*) AS n,
                COALESCE(SUM(total_amount), 0) AS spent,
                MAX(updated_at) AS last_done
           FROM orders
          WHERE user_id = ? AND payment_status = 'paid'`,
        [uid]
    );
    const n = Number(agg.n) || 0;
    const spent = Number(agg.spent) || 0;
    const avg = n > 0 ? spent / n : 0;
    await connection.execute(
        `UPDATE users
            SET total_orders = ?,
                lifetime_value = ?,
                last_order_at = ?,
                avg_order_value = ?
          WHERE id = ?`,
        [n, spent, agg.last_done, avg, uid]
    );
}

/**
 * Completes a pending order: set paid, deduct inventory, update user aggregates.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ orderId: number, paymentId: string, paymentStatus: string }} opts
 */
async function finalizePaidOrder(pool, { orderId, paymentId, paymentStatus }) {
    const oid = Number(orderId);
    if (!Number.isFinite(oid) || oid < 1) {
        const err = new Error('INVALID_ORDER');
        err.code = 'INVALID_ORDER';
        throw err;
    }

    const [orders] = await pool.execute('SELECT * FROM orders WHERE id = ? AND status = ?', [oid, 'pending']);

    if (orders.length === 0) {
        const err = new Error('ORDER_NOT_PENDING');
        err.code = 'ORDER_NOT_PENDING';
        throw err;
    }

    const orderRow = orders[0];
    const trackingNumber =
        String(orderRow.tracking_number || '').trim() || generateTrackingNumber();

    const [orderItems] = await pool.execute(
        `
            SELECT oi.*, p.name as product_name, p.sku, p.track_inventory
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `,
        [oid]
    );

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const paidStatus = paymentStatus || 'paid';
        if (paymentId) {
            await connection.execute(
                `UPDATE orders
                    SET status = 'processing',
                        payment_status = ?,
                        tracking_number = COALESCE(NULLIF(TRIM(tracking_number), ''), ?),
                        notes = CONCAT(COALESCE(notes, ''), IF(COALESCE(notes, '') = '', '', '\n'), ?)
                  WHERE id = ? AND status = 'pending'`,
                [paidStatus, trackingNumber, `Payment reference: ${paymentId}`, oid]
            );
        } else {
            await connection.execute(
                `UPDATE orders
                    SET status = 'processing',
                        payment_status = ?,
                        tracking_number = COALESCE(NULLIF(TRIM(tracking_number), ''), ?)
                  WHERE id = ? AND status = 'pending'`,
                [paidStatus, trackingNumber, oid]
            );
        }

        const inventoryService = new InventoryService(pool);
        const inventoryItems = orderItems.map((item) => ({
            productId: item.product_id,
            variantId: item.variant_id,
            quantity: item.quantity
        }));

        await inventoryService.deductInventoryForOrder(
            inventoryItems,
            oid,
            `Order #${oid} completed - Payment ID: ${paymentId}`
        );

        if (orderRow.user_id) {
            await recalcUserOrderAggregates(connection, orderRow.user_id);
        }

        await connection.commit();
        logger.info(`Order ${oid} finalized (payment ${paymentId})`);

        void sendOrderConfirmationEmail(pool, oid).catch((emailErr) => {
            logger.error(`Order ${oid} confirmation email error:`, emailErr);
        });

        return {
            orderId: oid,
            orderNumber: orderRow.order_number,
            trackingNumber
        };
    } catch (e) {
        await connection.rollback();
        throw e;
    } finally {
        connection.release();
    }
}

module.exports = { finalizePaidOrder, recalcUserOrderAggregates };

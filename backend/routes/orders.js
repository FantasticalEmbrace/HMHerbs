// Order Management Routes with Inventory Integration
const express = require('express');
const router = express.Router();
const InventoryService = require('../services/inventory');

// Create order (checkout process)
router.post('/', async (req, res) => {
    try {
        const {
            customerInfo,
            shippingAddress,
            billingAddress,
            paymentMethod,
            cartItems,
            subtotal,
            tax,
            shipping,
            total
        } = req.body;

        const userId = req.user?.id || null;
        const sessionId = req.headers['x-session-id'] || req.sessionID;

        // Validate required fields
        if (!customerInfo?.email || !cartItems?.length) {
            return res.status(400).json({ error: 'Missing required order information' });
        }

        // Start transaction
        const connection = await req.pool.getConnection();
        await connection.beginTransaction();

        try {
            // Create order
            const [orderResult] = await connection.execute(`
                INSERT INTO orders (
                    user_id, session_id, email, first_name, last_name, phone,
                    shipping_address_line1, shipping_address_line2, shipping_city, 
                    shipping_state, shipping_postal_code, shipping_country,
                    billing_address_line1, billing_address_line2, billing_city,
                    billing_state, billing_postal_code, billing_country,
                    subtotal, tax_amount, shipping_amount, total_amount,
                    payment_method, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                userId, sessionId, customerInfo.email, customerInfo.firstName, customerInfo.lastName, customerInfo.phone,
                shippingAddress.line1, shippingAddress.line2, shippingAddress.city, shippingAddress.state, shippingAddress.postalCode, shippingAddress.country,
                billingAddress.line1, billingAddress.line2, billingAddress.city, billingAddress.state, billingAddress.postalCode, billingAddress.country,
                subtotal, tax, shipping, total, paymentMethod, 'pending'
            ]);

            const orderId = orderResult.insertId;

            // Add order items
            for (const item of cartItems) {
                await connection.execute(`
                    INSERT INTO order_items (order_id, product_id, variant_id, quantity, price, total)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [orderId, item.product_id, item.variant_id, item.quantity, item.price, item.price * item.quantity]);
            }

            await connection.commit();

            // Clear cart after successful order
            if (userId || sessionId) {
                const [carts] = await req.pool.execute(
                    'SELECT id FROM shopping_carts WHERE user_id = ? OR session_id = ?',
                    [userId, sessionId]
                );
                
                if (carts.length > 0) {
                    await req.pool.execute('DELETE FROM cart_items WHERE cart_id = ?', [carts[0].id]);
                }
            }

            res.json({
                success: true,
                orderId: orderId,
                message: 'Order created successfully'
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Complete order (payment successful) - DEDUCT INVENTORY
router.post('/:orderId/complete', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { paymentId, paymentStatus } = req.body;

        // Get order details
        const [orders] = await req.pool.execute(
            'SELECT * FROM orders WHERE id = ? AND status = ?',
            [orderId, 'pending']
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found or already processed' });
        }

        // Get order items
        const [orderItems] = await req.pool.execute(`
            SELECT oi.*, p.name as product_name, p.sku, p.track_inventory
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [orderId]);

        // Start transaction
        const connection = await req.pool.getConnection();
        await connection.beginTransaction();

        try {
            // Update order status
            await connection.execute(
                'UPDATE orders SET status = ?, payment_id = ?, payment_status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['completed', paymentId, paymentStatus, orderId]
            );

            // Deduct inventory using InventoryService
            const inventoryService = new InventoryService(req.pool);
            const inventoryItems = orderItems.map(item => ({
                productId: item.product_id,
                variantId: item.variant_id,
                quantity: item.quantity
            }));

            await inventoryService.deductInventoryForOrder(
                inventoryItems,
                orderId,
                `Order #${orderId} completed - Payment ID: ${paymentId}`
            );

            await connection.commit();

            console.log(`✅ Order ${orderId} completed and inventory deducted`);

            res.json({
                success: true,
                message: 'Order completed successfully',
                orderId: orderId
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Order completion error:', error);
        res.status(500).json({ error: 'Failed to complete order: ' + error.message });
    }
});

// Cancel order - RESTORE INVENTORY
router.post('/:orderId/cancel', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        // Get order details
        const [orders] = await req.pool.execute(
            'SELECT * FROM orders WHERE id = ? AND status IN (?, ?)',
            [orderId, 'pending', 'completed']
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found or cannot be cancelled' });
        }

        const order = orders[0];

        // Get order items
        const [orderItems] = await req.pool.execute(`
            SELECT oi.*, p.name as product_name, p.sku
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [orderId]);

        // Start transaction
        const connection = await req.pool.getConnection();
        await connection.beginTransaction();

        try {
            // Update order status
            await connection.execute(
                'UPDATE orders SET status = ?, cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = ? WHERE id = ?',
                ['cancelled', reason, orderId]
            );

            // Restore inventory if order was completed (inventory was deducted)
            if (order.status === 'completed') {
                const inventoryService = new InventoryService(req.pool);
                const inventoryItems = orderItems.map(item => ({
                    productId: item.product_id,
                    variantId: item.variant_id,
                    quantity: item.quantity
                }));

                await inventoryService.restoreInventoryForOrder(
                    inventoryItems,
                    orderId,
                    `Order #${orderId} cancelled - Reason: ${reason || 'Customer request'}`
                );
            }

            await connection.commit();

            console.log(`✅ Order ${orderId} cancelled and inventory restored`);

            res.json({
                success: true,
                message: 'Order cancelled successfully',
                orderId: orderId
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Order cancellation error:', error);
        res.status(500).json({ error: 'Failed to cancel order: ' + error.message });
    }
});

// Get order details
router.get('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user?.id;

        // Get order with items
        const [orders] = await req.pool.execute(`
            SELECT o.*, 
                   GROUP_CONCAT(
                       JSON_OBJECT(
                           'id', oi.id,
                           'product_id', oi.product_id,
                           'variant_id', oi.variant_id,
                           'quantity', oi.quantity,
                           'price', oi.price,
                           'total', oi.total,
                           'product_name', p.name,
                           'product_sku', p.sku,
                           'variant_name', pv.name
                       )
                   ) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            LEFT JOIN product_variants pv ON oi.variant_id = pv.id
            WHERE o.id = ? AND (o.user_id = ? OR ? IS NULL)
            GROUP BY o.id
        `, [orderId, userId, userId]);

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orders[0];
        order.items = order.items ? JSON.parse(`[${order.items}]`) : [];

        res.json(order);

    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Failed to get order' });
    }
});

// Get user orders
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        const sessionId = req.headers['x-session-id'] || req.sessionID;

        if (!userId && !sessionId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const [orders] = await req.pool.execute(`
            SELECT 
                o.id,
                o.status,
                o.total_amount,
                o.created_at,
                o.completed_at,
                COUNT(oi.id) as item_count
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.user_id = ? OR o.session_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [userId, sessionId]);

        res.json(orders);

    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

module.exports = router;

// HM Herbs Gift Card Management Service
// Complete gift card program with generation, validation, and transaction tracking

const crypto = require('crypto');

class GiftCardService {
    constructor(db) {
        this.db = db;
    }

    // Gift Card Generation
    async generateGiftCard(cardData, adminId = null) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Generate unique card number and code
            const cardNumber = this.generateCardNumber();
            const cardCode = this.generateCardCode();

            // Validate amount
            if (!cardData.initial_amount || cardData.initial_amount <= 0) {
                throw new Error('Invalid gift card amount');
            }

            const [result] = await connection.execute(`
                INSERT INTO gift_cards (
                    card_number, card_code, initial_amount, current_balance, currency,
                    status, issued_date, expiry_date, purchased_by_user_id, purchased_by_email,
                    purchase_order_id, recipient_name, recipient_email, personal_message, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                cardNumber,
                cardCode,
                cardData.initial_amount,
                cardData.initial_amount, // current_balance starts as initial_amount
                cardData.currency || 'USD',
                cardData.status || 'active',
                cardData.issued_date || new Date().toISOString().split('T')[0],
                cardData.expiry_date || null,
                cardData.purchased_by_user_id || null,
                cardData.purchased_by_email || null,
                cardData.purchase_order_id || null,
                cardData.recipient_name || null,
                cardData.recipient_email || null,
                cardData.personal_message || null,
                adminId
            ]);

            const giftCardId = result.insertId;

            // Log the purchase transaction
            await this.logTransaction(
                giftCardId,
                'purchase',
                cardData.initial_amount,
                0, // balance_before
                cardData.initial_amount, // balance_after
                cardData.purchase_order_id,
                cardData.purchased_by_user_id,
                adminId,
                null, // reference_number
                'Gift card purchased',
                connection
            );

            await connection.commit();

            return {
                id: giftCardId,
                card_number: cardNumber,
                card_code: cardCode,
                initial_amount: cardData.initial_amount,
                current_balance: cardData.initial_amount,
                status: cardData.status || 'active'
            };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to generate gift card: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    async generateBulkGiftCards(bulkData, adminId) {
        const { count, amount, expiry_date, prefix = '' } = bulkData;
        
        if (count > 100) {
            throw new Error('Maximum 100 gift cards can be generated at once');
        }

        const giftCards = [];
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            for (let i = 0; i < count; i++) {
                const cardData = {
                    initial_amount: amount,
                    expiry_date,
                    status: 'active'
                };

                const cardNumber = this.generateCardNumber(prefix);
                const cardCode = this.generateCardCode();

                const [result] = await connection.execute(`
                    INSERT INTO gift_cards (
                        card_number, card_code, initial_amount, current_balance, currency,
                        status, issued_date, expiry_date, created_by
                    ) VALUES (?, ?, ?, ?, 'USD', 'active', CURDATE(), ?, ?)
                `, [
                    cardNumber,
                    cardCode,
                    amount,
                    amount,
                    expiry_date,
                    adminId
                ]);

                const giftCardId = result.insertId;

                // Log purchase transaction
                await this.logTransaction(
                    giftCardId,
                    'purchase',
                    amount,
                    0,
                    amount,
                    null,
                    null,
                    adminId,
                    `BULK-${Date.now()}-${i}`,
                    'Bulk gift card generation',
                    connection
                );

                giftCards.push({
                    id: giftCardId,
                    card_number: cardNumber,
                    card_code: cardCode,
                    amount
                });
            }

            await connection.commit();
            return giftCards;
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to generate bulk gift cards: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    // Gift Card Validation and Balance Checking
    async validateGiftCard(cardNumber, cardCode) {
        const [cards] = await this.db.execute(`
            SELECT id, card_number, card_code, current_balance, status, expiry_date
            FROM gift_cards 
            WHERE card_number = ? AND card_code = ?
        `, [cardNumber, cardCode]);

        if (cards.length === 0) {
            throw new Error('Invalid gift card number or code');
        }

        const card = cards[0];

        // Check if card is active
        if (card.status !== 'active') {
            throw new Error(`Gift card is ${card.status}`);
        }

        // Check if card is expired
        if (card.expiry_date && new Date(card.expiry_date) < new Date()) {
            await this.expireGiftCard(card.id);
            throw new Error('Gift card has expired');
        }

        // Check if card has balance
        if (card.current_balance <= 0) {
            throw new Error('Gift card has no remaining balance');
        }

        return card;
    }

    async getGiftCardBalance(cardNumber, cardCode) {
        const card = await this.validateGiftCard(cardNumber, cardCode);
        return {
            card_number: card.card_number,
            current_balance: card.current_balance,
            status: card.status,
            expiry_date: card.expiry_date
        };
    }

    // Gift Card Redemption
    async redeemGiftCard(cardNumber, cardCode, amount, orderId = null, userId = null) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Validate gift card
            const card = await this.validateGiftCard(cardNumber, cardCode);

            if (amount <= 0) {
                throw new Error('Redemption amount must be greater than zero');
            }

            if (amount > card.current_balance) {
                throw new Error('Insufficient gift card balance');
            }

            const newBalance = card.current_balance - amount;
            const newStatus = newBalance === 0 ? 'redeemed' : 'active';

            // Update gift card balance
            await connection.execute(`
                UPDATE gift_cards 
                SET current_balance = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [newBalance, newStatus, card.id]);

            // Log redemption transaction
            await this.logTransaction(
                card.id,
                'redemption',
                -amount, // negative amount for redemption
                card.current_balance,
                newBalance,
                orderId,
                userId,
                null,
                orderId ? `ORDER-${orderId}` : null,
                `Gift card redemption: $${amount}`,
                connection
            );

            await connection.commit();

            return {
                redeemed_amount: amount,
                remaining_balance: newBalance,
                status: newStatus
            };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to redeem gift card: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    // Gift Card Management
    async getGiftCards(filters = {}) {
        const { 
            status, 
            search, 
            purchased_by_email,
            recipient_email,
            date_from,
            date_to,
            limit = 50, 
            offset = 0 
        } = filters;
        
        let query = `
            SELECT gc.*, 
                   u.email as purchaser_email,
                   o.order_number,
                   admin.first_name as created_by_name
            FROM gift_cards gc
            LEFT JOIN users u ON gc.purchased_by_user_id = u.id
            LEFT JOIN orders o ON gc.purchase_order_id = o.id
            LEFT JOIN admin_users admin ON gc.created_by = admin.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ' AND gc.status = ?';
            params.push(status);
        }
        
        if (search) {
            query += ' AND (gc.card_number LIKE ? OR gc.recipient_name LIKE ? OR gc.recipient_email LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (purchased_by_email) {
            query += ' AND gc.purchased_by_email = ?';
            params.push(purchased_by_email);
        }

        if (recipient_email) {
            query += ' AND gc.recipient_email = ?';
            params.push(recipient_email);
        }

        if (date_from) {
            query += ' AND gc.issued_date >= ?';
            params.push(date_from);
        }

        if (date_to) {
            query += ' AND gc.issued_date <= ?';
            params.push(date_to);
        }
        
        query += ' ORDER BY gc.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [giftCards] = await this.db.execute(query, params);
        return giftCards;
    }

    async getGiftCardById(giftCardId) {
        const [cards] = await this.db.execute(`
            SELECT gc.*, 
                   u.email as purchaser_email,
                   o.order_number,
                   admin.first_name as created_by_name
            FROM gift_cards gc
            LEFT JOIN users u ON gc.purchased_by_user_id = u.id
            LEFT JOIN orders o ON gc.purchase_order_id = o.id
            LEFT JOIN admin_users admin ON gc.created_by = admin.id
            WHERE gc.id = ?
        `, [giftCardId]);

        if (cards.length === 0) {
            throw new Error('Gift card not found');
        }

        return cards[0];
    }

    async updateGiftCardStatus(giftCardId, status, adminId, notes = null) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const [cards] = await connection.execute(
                'SELECT current_balance FROM gift_cards WHERE id = ?',
                [giftCardId]
            );

            if (cards.length === 0) {
                throw new Error('Gift card not found');
            }

            const currentBalance = cards[0].current_balance;

            await connection.execute(`
                UPDATE gift_cards 
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [status, giftCardId]);

            // Log status change
            await this.logTransaction(
                giftCardId,
                'adjustment',
                0, // no amount change
                currentBalance,
                currentBalance,
                null,
                null,
                adminId,
                null,
                notes || `Status changed to ${status}`,
                connection
            );

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to update gift card status: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    async adjustGiftCardBalance(giftCardId, adjustment, adminId, notes) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const [cards] = await connection.execute(
                'SELECT current_balance, status FROM gift_cards WHERE id = ?',
                [giftCardId]
            );

            if (cards.length === 0) {
                throw new Error('Gift card not found');
            }

            const currentBalance = cards[0].current_balance;
            const newBalance = Math.max(0, currentBalance + adjustment);
            const newStatus = newBalance === 0 ? 'redeemed' : 'active';

            await connection.execute(`
                UPDATE gift_cards 
                SET current_balance = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [newBalance, newStatus, giftCardId]);

            // Log adjustment transaction
            await this.logTransaction(
                giftCardId,
                'adjustment',
                adjustment,
                currentBalance,
                newBalance,
                null,
                null,
                adminId,
                null,
                notes || `Balance adjustment: ${adjustment > 0 ? '+' : ''}${adjustment}`,
                connection
            );

            await connection.commit();

            return {
                previous_balance: currentBalance,
                new_balance: newBalance,
                adjustment: adjustment,
                status: newStatus
            };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to adjust gift card balance: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    // Gift Card Transactions
    async getGiftCardTransactions(giftCardId, limit = 50) {
        const [transactions] = await this.db.execute(`
            SELECT gct.*, 
                   u.email as user_email,
                   admin.first_name as admin_name,
                   o.order_number
            FROM gift_card_transactions gct
            LEFT JOIN users u ON gct.user_id = u.id
            LEFT JOIN admin_users admin ON gct.admin_id = admin.id
            LEFT JOIN orders o ON gct.order_id = o.id
            WHERE gct.gift_card_id = ?
            ORDER BY gct.created_at DESC
            LIMIT ?
        `, [giftCardId, limit]);

        return transactions;
    }

    async logTransaction(giftCardId, transactionType, amount, balanceBefore, balanceAfter, 
                        orderId = null, userId = null, adminId = null, referenceNumber = null, 
                        notes = null, connection = null) {
        const db = connection || this.db;
        
        await db.execute(`
            INSERT INTO gift_card_transactions (
                gift_card_id, transaction_type, amount, balance_before, balance_after,
                order_id, user_id, admin_id, reference_number, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            giftCardId, transactionType, amount, balanceBefore, balanceAfter,
            orderId, userId, adminId, referenceNumber, notes
        ]);
    }

    // Expiration Management
    async expireGiftCard(giftCardId, adminId = null) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const [cards] = await connection.execute(
                'SELECT current_balance FROM gift_cards WHERE id = ?',
                [giftCardId]
            );

            if (cards.length === 0) {
                throw new Error('Gift card not found');
            }

            const currentBalance = cards[0].current_balance;

            await connection.execute(`
                UPDATE gift_cards 
                SET status = 'expired', current_balance = 0, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [giftCardId]);

            // Log expiration transaction
            if (currentBalance > 0) {
                await this.logTransaction(
                    giftCardId,
                    'expiry',
                    -currentBalance,
                    currentBalance,
                    0,
                    null,
                    null,
                    adminId,
                    null,
                    'Gift card expired',
                    connection
                );
            }

            await connection.commit();
            return { success: true, expired_balance: currentBalance };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to expire gift card: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    async processExpiredGiftCards() {
        const [expiredCards] = await this.db.execute(`
            SELECT id FROM gift_cards 
            WHERE status = 'active' 
            AND expiry_date IS NOT NULL 
            AND expiry_date < CURDATE()
        `);

        const results = {
            processed: 0,
            total_expired_value: 0
        };

        for (const card of expiredCards) {
            try {
                const result = await this.expireGiftCard(card.id);
                results.processed++;
                results.total_expired_value += result.expired_balance;
            } catch (error) {
                console.error(`Failed to expire gift card ${card.id}:`, error);
            }
        }

        return results;
    }

    // Analytics and Reporting
    async getGiftCardAnalytics(dateRange = 30) {
        const [analytics] = await this.db.execute(`
            SELECT 
                COUNT(*) as total_cards,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_cards,
                COUNT(CASE WHEN status = 'redeemed' THEN 1 END) as redeemed_cards,
                COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_cards,
                SUM(initial_amount) as total_issued_value,
                SUM(current_balance) as total_outstanding_balance,
                SUM(CASE WHEN status = 'redeemed' THEN initial_amount ELSE 0 END) as total_redeemed_value,
                AVG(initial_amount) as average_card_value
            FROM gift_cards 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        `, [dateRange]);

        const [recentTransactions] = await this.db.execute(`
            SELECT 
                transaction_type,
                COUNT(*) as transaction_count,
                SUM(ABS(amount)) as total_amount
            FROM gift_card_transactions 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY transaction_type
        `, [dateRange]);

        return {
            ...analytics[0],
            recent_transactions: recentTransactions
        };
    }

    // Utility Methods
    generateCardNumber(prefix = 'HM') {
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `${prefix}${timestamp}${random}`;
    }

    generateCardCode() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    // Fraud Prevention
    async checkForDuplicateCards(cardNumber, cardCode) {
        const [existing] = await this.db.execute(
            'SELECT id FROM gift_cards WHERE card_number = ? OR card_code = ?',
            [cardNumber, cardCode]
        );

        return existing.length > 0;
    }

    async flagSuspiciousActivity(giftCardId, reason, adminId) {
        await this.updateGiftCardStatus(giftCardId, 'suspended', adminId, `Flagged: ${reason}`);
        
        // Could add additional logging or notification logic here
        console.log(`Gift card ${giftCardId} flagged for suspicious activity: ${reason}`);
    }
}

module.exports = GiftCardService;


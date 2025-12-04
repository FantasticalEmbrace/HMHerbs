// HM Herbs Loyalty Program Management Service
// Flexible loyalty program system with points, tiers, and rewards

class LoyaltyService {
    constructor(db) {
        this.db = db;
    }

    // Loyalty Program Management
    async createLoyaltyProgram(programData, adminId) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(`
                INSERT INTO loyalty_programs (
                    name, description, program_type, is_active, auto_enrollment,
                    points_per_dollar, dollar_per_point, enable_tiers, tier_upgrade_threshold,
                    tier_downgrade_enabled, points_expire, points_expiry_months,
                    minimum_redemption_points, maximum_redemption_points, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                programData.name,
                programData.description || '',
                programData.program_type || 'points',
                programData.is_active !== false,
                programData.auto_enrollment !== false,
                programData.points_per_dollar || 1.00,
                programData.dollar_per_point || 0.01,
                programData.enable_tiers || false,
                programData.tier_upgrade_threshold || 0.00,
                programData.tier_downgrade_enabled || false,
                programData.points_expire || false,
                programData.points_expiry_months || 12,
                programData.minimum_redemption_points || 100,
                programData.maximum_redemption_points || 10000,
                adminId
            ]);

            const programId = result.insertId;

            // Create default tiers if tier system is enabled
            if (programData.enable_tiers && programData.tiers) {
                for (const tierData of programData.tiers) {
                    await this.createLoyaltyTier(programId, tierData, connection);
                }
            }

            await connection.commit();
            return { id: programId, ...programData };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to create loyalty program: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    async getLoyaltyPrograms(filters = {}) {
        const { is_active, program_type, limit = 50, offset = 0 } = filters;
        
        let query = `
            SELECT lp.*, 
                   COUNT(DISTINCT cl.user_id) as enrolled_customers,
                   COUNT(DISTINCT lt.id) as tier_count,
                   admin.first_name as created_by_name
            FROM loyalty_programs lp
            LEFT JOIN customer_loyalty cl ON lp.id = cl.program_id
            LEFT JOIN loyalty_tiers lt ON lp.id = lt.program_id
            LEFT JOIN admin_users admin ON lp.created_by = admin.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (is_active !== undefined) {
            query += ' AND lp.is_active = ?';
            params.push(is_active);
        }
        
        if (program_type) {
            query += ' AND lp.program_type = ?';
            params.push(program_type);
        }
        
        query += ' GROUP BY lp.id ORDER BY lp.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [programs] = await this.db.execute(query, params);
        return programs;
    }

    async getLoyaltyProgramById(programId) {
        const [programs] = await this.db.execute(`
            SELECT lp.*, 
                   COUNT(DISTINCT cl.user_id) as enrolled_customers,
                   admin.first_name as created_by_name
            FROM loyalty_programs lp
            LEFT JOIN customer_loyalty cl ON lp.id = cl.program_id
            LEFT JOIN admin_users admin ON lp.created_by = admin.id
            WHERE lp.id = ?
            GROUP BY lp.id
        `, [programId]);

        if (programs.length === 0) {
            throw new Error('Loyalty program not found');
        }

        const program = programs[0];

        // Get tiers if enabled
        if (program.enable_tiers) {
            const [tiers] = await this.db.execute(`
                SELECT * FROM loyalty_tiers 
                WHERE program_id = ? 
                ORDER BY tier_level ASC
            `, [programId]);
            program.tiers = tiers;
        }

        return program;
    }

    async updateLoyaltyProgram(programId, updateData, adminId) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const updateFields = [];
            const params = [];
            
            const allowedFields = [
                'name', 'description', 'is_active', 'auto_enrollment',
                'points_per_dollar', 'dollar_per_point', 'enable_tiers', 'tier_upgrade_threshold',
                'tier_downgrade_enabled', 'points_expire', 'points_expiry_months',
                'minimum_redemption_points', 'maximum_redemption_points'
            ];

            for (const field of allowedFields) {
                if (updateData.hasOwnProperty(field)) {
                    updateFields.push(`${field} = ?`);
                    params.push(updateData[field]);
                }
            }

            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }

            params.push(programId);

            const [result] = await connection.execute(`
                UPDATE loyalty_programs 
                SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, params);

            if (result.affectedRows === 0) {
                throw new Error('Loyalty program not found');
            }

            await connection.commit();
            return await this.getLoyaltyProgramById(programId);
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to update loyalty program: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    // Loyalty Tier Management
    async createLoyaltyTier(programId, tierData, connection = null) {
        const db = connection || this.db;
        
        const [result] = await db.execute(`
            INSERT INTO loyalty_tiers (
                program_id, tier_name, tier_level, minimum_spend, minimum_points,
                points_multiplier, discount_percentage, free_shipping, early_access,
                tier_color, tier_icon
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            programId,
            tierData.tier_name,
            tierData.tier_level,
            tierData.minimum_spend || 0.00,
            tierData.minimum_points || 0,
            tierData.points_multiplier || 1.00,
            tierData.discount_percentage || 0.00,
            tierData.free_shipping || false,
            tierData.early_access || false,
            tierData.tier_color || '#000000',
            tierData.tier_icon || null
        ]);

        return result.insertId;
    }

    async updateLoyaltyTier(tierId, updateData) {
        const updateFields = [];
        const params = [];
        
        const allowedFields = [
            'tier_name', 'minimum_spend', 'minimum_points', 'points_multiplier',
            'discount_percentage', 'free_shipping', 'early_access', 'tier_color', 'tier_icon'
        ];

        for (const field of allowedFields) {
            if (updateData.hasOwnProperty(field)) {
                updateFields.push(`${field} = ?`);
                params.push(updateData[field]);
            }
        }

        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }

        params.push(tierId);

        const [result] = await this.db.execute(`
            UPDATE loyalty_tiers 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `, params);

        if (result.affectedRows === 0) {
            throw new Error('Loyalty tier not found');
        }

        return { success: true };
    }

    // Customer Enrollment and Management
    async enrollCustomer(userId, programId, adminId = null) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Check if customer is already enrolled
            const [existing] = await connection.execute(
                'SELECT id FROM customer_loyalty WHERE user_id = ? AND program_id = ?',
                [userId, programId]
            );

            if (existing.length > 0) {
                throw new Error('Customer is already enrolled in this program');
            }

            // Get program details
            const program = await this.getLoyaltyProgramById(programId);
            if (!program.is_active) {
                throw new Error('Loyalty program is not active');
            }

            // Enroll customer
            const [result] = await connection.execute(`
                INSERT INTO customer_loyalty (
                    user_id, program_id, current_points, lifetime_points,
                    current_tier_id, tier_progress, total_earned, total_redeemed,
                    total_spent, enrolled_date, last_activity_date
                ) VALUES (?, ?, 0, 0, ?, 0.00, 0, 0, 0.00, CURDATE(), CURDATE())
            `, [userId, programId, program.enable_tiers && program.tiers ? program.tiers[0].id : null]);

            await connection.commit();
            return { id: result.insertId, enrolled: true };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to enroll customer: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    async getCustomerLoyalty(userId, programId) {
        const [loyalty] = await this.db.execute(`
            SELECT cl.*, 
                   lp.name as program_name,
                   lp.program_type,
                   lp.dollar_per_point,
                   lt.tier_name,
                   lt.tier_color,
                   lt.tier_icon,
                   lt.points_multiplier,
                   lt.discount_percentage,
                   lt.free_shipping,
                   lt.early_access
            FROM customer_loyalty cl
            JOIN loyalty_programs lp ON cl.program_id = lp.id
            LEFT JOIN loyalty_tiers lt ON cl.current_tier_id = lt.id
            WHERE cl.user_id = ? AND cl.program_id = ?
        `, [userId, programId]);

        if (loyalty.length === 0) {
            return null;
        }

        return loyalty[0];
    }

    async getCustomerLoyaltyAccounts(userId) {
        const [accounts] = await this.db.execute(`
            SELECT cl.*, 
                   lp.name as program_name,
                   lp.program_type,
                   lp.dollar_per_point,
                   lt.tier_name,
                   lt.tier_color,
                   lt.tier_icon
            FROM customer_loyalty cl
            JOIN loyalty_programs lp ON cl.program_id = lp.id
            LEFT JOIN loyalty_tiers lt ON cl.current_tier_id = lt.id
            WHERE cl.user_id = ?
            ORDER BY cl.enrolled_date DESC
        `, [userId]);

        return accounts;
    }

    // Points Management
    async earnPoints(userId, programId, orderAmount, orderId = null, description = null) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const loyalty = await this.getCustomerLoyalty(userId, programId);
            if (!loyalty) {
                throw new Error('Customer not enrolled in loyalty program');
            }

            // Get program details
            const program = await this.getLoyaltyProgramById(programId);
            
            // Calculate points to earn
            let pointsToEarn = Math.floor(orderAmount * program.points_per_dollar);
            
            // Apply tier multiplier if applicable
            if (loyalty.points_multiplier && loyalty.points_multiplier > 1) {
                pointsToEarn = Math.floor(pointsToEarn * loyalty.points_multiplier);
            }

            if (pointsToEarn <= 0) {
                return { points_earned: 0 };
            }

            const newPoints = loyalty.current_points + pointsToEarn;
            const newLifetimePoints = loyalty.lifetime_points + pointsToEarn;
            const newTotalEarned = loyalty.total_earned + pointsToEarn;
            const newTotalSpent = loyalty.total_spent + orderAmount;

            // Update customer loyalty account
            await connection.execute(`
                UPDATE customer_loyalty 
                SET current_points = ?, lifetime_points = ?, total_earned = ?, 
                    total_spent = ?, last_activity_date = CURDATE()
                WHERE user_id = ? AND program_id = ?
            `, [newPoints, newLifetimePoints, newTotalEarned, newTotalSpent, userId, programId]);

            // Calculate expiration date if points expire
            let expiresAt = null;
            if (program.points_expire) {
                const expiryDate = new Date();
                expiryDate.setMonth(expiryDate.getMonth() + program.points_expiry_months);
                expiresAt = expiryDate.toISOString().split('T')[0];
            }

            // Log transaction
            await this.logLoyaltyTransaction(
                loyalty.id,
                'earn',
                pointsToEarn,
                loyalty.current_points,
                newPoints,
                orderId,
                null, // admin_id
                orderId ? `ORDER-${orderId}` : null,
                description || `Points earned from order: $${orderAmount}`,
                expiresAt,
                connection
            );

            // Check for tier upgrade
            const tierUpgrade = await this.checkTierUpgrade(userId, programId, connection);

            await connection.commit();

            return {
                points_earned: pointsToEarn,
                total_points: newPoints,
                tier_upgrade: tierUpgrade
            };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to earn points: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    async redeemPoints(userId, programId, pointsToRedeem, orderId = null, description = null) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const loyalty = await this.getCustomerLoyalty(userId, programId);
            if (!loyalty) {
                throw new Error('Customer not enrolled in loyalty program');
            }

            const program = await this.getLoyaltyProgramById(programId);

            // Validate redemption amount
            if (pointsToRedeem < program.minimum_redemption_points) {
                throw new Error(`Minimum redemption is ${program.minimum_redemption_points} points`);
            }

            if (pointsToRedeem > program.maximum_redemption_points) {
                throw new Error(`Maximum redemption is ${program.maximum_redemption_points} points`);
            }

            if (pointsToRedeem > loyalty.current_points) {
                throw new Error('Insufficient points balance');
            }

            const newPoints = loyalty.current_points - pointsToRedeem;
            const newTotalRedeemed = loyalty.total_redeemed + pointsToRedeem;
            const redemptionValue = pointsToRedeem * program.dollar_per_point;

            // Update customer loyalty account
            await connection.execute(`
                UPDATE customer_loyalty 
                SET current_points = ?, total_redeemed = ?, last_activity_date = CURDATE()
                WHERE user_id = ? AND program_id = ?
            `, [newPoints, newTotalRedeemed, userId, programId]);

            // Log transaction
            await this.logLoyaltyTransaction(
                loyalty.id,
                'redeem',
                -pointsToRedeem,
                loyalty.current_points,
                newPoints,
                orderId,
                null, // admin_id
                orderId ? `ORDER-${orderId}` : null,
                description || `Points redeemed: ${pointsToRedeem} points = $${redemptionValue.toFixed(2)}`,
                null,
                connection
            );

            await connection.commit();

            return {
                points_redeemed: pointsToRedeem,
                redemption_value: redemptionValue,
                remaining_points: newPoints
            };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to redeem points: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    async adjustPoints(userId, programId, pointsAdjustment, adminId, reason) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const loyalty = await this.getCustomerLoyalty(userId, programId);
            if (!loyalty) {
                throw new Error('Customer not enrolled in loyalty program');
            }

            const newPoints = Math.max(0, loyalty.current_points + pointsAdjustment);
            const newLifetimePoints = pointsAdjustment > 0 
                ? loyalty.lifetime_points + pointsAdjustment 
                : loyalty.lifetime_points;

            // Update customer loyalty account
            await connection.execute(`
                UPDATE customer_loyalty 
                SET current_points = ?, lifetime_points = ?, last_activity_date = CURDATE()
                WHERE user_id = ? AND program_id = ?
            `, [newPoints, newLifetimePoints, userId, programId]);

            // Log transaction
            await this.logLoyaltyTransaction(
                loyalty.id,
                'adjustment',
                pointsAdjustment,
                loyalty.current_points,
                newPoints,
                null,
                adminId,
                null,
                reason || `Admin adjustment: ${pointsAdjustment > 0 ? '+' : ''}${pointsAdjustment} points`,
                null,
                connection
            );

            await connection.commit();

            return {
                adjustment: pointsAdjustment,
                previous_points: loyalty.current_points,
                new_points: newPoints
            };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to adjust points: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    // Tier Management
    async checkTierUpgrade(userId, programId, connection = null) {
        const db = connection || this.db;
        
        const loyalty = await this.getCustomerLoyalty(userId, programId);
        if (!loyalty) return null;

        const program = await this.getLoyaltyProgramById(programId);
        if (!program.enable_tiers || !program.tiers) return null;

        // Find the highest tier the customer qualifies for
        let qualifyingTier = null;
        for (const tier of program.tiers) {
            const meetsSpendRequirement = loyalty.total_spent >= tier.minimum_spend;
            const meetsPointsRequirement = loyalty.lifetime_points >= tier.minimum_points;
            
            if (meetsSpendRequirement && meetsPointsRequirement) {
                qualifyingTier = tier;
            }
        }

        // Check if this is an upgrade
        if (qualifyingTier && qualifyingTier.id !== loyalty.current_tier_id) {
            await db.execute(`
                UPDATE customer_loyalty 
                SET current_tier_id = ?, tier_achieved_date = CURDATE()
                WHERE user_id = ? AND program_id = ?
            `, [qualifyingTier.id, userId, programId]);

            return {
                upgraded: true,
                new_tier: qualifyingTier,
                previous_tier_id: loyalty.current_tier_id
            };
        }

        return null;
    }

    // Transaction Logging
    async logLoyaltyTransaction(customerLoyaltyId, transactionType, pointsChange, 
                               balanceBefore, balanceAfter, orderId = null, adminId = null, 
                               referenceNumber = null, description = null, expiresAt = null, 
                               connection = null) {
        const db = connection || this.db;
        
        await db.execute(`
            INSERT INTO loyalty_transactions (
                customer_loyalty_id, transaction_type, points_change, points_balance_before,
                points_balance_after, order_id, admin_id, reference_number, description, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            customerLoyaltyId, transactionType, pointsChange, balanceBefore, balanceAfter,
            orderId, adminId, referenceNumber, description, expiresAt
        ]);
    }

    async getLoyaltyTransactions(userId, programId, limit = 50) {
        const [transactions] = await this.db.execute(`
            SELECT lt.*, 
                   o.order_number,
                   admin.first_name as admin_name
            FROM loyalty_transactions lt
            JOIN customer_loyalty cl ON lt.customer_loyalty_id = cl.id
            LEFT JOIN orders o ON lt.order_id = o.id
            LEFT JOIN admin_users admin ON lt.admin_id = admin.id
            WHERE cl.user_id = ? AND cl.program_id = ?
            ORDER BY lt.created_at DESC
            LIMIT ?
        `, [userId, programId, limit]);

        return transactions;
    }

    // Expiration Management
    async processExpiredPoints() {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Find expired points
            const [expiredTransactions] = await connection.execute(`
                SELECT lt.*, cl.user_id, cl.program_id
                FROM loyalty_transactions lt
                JOIN customer_loyalty cl ON lt.customer_loyalty_id = cl.id
                WHERE lt.transaction_type = 'earn' 
                AND lt.expires_at IS NOT NULL 
                AND lt.expires_at < CURDATE()
                AND lt.id NOT IN (
                    SELECT DISTINCT reference_number 
                    FROM loyalty_transactions 
                    WHERE transaction_type = 'expire' 
                    AND reference_number IS NOT NULL
                )
            `);

            const results = {
                processed: 0,
                total_expired_points: 0
            };

            for (const transaction of expiredTransactions) {
                try {
                    // Get current customer loyalty info
                    const loyalty = await this.getCustomerLoyalty(transaction.user_id, transaction.program_id);
                    
                    if (loyalty && loyalty.current_points >= transaction.points_change) {
                        const newPoints = loyalty.current_points - transaction.points_change;
                        
                        // Update customer points
                        await connection.execute(`
                            UPDATE customer_loyalty 
                            SET current_points = ?
                            WHERE user_id = ? AND program_id = ?
                        `, [newPoints, transaction.user_id, transaction.program_id]);

                        // Log expiration transaction
                        await this.logLoyaltyTransaction(
                            loyalty.id,
                            'expire',
                            -transaction.points_change,
                            loyalty.current_points,
                            newPoints,
                            null,
                            null,
                            transaction.id.toString(),
                            `Points expired from transaction ${transaction.id}`,
                            null,
                            connection
                        );

                        results.processed++;
                        results.total_expired_points += transaction.points_change;
                    }
                } catch (error) {
                    console.error(`Failed to expire points for transaction ${transaction.id}:`, error);
                }
            }

            await connection.commit();
            return results;
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to process expired points: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    // Analytics and Reporting
    async getLoyaltyAnalytics(programId, dateRange = 30) {
        const [analytics] = await this.db.execute(`
            SELECT 
                COUNT(DISTINCT cl.user_id) as total_members,
                COUNT(DISTINCT CASE WHEN cl.last_activity_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN cl.user_id END) as active_members,
                SUM(cl.current_points) as total_outstanding_points,
                SUM(cl.lifetime_points) as total_lifetime_points,
                SUM(cl.total_earned) as total_points_earned,
                SUM(cl.total_redeemed) as total_points_redeemed,
                SUM(cl.total_spent) as total_member_spending,
                AVG(cl.current_points) as avg_points_balance,
                AVG(cl.total_spent) as avg_member_spending
            FROM customer_loyalty cl
            WHERE cl.program_id = ?
        `, [dateRange, programId]);

        const [tierDistribution] = await this.db.execute(`
            SELECT 
                lt.tier_name,
                lt.tier_level,
                COUNT(cl.user_id) as member_count
            FROM loyalty_tiers lt
            LEFT JOIN customer_loyalty cl ON lt.id = cl.current_tier_id
            WHERE lt.program_id = ?
            GROUP BY lt.id
            ORDER BY lt.tier_level
        `, [programId]);

        const [recentActivity] = await this.db.execute(`
            SELECT 
                transaction_type,
                COUNT(*) as transaction_count,
                SUM(ABS(points_change)) as total_points
            FROM loyalty_transactions lt
            JOIN customer_loyalty cl ON lt.customer_loyalty_id = cl.id
            WHERE cl.program_id = ? 
            AND lt.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY transaction_type
        `, [programId, dateRange]);

        return {
            ...analytics[0],
            tier_distribution: tierDistribution,
            recent_activity: recentActivity
        };
    }

    // Promotional Campaigns
    async createBonusPointsCampaign(programId, campaignData, adminId) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const { 
                name, 
                bonus_multiplier, 
                start_date, 
                end_date, 
                target_customers = 'all',
                minimum_order_amount = 0 
            } = campaignData;

            // This would typically be stored in a campaigns table
            // For now, we'll apply bonus points directly to qualifying orders
            
            // Get qualifying customers
            let customerQuery = 'SELECT user_id FROM customer_loyalty WHERE program_id = ?';
            const params = [programId];
            
            if (target_customers === 'tier_specific' && campaignData.target_tier_id) {
                customerQuery += ' AND current_tier_id = ?';
                params.push(campaignData.target_tier_id);
            }

            const [customers] = await connection.execute(customerQuery, params);

            // Apply bonus points to recent qualifying orders
            for (const customer of customers) {
                const [orders] = await connection.execute(`
                    SELECT id, total_amount FROM orders 
                    WHERE user_id = ? 
                    AND status = 'completed'
                    AND created_at BETWEEN ? AND ?
                    AND total_amount >= ?
                `, [customer.user_id, start_date, end_date, minimum_order_amount]);

                for (const order of orders) {
                    const bonusPoints = Math.floor(order.total_amount * bonus_multiplier);
                    
                    if (bonusPoints > 0) {
                        await this.earnPoints(
                            customer.user_id,
                            programId,
                            0, // No base points, just bonus
                            order.id,
                            `Bonus points campaign: ${name}`
                        );
                    }
                }
            }

            await connection.commit();
            return { success: true, campaign_name: name };
        } catch (error) {
            await connection.rollback();
            throw new Error(`Failed to create bonus points campaign: ${error.message}`);
        } finally {
            connection.release();
        }
    }
}

module.exports = LoyaltyService;


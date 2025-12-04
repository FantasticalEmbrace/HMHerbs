// HM Herbs Analytics and Monitoring Service
// Comprehensive monitoring and reporting for all integrations

class AnalyticsService {
    constructor(db) {
        this.db = db;
    }

    // Vendor Performance Analytics
    async getVendorPerformanceMetrics(vendorId = null, dateRange = 30) {
        let vendorFilter = '';
        const params = [dateRange];
        
        if (vendorId) {
            vendorFilter = 'AND v.id = ?';
            params.push(vendorId);
        }

        const [metrics] = await this.db.execute(`
            SELECT 
                v.id,
                v.name as vendor_name,
                v.status,
                v.rating,
                COUNT(DISTINCT vp.product_id) as total_products,
                COUNT(DISTINCT CASE WHEN vp.mapping_status = 'mapped' THEN vp.product_id END) as mapped_products,
                COUNT(DISTINCT CASE WHEN vp.mapping_status = 'conflict' THEN vp.product_id END) as conflict_products,
                COUNT(DISTINCT vci.id) as total_imports,
                COUNT(DISTINCT CASE WHEN vci.status = 'completed' THEN vci.id END) as successful_imports,
                COUNT(DISTINCT CASE WHEN vci.status = 'failed' THEN vci.id END) as failed_imports,
                AVG(vp.vendor_price) as avg_product_price,
                SUM(CASE WHEN vci.status = 'completed' THEN vci.new_products ELSE 0 END) as total_new_products,
                SUM(CASE WHEN vci.status = 'completed' THEN vci.updated_products ELSE 0 END) as total_updated_products,
                MAX(v.last_catalog_sync) as last_sync_date,
                DATEDIFF(NOW(), MAX(v.last_catalog_sync)) as days_since_last_sync
            FROM vendors v
            LEFT JOIN vendor_products vp ON v.id = vp.vendor_id
            LEFT JOIN vendor_catalog_imports vci ON v.id = vci.vendor_id 
                AND vci.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE 1=1 ${vendorFilter}
            GROUP BY v.id
            ORDER BY v.name
        `, params);

        return metrics;
    }

    async getVendorCatalogImportTrends(vendorId, days = 30) {
        const [trends] = await this.db.execute(`
            SELECT 
                DATE(created_at) as import_date,
                COUNT(*) as import_count,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_imports,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_imports,
                SUM(CASE WHEN status = 'completed' THEN new_products ELSE 0 END) as new_products,
                SUM(CASE WHEN status = 'completed' THEN updated_products ELSE 0 END) as updated_products,
                AVG(CASE WHEN status = 'completed' THEN 
                    TIMESTAMPDIFF(MINUTE, started_at, completed_at) ELSE NULL END) as avg_duration_minutes
            FROM vendor_catalog_imports
            WHERE vendor_id = ? 
            AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY import_date DESC
        `, [vendorId, days]);

        return trends;
    }

    // POS Integration Health Monitoring
    async getPOSSystemHealth(systemId = null) {
        let systemFilter = '';
        const params = [];
        
        if (systemId) {
            systemFilter = 'AND ps.id = ?';
            params.push(systemId);
        }

        const [health] = await this.db.execute(`
            SELECT 
                ps.id,
                ps.name as system_name,
                ps.system_type,
                ps.status,
                ps.last_sync,
                ps.last_error,
                TIMESTAMPDIFF(MINUTE, ps.last_sync, NOW()) as minutes_since_last_sync,
                COUNT(pt.id) as total_transactions_24h,
                COUNT(CASE WHEN pt.status = 'completed' THEN 1 END) as successful_transactions_24h,
                COUNT(CASE WHEN pt.status = 'failed' THEN 1 END) as failed_transactions_24h,
                COUNT(CASE WHEN pt.status = 'pending' THEN 1 END) as pending_transactions,
                AVG(CASE WHEN pt.status = 'completed' THEN 
                    TIMESTAMPDIFF(SECOND, pt.created_at, pt.processed_at) END) as avg_processing_time_seconds,
                COUNT(CASE WHEN pt.transaction_type = 'inventory_sync' AND pt.status = 'completed' THEN 1 END) as inventory_syncs_24h,
                COUNT(CASE WHEN pt.transaction_type = 'webhook' AND pt.status = 'completed' THEN 1 END) as webhooks_processed_24h
            FROM pos_systems ps
            LEFT JOIN pos_transactions pt ON ps.id = pt.pos_system_id 
                AND pt.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            WHERE 1=1 ${systemFilter}
            GROUP BY ps.id
            ORDER BY ps.name
        `, params);

        // Add health status assessment
        return health.map(system => {
            let healthStatus = 'healthy';
            const issues = [];

            if (system.status === 'error') {
                healthStatus = 'critical';
                issues.push('System status is error');
            } else if (system.status === 'inactive') {
                healthStatus = 'warning';
                issues.push('System is inactive');
            }

            if (system.minutes_since_last_sync > 120) { // 2 hours
                healthStatus = healthStatus === 'healthy' ? 'warning' : 'critical';
                issues.push('Last sync was over 2 hours ago');
            }

            if (system.failed_transactions_24h > system.successful_transactions_24h * 0.1) {
                healthStatus = 'warning';
                issues.push('High failure rate (>10%)');
            }

            if (system.pending_transactions > 10) {
                healthStatus = 'warning';
                issues.push('Many pending transactions');
            }

            return {
                ...system,
                health_status: healthStatus,
                issues: issues
            };
        });
    }

    async getPOSTransactionTrends(systemId, days = 7) {
        const [trends] = await this.db.execute(`
            SELECT 
                DATE(created_at) as transaction_date,
                HOUR(created_at) as transaction_hour,
                transaction_type,
                direction,
                COUNT(*) as transaction_count,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_count,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
                AVG(CASE WHEN status = 'completed' THEN 
                    TIMESTAMPDIFF(SECOND, created_at, processed_at) END) as avg_processing_time
            FROM pos_transactions
            WHERE pos_system_id = ? 
            AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at), HOUR(created_at), transaction_type, direction
            ORDER BY transaction_date DESC, transaction_hour DESC
        `, [systemId, days]);

        return trends;
    }

    // Gift Card Analytics
    async getGiftCardMetrics(dateRange = 30) {
        const [metrics] = await this.db.execute(`
            SELECT 
                COUNT(*) as total_cards_issued,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_cards,
                COUNT(CASE WHEN status = 'redeemed' THEN 1 END) as fully_redeemed_cards,
                COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_cards,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_cards,
                SUM(initial_amount) as total_value_issued,
                SUM(current_balance) as total_outstanding_balance,
                SUM(initial_amount - current_balance) as total_value_redeemed,
                AVG(initial_amount) as avg_card_value,
                COUNT(CASE WHEN current_balance > 0 AND current_balance < initial_amount THEN 1 END) as partially_used_cards,
                COUNT(CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURDATE() AND status = 'active' THEN 1 END) as cards_needing_expiry
            FROM gift_cards
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        `, [dateRange]);

        const [transactionMetrics] = await this.db.execute(`
            SELECT 
                transaction_type,
                COUNT(*) as transaction_count,
                SUM(ABS(amount)) as total_amount,
                AVG(ABS(amount)) as avg_transaction_amount
            FROM gift_card_transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY transaction_type
        `, [dateRange]);

        const [dailyTrends] = await this.db.execute(`
            SELECT 
                DATE(created_at) as transaction_date,
                COUNT(CASE WHEN transaction_type = 'purchase' THEN 1 END) as cards_purchased,
                COUNT(CASE WHEN transaction_type = 'redemption' THEN 1 END) as redemptions,
                SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END) as value_purchased,
                SUM(CASE WHEN transaction_type = 'redemption' THEN ABS(amount) ELSE 0 END) as value_redeemed
            FROM gift_card_transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY transaction_date DESC
        `, [dateRange]);

        return {
            overview: metrics[0],
            transaction_breakdown: transactionMetrics,
            daily_trends: dailyTrends
        };
    }

    async getGiftCardRedemptionPatterns() {
        const [patterns] = await this.db.execute(`
            SELECT 
                CASE 
                    WHEN DATEDIFF(first_redemption, issued_date) <= 7 THEN '0-7 days'
                    WHEN DATEDIFF(first_redemption, issued_date) <= 30 THEN '8-30 days'
                    WHEN DATEDIFF(first_redemption, issued_date) <= 90 THEN '31-90 days'
                    WHEN DATEDIFF(first_redemption, issued_date) <= 365 THEN '91-365 days'
                    ELSE '365+ days'
                END as redemption_timeframe,
                COUNT(*) as card_count,
                AVG(initial_amount) as avg_card_value,
                AVG(DATEDIFF(first_redemption, issued_date)) as avg_days_to_first_use
            FROM (
                SELECT 
                    gc.id,
                    gc.issued_date,
                    gc.initial_amount,
                    MIN(gct.created_at) as first_redemption
                FROM gift_cards gc
                JOIN gift_card_transactions gct ON gc.id = gct.gift_card_id
                WHERE gct.transaction_type = 'redemption'
                GROUP BY gc.id
            ) as redemption_data
            GROUP BY redemption_timeframe
            ORDER BY 
                CASE redemption_timeframe
                    WHEN '0-7 days' THEN 1
                    WHEN '8-30 days' THEN 2
                    WHEN '31-90 days' THEN 3
                    WHEN '91-365 days' THEN 4
                    ELSE 5
                END
        `);

        return patterns;
    }

    // Loyalty Program Analytics
    async getLoyaltyProgramMetrics(programId = null, dateRange = 30) {
        let programFilter = '';
        const params = [dateRange];
        
        if (programId) {
            programFilter = 'AND lp.id = ?';
            params.push(programId);
        }

        const [metrics] = await this.db.execute(`
            SELECT 
                lp.id as program_id,
                lp.name as program_name,
                lp.program_type,
                COUNT(DISTINCT cl.user_id) as total_members,
                COUNT(DISTINCT CASE WHEN cl.last_activity_date >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN cl.user_id END) as active_members_30d,
                COUNT(DISTINCT CASE WHEN cl.enrolled_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN cl.user_id END) as new_members,
                SUM(cl.current_points) as total_outstanding_points,
                SUM(cl.lifetime_points) as total_lifetime_points,
                SUM(cl.total_earned) as total_points_earned,
                SUM(cl.total_redeemed) as total_points_redeemed,
                SUM(cl.total_spent) as total_member_spending,
                AVG(cl.current_points) as avg_points_balance,
                AVG(cl.total_spent) as avg_member_lifetime_spending,
                COUNT(DISTINCT CASE WHEN cl.current_tier_id IS NOT NULL THEN cl.user_id END) as tiered_members
            FROM loyalty_programs lp
            LEFT JOIN customer_loyalty cl ON lp.id = cl.program_id
            WHERE 1=1 ${programFilter}
            GROUP BY lp.id
            ORDER BY lp.name
        `, params);

        const [engagementMetrics] = await this.db.execute(`
            SELECT 
                lp.id as program_id,
                COUNT(DISTINCT lt.customer_loyalty_id) as active_customers_period,
                COUNT(CASE WHEN lt.transaction_type = 'earn' THEN 1 END) as points_earned_transactions,
                COUNT(CASE WHEN lt.transaction_type = 'redeem' THEN 1 END) as points_redeemed_transactions,
                SUM(CASE WHEN lt.transaction_type = 'earn' THEN lt.points_change ELSE 0 END) as total_points_earned_period,
                SUM(CASE WHEN lt.transaction_type = 'redeem' THEN ABS(lt.points_change) ELSE 0 END) as total_points_redeemed_period,
                AVG(CASE WHEN lt.transaction_type = 'earn' THEN lt.points_change END) as avg_points_per_earn,
                AVG(CASE WHEN lt.transaction_type = 'redeem' THEN ABS(lt.points_change) END) as avg_points_per_redemption
            FROM loyalty_programs lp
            LEFT JOIN customer_loyalty cl ON lp.id = cl.program_id
            LEFT JOIN loyalty_transactions lt ON cl.id = lt.customer_loyalty_id
                AND lt.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE 1=1 ${programFilter}
            GROUP BY lp.id
        `, params);

        // Combine metrics
        const combinedMetrics = metrics.map(program => {
            const engagement = engagementMetrics.find(e => e.program_id === program.program_id) || {};
            return { ...program, ...engagement };
        });

        return combinedMetrics;
    }

    async getLoyaltyTierDistribution(programId) {
        const [distribution] = await this.db.execute(`
            SELECT 
                lt.tier_name,
                lt.tier_level,
                lt.minimum_spend,
                lt.minimum_points,
                lt.points_multiplier,
                lt.discount_percentage,
                COUNT(cl.user_id) as member_count,
                AVG(cl.current_points) as avg_points,
                AVG(cl.total_spent) as avg_spending,
                SUM(cl.current_points) as total_tier_points
            FROM loyalty_tiers lt
            LEFT JOIN customer_loyalty cl ON lt.id = cl.current_tier_id
            WHERE lt.program_id = ?
            GROUP BY lt.id
            ORDER BY lt.tier_level
        `, [programId]);

        return distribution;
    }

    // Comprehensive Dashboard Metrics
    async getDashboardOverview(dateRange = 30) {
        // Vendor metrics
        const [vendorMetrics] = await this.db.execute(`
            SELECT 
                COUNT(*) as total_vendors,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_vendors,
                COUNT(CASE WHEN last_catalog_sync >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as recently_synced_vendors,
                SUM(total_products) as total_vendor_products
            FROM vendors
        `);

        // POS metrics
        const [posMetrics] = await this.db.execute(`
            SELECT 
                COUNT(*) as total_pos_systems,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_pos_systems,
                COUNT(CASE WHEN last_sync >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as recently_synced_pos
            FROM pos_systems
        `);

        // Gift card metrics
        const [giftCardMetrics] = await this.db.execute(`
            SELECT 
                COUNT(*) as total_gift_cards,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_gift_cards,
                SUM(current_balance) as outstanding_gift_card_value,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) as new_gift_cards
            FROM gift_cards
        `, [dateRange]);

        // Loyalty metrics
        const [loyaltyMetrics] = await this.db.execute(`
            SELECT 
                COUNT(DISTINCT lp.id) as total_loyalty_programs,
                COUNT(DISTINCT CASE WHEN lp.is_active THEN lp.id END) as active_loyalty_programs,
                COUNT(DISTINCT cl.user_id) as total_loyalty_members,
                SUM(cl.current_points) as total_outstanding_points
            FROM loyalty_programs lp
            LEFT JOIN customer_loyalty cl ON lp.id = cl.program_id
        `);

        // Recent activity
        const [recentActivity] = await this.db.execute(`
            SELECT 
                'vendor_import' as activity_type,
                COUNT(*) as count,
                MAX(created_at) as last_activity
            FROM vendor_catalog_imports
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            
            UNION ALL
            
            SELECT 
                'pos_transaction' as activity_type,
                COUNT(*) as count,
                MAX(created_at) as last_activity
            FROM pos_transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            
            UNION ALL
            
            SELECT 
                'gift_card_transaction' as activity_type,
                COUNT(*) as count,
                MAX(created_at) as last_activity
            FROM gift_card_transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            
            UNION ALL
            
            SELECT 
                'loyalty_transaction' as activity_type,
                COUNT(*) as count,
                MAX(created_at) as last_activity
            FROM loyalty_transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        `, [dateRange, dateRange, dateRange, dateRange]);

        return {
            vendors: vendorMetrics[0],
            pos_systems: posMetrics[0],
            gift_cards: giftCardMetrics[0],
            loyalty: loyaltyMetrics[0],
            recent_activity: recentActivity
        };
    }

    // Alert and Monitoring
    async getSystemAlerts() {
        const alerts = [];

        // Check for failed vendor imports
        const [failedImports] = await this.db.execute(`
            SELECT v.name, vci.created_at, vci.error_details
            FROM vendor_catalog_imports vci
            JOIN vendors v ON vci.vendor_id = v.id
            WHERE vci.status = 'failed' 
            AND vci.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY vci.created_at DESC
            LIMIT 10
        `);

        failedImports.forEach(import_ => {
            alerts.push({
                type: 'error',
                category: 'vendor_import',
                message: `Failed catalog import for vendor: ${import_.name}`,
                timestamp: import_.created_at,
                details: import_.error_details
            });
        });

        // Check for POS system errors
        const [posErrors] = await this.db.execute(`
            SELECT ps.name, ps.last_error, ps.updated_at
            FROM pos_systems ps
            WHERE ps.status = 'error' 
            AND ps.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);

        posErrors.forEach(system => {
            alerts.push({
                type: 'error',
                category: 'pos_system',
                message: `POS system error: ${system.name}`,
                timestamp: system.updated_at,
                details: system.last_error
            });
        });

        // Check for stale POS syncs
        const [staleSyncs] = await this.db.execute(`
            SELECT name, last_sync
            FROM pos_systems
            WHERE status = 'active' 
            AND (last_sync IS NULL OR last_sync < DATE_SUB(NOW(), INTERVAL 4 HOUR))
        `);

        staleSyncs.forEach(system => {
            alerts.push({
                type: 'warning',
                category: 'pos_sync',
                message: `POS system hasn't synced recently: ${system.name}`,
                timestamp: system.last_sync || new Date(),
                details: `Last sync: ${system.last_sync || 'Never'}`
            });
        });

        // Check for expired gift cards that need processing
        const [expiredCards] = await this.db.execute(`
            SELECT COUNT(*) as count
            FROM gift_cards
            WHERE status = 'active' 
            AND expiry_date IS NOT NULL 
            AND expiry_date < CURDATE()
        `);

        if (expiredCards[0].count > 0) {
            alerts.push({
                type: 'info',
                category: 'gift_cards',
                message: `${expiredCards[0].count} gift cards need to be expired`,
                timestamp: new Date(),
                details: 'Run gift card expiration process'
            });
        }

        // Check for loyalty points that need expiration
        const [expiringPoints] = await this.db.execute(`
            SELECT COUNT(*) as count
            FROM loyalty_transactions
            WHERE transaction_type = 'earn' 
            AND expires_at IS NOT NULL 
            AND expires_at < CURDATE()
            AND id NOT IN (
                SELECT DISTINCT reference_number 
                FROM loyalty_transactions 
                WHERE transaction_type = 'expire' 
                AND reference_number IS NOT NULL
            )
        `);

        if (expiringPoints[0].count > 0) {
            alerts.push({
                type: 'info',
                category: 'loyalty_points',
                message: `${expiringPoints[0].count} loyalty point transactions need expiration processing`,
                timestamp: new Date(),
                details: 'Run loyalty points expiration process'
            });
        }

        return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Performance Monitoring
    async getPerformanceMetrics(hours = 24) {
        const [dbMetrics] = await this.db.execute(`
            SELECT 
                'vendor_imports' as operation,
                COUNT(*) as total_operations,
                AVG(TIMESTAMPDIFF(SECOND, started_at, completed_at)) as avg_duration_seconds,
                MAX(TIMESTAMPDIFF(SECOND, started_at, completed_at)) as max_duration_seconds,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_operations
            FROM vendor_catalog_imports
            WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND completed_at IS NOT NULL
            
            UNION ALL
            
            SELECT 
                'pos_transactions' as operation,
                COUNT(*) as total_operations,
                AVG(TIMESTAMPDIFF(SECOND, created_at, processed_at)) as avg_duration_seconds,
                MAX(TIMESTAMPDIFF(SECOND, created_at, processed_at)) as max_duration_seconds,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_operations
            FROM pos_transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND processed_at IS NOT NULL
        `, [hours, hours]);

        return dbMetrics;
    }
}

module.exports = AnalyticsService;


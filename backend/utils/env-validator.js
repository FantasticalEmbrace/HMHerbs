/**
 * Environment Variable Validator
 * Centralized validation for critical environment variables
 * Prevents duplicate validation across multiple files
 */

const logger = require('./logger');

class EnvironmentValidator {
    constructor() {
        this.validationResults = new Map();
        this.hasValidated = false;
    }

    /**
     * Validate all critical environment variables once at startup
     * @returns {Object} Validation results with success status and missing variables
     */
    validateAll() {
        if (this.hasValidated) {
            return this.getValidationSummary();
        }

        const requiredVars = [
            {
                name: 'JWT_SECRET',
                description: 'JWT token signing secret',
                critical: true
            },
            {
                name: 'POS_ENCRYPTION_KEY',
                description: 'POS credentials encryption key',
                critical: true
            },
            {
                name: 'DATABASE_URL',
                description: 'Database connection string',
                critical: false
            },
            {
                name: 'REDIS_URL',
                description: 'Redis cache connection string',
                critical: false
            }
        ];

        const missing = [];
        const warnings = [];

        for (const envVar of requiredVars) {
            const value = process.env[envVar.name];
            const isPresent = value && value.trim().length > 0;

            this.validationResults.set(envVar.name, {
                present: isPresent,
                critical: envVar.critical,
                description: envVar.description
            });

            if (!isPresent) {
                if (envVar.critical) {
                    missing.push(envVar);
                    logger.error(`CRITICAL: ${envVar.name} environment variable is not set - ${envVar.description}`);
                } else {
                    warnings.push(envVar);
                    logger.warn(`WARNING: ${envVar.name} environment variable is not set - ${envVar.description}`);
                }
            } else {
                logger.info(`✅ ${envVar.name} environment variable is properly configured`);
            }
        }

        this.hasValidated = true;

        if (missing.length > 0) {
            logger.error(`❌ ${missing.length} critical environment variables are missing. Application may not function properly.`);
            logger.error('Missing critical variables:', missing.map(v => v.name).join(', '));
        }

        if (warnings.length > 0) {
            logger.warn(`⚠️ ${warnings.length} optional environment variables are missing. Some features may be disabled.`);
            logger.warn('Missing optional variables:', warnings.map(v => v.name).join(', '));
        }

        if (missing.length === 0 && warnings.length === 0) {
            logger.info('🎉 All environment variables are properly configured!');
        }

        return this.getValidationSummary();
    }

    /**
     * Check if a specific environment variable is present and valid
     * @param {string} varName - Environment variable name
     * @returns {boolean} True if variable is present and valid
     */
    isValid(varName) {
        if (!this.hasValidated) {
            this.validateAll();
        }

        const result = this.validationResults.get(varName);
        return result ? result.present : false;
    }

    /**
     * Get validation summary
     * @returns {Object} Summary of validation results
     */
    getValidationSummary() {
        const summary = {
            allValid: true,
            criticalValid: true,
            missing: [],
            warnings: [],
            results: {}
        };

        for (const [varName, result] of this.validationResults) {
            summary.results[varName] = result;

            if (!result.present) {
                if (result.critical) {
                    summary.missing.push(varName);
                    summary.criticalValid = false;
                    summary.allValid = false;
                } else {
                    summary.warnings.push(varName);
                    summary.allValid = false;
                }
            }
        }

        return summary;
    }

    /**
     * Throw error if critical environment variables are missing
     * Use this in application startup to fail fast
     */
    requireCriticalVars() {
        const summary = this.getValidationSummary();
        
        if (!summary.criticalValid) {
            const missingVars = summary.missing.join(', ');
            throw new Error(`Critical environment variables missing: ${missingVars}. Application cannot start.`);
        }
    }

    /**
     * Get a specific environment variable with validation
     * @param {string} varName - Environment variable name
     * @returns {string|null} Environment variable value or null if not present
     */
    get(varName) {
        if (!this.isValid(varName)) {
            return null;
        }
        return process.env[varName];
    }

    /**
     * Get a required environment variable, throw error if missing
     * @param {string} varName - Environment variable name
     * @returns {string} Environment variable value
     * @throws {Error} If environment variable is missing
     */
    require(varName) {
        const value = this.get(varName);
        if (!value) {
            throw new Error(`Required environment variable ${varName} is not set`);
        }
        return value;
    }
}

// Export singleton instance
const envValidator = new EnvironmentValidator();

module.exports = envValidator;

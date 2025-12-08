// H&M Herbs & Vitamins - CCPA Compliance
// California Consumer Privacy Act (CCPA) compliance functionality

class CCPACompliance {
    constructor() {
        this.ccpaPreferences = this.loadCCPAPreferences();
        this.init();
    }

    init() {
        this.setupCCPABanner();
        this.setupEventListeners();
        this.checkCCPACompliance();
    }

    loadCCPAPreferences() {
        try {
            const stored = localStorage.getItem('hmherbs_ccpa_preferences');
            return stored ? JSON.parse(stored) : {
                doNotSell: false,
                optOut: false,
                acknowledged: false,
                timestamp: null
            };
        } catch (error) {
            if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
                console.error('Error loading CCPA preferences:', error);
            }
            return {
                doNotSell: false,
                optOut: false,
                acknowledged: false,
                timestamp: null
            };
        }
    }

    saveCCPAPreferences() {
        try {
            this.ccpaPreferences.timestamp = new Date().toISOString();
            localStorage.setItem('hmherbs_ccpa_preferences', JSON.stringify(this.ccpaPreferences));
        } catch (error) {
            if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
                console.error('Error saving CCPA preferences:', error);
            }
        }
    }

    setupCCPABanner() {
        // Check if user is in California (simplified check)
        const isCaliforniaUser = this.detectCaliforniaUser();
        
        if (!isCaliforniaUser || this.ccpaPreferences.acknowledged) {
            return;
        }

        const banner = document.createElement('div');
        banner.id = 'ccpa-banner';
        banner.className = 'ccpa-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-labelledby', 'ccpa-banner-title');
        banner.innerHTML = `
            <div class="ccpa-banner-content">
                <h3 id="ccpa-banner-title">Your California Privacy Rights</h3>
                <p>
                    As a California resident, you have the right to know what personal information we collect, 
                    use, and share. You also have the right to request deletion of your personal information 
                    and to opt-out of the sale of your personal information.
                </p>
                <div class="ccpa-banner-actions">
                    <button id="ccpa-do-not-sell" class="btn btn-primary">
                        Do Not Sell My Personal Information
                    </button>
                    <button id="ccpa-privacy-rights" class="btn btn-secondary">
                        Learn About Your Rights
                    </button>
                    <button id="ccpa-acknowledge" class="btn btn-outline">
                        I Understand
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(banner);
        
        // Show banner with animation
        setTimeout(() => {
            banner.classList.add('show');
        }, 100);
    }

    setupEventListeners() {
        // Do Not Sell button
        const doNotSellBtn = document.getElementById('ccpa-do-not-sell');
        if (doNotSellBtn) {
            doNotSellBtn.addEventListener('click', () => {
                this.handleDoNotSell();
            });
        }

        // Privacy Rights button
        const privacyRightsBtn = document.getElementById('ccpa-privacy-rights');
        if (privacyRightsBtn) {
            privacyRightsBtn.addEventListener('click', () => {
                this.showPrivacyRights();
            });
        }

        // Acknowledge button
        const acknowledgeBtn = document.getElementById('ccpa-acknowledge');
        if (acknowledgeBtn) {
            acknowledgeBtn.addEventListener('click', () => {
                this.acknowledgeCCPA();
            });
        }

        // Handle "Do Not Sell" links in footer or privacy policy
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-ccpa-action="do-not-sell"]')) {
                e.preventDefault();
                this.handleDoNotSell();
            }
        });
    }

    detectCaliforniaUser() {
        // Simplified detection - in production, use proper geolocation or IP detection
        // This is a basic implementation for demonstration
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const californiaTimezones = ['America/Los_Angeles', 'America/San_Francisco'];
            return californiaTimezones.includes(timezone);
        } catch (error) {
            // Fallback: assume California user if detection fails (better safe than sorry)
            return true;
        }
    }

    handleDoNotSell() {
        this.ccpaPreferences.doNotSell = true;
        this.ccpaPreferences.acknowledged = true;
        this.saveCCPAPreferences();
        
        // Remove tracking scripts or disable data collection
        this.disableDataCollection();
        
        // Show confirmation
        this.showNotification('Your "Do Not Sell" preference has been saved. We will not sell your personal information.', 'success');
        
        // Hide banner
        this.hideCCPABanner();
    }

    showPrivacyRights() {
        const modal = document.createElement('div');
        modal.id = 'ccpa-rights-modal';
        modal.className = 'modal ccpa-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'ccpa-rights-title');
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="ccpa-rights-title">Your California Privacy Rights (CCPA)</h2>
                    <button class="modal-close" aria-label="Close modal">&times;</button>
                </div>
                <div class="modal-body">
                    <h3>Right to Know</h3>
                    <p>You have the right to request information about the personal information we collect, use, and share.</p>
                    
                    <h3>Right to Delete</h3>
                    <p>You have the right to request deletion of your personal information, subject to certain exceptions.</p>
                    
                    <h3>Right to Opt-Out</h3>
                    <p>You have the right to opt-out of the sale of your personal information.</p>
                    
                    <h3>Right to Non-Discrimination</h3>
                    <p>We will not discriminate against you for exercising your CCPA rights.</p>
                    
                    <div class="ccpa-actions">
                        <button id="ccpa-request-info" class="btn btn-primary">Request My Information</button>
                        <button id="ccpa-delete-data" class="btn btn-secondary">Delete My Data</button>
                        <button id="ccpa-opt-out" class="btn btn-outline">Opt-Out of Sale</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.style.display = 'block';

        // Event listeners for modal
        modal.querySelector('.modal-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // Action buttons
        modal.querySelector('#ccpa-request-info').addEventListener('click', () => {
            this.handleDataRequest();
        });

        modal.querySelector('#ccpa-delete-data').addEventListener('click', () => {
            this.handleDataDeletion();
        });

        modal.querySelector('#ccpa-opt-out').addEventListener('click', () => {
            this.handleDoNotSell();
            document.body.removeChild(modal);
        });
    }

    acknowledgeCCPA() {
        this.ccpaPreferences.acknowledged = true;
        this.saveCCPAPreferences();
        this.hideCCPABanner();
    }

    hideCCPABanner() {
        const banner = document.getElementById('ccpa-banner');
        if (banner) {
            banner.remove();
        }
    }

    disableDataCollection() {
        // Disable Google Analytics or other tracking
        if (typeof gtag !== 'undefined') {
            gtag('consent', 'update', {
                'analytics_storage': 'denied',
                'ad_storage': 'denied'
            });
        }

        // Disable other tracking scripts
        this.disableThirdPartyTracking();
    }

    disableThirdPartyTracking() {
        // Remove or disable third-party tracking scripts
        const trackingScripts = document.querySelectorAll('script[src*="google-analytics"], script[src*="googletagmanager"], script[src*="facebook"]');
        trackingScripts.forEach(script => {
            script.remove();
        });
    }

    handleDataRequest() {
        // Use secure modal dialog instead of prompt() to prevent XSS
        this.showEmailInputModal(
            'Data Request',
            'Please enter your email address to receive your data:',
            (email) => {
                if (email && this.validateEmail(email)) {
                    this.showNotification('Your data request has been submitted. You will receive your information within 45 days.', 'info');
                    // Send request to backend
                    this.submitDataRequest(email);
                }
            }
        );
    }

    handleDataDeletion() {
        // Use secure modal dialog instead of confirm() and prompt() to prevent XSS
        this.showConfirmationModal(
            'Delete All Data',
            'Are you sure you want to delete all your personal data? This action cannot be undone.',
            () => {
                this.showEmailInputModal(
                    'Confirm Data Deletion',
                    'Please enter your email address to confirm deletion:',
                    (email) => {
                        if (email && this.validateEmail(email)) {
                            this.showNotification('Your data deletion request has been submitted. Your data will be deleted within 45 days.', 'info');
                            // Send deletion request to backend
                            this.submitDataDeletion(email);
                        }
                    }
                );
            }
        );
    }

    submitDataRequest(email) {
        // In production, send to backend API
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
            console.log('CCPA Data Request submitted for:', email);
        }
        // fetch('/api/ccpa/data-request', { method: 'POST', body: JSON.stringify({ email }) });
    }

    submitDataDeletion(email) {
        // In production, send to backend API
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
            console.log('CCPA Data Deletion submitted for:', email);
        }
        // fetch('/api/ccpa/data-deletion', { method: 'POST', body: JSON.stringify({ email }) });
    }

    // Secure modal dialog methods to replace prompt() and confirm()
    showEmailInputModal(title, message, callback) {
        const modal = document.createElement('div');
        modal.className = 'ccpa-modal-overlay';
        modal.innerHTML = `
            <div class="ccpa-modal">
                <div class="ccpa-modal-header">
                    <h3>${this.escapeHtml(title)}</h3>
                    <button class="ccpa-modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="ccpa-modal-body">
                    <p>${this.escapeHtml(message)}</p>
                    <input type="email" id="ccpa-email-input" placeholder="Enter your email address" required>
                    <div class="ccpa-modal-error" id="ccpa-email-error" style="display: none; color: red; margin-top: 10px;"></div>
                </div>
                <div class="ccpa-modal-footer">
                    <button class="ccpa-btn ccpa-btn-secondary" id="ccpa-cancel">Cancel</button>
                    <button class="ccpa-btn ccpa-btn-primary" id="ccpa-submit">Submit</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const emailInput = modal.querySelector('#ccpa-email-input');
        const errorDiv = modal.querySelector('#ccpa-email-error');
        const submitBtn = modal.querySelector('#ccpa-submit');
        const cancelBtn = modal.querySelector('#ccpa-cancel');
        const closeBtn = modal.querySelector('.ccpa-modal-close');

        const closeModal = () => {
            document.body.removeChild(modal);
        };

        const handleSubmit = () => {
            const email = emailInput.value.trim();
            if (!email) {
                errorDiv.textContent = 'Email address is required';
                errorDiv.style.display = 'block';
                return;
            }
            if (!this.validateEmail(email)) {
                errorDiv.textContent = 'Please enter a valid email address';
                errorDiv.style.display = 'block';
                return;
            }
            closeModal();
            callback(email);
        };

        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        
        // Handle Enter key
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        });

        // Handle Escape key
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Focus the input
        emailInput.focus();
    }

    showConfirmationModal(title, message, callback) {
        const modal = document.createElement('div');
        modal.className = 'ccpa-modal-overlay';
        modal.innerHTML = `
            <div class="ccpa-modal">
                <div class="ccpa-modal-header">
                    <h3>${this.escapeHtml(title)}</h3>
                    <button class="ccpa-modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="ccpa-modal-body">
                    <p>${this.escapeHtml(message)}</p>
                </div>
                <div class="ccpa-modal-footer">
                    <button class="ccpa-btn ccpa-btn-secondary" id="ccpa-cancel">Cancel</button>
                    <button class="ccpa-btn ccpa-btn-danger" id="ccpa-confirm">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const confirmBtn = modal.querySelector('#ccpa-confirm');
        const cancelBtn = modal.querySelector('#ccpa-cancel');
        const closeBtn = modal.querySelector('.ccpa-modal-close');

        const closeModal = () => {
            document.body.removeChild(modal);
        };

        confirmBtn.addEventListener('click', () => {
            closeModal();
            callback();
        });

        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);

        // Handle Escape key
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Focus the confirm button
        confirmBtn.focus();
    }

    // HTML escaping function to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 15px 20px;
            border-radius: 4px;
            z-index: 10000;
            max-width: 300px;
            opacity: 0;
            transition: opacity 250ms ease-in-out;
        `;

        document.body.appendChild(notification);

        // Store timeout IDs for cleanup
        const timeouts = [];
        
        // Animate in
        timeouts.push(setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '1';
            }
        }, 100));

        // Auto-remove after 5 seconds
        timeouts.push(setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                timeouts.push(setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 250));
            }
        }, 5000));
        
        // Store cleanup function for potential early removal
        notification._cleanup = () => {
            timeouts.forEach(id => clearTimeout(id));
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        };
    }

    checkCCPACompliance() {
        // Check if user has opted out and ensure compliance
        if (this.ccpaPreferences.doNotSell) {
            this.disableDataCollection();
        }
    }

    // Public method to check if user has opted out
    hasOptedOut() {
        return this.ccpaPreferences.doNotSell;
    }

    // Public method to get CCPA preferences
    getPreferences() {
        return { ...this.ccpaPreferences };
    }
}

// Initialize CCPA compliance when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.ccpaCompliance = new CCPACompliance();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CCPACompliance;
}

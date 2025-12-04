// GDPR Compliance System for H&M Herbs & Vitamins
// Handles cookie consent, privacy preferences, and data management

class GDPRCompliance {
    constructor() {
        this.cookieConsent = {
            essential: true, // Always required
            analytics: false,
            marketing: false
        };
        
        this.consentGiven = false;
        this.consentTimestamp = null;
        this.eventListeners = new Map(); // Track event listeners for cleanup
        
        this.init();
    }
    
    init() {
        // Load existing consent preferences
        this.loadConsentPreferences();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Show cookie banner if consent not given
        if (!this.consentGiven) {
            this.showCookieBanner();
        } else {
            // Apply consent preferences
            this.applyConsentPreferences();
        }
        
        console.log('GDPR Compliance system initialized');
    }
    
    setupEventListeners() {
        // Cookie banner buttons
        const acceptAllBtn = document.getElementById('cookie-accept');
        const rejectAllBtn = document.getElementById('cookie-reject');
        const settingsBtn = document.getElementById('cookie-settings');
        
        if (acceptAllBtn) {
            acceptAllBtn.addEventListener('click', () => {
                this.acceptAllCookies();
            });
        }
        
        if (rejectAllBtn) {
            rejectAllBtn.addEventListener('click', () => {
                this.rejectNonEssentialCookies();
            });
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showCookieSettingsModal();
            });
        }
        
        // Cookie settings modal buttons
        const savePreferencesBtn = document.getElementById('save-cookie-preferences');
        const acceptAllModalBtn = document.getElementById('accept-all-cookies');
        
        if (savePreferencesBtn) {
            savePreferencesBtn.addEventListener('click', () => {
                this.saveCustomPreferences();
            });
        }
        
        if (acceptAllModalBtn) {
            acceptAllModalBtn.addEventListener('click', () => {
                this.acceptAllCookiesFromModal();
            });
        }
        
        // Cookie preferences link in footer
        const cookiePreferencesBtn = document.getElementById('cookie-preferences');
        if (cookiePreferencesBtn) {
            cookiePreferencesBtn.addEventListener('click', () => {
                this.showCookieSettingsModal();
            });
        }
        
        // Modal close functionality
        const cookieModal = document.getElementById('cookie-modal');
        const modalClose = cookieModal?.querySelector('.modal-close');
        
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                this.closeCookieModal();
            });
        }
        
        // Close modal when clicking outside
        if (cookieModal) {
            cookieModal.addEventListener('click', (e) => {
                if (e.target === cookieModal) {
                    this.closeCookieModal();
                }
            });
        }
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && cookieModal?.classList.contains('show')) {
                this.closeCookieModal();
            }
        });
    }
    
    showCookieBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.classList.add('show');
            banner.setAttribute('aria-hidden', 'false');
            
            // Focus management for accessibility
            const firstButton = banner.querySelector('button');
            if (firstButton) {
                setTimeout(() => firstButton.focus(), 100);
            }
        }
    }
    
    hideCookieBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.classList.remove('show');
            banner.setAttribute('aria-hidden', 'true');
        }
    }
    
    showCookieSettingsModal() {
        const modal = document.getElementById('cookie-modal');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            
            // Update toggle states based on current preferences
            this.updateModalToggles();
            
            // Focus management
            const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (firstFocusable) {
                setTimeout(() => firstFocusable.focus(), 100);
            }
        }
    }
    
    closeCookieModal() {
        const modal = document.getElementById('cookie-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            
            // Clean up event listeners when modal closes
            this.cleanupEventListeners();
        }
    }
    
    // Helper method to add tracked event listeners
    addTrackedEventListener(element, event, handler, key) {
        if (element) {
            element.addEventListener(event, handler);
            this.eventListeners.set(key, { element, event, handler });
        }
    }
    
    // Clean up all tracked event listeners
    cleanupEventListeners() {
        this.eventListeners.forEach(({ element, event, handler }) => {
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        this.eventListeners.clear();
    }
    
    updateModalToggles() {
        const analyticsToggle = document.getElementById('analytics-cookies');
        const marketingToggle = document.getElementById('marketing-cookies');
        
        if (analyticsToggle) {
            analyticsToggle.checked = this.cookieConsent.analytics;
        }
        
        if (marketingToggle) {
            marketingToggle.checked = this.cookieConsent.marketing;
        }
    }
    
    acceptAllCookies() {
        this.cookieConsent = {
            essential: true,
            analytics: true,
            marketing: true
        };
        
        this.saveConsentPreferences();
        this.applyConsentPreferences();
        this.hideCookieBanner();
        
        this.showConsentNotification('All cookies accepted');
        this.announceToScreenReader('All cookies have been accepted');
    }
    
    rejectNonEssentialCookies() {
        this.cookieConsent = {
            essential: true,
            analytics: false,
            marketing: false
        };
        
        this.saveConsentPreferences();
        this.applyConsentPreferences();
        this.hideCookieBanner();
        
        this.showConsentNotification('Only essential cookies accepted');
        this.announceToScreenReader('Only essential cookies have been accepted');
    }
    
    saveCustomPreferences() {
        const analyticsToggle = document.getElementById('analytics-cookies');
        const marketingToggle = document.getElementById('marketing-cookies');
        
        this.cookieConsent = {
            essential: true,
            analytics: analyticsToggle?.checked || false,
            marketing: marketingToggle?.checked || false
        };
        
        this.saveConsentPreferences();
        this.applyConsentPreferences();
        this.closeCookieModal();
        this.hideCookieBanner();
        
        this.showConsentNotification('Cookie preferences saved');
        this.announceToScreenReader('Your cookie preferences have been saved');
    }
    
    acceptAllCookiesFromModal() {
        // Update toggles to true
        const analyticsToggle = document.getElementById('analytics-cookies');
        const marketingToggle = document.getElementById('marketing-cookies');
        
        if (analyticsToggle) analyticsToggle.checked = true;
        if (marketingToggle) marketingToggle.checked = true;
        
        this.acceptAllCookies();
        this.closeCookieModal();
    }
    
    saveConsentPreferences() {
        const consentData = {
            consent: this.cookieConsent,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        try {
            localStorage.setItem('hmherbs_gdpr_consent', JSON.stringify(consentData));
            this.consentGiven = true;
            this.consentTimestamp = consentData.timestamp;
        } catch (error) {
            console.error('Error saving GDPR consent:', error);
        }
    }
    
    loadConsentPreferences() {
        try {
            const savedConsent = localStorage.getItem('hmherbs_gdpr_consent');
            if (savedConsent) {
                const consentData = JSON.parse(savedConsent);
                
                // Check if consent is still valid (not older than 1 year)
                const consentDate = new Date(consentData.timestamp);
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                
                if (consentDate > oneYearAgo) {
                    this.cookieConsent = consentData.consent;
                    this.consentGiven = true;
                    this.consentTimestamp = consentData.timestamp;
                } else {
                    // Consent expired, remove it
                    localStorage.removeItem('hmherbs_gdpr_consent');
                }
            }
        } catch (error) {
            console.error('Error loading GDPR consent:', error);
        }
    }
    
    applyConsentPreferences() {
        // Apply analytics cookies
        if (this.cookieConsent.analytics) {
            this.enableAnalytics();
        } else {
            this.disableAnalytics();
        }
        
        // Apply marketing cookies
        if (this.cookieConsent.marketing) {
            this.enableMarketing();
        } else {
            this.disableMarketing();
        }
        
        // Log consent status
        console.log('GDPR consent applied:', this.cookieConsent);
    }
    
    enableAnalytics() {
        // Enable Google Analytics or other analytics tools
        // This is a placeholder - implement your actual analytics code
        console.log('Analytics cookies enabled');
        
        // Example: Load Google Analytics
        // gtag('consent', 'update', {
        //     'analytics_storage': 'granted'
        // });
    }
    
    disableAnalytics() {
        // Disable analytics and remove existing analytics cookies
        console.log('Analytics cookies disabled');
        
        // Remove analytics cookies
        this.removeCookiesByPattern(['_ga', '_gid', '_gat']);
        
        // Example: Disable Google Analytics
        // gtag('consent', 'update', {
        //     'analytics_storage': 'denied'
        // });
    }
    
    enableMarketing() {
        // Enable marketing/advertising cookies
        console.log('Marketing cookies enabled');
        
        // Example: Enable advertising consent
        // gtag('consent', 'update', {
        //     'ad_storage': 'granted'
        // });
    }
    
    disableMarketing() {
        // Disable marketing cookies and remove existing ones
        console.log('Marketing cookies disabled');
        
        // Remove marketing cookies
        this.removeCookiesByPattern(['_fbp', '_fbc', 'fr']);
        
        // Example: Disable advertising consent
        // gtag('consent', 'update', {
        //     'ad_storage': 'denied'
        // });
    }
    
    removeCookiesByPattern(patterns) {
        // Get all cookies
        const cookies = document.cookie.split(';');
        
        cookies.forEach(cookie => {
            const cookieName = cookie.split('=')[0].trim();
            
            // Check if cookie matches any pattern
            const shouldRemove = patterns.some(pattern => 
                cookieName.includes(pattern)
            );
            
            if (shouldRemove) {
                // Remove cookie by setting expiration to past date
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`;
            }
        });
    }
    
    showConsentNotification(message) {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.className = 'consent-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #059669;
            color: white;
            padding: 1rem 2rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            z-index: 1070;
            opacity: 0;
            transition: opacity 250ms ease-in-out;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 250);
        }, 3000);
    }
    
    announceToScreenReader(message) {
        const liveRegion = document.getElementById('live-region');
        if (liveRegion) {
            liveRegion.textContent = message;
            setTimeout(() => {
                liveRegion.textContent = '';
            }, 1000);
        }
    }
    
    // Public API methods for data subject rights
    exportUserData() {
        const userData = {
            consentPreferences: this.cookieConsent,
            consentTimestamp: this.consentTimestamp,
            cartData: localStorage.getItem('hmherbs_cart'),
            // Add other user data as needed
        };
        
        const dataBlob = new Blob([JSON.stringify(userData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hmherbs-user-data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showConsentNotification('User data exported successfully');
    }
    
    deleteUserData() {
        if (confirm('Are you sure you want to delete all your data? This action cannot be undone.')) {
            // Remove all stored data
            localStorage.removeItem('hmherbs_gdpr_consent');
            localStorage.removeItem('hmherbs_cart');
            
            // Remove all cookies
            this.removeCookiesByPattern(['hmherbs', '_ga', '_gid', '_gat', '_fbp', '_fbc']);
            
            // Reset consent state
            this.cookieConsent = {
                essential: true,
                analytics: false,
                marketing: false
            };
            this.consentGiven = false;
            this.consentTimestamp = null;
            
            this.showConsentNotification('All user data deleted successfully');
            
            // Reload page to reset state
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }
    }
    
    getConsentStatus() {
        return {
            consentGiven: this.consentGiven,
            preferences: this.cookieConsent,
            timestamp: this.consentTimestamp
        };
    }
}

// Initialize GDPR compliance when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.gdprCompliance = new GDPRCompliance();
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GDPRCompliance;
}

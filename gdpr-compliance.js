// GDPR Compliance System for H&M Herbs & Vitamins
// Handles cookie consent, privacy preferences, and data management

class GDPRCompliance {
    constructor() {
        this.config = {
            debugMode: false, // Set to false to reduce console noise
            googleAnalyticsId: 'G-XXXXXXXXXX' // Replace with your actual Google Analytics Measurement ID
        };

        this.cookieConsent = {
            essential: true, // Always required
            analytics: false,
            marketing: false
        };

        this.consentGiven = false;
        this.consentTimestamp = null;
        this.eventListeners = new Map(); // Track event listeners for cleanup
        this.googleAnalyticsLoaded = false;

        this.init();
    }

    init() {
        // Initialize Google Analytics with consent mode (denied by default)
        this.initializeGoogleAnalyticsConsentMode();

        // Load existing consent preferences
        this.loadConsentPreferences();

        // Setup event listeners
        this.setupEventListeners();

        // Show cookie banner if consent not given
        if (!this.consentGiven) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                this.showCookieBanner();
            }, 100);
        } else {
            // Apply consent preferences
            this.applyConsentPreferences();
            // Ensure banner is hidden if consent was already given
            this.hideCookieBanner();
        }

        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
            console.log('GDPR Compliance system initialized');
        }
    }

    initializeGoogleAnalyticsConsentMode() {
        // Initialize gtag consent mode before loading Google Analytics
        // This ensures GA respects user consent from the start
        window.dataLayer = window.dataLayer || [];
        function gtag() {
            dataLayer.push(arguments);
        }
        window.gtag = gtag;

        // Set default consent state (denied) until user consents
        gtag('consent', 'default', {
            'analytics_storage': 'denied',
            'ad_storage': 'denied',
            'wait_for_update': 500 // Wait 500ms for consent update
        });
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
                this.showCookiePreferences();
            });
        }

        // Cookie preferences button in footer
        const preferencesBtn = document.getElementById('cookie-preferences');
        if (preferencesBtn) {
            preferencesBtn.addEventListener('click', () => {
                this.showCookiePreferences();
            });
        }
    }

    showCookieBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            // Set aria-hidden to false FIRST, before showing or focusing
            banner.setAttribute('aria-hidden', 'false');
            banner.classList.add('show');

            // Focus management for accessibility - ensure aria-hidden is false before focusing
            const firstButton = banner.querySelector('button');
            if (firstButton) {
                // Use requestAnimationFrame to ensure aria-hidden update is processed
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        firstButton.focus();
                    });
                });
            }
        }
    }

    hideCookieBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            // Remove focus from any buttons in the banner before hiding
            const focusedButton = banner.querySelector('button:focus');
            if (focusedButton) {
                focusedButton.blur();
            }

            // Set aria-hidden to true BEFORE hiding
            banner.setAttribute('aria-hidden', 'true');
            banner.classList.remove('show');

            // Force hide with inline styles as backup
            banner.style.display = 'none';
            banner.style.visibility = 'hidden';
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(100%)';
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


    acceptAllCookies() {
        this.cookieConsent = {
            essential: true,
            analytics: true,
            marketing: true
        };

        this.consentGiven = true;
        this.consentTimestamp = new Date().toISOString();

        this.saveConsentPreferences();
        this.applyConsentPreferences();

        // Ensure banner is hidden
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

    showCookiePreferences() {
        // Check if modal already exists
        let modal = document.getElementById('cookie-preferences-modal');
        if (modal) {
            modal.remove();
        }

        // Create modal overlay
        modal = document.createElement('div');
        modal.id = 'cookie-preferences-modal';
        modal.className = 'gdpr-modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'cookie-preferences-title');
        modal.style.display = 'flex';

        // Create modal content
        const modalDiv = document.createElement('div');
        modalDiv.className = 'gdpr-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'gdpr-modal-header';

        const titleEl = document.createElement('h3');
        titleEl.id = 'cookie-preferences-title';
        titleEl.textContent = 'Cookie Preferences';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'gdpr-modal-close';
        closeBtn.setAttribute('aria-label', 'Close cookie preferences');
        closeBtn.textContent = '×';

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement('div');
        body.className = 'gdpr-modal-body';

        const description = document.createElement('p');
        description.textContent = 'We use cookies to enhance your browsing experience. You can choose which types of cookies to accept. Essential cookies are always required for the website to function properly.';
        description.style.marginBottom = '1.5rem';
        body.appendChild(description);

        // Essential cookies (always on, disabled)
        const essentialCategory = this.createCookieCategory(
            'Essential Cookies',
            'essential',
            true,
            true,
            'These cookies are necessary for the website to function and cannot be disabled.'
        );
        body.appendChild(essentialCategory);

        // Analytics cookies
        const analyticsCategory = this.createCookieCategory(
            'Analytics Cookies',
            'analytics',
            this.cookieConsent.analytics,
            false,
            'These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously.'
        );
        body.appendChild(analyticsCategory);

        // Marketing cookies
        const marketingCategory = this.createCookieCategory(
            'Marketing Cookies',
            'marketing',
            this.cookieConsent.marketing,
            false,
            'These cookies are used to deliver advertisements and track campaign performance.'
        );
        body.appendChild(marketingCategory);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'gdpr-modal-footer';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'gdpr-btn gdpr-btn-primary';
        saveBtn.id = 'cookie-save-preferences';
        saveBtn.textContent = 'Save Preferences';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'gdpr-btn gdpr-btn-secondary';
        cancelBtn.id = 'cookie-cancel-preferences';
        cancelBtn.textContent = 'Cancel';

        footer.appendChild(saveBtn);
        footer.appendChild(cancelBtn);

        // Assemble modal
        modalDiv.appendChild(header);
        modalDiv.appendChild(body);
        modalDiv.appendChild(footer);
        modal.appendChild(modalDiv);

        document.body.appendChild(modal);

        // Event listeners
        const closeModal = () => {
            document.body.removeChild(modal);
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        saveBtn.addEventListener('click', () => {
            // Get current toggle states
            const analyticsToggle = document.getElementById('cookie-toggle-analytics');
            const marketingToggle = document.getElementById('cookie-toggle-marketing');

            this.cookieConsent.analytics = analyticsToggle ? analyticsToggle.checked : false;
            this.cookieConsent.marketing = marketingToggle ? marketingToggle.checked : false;

            this.consentGiven = true;
            this.consentTimestamp = new Date().toISOString();

            this.saveConsentPreferences();
            this.applyConsentPreferences();
            this.hideCookieBanner();

            closeModal();

            this.showConsentNotification('Cookie preferences saved');
            this.announceToScreenReader('Cookie preferences have been saved');
        });

        // Handle Escape key
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Focus the first toggle or save button
        const firstToggle = body.querySelector('input[type="checkbox"]:not([disabled])');
        if (firstToggle) {
            setTimeout(() => firstToggle.focus(), 100);
        } else {
            setTimeout(() => saveBtn.focus(), 100);
        }
    }

    createCookieCategory(title, id, checked, disabled, description) {
        const category = document.createElement('div');
        category.className = 'cookie-category';

        const header = document.createElement('div');
        header.className = 'cookie-category-header';

        const titleEl = document.createElement('h4');
        titleEl.textContent = title;

        if (disabled) {
            const requiredBadge = document.createElement('span');
            requiredBadge.className = 'cookie-required';
            requiredBadge.textContent = 'Required';
            header.appendChild(titleEl);
            header.appendChild(requiredBadge);
        } else {
            header.appendChild(titleEl);
        }

        category.appendChild(header);

        const toggleContainer = document.createElement('div');
        toggleContainer.style.display = 'flex';
        toggleContainer.style.alignItems = 'center';
        toggleContainer.style.justifyContent = 'space-between';
        toggleContainer.style.marginTop = '0.5rem';

        const descEl = document.createElement('p');
        descEl.textContent = description;
        descEl.style.margin = '0';
        descEl.style.fontSize = '0.875rem';
        descEl.style.color = 'var(--gray-600)';
        descEl.style.flex = '1';
        descEl.style.marginRight = '1rem';

        const toggleSwitch = document.createElement('label');
        toggleSwitch.className = 'toggle-switch';
        toggleSwitch.style.flexShrink = '0';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `cookie-toggle-${id}`;
        checkbox.checked = checked;
        checkbox.disabled = disabled;

        const slider = document.createElement('span');
        slider.className = 'toggle-slider';

        toggleSwitch.appendChild(checkbox);
        toggleSwitch.appendChild(slider);

        toggleContainer.appendChild(descEl);
        toggleContainer.appendChild(toggleSwitch);

        category.appendChild(toggleContainer);

        return category;
    }


    saveConsentPreferences() {
        const consentData = {
            consent: this.cookieConsent,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };

        try {
            // Check if localStorage is available (not available in file:// protocol)
            if (typeof Storage !== 'undefined' && window.location.protocol !== 'file:') {
                localStorage.setItem('hmherbs_gdpr_consent', JSON.stringify(consentData));
                this.consentGiven = true;
                this.consentTimestamp = consentData.timestamp;
            } else {
                // Fallback: use sessionStorage or in-memory storage for file:// protocol
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('hmherbs_gdpr_consent', JSON.stringify(consentData));
                }
                // Store in memory as fallback
                this.consentGiven = true;
                this.consentTimestamp = consentData.timestamp;
                // Store in window object as last resort
                if (typeof window !== 'undefined') {
                    window.hmherbs_gdpr_consent = consentData;
                }
            }
        } catch (error) {
            console.error('Error saving GDPR consent:', error);
            // Fallback: store in memory
            this.consentGiven = true;
            this.consentTimestamp = consentData.timestamp;
            if (typeof window !== 'undefined') {
                window.hmherbs_gdpr_consent = consentData;
            }
        }
    }

    loadConsentPreferences() {
        try {
            let savedConsent = null;

            // Try localStorage first
            if (typeof Storage !== 'undefined' && window.location.protocol !== 'file:') {
                savedConsent = localStorage.getItem('hmherbs_gdpr_consent');
            }

            // Fallback to sessionStorage
            if (!savedConsent && typeof sessionStorage !== 'undefined') {
                savedConsent = sessionStorage.getItem('hmherbs_gdpr_consent');
            }

            // Fallback to window object (for file:// protocol)
            if (!savedConsent && typeof window !== 'undefined' && window.hmherbs_gdpr_consent) {
                savedConsent = JSON.stringify(window.hmherbs_gdpr_consent);
            }

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
                    if (typeof Storage !== 'undefined' && window.location.protocol !== 'file:') {
                        localStorage.removeItem('hmherbs_gdpr_consent');
                    }
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem('hmherbs_gdpr_consent');
                    }
                    if (typeof window !== 'undefined' && window.hmherbs_gdpr_consent) {
                        delete window.hmherbs_gdpr_consent;
                    }
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

        // Log consent status (only in debug mode)
        if (this.config && this.config.debugMode) {
            console.log('GDPR consent applied:', this.cookieConsent);
        }
    }

    enableAnalytics() {
        // Enable Google Analytics
        if (this.config && this.config.debugMode) {
            console.log('Analytics cookies enabled');
        }

        // Load Google Analytics if not already loaded
        if (!this.googleAnalyticsLoaded && this.config.googleAnalyticsId && this.config.googleAnalyticsId !== 'G-XXXXXXXXXX') {
            this.loadGoogleAnalytics();
        }

        // Update consent mode if gtag is available
        if (typeof gtag !== 'undefined') {
            gtag('consent', 'update', {
                'analytics_storage': 'granted'
            });
        }
    }

    loadGoogleAnalytics() {
        // Ensure gtag is defined (should already be from initializeGoogleAnalyticsConsentMode)
        if (typeof gtag === 'undefined') {
            window.dataLayer = window.dataLayer || [];
            window.gtag = function() {
                dataLayer.push(arguments);
            };
        }

        // Load Google Analytics script
        const script1 = document.createElement('script');
        script1.async = true;
        script1.src = `https://www.googletagmanager.com/gtag/js?id=${this.config.googleAnalyticsId}`;
        document.head.appendChild(script1);

        // Wait for script to load, then configure
        script1.onload = () => {
            // Configure Google Analytics with consent mode
            gtag('js', new Date());
            gtag('config', this.config.googleAnalyticsId, {
                'analytics_storage': this.cookieConsent.analytics ? 'granted' : 'denied',
                'ad_storage': this.cookieConsent.marketing ? 'granted' : 'denied'
            });
        };

        this.googleAnalyticsLoaded = true;
    }

    disableAnalytics() {
        // Disable analytics and remove existing analytics cookies
        if (this.config && this.config.debugMode) {
            console.log('Analytics cookies disabled');
        }

        // Update consent mode if gtag is available
        if (typeof gtag !== 'undefined') {
            gtag('consent', 'update', {
                'analytics_storage': 'denied'
            });
        }

        // Remove analytics cookies
        this.removeCookiesByPattern(['_ga', '_gid', '_gat', '_ga_', '_gac_']);
    }

    enableMarketing() {
        // Enable marketing/advertising cookies
        if (this.config && this.config.debugMode) {
            console.log('Marketing cookies enabled');
        }

        // Example: Enable advertising consent
        // gtag('consent', 'update', {
        //     'ad_storage': 'granted'
        // });
    }

    disableMarketing() {
        // Disable marketing cookies and remove existing ones
        if (this.config && this.config.debugMode) {
            console.log('Marketing cookies disabled');
        }

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

        // Store timeout IDs for cleanup
        const timeouts = [];

        // Animate in
        timeouts.push(setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '1';
            }
        }, 100));

        // Auto-remove after 3 seconds
        timeouts.push(setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                timeouts.push(setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 250));
            }
        }, 3000));

        // Store cleanup function on notification for potential early removal
        notification._cleanup = () => {
            timeouts.forEach(id => clearTimeout(id));
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        };
    }

    announceToScreenReader(message) {
        const liveRegion = document.getElementById('live-region');
        if (liveRegion) {
            liveRegion.textContent = message;
            // Store timeout ID for potential cleanup
            if (liveRegion._clearTimeout) {
                clearTimeout(liveRegion._clearTimeout);
            }
            liveRegion._clearTimeout = setTimeout(() => {
                liveRegion.textContent = '';
                liveRegion._clearTimeout = null;
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
        // Use secure modal dialog instead of confirm() to prevent XSS
        this.showConfirmationModal(
            'Delete All Data',
            'Are you sure you want to delete all your data? This action cannot be undone.',
            () => {
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
        );
    }

    getConsentStatus() {
        return {
            consentGiven: this.consentGiven,
            preferences: this.cookieConsent,
            timestamp: this.consentTimestamp
        };
    }

    // Secure modal dialog method to replace confirm()
    showConfirmationModal(title, message, callback) {
        const modal = document.createElement('div');
        modal.className = 'gdpr-modal-overlay';

        // Create modal structure safely
        const modalDiv = document.createElement('div');
        modalDiv.className = 'gdpr-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'gdpr-modal-header';

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'gdpr-modal-close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '×';

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement('div');
        body.className = 'gdpr-modal-body';

        const messageEl = document.createElement('p');
        messageEl.textContent = message;
        body.appendChild(messageEl);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'gdpr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'gdpr-btn gdpr-btn-secondary';
        cancelBtn.id = 'gdpr-cancel';
        cancelBtn.textContent = 'Cancel';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'gdpr-btn gdpr-btn-danger';
        confirmBtn.id = 'gdpr-confirm';
        confirmBtn.textContent = 'Confirm';

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);

        // Assemble modal
        modalDiv.appendChild(header);
        modalDiv.appendChild(body);
        modalDiv.appendChild(footer);
        modal.appendChild(modalDiv);

        document.body.appendChild(modal);

        const confirmBtnEl = modal.querySelector('#gdpr-confirm');
        const cancelBtnEl = modal.querySelector('#gdpr-cancel');
        const closeBtnEl = modal.querySelector('.gdpr-modal-close');

        const closeModal = () => {
            document.body.removeChild(modal);
        };

        confirmBtnEl.addEventListener('click', () => {
            closeModal();
            callback();
        });

        cancelBtnEl.addEventListener('click', closeModal);
        closeBtnEl.addEventListener('click', closeModal);

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
}

// Initialize GDPR compliance when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.gdprCompliance = new GDPRCompliance();
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GDPRCompliance;
}

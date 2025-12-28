// Newsletter Signup Popup
// Shows a popup offering 15% discount for newsletter signup
// Only shows once per user (tracked via localStorage)

class NewsletterPopup {
    constructor() {
        this.storageKey = 'hmherbs_newsletter_popup_shown';
        this.popupDelay = 2000; // Show popup after 2 seconds
        this.init();
    }

    init() {
        // Check if popup has already been shown
        if (this.hasBeenShown()) {
            return;
        }

        // Wait for page to load, then show popup after delay
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.showPopup(), this.popupDelay);
            });
        } else {
            setTimeout(() => this.showPopup(), this.popupDelay);
        }
    }

    hasBeenShown() {
        return localStorage.getItem(this.storageKey) === 'true';
    }

    markAsShown() {
        localStorage.setItem(this.storageKey, 'true');
    }

    showPopup() {
        // Don't show if already shown or if user is on admin page
        if (this.hasBeenShown() || window.location.pathname.includes('admin')) {
            return;
        }

        // Create popup HTML
        const popup = document.createElement('div');
        popup.className = 'newsletter-popup';
        popup.id = 'newsletter-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-labelledby', 'newsletter-popup-title');
        popup.setAttribute('aria-modal', 'true');
        
        popup.innerHTML = `
            <div class="newsletter-popup-overlay"></div>
            <div class="newsletter-popup-content">
                <button class="newsletter-popup-close" aria-label="Close newsletter popup">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
                <div class="newsletter-popup-body">
                    <div class="newsletter-popup-icon">
                        <i class="fas fa-envelope-open-text" aria-hidden="true"></i>
                    </div>
                    <h2 id="newsletter-popup-title" class="newsletter-popup-title">
                        Subscribe & Save 15%!
                    </h2>
                    <p class="newsletter-popup-message">
                        Join our newsletter and get <strong>15% off your next order</strong>. 
                        Stay updated with our latest products, health tips, and exclusive offers.
                    </p>
                    <form id="newsletter-popup-form" class="newsletter-popup-form" novalidate>
                        <div class="newsletter-popup-input-group">
                            <input 
                                type="email" 
                                id="newsletter-popup-email" 
                                name="email" 
                                placeholder="Enter your email address" 
                                required 
                                aria-label="Email address for newsletter subscription"
                                aria-describedby="newsletter-popup-error newsletter-popup-success">
                            <button type="submit" class="btn btn-primary newsletter-popup-submit">
                                <span class="submit-text">Get My 15% Off</span>
                                <span class="submit-loading" style="display: none;">
                                    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                                </span>
                            </button>
                        </div>
                        <div id="newsletter-popup-error" class="newsletter-popup-message newsletter-popup-error" role="alert" aria-live="polite" style="display: none;"></div>
                        <div id="newsletter-popup-success" class="newsletter-popup-message newsletter-popup-success" role="alert" aria-live="polite" style="display: none;"></div>
                    </form>
                    <button class="newsletter-popup-skip" id="newsletter-popup-skip">
                        No thanks, maybe later
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(popup);

        // Show popup with animation
        requestAnimationFrame(() => {
            popup.classList.add('show');
        });

        // Setup event listeners
        this.setupEventListeners(popup);
    }

    setupEventListeners(popup) {
        const closeBtn = popup.querySelector('.newsletter-popup-close');
        const skipBtn = popup.querySelector('#newsletter-popup-skip');
        const overlay = popup.querySelector('.newsletter-popup-overlay');
        const form = popup.querySelector('#newsletter-popup-form');

        // Close button
        closeBtn.addEventListener('click', () => this.closePopup(popup));
        
        // Skip button
        skipBtn.addEventListener('click', () => this.closePopup(popup));
        
        // Overlay click
        overlay.addEventListener('click', () => this.closePopup(popup));
        
        // Form submission
        form.addEventListener('submit', (e) => this.handleSubmit(e, popup));
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && popup.classList.contains('show')) {
                this.closePopup(popup);
            }
        });
    }

    async handleSubmit(e, popup) {
        e.preventDefault();
        
        const emailInput = popup.querySelector('#newsletter-popup-email');
        const email = emailInput.value.trim();
        const errorDiv = popup.querySelector('#newsletter-popup-error');
        const successDiv = popup.querySelector('#newsletter-popup-success');
        const submitBtn = popup.querySelector('.newsletter-popup-submit');
        const submitText = submitBtn.querySelector('.submit-text');
        const submitLoading = submitBtn.querySelector('.submit-loading');

        // Validate email
        if (!this.isValidEmail(email)) {
            this.showError(errorDiv, 'Please enter a valid email address.');
            emailInput.focus();
            return;
        }

        // Hide previous messages
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';

        // Show loading state
        submitBtn.disabled = true;
        submitText.style.display = 'none';
        submitLoading.style.display = 'inline-block';

        try {
            // Determine API base URL
            const apiBaseUrl = window.location.protocol === 'file:' 
                ? 'http://localhost:3001' 
                : '';

            // Subscribe with campaign ID 1 (15% off campaign)
            const response = await fetch(`${apiBaseUrl}/api/email-campaign/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    campaign_id: 1
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Success - show success message and close after delay
                this.showSuccess(successDiv, '🎉 Thank you! Your 15% discount will be applied automatically on your next order.');
                
                // Mark popup as shown and close after 2 seconds
                this.markAsShown();
                setTimeout(() => {
                    this.closePopup(popup);
                }, 2000);
            } else {
                // Error from server
                this.showError(errorDiv, data.error || 'Something went wrong. Please try again.');
                submitBtn.disabled = false;
                submitText.style.display = 'inline';
                submitLoading.style.display = 'none';
            }
        } catch (error) {
            console.error('Newsletter subscription error:', error);
            this.showError(errorDiv, 'Unable to connect. Please check your connection and try again.');
            submitBtn.disabled = false;
            submitText.style.display = 'inline';
            submitLoading.style.display = 'none';
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showError(errorDiv, message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    showSuccess(successDiv, message) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
    }

    closePopup(popup) {
        popup.classList.remove('show');
        this.markAsShown();
        
        // Remove from DOM after animation
        setTimeout(() => {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        }, 300);
    }
}

// Initialize newsletter popup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new NewsletterPopup();
    });
} else {
    new NewsletterPopup();
}


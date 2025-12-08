// Comprehensive Error Handling and User Experience Enhancement
// Provides graceful error handling, user feedback, and recovery mechanisms

class ErrorHandler {
    constructor() {
        this.errorQueue = [];
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second base delay
        
        this.init();
    }

    init() {
        this.setupGlobalErrorHandlers();
        this.setupNetworkErrorHandling();
        this.setupUIErrorHandling();
        this.createErrorDisplay();
        this.setupOfflineHandling();
    }

    setupGlobalErrorHandlers() {
        // Catch JavaScript errors
        window.addEventListener('error', (event) => {
            this.handleJavaScriptError({
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            });
        });

        // Catch unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handlePromiseRejection({
                reason: event.reason,
                promise: event.promise
            });
            event.preventDefault(); // Prevent console error
        });

        // Catch resource loading errors
        window.addEventListener('error', (event) => {
            if (event.target !== window) {
                this.handleResourceError({
                    element: event.target,
                    source: event.target.src || event.target.href,
                    type: event.target.tagName
                });
            }
        }, true);
    }

    setupNetworkErrorHandling() {
        // Override fetch to add error handling
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            try {
                const response = await originalFetch(...args);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
            } catch (error) {
                return this.handleNetworkError(error, args);
            }
        };

        // Override XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(...args) {
            this.addEventListener('error', (event) => {
                window.errorHandler.handleNetworkError(new Error('XHR request failed'), args);
            });
            
            this.addEventListener('timeout', (event) => {
                window.errorHandler.handleNetworkError(new Error('XHR request timeout'), args);
            });
            
            return originalXHROpen.apply(this, args);
        };
    }

    setupUIErrorHandling() {
        // Handle form submission errors
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (form.tagName === 'FORM') {
                this.handleFormSubmission(form, event);
            }
        });

        // Handle click errors on interactive elements
        document.addEventListener('click', (event) => {
            const element = event.target;
            if (element.matches('button, a, [role="button"]')) {
                this.wrapInteractiveElement(element, event);
            }
        });
    }

    createErrorDisplay() {
        // Create error notification container
        const errorContainer = document.createElement('div');
        errorContainer.id = 'error-notifications';
        errorContainer.className = 'error-notifications';
        errorContainer.setAttribute('aria-live', 'polite');
        errorContainer.setAttribute('aria-label', 'Error notifications');
        
        // Add styles
        errorContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
            pointer-events: none;
        `;
        
        document.body.appendChild(errorContainer);
        this.errorContainer = errorContainer;
    }

    setupOfflineHandling() {
        window.addEventListener('online', () => {
            this.showNotification('Connection restored', 'success');
            this.retryFailedRequests();
        });

        window.addEventListener('offline', () => {
            this.showNotification('You are currently offline. Some features may not work.', 'warning', 0);
        });
    }

    handleJavaScriptError(errorInfo) {
        console.error('JavaScript Error:', errorInfo);
        
        // Don't show user notification for minor errors
        if (this.isMinorError(errorInfo)) {
            return;
        }

        // Log to analytics/monitoring service
        this.logError('javascript', errorInfo);

        // Show user-friendly message
        this.showNotification(
            'Something went wrong. Please refresh the page if the problem persists.',
            'error'
        );
    }

    handlePromiseRejection(rejectionInfo) {
        console.error('Unhandled Promise Rejection:', rejectionInfo);
        
        // Log to monitoring service
        this.logError('promise_rejection', rejectionInfo);

        // Show user notification for network-related rejections
        if (this.isNetworkError(rejectionInfo.reason)) {
            this.showNotification(
                'Network error occurred. Please check your connection.',
                'error'
            );
        }
    }

    handleResourceError(resourceInfo) {
        console.warn('Resource Loading Error:', resourceInfo);
        
        // Try to recover from resource errors
        this.attemptResourceRecovery(resourceInfo);
        
        // Log for monitoring
        this.logError('resource', resourceInfo);
    }

    async handleNetworkError(error, requestArgs) {
        const requestKey = this.getRequestKey(requestArgs);
        const attempts = this.retryAttempts.get(requestKey) || 0;

        console.error('Network Error:', error, requestArgs);

        if (attempts < this.maxRetries) {
            // Retry with exponential backoff
            const delay = this.retryDelay * Math.pow(2, attempts);
            this.retryAttempts.set(requestKey, attempts + 1);
            
            await this.delay(delay);
            
            try {
                const response = await fetch(...requestArgs);
                this.retryAttempts.delete(requestKey);
                return response;
            } catch (retryError) {
                return this.handleNetworkError(retryError, requestArgs);
            }
        } else {
            // Max retries reached
            this.retryAttempts.delete(requestKey);
            this.showNotification(
                'Unable to connect to the server. Please try again later.',
                'error'
            );
            
            // Return a mock response to prevent further errors
            return new Response(JSON.stringify({ error: 'Network unavailable' }), {
                status: 503,
                statusText: 'Service Unavailable'
            });
        }
    }

    handleFormSubmission(form, event) {
        try {
            // Add loading state
            const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.classList.add('loading');
                
                // Re-enable after timeout as fallback
                setTimeout(() => {
                    submitButton.disabled = false;
                    submitButton.classList.remove('loading');
                }, 10000);
            }

            // Validate form before submission
            if (!this.validateForm(form)) {
                event.preventDefault();
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.classList.remove('loading');
                }
                return;
            }

        } catch (error) {
            console.error('Form submission error:', error);
            event.preventDefault();
            this.showNotification('Form submission failed. Please try again.', 'error');
        }
    }

    wrapInteractiveElement(element, event) {
        try {
            // Add visual feedback
            element.style.pointerEvents = 'none';
            setTimeout(() => {
                element.style.pointerEvents = '';
            }, 300);

        } catch (error) {
            console.error('Interactive element error:', error);
            this.showNotification('Action failed. Please try again.', 'error');
        }
    }

    validateForm(form) {
        const requiredFields = form.querySelectorAll('[required]');
        let isValid = true;

        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                this.showFieldError(field, 'This field is required');
                isValid = false;
            } else {
                this.clearFieldError(field);
            }
        });

        // Email validation
        const emailFields = form.querySelectorAll('input[type="email"]');
        emailFields.forEach(field => {
            if (field.value && !this.isValidEmail(field.value)) {
                this.showFieldError(field, 'Please enter a valid email address');
                isValid = false;
            }
        });

        return isValid;
    }

    showFieldError(field, message) {
        field.setAttribute('aria-invalid', 'true');
        field.classList.add('error');
        
        // Remove existing error message
        const existingError = field.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // Add new error message
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        errorElement.setAttribute('role', 'alert');
        field.parentNode.appendChild(errorElement);
    }

    clearFieldError(field) {
        field.setAttribute('aria-invalid', 'false');
        field.classList.remove('error');
        
        const errorMessage = field.parentNode.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.setAttribute('role', 'alert');
        notification.style.cssText = `
            background: ${this.getNotificationColor(type)};
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            pointer-events: auto;
            cursor: pointer;
            animation: slideIn 0.3s ease-out;
            max-width: 100%;
            word-wrap: break-word;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="flex: 1;">${message}</span>
                <button style="background: none; border: none; color: white; cursor: pointer; font-size: 18px;" aria-label="Close notification">&times;</button>
            </div>
        `;

        // Close button functionality
        const closeButton = notification.querySelector('button');
        closeButton.addEventListener('click', () => {
            this.removeNotification(notification);
        });

        // Click to dismiss
        notification.addEventListener('click', (e) => {
            if (e.target !== closeButton) {
                this.removeNotification(notification);
            }
        });

        this.errorContainer.appendChild(notification);

        // Auto-remove after duration (unless duration is 0)
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification);
            }, duration);
        }
    }

    removeNotification(notification) {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    getNotificationColor(type) {
        const colors = {
            success: '#059669',
            error: '#dc2626',
            warning: '#d97706',
            info: '#2563eb'
        };
        return colors[type] || colors.info;
    }

    attemptResourceRecovery(resourceInfo) {
        const { element, source, type } = resourceInfo;
        
        if (type === 'IMG') {
            // Try to load a fallback image
            element.src = '/images/placeholder.jpg';
            element.alt = 'Image unavailable';
        } else if (type === 'SCRIPT') {
            // Try to load from CDN fallback
            this.loadScriptFallback(element, source);
        } else if (type === 'LINK' && element.rel === 'stylesheet') {
            // Try to load CSS fallback
            this.loadStylesheetFallback(element, source);
        }
    }

    loadScriptFallback(originalScript, originalSource) {
        // Implementation would depend on specific fallback strategies
        console.warn('Script fallback needed for:', originalSource);
    }

    loadStylesheetFallback(originalLink, originalSource) {
        // Implementation would depend on specific fallback strategies
        console.warn('Stylesheet fallback needed for:', originalSource);
    }

    async retryFailedRequests() {
        // Retry any queued failed requests when connection is restored
        const failedRequests = [...this.errorQueue];
        this.errorQueue = [];
        
        for (const request of failedRequests) {
            try {
                await fetch(...request.args);
            } catch (error) {
                console.warn('Retry failed for:', request.args);
            }
        }
    }

    isMinorError(errorInfo) {
        const minorErrors = [
            'Script error',
            'ResizeObserver loop limit exceeded',
            'Non-Error promise rejection captured'
        ];
        
        return minorErrors.some(minor => 
            errorInfo.message && errorInfo.message.includes(minor)
        );
    }

    isNetworkError(error) {
        if (!error) return false;
        
        const networkErrors = [
            'fetch',
            'network',
            'timeout',
            'connection',
            'offline'
        ];
        
        const errorString = error.toString().toLowerCase();
        return networkErrors.some(keyword => errorString.includes(keyword));
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    getRequestKey(requestArgs) {
        return JSON.stringify(requestArgs[0]); // URL or Request object
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    logError(type, errorInfo) {
        // In production, this would send to analytics/monitoring service
        const logData = {
            type,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            error: errorInfo
        };
        
        console.log('Error logged:', logData);
        
        // Example: Send to monitoring service
        // fetch('/api/errors', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(logData)
        // }).catch(() => {}); // Fail silently
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .notification {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
    }
`;
document.head.appendChild(style);

// Initialize error handler when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.errorHandler = new ErrorHandler();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}

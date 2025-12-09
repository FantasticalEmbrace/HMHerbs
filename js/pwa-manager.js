// Advanced PWA Manager for HM Herbs
// Enhanced Progressive Web App features with offline sync and push notifications

class PWAManager {
    constructor() {
        this.config = {
            enableOfflineSync: true,
            enablePushNotifications: true,
            enableBackgroundSync: true,
            enableAppInstall: true,
            syncRetryDelay: 5000, // 5 seconds
            maxSyncRetries: 3
        };
        
        this.offlineQueue = [];
        this.syncInProgress = false;
        this.installPromptEvent = null;
        this.isOnline = navigator.onLine;
        
        this.init();
    }

    async init() {
        // Register service worker with advanced features
        await this.registerServiceWorker();
        
        // Initialize offline sync
        if (this.config.enableOfflineSync) {
            this.initializeOfflineSync();
        }
        
        // Initialize push notifications
        if (this.config.enablePushNotifications) {
            this.initializePushNotifications();
        }
        
        // Initialize app install prompt
        if (this.config.enableAppInstall) {
            this.initializeAppInstall();
        }
        
        // Set up network status monitoring
        this.setupNetworkMonitoring();
        
        // Initialize background sync
        if (this.config.enableBackgroundSync) {
            this.initializeBackgroundSync();
        }
        
        // Set up periodic sync for data updates
        this.setupPeriodicSync();
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker-advanced.js', {
                    scope: '/'
                });
                
                console.log('Advanced Service Worker registered:', registration);
                
                // Handle service worker updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateAvailable();
                        }
                    });
                });
                
                return registration;
            } catch (error) {
                console.error('Service Worker registration failed:', error);
                throw error;
            }
        } else {
            throw new Error('Service Worker not supported');
        }
    }

    // Offline Sync Implementation
    initializeOfflineSync() {
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processOfflineQueue();
            this.showConnectionRestored();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showOfflineMode();
        });
        
        // Intercept form submissions for offline queuing
        this.interceptFormSubmissions();
        
        // Intercept API calls for offline queuing
        this.interceptAPIRequests();
    }

    interceptFormSubmissions() {
        document.addEventListener('submit', (event) => {
            if (!this.isOnline) {
                event.preventDefault();
                this.queueFormSubmission(event.target);
            }
        });
    }

    interceptAPIRequests() {
        // Override fetch for API requests
        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
            try {
                const response = await originalFetch(url, options);
                return response;
            } catch (error) {
                if (!this.isOnline && this.isAPIRequest(url)) {
                    this.queueAPIRequest(url, options);
                    throw new Error('Request queued for offline sync');
                }
                throw error;
            }
        };
    }

    queueFormSubmission(form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        const queueItem = {
            type: 'form_submission',
            url: form.action || window.location.href,
            method: form.method || 'POST',
            data: data,
            timestamp: Date.now(),
            retries: 0
        };
        
        this.offlineQueue.push(queueItem);
        this.saveOfflineQueue();
        this.showOfflineQueuedMessage('Form submission queued for when you\'re back online');
    }

    queueAPIRequest(url, options) {
        const queueItem = {
            type: 'api_request',
            url: url,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body,
            timestamp: Date.now(),
            retries: 0
        };
        
        this.offlineQueue.push(queueItem);
        this.saveOfflineQueue();
    }

    async processOfflineQueue() {
        if (this.syncInProgress || this.offlineQueue.length === 0) {
            return;
        }
        
        this.syncInProgress = true;
        const successfulItems = [];
        
        for (const item of this.offlineQueue) {
            try {
                await this.processQueueItem(item);
                successfulItems.push(item);
            } catch (error) {
                item.retries++;
                if (item.retries >= this.config.maxSyncRetries) {
                    console.error('Max retries reached for queue item:', item);
                    successfulItems.push(item); // Remove from queue
                }
            }
        }
        
        // Remove successfully processed items
        this.offlineQueue = this.offlineQueue.filter(item => !successfulItems.includes(item));
        this.saveOfflineQueue();
        
        if (successfulItems.length > 0) {
            this.showSyncComplete(successfulItems.length);
        }
        
        this.syncInProgress = false;
    }

    async processQueueItem(item) {
        switch (item.type) {
            case 'form_submission':
                return await this.processFormSubmission(item);
            case 'api_request':
                return await this.processAPIRequest(item);
            default:
                throw new Error('Unknown queue item type');
        }
    }

    async processFormSubmission(item) {
        const formData = new FormData();
        Object.entries(item.data).forEach(([key, value]) => {
            formData.append(key, value);
        });
        
        const response = await fetch(item.url, {
            method: item.method,
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Form submission failed: ${response.status}`);
        }
        
        return response;
    }

    async processAPIRequest(item) {
        const response = await fetch(item.url, {
            method: item.method,
            headers: item.headers,
            body: item.body
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        
        return response;
    }

    // Push Notifications Implementation
    async initializePushNotifications() {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn('Push notifications not supported');
            return;
        }
        
        // Request notification permission
        const permission = await this.requestNotificationPermission();
        
        if (permission === 'granted') {
            await this.subscribeToPushNotifications();
        }
    }

    async requestNotificationPermission() {
        if (Notification.permission === 'default') {
            return await Notification.requestPermission();
        }
        return Notification.permission;
    }

    async subscribeToPushNotifications() {
        try {
            const registration = await navigator.serviceWorker.ready;
            
            // Check if already subscribed
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
                return existingSubscription;
            }
            
            // Subscribe to push notifications
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.getVAPIDPublicKey()
            });
            
            // Send subscription to server
            await this.sendSubscriptionToServer(subscription);
            
            return subscription;
        } catch (error) {
            console.error('Push notification subscription failed:', error);
            throw error;
        }
    }

    getVAPIDPublicKey() {
        // Replace with your actual VAPID public key
        return 'BEl62iUYgUivxIkv69yViEuiBIa40HI80NqIUHI80NqIUHI80NqIUHI80NqIUHI80NqIUHI80NqI';
    }

    async sendSubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/push-subscription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription)
            });
            
            if (!response.ok) {
                throw new Error('Failed to send subscription to server');
            }
        } catch (error) {
            console.error('Error sending subscription to server:', error);
        }
    }

    // Background Sync Implementation
    initializeBackgroundSync() {
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
            navigator.serviceWorker.ready.then(registration => {
                // Register background sync for offline queue
                registration.sync.register('offline-sync');
                
                // Register periodic background sync for data updates
                registration.sync.register('data-update');
            });
        }
    }

    setupPeriodicSync() {
        if ('serviceWorker' in navigator && 'periodicSync' in window.ServiceWorkerRegistration.prototype) {
            navigator.serviceWorker.ready.then(async registration => {
                // Register periodic sync for product updates
                await registration.periodicSync.register('product-updates', {
                    minInterval: 24 * 60 * 60 * 1000 // 24 hours
                });
                
                // Register periodic sync for inventory updates
                await registration.periodicSync.register('inventory-updates', {
                    minInterval: 60 * 60 * 1000 // 1 hour
                });
            });
        }
    }

    // App Install Implementation
    initializeAppInstall() {
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            this.installPromptEvent = event;
            this.showInstallPrompt();
        });
        
        window.addEventListener('appinstalled', () => {
            this.hideInstallPrompt();
            this.trackAppInstall();
        });
    }

    showInstallPrompt() {
        const installBanner = document.createElement('div');
        installBanner.id = 'app-install-banner';
        installBanner.className = 'app-install-banner';
        
        // Create banner content safely
        const installContent = document.createElement('div');
        installContent.className = 'install-content';
        
        const installIcon = document.createElement('div');
        installIcon.className = 'install-icon';
        installIcon.textContent = '📱';
        
        const installText = document.createElement('div');
        installText.className = 'install-text';
        
        const title = document.createElement('h3');
        title.textContent = 'Install HM Herbs App';
        
        const description = document.createElement('p');
        description.textContent = 'Get quick access to our products and exclusive mobile features';
        
        installText.appendChild(title);
        installText.appendChild(description);
        
        const installActions = document.createElement('div');
        installActions.className = 'install-actions';
        
        const installBtn = document.createElement('button');
        installBtn.id = 'install-app-btn';
        installBtn.className = 'btn btn-primary';
        installBtn.textContent = 'Install';
        
        const dismissBtn = document.createElement('button');
        dismissBtn.id = 'dismiss-install-btn';
        dismissBtn.className = 'btn btn-secondary';
        dismissBtn.textContent = 'Not Now';
        
        installActions.appendChild(installBtn);
        installActions.appendChild(dismissBtn);
        
        installContent.appendChild(installIcon);
        installContent.appendChild(installText);
        installContent.appendChild(installActions);
        
        installBanner.appendChild(installContent);
        
        document.body.appendChild(installBanner);
        
        // Add event listeners
        document.getElementById('install-app-btn').addEventListener('click', () => {
            this.promptAppInstall();
        });
        
        document.getElementById('dismiss-install-btn').addEventListener('click', () => {
            this.hideInstallPrompt();
        });
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (document.getElementById('app-install-banner')) {
                this.hideInstallPrompt();
            }
        }, 10000);
    }

    async promptAppInstall() {
        if (this.installPromptEvent) {
            this.installPromptEvent.prompt();
            const result = await this.installPromptEvent.userChoice;
            
            if (result.outcome === 'accepted') {
                console.log('User accepted app install');
            } else {
                console.log('User dismissed app install');
            }
            
            this.installPromptEvent = null;
            this.hideInstallPrompt();
        }
    }

    hideInstallPrompt() {
        const banner = document.getElementById('app-install-banner');
        if (banner) {
            banner.remove();
        }
    }

    // Network Monitoring
    setupNetworkMonitoring() {
        // Monitor connection quality
        if ('connection' in navigator) {
            this.monitorConnectionQuality();
        }
        
        // Monitor network changes
        window.addEventListener('online', () => {
            this.handleNetworkChange(true);
        });
        
        window.addEventListener('offline', () => {
            this.handleNetworkChange(false);
        });
    }

    monitorConnectionQuality() {
        const connection = navigator.connection;
        
        const updateConnectionInfo = () => {
            const connectionInfo = {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt,
                saveData: connection.saveData
            };
            
            this.adaptToConnectionQuality(connectionInfo);
        };
        
        connection.addEventListener('change', updateConnectionInfo);
        updateConnectionInfo(); // Initial check
    }

    adaptToConnectionQuality(connectionInfo) {
        // Adapt image quality based on connection
        if (connectionInfo.effectiveType === 'slow-2g' || connectionInfo.effectiveType === '2g') {
            this.enableDataSaverMode();
        } else if (connectionInfo.saveData) {
            this.enableDataSaverMode();
        } else {
            this.disableDataSaverMode();
        }
    }

    enableDataSaverMode() {
        document.body.classList.add('data-saver-mode');
        
        // Lazy load images more aggressively
        const images = document.querySelectorAll('img[data-src]');
        images.forEach(img => {
            img.style.display = 'none';
        });
        
        // Reduce animation and transitions
        const style = document.createElement('style');
        style.textContent = `
            .data-saver-mode * {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        `;
        document.head.appendChild(style);
    }

    disableDataSaverMode() {
        document.body.classList.remove('data-saver-mode');
        
        // Re-enable images
        const images = document.querySelectorAll('img[data-src]');
        images.forEach(img => {
            img.style.display = '';
        });
    }

    handleNetworkChange(isOnline) {
        this.isOnline = isOnline;
        
        if (isOnline) {
            this.processOfflineQueue();
        }
        
        // Update UI to reflect network status
        this.updateNetworkStatusUI(isOnline);
    }

    // UI Feedback Methods
    showOfflineMode() {
        this.showNotification('You\'re offline. Some features may be limited.', 'warning', 5000);
    }

    showConnectionRestored() {
        this.showNotification('Connection restored! Syncing your data...', 'success', 3000);
    }

    showOfflineQueuedMessage(message) {
        this.showNotification(message, 'info', 4000);
    }

    showSyncComplete(itemCount) {
        this.showNotification(`Synced ${itemCount} items successfully!`, 'success', 3000);
    }

    showUpdateAvailable() {
        const updateBanner = document.createElement('div');
        updateBanner.className = 'update-banner';
        
        // Create update content safely
        const updateContent = document.createElement('div');
        updateContent.className = 'update-content';
        
        const message = document.createElement('span');
        message.textContent = 'A new version is available!';
        
        const updateBtn = document.createElement('button');
        updateBtn.id = 'update-app-btn';
        updateBtn.className = 'btn btn-primary btn-sm';
        updateBtn.textContent = 'Update';
        
        const dismissBtn = document.createElement('button');
        dismissBtn.id = 'dismiss-update-btn';
        dismissBtn.className = 'btn btn-secondary btn-sm';
        dismissBtn.textContent = 'Later';
        
        updateContent.appendChild(message);
        updateContent.appendChild(updateBtn);
        updateContent.appendChild(dismissBtn);
        
        updateBanner.appendChild(updateContent);
        
        document.body.appendChild(updateBanner);
        
        document.getElementById('update-app-btn').addEventListener('click', () => {
            window.location.reload();
        });
        
        document.getElementById('dismiss-update-btn').addEventListener('click', () => {
            updateBanner.remove();
        });
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `pwa-notification pwa-notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    updateNetworkStatusUI(isOnline) {
        const statusIndicator = document.getElementById('network-status') || this.createNetworkStatusIndicator();
        statusIndicator.className = `network-status ${isOnline ? 'online' : 'offline'}`;
        statusIndicator.textContent = isOnline ? 'Online' : 'Offline';
    }

    createNetworkStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'network-status';
        indicator.className = 'network-status';
        document.body.appendChild(indicator);
        return indicator;
    }

    // Utility Methods
    isAPIRequest(url) {
        return url.includes('/api/') || url.startsWith('/api/');
    }

    saveOfflineQueue() {
        try {
            localStorage.setItem('pwa-offline-queue', JSON.stringify(this.offlineQueue));
        } catch (error) {
            console.error('Failed to save offline queue:', error);
        }
    }

    loadOfflineQueue() {
        try {
            const saved = localStorage.getItem('pwa-offline-queue');
            if (saved) {
                this.offlineQueue = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load offline queue:', error);
            this.offlineQueue = [];
        }
    }

    trackAppInstall() {
        // Track app installation for analytics
        if (window.hmherbsAnalytics) {
            window.hmherbsAnalytics.trackCustomEvent('app_installed', {
                timestamp: Date.now(),
                userAgent: navigator.userAgent
            });
        }
    }

    // Public API
    async syncNow() {
        if (this.isOnline) {
            await this.processOfflineQueue();
        }
    }

    getOfflineQueueStatus() {
        return {
            itemCount: this.offlineQueue.length,
            syncInProgress: this.syncInProgress,
            isOnline: this.isOnline
        };
    }

    clearOfflineQueue() {
        this.offlineQueue = [];
        this.saveOfflineQueue();
    }
}

// Initialize PWA Manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pwaManager = new PWAManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PWAManager;
}

// H&M Herbs & Vitamins - Interactive JavaScript
// Modern, accessible, and feature-rich functionality

// Production-safe logging utility
const Logger = {
    isDevelopment: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    log: function(...args) {
        if (this.isDevelopment) console.log(...args);
    },
    error: function(...args) {
        if (this.isDevelopment) console.error(...args);
    },
    warn: function(...args) {
        if (this.isDevelopment) console.warn(...args);
    }
};

class HMHerbsApp {
    constructor() {
        this.cart = [];
        this.products = [];
        this.isLoading = false;
        this.eventListeners = []; // Track event listeners for cleanup
        
        // Debouncing for cart operations to prevent race conditions
        this.cartOperationTimeouts = new Map();
        this.cartOperationDelay = 300; // 300ms debounce
        
        // Initialize the application
        this.init();
    }
    
    async init() {
        try {
            // Load products data
            await this.loadProducts();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize components
            this.initializeComponents();
            
            // Load cart from localStorage
            this.loadCartFromStorage();
            
            // Render initial content
            this.renderSpotlightProducts();
            this.updateCartDisplay();
            
            Logger.log('H&M Herbs app initialized successfully');
        } catch (error) {
            Logger.error('Error initializing app:', error);
            this.showNotification('Unable to load the application. Please refresh the page or try again later.', 'error');
        }
    }

    // Helper method to add event listeners with tracking
    addEventListenerWithCleanup(element, event, handler, options = false) {
        if (element) {
            element.addEventListener(event, handler, options);
            this.eventListeners.push({ element, event, handler, options });
        }
    }

    // Cleanup method to remove all tracked event listeners
    cleanup() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            try {
                element.removeEventListener(event, handler, options);
            } catch (error) {
                console.warn('Error removing HMHerbsApp event listener:', error);
            }
        });
        this.eventListeners = [];
        
        // Clear any pending cart operation timeouts
        this.cartOperationTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.cartOperationTimeouts.clear();
    }
    
    async loadProducts() {
        try {
            // Get API base URL from environment or default to current origin
            const apiBaseUrl = window.location.origin.includes('localhost') 
                ? 'http://localhost:3001' 
                : window.location.origin;
            
            const response = await fetch(`${apiBaseUrl}/api/products?limit=4&featured=true`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.products = data.products || [];
            
            Logger.log(`✅ Loaded ${this.products.length} products from API`);
            
            // Update the UI after loading products
            this.renderProducts();
            this.updateProductCount();
            
        } catch (error) {
            console.error('❌ Failed to load products from API:', error);
            
            // Fallback to empty array and show user-friendly message
            this.products = [];
            this.showNotification('Unable to load products. Please check your connection and try again.', 'error');
        }
    }
    
    setupEventListeners() {
        // Mobile menu toggle
        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        
        if (mobileMenuToggle && navMenu) {
            this.addEventListenerWithCleanup(mobileMenuToggle, 'click', () => {
                const isExpanded = mobileMenuToggle.getAttribute('aria-expanded') === 'true';
                mobileMenuToggle.setAttribute('aria-expanded', !isExpanded);
                navMenu.classList.toggle('show');
            });
        }
        
        // Search functionality
        const searchToggle = document.querySelector('.search-toggle');
        const searchDropdown = document.querySelector('.search-dropdown');
        const searchForm = document.querySelector('.search-form');
        const searchInput = document.getElementById('search-input');
        
        if (searchToggle && searchDropdown) {
            this.addEventListenerWithCleanup(searchToggle, 'click', () => {
                const isExpanded = searchToggle.getAttribute('aria-expanded') === 'true';
                searchToggle.setAttribute('aria-expanded', !isExpanded);
                searchDropdown.classList.toggle('show');
                
                if (searchDropdown.classList.contains('show') && searchInput) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            });
        }
        
        if (searchForm) {
            this.addEventListenerWithCleanup(searchForm, 'submit', (e) => {
                e.preventDefault();
                const query = searchInput.value.trim();
                if (query) {
                    this.performSearch(query);
                }
            });
        }
        
        // Cart functionality
        const cartToggle = document.querySelector('.cart-toggle');
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartClose = document.querySelector('.cart-close');
        
        if (cartToggle && cartSidebar) {
            this.addEventListenerWithCleanup(cartToggle, 'click', () => {
                const isExpanded = cartToggle.getAttribute('aria-expanded') === 'true';
                cartToggle.setAttribute('aria-expanded', !isExpanded);
                cartSidebar.classList.toggle('show');
                cartSidebar.setAttribute('aria-hidden', !cartSidebar.classList.contains('show'));
            });
        }
        
        if (cartClose) {
            this.addEventListenerWithCleanup(cartClose, 'click', () => {
                cartSidebar.classList.remove('show');
                cartSidebar.setAttribute('aria-hidden', 'true');
                cartToggle.setAttribute('aria-expanded', 'false');
            });
        }
        
        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            this.addEventListenerWithCleanup(anchor, 'click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }
    
    initializeComponents() {
        // Initialize accessibility features
        this.initializeAccessibilityFeatures();
    }
    
    initializeAccessibilityFeatures() {
        // Add ARIA live regions for dynamic content updates
        const liveRegion = document.createElement('div');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only';
        liveRegion.id = 'live-region';
        document.body.appendChild(liveRegion);
    }
    
    createInventoryStatusElement(product) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'inventory-status';
        
        const icon = document.createElement('i');
        const text = document.createElement('span');
        
        // Defensive programming: handle missing inventory data
        if (typeof product.inventory === 'undefined' || product.inventory === null) {
            // Fallback to inStock boolean if inventory data is missing
            if (product.inStock === false) {
                statusDiv.classList.add('out-of-stock');
                icon.className = 'fas fa-times-circle';
                text.textContent = ' Out of Stock';
            } else {
                statusDiv.classList.add('in-stock');
                icon.className = 'fas fa-check-circle';
                text.textContent = ' In Stock';
            }
        } else {
            // Normal inventory-based logic
            const inventoryCount = parseInt(product.inventory, 10);
            if (inventoryCount === 0) {
                statusDiv.classList.add('out-of-stock');
                icon.className = 'fas fa-times-circle';
                text.textContent = ' Out of Stock';
            } else if (product.lowStockThreshold && inventoryCount <= product.lowStockThreshold) {
                statusDiv.classList.add('low-stock');
                icon.className = 'fas fa-exclamation-triangle';
                text.textContent = ` Only ${inventoryCount} left!`;
            } else if (inventoryCount <= 20) {
                statusDiv.classList.add('in-stock');
                icon.className = 'fas fa-check-circle';
                text.textContent = ` ${inventoryCount} in stock`;
            } else {
                statusDiv.classList.add('in-stock');
                icon.className = 'fas fa-check-circle';
                text.textContent = ' In Stock';
            }
        }
        
        statusDiv.appendChild(icon);
        statusDiv.appendChild(text);
        return statusDiv;
    }
    
    // Legacy method for backward compatibility - now returns HTML safely
    renderInventoryStatus(product) {
        const element = this.createInventoryStatusElement(product);
        return element.outerHTML;
    }
    
    async renderSpotlightProducts() {
        const container = document.getElementById('spotlight-products-grid');
        if (!container) return;
        
        try {
            // Load spotlight products from external JSON file for better maintainability
            const response = await fetch('data/spotlight-products.json');
            if (!response.ok) {
                throw new Error(`Failed to load spotlight products: ${response.status}`);
            }
            const spotlightProducts = await response.json();
            
            this.renderSpotlightProductsFromData(spotlightProducts);
        } catch (error) {
            console.error('Error loading spotlight products:', error);
            // Fallback to empty state or show error message
            const container = document.getElementById('spotlight-products-grid');
            if (container) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = 'Unable to load featured products. Please try again later.';
                container.innerHTML = '';
                container.appendChild(errorDiv);
            }
        }
    }
    
    renderSpotlightProductsFromData(spotlightProducts) {
        const container = document.getElementById('spotlight-products-grid');
        if (!container) return;
        
        // Remove existing event listeners by cloning the container
        const newContainer = container.cloneNode(false);
        newContainer.id = container.id;
        newContainer.className = container.className;
        container.parentNode.replaceChild(newContainer, container);
        
        // Clear existing content
        newContainer.innerHTML = '';
        
        // Create product cards safely using DOM methods to prevent XSS
        spotlightProducts.forEach(product => {
            const productCard = this.createProductCard(product);
            newContainer.appendChild(productCard);
        });
        
        // Use event delegation to prevent memory leaks
        this.addEventListenerWithCleanup(newContainer, 'click', (e) => {
            if (e.target.closest('.add-to-cart-btn')) {
                const productElement = e.target.closest('[data-product-id]');
                if (!productElement) {
                    console.error('Product element with data-product-id not found');
                    return;
                }
                const productId = productElement.dataset.productId;
                if (!productId) {
                    console.error('Invalid product ID:', productElement.dataset.productId);
                    return;
                }
                this.addToCartSpotlight(productId, spotlightProducts);
            }
        });
    }
    
    renderBestsellers() {
        const container = document.getElementById('bestsellers-grid');
        if (!container) return;
        
        const bestsellers = this.products.filter(product => product.bestseller);
        
        // Remove existing event listeners by cloning the container
        const newContainer = container.cloneNode(false);
        newContainer.id = container.id;
        newContainer.className = container.className;
        container.parentNode.replaceChild(newContainer, container);
        
        // Clear existing content
        newContainer.innerHTML = '';
        
        // Create product cards safely using DOM methods to prevent XSS
        bestsellers.forEach(product => {
            const productCard = this.createProductCard(product);
            newContainer.appendChild(productCard);
        });
        
        // Use event delegation to prevent memory leaks
        this.addEventListenerWithCleanup(newContainer, 'click', (e) => {
            if (e.target.closest('.add-to-cart-btn')) {
                const productElement = e.target.closest('[data-product-id]');
                if (!productElement) {
                    console.error('Product element with data-product-id not found');
                    return;
                }
                const productId = parseInt(productElement.dataset.productId) || 0;
                if (productId === 0) {
                    console.error('Invalid product ID:', productElement.dataset.productId);
                    return;
                }
                this.addToCart(productId);
            }
        });
    }
    
    addToCart(productId, quantity = 1) {
        // Debounce cart operations to prevent race conditions
        const operationKey = `add-${productId}`;
        
        // Clear existing timeout for this operation
        if (this.cartOperationTimeouts.has(operationKey)) {
            clearTimeout(this.cartOperationTimeouts.get(operationKey));
        }
        
        // Set new timeout
        const timeoutId = setTimeout(() => {
            this._performAddToCart(productId, quantity);
            this.cartOperationTimeouts.delete(operationKey);
        }, this.cartOperationDelay);
        
        this.cartOperationTimeouts.set(operationKey, timeoutId);
    }
    
    _performAddToCart(productId, quantity = 1) {
        const product = this.products.find(p => p.id === productId);
        if (!product) {
            this.showNotification('Product not found', 'error');
            return;
        }
        
        // Check inventory availability (with fallback to inStock)
        const isOutOfStock = (typeof product.inventory !== 'undefined') 
            ? product.inventory === 0 
            : !product.inStock;
            
        if (isOutOfStock) {
            this.showNotification('Product is out of stock', 'error');
            return;
        }
        
        // Check if adding this quantity would exceed available inventory
        const existingItem = this.cart.find(item => item.id === productId);
        const currentCartQuantity = existingItem ? existingItem.quantity : 0;
        const totalRequestedQuantity = currentCartQuantity + quantity;
        
        if (typeof product.inventory !== 'undefined' && totalRequestedQuantity > product.inventory) {
            const availableQuantity = product.inventory - currentCartQuantity;
            if (availableQuantity <= 0) {
                this.showNotification('No more items available', 'error');
                return;
            } else {
                this.showNotification(`Only ${availableQuantity} more available. Added ${availableQuantity} to cart.`, 'warning');
                quantity = availableQuantity;
            }
        }
        
        // Add or update cart item
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.cart.push({
                id: productId,
                name: product.name,
                price: product.price,
                image: product.image,
                quantity: quantity
            });
        }
        
        this.updateCartDisplay();
        this.saveCartToStorage();
        this.showNotification(`${product.name} added to cart`, 'success');
        this.announceToScreenReader(`${product.name} added to cart`);
    }
    
    addToCartSpotlight(productId, spotlightProducts) {
        const product = spotlightProducts.find(p => p.id === productId);
        if (!product) {
            this.showNotification('Product not found', 'error');
            return;
        }
        
        // Check inventory availability
        if (product.inventory === 0) {
            this.showNotification('Product is out of stock', 'error');
            return;
        }
        
        // Check if adding this quantity would exceed available inventory
        const existingItem = this.cart.find(item => item.id === productId);
        const currentCartQuantity = existingItem ? existingItem.quantity : 0;
        
        if (currentCartQuantity >= product.inventory) {
            this.showNotification('No more items available', 'error');
            return;
        }
        
        // Add or update cart item
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.cart.push({
                id: productId,
                name: product.name,
                price: product.price,
                image: product.image,
                quantity: 1
            });
        }
        
        this.updateCartDisplay();
        this.saveCartToStorage();
        this.showNotification(`${product.name} added to cart`, 'success');
        this.announceToScreenReader(`${product.name} added to cart`);
    }
    
    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.id !== productId);
        this.updateCartDisplay();
        this.saveCartToStorage();
        this.showNotification('Item removed from cart', 'success');
    }
    
    updateCartQuantity(productId, newQuantity) {
        // Debounce cart quantity updates to prevent race conditions
        const operationKey = `update-${productId}`;
        
        // Clear existing timeout for this operation
        if (this.cartOperationTimeouts.has(operationKey)) {
            clearTimeout(this.cartOperationTimeouts.get(operationKey));
        }
        
        // Set new timeout
        const timeoutId = setTimeout(() => {
            this._performUpdateCartQuantity(productId, newQuantity);
            this.cartOperationTimeouts.delete(operationKey);
        }, this.cartOperationDelay);
        
        this.cartOperationTimeouts.set(operationKey, timeoutId);
    }
    
    _performUpdateCartQuantity(productId, newQuantity) {
        const item = this.cart.find(item => item.id === productId);
        
        if (item) {
            if (newQuantity <= 0) {
                this.removeFromCart(productId);
            } else {
                // Find the product to check inventory limits
                const product = this.products.find(p => p.id === productId);
                
                // Check inventory limits before updating quantity
                if (product && typeof product.inventory !== 'undefined') {
                    if (newQuantity > product.inventory) {
                        this.showNotification(`Only ${product.inventory} items available in stock`, 'error');
                        return;
                    }
                }
                
                item.quantity = newQuantity;
                this.updateCartDisplay();
                this.saveCartToStorage();
            }
        }
    }
    
    updateCartDisplay() {
        const cartCount = document.getElementById('cart-count');
        const cartContent = document.getElementById('cart-content');
        const cartFooter = document.getElementById('cart-footer');
        const cartTotal = document.getElementById('cart-total');
        
        // Update cart count
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        if (cartCount) {
            cartCount.textContent = totalItems;
            cartCount.style.display = totalItems > 0 ? 'block' : 'none';
        }
        
        // Update cart content
        if (cartContent) {
            if (this.cart.length === 0) {
                // Create empty cart message safely
                const emptyCartDiv = document.createElement('div');
                emptyCartDiv.className = 'empty-cart';
                
                const icon = document.createElement('i');
                icon.className = 'fas fa-shopping-cart';
                icon.setAttribute('aria-hidden', 'true');
                
                const message = document.createElement('p');
                message.textContent = 'Your cart is empty';
                
                const shopLink = document.createElement('a');
                shopLink.href = '#products';
                shopLink.className = 'btn btn-primary';
                shopLink.textContent = 'Start Shopping';
                
                emptyCartDiv.appendChild(icon);
                emptyCartDiv.appendChild(message);
                emptyCartDiv.appendChild(shopLink);
                
                cartContent.innerHTML = '';
                cartContent.appendChild(emptyCartDiv);
                if (cartFooter) cartFooter.style.display = 'none';
            } else {
                // Clear existing content
                cartContent.innerHTML = '';
                
                // Create cart items safely using DOM methods to prevent XSS
                this.cart.forEach(item => {
                    const cartItem = document.createElement('div');
                    cartItem.className = 'cart-item';
                    cartItem.setAttribute('data-product-id', item.id);
                    
                    // Create image element
                    const img = document.createElement('img');
                    img.src = item.image || '';
                    img.alt = item.name || '';
                    img.className = 'cart-item-image';
                    
                    // Create details container
                    const details = document.createElement('div');
                    details.className = 'cart-item-details';
                    
                    // Create name element
                    const name = document.createElement('h4');
                    name.className = 'cart-item-name';
                    name.textContent = item.name || '';
                    
                    // Create controls container
                    const controls = document.createElement('div');
                    controls.className = 'cart-item-controls';
                    
                    // Create decrease button
                    const decreaseBtn = document.createElement('button');
                    decreaseBtn.className = 'quantity-btn';
                    decreaseBtn.setAttribute('data-action', 'decrease');
                    decreaseBtn.setAttribute('aria-label', 'Decrease quantity');
                    decreaseBtn.textContent = '-';
                    
                    // Create quantity span
                    const quantitySpan = document.createElement('span');
                    quantitySpan.className = 'quantity';
                    quantitySpan.textContent = item.quantity || '0';
                    
                    // Create increase button
                    const increaseBtn = document.createElement('button');
                    increaseBtn.className = 'quantity-btn';
                    increaseBtn.setAttribute('data-action', 'increase');
                    increaseBtn.setAttribute('aria-label', 'Increase quantity');
                    increaseBtn.textContent = '+';
                    
                    // Create price container
                    const priceContainer = document.createElement('div');
                    priceContainer.className = 'cart-item-price';
                    
                    // Create price span
                    const priceSpan = document.createElement('span');
                    priceSpan.textContent = `$${((item.price || 0) * (item.quantity || 0)).toFixed(2)}`;
                    
                    // Create remove button
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-item-btn';
                    removeBtn.setAttribute('aria-label', `Remove ${item.name || 'item'} from cart`);
                    
                    // Create trash icon
                    const trashIcon = document.createElement('i');
                    trashIcon.className = 'fas fa-trash';
                    trashIcon.setAttribute('aria-hidden', 'true');
                    
                    // Assemble the structure
                    controls.appendChild(decreaseBtn);
                    controls.appendChild(quantitySpan);
                    controls.appendChild(increaseBtn);
                    
                    details.appendChild(name);
                    details.appendChild(controls);
                    
                    removeBtn.appendChild(trashIcon);
                    priceContainer.appendChild(priceSpan);
                    priceContainer.appendChild(removeBtn);
                    
                    cartItem.appendChild(img);
                    cartItem.appendChild(details);
                    cartItem.appendChild(priceContainer);
                    
                    cartContent.appendChild(cartItem);
                });
                
                if (cartFooter) cartFooter.style.display = 'block';
            }
        }
        
        // Update cart total
        const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (cartTotal) {
            cartTotal.textContent = `$${total.toFixed(2)}`;
        }
        
        // Use event delegation to prevent memory leaks in cart controls
        if (cartContent && this.cart.length > 0) {
            // Remove existing event listeners to prevent accumulation
            if (cartContent.cartEventListener) {
                cartContent.removeEventListener('click', cartContent.cartEventListener);
            }
            
            // Create and store event listener reference for cleanup
            cartContent.cartEventListener = (e) => {
                const cartItem = e.target.closest('.cart-item');
                if (!cartItem) return;
                
                const productId = parseInt(cartItem.dataset.productId) || 0;
                if (productId === 0) {
                    console.error('Invalid product ID in cart item:', cartItem.dataset.productId);
                    return;
                }
                
                if (e.target.closest('.quantity-btn')) {
                    const action = e.target.dataset.action;
                    const quantityElement = cartItem.querySelector('.quantity');
                    
                    // Add null check to prevent runtime errors
                    if (!quantityElement) {
                        console.error('Quantity element not found in cart item');
                        return;
                    }
                    
                    const currentQuantity = parseInt(quantityElement.textContent) || 0;
                    
                    if (action === 'increase') {
                        this.updateCartQuantity(productId, currentQuantity + 1);
                    } else if (action === 'decrease') {
                        this.updateCartQuantity(productId, currentQuantity - 1);
                    }
                } else if (e.target.closest('.remove-item-btn')) {
                    this.removeFromCart(productId);
                }
            };
            
            // Add the event listener with tracking
            this.addEventListenerWithCleanup(cartContent, 'click', cartContent.cartEventListener);
        }
    }
    
    performSearch(query) {
        // Simple search implementation with null safety
        const results = this.products.filter(product => {
            const searchQuery = query.toLowerCase();
            const name = (product.name || '').toLowerCase();
            const description = (product.description || '').toLowerCase();
            const category = (product.category || '').toLowerCase();
            
            return name.includes(searchQuery) ||
                   description.includes(searchQuery) ||
                   category.includes(searchQuery);
        });
        
        this.showSearchResults(results, query);
        this.announceToScreenReader(`Found ${results.length} results for "${query}"`);
    }
    
    showSearchResults(results, query) {
        // This would typically navigate to a search results page
        // For now, we'll show a simple notification
        this.showNotification(`Found ${results.length} results for "${query}"`, 'info');
        
        // Close search dropdown
        const searchDropdown = document.querySelector('.search-dropdown');
        if (searchDropdown) {
            searchDropdown.classList.remove('show');
        }
    }
    
    saveCartToStorage() {
        try {
            localStorage.setItem('hmherbs_cart', JSON.stringify(this.cart));
        } catch (error) {
            console.error('Error saving cart to localStorage:', error);
        }
    }
    
    loadCartFromStorage() {
        try {
            const savedCart = localStorage.getItem('hmherbs_cart');
            if (savedCart) {
                this.cart = JSON.parse(savedCart);
            }
        } catch (error) {
            console.error('Error loading cart from localStorage:', error);
            this.cart = [];
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // Create content safely without innerHTML to prevent XSS
        const content = document.createElement('div');
        content.className = 'notification-content';
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-message';
        messageSpan.textContent = message; // Use textContent to prevent XSS
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.setAttribute('aria-label', 'Close notification');
        
        const closeIcon = document.createElement('i');
        closeIcon.className = 'fas fa-times';
        closeIcon.setAttribute('aria-hidden', 'true');
        
        closeBtn.appendChild(closeIcon);
        content.appendChild(messageSpan);
        content.appendChild(closeBtn);
        notification.appendChild(content);
        
        // Add styles for notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#2563eb'};
            color: white;
            padding: 1rem;
            border-radius: 0.5rem;
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
            z-index: 1070;
            transform: translateX(100%);
            transition: transform 250ms ease-in-out;
            max-width: 300px;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Add close functionality (closeBtn already created above)
        this.addEventListenerWithCleanup(closeBtn, 'click', () => {
            // Clear the auto-close timeout when manually closed
            if (notification.autoCloseTimeout) {
                clearTimeout(notification.autoCloseTimeout);
            }
            this.closeNotification(notification);
        });
        
        // Auto-close after 5 seconds
        notification.autoCloseTimeout = setTimeout(() => {
            this.closeNotification(notification);
        }, 5000);
    }
    
    closeNotification(notification) {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
    
    announceToScreenReader(message) {
        const liveRegion = document.getElementById('live-region');
        if (liveRegion) {
            liveRegion.textContent = message;
            // Clear after announcement
            setTimeout(() => {
                liveRegion.textContent = '';
            }, 1000);
        }
    }
    
    // Helper function to escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Helper function to safely create product cards using DOM methods
    createProductCard(product) {
        const productCard = document.createElement('div');
        productCard.className = `product-card ${product.inventory === 0 ? 'out-of-stock' : ''} ${product.inventory <= product.lowStockThreshold ? 'low-stock' : ''}`;
        productCard.setAttribute('data-product-id', product.id);
        
        // Create image element
        const img = document.createElement('img');
        img.src = product.image || '';
        img.alt = product.name || '';
        img.className = 'product-image';
        img.setAttribute('loading', 'lazy');
        
        // Create title element (make it clickable if URL is provided)
        const title = document.createElement('h3');
        title.className = 'product-title';
        
        if (product.url) {
            const titleLink = document.createElement('a');
            titleLink.href = product.url;
            titleLink.textContent = product.name || '';
            titleLink.target = '_blank';
            titleLink.rel = 'noopener noreferrer';
            titleLink.className = 'product-title-link';
            title.appendChild(titleLink);
        } else {
            title.textContent = product.name || '';
        }
        
        // Create description element (if available)
        let description = null;
        if (product.description) {
            description = document.createElement('p');
            description.className = 'product-description';
            description.textContent = product.description;
        }
        
        // Create price element
        const price = document.createElement('p');
        price.className = 'product-price';
        price.textContent = `$${(product.price || 0).toFixed(2)}`;
        
        // Create inventory status safely
        const inventoryStatus = this.createInventoryStatusElement(product);
        
        // Create actions container
        const actions = document.createElement('div');
        actions.className = 'product-actions';
        
        // Create add to cart button
        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'btn btn-primary add-to-cart-btn';
        addToCartBtn.setAttribute('data-product-id', product.id);
        addToCartBtn.setAttribute('aria-label', `Add ${product.name || 'product'} to cart`);
        
        if (product.inventory === 0) {
            addToCartBtn.disabled = true;
        }
        
        // Create cart icon
        const cartIcon = document.createElement('i');
        cartIcon.className = 'fas fa-cart-plus';
        cartIcon.setAttribute('aria-hidden', 'true');
        
        // Add button text
        const buttonText = document.createTextNode(product.inventory === 0 ? ' Out of Stock' : ' Add to Cart');
        
        // Assemble button
        addToCartBtn.appendChild(cartIcon);
        addToCartBtn.appendChild(buttonText);
        
        // Assemble actions
        actions.appendChild(addToCartBtn);
        
        // Assemble product card
        productCard.appendChild(img);
        productCard.appendChild(title);
        if (description) {
            productCard.appendChild(description);
        }
        productCard.appendChild(price);
        productCard.appendChild(inventoryStatus);
        productCard.appendChild(actions);
        
        return productCard;
    }
}

// Performance Optimization Functions

// Lazy Loading for Images
function initLazyLoading() {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    
                    // Add error handling for failed image loads
                    this.addEventListenerWithCleanup(img, 'load', () => {
                        img.classList.remove('lazy');
                        img.classList.add('loaded');
                    }, { once: true });
                    
                    this.addEventListenerWithCleanup(img, 'error', () => {
                        img.classList.remove('lazy');
                        img.classList.add('error');
                        console.warn('Failed to load image:', img.dataset.src);
                        // Set fallback image if available
                        if (img.dataset.fallback) {
                            img.src = img.dataset.fallback;
                        }
                    }, { once: true });
                    
                    img.src = img.dataset.src;
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px',
            threshold: 0.01
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    } else {
        // Fallback for browsers without IntersectionObserver
        document.querySelectorAll('img[data-src]').forEach(img => {
            // Add error handling for fallback mode too
            this.addEventListenerWithCleanup(img, 'load', () => {
                img.classList.remove('lazy');
                img.classList.add('loaded');
            }, { once: true });
            
            this.addEventListenerWithCleanup(img, 'error', () => {
                img.classList.remove('lazy');
                img.classList.add('error');
                console.warn('Failed to load image:', img.dataset.src);
                if (img.dataset.fallback) {
                    img.src = img.dataset.fallback;
                }
            }, { once: true });
            
            img.src = img.dataset.src;
        });
    }
}

// Image Optimization
function initImageOptimization() {
    // Add loading="lazy" to images that don't have it
    document.querySelectorAll('img:not([loading])').forEach(img => {
        // Don't lazy load images that are above the fold
        const rect = img.getBoundingClientRect();
        if (rect.top > window.innerHeight) {
            img.loading = 'lazy';
        }
    });

    // Optimize images for different screen sizes
    if (window.devicePixelRatio > 1) {
        document.querySelectorAll('img').forEach(img => {
            if (img.src && !img.src.includes('w=')) {
                // Add high DPI optimization for Unsplash images
                img.src = img.src.replace('w=400', 'w=800&dpr=2');
            }
        });
    }
}

// Core Web Vitals Optimization
function optimizeCoreWebVitals() {
    // Preload critical resources
    const criticalResources = [
        { href: '/styles.css', as: 'style' },
        { href: '/script.js', as: 'script' }
    ];

    criticalResources.forEach(resource => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = resource.href;
        link.as = resource.as;
        document.head.appendChild(link);
    });

    // Optimize font loading
    if ('fonts' in document) {
        document.fonts.ready.then(() => {
            document.body.classList.add('fonts-loaded');
        });
    }
}

// Service Worker Registration for PWA
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                    console.log('SW registered: ', registration);
                    
                    // Check if service worker is actually controlling the page
                    if (!navigator.serviceWorker.controller) {
                        console.info('Service worker registered but not yet controlling the page');
                    }
                    
                    // Listen for updates
                    registration.addEventListener('updatefound', () => {
                        console.log('Service worker update found');
                    });
                })
                .catch(registrationError => {
                    console.error('SW registration failed: ', registrationError);
                    
                    // Provide more detailed error information
                    if (registrationError.name === 'SecurityError') {
                        console.warn('Service Worker registration failed due to security restrictions. HTTPS required.');
                    } else if (registrationError.name === 'NetworkError') {
                        console.warn('Service Worker registration failed due to network issues. Retrying in 30 seconds...');
                        // Retry after network issues
                        setTimeout(() => {
                            registerServiceWorker();
                        }, 30000);
                    }
                    
                    // Graceful degradation - app continues to work without SW
                    console.info('App will continue to work without offline capabilities');
                });
        });
    } else {
        console.info('Service Workers not supported in this browser');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize performance optimizations
    initLazyLoading();
    initImageOptimization();
    optimizeCoreWebVitals();
    
    // Initialize main application only if not on products page
    if (!window.location.pathname.includes('products.html')) {
        window.hmHerbsApp = new HMHerbsApp();
    }
    
    // Register service worker for PWA features
    registerServiceWorker();
    
    // Setup cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.hmHerbsApp) {
            window.hmHerbsApp.cleanup();
        }
    });
    
    // Also cleanup on page hide (for mobile)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && window.hmHerbsApp) {
            window.hmHerbsApp.cleanup();
        }
    });
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HMHerbsApp;
}

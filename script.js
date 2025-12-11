// H&M Herbs & Vitamins - Interactive JavaScript
// Modern, accessible, and feature-rich functionality

// Production-safe logging utility
const Logger = {
    isDevelopment: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    log: function (...args) {
        if (this.isDevelopment) console.log(...args);
    },
    error: function (...args) {
        if (this.isDevelopment) console.error(...args);
    },
    warn: function (...args) {
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
            // Ensure cart starts closed
            this.ensureCartClosed();

            // Load products data
            await this.loadProducts();

            // Setup event listeners
            this.setupEventListeners();

            // Initialize components
            this.initializeComponents();

            // Load cart from localStorage
            this.loadCartFromStorage();

            // Debug: Only log if cart has items (suppress empty cart logs)
            if (Logger.isDevelopment && this.cart.length > 0) {
                console.log('Cart loaded from storage:', this.cart);
                console.log('Cart length:', this.cart.length);
            }

            // Render initial content
            this.renderSpotlightProducts();
            this.updateCartDisplay();

            // Suppress initialization message for cleaner console
            // Logger.log('H&M Herbs app initialized successfully');
        } catch (error) {
            Logger.error('Error initializing app:', error);
            this.showNotification('Unable to load the application. Please refresh the page or try again later.', 'error');
        }
    }

    ensureCartClosed() {
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        const cartToggle = document.querySelector('.cart-toggle');

        if (cartSidebar) {
            cartSidebar.classList.remove('show', 'open');
            cartSidebar.setAttribute('aria-hidden', 'true');
            // Force close with inline styles as backup
            cartSidebar.style.transform = 'translateX(100%)';
            cartSidebar.style.visibility = 'hidden';
            cartSidebar.style.opacity = '0';
        }

        if (cartOverlay) {
            cartOverlay.classList.remove('active');
            cartOverlay.style.opacity = '0';
            cartOverlay.style.visibility = 'hidden';
        }

        if (cartToggle) {
            cartToggle.setAttribute('aria-expanded', 'false');
        }

        // Ensure body overflow is reset
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
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
                Logger.warn('Error removing HMHerbsApp event listener:', error);
            }
        });
        this.eventListeners = [];

        // Clear any pending cart operation timeouts
        this.cartOperationTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.cartOperationTimeouts.clear();
    }

    async loadProducts() {
        // Check if we're in file:// protocol (local file)
        const isFileProtocol = window.location.protocol === 'file:';

        // Skip API call if in file:// protocol to avoid CORS errors
        if (isFileProtocol) {
            Logger.log('File protocol detected, skipping API call');
            this.products = [];
            return;
        }

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

            // Only log if products were loaded (0 products might be expected)
            if (this.products.length > 0) {
                Logger.log(`✅ Loaded ${this.products.length} products from API`);
            }

            // Update the UI after loading products
            this.renderSpotlightProducts();

        } catch (error) {
            Logger.error('❌ Failed to load products from API:', error);

            // Fallback to empty array and show user-friendly message
            this.products = [];
            this.showNotification('Unable to load products. Please check your connection and try again.', 'error');
        }
    }

    setupEventListeners() {
        // Mobile menu toggle - Skip if already handled by inline script
        // The inline script in head handles this to ensure it works immediately
        if (window.toggleMobileMenu) {
            // Menu is already handled by inline script, just return
            return;
        }

        // Mobile menu toggle (fallback)
        // Skip mobile menu if enhanced version is active
        if (document.body.getAttribute("data-enhanced-mobile-menu") === "true") {
            return;
        }

        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        const navMenu = document.querySelector('.nav-menu');

        if (mobileMenuToggle && navMenu) {
            this.addEventListenerWithCleanup(mobileMenuToggle, 'click', () => {
                const isExpanded = mobileMenuToggle.getAttribute('aria-expanded') === 'true';
                mobileMenuToggle.setAttribute('aria-expanded', !isExpanded);
                navMenu.classList.toggle('show');
            });

            // Close menu when clicking outside
            const handleOutsideClick = (e) => {
                if (navMenu.classList.contains('show') &&
                    !mobileMenuToggle.contains(e.target) &&
                    !navMenu.contains(e.target)) {
                    navMenu.classList.remove('show');
                    mobileMenuToggle.setAttribute('aria-expanded', 'false');
                }
            };
            document.addEventListener('click', handleOutsideClick, true);

            // Close menu on window resize if it becomes desktop size
            const handleResize = () => {
                if (window.innerWidth > 768 && navMenu.classList.contains('show')) {
                    navMenu.classList.remove('show');
                    mobileMenuToggle.setAttribute('aria-expanded', 'false');
                }
            };
            window.addEventListener('resize', handleResize);
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
        const cartOverlay = document.getElementById('cart-overlay');

        // Ensure cart starts closed
        if (cartSidebar) {
            cartSidebar.classList.remove('show', 'open');
            cartSidebar.setAttribute('aria-hidden', 'true');
        }

        if (cartToggle && cartSidebar) {
            this.addEventListenerWithCleanup(cartToggle, 'click', () => {
                const isExpanded = cartToggle.getAttribute('aria-expanded') === 'true';
                cartToggle.setAttribute('aria-expanded', !isExpanded);

                if (isExpanded) {
                    // Close cart
                    cartSidebar.classList.remove('show', 'open');
                    cartSidebar.setAttribute('aria-hidden', 'true');
                    cartSidebar.style.transform = 'translateX(100%)';
                    cartSidebar.style.visibility = 'hidden';
                    cartSidebar.style.opacity = '0';
                    if (cartOverlay) {
                        cartOverlay.classList.remove('active');
                        cartOverlay.style.opacity = '0';
                        cartOverlay.style.visibility = 'hidden';
                    }
                    document.body.style.overflow = '';
                    document.documentElement.style.overflow = '';
                } else {
                    // Open cart
                    cartSidebar.classList.add('show');
                    cartSidebar.setAttribute('aria-hidden', 'false');
                    cartSidebar.style.transform = 'translateX(0)';
                    cartSidebar.style.visibility = 'visible';
                    cartSidebar.style.opacity = '1';
                    if (cartOverlay) {
                        cartOverlay.classList.add('active');
                        cartOverlay.style.opacity = '1';
                        cartOverlay.style.visibility = 'visible';
                    }
                    document.body.style.overflow = 'hidden';

                    // Refresh display to ensure cart content is up to date
                    // Use setTimeout to ensure DOM is ready
                    setTimeout(() => {
                        this.updateCartDisplay();

                        // Force a re-render check
                        const cartContent = document.getElementById('cart-content');
                        if (cartContent && this.cart.length > 0 && cartContent.children.length === 0) {
                            if (Logger.isDevelopment) {
                                console.error('Cart items not rendering! Forcing re-render...');
                                console.error('Cart array:', this.cart);
                            }
                            // Force clear and re-render
                            cartContent.innerHTML = '';
                            this.updateCartDisplay();
                        }
                    }, 50);
                }
            });
        }

        if (cartClose && cartSidebar) {
            this.addEventListenerWithCleanup(cartClose, 'click', () => {
                cartSidebar.classList.remove('show', 'open');
                cartSidebar.setAttribute('aria-hidden', 'true');
                cartSidebar.style.transform = 'translateX(100%)';
                cartSidebar.style.visibility = 'hidden';
                cartSidebar.style.opacity = '0';
                if (cartToggle) {
                    cartToggle.setAttribute('aria-expanded', 'false');
                }
                if (cartOverlay) {
                    cartOverlay.classList.remove('active');
                    cartOverlay.style.opacity = '0';
                    cartOverlay.style.visibility = 'hidden';
                }
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            });
        }

        // Close cart when clicking overlay
        if (cartOverlay && cartSidebar) {
            this.addEventListenerWithCleanup(cartOverlay, 'click', () => {
                cartSidebar.classList.remove('show', 'open');
                cartSidebar.setAttribute('aria-hidden', 'true');
                cartSidebar.style.transform = 'translateX(100%)';
                cartSidebar.style.visibility = 'hidden';
                cartSidebar.style.opacity = '0';
                cartOverlay.classList.remove('active');
                cartOverlay.style.opacity = '0';
                cartOverlay.style.visibility = 'hidden';
                if (cartToggle) {
                    cartToggle.setAttribute('aria-expanded', 'false');
                }
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
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
        // Prevent focus from causing scroll
        liveRegion.style.position = 'absolute';
        liveRegion.style.left = '-9999px';
        liveRegion.style.width = '1px';
        liveRegion.style.height = '1px';
        liveRegion.style.overflow = 'hidden';
        liveRegion.tabIndex = -1;
        document.body.appendChild(liveRegion);

        // Monitor for any focus events that might cause scrolling
        document.addEventListener('focusin', (e) => {
            // If focus is on an element near the bottom of the page, prevent scroll
            const rect = e.target.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;

            // If we're near the bottom and there's no hash, scroll back to top
            if (!window.location.hash && (rect.top > viewportHeight * 0.8 || window.scrollY > documentHeight * 0.7)) {
                // Only prevent if this is happening on page load (first few seconds)
                if (performance.now() < 3000) {
                    setTimeout(() => {
                        window.scrollTo(0, 0);
                        document.documentElement.scrollTop = 0;
                        document.body.scrollTop = 0;
                    }, 0);
                }
            }
        }, { passive: true });
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

        // Check if we're in file:// protocol (local file)
        const isFileProtocol = window.location.protocol === 'file:';

        try {
            // Skip fetch if in file:// protocol to avoid CORS errors
            if (isFileProtocol) {
                // Use fallback demo products for local file viewing
                const fallbackProducts = this.getFallbackSpotlightProducts();
                this.renderSpotlightProductsFromData(fallbackProducts);
                return;
            }

            // Load spotlight products from external JSON file for better maintainability
            const response = await fetch('data/spotlight-products.json');
            if (!response.ok) {
                throw new Error(`Failed to load spotlight products: ${response.status}`);
            }
            const spotlightProducts = await response.json();

            this.renderSpotlightProductsFromData(spotlightProducts);
        } catch (error) {
            Logger.error('Error loading spotlight products:', error);
            // Fallback to demo products
            const fallbackProducts = this.getFallbackSpotlightProducts();
            this.renderSpotlightProductsFromData(fallbackProducts);
        }
    }

    getFallbackSpotlightProducts() {
        // Fallback products for when JSON file can't be loaded
        return [
            {
                id: 1,
                name: "Premium Herbal Blend",
                price: 24.99,
                image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                inventory: 25,
                featured: true,
                description: "Premium quality herbal blend for supporting your health and wellness goals."
            },
            {
                id: 2,
                name: "Natural Vitamin Complex",
                price: 19.99,
                image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                inventory: 30,
                featured: true,
                description: "Complete natural vitamin complex with essential nutrients for daily wellness."
            },
            {
                id: 3,
                name: "Organic Supplements",
                price: 29.99,
                image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                inventory: 20,
                featured: true,
                description: "Certified organic supplements made with natural ingredients."
            },
            {
                id: 4,
                name: "Wellness Formula",
                price: 34.99,
                image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                inventory: 15,
                featured: true,
                description: "Comprehensive wellness formula for overall health support."
            }
        ];
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
                    Logger.error('Product element with data-product-id not found');
                    return;
                }
                const productId = productElement.dataset.productId || productElement.getAttribute('data-product-id');
                if (!productId) {
                    Logger.error('Invalid product ID:', productElement.dataset.productId || productElement.getAttribute('data-product-id'));
                    return;
                }
                this.addToCartSpotlight(productId, spotlightProducts);
            }
        });
    }

    renderBestsellers() {
        const container = document.getElementById('bestsellers-grid');
        if (!container) {
            // Element doesn't exist on this page, skip silently
            return;
        }

        const bestsellers = this.products.filter(product => product.bestseller);
        if (bestsellers.length === 0) {
            return;
        }

        // Remove existing event listeners by cloning the container
        const newContainer = container.cloneNode(false);
        newContainer.id = container.id;
        newContainer.className = container.className;

        if (container.parentNode) {
            container.parentNode.replaceChild(newContainer, container);
        } else {
            return; // Safety check
        }

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
                    Logger.error('Product element with data-product-id not found');
                    return;
                }
                const productId = parseInt(productElement.dataset.productId || productElement.getAttribute('data-product-id')) || 0;
                if (productId === 0 || isNaN(productId)) {
                    Logger.error('Invalid product ID:', productElement.dataset.productId);
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

        // Debug: Only log in verbose debug mode (suppress normal logging)
        // if (Logger.isDevelopment && window.DEBUG_MODE) {
        //     console.log('updateCartDisplay called');
        //     console.log('Cart array:', this.cart);
        //     console.log('Cart length:', this.cart?.length);
        //     console.log('cartContent element:', cartContent);
        // }

        // Update cart count - ensure cart is valid array
        if (!Array.isArray(this.cart)) {
            Logger.warn('Cart is not an array, resetting to empty array');
            this.cart = [];
        }

        const totalItems = this.cart.reduce((sum, item) => {
            const qty = (item && typeof item.quantity === 'number') ? item.quantity : 0;
            return sum + qty;
        }, 0);

        if (cartCount) {
            cartCount.textContent = totalItems;
            cartCount.style.display = totalItems > 0 ? 'block' : 'none';
        }

        // Update cart content
        if (!cartContent) {
            Logger.error('cart-content element not found!');
            return;
        }

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

                // Debug: Log cart state
                if (Logger.isDevelopment) {
                    console.log('Rendering cart with', this.cart.length, 'items:', this.cart);
                    console.log('cartContent before rendering:', cartContent);
                    console.log('cartContent.innerHTML length:', cartContent.innerHTML.length);
                }

                // Create cart items safely using DOM methods to prevent XSS
                let itemsRendered = 0;
                this.cart.forEach((item, index) => {
                    // Validate cart item has required properties
                    if (!item || !item.id) {
                        Logger.warn('Invalid cart item found at index', index, ':', item);
                        if (Logger.isDevelopment) {
                            console.warn('Skipping invalid item at index', index, ':', item);
                        }
                        return; // Skip invalid items
                    }

                    // Ensure quantity is valid
                    if (!item.quantity || item.quantity <= 0) {
                        Logger.warn('Cart item has invalid quantity:', item);
                        if (Logger.isDevelopment) {
                            console.warn('Skipping item with invalid quantity:', item);
                        }
                        return; // Skip items with invalid quantity
                    }

                    itemsRendered++;

                    const cartItem = document.createElement('div');
                    cartItem.className = 'cart-item';
                    cartItem.setAttribute('data-product-id', item.id);

                    // Create image element
                    const img = document.createElement('img');
                    img.src = item.image || '';
                    img.alt = item.name || 'Product image';
                    img.className = 'cart-item-image';

                    // Add error handling for images
                    img.onerror = function () {
                        this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
                    };

                    // Debug: Log item being rendered
                    if (Logger.isDevelopment) {
                        console.log('Creating cart item element for:', item.name, 'with id:', item.id);
                    }

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

                    if (Logger.isDevelopment) {
                        console.log('Rendered cart item:', item.name, 'at index', index);
                    }
                });

                // Debug: Log rendering results
                if (Logger.isDevelopment) {
                    console.log('Items rendered:', itemsRendered, 'out of', this.cart.length);
                    console.log('cartContent.children.length:', cartContent.children.length);
                    console.log('cartContent.innerHTML length after:', cartContent.innerHTML.length);
                }

                // Debug: Log if no items were rendered
                if (cartContent.children.length === 0 && this.cart.length > 0) {
                    Logger.warn('Cart has items but none were rendered. Cart items:', this.cart);
                    if (Logger.isDevelopment) {
                        console.error('Cart rendering issue - items in cart but none rendered');
                        console.error('Cart array:', this.cart);
                        console.error('cartContent element:', cartContent);
                    }
                }

                if (cartFooter) cartFooter.style.display = 'block';
            }
        }

        // Update cart total
        const total = this.cart.reduce((sum, item) => {
            const price = (item && typeof item.price === 'number') ? item.price : 0;
            const qty = (item && typeof item.quantity === 'number') ? item.quantity : 0;
            return sum + (price * qty);
        }, 0);
        if (cartTotal) {
            cartTotal.textContent = `$${total.toFixed(2)}`;
        }

        // Debug: Suppress verbose logging (only log errors)
        // if (Logger.isDevelopment) {
        //     console.log('updateCartDisplay complete');
        //     console.log('Cart array length:', this.cart.length);
        //     console.log('cartContent element:', cartContent);
        //     console.log('cartContent children:', cartContent?.children?.length || 0);
        //     console.log('cartContent.innerHTML length:', cartContent?.innerHTML?.length || 0);
        //     if (cartContent && this.cart.length > 0) {
        //         console.log('First cart item:', this.cart[0]);
        //         console.log('First child element:', cartContent.firstElementChild);
        //     }
        // }

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

                const productId = parseInt(cartItem.dataset.productId || cartItem.getAttribute('data-product-id')) || 0;
                if (productId === 0 || isNaN(productId)) {
                    Logger.error('Invalid product ID in cart item:', cartItem.dataset.productId);
                    return;
                }

                const quantityBtn = e.target.closest('.quantity-btn');
                const removeBtn = e.target.closest('.remove-item-btn');

                if (quantityBtn) {
                    const action = quantityBtn.getAttribute('data-action');
                    const quantityElement = cartItem.querySelector('.quantity');

                    // Add null check to prevent runtime errors
                    if (!quantityElement) {
                        Logger.error('Quantity element not found in cart item');
                        return;
                    }

                    const currentQuantity = parseInt(quantityElement.textContent) || 0;

                    if (action === 'increase') {
                        this.updateCartQuantity(productId, currentQuantity + 1);
                    } else if (action === 'decrease') {
                        this.updateCartQuantity(productId, Math.max(0, currentQuantity - 1));
                    }
                } else if (removeBtn) {
                    this.removeFromCart(productId);
                }
            };

            // Add the event listener with tracking
            this.addEventListenerWithCleanup(cartContent, 'click', cartContent.cartEventListener);
        }
    }

    performSearch(query) {
        // Keyword-based search - split query into individual words
        const searchKeywords = query.toLowerCase().trim().split(/\s+/).filter(word => word.length > 0);

        if (searchKeywords.length === 0) {
            this.showSearchResults([], query);
            return;
        }

        // Filter products where ANY keyword matches in name, description, or category
        const results = this.products.filter(product => {
            const name = (product.name || '').toLowerCase();
            const description = (product.description || '').toLowerCase();
            const category = (product.category || '').toLowerCase();
            const brand = (product.brand || '').toLowerCase();

            // Check if ALL keywords are found somewhere in the product data
            return searchKeywords.every(keyword =>
                name.includes(keyword) ||
                description.includes(keyword) ||
                category.includes(keyword) ||
                brand.includes(keyword)
            );
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
            Logger.error('Error saving cart to localStorage:', error);
        }
    }

    loadCartFromStorage() {
        try {
            const savedCart = localStorage.getItem('hmherbs_cart');
            if (savedCart) {
                const parsedCart = JSON.parse(savedCart);
                // Validate and filter out invalid cart items
                this.cart = Array.isArray(parsedCart)
                    ? parsedCart.filter(item => item && item.id && item.name && typeof item.quantity === 'number' && item.quantity > 0)
                    : [];

                // If cart was filtered, save the cleaned version
                if (this.cart.length !== (parsedCart?.length || 0)) {
                    this.saveCartToStorage();
                }
            }
        } catch (error) {
            Logger.error('Error loading cart from localStorage:', error);
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
                        Logger.warn('Failed to load image:', img.dataset.src);
                        // Set fallback image if available
                        if (img.dataset.fallback) {
                            img.src = img.dataset.fallback;
                        }
                    }, { once: true });

                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                    }
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
                Logger.warn('Failed to load image:', img.dataset.src);
                if (img.dataset.fallback) {
                    img.src = img.dataset.fallback;
                }
            }, { once: true });

            if (img.dataset.src) {
                img.src = img.dataset.src;
            }
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

    // Skip preloading if on file:// protocol
    if (window.location.protocol !== 'file:') {
        criticalResources.forEach(resource => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = resource.href;
            link.as = resource.as;
            document.head.appendChild(link);
        });
    }

    // Optimize font loading
    if ('fonts' in document) {
        document.fonts.ready.then(() => {
            document.body.classList.add('fonts-loaded');
        });
    }
}

// Service Worker Registration for PWA
function registerServiceWorker() {
    // Skip service worker registration in file:// protocol
    if (window.location.protocol === 'file:') {
        return;
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                    // Suppress service worker registration logs for cleaner console
                    // if (Logger.isDevelopment) {
                    //     console.log('SW registered: ', registration);
                    // }

                    // Check if service worker is actually controlling the page
                    // if (!navigator.serviceWorker.controller && Logger.isDevelopment) {
                    //     console.info('Service worker registered but not yet controlling the page');
                    // }

                    // Listen for updates
                    registration.addEventListener('updatefound', () => {
                        console.log('Service worker update found');
                    });
                })
                .catch(registrationError => {
                    // Only log error if not a protocol issue
                    if (!registrationError.message.includes('URL protocol') &&
                        !registrationError.message.includes('not supported') &&
                        !registrationError.message.includes('null')) {
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
                    }

                    // Graceful degradation - app continues to work without SW
                    console.info('App will continue to work without offline capabilities');
                });
        });
    } else {
        console.info('Service Workers not supported in this browser');
    }
}

// Prevent automatic scroll restoration (but allow user scrolling)
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

// Only prevent automatic scroll restoration on page load, not user scrolling
(function () {
    let isInitialLoad = true;
    let initialLoadComplete = false;

    // Ensure page starts at top on initial load/refresh only
    const ensureTopOnLoad = () => {
        if (isInitialLoad && !window.location.hash) {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }
    };

    // Run once on load
    window.addEventListener('load', () => {
        ensureTopOnLoad();
        // Mark initial load as complete after a short delay
        setTimeout(() => {
            initialLoadComplete = true;
            isInitialLoad = false;
        }, 500);
    }, { passive: true });

    // Also ensure top on DOM ready (before images load)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureTopOnLoad();
        });
    } else {
        // DOM already loaded
        ensureTopOnLoad();
    }
})();

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

// Note: Mobile menu toggle is handled by inline script in index.html head
// This ensures it works immediately without waiting for script.js to load

// EDSA Booking Function - Now handled by edsa-booking.js
function openEDSABooking() {
    // The actual implementation is in js/edsa-booking.js
    // This function is kept for backward compatibility
    if (typeof edsaBookingSystem !== 'undefined' && edsaBookingSystem) {
        edsaBookingSystem.openModal();
    } else {
        // Fallback if booking system isn't loaded
        if (window.hmHerbsApp) {
            window.hmHerbsApp.showNotification('Loading booking system...', 'info');
        }
        // Try to initialize
        setTimeout(() => {
            if (typeof openEDSABooking === 'function') {
                openEDSABooking();
            }
        }, 100);
    }
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HMHerbsApp;
}

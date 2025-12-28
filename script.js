// H&M Herbs & Vitamins - Interactive JavaScript
// Modern, accessible, and feature-rich functionality

// Production-safe logging utility - completely silent
const Logger = {
    isDevelopment: false, // Disable all logging
    log: function (...args) {
        // Completely silent - no logging
    },
    error: function (...args) {
        // Completely silent - no logging
    },
    warn: function (...args) {
        // Completely silent - no logging
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

            // Cart loaded silently - no debug logging needed

            // Render initial content - wait for products to be loaded
            await this.renderSpotlightProducts();
            this.updateCartDisplay();

            // H&M Herbs app initialized successfully
        } catch (error) {
            Logger.error('Error initializing app:', error);
            this.showNotification('Unable to load the application. Please refresh the page or try again later.', 'error');
        }
    }

    ensureCartClosed() {
        this.closeCart();
    }

    toggleCart() {
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        const cartToggle = document.querySelector('.cart-toggle');

        if (cartSidebar && cartOverlay) {
            const isOpen = cartSidebar.classList.contains('open') || cartSidebar.classList.contains('show');

            if (isOpen) {
                this.closeCart();
            } else {
                // Set aria-hidden to false BEFORE showing and focusing
                cartSidebar.setAttribute('aria-hidden', 'false');
                cartSidebar.classList.add('show', 'open');
                cartOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
                if (cartToggle) {
                    cartToggle.setAttribute('aria-expanded', 'true');
                }
                // Update cart display when opening
                setTimeout(() => {
                    this.updateCartDisplay();
                }, 50);
            }
        }
    }

    closeCart() {
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        const cartToggle = document.querySelector('.cart-toggle');

        if (cartSidebar && cartOverlay) {
            // Accessibility: move focus out of the sidebar BEFORE hiding it
            // Use requestAnimationFrame to ensure focus is moved before aria-hidden is set
            const activeEl = document.activeElement;
            if (activeEl && cartSidebar.contains(activeEl)) {
                activeEl.blur();
                // Remove focus from any focused elements inside the cart
                const focusedElements = cartSidebar.querySelectorAll(':focus');
                focusedElements.forEach(el => el.blur());
            }

            // Move focus to cart toggle before hiding
            if (cartToggle) {
                cartToggle.focus();
                cartToggle.setAttribute('aria-expanded', 'false');
            }

            // Use requestAnimationFrame to ensure focus change completes before setting aria-hidden
            requestAnimationFrame(() => {
                // Set aria-hidden after focus has been moved
                cartSidebar.setAttribute('aria-hidden', 'true');
                cartSidebar.classList.remove('show', 'open');
                cartOverlay.classList.remove('active');
                document.body.style.overflow = '';
            });
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

            try {
                const nativeFetch = window.__nativeFetch || window.fetch;
                const apiUrl = `${apiBaseUrl}/api/products?limit=4&featured=true`;
                console.log(`🔍 Fetching featured products from: ${apiUrl}`);
                Logger.log(`🔍 Fetching featured products from: ${apiUrl}`);

                const response = await nativeFetch(apiUrl).catch((error) => {
                    console.error('❌ Fetch error:', error);
                    Logger.error('❌ Fetch error:', error);
                    return null;
                });

                if (response && response.ok) {
                    const data = await response.json();
                    console.log('📦 API Response:', data);
                    const productsFromApi = data.products || [];
                    console.log(`📦 Transforming ${productsFromApi.length} products from API format to expected format`);

                    // Transform API products to match the format expected by createProductCard
                    this.products = productsFromApi.map(product => {
                        // Handle image URL - if it's a relative path, make it absolute
                        let imageUrl = product.image_url || product.image || '';
                        if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('//')) {
                            // It's a relative path, prepend the API base URL
                            imageUrl = imageUrl.startsWith('/') ? `${apiBaseUrl}${imageUrl}` : `${apiBaseUrl}/${imageUrl}`;
                        }

                        return {
                            id: product.id,
                            name: product.name,
                            price: parseFloat(product.price) || 0,
                            image: imageUrl,
                            inventory: product.inventory_quantity || 0,
                            lowStockThreshold: 10, // Default threshold
                            description: product.short_description || product.long_description || '',
                            slug: product.slug || '',
                            featured: product.is_featured === true || product.is_featured === 1 || product.is_featured === '1',
                            inStock: (product.inventory_quantity || 0) > 0 || product.inventory_quantity === null,
                            // Add URL for product link if slug exists
                            url: product.slug ? `product.html?slug=${encodeURIComponent(product.slug)}` : null,
                            // Keep original fields for reference
                            _original: product
                        };
                    });

                    console.log(`✅ Transformed ${this.products.length} featured products:`, this.products.map(p => ({ id: p.id, name: p.name, image: p.image, price: p.price })));
                    Logger.log(`✅ Loaded ${this.products.length} featured products from API:`, this.products.map(p => ({ id: p.id, name: p.name, is_featured: p.featured })));

                    if (this.products.length === 0) {
                        console.warn('⚠️ API returned empty products array!', { data });
                        Logger.warn('⚠️ API returned empty products array!', { data });
                    }
                } else {
                    // Log the error for debugging
                    const errorText = response ? await response.text().catch(() => 'Unable to read response') : 'No response';
                    console.error(`❌ API call failed:`, {
                        status: response ? response.status : 'No response',
                        statusText: response ? response.statusText : 'No response',
                        error: errorText,
                        apiUrl: apiUrl
                    });
                    Logger.error(`❌ API call failed:`, {
                        status: response ? response.status : 'No response',
                        statusText: response ? response.statusText : 'No response',
                        error: errorText,
                        apiUrl: apiUrl
                    });
                    console.log('❌ Setting this.products to empty array due to API failure');
                    this.products = [];
                }
            } catch (error) {
                console.error('❌ Error loading featured products from API:', error);
                console.log('❌ Setting this.products to empty array due to error');
                Logger.error('❌ Error loading featured products from API:', error);
                this.products = [];
            }

            console.log(`✅ Total products loaded: ${this.products.length}, this.products:`, this.products);
            Logger.log(`✅ Total products loaded: ${this.products.length}`);

            // Update the UI after loading products
            // Note: Products are rendered via renderSpotlightProducts() which uses this.products
            // No separate renderProducts() method needed - spotlight products are the main display
            // updateProductCount() method doesn't exist, so we skip it
            // if (typeof this.updateProductCount === 'function') {
            //     this.updateProductCount();
            // }

        } catch (error) {
            // Silently handle all errors - database may not be configured
            // Don't show error notifications for expected failures
            console.error('❌ Outer catch in loadProducts() - this is resetting products!', error);
            console.error('❌ Error stack:', error.stack);
            console.log('❌ Setting this.products to empty array in outer catch');
            // DON'T reset products if we already have them loaded
            if (!this.products || this.products.length === 0) {
                this.products = [];
            } else {
                console.warn('⚠️ Not resetting products - we already have', this.products.length, 'products loaded');
            }
        }

        console.log(`🔚 loadProducts() finished. this.products.length: ${this.products ? this.products.length : 'undefined'}`);
    }

    setupEventListeners() {
        // Mobile menu toggle - Skip if already handled by inline script
        // The inline script in head handles this to ensure it works immediately
        if (!window.toggleMobileMenu) {
            // Mobile menu toggle (fallback) - only set up if not already handled
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
        this.setupCartEventListeners();

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

    setupCartEventListeners() {
        // Cart toggle
        const cartToggle = document.querySelector('.cart-toggle');
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        const cartClose = document.querySelector('.cart-close');

        // Ensure cart starts closed
        if (cartSidebar) {
            cartSidebar.classList.remove('show', 'open');
        }

        // Only attach if not already attached by fallback
        if (cartToggle && !cartToggle.hasAttribute('data-fallback-listener')) {
            cartToggle.addEventListener('click', () => {
                this.toggleCart();
            });
            cartToggle.setAttribute('data-main-listener', 'true');
        }

        if (cartClose && !cartClose.hasAttribute('data-listener-attached')) {
            cartClose.addEventListener('click', () => {
                this.closeCart();
            });
            cartClose.setAttribute('data-main-listener', 'true');
        }

        if (cartOverlay && !cartOverlay.hasAttribute('data-listener-attached')) {
            cartOverlay.addEventListener('click', () => {
                this.closeCart();
            });
            cartOverlay.setAttribute('data-main-listener', 'true');
        }

        // Use event delegation for checkout button (in case it's recreated)
        // Attach to document body to catch all clicks (only for index.html, not products.html)
        // Products page has its own handler
        if (!window.location.pathname.includes('products.html')) {
            document.body.addEventListener('click', (e) => {
                const checkoutBtn = e.target.closest('#checkout-btn, .checkout-btn');
                if (checkoutBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Checkout button clicked via delegation');
                    if (this && this.proceedToCheckout) {
                        this.proceedToCheckout();
                    } else if (window.hmHerbsApp && window.hmHerbsApp.proceedToCheckout) {
                        window.hmHerbsApp.proceedToCheckout();
                    } else if (window.productsPage && window.productsPage.proceedToCheckout) {
                        window.productsPage.proceedToCheckout();
                    } else {
                        console.error('proceedToCheckout method not found');
                    }
                }
            }, true); // Use capture phase to catch early
        }

        // Also attach directly to button if it exists
        this.attachCheckoutButtonListener();

        // Try again after a short delay in case button isn't ready yet
        setTimeout(() => {
            this.attachCheckoutButtonListener();
        }, 500);

        // Try again after cart updates
        setTimeout(() => {
            this.attachCheckoutButtonListener();
        }, 1000);
    }

    attachCheckoutButtonListener() {
        // Don't attach on products page - it has its own handler
        if (window.location.pathname.includes('products.html')) {
            return;
        }

        const checkoutBtn = document.getElementById('checkout-btn');
        if (checkoutBtn) {
            // Don't re-attach if already attached
            if (checkoutBtn.hasAttribute('data-listener-attached')) {
                return;
            }

            // Set button type
            checkoutBtn.setAttribute('type', 'button');

            // Add inline onclick as absolute fallback (check both apps)
            checkoutBtn.setAttribute('onclick', 'if(window.hmHerbsApp && window.hmHerbsApp.proceedToCheckout) { window.hmHerbsApp.proceedToCheckout(); return false; } else if(window.productsPage && window.productsPage.proceedToCheckout) { window.productsPage.proceedToCheckout(); return false; } else { console.error(\'Checkout handler not available\'); } return false;');

            // Attach event listener
            checkoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Checkout button clicked directly');
                if (this && this.proceedToCheckout) {
                    this.proceedToCheckout();
                } else if (window.hmHerbsApp && window.hmHerbsApp.proceedToCheckout) {
                    window.hmHerbsApp.proceedToCheckout();
                } else if (window.productsPage && window.productsPage.proceedToCheckout) {
                    window.productsPage.proceedToCheckout();
                } else {
                    console.error('proceedToCheckout method not found');
                }
                return false;
            }, { once: false, capture: false });

            checkoutBtn.setAttribute('data-listener-attached', 'true');
            console.log('Checkout button listener attached');
        } else {
            console.log('Checkout button not found, will retry');
        }
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

            // First, try to use products loaded from API (this.products)
            // These are already limited to 4 via the API call (limit=4&featured=true)
            console.log('🎨 renderSpotlightProducts - checking products:', {
                hasProducts: !!this.products,
                productsLength: this.products ? this.products.length : 'undefined',
                products: this.products
            });

            if (this.products && this.products.length > 0) {
                console.log(`✅ Rendering ${this.products.length} featured products from API:`, this.products.map(p => p.name));
                Logger.log(`✅ Rendering ${this.products.length} featured products from API:`, this.products.map(p => p.name));
                // Ensure maximum of 4 products
                const limitedProducts = this.products.slice(0, 4);
                this.renderSpotlightProductsFromData(limitedProducts);
                return;
            }

            // If products array is empty or undefined, try loading products now
            if (!this.products || this.products.length === 0) {
                console.warn('⚠️ Products not loaded yet, calling loadProducts()...');
                Logger.warn('⚠️ Products not loaded yet, calling loadProducts()...');
                await this.loadProducts();

                // Check again after loading
                console.log('🔄 After loadProducts(), checking this.products:', {
                    hasProducts: !!this.products,
                    productsLength: this.products ? this.products.length : 'undefined',
                    productsType: typeof this.products,
                    productsIsArray: Array.isArray(this.products),
                    productsValue: this.products,
                    thisContext: this
                });

                // Force check - maybe there's a timing issue
                await new Promise(resolve => setTimeout(resolve, 50));

                console.log('🔄 After 50ms delay, this.products:', {
                    hasProducts: !!this.products,
                    productsLength: this.products ? this.products.length : 'undefined',
                    products: this.products
                });

                if (this.products && this.products.length > 0) {
                    console.log(`✅ Found ${this.products.length} products after loadProducts():`, this.products.map(p => p.name));
                    Logger.log(`✅ Found ${this.products.length} products after loadProducts():`, this.products.map(p => p.name));
                    const limitedProducts = this.products.slice(0, 4);
                    this.renderSpotlightProductsFromData(limitedProducts);
                    return;
                } else {
                    console.error('❌ Still no products after loadProducts()!', {
                        productsLength: this.products ? this.products.length : 'undefined',
                        products: this.products,
                        productsType: typeof this.products,
                        thisContext: this
                    });
                    Logger.error('❌ Still no products after loadProducts()!', {
                        productsLength: this.products ? this.products.length : 'undefined',
                        products: this.products
                    });
                }
            }

            // If API products not available, DO NOT use fallback JSON
            // The fallback JSON has old/wrong products - better to show nothing than wrong products
            Logger.error('❌ No featured products available from API!', {
                productsArray: this.products,
                productsLength: this.products ? this.products.length : 'undefined'
            });

            // Show empty state or error message instead of wrong products
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                        <p>Featured products are currently unavailable. Please check back later.</p>
                        <p style="font-size: 0.875rem; margin-top: 0.5rem;">If this persists, please contact support.</p>
                    </div>
                `;
            }
        } catch (error) {
            // Log the error but DO NOT use fallback products (they're wrong!)
            console.error('❌ Error in renderSpotlightProducts():', error);
            Logger.error('❌ Error in renderSpotlightProducts():', error);

            // Show error message instead of wrong products
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                        <p>Error loading featured products. Please refresh the page.</p>
                        <p style="font-size: 0.875rem; margin-top: 0.5rem;">Error: ${error.message}</p>
                    </div>
                `;
            }
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

        // Limit to exactly 4 products maximum
        const limitedProducts = spotlightProducts.slice(0, 4);

        // Remove existing event listeners by cloning the container
        const newContainer = container.cloneNode(false);
        newContainer.id = container.id;
        newContainer.className = container.className;
        container.parentNode.replaceChild(newContainer, container);

        // Clear existing content
        newContainer.innerHTML = '';

        // Create product cards safely using DOM methods to prevent XSS
        limitedProducts.forEach(product => {
            const productCard = this.createProductCard(product);
            newContainer.appendChild(productCard);
        });

        // Use event delegation to prevent memory leaks
        this.addEventListenerWithCleanup(newContainer, 'click', (e) => {
            // Find the add-to-cart button (could be clicked directly or via icon/text inside)
            const addToCartBtn = e.target.closest('.add-to-cart-btn');
            if (addToCartBtn) {
                // Prevent default button behavior
                e.preventDefault();
                e.stopPropagation();
                
                // Get product ID from the button's data attribute (most reliable)
                let productIdStr = addToCartBtn.dataset.productId || addToCartBtn.getAttribute('data-product-id');
                
                // Fallback: try to find product card if button doesn't have the attribute
                if (!productIdStr) {
                    const productCard = addToCartBtn.closest('[data-product-id]');
                    if (productCard) {
                        productIdStr = productCard.dataset.productId || productCard.getAttribute('data-product-id');
                    }
                }
                
                if (!productIdStr) {
                    console.error('❌ Invalid product ID - button:', addToCartBtn, 'dataset:', addToCartBtn.dataset);
                    this.showNotification('Unable to add product to cart. Please try again.', 'error');
                    return;
                }
                
                // Check if button is disabled (out of stock)
                if (addToCartBtn.disabled) {
                    this.showNotification('This product is out of stock', 'error');
                    return;
                }
                
                console.log('🛒 Adding spotlight product to cart:', { productId: productIdStr, limitedProducts: limitedProducts.length });
                
                // Use the limited products from closure for cart operations
                this.addToCartSpotlight(productIdStr, limitedProducts);
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
                const productId = productElement.dataset.productId || productElement.getAttribute('data-product-id');
                if (!productId) {
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
        const product = this.products.find(p => String(p.id) === String(productId));
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
        const existingItem = this.cart.find(item => String(item.id) === String(productId));
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

    addProductToCart(productData, quantity = 1) {
        // Add a product directly to cart using product data object
        // This is useful for product detail pages where the product isn't in this.products array
        if (!productData || !productData.product_id && !productData.id) {
            this.showNotification('Invalid product data', 'error');
            return;
        }

        const productId = productData.product_id || productData.id;
        const productName = productData.name || 'Product';
        const productPrice = productData.price || 0;
        const productImage = productData.image || '';
        const productQuantity = quantity || productData.quantity || 1;

        // Check inventory if available
        const inventory = productData.inventory_quantity !== undefined
            ? productData.inventory_quantity
            : (productData.inventory !== undefined ? productData.inventory : undefined);

        const isOutOfStock = inventory !== undefined
            ? inventory === 0
            : (productData.inStock === false);

        if (isOutOfStock) {
            this.showNotification('Product is out of stock', 'error');
            return;
        }

        // Check if adding this quantity would exceed available inventory
        const existingItem = this.cart.find(item => {
            return String(item.id) === String(productId);
        });
        const currentCartQuantity = existingItem ? existingItem.quantity : 0;
        const totalRequestedQuantity = currentCartQuantity + productQuantity;

        if (inventory !== undefined && totalRequestedQuantity > inventory) {
            const availableQuantity = inventory - currentCartQuantity;
            if (availableQuantity <= 0) {
                this.showNotification('No more items available', 'error');
                return;
            } else {
                this.showNotification(`Only ${availableQuantity} more available. Added ${availableQuantity} to cart.`, 'warning');
                // Add the available quantity
                if (existingItem) {
                    existingItem.quantity += availableQuantity;
                } else {
                    this.cart.push({
                        id: productId,
                        name: productName,
                        price: productPrice,
                        image: productImage,
                        quantity: availableQuantity
                    });
                }
                this.updateCartDisplay();
                this.saveCartToStorage();
                this.showNotification(`${productName} added to cart`, 'success');
                this.announceToScreenReader(`${productName} added to cart`);
                return;
            }
        }

        // Add or update cart item
        if (existingItem) {
            existingItem.quantity += productQuantity;
        } else {
            this.cart.push({
                id: productId,
                name: productName,
                price: productPrice,
                image: productImage,
                quantity: productQuantity
            });
        }

        this.updateCartDisplay();
        this.saveCartToStorage();
        this.showNotification(`${productName} added to cart`, 'success');
        this.announceToScreenReader(`${productName} added to cart`);
    }

    addToCartSpotlight(productId, spotlightProducts) {
        if (!productId) {
            console.error('❌ addToCartSpotlight: Invalid product ID', productId);
            this.showNotification('Invalid product ID', 'error');
            return;
        }

        // Convert productId to string for consistent comparison
        const productIdStr = String(productId);
        console.log('🛒 addToCartSpotlight called:', { productId: productIdStr, spotlightProductsCount: spotlightProducts.length });

        const product = spotlightProducts.find(p => {
            // Handle both string and number IDs by converting both to strings for comparison
            const pIdStr = String(p.id);
            const matches = pIdStr === productIdStr;
            if (matches) {
                console.log('✅ Found product:', { id: p.id, name: p.name, price: p.price, inventory: p.inventory });
            }
            return matches;
        });

        if (!product) {
            console.error('❌ Product not found in spotlightProducts:', {
                productId: productIdStr,
                availableIds: spotlightProducts.map(p => ({ id: p.id, idType: typeof p.id, name: p.name }))
            });
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
        const existingItem = this.cart.find(item => {
            return String(item.id) === String(productId);
        });
        const currentCartQuantity = existingItem ? existingItem.quantity : 0;
        const totalRequestedQuantity = currentCartQuantity + 1;

        if (typeof product.inventory !== 'undefined' && totalRequestedQuantity > product.inventory) {
            const availableQuantity = product.inventory - currentCartQuantity;
            if (availableQuantity <= 0) {
                this.showNotification('No more items available', 'error');
                return;
            } else {
                this.showNotification(`Only ${availableQuantity} more available. Added ${availableQuantity} to cart.`, 'warning');
                // Add the available quantity instead of 1
                if (existingItem) {
                    existingItem.quantity += availableQuantity;
                } else {
                    this.cart.push({
                        id: productId,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        quantity: availableQuantity
                    });
                }
                this.updateCartDisplay();
                this.saveCartToStorage();
                this.showNotification(`${product.name} added to cart`, 'success');
                this.announceToScreenReader(`${product.name} added to cart`);
                return;
            }
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
        this.cart = this.cart.filter(item => String(item.id) !== String(productId));
        this.updateCartDisplay();
        this.saveCartToStorage();
        this.showNotification('Item removed from cart', 'success');
    }

    proceedToCheckout() {
        console.log('proceedToCheckout called', { cartLength: this.cart?.length, cart: this.cart });

        // Check if cart is empty
        if (!this.cart || this.cart.length === 0) {
            console.log('Cart is empty, showing error');
            this.showNotification('Your cart is empty', 'error');
            return false;
        }

        // Save cart to sessionStorage for checkout page
        try {
            const cartData = JSON.stringify(this.cart);
            sessionStorage.setItem('checkout_cart', cartData);
            console.log('Cart saved to sessionStorage:', cartData);
        } catch (error) {
            console.error('Error saving cart to sessionStorage:', error);
            Logger.error('Error saving cart to sessionStorage:', error);
            this.showNotification('Error saving cart. Please try again.', 'error');
            return false;
        }

        // Navigate to checkout page
        const checkoutUrl = 'checkout.html';
        console.log('Navigating to:', checkoutUrl);

        try {
            // Force navigation
            if (window.location && window.location.href) {
                window.location.href = checkoutUrl;
                console.log('Navigation initiated via window.location.href');
                // Also try assign as backup
                setTimeout(() => {
                    if (window.location.href.indexOf('checkout.html') === -1) {
                        window.location.assign(checkoutUrl);
                    }
                }, 100);
            } else {
                console.error('window.location not available');
                this.showNotification('Navigation error. Please try again.', 'error');
                return false;
            }
        } catch (error) {
            console.error('Navigation error:', error);
            this.showNotification('Navigation error. Please try again.', 'error');
            return false;
        }

        return true;
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
        const item = this.cart.find(item => String(item.id) === String(productId));

        if (item) {
            if (newQuantity <= 0) {
                this.removeFromCart(productId);
            } else {
                // Find the product to check inventory limits
                const product = this.products.find(p => String(p.id) === String(productId));

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
        const cartItems = document.getElementById('cart-items');
        const cartEmpty = document.getElementById('cart-empty');
        const cartTotal = document.getElementById('cart-total');

        // Update cart count
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        if (cartCount) {
            cartCount.textContent = totalItems;
            cartCount.style.display = totalItems > 0 ? 'block' : 'none';
        }

        // Update cart items
        if (cartItems && cartEmpty) {
            if (this.cart.length === 0) {
                cartItems.style.display = 'none';
                cartEmpty.style.display = 'block';
            } else {
                cartItems.style.display = 'block';
                cartEmpty.style.display = 'none';

                cartItems.innerHTML = '';
                this.cart.forEach(item => {
                    const cartItem = this.createCartItem(item);
                    cartItems.appendChild(cartItem);
                });
            }
        }

        // Update cart total
        const total = this.cart.reduce((sum, item) => {
            let priceValue = typeof item.price === 'string' ? parseFloat(item.price) : (item.price || 0);
            // Ensure priceValue is a valid number
            if (isNaN(priceValue) || priceValue === null || priceValue === undefined) {
                priceValue = 0;
            }
            const quantity = item.quantity || 0;
            return sum + (priceValue * quantity);
        }, 0);
        if (cartTotal) {
            cartTotal.textContent = `$${total.toFixed(2)}`;
        }

        // Ensure checkout button listener is attached
        this.attachCheckoutButtonListener();
    }

    createCartItem(item) {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.setAttribute('data-product-id', item.id);

        // Create elements safely to prevent XSS
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;
        img.className = 'cart-item-image';

        const details = document.createElement('div');
        details.className = 'cart-item-details';

        const name = document.createElement('div');
        name.className = 'cart-item-name';
        name.textContent = item.name;

        const price = document.createElement('div');
        price.className = 'cart-item-price';
        let priceValue = typeof item.price === 'string' ? parseFloat(item.price) : (item.price || 0);
        // Ensure priceValue is a valid number
        if (isNaN(priceValue) || priceValue === null || priceValue === undefined) {
            priceValue = 0;
        }
        price.textContent = `$${priceValue.toFixed(2)}`;

        const controls = document.createElement('div');
        controls.className = 'cart-item-controls';

        const decreaseBtn = document.createElement('button');
        decreaseBtn.className = 'quantity-btn decrease-qty';
        decreaseBtn.setAttribute('data-product-id', item.id);
        decreaseBtn.textContent = '-';

        const quantitySpan = document.createElement('span');
        quantitySpan.className = 'quantity-display';
        quantitySpan.textContent = item.quantity;

        const increaseBtn = document.createElement('button');
        increaseBtn.className = 'quantity-btn increase-qty';
        increaseBtn.setAttribute('data-product-id', item.id);
        increaseBtn.textContent = '+';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-item';
        removeBtn.setAttribute('data-product-id', item.id);
        const trashIcon = document.createElement('i');
        trashIcon.className = 'fas fa-trash';
        trashIcon.setAttribute('aria-hidden', 'true');
        removeBtn.appendChild(trashIcon);

        controls.appendChild(decreaseBtn);
        controls.appendChild(quantitySpan);
        controls.appendChild(increaseBtn);

        details.appendChild(name);
        details.appendChild(price);
        details.appendChild(controls);

        cartItem.appendChild(img);
        cartItem.appendChild(details);
        cartItem.appendChild(removeBtn);

        // Add event listeners (using the elements we created above)
        decreaseBtn.addEventListener('click', () => {
            this.updateCartQuantity(item.id, item.quantity - 1);
        });

        increaseBtn.addEventListener('click', () => {
            // Check inventory before increasing
            const product = this.products.find(p => String(p.id) === String(item.id));
            if (product && typeof product.inventory !== 'undefined') {
                if (item.quantity >= product.inventory) {
                    this.showNotification(`Only ${product.inventory} items available in stock`, 'error');
                    return;
                }
            }
            this.updateCartQuantity(item.id, item.quantity + 1);
        });

        removeBtn.addEventListener('click', () => {
            this.removeFromCart(item.id);
        });

        return cartItem;
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
                    // Service Worker registered successfully

                    // Check if service worker is actually controlling the page
                    // Service worker registered - no logging needed
                    if (!navigator.serviceWorker.controller) {
                        // Service worker registered but not yet controlling the page
                    }

                    // Listen for updates
                    registration.addEventListener('updatefound', () => {
                        // Service worker update found
                    });
                })
                .catch(registrationError => {
                    // Only log error if not a protocol issue
                    if (!registrationError.message.includes('URL protocol') &&
                        !registrationError.message.includes('not supported') &&
                        !registrationError.message.includes('null')) {
                        // Service Worker registration failed

                        // Provide more detailed error information
                        if (registrationError.name === 'SecurityError') {
                            // Service Worker registration failed due to security restrictions
                        } else if (registrationError.name === 'NetworkError') {
                            // Service Worker registration failed due to network issues - retrying
                            // Retry after network issues
                            setTimeout(() => {
                                registerServiceWorker();
                            }, 30000);
                        }
                    }

                    // Graceful degradation - app continues to work without SW
                    // App will continue to work without offline capabilities
                });
        });
    } else {
        // Service Workers not supported in this browser
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

        // Fallback: Ensure cart toggle works even if class-based setup fails
        // Only run if main listeners weren't attached
        setTimeout(() => {
            const fallbackCartToggle = document.querySelector('.cart-toggle');
            const fallbackCartSidebar = document.getElementById('cart-sidebar');
            const fallbackCartOverlay = document.getElementById('cart-overlay');
            const fallbackCartClose = document.querySelector('.cart-close');

            // Only use fallback if main listeners weren't attached
            if (fallbackCartToggle && !fallbackCartToggle.hasAttribute('data-main-listener')) {
                const handleCartToggle = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isOpen = fallbackCartSidebar.classList.contains('show') || fallbackCartSidebar.classList.contains('open');
                    if (isOpen) {
                        // Accessibility: move focus out before hiding
                        const activeEl = document.activeElement;
                        if (activeEl && fallbackCartSidebar.contains(activeEl)) {
                            activeEl.blur();
                        }
                        fallbackCartToggle.focus();
                        fallbackCartToggle.setAttribute('aria-expanded', 'false');

                        fallbackCartSidebar.classList.remove('show', 'open');
                        fallbackCartSidebar.setAttribute('aria-hidden', 'true');
                        if (fallbackCartOverlay) fallbackCartOverlay.classList.remove('active');
                        document.body.style.overflow = '';
                        document.documentElement.style.overflow = '';
                    } else {
                        fallbackCartSidebar.classList.add('show', 'open');
                        fallbackCartSidebar.setAttribute('aria-hidden', 'false');
                        fallbackCartToggle.setAttribute('aria-expanded', 'true');
                        if (fallbackCartOverlay) fallbackCartOverlay.classList.add('active');
                        document.body.style.overflow = 'hidden';
                        document.documentElement.style.overflow = 'hidden';
                        if (window.hmHerbsApp) {
                            setTimeout(() => window.hmHerbsApp.updateCartDisplay(), 50);
                        }
                    }
                };

                fallbackCartToggle.setAttribute('data-fallback-listener', 'true');
                fallbackCartToggle.addEventListener('click', handleCartToggle);
            }

            // Fallback: Ensure cart close button works
            if (fallbackCartClose && fallbackCartSidebar && !fallbackCartClose.hasAttribute('data-main-listener')) {
                fallbackCartClose.setAttribute('data-listener-attached', 'true');
                fallbackCartClose.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Accessibility: move focus out before hiding
                    const activeEl = document.activeElement;
                    if (activeEl && fallbackCartSidebar.contains(activeEl)) {
                        activeEl.blur();
                        // Remove focus from any focused elements inside the cart
                        const focusedElements = fallbackCartSidebar.querySelectorAll(':focus');
                        focusedElements.forEach(el => el.blur());
                    }
                    if (fallbackCartToggle) {
                        fallbackCartToggle.focus();
                        fallbackCartToggle.setAttribute('aria-expanded', 'false');
                    }

                    // Use requestAnimationFrame to ensure focus change completes before setting aria-hidden
                    requestAnimationFrame(() => {
                        fallbackCartSidebar.classList.remove('show', 'open');
                        fallbackCartSidebar.setAttribute('aria-hidden', 'true');
                        if (fallbackCartOverlay) {
                            fallbackCartOverlay.classList.remove('active');
                        }
                        document.body.style.overflow = '';
                        document.documentElement.style.overflow = '';
                    });
                });
            }

            // Fallback: Ensure overlay click closes cart
            if (fallbackCartOverlay && fallbackCartSidebar && !fallbackCartOverlay.hasAttribute('data-main-listener')) {
                fallbackCartOverlay.setAttribute('data-listener-attached', 'true');
                fallbackCartOverlay.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Accessibility: move focus out before hiding
                    const activeEl = document.activeElement;
                    if (activeEl && fallbackCartSidebar.contains(activeEl)) {
                        activeEl.blur();
                    }
                    if (fallbackCartToggle) {
                        fallbackCartToggle.focus();
                        fallbackCartToggle.setAttribute('aria-expanded', 'false');
                    }

                    fallbackCartSidebar.classList.remove('show', 'open');
                    fallbackCartSidebar.setAttribute('aria-hidden', 'true');
                    fallbackCartOverlay.classList.remove('active');
                    document.body.style.overflow = '';
                    document.documentElement.style.overflow = '';
                });
            }
        }, 100);
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

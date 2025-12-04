// H&M Herbs & Vitamins - Interactive JavaScript
// Modern, accessible, and feature-rich functionality

class HMHerbsApp {
    constructor() {
        this.cart = [];
        this.products = [];
        this.isLoading = false;
        
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
            this.renderFeaturedProducts();
            this.renderBestsellers();
            this.updateCartDisplay();
            
            console.log('H&M Herbs app initialized successfully');
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showNotification('Error loading application', 'error');
        }
    }
    
    async loadProducts() {
        // Sample product data based on the original HM Herbs website
        this.products = [
            {
                id: 1,
                name: "Terry Naturally Cura Med 375mg 120SG",
                price: 69.95,
                category: "supplements",
                image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                description: "Premium curcumin supplement for joint health and inflammation support",
                featured: true,
                bestseller: false,
                inStock: true,
                inventory: 25,
                lowStockThreshold: 10
            },
            {
                id: 2,
                name: "Unicity Aloe Vera 50 Capsules",
                price: 34.95,
                category: "herbs",
                image: "https://images.unsplash.com/photo-1609840114035-3c981b782dfe?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                description: "Pure aloe vera capsules for digestive health and wellness",
                featured: true,
                bestseller: false,
                inStock: true,
                inventory: 8,
                lowStockThreshold: 10
            },
            {
                id: 3,
                name: "Newton Labs Allergies",
                price: 17.95,
                category: "homeopathic",
                image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                description: "Natural homeopathic remedy for seasonal allergies",
                featured: true,
                bestseller: false,
                inStock: true,
                inventory: 15,
                lowStockThreshold: 10
            },
            {
                id: 4,
                name: "REGALABS CANNABIS OIL FOR PETS",
                price: 29.99,
                category: "pet-health",
                image: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                description: "Organic cannabis oil with CBD for cats and dogs",
                featured: true,
                bestseller: false,
                inStock: true,
                inventory: 12,
                lowStockThreshold: 10
            },
            {
                id: 5,
                name: "ADVANCED BLOOD PRESSURE CHERRY",
                price: 32.95,
                category: "cardiovascular",
                image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                description: "Natural cherry-flavored blood pressure support supplement",
                featured: true,
                bestseller: false,
                inStock: true,
                inventory: 30,
                lowStockThreshold: 10
            },
            {
                id: 6,
                name: "REGAL LABS CANNABIS CARE TUBES Or JARS",
                price: 25.49,
                category: "topical",
                image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                description: "Cannabis care cream for topical relief",
                featured: true,
                bestseller: false,
                inStock: true,
                inventory: 18,
                lowStockThreshold: 10
            },
            {
                id: 7,
                name: "EVE'S GENERATIONAL FORMULA",
                price: 19.99,
                category: "womens-health",
                image: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                description: "Specialized women's health formula, 2 oz pump",
                featured: false,
                bestseller: true,
                inStock: true,
                inventory: 22,
                lowStockThreshold: 10
            },
            {
                id: 8,
                name: "HAPPY PMS CREAM JAR",
                price: 19.99,
                category: "womens-health",
                image: "https://images.unsplash.com/photo-1576086213369-97a306d36557?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                description: "Happy PMS progesterone body cream, 2oz jar",
                featured: false,
                bestseller: true,
                inStock: true,
                inventory: 5,
                lowStockThreshold: 10
            }
        ];
    }
    
    setupEventListeners() {
        // Mobile menu toggle
        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        
        if (mobileMenuToggle && navMenu) {
            mobileMenuToggle.addEventListener('click', () => {
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
            searchToggle.addEventListener('click', () => {
                const isExpanded = searchToggle.getAttribute('aria-expanded') === 'true';
                searchToggle.setAttribute('aria-expanded', !isExpanded);
                searchDropdown.classList.toggle('show');
                
                if (searchDropdown.classList.contains('show') && searchInput) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            });
        }
        
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
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
            cartToggle.addEventListener('click', () => {
                const isExpanded = cartToggle.getAttribute('aria-expanded') === 'true';
                cartToggle.setAttribute('aria-expanded', !isExpanded);
                cartSidebar.classList.toggle('show');
                cartSidebar.setAttribute('aria-hidden', !cartSidebar.classList.contains('show'));
            });
        }
        
        if (cartClose) {
            cartClose.addEventListener('click', () => {
                cartSidebar.classList.remove('show');
                cartSidebar.setAttribute('aria-hidden', 'true');
                cartToggle.setAttribute('aria-expanded', 'false');
            });
        }
        
        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
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
    
    renderInventoryStatus(product) {
        // Defensive programming: handle missing inventory data
        if (typeof product.inventory === 'undefined' || product.inventory === null) {
            // Fallback to inStock boolean if inventory data is missing
            if (product.inStock === false) {
                return '<div class="inventory-status out-of-stock"><i class="fas fa-times-circle"></i> Out of Stock</div>';
            }
            return '<div class="inventory-status in-stock"><i class="fas fa-check-circle"></i> In Stock</div>';
        }
        
        // Normal inventory-based logic - escape inventory values to prevent XSS
        const inventoryCount = this.escapeHtml(String(product.inventory));
        if (product.inventory === 0) {
            return '<div class="inventory-status out-of-stock"><i class="fas fa-times-circle"></i> Out of Stock</div>';
        } else if (product.lowStockThreshold && product.inventory <= product.lowStockThreshold) {
            return `<div class="inventory-status low-stock"><i class="fas fa-exclamation-triangle"></i> Only ${inventoryCount} left!</div>`;
        } else if (product.inventory <= 20) {
            return `<div class="inventory-status in-stock"><i class="fas fa-check-circle"></i> ${inventoryCount} in stock</div>`;
        }
        return '<div class="inventory-status in-stock"><i class="fas fa-check-circle"></i> In Stock</div>';
    }
    
    renderFeaturedProducts() {
        const container = document.getElementById('featured-products-grid');
        if (!container) return;
        
        const featuredProducts = this.products.filter(product => product.featured);
        
        // Remove existing event listeners by cloning the container
        const newContainer = container.cloneNode(false);
        newContainer.id = container.id;
        newContainer.className = container.className;
        container.parentNode.replaceChild(newContainer, container);
        
        // Clear existing content
        newContainer.innerHTML = '';
        
        // Create product cards safely using DOM methods to prevent XSS
        featuredProducts.forEach(product => {
            const productCard = this.createProductCard(product);
            newContainer.appendChild(productCard);
        });
        
        // Use event delegation to prevent memory leaks
        newContainer.addEventListener('click', (e) => {
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
        newContainer.addEventListener('click', (e) => {
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
    
    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.id !== productId);
        this.updateCartDisplay();
        this.saveCartToStorage();
        this.showNotification('Item removed from cart', 'success');
    }
    
    updateCartQuantity(productId, newQuantity) {
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
                cartContent.innerHTML = `
                    <div class="empty-cart">
                        <i class="fas fa-shopping-cart" aria-hidden="true"></i>
                        <p>Your cart is empty</p>
                        <a href="#products" class="btn btn-primary">Start Shopping</a>
                    </div>
                `;
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
            
            // Add the event listener
            cartContent.addEventListener('click', cartContent.cartEventListener);
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
        closeBtn.addEventListener('click', () => {
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
        
        // Create title element
        const title = document.createElement('h3');
        title.className = 'product-title';
        title.textContent = product.name || '';
        
        // Create price element
        const price = document.createElement('p');
        price.className = 'product-price';
        price.textContent = `$${(product.price || 0).toFixed(2)}`;
        
        // Create inventory status (using existing renderInventoryStatus method)
        const inventoryStatus = document.createElement('div');
        inventoryStatus.innerHTML = this.renderInventoryStatus(product);
        
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
                    img.addEventListener('load', () => {
                        img.classList.remove('lazy');
                        img.classList.add('loaded');
                    }, { once: true });
                    
                    img.addEventListener('error', () => {
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
            img.addEventListener('load', () => {
                img.classList.remove('lazy');
                img.classList.add('loaded');
            }, { once: true });
            
            img.addEventListener('error', () => {
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
    
    // Initialize main application
    window.hmHerbsApp = new HMHerbsApp();
    
    // Register service worker for PWA features
    registerServiceWorker();
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HMHerbsApp;
}

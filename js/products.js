/**
 * Products Page JavaScript
 * Handles product catalog display, filtering, pagination, and cart functionality
 */

class ProductsPage {
    constructor() {
        this.products = [];
        this.filteredProducts = [];
        this.currentPage = 1;
        this.productsPerPage = 20;
        this.totalPages = 0;
        this.currentFilters = {
            search: '',
            category: '',
            sort: 'name'
        };
        
        // Cart functionality (shared with main app)
        this.cart = [];
        
        this.init();
    }
    
    async init() {
        try {
            console.log('Initializing Products Page...');
            
            // Load cart from storage
            this.loadCartFromStorage();
            
            // Load products
            await this.loadProducts();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Apply URL parameters
            this.applyUrlParameters();
            
            // Initial render
            this.applyFilters();
            this.updateCartDisplay();
            
            console.log('Products Page initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Products Page:', error);
            this.showError('Failed to load products. Please refresh the page.');
        }
    }
    
    async loadProducts() {
        const loadingState = document.getElementById('loading-state');
        const productsGrid = document.getElementById('products-grid');
        
        try {
            loadingState.style.display = 'block';
            productsGrid.style.display = 'none';
            
            // Determine API base URL
            const apiBaseUrl = window.location.hostname === 'localhost' 
                ? 'http://localhost:3001' 
                : window.location.origin;
            
            const response = await fetch(`${apiBaseUrl}/api/products?limit=100`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.products = Array.isArray(data) ? data : data.products || [];
            
            // Transform API data to match frontend format
            this.products = this.products.map(product => ({
                id: product.id,
                name: product.name,
                price: parseFloat(product.price),
                image: product.image_url || this.createProductPlaceholder(product.name),
                category: product.category_slug || 'general',
                description: product.short_description || '',
                inventory: product.inventory_quantity || 0,
                featured: product.is_featured === 1,
                inStock: product.inventory_quantity > 0,
                lowStockThreshold: 5
            }));
            
            console.log(`Loaded ${this.products.length} products`);
            
        } catch (error) {
            console.error('Error loading products:', error);
            // Fallback to demo products if API fails
            this.products = this.getDemoProducts();
            console.log('Using demo products as fallback');
        } finally {
            loadingState.style.display = 'none';
            productsGrid.style.display = 'grid';
        }
    }
    
    getDemoProducts() {
        // Generate demo products for testing
        const categories = ['herbs', 'vitamins', 'supplements', 'wellness'];
        const products = [];
        
        for (let i = 1; i <= 50; i++) {
            const productName = `Natural Product ${i}`;
            products.push({
                id: i,
                name: productName,
                price: Math.floor(Math.random() * 50) + 15,
                image: this.createProductPlaceholder(productName),
                category: categories[Math.floor(Math.random() * categories.length)],
                description: `High-quality natural health product ${i} for optimal wellness.`,
                inventory: Math.floor(Math.random() * 50) + 5,
                featured: Math.random() > 0.7,
                inStock: true
            });
        }
        
        return products;
    }
    
    createProductPlaceholder(productName) {
        // Create a professional SVG placeholder that matches the site design
        const encodedName = encodeURIComponent(productName.substring(0, 20));
        const svgPlaceholder = `data:image/svg+xml;base64,${btoa(`
            <svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#4a7c59;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#5a8c69;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#grad)"/>
                <rect x="50" y="80" width="200" height="140" fill="#ffffff" fill-opacity="0.1" rx="12"/>
                <circle cx="100" cy="120" r="20" fill="#ffffff" fill-opacity="0.3"/>
                <rect x="140" y="110" width="80" height="8" fill="#ffffff" fill-opacity="0.4" rx="4"/>
                <rect x="140" y="125" width="60" height="6" fill="#ffffff" fill-opacity="0.3" rx="3"/>
                <text x="150" y="180" font-family="Arial, sans-serif" font-size="12" fill="#ffffff" text-anchor="middle" font-weight="500">Natural Health</text>
                <text x="150" y="200" font-family="Arial, sans-serif" font-size="10" fill="#ffffff" fill-opacity="0.8" text-anchor="middle">Product</text>
            </svg>
        `)}`;
        
        return svgPlaceholder;
    }
    
    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('product-search');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce((e) => {
                this.currentFilters.search = e.target.value.toLowerCase();
                this.currentPage = 1;
                this.applyFilters();
            }, 300));
        }
        
        // Category filter
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.currentFilters.category = e.target.value;
                this.currentPage = 1;
                this.applyFilters();
            });
        }
        
        // Sort filter
        const sortFilter = document.getElementById('sort-filter');
        if (sortFilter) {
            sortFilter.addEventListener('change', (e) => {
                this.currentFilters.sort = e.target.value;
                this.currentPage = 1;
                this.applyFilters();
            });
        }
        
        // Reset filters
        const resetButton = document.getElementById('reset-filters');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.resetFilters();
            });
        }
        
        // Cart functionality
        this.setupCartEventListeners();
        
        // Pagination (will be set up dynamically)
        this.setupPaginationEventListeners();
    }
    
    setupCartEventListeners() {
        // Cart toggle
        const cartToggle = document.querySelector('.cart-toggle');
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        const cartClose = document.querySelector('.cart-close');
        
        if (cartToggle) {
            cartToggle.addEventListener('click', () => {
                this.toggleCart();
            });
        }
        
        if (cartClose) {
            cartClose.addEventListener('click', () => {
                this.closeCart();
            });
        }
        
        if (cartOverlay) {
            cartOverlay.addEventListener('click', () => {
                this.closeCart();
            });
        }
        
        // Products grid event delegation for add to cart
        const productsGrid = document.getElementById('products-grid');
        if (productsGrid) {
            productsGrid.addEventListener('click', (e) => {
                if (e.target.closest('.add-to-cart-btn')) {
                    const productElement = e.target.closest('[data-product-id]');
                    if (productElement) {
                        const productId = parseInt(productElement.dataset.productId);
                        this.addToCart(productId);
                    }
                }
            });
        }
    }
    
    setupPaginationEventListeners() {
        const pagination = document.getElementById('pagination');
        if (pagination) {
            pagination.addEventListener('click', (e) => {
                e.preventDefault();
                const link = e.target.closest('a[data-page]');
                if (link) {
                    const page = parseInt(link.dataset.page);
                    if (page !== this.currentPage) {
                        this.currentPage = page;
                        this.applyFilters();
                        this.scrollToTop();
                    }
                }
            });
        }
    }
    
    applyUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Apply category from URL
        const category = urlParams.get('category');
        if (category) {
            this.currentFilters.category = category;
            const categoryFilter = document.getElementById('category-filter');
            if (categoryFilter) {
                categoryFilter.value = category;
            }
        }
        
        // Apply search from URL
        const search = urlParams.get('search');
        if (search) {
            this.currentFilters.search = search.toLowerCase();
            const searchInput = document.getElementById('product-search');
            if (searchInput) {
                searchInput.value = search;
            }
        }
        
        // Apply page from URL
        const page = urlParams.get('page');
        if (page) {
            this.currentPage = parseInt(page) || 1;
        }
    }
    
    applyFilters() {
        // Start with all products
        this.filteredProducts = [...this.products];
        
        // Apply search filter
        if (this.currentFilters.search) {
            this.filteredProducts = this.filteredProducts.filter(product =>
                product.name.toLowerCase().includes(this.currentFilters.search) ||
                (product.description && product.description.toLowerCase().includes(this.currentFilters.search))
            );
        }
        
        // Apply category filter
        if (this.currentFilters.category) {
            this.filteredProducts = this.filteredProducts.filter(product =>
                product.category === this.currentFilters.category
            );
        }
        
        // Apply sorting
        this.sortProducts();
        
        // Calculate pagination
        this.totalPages = Math.ceil(this.filteredProducts.length / this.productsPerPage);
        
        // Ensure current page is valid
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }
        
        // Render results
        this.renderProducts();
        this.renderPagination();
        this.updateUrl();
    }
    
    sortProducts() {
        switch (this.currentFilters.sort) {
            case 'name':
                this.filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'name-desc':
                this.filteredProducts.sort((a, b) => b.name.localeCompare(a.name));
                break;
            case 'price':
                this.filteredProducts.sort((a, b) => a.price - b.price);
                break;
            case 'price-desc':
                this.filteredProducts.sort((a, b) => b.price - a.price);
                break;
            case 'featured':
                this.filteredProducts.sort((a, b) => {
                    if (a.featured && !b.featured) return -1;
                    if (!a.featured && b.featured) return 1;
                    return a.name.localeCompare(b.name);
                });
                break;
        }
    }
    
    renderProducts() {
        const productsGrid = document.getElementById('products-grid');
        const noResults = document.getElementById('no-results');
        
        if (!productsGrid) return;
        
        // Calculate products for current page
        const startIndex = (this.currentPage - 1) * this.productsPerPage;
        const endIndex = startIndex + this.productsPerPage;
        const pageProducts = this.filteredProducts.slice(startIndex, endIndex);
        
        // Clear existing content
        productsGrid.innerHTML = '';
        
        if (pageProducts.length === 0) {
            productsGrid.style.display = 'none';
            if (noResults) noResults.style.display = 'block';
            return;
        }
        
        productsGrid.style.display = 'grid';
        if (noResults) noResults.style.display = 'none';
        
        // Create product cards
        pageProducts.forEach(product => {
            const productCard = this.createProductCard(product);
            productsGrid.appendChild(productCard);
        });
    }
    
    createProductCard(product) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-product-id', product.id);
        
        // Product image
        const image = document.createElement('img');
        image.className = 'product-image';
        image.src = product.image || 'https://via.placeholder.com/300x300/4a7c59/ffffff?text=Product';
        image.alt = product.name;
        image.loading = 'lazy';
        
        // Product title
        const title = document.createElement('h3');
        title.className = 'product-title';
        title.textContent = product.name;
        
        // Product price
        const price = document.createElement('div');
        price.className = 'product-price';
        price.textContent = `$${product.price.toFixed(2)}`;
        
        // Product description (if available)
        const description = document.createElement('p');
        description.className = 'product-description';
        description.textContent = product.description || '';
        
        // Inventory status
        const inventoryStatus = document.createElement('div');
        inventoryStatus.className = 'inventory-status';
        inventoryStatus.innerHTML = this.getInventoryStatusHTML(product);
        
        // Add to cart button
        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'btn btn-primary add-to-cart-btn';
        addToCartBtn.innerHTML = '<i class="fas fa-cart-plus" aria-hidden="true"></i> Add to Cart';
        
        // Disable button if out of stock
        if (product.inventory === 0 || !product.inStock) {
            addToCartBtn.disabled = true;
            addToCartBtn.textContent = 'Out of Stock';
            addToCartBtn.className = 'btn btn-secondary add-to-cart-btn';
        }
        
        // Assemble card
        card.appendChild(image);
        card.appendChild(title);
        card.appendChild(price);
        if (product.description) {
            card.appendChild(description);
        }
        card.appendChild(inventoryStatus);
        card.appendChild(addToCartBtn);
        
        return card;
    }
    
    getInventoryStatusHTML(product) {
        if (typeof product.inventory === 'undefined') {
            return product.inStock 
                ? '<div class="inventory-status in-stock"><i class="fas fa-check-circle"></i> In Stock</div>'
                : '<div class="inventory-status out-of-stock"><i class="fas fa-times-circle"></i> Out of Stock</div>';
        }
        
        if (product.inventory === 0) {
            return '<div class="inventory-status out-of-stock"><i class="fas fa-times-circle"></i> Out of Stock</div>';
        }
        
        if (product.inventory <= (product.lowStockThreshold || 5)) {
            return `<div class="inventory-status low-stock"><i class="fas fa-exclamation-triangle"></i> Only ${product.inventory} left</div>`;
        }
        
        return '<div class="inventory-status in-stock"><i class="fas fa-check-circle"></i> In Stock</div>';
    }
    
    renderPagination() {
        const pagination = document.getElementById('pagination');
        const paginationInfo = document.getElementById('pagination-info');
        
        if (!pagination) return;
        
        // Update pagination info
        const startItem = this.filteredProducts.length === 0 ? 0 : (this.currentPage - 1) * this.productsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.productsPerPage, this.filteredProducts.length);
        
        if (paginationInfo) {
            paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${this.filteredProducts.length} products`;
        }
        
        // Clear existing pagination
        pagination.innerHTML = '';
        
        if (this.totalPages <= 1) return;
        
        // Previous button
        const prevLi = document.createElement('li');
        if (this.currentPage === 1) {
            prevLi.innerHTML = '<span class="disabled">Previous</span>';
            prevLi.className = 'disabled';
        } else {
            prevLi.innerHTML = `<a href="#" data-page="${this.currentPage - 1}">Previous</a>`;
        }
        pagination.appendChild(prevLi);
        
        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);
        
        if (startPage > 1) {
            const firstLi = document.createElement('li');
            firstLi.innerHTML = '<a href="#" data-page="1">1</a>';
            pagination.appendChild(firstLi);
            
            if (startPage > 2) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.innerHTML = '<span>...</span>';
                pagination.appendChild(ellipsisLi);
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageLi = document.createElement('li');
            if (i === this.currentPage) {
                pageLi.innerHTML = `<span class="active">${i}</span>`;
                pageLi.className = 'active';
            } else {
                pageLi.innerHTML = `<a href="#" data-page="${i}">${i}</a>`;
            }
            pagination.appendChild(pageLi);
        }
        
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.innerHTML = '<span>...</span>';
                pagination.appendChild(ellipsisLi);
            }
            
            const lastLi = document.createElement('li');
            lastLi.innerHTML = `<a href="#" data-page="${this.totalPages}">${this.totalPages}</a>`;
            pagination.appendChild(lastLi);
        }
        
        // Next button
        const nextLi = document.createElement('li');
        if (this.currentPage === this.totalPages) {
            nextLi.innerHTML = '<span class="disabled">Next</span>';
            nextLi.className = 'disabled';
        } else {
            nextLi.innerHTML = `<a href="#" data-page="${this.currentPage + 1}">Next</a>`;
        }
        pagination.appendChild(nextLi);
    }
    
    resetFilters() {
        this.currentFilters = {
            search: '',
            category: '',
            sort: 'name'
        };
        this.currentPage = 1;
        
        // Reset form elements
        const searchInput = document.getElementById('product-search');
        const categoryFilter = document.getElementById('category-filter');
        const sortFilter = document.getElementById('sort-filter');
        
        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (sortFilter) sortFilter.value = 'name';
        
        this.applyFilters();
    }
    
    updateUrl() {
        const params = new URLSearchParams();
        
        if (this.currentFilters.search) {
            params.set('search', this.currentFilters.search);
        }
        
        if (this.currentFilters.category) {
            params.set('category', this.currentFilters.category);
        }
        
        if (this.currentPage > 1) {
            params.set('page', this.currentPage.toString());
        }
        
        const newUrl = params.toString() 
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;
            
        window.history.replaceState({}, '', newUrl);
    }
    
    scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
    
    // Cart functionality (shared with main app)
    addToCart(productId, quantity = 1) {
        const product = this.products.find(p => p.id === productId);
        if (!product) {
            this.showNotification('Product not found', 'error');
            return;
        }
        
        // Check inventory availability
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
        const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (cartTotal) {
            cartTotal.textContent = `$${total.toFixed(2)}`;
        }
    }
    
    createCartItem(item) {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.setAttribute('data-product-id', item.id);
        
        cartItem.innerHTML = `
            <img src="${item.image}" alt="${item.name}" class="cart-item-image">
            <div class="cart-item-details">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">$${item.price.toFixed(2)}</div>
                <div class="cart-item-controls">
                    <button class="quantity-btn decrease-qty" data-product-id="${item.id}">-</button>
                    <span class="quantity-display">${item.quantity}</span>
                    <button class="quantity-btn increase-qty" data-product-id="${item.id}">+</button>
                </div>
            </div>
            <button class="remove-item" data-product-id="${item.id}">
                <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
        `;
        
        // Add event listeners
        const decreaseBtn = cartItem.querySelector('.decrease-qty');
        const increaseBtn = cartItem.querySelector('.increase-qty');
        const removeBtn = cartItem.querySelector('.remove-item');
        
        decreaseBtn.addEventListener('click', () => {
            this.updateCartQuantity(item.id, item.quantity - 1);
        });
        
        increaseBtn.addEventListener('click', () => {
            this.updateCartQuantity(item.id, item.quantity + 1);
        });
        
        removeBtn.addEventListener('click', () => {
            this.removeFromCart(item.id);
        });
        
        return cartItem;
    }
    
    toggleCart() {
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        
        if (cartSidebar && cartOverlay) {
            const isOpen = cartSidebar.classList.contains('open');
            
            if (isOpen) {
                this.closeCart();
            } else {
                cartSidebar.classList.add('open');
                cartOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        }
    }
    
    closeCart() {
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        
        if (cartSidebar && cartOverlay) {
            cartSidebar.classList.remove('open');
            cartOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    saveCartToStorage() {
        try {
            localStorage.setItem('hmherbs_cart', JSON.stringify(this.cart));
        } catch (error) {
            console.error('Failed to save cart to localStorage:', error);
        }
    }
    
    loadCartFromStorage() {
        try {
            const savedCart = localStorage.getItem('hmherbs_cart');
            if (savedCart) {
                this.cart = JSON.parse(savedCart);
            }
        } catch (error) {
            console.error('Failed to load cart from localStorage:', error);
            this.cart = [];
        }
    }
    
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-message">${message}</span>
            <button class="notification-close" aria-label="Close notification">
                <i class="fas fa-times" aria-hidden="true"></i>
            </button>
        `;
        
        container.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
        
        // Manual close
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    // Utility function for debouncing
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.productsPage = new ProductsPage();
});

// Global function for reset filters button
function resetFilters() {
    if (window.productsPage) {
        window.productsPage.resetFilters();
    }
}

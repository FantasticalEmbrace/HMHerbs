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
        
        // Track event listeners for cleanup
        this.eventListeners = [];
        
        // Debouncing for cart operations to prevent race conditions
        this.cartOperationTimeouts = new Map();
        this.cartOperationDelay = 300; // 300ms debounce
        
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
            if (loadingState) loadingState.style.display = 'block';
            if (productsGrid) productsGrid.style.display = 'none';
            
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
                price: parseFloat(product.price) || 0,
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
            if (loadingState) loadingState.style.display = 'none';
            if (productsGrid) productsGrid.style.display = 'grid';
        }
    }
    
    getDemoProducts() {
        // Generate demo products for testing
        const categories = ['herbs', 'vitamins', 'supplements', 'wellness'];
        const products = [];
        
        for (let i = 1; i <= 50; i++) {
            const productName = `Natural Product ${i}`;
            const inventory = Math.floor(Math.random() * 50) + 5;
            products.push({
                id: i,
                name: productName,
                price: Math.floor(Math.random() * 50) + 15,
                image: this.createProductPlaceholder(productName),
                category: categories[Math.floor(Math.random() * categories.length)],
                description: `High-quality natural health product ${i} for optimal wellness.`,
                inventory: inventory,
                featured: Math.random() > 0.7,
                inStock: inventory > 0,
                lowStockThreshold: 5
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
            const pageNum = parseInt(page) || 1;
            // Validate page is positive and not beyond reasonable bounds
            this.currentPage = Math.max(1, Math.min(pageNum, this.totalPages || 1));
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
        image.src = product.image || this.createProductPlaceholder(product.name);
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
        const inventoryStatus = this.createInventoryStatusElement(product);
        
        // Add to cart button
        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'btn btn-primary add-to-cart-btn';
        
        // Create button content safely
        const cartIcon = document.createElement('i');
        cartIcon.className = 'fas fa-cart-plus';
        cartIcon.setAttribute('aria-hidden', 'true');
        const buttonText = document.createTextNode(' Add to Cart');
        
        addToCartBtn.appendChild(cartIcon);
        addToCartBtn.appendChild(buttonText);
        
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
    
    createInventoryStatusElement(product) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'inventory-status';
        
        const icon = document.createElement('i');
        const text = document.createElement('span');
        
        if (typeof product.inventory === 'undefined') {
            if (product.inStock) {
                statusDiv.classList.add('in-stock');
                icon.className = 'fas fa-check-circle';
                text.textContent = ' In Stock';
            } else {
                statusDiv.classList.add('out-of-stock');
                icon.className = 'fas fa-times-circle';
                text.textContent = ' Out of Stock';
            }
        } else {
            const inventoryCount = parseInt(product.inventory, 10);
            if (inventoryCount === 0) {
                statusDiv.classList.add('out-of-stock');
                icon.className = 'fas fa-times-circle';
                text.textContent = ' Out of Stock';
            } else if (inventoryCount <= (product.lowStockThreshold || 5)) {
                statusDiv.classList.add('low-stock');
                icon.className = 'fas fa-exclamation-triangle';
                text.textContent = ` Only ${inventoryCount} left`;
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
    
    // Legacy method for backward compatibility
    getInventoryStatusHTML(product) {
        const element = this.createInventoryStatusElement(product);
        return element.outerHTML;
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
            const prevSpan = document.createElement('span');
            prevSpan.className = 'disabled';
            prevSpan.textContent = 'Previous';
            prevLi.appendChild(prevSpan);
            prevLi.className = 'disabled';
        } else {
            const prevLink = document.createElement('a');
            prevLink.href = '#';
            prevLink.setAttribute('data-page', this.currentPage - 1);
            prevLink.textContent = 'Previous';
            prevLi.appendChild(prevLink);
        }
        pagination.appendChild(prevLi);
        
        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);
        
        if (startPage > 1) {
            const firstLi = document.createElement('li');
            const firstLink = document.createElement('a');
            firstLink.href = '#';
            firstLink.setAttribute('data-page', '1');
            firstLink.textContent = '1';
            firstLi.appendChild(firstLink);
            pagination.appendChild(firstLi);
            
            if (startPage > 2) {
                const ellipsisLi = document.createElement('li');
                const ellipsisSpan = document.createElement('span');
                ellipsisSpan.textContent = '...';
                ellipsisLi.appendChild(ellipsisSpan);
                pagination.appendChild(ellipsisLi);
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageLi = document.createElement('li');
            if (i === this.currentPage) {
                const activeSpan = document.createElement('span');
                activeSpan.className = 'active';
                activeSpan.textContent = i.toString();
                pageLi.appendChild(activeSpan);
                pageLi.className = 'active';
            } else {
                const pageLink = document.createElement('a');
                pageLink.href = '#';
                pageLink.setAttribute('data-page', i.toString());
                pageLink.textContent = i.toString();
                pageLi.appendChild(pageLink);
            }
            pagination.appendChild(pageLi);
        }
        
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                const ellipsisLi = document.createElement('li');
                const ellipsisSpan = document.createElement('span');
                ellipsisSpan.textContent = '...';
                ellipsisLi.appendChild(ellipsisSpan);
                pagination.appendChild(ellipsisLi);
            }
            
            const lastLi = document.createElement('li');
            const lastLink = document.createElement('a');
            lastLink.href = '#';
            lastLink.setAttribute('data-page', this.totalPages.toString());
            lastLink.textContent = this.totalPages.toString();
            lastLi.appendChild(lastLink);
            pagination.appendChild(lastLi);
        }
        
        // Next button
        const nextLi = document.createElement('li');
        if (this.currentPage === this.totalPages) {
            const nextSpan = document.createElement('span');
            nextSpan.className = 'disabled';
            nextSpan.textContent = 'Next';
            nextLi.appendChild(nextSpan);
            nextLi.className = 'disabled';
        } else {
            const nextLink = document.createElement('a');
            nextLink.href = '#';
            nextLink.setAttribute('data-page', (this.currentPage + 1).toString());
            nextLink.textContent = 'Next';
            nextLi.appendChild(nextLink);
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
                // Validate inventory before updating quantity
                const product = this.products.find(p => p.id === productId);
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
        const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (cartTotal) {
            cartTotal.textContent = `$${total.toFixed(2)}`;
        }
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
        price.textContent = `$${item.price.toFixed(2)}`;
        
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
            const product = this.products.find(p => p.id === item.id);
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
        
        // Create elements safely to prevent XSS
        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-message';
        messageSpan.textContent = message; // Use textContent instead of innerHTML
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.setAttribute('aria-label', 'Close notification');
        const timesIcon = document.createElement('i');
        timesIcon.className = 'fas fa-times';
        timesIcon.setAttribute('aria-hidden', 'true');
        closeBtn.appendChild(timesIcon);
        
        notification.appendChild(messageSpan);
        notification.appendChild(closeBtn);
        container.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
        
        // Manual close
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
            const context = this;
            const later = () => {
                clearTimeout(timeout);
                func.apply(context, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Helper method to add event listeners with tracking
    addEventListenerWithCleanup(element, event, handler, options = false) {
        if (element) {
            element.addEventListener(event, handler, options);
            this.eventListeners.push({ element, event, handler, options });
        }
    }
    
    // Cleanup method to remove all event listeners
    destroy() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        this.eventListeners = [];
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

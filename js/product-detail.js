/**
 * Product Detail Page JavaScript
 * Handles loading and displaying individual product information
 */

class ProductDetailPage {
    constructor() {
        this.product = null;
        this.selectedVariant = null;
        this.quantity = 1;
        // Backend server runs on port 3001 and serves both frontend and API
        // Use relative path when on same origin
        this.apiBaseUrl = '/api';

        this.init();
    }

    async init() {
        try {
            // Get product slug from URL
            const slug = this.getProductSlugFromUrl();
            if (!slug) {
                this.showError('Invalid product URL');
                return;
            }

            // Load product data
            await this.loadProduct(slug);

            // Setup event listeners
            this.setupEventListeners();

            // Load cart count
            this.updateCartDisplay();
        } catch (error) {
            console.error('Failed to initialize Product Detail Page:', error);
            this.showError('Failed to load product. Please try again.');
        }
    }

    getProductSlugFromUrl() {
        // Get slug from URL path or query parameter
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);

        // Try query parameter first
        if (urlParams.has('slug')) {
            return urlParams.get('slug');
        }

        // Try pathname (e.g., /product.html?slug=product-name or /product/product-name)
        const pathMatch = path.match(/\/product[s]?\/([^\/]+)/);
        if (pathMatch) {
            return pathMatch[1];
        }

        // Try hash
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            return hash;
        }

        return null;
    }

    async loadProduct(slug) {
        try {
            // Backend serves both frontend and API on the same port (3001)
            // Use relative path which works when on same origin
            const response = await fetch(`${this.apiBaseUrl}/products/${slug}`);

            if (!response.ok) {
                if (response.status === 404) {
                    this.showError('Product not found');
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return;
            }

            this.product = await response.json();
            this.renderProduct();
        } catch (error) {
            console.error('Error loading product:', error);

            // Check if it's a connection refused error (backend not running)
            if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
                this.showError('Unable to connect to server. Please make sure the backend server is running on port 3001.');
            } else {
                this.showError('Failed to load product. Please try again.');
            }
        }
    }

    renderProduct() {
        if (!this.product) return;

        // Hide loading, show content
        document.getElementById('product-loading').style.display = 'none';
        document.getElementById('product-content').style.display = 'block';

        // Set page title
        document.title = `${this.product.name} - H&M Herbs & Vitamins`;

        // Update meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && this.product.short_description) {
            metaDesc.setAttribute('content', this.product.short_description);
        }

        // Breadcrumb
        const breadcrumbProduct = document.getElementById('breadcrumb-product');
        if (breadcrumbProduct) {
            breadcrumbProduct.textContent = this.product.name;
        }

        // Product Title
        const titleEl = document.getElementById('product-title');
        if (titleEl) {
            titleEl.textContent = this.product.name;
        }

        // SKU
        const skuValueEl = document.getElementById('product-sku-value');
        if (skuValueEl && this.product.sku) {
            skuValueEl.textContent = this.product.sku;
        } else {
            document.getElementById('product-sku').style.display = 'none';
        }

        // Price
        const priceEl = document.getElementById('product-price');
        if (priceEl) {
            const price = this.selectedVariant?.price || this.product.price || 0;
            priceEl.textContent = this.formatPrice(price);
        }

        // Compare Price
        const comparePriceEl = document.getElementById('product-compare-price');
        if (comparePriceEl) {
            const comparePrice = this.selectedVariant?.compare_price || this.product.compare_price;
            if (comparePrice && comparePrice > (this.selectedVariant?.price || this.product.price)) {
                comparePriceEl.textContent = this.formatPrice(comparePrice);
                comparePriceEl.style.display = 'block';
            } else {
                comparePriceEl.style.display = 'none';
            }
        }

        // Short Description
        const shortDescEl = document.getElementById('product-short-description');
        if (shortDescEl) {
            if (this.product.short_description && this.product.short_description.trim()) {
                // Use the short_description field
                shortDescEl.innerHTML = `<p>${this.escapeHtml(this.product.short_description.trim())}</p>`;
                shortDescEl.style.display = 'block';
            } else if (this.product.description && this.product.description.trim()) {
                // Fallback: Use first paragraph or first 200 characters of description
                const description = this.product.description.trim();
                const firstPara = description.split('\n')[0].trim();
                const shortText = firstPara.length > 0 && firstPara.length <= 300
                    ? firstPara
                    : description.substring(0, 200).trim();
                shortDescEl.innerHTML = `<p>${this.escapeHtml(shortText)}${description.length > 200 && firstPara.length > 300 ? '...' : ''}</p>`;
                shortDescEl.style.display = 'block';
            } else {
                // Hide if no description available
                shortDescEl.style.display = 'none';
            }
        }

        // Full Description
        const descEl = document.getElementById('product-description');
        if (descEl) {
            if (this.product.description) {
                // Convert line breaks to paragraphs
                const paragraphs = this.product.description.split('\n').filter(p => p.trim());
                descEl.innerHTML = paragraphs.map(p => `<p>${this.escapeHtml(p.trim())}</p>`).join('');
            } else {
                descEl.innerHTML = '<p>No description available.</p>';
            }
        }

        // Images
        this.renderImages();

        // Variants
        this.renderVariants();

        // Brand
        if (this.product.brand_name) {
            document.getElementById('product-brand-value').textContent = this.product.brand_name;
            document.getElementById('product-brand').style.display = 'flex';
        }

        // Category
        if (this.product.category_name) {
            document.getElementById('product-category-value').textContent = this.product.category_name;
            document.getElementById('product-category').style.display = 'flex';
        }

        // Stock Status
        this.updateStockStatus();
    }

    renderImages() {
        const images = this.product.images || [];

        if (images.length === 0) {
            // Use placeholder if no images
            const mainImage = document.getElementById('product-main-image');
            if (mainImage) {
                // Use SVG data URI as placeholder instead of missing file
                mainImage.src = this.createPlaceholderImage();
                mainImage.alt = this.product.name || 'Product image';
            }
            return;
        }

        // Find primary image or use first image
        const primaryImage = images.find(img => img.is_primary) || images[0];
        const mainImage = document.getElementById('product-main-image');
        if (mainImage && primaryImage) {
            const imageUrl = primaryImage.image_url.startsWith('http')
                ? primaryImage.image_url
                : `/${primaryImage.image_url.replace(/^\//, '')}`;

            // Remove skip-error-handling attribute before setting src
            mainImage.removeAttribute('data-skip-error-handling');
            mainImage.src = imageUrl;
            mainImage.alt = primaryImage.alt_text || this.product.name || 'Product image';

            // Ensure image is processed by visual-bug-fixes if needed
            if (window.visualBugFixer && window.visualBugFixer.processedImages && !window.visualBugFixer.processedImages.has(mainImage)) {
                window.visualBugFixer.handleNewImage(mainImage);
            }
        }

        // Render thumbnail gallery
        const gallery = document.getElementById('product-image-gallery');
        if (gallery && images.length > 1) {
            gallery.innerHTML = images.map((img, index) => `
                <button type="button" class="gallery-thumbnail ${index === 0 ? 'active' : ''}" 
                        data-image-index="${index}" 
                        aria-label="View image ${index + 1}">
                    <img src="${img.image_url.startsWith('http') ? img.image_url : `/${img.image_url.replace(/^\//, '')}`}" 
                         alt="${img.alt_text || ''}" 
                         loading="lazy">
                </button>
            `).join('');

            // Add click handlers for thumbnails
            gallery.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
                thumb.addEventListener('click', () => {
                    const index = parseInt(thumb.dataset.imageIndex);
                    this.switchMainImage(images[index]);

                    // Update active thumbnail
                    gallery.querySelectorAll('.gallery-thumbnail').forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                });
            });
        } else if (gallery) {
            gallery.style.display = 'none';
        }
    }

    switchMainImage(image) {
        const mainImage = document.getElementById('product-main-image');
        if (mainImage && image) {
            mainImage.src = image.image_url.startsWith('http')
                ? image.image_url
                : `/${image.image_url.replace(/^\//, '')}`;
            mainImage.alt = image.alt_text || this.product.name || 'Product image';
        }
    }

    renderVariants() {
        const variants = this.product.variants || [];

        if (variants.length === 0) {
            document.getElementById('product-variants').style.display = 'none';
            return;
        }

        const variantSelect = document.getElementById('variant-select');
        if (variantSelect) {
            variantSelect.innerHTML = variants.map((variant, index) => `
                <option value="${variant.id}" data-price="${variant.price}" data-compare-price="${variant.compare_price || ''}">
                    ${variant.name} - ${this.formatPrice(variant.price)}
                </option>
            `).join('');

            // Set first variant as selected
            if (variants.length > 0) {
                this.selectedVariant = variants[0];
            }

            document.getElementById('product-variants').style.display = 'block';
        }
    }

    updateStockStatus() {
        const stockEl = document.getElementById('product-stock');
        if (!stockEl) return;

        const inventory = this.selectedVariant?.inventory_quantity ?? this.product.inventory_quantity ?? 0;
        const inStock = inventory > 0;

        if (inStock) {
            stockEl.innerHTML = `
                <span class="stock-status in-stock">
                    <i class="fas fa-check-circle" aria-hidden="true"></i>
                    In Stock${inventory > 0 ? ` (${inventory} available)` : ''}
                </span>
            `;
        } else {
            stockEl.innerHTML = `
                <span class="stock-status out-of-stock">
                    <i class="fas fa-times-circle" aria-hidden="true"></i>
                    Out of Stock
                </span>
            `;
            // Disable add to cart button
            const addToCartBtn = document.getElementById('add-to-cart-btn');
            if (addToCartBtn) {
                addToCartBtn.disabled = true;
                addToCartBtn.classList.add('disabled');
            }
        }
    }

    setupEventListeners() {
        // Quantity controls
        const decreaseBtn = document.getElementById('quantity-decrease');
        const increaseBtn = document.getElementById('quantity-increase');
        const quantityInput = document.getElementById('product-quantity');

        if (decreaseBtn) {
            decreaseBtn.addEventListener('click', () => {
                const current = parseInt(quantityInput.value) || 1;
                if (current > 1) {
                    quantityInput.value = current - 1;
                    this.quantity = current - 1;
                }
            });
        }

        if (increaseBtn) {
            increaseBtn.addEventListener('click', () => {
                const current = parseInt(quantityInput.value) || 1;
                quantityInput.value = current + 1;
                this.quantity = current + 1;
            });
        }

        if (quantityInput) {
            quantityInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value) || 1;
                if (value < 1) {
                    e.target.value = 1;
                    this.quantity = 1;
                } else {
                    this.quantity = value;
                }
            });
        }

        // Variant selection
        const variantSelect = document.getElementById('variant-select');
        if (variantSelect) {
            variantSelect.addEventListener('change', (e) => {
                const variantId = e.target.value;
                const variant = this.product.variants.find(v => String(v.id) === String(variantId));
                if (variant) {
                    this.selectedVariant = variant;
                    this.updatePrice();
                    this.updateStockStatus();
                }
            });
        }

        // Add to Cart
        const addToCartBtn = document.getElementById('add-to-cart-btn');
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', () => {
                this.addToCart();
            });
        }
    }

    updatePrice() {
        if (!this.product) return;

        const price = this.selectedVariant?.price || this.product.price || 0;
        const priceEl = document.getElementById('product-price');
        if (priceEl) {
            priceEl.textContent = this.formatPrice(price);
        }

        const comparePrice = this.selectedVariant?.compare_price || this.product.compare_price;
        const comparePriceEl = document.getElementById('product-compare-price');
        if (comparePriceEl) {
            if (comparePrice && comparePrice > price) {
                comparePriceEl.textContent = this.formatPrice(comparePrice);
                comparePriceEl.style.display = 'block';
            } else {
                comparePriceEl.style.display = 'none';
            }
        }
    }

    async addToCart() {
        if (!this.product) {
            console.error('Product detail: Cannot add to cart - product not loaded');
            return;
        }

        console.log('Product detail: Adding to cart', { product: this.product, quantity: this.quantity });
        try {
            const inventory = this.selectedVariant?.inventory_quantity ?? this.product.inventory_quantity ?? undefined;
            const cartItem = {
                id: this.product.id,
                product_id: this.product.id,
                variant_id: this.selectedVariant?.id || null,
                name: this.product.name,
                price: this.selectedVariant?.price || this.product.price,
                quantity: this.quantity,
                image: this.product.images?.[0]?.image_url || '',
                inventory_quantity: inventory,
                inventory: inventory,
                inStock: inventory !== undefined ? inventory > 0 : undefined
            };

            // Wait a bit for window.hmHerbsApp to initialize (since script.js loads with defer)
            const tryAddToCart = () => {
                if (window.hmHerbsApp && window.hmHerbsApp.addProductToCart) {
                    // Use addProductToCart which accepts product data directly
                    window.hmHerbsApp.addProductToCart(cartItem, this.quantity);
                    // Force update cart display multiple times to ensure it updates
                    setTimeout(() => this.updateCartDisplay(), 50);
                    setTimeout(() => this.updateCartDisplay(), 200);
                    setTimeout(() => this.updateCartDisplay(), 500);
                } else if (window.hmHerbsApp && window.hmHerbsApp.addToCart) {
                    // Fallback: try with product ID if addProductToCart doesn't exist
                    window.hmHerbsApp.addToCart(this.product.id, this.quantity);
                    setTimeout(() => this.updateCartDisplay(), 50);
                    setTimeout(() => this.updateCartDisplay(), 200);
                    setTimeout(() => this.updateCartDisplay(), 500);
                } else {
                    // Fallback: add to localStorage cart
                    let cart = JSON.parse(localStorage.getItem('hmherbs_cart') || '[]');
                    const existingIndex = cart.findIndex(item => {
                        const itemId = item.id || item.product_id;
                        const cartItemId = cartItem.id || cartItem.product_id;
                        // Use string comparison for IDs to handle both numeric and alphanumeric IDs
                        return String(itemId) === String(cartItemId) &&
                            (item.variant_id || null) === (cartItem.variant_id || null);
                    });

                    if (existingIndex >= 0) {
                        cart[existingIndex].quantity += cartItem.quantity;
                    } else {
                        // Ensure cart item has the right structure
                        cart.push({
                            id: cartItem.id || cartItem.product_id,
                            product_id: cartItem.product_id,
                            name: cartItem.name,
                            price: cartItem.price,
                            image: cartItem.image,
                            quantity: cartItem.quantity
                        });
                    }

                    localStorage.setItem('hmherbs_cart', JSON.stringify(cart));
                    this.updateCartDisplay();
                    this.showNotification('Product added to cart!', 'success');

                    // Also try to update main app's cart if it becomes available
                    setTimeout(() => {
                        if (window.hmHerbsApp && window.hmHerbsApp.loadCartFromStorage) {
                            window.hmHerbsApp.loadCartFromStorage();
                            window.hmHerbsApp.updateCartDisplay();
                        }
                    }, 300);
                }
            };

            // Try immediately, and retry after delays if hmHerbsApp isn't ready
            tryAddToCart();
            if (!window.hmHerbsApp) {
                setTimeout(tryAddToCart, 200);
                setTimeout(tryAddToCart, 500);
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            this.showNotification('Failed to add product to cart', 'error');
        }
    }

    updateCartDisplay() {
        // Try to use main app's cart display if available, otherwise use localStorage
        if (window.hmHerbsApp && window.hmHerbsApp.updateCartDisplay) {
            // Sync localStorage with main app's cart
            try {
                const localStorageCart = JSON.parse(localStorage.getItem('hmherbs_cart') || '[]');
                // If main app cart is empty but localStorage has items, load them
                if (window.hmHerbsApp.cart.length === 0 && localStorageCart.length > 0) {
                    window.hmHerbsApp.cart = localStorageCart.map(item => ({
                        id: item.id || item.product_id,
                        name: item.name,
                        price: item.price,
                        image: item.image,
                        quantity: item.quantity || 1
                    }));
                }
            } catch (error) {
                console.error('Error syncing cart:', error);
            }
            // Use main app's updateCartDisplay which handles full cart display
            window.hmHerbsApp.updateCartDisplay();
        } else {
            // Fallback: Update cart count from localStorage
            try {
                let cart = JSON.parse(localStorage.getItem('hmherbs_cart') || '[]');
                const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
                const cartCount = document.getElementById('cart-count');
                if (cartCount) {
                    cartCount.textContent = totalItems;
                    cartCount.style.display = totalItems > 0 ? 'block' : 'none';
                }
            } catch (error) {
                console.error('Error updating cart display:', error);
            }
        }
    }

    showError(message) {
        document.getElementById('product-loading').style.display = 'none';
        document.getElementById('product-content').style.display = 'none';
        const errorEl = document.getElementById('product-error');
        if (errorEl) {
            errorEl.style.display = 'block';
            const errorMsg = errorEl.querySelector('p');
            if (errorMsg) {
                errorMsg.textContent = message;
            }
        }
    }

    showNotification(message, type = 'success') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ef4444' : '#10b981'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    formatPrice(price) {
        if (!price && price !== 0) return '$0.00';
        return `$${parseFloat(price).toFixed(2)}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    createPlaceholderImage() {
        // Create an SVG placeholder image as data URI
        const svgContent = `
            <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#4a7c59;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#5a8c69;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <rect width="400" height="400" fill="url(#grad)"/>
                <circle cx="200" cy="150" r="40" fill="rgba(255,255,255,0.3)"/>
                <rect x="160" y="200" width="80" height="60" rx="5" fill="rgba(255,255,255,0.2)"/>
                <text x="200" y="290" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle">Product Image</text>
                <text x="200" y="315" font-family="Arial, sans-serif" font-size="14" fill="rgba(255,255,255,0.9)" text-anchor="middle">Unavailable</text>
            </svg>
        `.trim();
        return `data:image/svg+xml;base64,${btoa(svgContent)}`;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.productDetailPage = new ProductDetailPage();
    });
} else {
    window.productDetailPage = new ProductDetailPage();
}


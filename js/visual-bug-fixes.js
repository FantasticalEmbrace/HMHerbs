// Visual Bug Fixes for HM Herbs
// Addresses carousel flickering, scroll bar issues, and image loading problems

function hmHerbsIsCheckoutPage() {
    const path = (typeof window !== 'undefined' && window.location && window.location.pathname) || '';
    return path.includes('checkout.html') || /\/checkout\/?$/i.test(path);
}

class VisualBugFixer {
    constructor() {
        this.config = {
            enableFlickerFix: true,
            enableImageFallbacks: true,
            enableScrollOptimization: true,
            enableTransitionOptimization: true,
            debugMode: false // Reduced logging - only enable for debugging
        };

        this.imageCache = new Map();
        this.loadingImages = new Set();
        this.processedImages = new WeakSet(); // Track processed images to avoid duplicates
        this.flickerElements = new WeakSet();
        this.initialized = false;
        this.eventListeners = []; // Track event listeners for cleanup

        this.init();
    }

    init() {
        // Checkout: skip scroll pointer-events hack, body-wide image observer, and carousel fixes.
        if (hmHerbsIsCheckoutPage()) {
            this.initialized = true;
            return;
        }

        // Fix carousel and image flickering
        if (this.config.enableFlickerFix) {
            this.fixCarouselFlickering();
        }

        // Fix image loading issues
        if (this.config.enableImageFallbacks) {
            this.setupImageFallbacks();
        }

        // Fix scroll bar flickering
        if (this.config.enableScrollOptimization) {
            this.fixScrollBarFlickering();
        }

        // Optimize transitions to prevent flickering
        if (this.config.enableTransitionOptimization) {
            this.optimizeTransitions();
        }

        // Set up mutation observer for dynamic content
        this.setupDynamicContentObserver();

        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            this.addEventListenerWithCleanup(document, 'DOMContentLoaded', () => this.applyFixes());
        } else {
            this.applyFixes();
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
                console.warn('Error removing VisualBugFixer event listener:', error);
            }
        });
        this.eventListeners = [];
    }

    // Fix Carousel Flickering
    fixCarouselFlickering() {
        // Add CSS to prevent flickering during transitions
        const flickerFixCSS = document.createElement('style');
        flickerFixCSS.textContent = `
            /* Prevent carousel flickering — never translateZ on .product-image (<img> paints blank in some engines) */
            .product-spotlight .spotlight-grid,
            .product-card {
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
                transform: translateZ(0);
                -webkit-transform: translateZ(0);
                will-change: auto;
            }
            
            /* Keep product photos visible: opacity 0 + waiting for .loaded hid real images (lazy/cached races). */
            .product-image {
                transition: opacity 0.3s ease, transform 0.3s ease;
                opacity: 1;
            }
            
            .product-image.loaded {
                opacity: 1;
            }
            
            .product-image.loading {
                opacity: 1;
            }
            
            /* Prevent layout shifts */
            .product-card {
                min-height: 400px;
                contain: layout style paint;
            }
            
            /* Optimize GPU layers */
            .product-card:hover {
                transform: translateY(-4px) translateZ(0);
                will-change: transform;
            }
            
            .product-card:not(:hover) {
                will-change: auto;
            }
            
            /* Fix scroll bar flickering */
            ::-webkit-scrollbar {
                width: 12px;
                background: var(--color-background);
            }
            
            ::-webkit-scrollbar-track {
                background: var(--color-background);
                border-radius: 6px;
            }
            
            ::-webkit-scrollbar-thumb {
                background: var(--color-primary);
                border-radius: 6px;
                border: 2px solid var(--color-background);
                transition: background-color 0.2s ease;
            }
            
            ::-webkit-scrollbar-thumb:hover {
                background: var(--color-primary-dark);
            }
            
            /* Prevent scrollbar flickering */
            html {
                scrollbar-gutter: stable;
            }
            
            /* Smooth scrolling optimization */
            html {
                scroll-behavior: smooth;
            }
            
            @media (prefers-reduced-motion: reduce) {
                html {
                    scroll-behavior: auto;
                }
                
                .product-image,
                .product-card {
                    transition: none !important;
                    animation: none !important;
                }
            }
        `;
        document.head.appendChild(flickerFixCSS);
    }

    // Fix Image Loading Issues
    setupImageFallbacks() {
        // Create fallback image data URL
        const fallbackImageDataURL = this.createFallbackImage();

        // Set up image loading with proper error handling
        this.setupImageLoading(fallbackImageDataURL);

        // Preload critical images
        this.preloadCriticalImages();
    }

    createFallbackImage() {
        // Create a simple SVG fallback image
        const svgContent = `
            <svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#f8f9fa"/>
                <rect x="50" y="50" width="200" height="100" fill="#e9ecef" rx="8"/>
                <circle cx="100" cy="80" r="15" fill="#dee2e6"/>
                <rect x="130" y="70" width="80" height="8" fill="#dee2e6" rx="4"/>
                <rect x="130" y="85" width="60" height="6" fill="#dee2e6" rx="3"/>
                <text x="150" y="130" font-family="Arial, sans-serif" font-size="12" fill="#6c757d" text-anchor="middle">
                    Image unavailable
                </text>
            </svg>
        `;

        return `data:image/svg+xml;base64,${btoa(svgContent)}`;
    }

    setupImageLoading(_fallbackImageDataURL) {
        // Override HMHerbsApp cards only if that app exists — do not double-load via new Image()
        // (races handleNewImage and can replace real photos with SVG after retries).
        const originalCreateProductCard = window.HMHerbsApp?.prototype?.createProductCard;
        if (originalCreateProductCard) {
            window.HMHerbsApp.prototype.createProductCard = function (product) {
                return originalCreateProductCard.call(this, product);
            };
        }
    }

    preloadCriticalImages() {
        // Preload images that are likely to be needed
        // Only preload if not in file:// protocol and images are accessible
        if (window.location.protocol === 'file:') {
            return; // Skip preloading in file:// protocol
        }

        // Same-origin spotlight assets only — old hmherbs.com /application/files/... URLs 404 (HTML) and trigger CORB when used as images
        const criticalImageUrls = [
            '/images/products/nature-s-puls-probiotic-mega.jpg',
            '/images/products/nature-s-plus-ageloss-kidney-support.jpg',
            '/images/products/nature-s-plus-ageloss-first-day-inflammation-response.jpg'
        ];

        criticalImageUrls.forEach(url => {
            if (!this.imageCache.has(url)) {
                const img = new Image();
                img.onload = () => {
                    this.imageCache.set(url, img);
                };
                img.onerror = () => {
                    // Silently fail - these are optional preloads
                    // CORS errors are expected for external images without CORS headers
                    // Don't log to avoid console noise
                };
                // Don't set crossOrigin for external images - they may not have CORS headers
                // Setting crossOrigin = 'anonymous' causes CORS errors if server doesn't send headers
                // Let the browser handle it naturally without CORS restrictions
                img.src = url;
            }
        });
    }

    // Fix Scroll Bar Flickering
    fixScrollBarFlickering() {
        // Stabilize scrollbar
        document.documentElement.style.scrollbarGutter = 'stable';

        // Optimize scroll events
        let scrollTimeout;
        let isScrolling = false;

        const optimizedScrollHandler = () => {
            if (!isScrolling) {
                isScrolling = true;
                document.body.classList.add('scrolling');
            }

            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                isScrolling = false;
                document.body.classList.remove('scrolling');
            }, 150);
        };

        // Use passive listeners for better performance
        this.addEventListenerWithCleanup(window, 'scroll', optimizedScrollHandler, { passive: true });

        // Add CSS for scroll optimization
        const scrollOptimizationCSS = document.createElement('style');
        scrollOptimizationCSS.textContent = `
            /* Prevent scrollbar layout shifts */
            html {
                overflow-y: scroll;
                scrollbar-gutter: stable;
            }
            
            /* Smooth scrollbar transitions */
            ::-webkit-scrollbar-thumb {
                transition: background-color 0.2s ease !important;
            }
        `;
        document.head.appendChild(scrollOptimizationCSS);
    }

    // Optimize Transitions
    optimizeTransitions() {
        // Add CSS to prevent transition flickering
        const transitionOptimizationCSS = document.createElement('style');
        transitionOptimizationCSS.textContent = `
            /* Prevent transition flickering */
            * {
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            /* Optimize transform transitions */
            .product-card,
            .btn,
            .nav-menu a {
                transform: translateZ(0);
                backface-visibility: hidden;
                perspective: 1000px;
            }
            
            /* Don't apply transforms to mobile menu links - causes rendering issues */
            .nav-menu.show a {
                transform: none !important;
                backface-visibility: visible !important;
            }

            /* Modals: .btn rules above break fixed panels + overflow; keep modal trees transform-clean. */
            .wishlist-modal .btn,
            .acct-modal-floating .btn,
            .edsa-modal .btn {
                transform: none !important;
                -webkit-transform: none !important;
                backface-visibility: visible !important;
                -webkit-backface-visibility: visible !important;
                perspective: none !important;
                will-change: auto !important;
            }
            
            /* Prevent layout thrashing */
            .product-card:hover {
                transform: translateY(-4px) translateZ(0);
                will-change: transform;
            }
            
            .product-card:not(:hover) {
                will-change: auto;
            }
            
            /* Optimize opacity transitions */
            .fade-in,
            .product-image {
                transition: opacity 0.3s ease;
            }
            
            /* Keep spotlight visible — opacity 0 here hid the whole carousel until .loaded */
            .product-spotlight {
                opacity: 1;
                transition: opacity 0.5s ease;
            }
            
            .product-spotlight.loaded {
                opacity: 1;
            }
        `;
        document.head.appendChild(transitionOptimizationCSS);

        // Mark spotlight section as loaded after content is ready
        setTimeout(() => {
            const spotlight = document.querySelector('.product-spotlight');
            if (spotlight) {
                spotlight.classList.add('loaded');
            }
        }, 100);
    }

    // Dynamic Content Observer
    setupDynamicContentObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        // Handle new images
                        const images = node.querySelectorAll ? node.querySelectorAll('img') : [];
                        images.forEach(img => {
                            if (img.src && !this.processedImages.has(img) && !this.loadingImages.has(img)) {
                                this.handleNewImage(img);
                            }
                        });

                        // Handle product images specifically
                        const productImages = node.querySelectorAll ? node.querySelectorAll('.product-image') : [];
                        productImages.forEach(img => {
                            if (!this.processedImages.has(img) && !this.loadingImages.has(img)) {
                                this.handleNewImage(img);
                            }
                        });

                        // Handle new product cards
                        const productCards = node.querySelectorAll ? node.querySelectorAll('.product-card') : [];
                        productCards.forEach(card => {
                            this.optimizeProductCard(card);
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    handleNewImage(img) {
        // Skip if already processed or currently loading
        if (this.loadingImages.has(img) || this.processedImages.has(img)) {
            return;
        }

        // Final placeholder only (SVG) — skip re-processing
        if (img.getAttribute('data-fallback-applied') === 'true') {
            this.processedImages.add(img);
            return;
        }

        // Skip EDSA images and other static images that should not be processed
        if (img.closest('.edsa-image') ||
            img.src.includes('edsa-icon') ||
            img.hasAttribute('data-skip-error-handling')) {
            // Just mark as loaded if it's already complete, but don't apply error handling
            if (img.complete && img.naturalWidth > 0) {
                img.classList.add('loaded');
            }
            this.processedImages.add(img);
            return;
        }

        // Mark as processed to avoid duplicate processing
        this.processedImages.add(img);
        const isLazyImage = img.getAttribute('loading') === 'lazy' || img.loading === 'lazy';
        if (!isLazyImage) {
            this.loadingImages.add(img);
        }
        img.classList.add('loading');

        const originalSrc = img.src;

        // Don't clear the src - just check if it loads properly
        const handleLoad = () => {
            img.classList.remove('loading');
            img.classList.add('loaded');
            this.loadingImages.delete(img);
            // Only log in debug mode
            if (this.config.debugMode) {
                console.log('✅ Image loaded successfully:', originalSrc);
            }
        };

        const handleError = () => {
            img.classList.remove('loading');
            img.classList.add('error');
            this.loadingImages.delete(img);
            console.error('Image failed to load (fix URL, file on disk, or DB image_url — no placeholder swap):', originalSrc);
        };

        // Lazy images may report complete + naturalWidth 0 before decode; only treat "complete"
        // as authoritative for eager images (avoids false "error" and placeholder CSS).
        if (!isLazyImage && img.complete) {
            if (img.naturalWidth === 0 || !originalSrc || originalSrc === '') {
                handleError();
            } else {
                handleLoad();
            }
        } else {
            // Set up listeners for images still loading — rely on native load/error only.
            // Do NOT use a timed fallback: products.html uses loading="lazy", so off-screen
            // images intentionally have not started downloading yet; a timeout would fire
            // before the browser even requests the file and would replace real photos with placeholders.
            this.addEventListenerWithCleanup(img, 'load', handleLoad, { once: true });
            this.addEventListenerWithCleanup(img, 'error', handleError, { once: true });
            if (!isLazyImage && img.complete) {
                if (img.naturalWidth === 0 || !originalSrc || originalSrc === '') {
                    handleError();
                } else {
                    handleLoad();
                }
            }
        }
    }

    optimizeProductCard(card) {
        // Prevent flickering on new product cards
        card.style.transform = 'translateZ(0)';
        card.style.backfaceVisibility = 'hidden';

        // Add to flicker elements set
        this.flickerElements.add(card);
    }

    // Apply all fixes
    applyFixes() {
        if (hmHerbsIsCheckoutPage()) {
            this.initialized = true;
            return;
        }

        // Only log in debug mode
        if (this.config.debugMode) {
            console.log('🔧 Applying visual bug fixes...');
        }

        // Fix existing elements
        document.querySelectorAll('.product-card').forEach(card => {
            this.optimizeProductCard(card);
        });

        // Fix ALL images on the page - be more aggressive
        document.querySelectorAll('img').forEach(img => {
            // Skip EDSA images and other static images
            if (img.closest('.edsa-image') ||
                img.src.includes('edsa-icon') ||
                img.hasAttribute('data-skip-error-handling')) {
                // Just ensure EDSA images are marked as loaded if they're complete
                if (img.complete && img.naturalWidth > 0) {
                    img.classList.add('loaded');
                }
                this.processedImages.add(img);
                return;
            }

            // Skip images with empty src or data URI placeholders (they'll be set by other scripts)
            const src = img.src || img.getAttribute('src') || '';
            if (!src || src.trim() === '' || src.startsWith('data:image/svg+xml') || src === window.location.href) {
                // Skip processing - these will be set by product-detail.js or other scripts
                this.processedImages.add(img);
                return;
            }

            // Skip if src is the current page URL (common when src="" resolves to page URL)
            try {
                const imgUrl = new URL(src, window.location.href);
                if (imgUrl.href === window.location.href || imgUrl.pathname.endsWith('.html')) {
                    // This is likely a placeholder or incorrectly set src
                    this.processedImages.add(img);
                    return;
                }
            } catch (e) {
                // URL parsing failed, continue processing
            }

            // Only log in debug mode
            if (this.config.debugMode) {
                console.log('🖼️ Processing image:', src, 'Complete:', img.complete);
            }

            // Process images that haven't been processed yet
            if (src && !this.processedImages.has(img)) {
                this.handleNewImage(img);
            } else {
                // Image has no valid src - mark as processed but don't apply fallback yet
                this.processedImages.add(img);
            }
        });

        this.initialized = true;

        // Only log in debug mode
        if (this.config.debugMode) {
            console.log('✅ Visual bug fixes applied successfully');
            console.log('📊 Status:', this.getLoadingStatus());
        }
    }

    // Utility method for image loading with retry
    loadImageWithRetry(img, src, retries = 3) {
        return new Promise((resolve, _reject) => {
            const attemptLoad = (attempt) => {
                const tempImg = new Image();

                tempImg.onload = () => {
                    img.src = src;
                    img.classList.remove('loading');
                    img.classList.add('loaded');
                    this.loadingImages.delete(img);
                    resolve(img);
                };

                tempImg.onerror = () => {
                    if (attempt < retries) {
                        setTimeout(() => attemptLoad(attempt + 1), 1000 * attempt);
                    } else {
                        const fallbackSrc = this.createFallbackImage();
                        img.src = fallbackSrc;
                        img.classList.remove('loading');
                        img.classList.add('error');
                        img.alt = img.alt + ' (Image unavailable)';
                        this.loadingImages.delete(img);
                        resolve(img);
                    }
                };

                tempImg.src = src;
            };

            attemptLoad(1);
        });
    }

    // Public API
    fixImage(img, src) {
        return this.loadImageWithRetry(img, src);
    }

    getLoadingStatus() {
        return {
            loadingImages: this.loadingImages.size,
            cachedImages: this.imageCache.size,
            flickerElements: this.flickerElements
        };
    }

    enableDebugMode() {
        this.config.debugMode = true;
        console.log('Visual bug fixer debug mode enabled');
    }
}

// Initialize Visual Bug Fixer IMMEDIATELY - don't wait for DOM
(function () {
    // Apply critical CSS fixes immediately
    const criticalCSS = document.createElement('style');
    criticalCSS.textContent = `
        /* IMMEDIATE FLICKER FIXES — same exclusions as css/emergency-fixes.css (wishlist modal + dim must stay transform-clean) */
        *:not(img):not(picture):not(video):not(svg):not(canvas):not(.auth-modal):not(.hm-age-gate):not(.newsletter-popup):not(.cart-sidebar):not(.cart-overlay):not(.auth-icon-svg):not(.header-actions):not(.header-actions *):not(.acct-modal-backdrop):not(.hm-wl-picker-backdrop):not(.acct-modal):not(.wishlist-modal):not(.hm-wl-picker-dim):not(.acct-modal-dim):not(.edsa-modal):not(.edsa-modal *) {
            -webkit-backface-visibility: hidden !important;
            backface-visibility: hidden !important;
            -webkit-transform: translateZ(0) !important;
            transform: translateZ(0) !important;
        }
        img, picture, video, svg, canvas {
            backface-visibility: visible !important;
            -webkit-backface-visibility: visible !important;
            transform: none !important;
            -webkit-transform: none !important;
        }
        
        /* EXCEPTION: Testimonials carousel track - must allow translateX transforms */
        /* Don't apply the global translateZ(0) transform to the carousel track */
        .testimonials-track {
            backface-visibility: visible !important;
            -webkit-backface-visibility: visible !important;
            /* Allow JavaScript to set transform via inline styles */
        }
        
        .product-card, .spotlight-grid {
            will-change: transform !important;
            transform: translate3d(0,0,0) !important;
            -webkit-transform: translate3d(0,0,0) !important;
        }
        
        /* IMMEDIATE SCROLLBAR FIX */
        html {
            scrollbar-gutter: stable !important;
            overflow-y: scroll !important;
        }
        
        /* Images must stay visible: hide-until-.loaded + !important broke every <img> when .loaded
           was missing (race, lazy load, or script order). Do not default img to opacity 0. */
        img {
            opacity: 1 !important;
            transition: opacity 0.3s ease !important;
        }
        
        img.loaded, 
        img.error,
        .edsa-image img,
        img[data-skip-error-handling],
        img[src*="data:"] {
            opacity: 1 !important;
        }
        
        img[src=""], img:not([src]) {
            background: #f8f9fa url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2Y4ZjlmYSIvPgo8cmVjdCB4PSI1MCIgeT0iNTAiIHdpZHRoPSIyMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZTllY2VmIiByeD0iOCIvPgo8Y2lyY2xlIGN4PSIxMDAiIGN5PSI4MCIgcj0iMTUiIGZpbGw9IiNkZWUyZTYiLz4KPHJlY3QgeD0iMTMwIiB5PSI3MCIgd2lkdGg9IjgwIiBoZWlnaHQ9IjgiIGZpbGw9IiNkZWUyZTYiIHJ4PSI0Ii8+CjxyZWN0IHg9IjEzMCIgeT0iODUiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2IiBmaWxsPSIjZGVlMmU2IiByeD0iMyIvPgo8dGV4dCB4PSIxNTAiIHk9IjEzMCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjEyIiBmaWxsPSIjNmM3NTdkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JbWFnZSB1bmF2YWlsYWJsZTwvdGV4dD4KPC9zdmc+') center/contain no-repeat !important;
            opacity: 1 !important;
        }
    `;
    document.head.insertBefore(criticalCSS, document.head.firstChild);

    // Initialize immediately
    window.visualBugFixer = new VisualBugFixer();

    // Also initialize on DOM ready as backup
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!window.visualBugFixer.initialized) {
                window.visualBugFixer.applyFixes();
            }
        });
    }

    // Setup cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.visualBugFixer) {
            window.visualBugFixer.cleanup();
        }
    });

    // Also cleanup on page hide (for mobile)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && window.visualBugFixer) {
            window.visualBugFixer.cleanup();
        }
    });
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VisualBugFixer;
}

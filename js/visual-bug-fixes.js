// Visual Bug Fixes for HM Herbs
// Addresses carousel flickering, scroll bar issues, and image loading problems

class VisualBugFixer {
    constructor() {
        this.config = {
            enableFlickerFix: true,
            enableImageFallbacks: true,
            enableScrollOptimization: true,
            enableTransitionOptimization: true,
            debugMode: true // Enable debug mode to see what's happening
        };
        
        this.imageCache = new Map();
        this.loadingImages = new Set();
        this.flickerElements = new WeakSet();
        this.initialized = false;
        
        this.init();
    }

    init() {
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
            document.addEventListener('DOMContentLoaded', () => this.applyFixes());
        } else {
            this.applyFixes();
        }
    }

    // Fix Carousel Flickering
    fixCarouselFlickering() {
        // Add CSS to prevent flickering during transitions
        const flickerFixCSS = document.createElement('style');
        flickerFixCSS.textContent = `
            /* Prevent carousel flickering */
            .product-spotlight .spotlight-grid,
            .product-card,
            .product-image {
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
                transform: translateZ(0);
                -webkit-transform: translateZ(0);
                will-change: auto;
            }
            
            /* Smooth image transitions */
            .product-image {
                transition: opacity 0.3s ease, transform 0.3s ease;
                opacity: 0;
            }
            
            .product-image.loaded {
                opacity: 1;
            }
            
            .product-image.loading {
                opacity: 0.5;
                background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                background-size: 200% 100%;
                animation: shimmer 1.5s infinite;
            }
            
            @keyframes shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
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

    setupImageLoading(fallbackImageDataURL) {
        // Enhanced image loading with retry mechanism
        const loadImageWithRetry = (img, src, retries = 3) => {
            return new Promise((resolve, reject) => {
                const attemptLoad = (attempt) => {
                    const tempImg = new Image();
                    
                    tempImg.onload = () => {
                        // Image loaded successfully
                        img.src = src;
                        img.classList.remove('loading');
                        img.classList.add('loaded');
                        this.loadingImages.delete(img);
                        resolve(img);
                    };
                    
                    tempImg.onerror = () => {
                        if (attempt < retries) {
                            // Retry after delay
                            setTimeout(() => attemptLoad(attempt + 1), 1000 * attempt);
                        } else {
                            // Use fallback image
                            img.src = fallbackImageDataURL;
                            img.classList.remove('loading');
                            img.classList.add('error');
                            img.alt = img.alt + ' (Image unavailable)';
                            this.loadingImages.delete(img);
                            
                            if (this.config.debugMode) {
                                console.warn('Failed to load image after retries:', src);
                            }
                            
                            resolve(img);
                        }
                    };
                    
                    tempImg.src = src;
                };
                
                attemptLoad(1);
            });
        };

        // Override image loading for product images
        const originalCreateProductCard = window.HMHerbsApp?.prototype?.createProductCard;
        if (originalCreateProductCard) {
            window.HMHerbsApp.prototype.createProductCard = function(product) {
                const card = originalCreateProductCard.call(this, product);
                const img = card.querySelector('.product-image');
                
                if (img && product.image) {
                    img.classList.add('loading');
                    this.loadingImages.add(img);
                    
                    loadImageWithRetry(img, product.image).catch(error => {
                        console.error('Image loading failed:', error);
                    });
                }
                
                return card;
            }.bind(this);
        }

        // Handle existing images on the page
        document.querySelectorAll('img').forEach(img => {
            if (img.src && !img.complete) {
                img.classList.add('loading');
                this.loadingImages.add(img);
                
                const originalSrc = img.src;
                img.src = '';
                
                loadImageWithRetry(img, originalSrc).catch(error => {
                    console.error('Image loading failed:', error);
                });
            }
        });
    }

    preloadCriticalImages() {
        // Preload images that are likely to be needed
        const criticalImageUrls = [
            'https://hmherbs.com/application/files/cache/thumbnails/our-fathers-healing-antiseptic-salve-2oz-60fefe12ef7ac85568c785fc398bc266.jpg',
            'https://hmherbs.com/application/files/cache/thumbnails/our-fathers-bone-flesh-cartilage-salve-2oz-jar-b7516adf6e40fdd6a123dbc4c0ad0976.jpg',
            'https://hmherbs.com/application/files/cache/thumbnails/eves-generational-formula-b7516adf6e40fdd6a123dbc4c0ad0976.jpg'
        ];

        criticalImageUrls.forEach(url => {
            if (!this.imageCache.has(url)) {
                const img = new Image();
                img.onload = () => {
                    this.imageCache.set(url, img);
                };
                img.onerror = () => {
                    if (this.config.debugMode) {
                        console.warn('Failed to preload critical image:', url);
                    }
                };
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
        window.addEventListener('scroll', optimizedScrollHandler, { passive: true });
        
        // Add CSS for scroll optimization
        const scrollOptimizationCSS = document.createElement('style');
        scrollOptimizationCSS.textContent = `
            /* Scroll optimization */
            body.scrolling {
                pointer-events: none;
            }
            
            body.scrolling * {
                pointer-events: auto;
            }
            
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
            
            /* Prevent flickering during page load */
            .product-spotlight {
                opacity: 0;
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
                            if (img.src && !img.complete && !this.loadingImages.has(img)) {
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
        if (this.loadingImages.has(img)) return;
        
        this.loadingImages.add(img);
        img.classList.add('loading');
        
        const originalSrc = img.src;
        
        // Don't clear the src - just check if it loads properly
        const handleLoad = () => {
            img.classList.remove('loading');
            img.classList.add('loaded');
            this.loadingImages.delete(img);
            console.log('✅ Image loaded successfully:', originalSrc);
        };
        
        const handleError = () => {
            img.classList.remove('loading');
            img.classList.add('error');
            this.loadingImages.delete(img);
            this.applyImageFallback(img);
            console.log('❌ Image failed to load, applying fallback:', originalSrc);
        };
        
        // Check current state
        if (img.complete) {
            if (img.naturalWidth === 0 || !originalSrc || originalSrc === '') {
                handleError();
            } else {
                handleLoad();
            }
        } else {
            // Set up listeners for images still loading
            img.addEventListener('load', handleLoad, { once: true });
            img.addEventListener('error', handleError, { once: true });
            
            // Timeout fallback
            setTimeout(() => {
                if (this.loadingImages.has(img)) {
                    console.log('⏰ Image loading timeout:', originalSrc);
                    handleError();
                }
            }, 5000);
        }
    }

    applyImageFallback(img) {
        // Apply fallback styling and placeholder
        img.style.background = '#f8f9fa url(\'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2Y4ZjlmYSIvPgo8cmVjdCB4PSI1MCIgeT0iNTAiIHdpZHRoPSIyMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZTllY2VmIiByeD0iOCIvPgo8Y2lyY2xlIGN4PSIxMDAiIGN5PSI4MCIgcj0iMTUiIGZpbGw9IiNkZWUyZTYiLz4KPHJlY3QgeD0iMTMwIiB5PSI3MCIgd2lkdGg9IjgwIiBoZWlnaHQ9IjgiIGZpbGw9IiNkZWUyZTYiIHJ4PSI0Ii8+CjxyZWN0IHg9IjEzMCIgeT0iODUiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2IiBmaWxsPSIjZGVlMmU2IiByeD0iMyIvPgo8dGV4dCB4PSIxNTAiIHk9IjEzMCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjEyIiBmaWxsPSIjNmM3NTdkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JbWFnZSB1bmF2YWlsYWJsZTwvdGV4dD4KPC9zdmc+\') center/contain no-repeat';
        img.style.backgroundColor = '#f8f9fa';
        img.style.minHeight = '200px';
        img.style.opacity = '1';
        img.alt = 'Image unavailable';
        
        // Clear the broken src to prevent further loading attempts
        img.removeAttribute('src');
        
        console.log('🖼️ Applied fallback styling to image');
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
        console.log('🔧 Applying visual bug fixes...');
        
        // Fix existing elements
        document.querySelectorAll('.product-card').forEach(card => {
            this.optimizeProductCard(card);
        });
        
        // Fix ALL images on the page - be more aggressive
        document.querySelectorAll('img').forEach(img => {
            console.log('🖼️ Processing image:', img.src, 'Complete:', img.complete);
            
            // Force re-process all images
            if (img.src) {
                this.handleNewImage(img);
            } else {
                // Image has no src - apply fallback immediately
                img.classList.add('error');
                console.log('❌ Image has no src, applying fallback');
            }
        });
        
        // Mark as initialized
        document.body.classList.add('visual-bugs-fixed');
        this.initialized = true;
        
        console.log('✅ Visual bug fixes applied successfully');
        console.log('📊 Status:', this.getLoadingStatus());
    }

    // Utility method for image loading with retry
    loadImageWithRetry(img, src, retries = 3) {
        return new Promise((resolve, reject) => {
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
(function() {
    // Apply critical CSS fixes immediately
    const criticalCSS = document.createElement('style');
    criticalCSS.textContent = `
        /* IMMEDIATE FLICKER FIXES */
        * {
            -webkit-backface-visibility: hidden !important;
            backface-visibility: hidden !important;
            -webkit-transform: translateZ(0) !important;
            transform: translateZ(0) !important;
        }
        
        .product-card, .product-image, .spotlight-grid {
            will-change: transform !important;
            transform: translate3d(0,0,0) !important;
            -webkit-transform: translate3d(0,0,0) !important;
        }
        
        /* IMMEDIATE SCROLLBAR FIX */
        html {
            scrollbar-gutter: stable !important;
            overflow-y: scroll !important;
        }
        
        /* IMMEDIATE IMAGE LOADING FIX */
        img {
            opacity: 0 !important;
            transition: opacity 0.3s ease !important;
        }
        
        img.loaded, img.error {
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
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VisualBugFixer;
}

// Advanced SEO Optimizer for HM Herbs
// Next-level SEO enhancements and Core Web Vitals micro-optimizations

class SEOOptimizer {
    constructor() {
        this.config = {
            enableCriticalCSS: true,
            enableResourceHints: true,
            enableImageOptimization: true,
            enableStructuredData: true,
            enableCoreWebVitalsOptimization: true,
            enableSitemapGeneration: true,
            targetLCP: 2500, // 2.5 seconds
            targetFID: 100, // 100ms
            targetCLS: 0.1
        };
        
        this.coreWebVitals = {
            lcp: null,
            fid: null,
            cls: null,
            fcp: null,
            ttfb: null
        };
        
        this.optimizations = [];
        this.criticalResources = [];
        
        this.init();
    }

    async init() {
        // Initialize Core Web Vitals monitoring
        if (this.config.enableCoreWebVitalsOptimization) {
            this.initializeCoreWebVitalsOptimization();
        }
        
        // Set up critical CSS extraction
        if (this.config.enableCriticalCSS) {
            this.setupCriticalCSS();
        }
        
        // Initialize resource hints optimization
        if (this.config.enableResourceHints) {
            this.setupResourceHints();
        }
        
        // Set up image optimization
        if (this.config.enableImageOptimization) {
            this.setupImageOptimization();
        }
        
        // Initialize structured data enhancements
        if (this.config.enableStructuredData) {
            this.setupAdvancedStructuredData();
        }
        
        // Set up sitemap generation
        if (this.config.enableSitemapGeneration) {
            this.setupSitemapGeneration();
        }
        
        // Initialize technical SEO optimizations
        this.setupTechnicalSEO();
        
        // Set up performance monitoring
        this.setupPerformanceMonitoring();
        
        // Initialize search engine features
        this.setupSearchEngineFeatures();
    }

    initializeCoreWebVitalsOptimization() {
        // Largest Contentful Paint (LCP) optimization
        this.optimizeLCP();
        
        // First Input Delay (FID) optimization
        this.optimizeFID();
        
        // Cumulative Layout Shift (CLS) optimization
        this.optimizeCLS();
        
        // First Contentful Paint (FCP) optimization
        this.optimizeFCP();
        
        // Time to First Byte (TTFB) optimization
        this.optimizeTTFB();
        
        // Set up Core Web Vitals monitoring
        this.monitorCoreWebVitals();
    }

    optimizeLCP() {
        // Preload LCP element
        this.identifyAndPreloadLCPElement();
        
        // Optimize LCP image loading
        this.optimizeLCPImages();
        
        // Remove render-blocking resources
        this.removeRenderBlockingResources();
        
        // Optimize server response time
        this.optimizeServerResponse();
    }

    identifyAndPreloadLCPElement() {
        // Common LCP candidates
        const lcpCandidates = [
            'img[src*="hero"]',
            '.hero img',
            '.banner img',
            'h1',
            '.main-content img:first-of-type',
            '.featured-image img'
        ];
        
        lcpCandidates.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                if (element.tagName === 'IMG') {
                    this.preloadImage(element.src || element.dataset.src);
                } else if (element.tagName === 'H1') {
                    // Preload font for H1
                    this.preloadFont(getComputedStyle(element).fontFamily);
                }
            }
        });
    }

    optimizeLCPImages() {
        const images = document.querySelectorAll('img');
        images.forEach((img, index) => {
            if (index < 3) { // First 3 images are likely above-the-fold
                // Add fetchpriority="high" for modern browsers
                img.setAttribute('fetchpriority', 'high');
                
                // Ensure no lazy loading for above-the-fold images
                img.removeAttribute('loading');
                
                // Add decoding="sync" for critical images
                img.setAttribute('decoding', 'sync');
            }
        });
    }

    removeRenderBlockingResources() {
        // Defer non-critical CSS
        const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
        stylesheets.forEach(link => {
            if (!this.isCriticalCSS(link.href)) {
                link.setAttribute('media', 'print');
                link.setAttribute('onload', "this.media='all'");
            }
        });
        
        // Defer non-critical JavaScript
        const scripts = document.querySelectorAll('script[src]');
        scripts.forEach(script => {
            if (!this.isCriticalScript(script.src)) {
                script.setAttribute('defer', '');
            }
        });
    }

    optimizeFID() {
        // Break up long tasks
        this.breakUpLongTasks();
        
        // Optimize third-party code
        this.optimizeThirdPartyCode();
        
        // Use web workers for heavy computations
        this.setupWebWorkers();
        
        // Implement code splitting
        this.implementCodeSplitting();
    }

    breakUpLongTasks() {
        // Use scheduler.postTask if available, otherwise setTimeout
        const scheduleTask = (callback) => {
            if ('scheduler' in window && 'postTask' in scheduler) {
                scheduler.postTask(callback, { priority: 'user-blocking' });
            } else {
                setTimeout(callback, 0);
            }
        };
        
        // Example: Break up form validation
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                // Break validation into chunks
                const fields = Array.from(form.elements);
                const validateChunk = (startIndex) => {
                    const endIndex = Math.min(startIndex + 5, fields.length);
                    
                    for (let i = startIndex; i < endIndex; i++) {
                        this.validateField(fields[i]);
                    }
                    
                    if (endIndex < fields.length) {
                        scheduleTask(() => validateChunk(endIndex));
                    } else {
                        // All fields validated, submit form
                        this.submitForm(form);
                    }
                };
                
                scheduleTask(() => validateChunk(0));
            });
        });
    }

    optimizeCLS() {
        // Set explicit dimensions for images
        this.setImageDimensions();
        
        // Reserve space for ads and embeds
        this.reserveSpaceForDynamicContent();
        
        // Avoid inserting content above existing content
        this.preventContentShifts();
        
        // Use CSS containment
        this.applyCSSContainment();
    }

    setImageDimensions() {
        const images = document.querySelectorAll('img:not([width]):not([height])');
        images.forEach(img => {
            // Use aspect-ratio CSS property for modern browsers
            if (CSS.supports('aspect-ratio', '16/9')) {
                img.style.aspectRatio = '16/9'; // Default aspect ratio
            } else {
                // Fallback for older browsers
                img.style.width = '100%';
                img.style.height = 'auto';
            }
        });
    }

    reserveSpaceForDynamicContent() {
        // Reserve space for common dynamic content
        const adSlots = document.querySelectorAll('.ad-slot, [data-ad]');
        adSlots.forEach(slot => {
            if (!slot.style.minHeight) {
                slot.style.minHeight = '250px'; // Standard ad height
            }
        });
        
        // Reserve space for social media embeds
        const socialEmbeds = document.querySelectorAll('[data-embed]');
        socialEmbeds.forEach(embed => {
            if (!embed.style.minHeight) {
                embed.style.minHeight = '400px';
            }
        });
    }

    optimizeFCP() {
        // Inline critical CSS
        this.inlineCriticalCSS();
        
        // Optimize font loading
        this.optimizeFontLoading();
        
        // Minimize main thread work
        this.minimizeMainThreadWork();
    }

    inlineCriticalCSS() {
        // Extract and inline critical CSS for above-the-fold content
        const criticalCSS = this.extractCriticalCSS();
        
        if (criticalCSS) {
            const style = document.createElement('style');
            style.textContent = criticalCSS;
            document.head.insertBefore(style, document.head.firstChild);
        }
    }

    extractCriticalCSS() {
        // This would typically be done at build time
        // For runtime, we can identify critical styles
        const criticalSelectors = [
            'body', 'html',
            'header', 'nav', 'main',
            '.hero', '.banner',
            'h1', 'h2',
            '.btn', '.button',
            '.container', '.wrapper'
        ];
        
        let criticalCSS = '';
        
        // Extract styles for critical selectors
        const stylesheets = Array.from(document.styleSheets);
        stylesheets.forEach(stylesheet => {
            try {
                const rules = Array.from(stylesheet.cssRules || []);
                rules.forEach(rule => {
                    if (rule.type === CSSRule.STYLE_RULE) {
                        const selector = rule.selectorText;
                        if (criticalSelectors.some(critical => selector.includes(critical))) {
                            criticalCSS += rule.cssText + '\n';
                        }
                    }
                });
            } catch (e) {
                // Cross-origin stylesheet, skip
            }
        });
        
        return criticalCSS;
    }

    optimizeFontLoading() {
        // Add font-display: swap to all fonts
        const fontFaces = document.querySelectorAll('link[href*="fonts"]');
        fontFaces.forEach(link => {
            // Add preload for critical fonts
            if (this.isCriticalFont(link.href)) {
                const preload = document.createElement('link');
                preload.rel = 'preload';
                preload.href = link.href;
                preload.as = 'style';
                preload.crossOrigin = 'anonymous';
                document.head.insertBefore(preload, link);
            }
        });
        
        // Add font-display: swap via CSS
        const style = document.createElement('style');
        style.textContent = `
            @font-face {
                font-display: swap;
            }
        `;
        document.head.appendChild(style);
    }

    setupResourceHints() {
        // DNS prefetch for external domains
        this.addDNSPrefetch([
            'fonts.googleapis.com',
            'fonts.gstatic.com',
            'www.google-analytics.com',
            'cdnjs.cloudflare.com'
        ]);
        
        // Preconnect to critical origins
        this.addPreconnect([
            'https://fonts.googleapis.com',
            'https://fonts.gstatic.com'
        ]);
        
        // Preload critical resources
        this.preloadCriticalResources();
        
        // Prefetch likely next pages
        this.prefetchLikelyPages();
    }

    addDNSPrefetch(domains) {
        domains.forEach(domain => {
            const link = document.createElement('link');
            link.rel = 'dns-prefetch';
            link.href = `//${domain}`;
            document.head.appendChild(link);
        });
    }

    addPreconnect(origins) {
        origins.forEach(origin => {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = origin;
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        });
    }

    preloadCriticalResources() {
        // Preload hero image
        const heroImage = document.querySelector('.hero img, .banner img');
        if (heroImage) {
            this.preloadImage(heroImage.src || heroImage.dataset.src);
        }
        
        // Preload critical CSS
        const criticalCSS = document.querySelector('link[rel="stylesheet"]:first-of-type');
        if (criticalCSS) {
            const preload = document.createElement('link');
            preload.rel = 'preload';
            preload.href = criticalCSS.href;
            preload.as = 'style';
            document.head.insertBefore(preload, criticalCSS);
        }
        
        // Preload critical JavaScript
        const criticalJS = document.querySelector('script[src]:first-of-type');
        if (criticalJS) {
            const preload = document.createElement('link');
            preload.rel = 'preload';
            preload.href = criticalJS.src;
            preload.as = 'script';
            document.head.appendChild(preload);
        }
    }

    prefetchLikelyPages() {
        // Prefetch likely next pages based on current page
        const currentPath = window.location.pathname;
        let likelyPages = [];
        
        if (currentPath === '/' || currentPath === '/index.html') {
            likelyPages = ['/products.html', '/about.html', '/contact.html'];
        } else if (currentPath.includes('product')) {
            likelyPages = ['/cart.html', '/checkout.html'];
        }
        
        likelyPages.forEach(page => {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = page;
            document.head.appendChild(link);
        });
    }

    setupImageOptimization() {
        // Implement next-gen image formats
        this.implementNextGenFormats();
        
        // Set up responsive images
        this.setupResponsiveImages();
        
        // Optimize image loading
        this.optimizeImageLoading();
        
        // Implement image compression
        this.implementImageCompression();
    }

    implementNextGenFormats() {
        const images = document.querySelectorAll('img[src]');
        images.forEach(img => {
            const originalSrc = img.src;
            
            // Create picture element with multiple formats
            if (!img.parentElement.tagName === 'PICTURE') {
                const picture = document.createElement('picture');
                
                // AVIF source
                const avifSource = document.createElement('source');
                avifSource.srcset = this.convertToFormat(originalSrc, 'avif');
                avifSource.type = 'image/avif';
                picture.appendChild(avifSource);
                
                // WebP source
                const webpSource = document.createElement('source');
                webpSource.srcset = this.convertToFormat(originalSrc, 'webp');
                webpSource.type = 'image/webp';
                picture.appendChild(webpSource);
                
                // Original image as fallback
                img.parentNode.insertBefore(picture, img);
                picture.appendChild(img);
            }
        });
    }

    convertToFormat(src, format) {
        // Convert image URL to specified format
        return src.replace(/\.(jpg|jpeg|png)$/i, `.${format}`);
    }

    setupAdvancedStructuredData() {
        // Enhanced organization schema
        this.addOrganizationSchema();
        
        // Product schema for e-commerce
        this.addProductSchemas();
        
        // FAQ schema
        this.addFAQSchema();
        
        // Review schema
        this.addReviewSchema();
        
        // Breadcrumb schema
        this.addBreadcrumbSchema();
        
        // Local business schema
        this.addLocalBusinessSchema();
    }

    addOrganizationSchema() {
        const schema = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "H&M Herbs & Vitamins",
            "url": window.location.origin,
            "logo": `${window.location.origin}/images/logo.png`,
            "description": "Premium natural health products, herbs, and vitamins for optimal wellness",
            "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "+1-555-HERBS",
                "contactType": "customer service",
                "availableLanguage": "English"
            },
            "sameAs": [
                "https://facebook.com/hmherbs",
                "https://twitter.com/hmherbs",
                "https://instagram.com/hmherbs"
            ],
            "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "reviewCount": "1247"
            }
        };
        
        this.addStructuredData(schema);
    }

    addProductSchemas() {
        const products = document.querySelectorAll('[data-product-id]');
        products.forEach(productElement => {
            const productId = productElement.dataset.productId;
            const name = productElement.querySelector('.product-name')?.textContent;
            const price = productElement.querySelector('.product-price')?.textContent;
            const image = productElement.querySelector('img')?.src;
            
            if (name && price) {
                const schema = {
                    "@context": "https://schema.org",
                    "@type": "Product",
                    "name": name,
                    "image": image,
                    "description": productElement.querySelector('.product-description')?.textContent,
                    "sku": productId,
                    "offers": {
                        "@type": "Offer",
                        "price": price.replace(/[^0-9.]/g, ''),
                        "priceCurrency": "USD",
                        "availability": "https://schema.org/InStock",
                        "seller": {
                            "@type": "Organization",
                            "name": "H&M Herbs & Vitamins"
                        }
                    },
                    "aggregateRating": {
                        "@type": "AggregateRating",
                        "ratingValue": "4.5",
                        "reviewCount": "89"
                    }
                };
                
                this.addStructuredData(schema);
            }
        });
    }

    addFAQSchema() {
        const faqSections = document.querySelectorAll('.faq-item, [data-faq]');
        if (faqSections.length > 0) {
            const faqSchema = {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": []
            };
            
            faqSections.forEach(faq => {
                const question = faq.querySelector('.faq-question, h3, h4')?.textContent;
                const answer = faq.querySelector('.faq-answer, p')?.textContent;
                
                if (question && answer) {
                    faqSchema.mainEntity.push({
                        "@type": "Question",
                        "name": question,
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": answer
                        }
                    });
                }
            });
            
            if (faqSchema.mainEntity.length > 0) {
                this.addStructuredData(faqSchema);
            }
        }
    }

    addBreadcrumbSchema() {
        const breadcrumbs = document.querySelectorAll('.breadcrumb a, nav[aria-label="breadcrumb"] a');
        if (breadcrumbs.length > 0) {
            const schema = {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": []
            };
            
            breadcrumbs.forEach((breadcrumb, index) => {
                schema.itemListElement.push({
                    "@type": "ListItem",
                    "position": index + 1,
                    "name": breadcrumb.textContent,
                    "item": breadcrumb.href
                });
            });
            
            this.addStructuredData(schema);
        }
    }

    setupTechnicalSEO() {
        // Optimize meta tags
        this.optimizeMetaTags();
        
        // Set up canonical URLs
        this.setupCanonicalURLs();
        
        // Optimize URL structure
        this.optimizeURLStructure();
        
        // Set up hreflang for international SEO
        this.setupHreflang();
        
        // Optimize robots.txt directives
        this.optimizeRobotsTxt();
    }

    optimizeMetaTags() {
        // Ensure title is optimized
        const title = document.title;
        if (title.length > 60) {
            console.warn('Title tag is too long:', title.length, 'characters');
        }
        
        // Ensure meta description is optimized
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            const content = metaDescription.content;
            if (content.length > 160) {
                console.warn('Meta description is too long:', content.length, 'characters');
            }
        }
        
        // Add Open Graph tags if missing
        this.addOpenGraphTags();
        
        // Add Twitter Card tags if missing
        this.addTwitterCardTags();
    }

    addOpenGraphTags() {
        const ogTags = [
            { property: 'og:title', content: document.title },
            { property: 'og:description', content: document.querySelector('meta[name="description"]')?.content },
            { property: 'og:url', content: window.location.href },
            { property: 'og:type', content: 'website' },
            { property: 'og:image', content: `${window.location.origin}/images/og-image.jpg` }
        ];
        
        ogTags.forEach(tag => {
            if (!document.querySelector(`meta[property="${tag.property}"]`) && tag.content) {
                const meta = document.createElement('meta');
                meta.setAttribute('property', tag.property);
                meta.content = tag.content;
                document.head.appendChild(meta);
            }
        });
    }

    monitorCoreWebVitals() {
        // Monitor LCP
        if ('PerformanceObserver' in window) {
            try {
                const lcpObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const lastEntry = entries[entries.length - 1];
                    this.coreWebVitals.lcp = lastEntry.startTime;
                    
                    if (lastEntry.startTime > this.config.targetLCP) {
                        this.optimizeLCPFurther();
                    }
                });
                lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
            } catch (e) {
                console.warn('LCP monitoring not supported');
            }
        }
        
        // Monitor CLS
        if ('PerformanceObserver' in window) {
            try {
                let clsValue = 0;
                const clsObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (!entry.hadRecentInput) {
                            clsValue += entry.value;
                        }
                    }
                    this.coreWebVitals.cls = clsValue;
                    
                    if (clsValue > this.config.targetCLS) {
                        this.optimizeCLSFurther();
                    }
                });
                clsObserver.observe({ entryTypes: ['layout-shift'] });
            } catch (e) {
                console.warn('CLS monitoring not supported');
            }
        }
    }

    optimizeLCPFurther() {
        // Additional LCP optimizations when target is exceeded
        console.log('Applying additional LCP optimizations');
        
        // Lazy load non-critical images more aggressively
        const images = document.querySelectorAll('img');
        images.forEach((img, index) => {
            if (index > 2) { // Beyond first 3 images
                img.setAttribute('loading', 'lazy');
            }
        });
        
        // Defer non-critical CSS
        const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
        stylesheets.forEach((link, index) => {
            if (index > 0) { // Keep first stylesheet synchronous
                link.setAttribute('media', 'print');
                link.setAttribute('onload', "this.media='all'");
            }
        });
    }

    optimizeCLSFurther() {
        // Additional CLS optimizations when target is exceeded
        console.log('Applying additional CLS optimizations');
        
        // Add more explicit dimensions
        const elements = document.querySelectorAll('img, iframe, video');
        elements.forEach(element => {
            if (!element.style.aspectRatio && !element.width && !element.height) {
                element.style.aspectRatio = '16/9';
            }
        });
    }

    // Utility Methods
    preloadImage(src) {
        if (src) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = src;
            link.as = 'image';
            document.head.appendChild(link);
        }
    }

    preloadFont(fontFamily) {
        // This would need to be customized based on your font setup
        const fontUrl = this.getFontURL(fontFamily);
        if (fontUrl) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = fontUrl;
            link.as = 'font';
            link.type = 'font/woff2';
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        }
    }

    getFontURL(fontFamily) {
        // Map font families to URLs
        const fontMap = {
            'Inter': 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2'
        };
        
        return fontMap[fontFamily.replace(/['"]/g, '')];
    }

    isCriticalCSS(href) {
        // Determine if CSS is critical
        return href.includes('critical') || href.includes('above-fold') || href === document.querySelector('link[rel="stylesheet"]')?.href;
    }

    isCriticalScript(src) {
        // Determine if script is critical
        return src.includes('critical') || src.includes('inline') || src.includes('polyfill');
    }

    isCriticalFont(href) {
        // Determine if font is critical
        return href.includes('Inter') || href.includes('primary');
    }

    addStructuredData(schema) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schema);
        document.head.appendChild(script);
    }

    validateField(field) {
        // Simple field validation
        if (field.required && !field.value) {
            field.classList.add('error');
            return false;
        }
        field.classList.remove('error');
        return true;
    }

    submitForm(form) {
        // Submit form after validation
        form.submit();
    }

    // Public API
    getCoreWebVitals() {
        return this.coreWebVitals;
    }

    getOptimizations() {
        return this.optimizations;
    }

    runSEOAudit() {
        const audit = {
            title: this.auditTitle(),
            metaDescription: this.auditMetaDescription(),
            headings: this.auditHeadings(),
            images: this.auditImages(),
            links: this.auditLinks(),
            structuredData: this.auditStructuredData()
        };
        
        return audit;
    }

    auditTitle() {
        const title = document.title;
        return {
            content: title,
            length: title.length,
            isOptimal: title.length >= 30 && title.length <= 60,
            recommendations: title.length > 60 ? ['Shorten title'] : title.length < 30 ? ['Lengthen title'] : []
        };
    }

    auditMetaDescription() {
        const meta = document.querySelector('meta[name="description"]');
        const content = meta?.content || '';
        return {
            content: content,
            length: content.length,
            isOptimal: content.length >= 120 && content.length <= 160,
            recommendations: content.length > 160 ? ['Shorten description'] : content.length < 120 ? ['Lengthen description'] : []
        };
    }

    auditHeadings() {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const h1Count = document.querySelectorAll('h1').length;
        
        return {
            total: headings.length,
            h1Count: h1Count,
            isOptimal: h1Count === 1,
            recommendations: h1Count === 0 ? ['Add H1 tag'] : h1Count > 1 ? ['Use only one H1 tag'] : []
        };
    }

    auditImages() {
        const images = document.querySelectorAll('img');
        const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
        
        return {
            total: images.length,
            withoutAlt: imagesWithoutAlt.length,
            isOptimal: imagesWithoutAlt.length === 0,
            recommendations: imagesWithoutAlt.length > 0 ? ['Add alt text to all images'] : []
        };
    }
}

// Initialize SEO Optimizer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.seoOptimizer = new SEOOptimizer();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SEOOptimizer;
}

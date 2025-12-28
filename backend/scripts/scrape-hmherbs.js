// HM Herbs Website Scraper
// Automatically extracts all products from hmherbs.com

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class HMHerbsScraper {
    constructor(progressCallback = null) {
        this.baseUrl = 'https://hmherbs.com';
        this.products = [];
        this.categories = new Set();
        this.brands = new Set();
        this.scrapedUrls = new Set();
        this.productMetadata = new Map(); // Store { url: { category, brand } }
        this.progressCallback = progressCallback; // Callback function for progress updates
        this.createdAt = Date.now(); // Track when scraper was created
        // Statistics tracking for report
        this.stats = {
            startTime: new Date(),
            endTime: null,
            pagesScanned: 0,
            productsFound: 0,
            productsWithPrices: 0,
            productsWithImages: 0,
            categoriesFound: 0,
            brandsFound: 0,
            errors: [],
            duplicatesSkipped: 0,
            urlsScraped: 0
        };

        // Headers to mimic a real browser
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        };
    }

    getReport() {
        const duration = this.stats.endTime
            ? Math.round((this.stats.endTime - this.stats.startTime) / 1000)
            : Math.round((new Date() - this.stats.startTime) / 1000);

        return {
            ...this.stats,
            duration: duration,
            durationFormatted: `${Math.floor(duration / 60)}m ${duration % 60}s`,
            totalProducts: this.products.length,
            categoriesList: Array.from(this.categories),
            brandsList: Array.from(this.brands),
            successRate: this.stats.urlsScraped > 0
                ? Math.round(((this.stats.urlsScraped - this.stats.errors.length) / this.stats.urlsScraped) * 100)
                : 100
        };
    }

    // Helper method to send progress updates
    sendProgress(progressData) {
        if (this.progressCallback) {
            try {
                // Handle both old format (stage, current, total, message) and new format (object)
                let progress;
                if (typeof progressData === 'string') {
                    // Old format - convert to new format
                    const args = Array.from(arguments);
                    progress = {
                        stage: args[0] || 'unknown',
                        current: args[1] || 0,
                        total: args[2] || 100,
                        percentage: args[2] > 0 ? Math.round((args[1] / args[2]) * 100) : 0,
                        message: args[3] || '',
                        productsFound: this.products.length
                    };
                } else {
                    // New format - ensure all fields are present
                    progress = {
                        stage: progressData.stage || 'unknown',
                        current: progressData.current || 0,
                        total: progressData.total || 100,
                        percentage: progressData.percentage !== undefined ? progressData.percentage : (progressData.total > 0 ? Math.round((progressData.current / progressData.total) * 100) : 0),
                        message: progressData.message || '',
                        productsFound: progressData.productsFound !== undefined ? progressData.productsFound : this.products.length
                    };
                }
                this.progressCallback(progress);
            } catch (error) {
                // Don't stop scraping on progress callback errors - just log them
                console.warn('Error in progress callback (non-fatal):', error.message);
            }
        }
    }

    async scrapeAllProducts() {
        console.log('🌿 Starting HM Herbs website scraping...');
        this.sendProgress({
            stage: 'initializing',
            current: 1,
            total: 100,
            percentage: 1,
            message: 'Initializing and scanning website structure...',
            productsFound: 0
        });

        try {
            // Start with the main page to find category links
            this.sendProgress({
                stage: 'scraping_main',
                current: 5,
                total: 100,
                percentage: 5,
                message: 'Scanning main page for product links...',
                productsFound: this.products.length
            });
            await this.scrapePage(this.baseUrl);

            // Look for product category pages
            this.sendProgress({
                stage: 'finding_categories',
                current: 10,
                total: 100,
                percentage: 10,
                message: 'Scanning category pages and collecting product links...',
                productsFound: this.products.length
            });
            await this.findCategoryPages();

            // Scrape individual product pages (progress updates handled in scrapeFoundProductLinks)
            this.sendProgress({
                stage: 'scraping_products',
                current: 0,
                total: 100,
                percentage: 40,
                message: 'Starting to scrape product pages...',
                productsFound: this.products.length
            });
            // Note: scrapeProductPages is a fallback, findCategoryPages already calls scrapeFoundProductLinks
            // But we'll keep this for compatibility
            await this.scrapeProductPages();

            // Save results
            this.sendProgress({
                stage: 'saving',
                current: 4,
                total: 5,
                percentage: 90,
                message: 'Saving results...',
                productsFound: this.products.length
            });
            await this.saveResults();

            // Update final statistics
            this.stats.endTime = new Date();
            this.stats.productsFound = this.products.length;
            this.stats.productsWithPrices = this.products.filter(p => p.price && p.price > 0).length;
            this.stats.productsWithImages = this.products.filter(p => p.images && p.images.length > 0).length;
            this.stats.categoriesFound = this.categories.size;
            this.stats.brandsFound = this.brands.size;

            this.sendProgress({
                stage: 'complete',
                current: 5,
                total: 5,
                percentage: 100,
                message: `Scraping complete! Found ${this.products.length} products`,
                productsFound: this.products.length,
                report: this.getReport()
            });
            console.log(`✅ Scraping complete! Found ${this.products.length} products`);
            console.log(`📊 Categories: ${this.categories.size}`);
            console.log(`🏷️ Brands: ${this.brands.size}`);

        } catch (error) {
            console.error('❌ Scraping failed:', error);
            this.sendProgress({
                stage: 'error',
                current: 0,
                total: 0,
                percentage: 0,
                message: `Error: ${error.message}`,
                productsFound: this.products.length
            });
            throw error;
        }
    }

    async scrapePage(url, context = {}) {
        try {
            console.log(`🔍 Scraping: ${url}`);

            const response = await axios.get(url, {
                headers: this.headers,
                timeout: 30000 // Increased timeout to 30s
            });

            const $ = cheerio.load(response.data);

            // Look for product links
            const productLinks = this.extractProductLinks($);

            // Look for category links
            const categoryLinks = this.extractCategoryLinks($);

            // Tag all product links on this page with the context (category/brand)
            productLinks.forEach(link => {
                if (!this.productMetadata.has(link)) {
                    this.productMetadata.set(link, {});
                }
                const meta = this.productMetadata.get(link);
                if (context.category) meta.category = context.category;
                if (context.brand) meta.brand = context.brand;
            });

            // Track pages scanned
            this.stats.pagesScanned++;
            this.stats.urlsScraped++;

            // If this is a product page, extract product details
            // NOTE: extractProductDetails() already validates and returns null for invalid products
            if (this.isProductPage($)) {
                // Check if we've already scraped this URL to avoid duplicates
                if (this.scrapedUrls.has(url)) {
                    this.stats.duplicatesSkipped++;
                    console.log(`⏭️ Skipping already scraped URL: ${url}`);
                    return { productLinks, categoryLinks };
                }

                const product = this.extractProductDetails($, url);
                // extractProductDetails() returns null for invalid products (Shop, Featured Products, etc.)
                if (product && product.name) {
                    // Apply metadata from context or map
                    const meta = this.productMetadata.get(url) || {};
                    if (context.category) product.category = context.category;
                    else if (meta.category && (!product.category || product.category === 'General')) product.category = meta.category;

                    if (context.brand) product.brand = context.brand;
                    else if (meta.brand && (!product.brand || product.brand === 'Unknown')) product.brand = meta.brand;

                    // Double-check validation
                    const invalidNames = ['shop', 'featured products', 'products', 'home', 'categories', 'store', 'browse', 'catalog', 'all products', 'product catalog'];
                    const productNameLower = (product.name || '').toLowerCase().trim();

                    if (!productNameLower || productNameLower.length < 5 || invalidNames.includes(productNameLower)) {
                        // Don't log every invalid product - too noisy
                        // Only log occasionally
                        if (this.stats.duplicatesSkipped % 10 === 0) {
                            console.log(`⏭️ Skipping invalid product name: "${product.name}"`);
                        }
                        this.stats.duplicatesSkipped++;
                        return { productLinks, categoryLinks };
                    }

                    // Check for duplicate products by URL or SKU
                    const isDuplicate = this.products.some(p =>
                        p.url === product.url ||
                        (product.sku && p.sku === product.sku)
                    );

                    if (!isDuplicate) {
                        this.products.push(product);
                        this.scrapedUrls.add(url);

                        // Track categories and brands
                        if (product.category) {
                            this.categories.add(product.category);
                        }
                        if (product.brand) {
                            this.brands.add(product.brand);
                        }

                        console.log(`📦 Found product: ${product.name}`);
                    } else {
                        this.stats.duplicatesSkipped++;
                        console.log(`⏭️ Skipping duplicate product: ${product.name || product.url}`);
                    }
                } else if (!product) {
                    // extractProductDetails returned null - this is expected for category pages that pass isProductPage check
                    console.log(`⏭️ extractProductDetails returned null for ${url} - likely a category/listing page`);
                }
            }

            return { productLinks, categoryLinks };

        } catch (error) {
            console.error(`❌ Error scraping ${url}:`, error.message);
            this.stats.errors.push({
                url: url,
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return { productLinks: [], categoryLinks: [] };
        }
    }

    extractProductLinks($) {
        const links = [];

        // Common selectors for product links - updated for actual website structure
        const selectors = [
            'a[href*="/index.php/products/"]',
            'a[href*="/products/"]',
            'a[href*="/product"]',
            'a[href*="/item"]',
            'a[href*="/p/"]',
            '.product-link',
            '.product-item a',
            '.product-card a',
            '.product-title a',
            'h2 a',
            'h3 a'
        ];

        selectors.forEach(selector => {
            $(selector).each((i, el) => {
                const href = $(el).attr('href');
                if (href) {
                    const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
                    links.push(fullUrl);
                }
            });
        });

        return [...new Set(links)]; // Remove duplicates
    }

    extractCategoryLinks($) {
        const links = [];

        // Common selectors for category links
        const selectors = [
            'a[href*="/category"]',
            'a[href*="/categories"]',
            'a[href*="/shop"]',
            '.category-link',
            '.nav-link',
            '.menu-item a'
        ];

        selectors.forEach(selector => {
            $(selector).each((i, el) => {
                const href = $(el).attr('href');
                if (href && !href.includes('#')) {
                    const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
                    links.push(fullUrl);
                }
            });
        });

        return [...new Set(links)]; // Remove duplicates
    }

    isProductPage($) {
        // Check if this is a product page - MUST be strict to avoid matching category pages
        // Category pages have h1 tags too (like "Shop", "Featured Products"), so we need stronger indicators

        // FIRST: Check for category/listing page indicators - if found, definitely NOT a product page
        const hasMultipleProductLinks = $('a[href*="/index.php/products/"]').length > 5; // Category pages have many product links
        const hasProductGrid = $('.product-grid, .products-grid, .product-list').length > 0;
        const hasPagination = $('.pagination, .ccm_paging_p').length > 0;
        const h1Text = $('h1').first().text().trim().toLowerCase();
        const categoryKeywords = ['shop', 'featured products', 'products', 'all products', 'browse', 'catalog', 'our father\'s healing herbs'];
        const isCategoryTitle = categoryKeywords.some(keyword => h1Text === keyword || h1Text.startsWith(keyword + ' '));

        // If it looks like a category/listing page, return false immediately
        if (hasMultipleProductLinks || (hasProductGrid && hasPagination) || (isCategoryTitle && !$('h1').text().includes('SKU:'))) {
            return false;
        }

        // Strong indicators (require at least one of these):
        const strongIndicators = [
            $('h1').length > 0 && $('h1').text().includes('SKU:'), // Product pages have h1 with SKU
            $('.product-details').length > 0,
            $('.product-info').length > 0,
            $('meta[property="og:type"]').attr('content') === 'product',
            $('[itemtype*="Product"]').length > 0, // Schema.org Product markup
            $('script[type="application/ld+json"]').text().includes('"@type":"Product"') // JSON-LD Product
        ];

        // Weak indicators (need multiple):
        const weakIndicators = [
            $('.product-price').length > 0,
            $('.add-to-cart, button[data-product-id]').length > 0,
            $('.product-description').length > 0,
            $('body').text().includes('Add to Cart'),
            $('body').text().match(/\$\d+\.\d{2}/) // Has formatted price like $25.00
        ];

        // Must have strong indicator OR (multiple weak indicators)
        const hasStrongIndicator = strongIndicators.some(ind => ind);
        const weakCount = weakIndicators.filter(ind => ind).length;
        const hasMultipleWeak = weakCount >= 3;

        return hasStrongIndicator || hasMultipleWeak;
    }

    extractProductDetails($, url) {
        try {
            // Extract SKU first - check if it's in h1 text (e.g., "PRODUCT NAME SKU: 12414")
            let sku = this.extractSKU($);
            if (!sku) {
                sku = this.extractText($, [
                    '.product-sku',
                    '.sku',
                    '[data-sku]',
                    '.product-code'
                ]) || this.generateSKU(url);
            }

            // Extract product name - remove SKU from h1 if present
            let name = this.extractProductName($);
            if (!name) {
                name = this.extractText($, [
                    '.product-title',
                    '.product-name',
                    'h1.title',
                    'h1',
                    '.product-details h1',
                    '.product-info h1'
                ]);
            }

            // Extract product information using various selectors
            const product = {
                url: url,
                sku: sku,
                name: name,

                price: this.extractPrice($, url),

                description: this.extractDescription($),

                shortDescription: this.extractShortDescription($),

                brand: this.extractBrand($, name),

                category: this.extractCategory($, url),

                images: this.extractImages($),

                inStock: this.checkStock($),
                inventoryQuantity: this.extractStockQuantity($),

                weight: this.extractWeight($),

                ingredients: this.extractText($, [
                    '.ingredients',
                    '.product-ingredients',
                    '.supplement-facts'
                ])
            };

            // Clean up the product data
            product.name = this.cleanText(product.name);
            product.description = this.cleanText(product.description);
            product.shortDescription = this.cleanText(product.shortDescription);

            // VALIDATE product name BEFORE returning - filter out invalid names
            if (product.name) {
                const invalidNames = ['shop', 'featured products', 'products', 'home', 'categories', 'store', 'browse', 'catalog', 'all products', 'product catalog'];
                const productNameLower = product.name.toLowerCase().trim();

                // Check if name is invalid - this is a final safety check
                if (invalidNames.includes(productNameLower)) {
                    console.log(`⏭️ Final validation: Skipping invalid product name: "${product.name}"`);
                    return null; // Don't return invalid products
                }

                // Also check length - must be at least 5 characters
                if (productNameLower.length < 5) {
                    console.log(`⏭️ Final validation: Skipping product name (too short): "${product.name}"`);
                    return null;
                }
            }

            // Categorize by health conditions
            product.healthCategories = this.categorizeByHealth(product.name, product.description);

            // Add to our sets for tracking
            if (product.brand) this.brands.add(product.brand);
            if (product.category) this.categories.add(product.category);

            return product.name ? product : null;

        } catch (error) {
            console.error(`❌ Error extracting product from ${url}:`, error.message);
            return null;
        }
    }

    extractText($, selectors) {
        for (const selector of selectors) {
            const text = $(selector).first().text().trim();
            if (text) return text;
        }
        return '';
    }

    extractSKU($) {
        // First try to extract SKU from h1 text (e.g., "PRODUCT NAME SKU: 12414")
        const h1Text = $('h1').first().text().trim();
        if (h1Text) {
            // Look for "SKU: 12414" pattern
            const skuMatch = h1Text.match(/SKU:\s*([A-Za-z0-9\-]+)/i);
            if (skuMatch && skuMatch[1]) {
                return skuMatch[1].trim();
            }
        }

        // Try other SKU selectors
        const skuSelectors = [
            '.product-sku',
            '.sku',
            '[data-sku]',
            '.product-code',
            'meta[property="product:retailer_item_id"]',
            'meta[name="sku"]'
        ];

        for (const selector of skuSelectors) {
            const text = $(selector).first().text().trim() || $(selector).first().attr('content');
            if (text) {
                // Clean up SKU text
                const cleaned = text.replace(/SKU:\s*/i, '').trim();
                if (cleaned) return cleaned;
            }
        }

        return null;
    }

    extractProductName($) {
        // Get h1 text and remove SKU if present
        const h1Text = $('h1').first().text().trim();
        if (h1Text) {
            // Remove SKU pattern from name (e.g., "PRODUCT NAME SKU: 12414" -> "PRODUCT NAME")
            const nameWithoutSKU = h1Text.replace(/\s*SKU:\s*[A-Za-z0-9\-]+/i, '').trim();
            if (nameWithoutSKU && nameWithoutSKU.length > 0) {
                return nameWithoutSKU;
            }
        }

        // Fallback to other selectors
        const nameSelectors = [
            '.product-title',
            '.product-name',
            'h1.title',
            '.product-details h1',
            '.product-info h1',
            'meta[property="og:title"]',
            'meta[name="title"]'
        ];

        for (const selector of nameSelectors) {
            const text = $(selector).first().text().trim() || $(selector).first().attr('content');
            if (text) {
                // Remove SKU if present
                const cleaned = text.replace(/\s*SKU:\s*[A-Za-z0-9\-]+/i, '').trim();
                if (cleaned && cleaned.length > 0) {
                    return cleaned;
                }
            }
        }

        return null;
    }

    extractPrice($, url) {
        // Targeted search within the product form to avoid marquee/header prices
        const productForm = $('form.store-product, .product-details, .product-info').first();
        const searchArea = productForm.length > 0 ? productForm : $('body');

        // Try structured data first (JSON-LD) - most reliable
        const jsonLdScripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < jsonLdScripts.length; i++) {
            try {
                const jsonData = JSON.parse($(jsonLdScripts[i]).html());
                const products = Array.isArray(jsonData) ? jsonData : (jsonData['@graph'] || [jsonData]);

                for (const item of products) {
                    if (item['@type'] === 'Product' || item['@type'] === 'http://schema.org/Product' || item['@type'] === 'https://schema.org/Product') {
                        if (item.offers) {
                            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
                            for (const offer of offers) {
                                if (offer.price) {
                                    const price = parseFloat(offer.price);
                                    if (!isNaN(price) && price > 0 && price <= 10000) {
                                        return price;
                                    }
                                }
                            }
                        }
                        if (item.price) {
                            const price = parseFloat(item.price);
                            if (!isNaN(price) && price > 0 && price <= 10000) {
                                return price;
                            }
                        }
                    }
                }
            } catch (e) { }
        }

        // Try meta tags
        const metaPrice = $('meta[property="product:price:amount"]').attr('content') ||
            $('meta[property="og:price:amount"]').attr('content') ||
            $('meta[name="price"]').attr('content') ||
            $('meta[itemprop="price"]').attr('content');
        if (metaPrice) {
            const price = parseFloat(metaPrice);
            if (!isNaN(price) && price > 0 && price <= 10000) {
                return price;
            }
        }

        // Try specific attributes in searchArea
        const dataPrice = searchArea.find('[data-price]').first().attr('data-price') ||
            searchArea.find('[data-product-price]').first().attr('data-product-price') ||
            searchArea.find('[data-cost]').first().attr('data-cost');

        if (dataPrice) {
            const price = parseFloat(dataPrice);
            if (!isNaN(price) && price > 0 && price <= 10000) {
                return price;
            }
        }

        // Try CSS selectors within searchArea
        const priceSelectors = [
            '.store-product-price',
            '.product-price',
            '.price',
            '.current-price',
            '.sale-price',
            '.amount',
            '.ccm-block-product-price',
            'span.price',
            'div.price'
        ];

        for (const selector of priceSelectors) {
            const elements = searchArea.find(selector);
            for (let j = 0; j < elements.length; j++) {
                const text = $(elements[j]).text().trim();
                if (text) {
                    const priceMatch = text.match(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/) ||
                        text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
                    if (priceMatch) {
                        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                        if (!isNaN(price) && price >= 0.01 && price <= 10000) {
                            return price;
                        }
                    }
                }
            }
        }

        // Fallback: search searchArea text for price pattern
        const areaText = searchArea.text();
        const priceMatch = areaText.match(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
        if (priceMatch) {
            const price = parseFloat(priceMatch[1].replace(/,/g, ''));
            if (!isNaN(price) && price >= 0.01 && price <= 10000) {
                return price;
            }
        }

        return 0;
    }

    extractDescription($) {
        // Try structured data first (JSON-LD)
        const jsonLdScripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < jsonLdScripts.length; i++) {
            try {
                const jsonData = JSON.parse($(jsonLdScripts[i]).html());
                const products = Array.isArray(jsonData) ? jsonData : (jsonData['@graph'] || [jsonData]);
                for (const item of products) {
                    if (item['@type'] === 'Product' || item['@type'] === 'http://schema.org/Product') {
                        if (item.description) {
                            const desc = this.cleanText(item.description);
                            if (desc && desc.length > 50) {
                                return desc;
                            }
                        }
                    }
                }
            } catch (e) {
                // Continue if JSON parsing fails
            }
        }

        // Try meta tags
        const metaDescription = $('meta[property="og:description"]').attr('content') ||
            $('meta[name="description"]').attr('content') ||
            $('meta[property="product:description"]').attr('content');
        if (metaDescription) {
            const desc = this.cleanText(metaDescription);
            if (desc && desc.length > 50) {
                return desc;
            }
        }

        // Enhanced: Look for "Product Description" heading and get content after it
        const productDescHeading = $('h2, h3, h4, .product-description-title').filter((i, el) => {
            const text = $(el).text().trim().toLowerCase();
            return text.includes('product description') || text.includes('description');
        }).first();

        if (productDescHeading.length) {
            let description = '';
            // Get all content after the heading until next major section
            productDescHeading.nextAll('p, div, section, ul, ol').each((i, el) => {
                // Stop if we hit another heading or certain elements
                const tagName = $(el).prop('tagName');
                if (tagName && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName)) {
                    return false; // Stop at next heading
                }

                const text = $(el).text().trim();
                // Skip if it looks like price, button, or navigation
                if (text &&
                    text.length > 20 &&
                    !text.includes('$') &&
                    !text.match(/^(add to cart|buy now|add|cart|disclaimer|welcome|note)$/i) &&
                    !text.match(/^(home|shop|products|categories|visit us|get in touch)$/i)) {
                    description += text + ' ';
                    // Stop after collecting enough content (around 5000 characters)
                    if (description.length > 5000) return false;
                }
            });
            if (description.trim().length > 50) {
                return this.cleanText(description.trim());
            }
        }

        // Try multiple description selectors
        const descriptionSelectors = [
            '.product-description',
            '.description',
            '.product-details .description',
            '.product-info .description',
            '.product-content',
            '.product-text',
            '.product-long-description',
            '[itemprop="description"]',
            '.entry-content',
            '.product-details',
            '.product-info',
            '.woocommerce-product-details__short-description',
            '.product-summary + .product-description',
            '.product-tabs .description',
            '#product-description',
            '.product-full-description',
            'main p', // All paragraphs in main content
            '.content p'
        ];

        let fullDescription = '';

        for (const selector of descriptionSelectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                // If it's a container, get all text
                let text = '';
                elements.each((i, el) => {
                    const elText = $(el).text().trim();
                    if (elText && elText.length > 20 && !elText.includes('$')) {
                        text += elText + ' ';
                    }
                });
                if (text && text.length > fullDescription.length) {
                    fullDescription = text;
                }
            }
        }

        // If we found a description, use it
        if (fullDescription && fullDescription.length > 50) {
            return this.cleanText(fullDescription);
        }

        // Fallback: collect paragraphs after product name/price
        const h1 = $('h1').first();
        if (h1.length) {
            let description = '';
            let foundPrice = false;
            h1.nextAll('p, div, section').each((i, el) => {
                const text = $(el).text().trim();

                // Mark when we've passed the price
                if (text.includes('$') || text.match(/\$\s*\d/)) {
                    foundPrice = true;
                    return; // Skip price line
                }

                // Only collect text after price
                if (foundPrice && text &&
                    text.length > 20 &&
                    !text.includes('$') &&
                    !text.match(/^(add to cart|buy now|add|cart|disclaimer|welcome|note)$/i) &&
                    !text.match(/^(home|shop|products|categories)$/i)) {
                    description += text + ' ';
                    // Stop after collecting enough content (around 5000 characters)
                    if (description.length > 5000) return false;
                }
            });
            if (description.trim().length > 50) {
                return this.cleanText(description.trim());
            }
        }

        // Last resort: get all text content from main content area
        const mainContent = $('main, .main-content, .content, #content, .product-page').first();
        if (mainContent.length) {
            let description = '';
            mainContent.find('p, li').each((i, el) => {
                const text = $(el).text().trim();
                if (text &&
                    text.length > 30 &&
                    !text.includes('$') &&
                    !text.match(/^(add to cart|buy now|home|shop|disclaimer|welcome|note)$/i)) {
                    description += text + ' ';
                    if (description.length > 5000) return false;
                }
            });
            if (description.trim().length > 50) {
                return this.cleanText(description.trim());
            }
        }

        return '';
    }

    extractShortDescription($) {
        // Try structured data
        const jsonLdScripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < jsonLdScripts.length; i++) {
            try {
                const jsonData = JSON.parse($(jsonLdScripts[i]).html());
                const products = Array.isArray(jsonData) ? jsonData : (jsonData['@graph'] || [jsonData]);
                for (const item of products) {
                    if (item['@type'] === 'Product' || item['@type'] === 'http://schema.org/Product') {
                        if (item.description) {
                            const desc = this.cleanText(item.description);
                            // Use first 200 characters as short description if available
                            if (desc && desc.length > 20) {
                                return desc.substring(0, 200).trim();
                            }
                        }
                    }
                }
            } catch (e) {
                // Continue if JSON parsing fails
            }
        }

        // Try meta description tag
        const metaDescription = $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content');
        if (metaDescription) {
            const desc = this.cleanText(metaDescription);
            if (desc && desc.length > 10 && desc.length < 300) {
                return desc;
            }
        }

        // Try short description selectors
        const shortDescriptionSelectors = [
            '.product-summary',
            '.short-description',
            '.product-excerpt',
            '.product-intro',
            '.product-brief',
            '.product-short-desc',
            '[itemprop="description"]',
            '.woocommerce-product-details__short-description',
            '.product-summary p'
        ];

        for (const selector of shortDescriptionSelectors) {
            const text = $(selector).first().text().trim();
            if (text && text.length > 10 && text.length < 500) {
                return this.cleanText(text);
            }
        }

        // Enhanced: Look for paragraph after price (common structure on hmherbs.com)
        // Find price element first
        const priceElement = $('.price, .product-price, [itemprop="price"], h1 + *').filter((i, el) => {
            const text = $(el).text().trim();
            return text.includes('$') || text.match(/\$\s*\d/);
        }).first();

        if (priceElement.length) {
            // Get the next paragraph after price
            const nextP = priceElement.nextAll('p').first().text().trim();
            if (nextP && nextP.length > 10 && nextP.length < 500 && !nextP.includes('$')) {
                return this.cleanText(nextP);
            }
        }

        // Fallback: use first paragraph after product name/price
        const h1 = $('h1').first();
        if (h1.length) {
            // Skip price and get first descriptive paragraph
            let foundDesc = '';
            h1.nextAll('p, div').each((i, el) => {
                if (foundDesc) return false; // Stop if we found one
                const text = $(el).text().trim();
                // Skip if it's price, button text, or too short
                if (text &&
                    text.length > 10 &&
                    text.length < 500 &&
                    !text.includes('$') &&
                    !text.match(/^(add to cart|buy now|add|cart|out of stock|in stock)$/i)) {
                    foundDesc = this.cleanText(text);
                    return false; // Stop iteration
                }
            });
            if (foundDesc) {
                return foundDesc;
            }
        }

        // Use first sentence of full description if available
        const fullDesc = this.extractDescription($);
        if (fullDesc) {
            const firstSentence = fullDesc.split(/[.!?]/)[0];
            if (firstSentence && firstSentence.length > 10 && firstSentence.length < 300) {
                return this.cleanText(firstSentence);
            }
            // If no sentence break, use first 200 chars
            if (fullDesc.length > 10) {
                return this.cleanText(fullDesc.substring(0, 200).trim());
            }
        }

        return '';
    }

    extractImages($) {
        const images = [];
        const imageUrls = new Set(); // Track unique URLs to avoid duplicates

        // Search area restricted to product gallery/form to avoid header/footer images
        const productArea = $('.splide, .store-product-block, .product-details, .product-info').first();
        const searchArea = productArea.length > 0 ? productArea : $('body');

        // First, try structured data (JSON-LD) for images
        const jsonLdScripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < jsonLdScripts.length; i++) {
            try {
                const jsonData = JSON.parse($(jsonLdScripts[i]).html());
                const products = Array.isArray(jsonData) ? jsonData : (jsonData['@graph'] || [jsonData]);

                for (const item of products) {
                    if (item['@type'] === 'Product' || item['@type'] === 'http://schema.org/Product') {
                        let itemImageUrls = [];
                        if (item.image) {
                            if (typeof item.image === 'string') {
                                itemImageUrls = [item.image];
                            } else if (Array.isArray(item.image)) {
                                itemImageUrls = item.image.map(img => typeof img === 'string' ? img : (img.url || img['@id'] || img.contentUrl)).filter(Boolean);
                            } else if (item.image.url) {
                                itemImageUrls = [item.image.url];
                            }
                        }

                        itemImageUrls.forEach(url => {
                            if (url && !imageUrls.has(url)) {
                                const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
                                images.push({ url: fullUrl, alt: item.name || '' });
                                imageUrls.add(fullUrl);
                            }
                        });
                    }
                }
            } catch (e) { }
        }

        // Try Open Graph and meta tags
        const ogImage = $('meta[property="og:image"]').attr('content') ||
            $('meta[property="og:image:secure_url"]').attr('content');
        if (ogImage && !imageUrls.has(ogImage)) {
            const fullUrl = ogImage.startsWith('http') ? ogImage : `${this.baseUrl}${ogImage}`;
            images.push({ url: fullUrl, alt: $('meta[property="og:image:alt"]').attr('content') || '' });
            imageUrls.add(ogImage);
        }

        // Look for product images with comprehensive selectors within searchArea
        const imageSelectors = [
            '.store-product-thumb img',
            '.splide__list img',
            '.product-image img',
            '.product-photos img',
            '.product-gallery img',
            '.product-images img',
            '.main-image img',
            '[itemprop="image"]',
            '[itemprop="image"] img',
            '.img-responsive.img-fluid'
        ];

        imageSelectors.forEach(selector => {
            searchArea.find(selector).each((i, el) => {
                const src = $(el).attr('src') ||
                    $(el).attr('data-src') ||
                    $(el).attr('data-lazy-src') ||
                    $(el).attr('data-original') ||
                    $(el).attr('href'); // For <a> tags with itemprop="image"

                if (src) {
                    const srcLower = src.toLowerCase();
                    // Skip placeholders and small icons
                    if ((srcLower.includes('placeholder') ||
                        srcLower.includes('icon') ||
                        (srcLower.includes('logo') && !srcLower.includes('ingredient')) ||
                        srcLower.includes('spinner') ||
                        src.match(/\.(svg|ico)$/i)) &&
                        !srcLower.includes('product')) {
                        return;
                    }

                    const fullUrl = src.startsWith('http') ? src :
                        src.startsWith('//') ? `https:${src}` :
                            src.startsWith('/') ? `${this.baseUrl}${src}` :
                                `${this.baseUrl}/${src}`;

                    if (!imageUrls.has(fullUrl)) {
                        images.push({
                            url: fullUrl,
                            alt: $(el).attr('alt') || $(el).attr('title') || ''
                        });
                        imageUrls.add(fullUrl);
                    }
                }
            });
        });

        return images;
    }

    checkStock($) {
        const stockIndicators = [
            $('.in-stock').length > 0,
            $('.available').length > 0,
            $('.add-to-cart').length > 0,
            !$('.out-of-stock').length,
            !$('.unavailable').length
        ];

        return stockIndicators.some(indicator => indicator);
    }

    extractStockQuantity($) {
        // Check for "Out of Stock" labels that are NOT hidden
        const outOfStockLabel = $('.store-out-of-stock-label, .store-not-available-label');
        let isOutOfStock = false;

        outOfStockLabel.each((i, el) => {
            if (!$(el).hasClass('hidden')) {
                isOutOfStock = true;
            }
        });

        if (isOutOfStock) return 0;

        // Try to find actual stock quantity numbers if they exist
        const stockSelectors = [
            '.stock-quantity',
            '.inventory-quantity',
            '.qty-available',
            '.quantity-available',
            '[data-stock]',
            '[data-quantity]',
            '.product-stock'
        ];

        for (const selector of stockSelectors) {
            const text = $(selector).first().text().trim();
            if (text) {
                const quantityMatch = text.match(/(\d+)/);
                if (quantityMatch) {
                    const quantity = parseInt(quantityMatch[1]);
                    if (quantity >= 0) return quantity;
                }
            }

            const dataValue = $(selector).first().attr('data-stock') || $(selector).first().attr('data-quantity');
            if (dataValue) {
                const quantity = parseInt(dataValue);
                if (!isNaN(quantity) && quantity >= 0) return quantity;
            }
        }

        // If product is in stock (no out of stock label found), return a default quantity
        // The site doesn't seem to show numeric inventory for most products
        return 100; // Default high quantity for in-stock items
    }

    extractBrand($, productName = '') {
        // 1. Try explicit brand selectors
        const brandSelectors = [
            '.product-brand',
            '.brand',
            '.manufacturer',
            '.vendor',
            '[itemprop="brand"]',
            '.product-meta .brand',
            '.product-info .brand'
        ];

        for (const selector of brandSelectors) {
            const text = $(selector).first().text().trim();
            if (text && text.length > 0 && text.length < 50) {
                return text;
            }
        }

        // 2. Try to extract brand from product name (if brand is missing)
        if (productName) {
            const knownBrands = [
                'Standard Enzyme', 'Newton Labs', 'Terry Naturally', 'Dr. Tony',
                'Doctor\'s Blend', 'Regalabs', 'Regal Labs', 'Now Foods',
                'Nature\'s Sunshine', 'Nature\'s Plus', 'Nature\'s Balance',
                'Life Fortune', 'Life Extension', 'Global Healing', 'Edom Labs',
                'Flexcin', 'BioNeurix', 'AC Grace', 'Purple Tiger', 'Skinny Magic',
                'HI-Tech', 'Unicity', 'Vista Life', 'Host Defence', 'North American Herb & Spice',
                'North American', 'Perrin\'s Naturals', 'Perrins', 'Our Father\'s Healing Herbs',
                'Carlson', 'Enzymedica', 'Flexcin', 'Gold Star', 'Hippie Jacks', 'Irwin',
                'Life Flo', 'MD Science', 'Natural Balance', 'Oxylife'
            ];

            for (const brand of knownBrands) {
                if (productName.toLowerCase().includes(brand.toLowerCase())) {
                    return brand;
                }
            }
        }

        return '';
    }

    extractCategory($, url) {
        // First try explicit category selectors
        const categorySelectors = [
            '.product-category',
            '.category',
            '.breadcrumb .category',
            '.product-breadcrumb .category',
            '.nav-breadcrumb .category',
            '[itemprop="category"]',
            '.product-meta .category',
            '.product-info .category'
        ];

        for (const selector of categorySelectors) {
            const text = $(selector).first().text().trim();
            if (text && text.length > 0 && text.length < 100) {
                return text;
            }
        }

        // Try to extract from breadcrumbs
        const breadcrumbSelectors = [
            '.breadcrumb a',
            '.breadcrumbs a',
            '.nav-breadcrumb a',
            '.product-breadcrumb a',
            '[itemtype*="BreadcrumbList"] a'
        ];

        for (const selector of breadcrumbSelectors) {
            const breadcrumbs = [];
            $(selector).each((i, el) => {
                const text = $(el).text().trim();
                const href = $(el).attr('href') || '';
                // Skip home, shop, products links
                if (text &&
                    !text.match(/^(home|shop|products|store)$/i) &&
                    href &&
                    !href.match(/\/(home|shop|products|store|index)/i)) {
                    breadcrumbs.push(text);
                }
            });
            if (breadcrumbs.length > 0) {
                // Return the last breadcrumb (most specific category)
                return breadcrumbs[breadcrumbs.length - 1];
            }
        }

        // Try to extract from URL path
        if (url) {
            const urlParts = url.split('/').filter(part => part && part !== 'index.php');
            // Look for category-like segments in URL
            const categoryKeywords = ['category', 'categories', 'herbs', 'vitamins', 'supplements', 'products'];
            for (let i = urlParts.length - 1; i >= 0; i--) {
                const part = urlParts[i].replace(/[^a-zA-Z0-9]/g, ' ').trim();
                if (part &&
                    part.length > 2 &&
                    !categoryKeywords.includes(part.toLowerCase()) &&
                    !part.match(/^\d+$/) && // Not just a number
                    part.length < 50) {
                    // Capitalize first letter of each word
                    return part.split(' ').map(word =>
                        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                    ).join(' ');
                }
            }
        }

        // Try to find category from navigation/menu
        const navSelectors = [
            '.main-nav a.active',
            '.navigation a.active',
            '.menu-item.current-menu-item a',
            '.nav-link.active'
        ];

        for (const selector of navSelectors) {
            const text = $(selector).first().text().trim();
            if (text && text.length > 0 && text.length < 100) {
                return text;
            }
        }

        // Fallback: look for category in meta tags
        const metaCategory = $('meta[property="product:category"]').attr('content') ||
            $('meta[name="category"]').attr('content');
        if (metaCategory) {
            return metaCategory;
        }

        return ''; // Return empty string if no category found
    }

    extractWeight($) {
        const weightSelectors = [
            '.product-weight',
            '.weight',
            '.size',
            '.product-size'
        ];

        for (const selector of weightSelectors) {
            const text = $(selector).text();
            const weight = text.match(/(\d+\.?\d*)\s*(oz|lb|g|kg|mg)/i);
            if (weight) {
                return `${weight[1]} ${weight[2]}`;
            }
        }

        return '';
    }

    categorizeByHealth(name, description) {
        const healthCategories = [];
        const text = `${name} ${description}`.toLowerCase();

        const categoryMap = {
            'Blood Pressure': ['blood pressure', 'hypertension', 'cardiovascular'],
            'Heart Health': ['heart', 'cardiac', 'cardiovascular', 'circulation'],
            'Allergies': ['allergy', 'allergies', 'antihistamine', 'seasonal'],
            'Digestive Health': ['digestive', 'digestion', 'stomach', 'gut', 'probiotic', 'enzyme'],
            'Joint & Arthritis': ['joint', 'arthritis', 'mobility', 'inflammation'],
            'Immune Support': ['immune', 'immunity', 'defense', 'antioxidant'],
            'Stress & Anxiety': ['stress', 'anxiety', 'calm', 'relaxation'],
            'Sleep Support': ['sleep', 'insomnia', 'rest', 'melatonin'],
            'Energy & Vitality': ['energy', 'vitality', 'fatigue', 'endurance'],
            'Brain Health': ['brain', 'cognitive', 'memory', 'focus'],
            'Women\'s Health': ['women', 'female', 'menstrual', 'menopause'],
            'Men\'s Health': ['men', 'male', 'prostate', 'testosterone'],
            'Pet Health': ['pet', 'dog', 'cat', 'animal'],
            'Weight Management': ['weight', 'diet', 'metabolism', 'fat'],
            'Skin Health': ['skin', 'dermal', 'complexion', 'beauty'],
            'Eye Health': ['eye', 'vision', 'sight', 'ocular'],
            'Liver Support': ['liver', 'hepatic', 'detox', 'cleanse'],
            'Respiratory Health': ['respiratory', 'lung', 'breathing', 'bronchial'],
            'Bone Health': ['bone', 'calcium', 'osteo', 'skeletal'],
            'Anti-Aging': ['anti-aging', 'aging', 'longevity', 'youth']
        };

        for (const [category, keywords] of Object.entries(categoryMap)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                healthCategories.push(category);
            }
        }

        return healthCategories;
    }

    cleanText(text) {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').trim();
    }

    generateSKU(url) {
        const urlParts = url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        return `HM-${lastPart.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
    }

    // Helper method to get valid products (filters out invalid names like "Shop", "Featured Products")
    getValidProducts() {
        const invalidNames = ['shop', 'featured products', 'products', 'home', 'categories', 'store', 'browse', 'catalog', 'all products', 'product catalog'];
        return this.products.filter(p => {
            const nameLower = (p.name || '').toLowerCase().trim();
            return nameLower && nameLower.length >= 5 && !invalidNames.includes(nameLower);
        });
    }

    // Helper method to get valid products (filters out invalid names like "Shop", "Featured Products")
    getValidProducts() {
        const invalidNames = ['shop', 'featured products', 'products', 'home', 'categories', 'store', 'browse', 'catalog', 'all products', 'product catalog'];
        return this.products.filter(p => {
            const nameLower = (p.name || '').toLowerCase().trim();
            return nameLower && nameLower.length >= 5 && !invalidNames.includes(nameLower);
        });
    }

    async findCategoryPages() {
        console.log('🔍 Looking for category and brand pages...');

        const allProductLinks = new Set();
        const categoryMap = new Map(); // url -> name
        const brandMap = new Map();    // url -> name

        // 1. Scan the main page for category and brand links
        try {
            const response = await axios.get(this.baseUrl, { headers: this.headers });
            const $ = cheerio.load(response.data);

            const junkNames = ['shop', 'featured products', 'products', 'home', 'categories', 'store', 'browse', 'catalog', 'all products', 'product catalog', 'shop by category', 'shop by brand', 'information', 'about us', 'contact us', 'shipping & returns', 'newsletter', 'search', 'sign in', 'cart', 'click here to sign up'];

            // Find category links
            $('a[href*="/category/"]').each((i, el) => {
                const href = $(el).attr('href');
                let name = $(el).text().trim() || $(el).attr('title') || $(el).find('img').attr('alt') || '';

                // Extract from URL if name still empty
                if (!name && href) {
                    const parts = href.split('/');
                    name = parts[parts.length - 1].replace(/-/g, ' ');
                }

                if (href && name) {
                    const cleanName = name.replace(/\s+/g, ' ').trim();
                    if (cleanName && !junkNames.includes(cleanName.toLowerCase())) {
                        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
                        categoryMap.set(fullUrl, cleanName);
                    }
                }
            });

            // Find brand links
            $('a[href*="/brand/"]').each((i, el) => {
                const href = $(el).attr('href');
                let name = $(el).text().trim() || $(el).attr('title') || $(el).find('img').attr('alt') || '';

                // Extract from URL if name still empty
                if (!name && href) {
                    const parts = href.split('/');
                    name = parts[parts.length - 1].replace(/-/g, ' ');
                }

                if (href && name) {
                    const cleanName = name.replace(/\s+/g, ' ').trim();
                    if (cleanName && !junkNames.includes(cleanName.toLowerCase())) {
                        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
                        brandMap.set(fullUrl, cleanName);
                    }
                }
            });

            console.log(`📊 Found ${categoryMap.size} categories and ${brandMap.size} brands on home page.`);
        } catch (error) {
            console.warn('Could not scan home page for categories/brands:', error.message);
        }

        // 2. Add hardcoded category URLs as fallback/completeness
        const fallbackUrls = [
            { url: `${this.baseUrl}/index.php/products`, name: 'All Products' },
            { url: `${this.baseUrl}/index.php/category/antioxidants`, name: 'Antioxidants' },
            { url: `${this.baseUrl}/index.php/category/blood-pressure`, name: 'Blood Pressure' },
            { url: `${this.baseUrl}/index.php/category/blood-sugar`, name: 'Blood Sugar' },
            { url: `${this.baseUrl}/index.php/category/bodybuilding-pre-workout`, name: 'Bodybuilding Pre-Workout' },
            { url: `${this.baseUrl}/index.php/category/digestion`, name: 'Digestion' },
            { url: `${this.baseUrl}/index.php/category/fat-burners`, name: 'Fat Burners' },
            { url: `${this.baseUrl}/index.php/category/immune`, name: 'Immune' },
            { url: `${this.baseUrl}/index.php/category/joint-pain`, name: 'Joint Pain' },
            { url: `${this.baseUrl}/index.php/category/men`, name: 'Men Products' },
            { url: `${this.baseUrl}/index.php/category/mood-support`, name: 'Mood Support' },
            { url: `${this.baseUrl}/index.php/category/sleep-health`, name: 'Sleep Health' },
            { url: `${this.baseUrl}/index.php/category/vision-health-support`, name: 'Vision Health Support' },
            { url: `${this.baseUrl}/index.php/category/women`, name: 'Women Products' },
            { url: `${this.baseUrl}/index.php/herbs`, name: 'Herbs & Botanicals' },
            { url: `${this.baseUrl}/index.php/vitamins`, name: 'Vitamins' },
            { url: `${this.baseUrl}/index.php/supplements`, name: 'Specialty Formulas' }
        ];

        fallbackUrls.forEach(item => {
            if (!categoryMap.has(item.url)) categoryMap.set(item.url, item.name);
        });

        const totalToScan = categoryMap.size + brandMap.size;
        let scannedCount = 0;

        this.sendProgress({
            stage: 'finding_categories',
            current: 1,
            total: totalToScan,
            percentage: 8,
            message: `Scanning category and brand pages...`,
            productsFound: 0
        });

        // 3. Scan each category page
        for (const [url, name] of categoryMap) {
            scannedCount++;
            try {
                this.sendProgress({
                    stage: 'finding_categories',
                    current: scannedCount,
                    total: totalToScan,
                    percentage: 8 + Math.round((scannedCount / totalToScan) * 4),
                    message: `Scanning category: ${name}...`,
                    productsFound: allProductLinks.size
                });

                const { productLinks } = await this.scrapePage(url, { category: name });
                productLinks.forEach(link => allProductLinks.add(link));

                // Handle pagination for product listing pages
                if (url.includes('/index.php/products') || url.includes('/category/')) {
                    const paginationLinks = await this.scrapePaginatedPages(url, { category: name });
                    paginationLinks.forEach(link => allProductLinks.add(link));
                }
            } catch (error) {
                console.warn(`Failed to scan category ${name}:`, error.message);
            }
        }

        // 4. Scan each brand page
        for (const [url, name] of brandMap) {
            scannedCount++;
            try {
                this.sendProgress({
                    stage: 'finding_categories',
                    current: scannedCount,
                    total: totalToScan,
                    percentage: 8 + Math.round((scannedCount / totalToScan) * 4),
                    message: `Scanning brand: ${name}...`,
                    productsFound: allProductLinks.size
                });

                const { productLinks } = await this.scrapePage(url, { brand: name });
                productLinks.forEach(link => allProductLinks.add(link));

                // Handle pagination for brand pages
                if (url.includes('/brand/')) {
                    const paginationLinks = await this.scrapePaginatedPages(url, { brand: name });
                    paginationLinks.forEach(link => allProductLinks.add(link));
                }
            } catch (error) {
                console.warn(`Failed to scan brand ${name}:`, error.message);
            }
        }

        // Now scrape all unique product pages found
        console.log(`🎯 Found ${allProductLinks.size} unique product links from categories/brands.`);
        await this.scrapeFoundProductLinks(Array.from(allProductLinks));
    }

    async scrapePaginatedPages(baseUrl, context = {}) {
        console.log(`📄 Checking for pagination on ${baseUrl}...`);

        const allPaginationLinks = [];
        const maxPages = 37; // Try pages 2-37 to get all products

        // Try pages 2-37 to get all products (saw up to page 37 on the site)
        for (let page = 2; page <= maxPages; page++) {
            try {
                const pageUrl = baseUrl.includes('?')
                    ? `${baseUrl}&ccm_paging_p=${page}`
                    : `${baseUrl}?ccm_paging_p=${page}`;

                const { productLinks } = await this.scrapePage(pageUrl, context);
                console.log(`📦 Found ${productLinks.length} product links on page ${page}`);

                // Add links to our collection
                allPaginationLinks.push(...productLinks);

                // If no products found, we've reached the end
                if (productLinks.length === 0) {
                    break;
                }

                // Add a small delay to be respectful
                await new Promise((resolve) => {
                    setTimeout(resolve, 500);
                });
            } catch (error) {
                console.log(`⚠️ Could not access page ${page}`);
                break;
            }
        }

        return allPaginationLinks;
    }

    async scrapeFoundProductLinks(productLinks) {
        console.log(`🔍 Scraping ${productLinks.length} individual product pages...`);
        const totalLinks = productLinks.length;

        if (totalLinks === 0) {
            this.sendProgress({
                stage: 'scraping_products',
                current: 0,
                total: 0,
                percentage: 15,
                message: 'No product links found to scrape',
                productsFound: this.products.length
            });
            return;
        }

        for (let i = 0; i < productLinks.length; i++) {
            const link = productLinks[i];
            try {
                const productName = link.split('/').pop() || `Product ${i + 1}`;
                console.log(`📦 Scraping product ${i + 1}/${totalLinks}: ${link}`);

                // Calculate percentage (scraping products is stage 3 out of 5 stages)
                // Stage 1: Main page (1-5%), Stage 2: Categories (5-15%), Stage 3: Products (15-85%), Stage 4: Saving (85-95%), Stage 5: Complete (100%)
                const stageProgress = 15 + ((i + 1) / totalLinks) * 70; // 15% to 85%
                const percentage = Math.max(15, Math.round(stageProgress));

                // Send progress update with better formatting
                this.sendProgress({
                    stage: 'scraping_products',
                    current: i + 1,
                    total: totalLinks,
                    percentage: percentage,
                    message: `Scraping product ${i + 1} of ${totalLinks}: ${productName.substring(0, 50)}...`,
                    productsFound: this.products.length
                });

                // Scrape the individual product page
                await this.scrapePage(link);

                // Add a small delay to be respectful
                await new Promise((resolve) => {
                    setTimeout(resolve, 500);
                });

                // Send progress update every product (not just every 10)
                if ((i + 1) % 5 === 0 || i === productLinks.length - 1) {
                    console.log(`✅ Progress: ${i + 1}/${totalLinks} products scraped. Found ${this.products.length} valid products so far.`);
                }
            } catch (error) {
                console.log(`⚠️ Error scraping product ${link}: ${error.message}`);
                // Still send progress update even on error
                const stageProgress = 40 + ((i + 1) / totalLinks) * 40;
                const percentage = Math.round(stageProgress);
                this.sendProgress({
                    stage: 'scraping_products',
                    current: i + 1,
                    total: totalLinks,
                    percentage: percentage,
                    message: `Error scraping product ${i + 1} of ${totalLinks}, continuing...`,
                    productsFound: this.products.length
                });
            }
        }

        console.log(`🎉 Finished scraping individual products. Found ${this.products.length} valid products total.`);
    }

    async scrapeProductPages() {
        console.log('📦 Scraping individual product pages...');

        // For now, let's try to find products through search or sitemap
        // This is a simplified approach - in reality we'd need to analyze the site structure
        // Note: This is a fallback method - findCategoryPages already calls scrapeFoundProductLinks

        const searchTerms = [
            'vitamin', 'herb', 'supplement', 'enzyme', 'probiotic',
            'omega', 'calcium', 'magnesium', 'zinc', 'iron'
        ];

        for (const term of searchTerms) {
            try {
                const searchUrl = `${this.baseUrl}/index.php/search?q=${term}`;
                await this.scrapePage(searchUrl);
            } catch (error) {
                // Continue
            }
        }
    }

    async saveResults() {
        console.log('💾 Saving scraped data...');

        // Save as JSON
        const jsonData = {
            products: this.products,
            categories: Array.from(this.categories),
            brands: Array.from(this.brands),
            scrapedAt: new Date().toISOString(),
            totalProducts: this.products.length
        };

        await fs.writeFile(
            path.join(__dirname, '../data/scraped-products.json'),
            JSON.stringify(jsonData, null, 2)
        );

        // Save as CSV for import
        const csvData = this.convertToCSV();
        await fs.writeFile(
            path.join(__dirname, '../data/scraped-products.csv'),
            csvData
        );

        console.log('✅ Data saved to scraped-products.json and scraped-products.csv');
    }

    convertToCSV() {
        const headers = [
            'sku', 'name', 'brand', 'category', 'price',
            'weight', 'inventory', 'short_description', 'description',
            'health_categories', 'images', 'active', 'featured'
        ];

        const rows = this.products.map(product => {
            // Determine inventory quantity
            let inventory = 0;
            if (product.inventoryQuantity !== undefined && product.inventoryQuantity !== null) {
                inventory = product.inventoryQuantity;
            } else if (product.inStock) {
                inventory = 50; // Default inventory if in stock but quantity unknown
            }

            return [
                product.sku,
                product.name,
                product.brand || 'Unknown',
                product.category || 'General',
                product.price || 0,
                product.weight || '',
                inventory,
                product.shortDescription || '',
                product.description || '',
                product.healthCategories ? product.healthCategories.join(',') : '',
                product.images ? product.images.map(img => img.url).join(',') : '',
                'true',
                'false'
            ];
        });

        return [headers, ...rows].map(row =>
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    }
}

// CLI usage
if (require.main === module) {
    const scraper = new HMHerbsScraper();
    scraper.scrapeAllProducts()
        .then(() => {
            console.log('🎉 Scraping completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Scraping failed:', error);
            process.exit(1);
        });
}

module.exports = HMHerbsScraper;


// UPC-Based Product Scraper for HM Herbs
// Reads products with UPC codes and extracts only: images, inventory quantity, price, short/long descriptions

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');

class UPCBasedScraper {
    constructor(inputFile, outputFile = null) {
        this.baseUrl = 'https://hmherbs.com';
        this.inputFile = inputFile;
        this.outputFile = outputFile || path.join(__dirname, '../data/upc-scraped-products.json');
        this.products = [];
        this.stats = {
            total: 0,
            found: 0,
            notFound: 0,
            errors: 0,
            startTime: new Date()
        };

        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive'
        };
    }

    /**
     * Load products from CSV file (expects columns: upc, sku, name, or similar)
     */
    async loadProductsFromCSV(filePath) {
        return new Promise((resolve, reject) => {
            const products = [];
            createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    // Support multiple column name variations
                    const upc = row.upc || row.UPC || row.barcode || row.barcode || row.code || '';
                    const sku = row.sku || row.SKU || row.id || '';
                    const name = row.name || row.product_name || row.title || '';

                    if (upc || sku) {
                        products.push({
                            upc: upc.toString().trim(),
                            sku: sku.toString().trim(),
                            name: name.toString().trim(),
                            originalData: row
                        });
                    }
                })
                .on('end', () => {
                    console.log(`✅ Loaded ${products.length} products from CSV`);
                    resolve(products);
                })
                .on('error', reject);
        });
    }

    /**
     * Load products from JSON file
     */
    async loadProductsFromJSON(filePath) {
        const data = await fs.readFile(filePath, 'utf8');
        const json = JSON.parse(data);

        // Handle different JSON structures
        const products = json.products || json.items || (Array.isArray(json) ? json : []);

        return products.map(product => ({
            upc: (product.upc || product.UPC || product.barcode || product.code || '').toString().trim(),
            sku: (product.sku || product.SKU || product.id || '').toString().trim(),
            name: (product.name || product.product_name || product.title || '').toString().trim(),
            originalData: product
        })).filter(p => p.upc || p.sku);
    }

    /**
     * Find product URL by searching with UPC/SKU
     */
    async findProductUrl(upc, sku, name) {
        // Strategy 1: Search by UPC/SKU on the website
        const searchTerms = [upc, sku].filter(Boolean);

        for (const term of searchTerms) {
            if (!term) continue;

            try {
                // Try search endpoint
                const searchUrl = `${this.baseUrl}/index.php/search?q=${encodeURIComponent(term)}`;
                const response = await axios.get(searchUrl, {
                    headers: this.headers,
                    timeout: 10000
                });

                const $ = cheerio.load(response.data);

                // Look for product links in search results
                const productLinks = $('a[href*="/index.php/products/"]').first();
                if (productLinks.length > 0) {
                    const href = productLinks.attr('href');
                    const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
                    return fullUrl;
                }
            } catch (error) {
                // Continue to next strategy
            }
        }

        // Strategy 2: Try direct URL construction if SKU is numeric (common pattern)
        if (sku && /^\d+$/.test(sku)) {
            // Try common URL patterns
            const patterns = [
                `${this.baseUrl}/index.php/products/${sku}`,
                `${this.baseUrl}/index.php/products/product-${sku}`,
                `${this.baseUrl}/index.php/products/sku-${sku}`
            ];

            for (const url of patterns) {
                try {
                    const response = await axios.get(url, {
                        headers: this.headers,
                        timeout: 5000,
                        validateStatus: (status) => status < 500 // Don't throw on 404
                    });

                    if (response.status === 200 && this.isProductPage(cheerio.load(response.data))) {
                        return url;
                    }
                } catch (error) {
                    // Continue to next pattern
                }
            }
        }

        // Strategy 3: Search by product name (fallback)
        if (name) {
            try {
                const searchUrl = `${this.baseUrl}/index.php/search?q=${encodeURIComponent(name)}`;
                const response = await axios.get(searchUrl, {
                    headers: this.headers,
                    timeout: 10000
                });

                const $ = cheerio.load(response.data);
                const productLinks = $('a[href*="/index.php/products/"]').first();
                if (productLinks.length > 0) {
                    const href = productLinks.attr('href');
                    const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
                    return fullUrl;
                }
            } catch (error) {
                // Product not found
            }
        }

        return null;
    }

    /**
     * Check if page is a product page
     */
    isProductPage($) {
        const indicators = [
            $('h1').length > 0 && $('h1').text().includes('SKU:'),
            $('.product-details').length > 0,
            $('.product-price').length > 0,
            $('body').text().includes('Add to Cart')
        ];

        return indicators.some(indicator => indicator);
    }

    /**
     * Extract only the requested fields: images, inventory quantity, price, short/long descriptions
     */
    async scrapeProductData(productUrl, upc, sku) {
        try {
            const response = await axios.get(productUrl, {
                headers: this.headers,
                timeout: 10000
            });

            const $ = cheerio.load(response.data);

            if (!this.isProductPage($)) {
                return null;
            }

            const name = $('h1').first().text().trim().replace(/\s*SKU:\s*[A-Za-z0-9\-]+/i, '').trim();

            return {
                upc: upc,
                sku: sku,
                name: name,
                url: productUrl,
                category: this.extractCategory($, productUrl),
                brand: this.extractBrand($, name),
                images: this.extractImages($),
                inventoryQuantity: this.extractInventoryQuantity($),
                price: this.extractPrice($),
                shortDescription: this.extractShortDescription($),
                longDescription: this.extractLongDescription($)
            };

        } catch (error) {
            console.error(`Error scraping ${productUrl}:`, error.message);
            return null;
        }
    }

    /**
     * Extract product images
     */
    extractImages($) {
        const images = [];
        const imageUrls = new Set(); // Track unique URLs to avoid duplicates

        // Search area restricted to product gallery/form to avoid header/footer images
        const productArea = $('.splide, .store-product-block, .product-details, .product-info').first();
        const searchArea = productArea.length > 0 ? productArea : $('body');

        const imageSelectors = [
            '.store-product-thumb img',
            '.splide__list img',
            '.product-image img',
            '.product-photos img',
            '.product-gallery img',
            '.product-images img',
            '.main-image img',
            '.product-img img',
            '.product-thumbnails img',
            '[itemprop="image"]',
            '[itemprop="image"] img',
            '.gallery img',
            'main img',
            '.content img',
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
                        imageUrls.add(fullUrl);
                        images.push({
                            url: fullUrl,
                            alt: $(el).attr('alt') || $(el).attr('title') || ''
                        });
                    }
                }
            });
        });

        return images;
    }

    /**
     * Extract inventory quantity
     */
    extractInventoryQuantity($) {
        // Check for "Out of Stock" labels that are NOT hidden
        const outOfStockLabel = $('.store-out-of-stock-label, .store-not-available-label');
        let isOutOfStock = false;

        outOfStockLabel.each((i, el) => {
            if (!$(el).hasClass('hidden')) {
                isOutOfStock = true;
            }
        });

        if (isOutOfStock) return 0;

        // Try structured data
        const jsonLdScripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < jsonLdScripts.length; i++) {
            try {
                const jsonData = JSON.parse($(jsonLdScripts[i]).html());
                const products = Array.isArray(jsonData) ? jsonData : [jsonData];

                for (const item of products) {
                    if (item['@type'] === 'Product') {
                        if (item.offers && item.offers.inventoryLevel) {
                            const quantity = parseInt(item.offers.inventoryLevel.value);
                            if (!isNaN(quantity)) return quantity;
                        }
                    }
                }
            } catch (e) { }
        }

        // Try specific selectors
        const stockSelectors = [
            '.stock-quantity',
            '.inventory-quantity',
            '.qty-available',
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
                    if (!isNaN(quantity) && quantity >= 0) return quantity;
                }
            }
        }

        // If product is in stock (no out of stock label found), return a default quantity
        return 100; // Default high quantity for in-stock items
    }

    /**
     * Extract price
     */
    extractPrice($) {
        // Targeted search within the product form to avoid marquee/header prices
        const productForm = $('form.store-product, .product-details, .product-info').first();
        const searchArea = productForm.length > 0 ? productForm : $('body');

        // Try structured data first (JSON-LD)
        const jsonLdScripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < jsonLdScripts.length; i++) {
            try {
                const jsonData = JSON.parse($(jsonLdScripts[i]).html());
                const products = Array.isArray(jsonData) ? jsonData : [jsonData];

                for (const item of products) {
                    if (item['@type'] === 'Product' && item.offers) {
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

        // Try CSS selectors within searchArea
        const priceSelectors = [
            '.store-product-price',
            '[data-price]',
            '.product-price',
            '.price',
            '.current-price',
            '.sale-price',
            '[itemprop="price"]',
            'h1 + .price',
            '.ccm-block-product-price'
        ];

        for (const selector of priceSelectors) {
            const elements = searchArea.find(selector);
            for (let j = 0; j < elements.length; j++) {
                const el = $(elements[j]);
                const dataPrice = el.attr('data-price') || el.attr('data-product-price') || el.attr('data-cost');
                if (dataPrice) {
                    const price = parseFloat(dataPrice);
                    if (!isNaN(price) && price > 0) return price;
                }

                const text = el.text().trim();
                if (text) {
                    const priceMatch = text.match(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
                    if (priceMatch) {
                        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                        if (!isNaN(price) && price >= 0.01 && price <= 10000) {
                            return price;
                        }
                    }
                }
            }
        }

        // Fallback: search searchArea text
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

    /**
     * Extract short description
     */
    extractShortDescription($) {
        // Try meta description
        const metaDescription = $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content');
        if (metaDescription) {
            const desc = this.cleanText(metaDescription);
            if (desc && desc.length > 10 && desc.length < 500) {
                return desc;
            }
        }

        // Try short description selectors
        const shortDescSelectors = [
            '.product-summary',
            '.short-description',
            '.product-excerpt',
            '.product-intro',
            '.product-brief'
        ];

        for (const selector of shortDescSelectors) {
            const text = $(selector).first().text().trim();
            if (text && text.length > 10 && text.length < 500) {
                return this.cleanText(text);
            }
        }

        // Use first paragraph after price
        const priceElement = $('.price, .product-price, [itemprop="price"]').first();
        if (priceElement.length) {
            const nextP = priceElement.nextAll('p').first().text().trim();
            if (nextP && nextP.length > 10 && nextP.length < 500 && !nextP.includes('$')) {
                return this.cleanText(nextP);
            }
        }

        // Use first sentence of long description
        const longDesc = this.extractLongDescription($);
        if (longDesc) {
            const firstSentence = longDesc.split(/[.!?]/)[0];
            if (firstSentence && firstSentence.length > 10 && firstSentence.length < 300) {
                return this.cleanText(firstSentence);
            }
            // Or first 200 chars
            if (longDesc.length > 10) {
                return this.cleanText(longDesc.substring(0, 200).trim());
            }
        }

        return '';
    }

    /**
     * Extract long description
     */
    extractLongDescription($) {
        // Try structured data first
        const jsonLdScripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < jsonLdScripts.length; i++) {
            try {
                const jsonData = JSON.parse($(jsonLdScripts[i]).html());
                const products = Array.isArray(jsonData) ? jsonData : [jsonData];

                for (const item of products) {
                    if (item['@type'] === 'Product' && item.description) {
                        const desc = this.cleanText(item.description);
                        if (desc && desc.length > 50) {
                            return desc;
                        }
                    }
                }
            } catch (e) {
                // Continue
            }
        }

        // Try description selectors
        const descSelectors = [
            '.product-description',
            '.description',
            '.product-details .description',
            '.product-info .description',
            '.product-content',
            '.product-text',
            '[itemprop="description"]',
            '.entry-content',
            'main p',
            '.content p'
        ];

        let fullDescription = '';

        for (const selector of descSelectors) {
            const elements = $(selector);
            if (elements.length > 0) {
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

                if (text.includes('$') || text.match(/\$\s*\d/)) {
                    foundPrice = true;
                    return;
                }

                if (foundPrice && text &&
                    text.length > 20 &&
                    !text.includes('$') &&
                    !text.match(/^(add to cart|buy now|home|shop)$/i)) {
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

    cleanText(text) {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').trim();
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

        return 'General';
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

        return 'Unknown';
    }

    extractText($, selectors) {
        for (const selector of selectors) {
            const text = $(selector).first().text().trim();
            if (text) return text;
        }
        return null;
    }

    /**
     * Main scraping function
     */
    async scrapeAll() {
        console.log('🌿 Starting UPC-based product scraping...');
        console.log(`📁 Input file: ${this.inputFile}`);

        // Load products from input file
        let products;
        const fileExt = path.extname(this.inputFile).toLowerCase();

        if (fileExt === '.csv') {
            products = await this.loadProductsFromCSV(this.inputFile);
        } else if (fileExt === '.json') {
            products = await this.loadProductsFromJSON(this.inputFile);
        } else {
            throw new Error('Input file must be CSV or JSON format');
        }

        this.stats.total = products.length;
        console.log(`📦 Found ${products.length} products to scrape\n`);

        // Process each product
        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            const progress = `[${i + 1}/${products.length}]`;

            console.log(`${progress} Processing: UPC=${product.upc || 'N/A'}, SKU=${product.sku || 'N/A'}, Name=${product.name || 'N/A'}`);

            try {
                // Find product URL
                const productUrl = await this.findProductUrl(product.upc, product.sku, product.name);

                if (!productUrl) {
                    console.log(`   ⚠️  Product not found on website`);
                    this.stats.notFound++;
                    this.products.push({
                        ...product.originalData,
                        upc: product.upc,
                        sku: product.sku,
                        name: product.name,
                        found: false,
                        error: 'Product URL not found'
                    });
                    continue;
                }

                console.log(`   🔍 Found URL: ${productUrl}`);

                // Scrape product data
                const scrapedData = await this.scrapeProductData(productUrl, product.upc, product.sku);

                if (!scrapedData) {
                    console.log(`   ⚠️  Could not extract product data`);
                    this.stats.errors++;
                    this.products.push({
                        ...product.originalData,
                        upc: product.upc,
                        sku: product.sku,
                        name: product.name,
                        url: productUrl,
                        found: false,
                        error: 'Could not extract product data'
                    });
                    continue;
                }

                // Merge with original data
                const updatedProduct = {
                    ...product.originalData,
                    ...scrapedData,
                    found: true,
                    scrapedAt: new Date().toISOString()
                };

                this.products.push(updatedProduct);
                this.stats.found++;

                console.log(`   ✅ Extracted: Price=$${scrapedData.price || 'N/A'}, Images=${scrapedData.images.length}, Inventory=${scrapedData.inventoryQuantity !== null ? scrapedData.inventoryQuantity : 'Unknown'}`);

                // Small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                this.stats.errors++;
                this.products.push({
                    ...product.originalData,
                    upc: product.upc,
                    sku: product.sku,
                    name: product.name,
                    found: false,
                    error: error.message
                });
            }

            // Progress update every 10 products
            if ((i + 1) % 10 === 0) {
                console.log(`\n📊 Progress: ${i + 1}/${products.length} processed | Found: ${this.stats.found} | Not Found: ${this.stats.notFound} | Errors: ${this.stats.errors}\n`);
            }
        }

        // Save results
        await this.saveResults();

        // Print summary
        this.printSummary();
    }

    /**
     * Save results to JSON file
     */
    async saveResults() {
        const outputData = {
            scrapedAt: new Date().toISOString(),
            stats: {
                ...this.stats,
                endTime: new Date(),
                duration: Math.round((new Date() - this.stats.startTime) / 1000)
            },
            products: this.products
        };

        await fs.writeFile(
            this.outputFile,
            JSON.stringify(outputData, null, 2)
        );

        console.log(`\n💾 Results saved to: ${this.outputFile}`);
    }

    /**
     * Print summary statistics
     */
    printSummary() {
        const duration = Math.round((new Date() - this.stats.startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        console.log('\n' + '='.repeat(60));
        console.log('📊 SCRAPING SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Products:     ${this.stats.total}`);
        console.log(`✅ Found:            ${this.stats.found}`);
        console.log(`⚠️  Not Found:        ${this.stats.notFound}`);
        console.log(`❌ Errors:           ${this.stats.errors}`);
        console.log(`⏱️  Duration:          ${minutes}m ${seconds}s`);
        console.log(`📁 Output File:      ${this.outputFile}`);
        console.log('='.repeat(60) + '\n');
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node scrape-by-upc.js <input-file.csv|json> [output-file.json]');
        console.log('\nExample:');
        console.log('  node scrape-by-upc.js products-with-upc.csv');
        console.log('  node scrape-by-upc.js products.json output.json');
        process.exit(1);
    }

    const inputFile = args[0];
    const outputFile = args[1] || null;

    const scraper = new UPCBasedScraper(inputFile, outputFile);
    scraper.scrapeAll()
        .then(() => {
            console.log('🎉 Scraping completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Scraping failed:', error);
            process.exit(1);
        });
}

module.exports = UPCBasedScraper;


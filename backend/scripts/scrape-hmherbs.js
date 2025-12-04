// HM Herbs Website Scraper
// Automatically extracts all products from hmherbs.com

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class HMHerbsScraper {
    constructor() {
        this.baseUrl = 'https://hmherbs.com';
        this.products = [];
        this.categories = new Set();
        this.brands = new Set();
        this.scrapedUrls = new Set();
        
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

    async scrapeAllProducts() {
        console.log('🌿 Starting HM Herbs website scraping...');
        
        try {
            // Start with the main page to find category links
            await this.scrapePage(this.baseUrl);
            
            // Look for product category pages
            await this.findCategoryPages();
            
            // Scrape individual product pages
            await this.scrapeProductPages();
            
            // Save results
            await this.saveResults();
            
            console.log(`✅ Scraping complete! Found ${this.products.length} products`);
            console.log(`📊 Categories: ${this.categories.size}`);
            console.log(`🏷️ Brands: ${this.brands.size}`);
            
        } catch (error) {
            console.error('❌ Scraping failed:', error);
        }
    }

    async scrapePage(url) {
        try {
            console.log(`🔍 Scraping: ${url}`);
            
            const response = await axios.get(url, { 
                headers: this.headers,
                timeout: 10000
            });
            
            const $ = cheerio.load(response.data);
            
            // Look for product links
            const productLinks = this.extractProductLinks($);
            
            // Look for category links
            const categoryLinks = this.extractCategoryLinks($);
            
            // If this is a product page, extract product details
            if (this.isProductPage($)) {
                const product = this.extractProductDetails($, url);
                if (product) {
                    this.products.push(product);
                    console.log(`📦 Found product: ${product.name}`);
                }
            }
            
            return { productLinks, categoryLinks };
            
        } catch (error) {
            console.error(`❌ Error scraping ${url}:`, error.message);
            return { productLinks: [], categoryLinks: [] };
        }
    }

    extractProductLinks($) {
        const links = [];
        
        // Common selectors for product links
        const selectors = [
            'a[href*="/product"]',
            'a[href*="/item"]',
            'a[href*="/p/"]',
            '.product-link',
            '.product-item a',
            '.product-card a',
            '.product-title a'
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
        // Check if this is a product page
        const indicators = [
            $('.product-details').length > 0,
            $('.product-info').length > 0,
            $('.product-price').length > 0,
            $('.add-to-cart').length > 0,
            $('meta[property="og:type"]').attr('content') === 'product',
            $('.product-description').length > 0
        ];
        
        return indicators.some(indicator => indicator);
    }

    extractProductDetails($, url) {
        try {
            // Extract product information using various selectors
            const product = {
                url: url,
                sku: this.extractText($, [
                    '.product-sku',
                    '.sku',
                    '[data-sku]',
                    '.product-code'
                ]) || this.generateSKU(url),
                
                name: this.extractText($, [
                    '.product-title',
                    '.product-name',
                    'h1.title',
                    'h1',
                    '.product-details h1',
                    '.product-info h1'
                ]),
                
                price: this.extractPrice($, [
                    '.product-price',
                    '.price',
                    '.current-price',
                    '.sale-price',
                    '.product-cost'
                ]),
                
                comparePrice: this.extractPrice($, [
                    '.compare-price',
                    '.original-price',
                    '.was-price',
                    '.regular-price'
                ]),
                
                description: this.extractText($, [
                    '.product-description',
                    '.description',
                    '.product-details .description',
                    '.product-info .description'
                ]),
                
                shortDescription: this.extractText($, [
                    '.product-summary',
                    '.short-description',
                    '.product-excerpt'
                ]),
                
                brand: this.extractText($, [
                    '.product-brand',
                    '.brand',
                    '.manufacturer',
                    '.vendor'
                ]),
                
                category: this.extractText($, [
                    '.product-category',
                    '.category',
                    '.breadcrumb .category'
                ]),
                
                images: this.extractImages($),
                
                inStock: this.checkStock($),
                
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

    extractPrice($, selectors) {
        for (const selector of selectors) {
            const text = $(selector).first().text().trim();
            const price = text.match(/[\d,]+\.?\d*/);
            if (price) {
                return parseFloat(price[0].replace(',', ''));
            }
        }
        return 0;
    }

    extractImages($) {
        const images = [];
        
        // Look for product images
        const selectors = [
            '.product-image img',
            '.product-photos img',
            '.product-gallery img',
            '.main-image img',
            '.product-img img'
        ];
        
        selectors.forEach(selector => {
            $(selector).each((i, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');
                if (src) {
                    const fullUrl = src.startsWith('http') ? src : `${this.baseUrl}${src}`;
                    images.push({
                        url: fullUrl,
                        alt: $(el).attr('alt') || ''
                    });
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

    async findCategoryPages() {
        console.log('🔍 Looking for category pages...');
        
        // Common category page patterns
        const categoryUrls = [
            `${this.baseUrl}/shop`,
            `${this.baseUrl}/products`,
            `${this.baseUrl}/categories`,
            `${this.baseUrl}/herbs`,
            `${this.baseUrl}/vitamins`,
            `${this.baseUrl}/supplements`
        ];
        
        for (const url of categoryUrls) {
            try {
                const { productLinks } = await this.scrapePage(url);
                console.log(`📦 Found ${productLinks.length} product links on ${url}`);
            } catch (error) {
                // Continue if category page doesn't exist
            }
        }
    }

    async scrapeProductPages() {
        console.log('📦 Scraping individual product pages...');
        
        // For now, let's try to find products through search or sitemap
        // This is a simplified approach - in reality we'd need to analyze the site structure
        
        const searchTerms = [
            'vitamin', 'herb', 'supplement', 'enzyme', 'probiotic',
            'omega', 'calcium', 'magnesium', 'zinc', 'iron'
        ];
        
        for (const term of searchTerms) {
            try {
                const searchUrl = `${this.baseUrl}/search?q=${term}`;
                await this.scrapePage(searchUrl);
            } catch (error) {
                // Continue if search doesn't work
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
            'sku', 'name', 'brand', 'category', 'price', 'compare_price',
            'weight', 'inventory', 'short_description', 'description',
            'health_categories', 'images', 'active', 'featured'
        ];
        
        const rows = this.products.map(product => [
            product.sku,
            product.name,
            product.brand || 'Unknown',
            product.category || 'General',
            product.price || 0,
            product.comparePrice || '',
            product.weight || '',
            product.inStock ? 50 : 0, // Default inventory
            product.shortDescription || '',
            product.description || '',
            product.healthCategories.join(','),
            product.images.map(img => img.url).join(','),
            'true',
            'false'
        ]);
        
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

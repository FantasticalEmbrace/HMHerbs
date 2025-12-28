// Enhanced HM Herbs Website Scraper - Gets ALL 749+ products
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class EnhancedHMHerbsScraper {
    constructor() {
        this.baseUrl = 'https://hmherbs.com';
        this.products = [];
        this.allProductUrls = new Set();
        this.scrapedProducts = new Set();
        
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive'
        };
    }

    async scrapeAllProducts() {
        console.log('🌿 Starting COMPLETE HM Herbs website scraping...');
        
        try {
            // Step 1: Collect ALL product URLs from all 37 pages
            await this.collectAllProductUrls();
            
            console.log(`🎯 Found ${this.allProductUrls.size} unique product URLs`);
            
            // Step 2: Scrape each individual product page
            await this.scrapeIndividualProducts();
            
            // Step 3: Save results
            await this.saveResults();
            
            console.log(`✅ COMPLETE scraping finished! Found ${this.products.length} products`);
            
        } catch (error) {
            console.error('❌ Scraping failed:', error);
        }
    }

    async collectAllProductUrls() {
        console.log('📄 Collecting product URLs from all 37 pages...');
        
        for (let page = 1; page <= 37; page++) {
            try {
                const url = page === 1 
                    ? `${this.baseUrl}/index.php/products`
                    : `${this.baseUrl}/index.php/products?ccm_paging_p=${page}`;
                
                console.log(`📄 Scanning page ${page}/37...`);
                
                const response = await axios.get(url, { 
                    headers: this.headers,
                    timeout: 15000
                });
                
                const $ = cheerio.load(response.data);
                
                // Extract product links from this page
                const selectors = [
                    'a[href*="/index.php/products/"]',
                    'a[href*="/products/"]'
                ];
                
                selectors.forEach(selector => {
                    $(selector).each((i, el) => {
                        const href = $(el).attr('href');
                        if (href && href.includes('/products/') && !href.includes('?ccm_paging_p=')) {
                            const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
                            this.allProductUrls.add(fullUrl);
                        }
                    });
                });
                
                console.log(`   Found ${this.allProductUrls.size} total unique URLs so far`);
                
                // Small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (error) {
                console.error(`❌ Error on page ${page}:`, error.message);
            }
        }
        
        console.log(`🎯 Collection complete: ${this.allProductUrls.size} unique product URLs found`);
    }

    async scrapeIndividualProducts() {
        console.log(`🔍 Scraping ${this.allProductUrls.size} individual product pages...`);
        
        const productUrls = Array.from(this.allProductUrls);
        let processed = 0;
        
        for (const url of productUrls) {
            try {
                processed++;
                console.log(`📦 Scraping product ${processed}/${productUrls.length}: ${url.split('/').pop()}`);
                
                const product = await this.scrapeProductPage(url);
                if (product && product.name && !product.name.includes('Shop') && !product.name.includes('Search')) {
                    this.products.push(product);
                }
                
                // Progress update every 50 products
                if (processed % 50 === 0) {
                    console.log(`✅ Progress: ${processed}/${productUrls.length} pages processed, ${this.products.length} valid products found`);
                }
                
                // Small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (error) {
                console.error(`⚠️ Error scraping ${url}:`, error.message);
            }
        }
        
        console.log(`🎉 Individual product scraping complete: ${this.products.length} valid products found`);
    }

    async scrapeProductPage(url) {
        try {
            const response = await axios.get(url, { 
                headers: this.headers,
                timeout: 10000
            });
            
            const $ = cheerio.load(response.data);
            
            // Check if this is actually a product page
            if (!this.isProductPage($)) {
                return null;
            }
            
            const product = {
                url: url,
                sku: this.extractSKU($),
                name: this.extractProductName($),
                price: this.extractPrice($),
                comparePrice: this.extractComparePrice($),
                description: this.extractDescription($),
                shortDescription: this.extractShortDescription($),
                brand: this.extractBrand($),
                category: this.extractCategory($),
                images: this.extractImages($),
                inStock: this.checkStock($),
                weight: this.extractWeight($),
                ingredients: this.extractIngredients($),
                healthCategories: []
            };
            
            // Clean up the product data
            product.name = this.cleanText(product.name);
            product.description = this.cleanText(product.description);
            product.shortDescription = this.cleanText(product.shortDescription);
            
            // Categorize by health conditions
            product.healthCategories = this.categorizeByHealth(product.name, product.description);
            
            return product;
            
        } catch (error) {
            console.error(`Error scraping product page ${url}:`, error.message);
            return null;
        }
    }

    isProductPage($) {
        const indicators = [
            $('h1').length > 0 && $('h1').text().includes('SKU:'),
            $('.product-details').length > 0,
            $('.product-price').length > 0,
            $('body').text().includes('Add to Cart'),
            $('h1').length > 0 && $('h1').text().trim().length > 0,
            $('body').text().includes('$')
        ];
        
        return indicators.some(indicator => indicator);
    }

    extractSKU($) {
        const skuText = $('h1').text();
        const skuMatch = skuText.match(/SKU:\s*([A-Za-z0-9\-]+)/);
        return skuMatch ? skuMatch[1] : this.generateSKU($('h1').text());
    }

    extractProductName($) {
        const h1Text = $('h1').text().trim();
        // Remove SKU from the name
        return h1Text.replace(/\s*SKU:\s*[A-Za-z0-9\-]+.*$/, '').trim();
    }

    extractPrice($) {
        const priceSelectors = [
            '.product-price',
            '.price',
            'h1 + *'
        ];
        
        for (const selector of priceSelectors) {
            const priceText = $(selector).text();
            const priceMatch = priceText.match(/\$(\d+\.?\d*)/);
            if (priceMatch) {
                return parseFloat(priceMatch[1]);
            }
        }
        
        // Fallback: search entire body for price
        const bodyText = $('body').text();
        const priceMatch = bodyText.match(/\$(\d+\.?\d*)/);
        return priceMatch ? parseFloat(priceMatch[1]) : 0;
    }

    extractComparePrice($) {
        const comparePriceSelectors = [
            '.compare-price',
            '.original-price',
            '.was-price'
        ];
        
        for (const selector of comparePriceSelectors) {
            const priceText = $(selector).text();
            const priceMatch = priceText.match(/\$(\d+\.?\d*)/);
            if (priceMatch) {
                return parseFloat(priceMatch[1]);
            }
        }
        
        return 0;
    }

    extractDescription($) {
        // Try multiple selectors for description
        const selectors = [
            '.product-description',
            '.description',
            '.product-details',
            '.product-info',
            '.product-content',
            '[itemprop="description"]',
            '.product-text',
            'p:contains("Description")',
            '.entry-content'
        ];
        
        for (const selector of selectors) {
            const text = $(selector).text().trim();
            if (text && text.length > 50) { // Only use if substantial content
                return text;
            }
        }
        
        // Fallback: look for paragraphs after the product name/price
        const h1 = $('h1').first();
        if (h1.length) {
            let description = '';
            h1.nextAll('p, div').each((i, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 20 && !text.includes('$') && !text.includes('Add to Cart')) {
                    description += text + ' ';
                    if (description.length > 500) return false; // Stop after enough content
                }
            });
            if (description.trim().length > 50) {
                return description.trim();
            }
        }
        
        return '';
    }

    extractShortDescription($) {
        const selectors = [
            '.product-summary',
            '.short-description',
            '.product-excerpt',
            '.product-intro',
            'meta[name="description"]'
        ];
        
        for (const selector of selectors) {
            let text = '';
            if (selector.startsWith('meta')) {
                text = $(selector).attr('content') || '';
            } else {
                text = $(selector).text().trim();
            }
            if (text && text.length > 10) {
                return text;
            }
        }
        
        // Use first paragraph as short description if available
        const firstP = $('h1').next('p').text().trim();
        if (firstP && firstP.length > 10 && firstP.length < 200) {
            return firstP;
        }
        
        return '';
    }

    extractBrand($) {
        return $('.product-brand').text().trim() || 
               $('.brand').text().trim() || '';
    }

    extractCategory($) {
        return $('.product-category').text().trim() || 
               $('.category').text().trim() || '';
    }

    extractImages($) {
        const images = [];
        const seenUrls = new Set();
        
        // Look for product images in various locations
        const imageSelectors = [
            '.product-image img',
            '.product-photos img',
            '.product-gallery img',
            '.product-images img',
            '.main-image img',
            '.product-img img',
            '.product-thumbnails img',
            '[itemprop="image"]',
            '.gallery img',
            '.slideshow img'
        ];
        
        // First, get images from specific product image containers
        imageSelectors.forEach(selector => {
            $(selector).each((i, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
                if (src) {
                    const fullUrl = src.startsWith('http') ? src : 
                                   src.startsWith('//') ? `https:${src}` :
                                   src.startsWith('/') ? `${this.baseUrl}${src}` :
                                   `${this.baseUrl}/${src}`;
                    
                    if (!seenUrls.has(fullUrl)) {
                        seenUrls.add(fullUrl);
                        images.push({
                            url: fullUrl,
                            alt: $(el).attr('alt') || $(el).attr('title') || ''
                        });
                    }
                }
            });
        });
        
        // If no images found in specific containers, look for any images that might be product-related
        if (images.length === 0) {
            $('img').each((i, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
                if (src && (src.includes('product') || src.includes('cache') || src.includes('application/files'))) {
                    const fullUrl = src.startsWith('http') ? src : 
                                   src.startsWith('//') ? `https:${src}` :
                                   src.startsWith('/') ? `${this.baseUrl}${src}` :
                                   `${this.baseUrl}/${src}`;
                    
                    if (!seenUrls.has(fullUrl) && !src.includes('logo') && !src.includes('icon')) {
                        seenUrls.add(fullUrl);
                        images.push({
                            url: fullUrl,
                            alt: $(el).attr('alt') || $(el).attr('title') || ''
                        });
                    }
                }
            });
        }
        
        return images;
    }

    checkStock($) {
        const stockText = $('body').text().toLowerCase();
        return !stockText.includes('out of stock') && !stockText.includes('not available');
    }

    extractWeight($) {
        const weightSelectors = ['.weight', '.product-weight'];
        for (const selector of weightSelectors) {
            const weight = $(selector).text().trim();
            if (weight) return weight;
        }
        return '';
    }

    extractIngredients($) {
        return $('.ingredients').text().trim() || 
               $('.supplement-facts').text().trim() || '';
    }

    categorizeByHealth(name, description) {
        const text = `${name} ${description}`.toLowerCase();
        const healthCategories = [];
        
        const categoryMap = {
            'Blood Pressure': ['blood pressure', 'hypertension', 'cardiovascular'],
            'Heart Health': ['heart', 'cardiac', 'cardio', 'circulation'],
            'Digestive Health': ['digestive', 'digestion', 'stomach', 'gut', 'probiotic'],
            'Joint & Arthritis': ['joint', 'arthritis', 'mobility', 'inflammation'],
            'Immune Support': ['immune', 'immunity', 'defense', 'antioxidant'],
            'Stress & Anxiety': ['stress', 'anxiety', 'calm', 'relaxation'],
            'Sleep Support': ['sleep', 'insomnia', 'rest', 'melatonin'],
            'Energy & Vitality': ['energy', 'vitality', 'fatigue', 'endurance'],
            'Brain Health': ['brain', 'cognitive', 'memory', 'focus'],
            'Women\'s Health': ['women', 'female', 'menstrual', 'menopause'],
            'Men\'s Health': ['men', 'male', 'prostate', 'testosterone'],
            'Pet Health': ['pet', 'dog', 'cat', 'animal'],
            'Weight Management': ['weight', 'diet', 'metabolism', 'carb blocker'],
            'Skin Health': ['skin', 'dermal', 'complexion', 'cream'],
            'Eye Health': ['eye', 'vision', 'sight', 'ocular'],
            'Liver Support': ['liver', 'hepatic', 'detox', 'cleanse'],
            'Respiratory Health': ['respiratory', 'lung', 'breathing', 'airway'],
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

    generateSKU(text) {
        if (!text) return 'HM-UNKNOWN';
        return `HM-${text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 20)}`;
    }

    async saveResults() {
        console.log('💾 Saving complete scraped data...');
        
        // Save as JSON
        const jsonData = {
            products: this.products,
            categories: [],
            brands: [],
            scrapedAt: new Date().toISOString(),
            totalProducts: this.products.length,
            totalUrlsFound: this.allProductUrls.size
        };
        
        await fs.writeFile(
            path.join(__dirname, '../data/complete-scraped-products.json'),
            JSON.stringify(jsonData, null, 2)
        );
        
        // Save as CSV for import
        const csvData = this.convertToCSV();
        await fs.writeFile(
            path.join(__dirname, '../data/complete-scraped-products.csv'),
            csvData
        );
        
        console.log('✅ Complete data saved to complete-scraped-products.json and complete-scraped-products.csv');
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
            product.inStock ? 50 : 0,
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
    const scraper = new EnhancedHMHerbsScraper();
    scraper.scrapeAllProducts()
        .then(() => {
            console.log('🎉 COMPLETE scraping finished successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 COMPLETE scraping failed:', error);
            process.exit(1);
        });
}

module.exports = EnhancedHMHerbsScraper;

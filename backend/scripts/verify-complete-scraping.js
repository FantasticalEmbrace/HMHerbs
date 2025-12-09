// Verification script to ensure we got ALL products from HM Herbs
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;

async function verifyCompleteScraping() {
    console.log('🔍 VERIFICATION: Checking if we got ALL products from HM Herbs...');
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    
    // Step 1: Re-scan all pages to count total unique product URLs
    const allProductUrls = new Set();
    let totalPagesFound = 0;
    
    console.log('📄 Re-scanning all pages to verify product count...');
    
    for (let page = 1; page <= 50; page++) { // Check up to page 50 to be extra sure
        try {
            const url = page === 1 
                ? 'https://hmherbs.com/index.php/products'
                : `https://hmherbs.com/index.php/products?ccm_paging_p=${page}`;
            
            console.log(`📄 Verifying page ${page}...`);
            
            const response = await axios.get(url, { headers, timeout: 10000 });
            const $ = cheerio.load(response.data);
            
            // Count products on this page
            let productsOnPage = 0;
            const selectors = [
                'a[href*="/index.php/products/"]',
                'a[href*="/products/"]'
            ];
            
            selectors.forEach(selector => {
                $(selector).each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.includes('/products/') && !href.includes('?ccm_paging_p=')) {
                        const fullUrl = href.startsWith('http') ? href : `https://hmherbs.com${href}`;
                        if (!allProductUrls.has(fullUrl)) {
                            allProductUrls.add(fullUrl);
                            productsOnPage++;
                        }
                    }
                });
            });
            
            console.log(`   Found ${productsOnPage} new products on page ${page} (${allProductUrls.size} total)`);
            
            if (productsOnPage === 0) {
                console.log(`   No products found on page ${page}, stopping scan...`);
                totalPagesFound = page - 1;
                break;
            }
            
            totalPagesFound = page;
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 300));
            
        } catch (error) {
            console.log(`   Error on page ${page}: ${error.message}`);
            totalPagesFound = page - 1;
            break;
        }
    }
    
    console.log(`\n📊 VERIFICATION RESULTS:`);
    console.log(`   Total pages with products: ${totalPagesFound}`);
    console.log(`   Total unique product URLs found: ${allProductUrls.size}`);
    
    // Step 2: Compare with our scraped data
    try {
        const scrapedData = JSON.parse(await fs.readFile('../data/complete-scraped-products.json', 'utf8'));
        console.log(`   Products in our scraped file: ${scrapedData.totalProducts}`);
        console.log(`   URLs found in our scraped file: ${scrapedData.totalUrlsFound}`);
        
        const difference = allProductUrls.size - scrapedData.totalProducts;
        
        if (difference === 0) {
            console.log(`\n✅ PERFECT MATCH! We got all ${allProductUrls.size} products!`);
        } else if (difference > 0) {
            console.log(`\n⚠️  MISSING PRODUCTS! We're missing ${difference} products.`);
            console.log(`   Need to scrape ${difference} more products.`);
            
            // Find which URLs we're missing
            const scrapedUrls = new Set(scrapedData.products.map(p => p.url));
            const missingUrls = Array.from(allProductUrls).filter(url => !scrapedUrls.has(url));
            
            console.log(`\n🔍 Missing product URLs:`);
            missingUrls.slice(0, 10).forEach((url, i) => {
                console.log(`   ${i + 1}. ${url}`);
            });
            
            if (missingUrls.length > 10) {
                console.log(`   ... and ${missingUrls.length - 10} more`);
            }
            
            // Save missing URLs for targeted scraping
            await fs.writeFile('../data/missing-product-urls.json', JSON.stringify(missingUrls, null, 2));
            console.log(`\n💾 Saved missing URLs to missing-product-urls.json`);
            
        } else {
            console.log(`\n🤔 We have MORE products than expected. This might include duplicates or non-product pages.`);
        }
        
    } catch (error) {
        console.error('Error reading scraped data:', error.message);
    }
    
    // Step 3: Sample a few random product URLs to verify they're real products
    console.log(`\n🎯 Sampling random products to verify quality...`);
    const urlArray = Array.from(allProductUrls);
    const sampleUrls = [];
    for (let i = 0; i < Math.min(5, urlArray.length); i++) {
        const randomIndex = Math.floor(Math.random() * urlArray.length);
        sampleUrls.push(urlArray[randomIndex]);
    }
    
    for (const url of sampleUrls) {
        try {
            const response = await axios.get(url, { headers, timeout: 10000 });
            const $ = cheerio.load(response.data);
            const title = $('h1').text().trim();
            const hasPrice = $('body').text().includes('$');
            const hasAddToCart = $('body').text().includes('Add to Cart');
            
            console.log(`   ✓ ${url.split('/').pop()}: "${title}" (Price: ${hasPrice}, Cart: ${hasAddToCart})`);
        } catch (error) {
            console.log(`   ✗ ${url}: Error - ${error.message}`);
        }
    }
    
    console.log(`\n🏁 VERIFICATION COMPLETE!`);
    return {
        totalUrlsFound: allProductUrls.size,
        totalPagesScanned: totalPagesFound,
        allUrls: Array.from(allProductUrls)
    };
}

// Run verification
verifyCompleteScraping()
    .then(results => {
        console.log(`\n📋 FINAL SUMMARY:`);
        console.log(`   Total unique product URLs: ${results.totalUrlsFound}`);
        console.log(`   Total pages scanned: ${results.totalPagesScanned}`);
        process.exit(0);
    })
    .catch(error => {
        console.error('Verification failed:', error);
        process.exit(1);
    });

// Scrape reviews/testimonials from hmherbs.com
const https = require('https');
const cheerio = require('cheerio');

const baseUrl = 'https://hmherbs.com';

// Function to fetch and parse HTML
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Function to extract reviews from a page
function extractReviews(html) {
    const $ = cheerio.load(html);
    const reviews = [];

    // Try multiple selectors that might contain reviews/testimonials
    // Common patterns: testimonials, reviews, customer feedback sections
    
    // Look for testimonial/review sections
    $('.testimonial, .review, [class*="testimonial"], [class*="review"], [id*="testimonial"], [id*="review"]').each((i, elem) => {
        const $elem = $(elem);
        
        // Try to extract review text
        const text = $elem.find('p, .review-text, .testimonial-text, blockquote').first().text().trim();
        const author = $elem.find('.author, .name, .reviewer, h4, h5, .customer-name').first().text().trim();
        const rating = $elem.find('.rating, .stars, [class*="star"]').length || 
                      ($elem.find('.fa-star.filled, .fa-star.active').length) ||
                      ($elem.text().match(/[1-5]\s*(star|out of)/i) ? 5 : null);
        
        if (text && text.length > 20) { // Only include substantial reviews
            reviews.push({
                text: text,
                author: author || 'Customer',
                rating: rating || 5
            });
        }
    });

    // Also look for structured review data in JSON-LD or data attributes
    $('script[type="application/ld+json"]').each((i, elem) => {
        try {
            const json = JSON.parse($(elem).html());
            if (json['@type'] === 'Review' || (Array.isArray(json) && json.some(item => item['@type'] === 'Review'))) {
                const reviewData = Array.isArray(json) ? json.find(item => item['@type'] === 'Review') : json;
                if (reviewData.reviewBody || reviewData.reviewText) {
                    reviews.push({
                        text: reviewData.reviewBody || reviewData.reviewText,
                        author: reviewData.author?.name || 'Customer',
                        rating: reviewData.reviewRating?.ratingValue || 5
                    });
                }
            }
        } catch (e) {
            // Not valid JSON, skip
        }
    });

    return reviews;
}

// Main function to scrape reviews
async function scrapeReviews() {
    try {
        console.log('🔍 Scraping reviews from hmherbs.com...\n');
        
        // Try common pages where reviews might be
        const pagesToCheck = [
            '/',
            '/testimonials',
            '/reviews',
            '/about',
            '/customer-reviews'
        ];

        const allReviews = [];
        const seenReviews = new Set();

        for (const page of pagesToCheck) {
            try {
                console.log(`📄 Checking ${baseUrl}${page}...`);
                const html = await fetchHTML(`${baseUrl}${page}`);
                const reviews = extractReviews(html);
                
                reviews.forEach(review => {
                    // Create a unique key to avoid duplicates
                    const key = review.text.substring(0, 50).toLowerCase();
                    if (!seenReviews.has(key) && review.text.length > 20) {
                        seenReviews.add(key);
                        allReviews.push(review);
                        console.log(`  ✓ Found review from ${review.author}`);
                    }
                });
                
                // Small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.log(`  ⚠️  Error checking ${page}: ${error.message}`);
            }
        }

        // If no reviews found, try to find any customer feedback in the HTML
        if (allReviews.length === 0) {
            console.log('\n🔍 No reviews found in standard locations. Checking homepage for any testimonials...');
            try {
                const html = await fetchHTML(baseUrl);
                const $ = cheerio.load(html);
                
                // Look for any text that might be testimonials (quotes, customer names, etc.)
                $('section, div').each((i, elem) => {
                    const $elem = $(elem);
                    const text = $elem.text();
                    
                    // Look for patterns like quotes with names
                    const quoteMatch = text.match(/"([^"]{50,})"\s*[-–—]\s*([A-Z][a-z]+\s+[A-Z]\.?)/);
                    if (quoteMatch) {
                        const key = quoteMatch[1].substring(0, 50).toLowerCase();
                        if (!seenReviews.has(key)) {
                            seenReviews.add(key);
                            allReviews.push({
                                text: quoteMatch[1],
                                author: quoteMatch[2],
                                rating: 5
                            });
                            console.log(`  ✓ Found review from ${quoteMatch[2]}`);
                        }
                    }
                });
            } catch (error) {
                console.log(`  ⚠️  Error: ${error.message}`);
            }
        }

        console.log(`\n✅ Found ${allReviews.length} unique reviews\n`);
        
        // Output reviews as JSON
        console.log(JSON.stringify(allReviews, null, 2));
        
        return allReviews;
    } catch (error) {
        console.error('❌ Error scraping reviews:', error);
        process.exit(1);
    }
}

// Run the scraper
scrapeReviews();


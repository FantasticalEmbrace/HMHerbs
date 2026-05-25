// Detailed scraper to find reviews/testimonials from hmherbs.com
const https = require('https');
const cheerio = require('cheerio');
const fs = require('fs');

const baseUrl = 'https://hmherbs.com';

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

async function scrapeReviews() {
    try {
        console.log('🔍 Scraping reviews from hmherbs.com...\n');
        
        // Fetch homepage
        const html = await fetchHTML(baseUrl);
        const $ = cheerio.load(html);
        
        // Save HTML for inspection
        fs.writeFileSync('hmherbs-homepage.html', html);
        console.log('📄 Saved homepage HTML to hmherbs-homepage.html for inspection\n');
        
        const reviews = [];
        const seenTexts = new Set();
        
        // Look for any section that might contain testimonials
        $('section, div, article').each((i, elem) => {
            const $elem = $(elem);
            const text = $elem.text().trim();
            const htmlContent = $elem.html() || '';
            
            // Look for patterns that indicate reviews/testimonials
            // Pattern 1: Quoted text followed by a name
            const quotePattern = /"([^"]{30,200})"\s*[-–—]?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?)/g;
            let match;
            while ((match = quotePattern.exec(text)) !== null) {
                const reviewText = match[1].trim();
                const author = match[2].trim();
                const key = reviewText.substring(0, 50).toLowerCase();
                
                if (!seenTexts.has(key) && reviewText.length > 30) {
                    seenTexts.add(key);
                    reviews.push({
                        text: reviewText,
                        author: author,
                        rating: 5
                    });
                    console.log(`✓ Found: "${reviewText.substring(0, 50)}..." - ${author}`);
                }
            }
            
            // Pattern 2: Text with star ratings nearby
            if (htmlContent.includes('star') || htmlContent.includes('rating') || htmlContent.includes('review')) {
                const paragraphs = $elem.find('p');
                paragraphs.each((j, p) => {
                    const pText = $(p).text().trim();
                    const nextSibling = $(p).next();
                    const nextText = nextSibling.text().trim();
                    
                    // Check if this looks like a review
                    if (pText.length > 30 && pText.length < 500 && 
                        (nextText.match(/^[A-Z][a-z]+\s+[A-Z]\.?$/) || 
                         nextSibling.find('.rating, .stars, [class*="star"]').length > 0)) {
                        const key = pText.substring(0, 50).toLowerCase();
                        if (!seenTexts.has(key)) {
                            seenTexts.add(key);
                            const author = nextText.match(/^[A-Z][a-z]+\s+[A-Z]\.?$/) ? nextText : 'Customer';
                            reviews.push({
                                text: pText,
                                author: author,
                                rating: 5
                            });
                            console.log(`✓ Found: "${pText.substring(0, 50)}..." - ${author}`);
                        }
                    }
                });
            }
        });
        
        // Also check for any h4/h5 elements that might be author names
        $('h4, h5').each((i, elem) => {
            const $elem = $(elem);
            const authorName = $elem.text().trim();
            const prevSibling = $elem.prev();
            const prevText = prevSibling.text().trim();
            
            // If previous element has substantial text and this looks like a name
            if (authorName.match(/^[A-Z][a-z]+\s+[A-Z]\.?$/) && prevText.length > 30 && prevText.length < 500) {
                const key = prevText.substring(0, 50).toLowerCase();
                if (!seenTexts.has(key)) {
                    seenTexts.add(key);
                    reviews.push({
                        text: prevText,
                        author: authorName,
                        rating: 5
                    });
                    console.log(`✓ Found: "${prevText.substring(0, 50)}..." - ${authorName}`);
                }
            }
        });
        
        console.log(`\n✅ Found ${reviews.length} reviews\n`);
        console.log(JSON.stringify(reviews, null, 2));
        
        return reviews;
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

scrapeReviews();


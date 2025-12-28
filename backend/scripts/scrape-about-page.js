const https = require('https');
const cheerio = require('cheerio');

const url = 'https://hmherbs.com/index.php/company/about';

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        const $ = cheerio.load(data);
        
        // Try to find the main content area
        let aboutContent = '';
        
        // Try various selectors
        const selectors = [
            '#content',
            '.about-content',
            '.main-content',
            'article',
            '.page-content',
            '.content',
            'main',
            '.container'
        ];
        
        for (const selector of selectors) {
            const content = $(selector).first();
            if (content.length > 0 && content.text().trim().length > 100) {
                aboutContent = content.html();
                console.log(`Found content using selector: ${selector}`);
                break;
            }
        }
        
        // If no specific content found, get body text
        if (!aboutContent || aboutContent.length < 100) {
            // Remove script and style tags
            $('script, style, nav, header, footer').remove();
            aboutContent = $('body').html();
        }
        
        // Extract text content
        const textContent = $('body').text().replace(/\s+/g, ' ').trim();
        
        console.log('\n=== ABOUT PAGE CONTENT ===\n');
        console.log('Full HTML length:', aboutContent ? aboutContent.length : 0);
        console.log('\nText content (first 3000 chars):\n');
        console.log(textContent.substring(0, 3000));
        console.log('\n\n=== STRUCTURED CONTENT ===\n');
        
        // Try to extract structured sections
        $('h1, h2, h3').each((i, el) => {
            const heading = $(el).text().trim();
            const nextContent = $(el).nextUntil('h1, h2, h3').text().trim().substring(0, 200);
            if (heading && heading.length > 0) {
                console.log(`\n${heading}:`);
                console.log(nextContent);
            }
        });
        
        // Save to file
        const fs = require('fs');
        fs.writeFileSync('about-page-content.html', aboutContent || '');
        fs.writeFileSync('about-page-text.txt', textContent);
        console.log('\n\nContent saved to about-page-content.html and about-page-text.txt');
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});


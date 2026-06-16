#!/usr/bin/env node
/**
 * Search hmherbs.com product pages and regalabs.com for COA/download links
 * for CBD products missing coa_url.
 */
const MISSING = [
    { slug: 'regalabs-cannabis-oil-for-pets', hmherbs: ['regalabs-cannabis-oil-pets'], regalabs: 'organic-pet-cannabis-oil' },
    { slug: 'regalabs-full-spectrum-cbd-gummies', hmherbs: ['regalabs-cbd-gummies-1', 'regalabs-cbd-gummies'], regalabs: 'cbd-gummies-25mg' }
];

function extractLinks(html) {
    const out = new Set();
    const patterns = [
        /download_file\/view\/[^"'\s<>]+/gi,
        /https?:\/\/[^"'\s<>]+\.pdf/gi,
        /href=["']([^"']*(?:coa|certificate|lab|download)[^"']*)["']/gi
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(html)) !== null) {
            out.add(m[1] || m[0]);
        }
    }
    return [...out];
}

async function fetchHtml(url) {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 HMHerbsCOA/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

(async () => {
    for (const item of MISSING) {
        console.log(`\n=== ${item.slug} ===`);
        for (const path of item.hmherbs || []) {
            const url = `https://hmherbs.com/index.php/products/${path}`;
            try {
                const html = await fetchHtml(url);
                const links = extractLinks(html);
                console.log(`  hmherbs ${path}: ${links.length ? links.join('\n    ') : '(no links)'}`);
            } catch (e) {
                console.log(`  hmherbs ${path}: ERR ${e.message}`);
            }
        }
        if (item.regalabs) {
            const url = `https://www.regalabs.com/products/${item.regalabs}`;
            try {
                const html = await fetchHtml(url);
                const links = extractLinks(html);
                console.log(`  regalabs ${item.regalabs}: ${links.length ? links.join('\n    ') : '(no links)'}`);
            } catch (e) {
                console.log(`  regalabs ${item.regalabs}: ERR ${e.message}`);
            }
        }
    }
})().catch((e) => {
    console.error(e);
    process.exit(1);
});

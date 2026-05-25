/**
 * Single source of truth for storefront catalog image/price overrides.
 * Used by server.js (API responses) and maintenance scripts (reports, sync, heal).
 */

/** Old Concrete CMS thumbnail URLs often 404. Fallback when no override applies. */
const DEFAULT_FALLBACK_PRODUCT_IMAGE = '/images/products/nature-s-puls-probiotic-mega.jpg';

const CATALOG_PRIMARY_IMAGE_BY_SLUG = {
    'hemp-bombs-cbd-gummies-w-mushroom': '/images/products/hemp-bombs-focus-30ct-cbd-mushroom-gummies-official.jpg',
    'irwin-libido-max-red': '/images/products/irwin-libido-max-red-official.webp',
    'irwin-magnesium-pm': '/images/products/irwin-magnesium-pm-60ct-official.webp',
    'irwin-magnesium-w-milk-thistle-turmeric': '/images/products/irwin-magnesium-milk-thistle-turmeric-60ct-official.webp',
    'life-ext': '/images/products/life-extension-two-per-day-120-caps-official.png',
    'life-ext-huperzine-a': '/images/products/life-extension-huperzine-a-official.png',
    'life-ext-d-l-phenylalanine-500mg': '/images/products/life-extension-dlpa-500mg-official.png',
    'life-ext-enhanced-sleep': '/images/products/life-extension-enhanced-sleep-30-caps-official.png',
    'life-ext-immune-packs-c-d-zine-probiotic': '/images/products/life-extension-immune-packs-30-official.png',
    'life-ext-immune-packs-c-d-zinc-probiotic': '/images/products/life-extension-immune-packs-30-official.png',
    'life-ext-vitamin-b3-niacin': '/images/products/life-extension-vitamin-b3-niacin-official.png',
    'life-extension-vitamin-c-liposomal': '/images/products/life-extension-liposomal-vitamin-c-official.png',
    'life-flo-magnesium-oil-spray-with-aloe-vera': '/images/products/life-flo-magnesium-oil-aloe-official.png',
    'life-flo-pure-magnesium-oil-spray': '/images/products/life-flo-pure-magnesium-oil-official.png',
    'nature-s-plus-ageloss-eye-support': '/images/products/natures-plus-ageloss-eye-support-official.png',
    'nature-s-plus-ageloss-first-day-inflammation-response':
        '/images/products/natures-plus-ageloss-first-day-inflammation-official.png',
    'nature-s-plus-ageloss-kidney-support': '/images/products/natures-plus-ageloss-kidney-support-official.png',
    'now-c-1000-zinc-d-3': '/images/products/now-foods-c-1000-zinc-d-3-official.jpg',
    'now-c-1000-zinc-and-d-3': '/images/products/now-foods-c-1000-zinc-d-3-official.jpg',
    'now-foods-coq10-100mg': '/images/products/now-foods-coq10-100mg-official.jpg',
    'now-foods-magtein': '/images/products/now-foods-magtein-id1519-hmherbs-primary.png',
    'now-foods-magtein-1': '/images/products/now-foods-magtein-id1519-hmherbs-primary.png',
    'now-foods-magtein-magnesium-l-threonate': '/images/products/now-foods-magtein-id1519-hmherbs-primary.png',
    'now-foods-magtein-magnesium-l-threonate-1': '/images/products/now-foods-magtein-id1519-hmherbs-primary.png',
    'herbs-for-life-cbd-gummies-30mg': '/images/products/herbs-for-life-cbd-gummies-30mg-id1309-hmherbs-primary.jpg',
    'herbs-for-life-cbd-gummies-sleep': '/images/products/herbs-for-life-cbd-gummies-sleep-id1310-hmherbs-primary.webp',
    'herbs-for-life-delta-8-gummies': '/images/products/herbs-for-life-delta-8-gummies-id1311-hmherbs-primary.jpg',
    'herbs-for-life-delta-9-gummies-10mg-ea': '/images/products/herbs-for-life-delta-9-gummies-10mg-ea-id1312-hmherbs-primary.jpg',
    // Use real JPEG/PNG bytes — *-hmherbs-primary.jpg for these SKUs was WebP mislabeled as .jpg (browsers won't decode).
    'now-foods-nutraflora-fos': '/images/products/now-foods-nutraflora-fos.png',
    'now-glutathione-250mg': '/images/products/now-glutathione-250mg.jpg',
    'now-liquid-chlorophyll-mint-4oz': '/images/products/now-liquid-chlorophyll-mint-4oz.jpg'
};

const CATALOG_PRIMARY_IMAGE_BY_SKU = {
    '28706': '/images/products/irwin-libido-max-red-official.webp',
    '28708': '/images/products/irwin-magnesium-pm-60ct-official.webp',
    '28707': '/images/products/irwin-magnesium-milk-thistle-turmeric-60ct-official.webp',
    '28701': '/images/products/life-extension-two-per-day-120-caps-official.png',
    '28702': '/images/products/life-extension-huperzine-a-official.png',
    '28703': '/images/products/life-extension-dlpa-500mg-official.png',
    '28704': '/images/products/life-extension-enhanced-sleep-30-caps-official.png',
    '28705': '/images/products/life-extension-immune-packs-30-official.png',
    '18615': '/images/products/natures-plus-ageloss-eye-support-official.png',
    '18103': '/images/products/natures-plus-ageloss-first-day-inflammation-official.png',
    '18491': '/images/products/natures-plus-ageloss-kidney-support-official.png',
    '28700': '/images/products/life-extension-vitamin-b3-niacin-official.png',
    '28686': '/images/products/life-extension-liposomal-vitamin-c-official.png',
    '28698': '/images/products/life-flo-magnesium-oil-aloe-official.png',
    '28697': '/images/products/life-flo-pure-magnesium-oil-official.png',
    '51265': '/images/products/hemp-bombs-focus-30ct-cbd-mushroom-gummies-official.jpg',
    '28694': '/images/products/now-foods-c-1000-zinc-d-3-official.jpg',
    '28693': '/images/products/now-foods-coq10-100mg-official.jpg',
    '28699': '/images/products/now-foods-magtein-id1519-hmherbs-primary.png',
    '2394': '/images/products/now-foods-magtein-id1519-hmherbs-primary.png',
    '26671': '/images/products/now-foods-magtein-id1519-hmherbs-primary.png',
    /** Herbs For Life — hyphenated SKUs and numeric forms (leading zeros normalize via canonicalSku) */
    '58172-CB': '/images/products/herbs-for-life-cbd-gummies-sleep-id1310-hmherbs-primary.webp',
    '4592': '/images/products/herbs-for-life-cbd-gummies-30mg-id1309-hmherbs-primary.jpg',
    '4778': '/images/products/herbs-for-life-delta-8-gummies-id1311-hmherbs-primary.jpg',
    '8851': '/images/products/herbs-for-life-delta-9-gummies-10mg-ea-id1312-hmherbs-primary.jpg',
    '28673': '/images/products/now-foods-nutraflora-fos.png',
    '28696': '/images/products/now-glutathione-250mg.jpg',
    '28709': '/images/products/now-liquid-chlorophyll-mint-4oz.jpg'
};

const CATALOG_PRICE_BY_SKU = {
    '28706': 23.99,
    '28708': 19.99,
    '28707': 26.99,
    '28701': 19.13,
    '28702': 30.0,
    '28703': 14.25,
    '28704': 16.5,
    '28705': 31.5,
    '18615': 49.95,
    '18103': 59.95,
    '18491': 42.95,
    '28700': 6.0,
    '28686': 21.99,
    '28698': 15.39,
    '28697': 7.29,
    '28694': 15.99,
    '28693': 24.99,
    '28699': 59.99,
    '2394': 59.99,
    '26671': 59.99,
    /** NOW Foods — hmherbs.com lists $0; typical retail (verify periodically) */
    '28673': 14.99,
    '28696': 22.99,
    '28709': 14.99
};

function catalogPrimaryImageForSlug(slug) {
    if (!slug || typeof slug !== 'string') return null;
    const s = slug.trim();
    return CATALOG_PRIMARY_IMAGE_BY_SLUG[s] || null;
}

function canonicalSkuForCatalog(sku) {
    if (sku === undefined || sku === null) return '';
    const t = String(sku).trim();
    if (!t) return '';
    const asNum = Number(t);
    if (Number.isFinite(asNum) && asNum >= 0 && asNum === Math.floor(asNum)) {
        return String(Math.floor(asNum));
    }
    const tail = t.match(/(\d{4,6})$/);
    if (tail) return tail[1];
    return t;
}

function catalogPrimaryImageForProduct(row) {
    if (!row) return null;
    const key = canonicalSkuForCatalog(row.sku);
    if (key && Object.prototype.hasOwnProperty.call(CATALOG_PRIMARY_IMAGE_BY_SKU, key)) {
        return CATALOG_PRIMARY_IMAGE_BY_SKU[key];
    }
    return catalogPrimaryImageForSlug(row.slug);
}

function catalogPriceForSku(sku) {
    const key = canonicalSkuForCatalog(sku);
    if (!key) return null;
    return Object.prototype.hasOwnProperty.call(CATALOG_PRICE_BY_SKU, key) ? CATALOG_PRICE_BY_SKU[key] : null;
}

function applyCatalogPriceFix(row) {
    if (!row) return;
    const fixed = catalogPriceForSku(row.sku);
    if (fixed == null) return;
    const cur = parseFloat(row.price);
    if (!Number.isFinite(cur) || cur === 0) {
        row.price = fixed;
    }
}

/**
 * Scrapes / bad downloads sometimes store trust badges (BBB, etc.) as the "product" image.
 */
function isNonProductMarketingImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    return (
        /\/bbb[\/_.-]/.test(u) ||
        u.includes('bbb.org') ||
        u.includes('better-business-bureau') ||
        u.includes('better.business') ||
        u.includes('accredited-business') ||
        u.includes('accredited.business') ||
        u.includes('bbblink') ||
        u.includes('bbb_rating') ||
        u.includes('bbblogo') ||
        u.includes('bbb-accredited')
    );
}

function sanitizeLegacyProductImageUrl(url, slug = null, sku = null) {
    if (!url || typeof url !== 'string') return url;
    if (isNonProductMarketingImageUrl(url)) {
        return catalogPrimaryImageForProduct({ slug, sku }) || DEFAULT_FALLBACK_PRODUCT_IMAGE;
    }
    if (
        /hmherbs\.com\/application\/files\//i.test(url) ||
        /i0\.wp\.com\/hmherbs\.com\/application\/files\//i.test(url)
    ) {
        return catalogPrimaryImageForProduct({ slug, sku }) || DEFAULT_FALLBACK_PRODUCT_IMAGE;
    }
    return url;
}

/**
 * Same resolution order as GET /api/products for a primary image (catalog → sanitized DB URL).
 */
function storefrontPrimaryImageFromFields({ slug, sku, primaryImageUrl }) {
    const catalog = catalogPrimaryImageForProduct({ slug, sku });
    if (catalog) return catalog;
    const raw = primaryImageUrl != null ? String(primaryImageUrl).trim() : '';
    if (!raw) return null;
    return sanitizeLegacyProductImageUrl(raw, slug, sku);
}

/**
 * Same resolution order as GET /api/products listing (catalog wins, else sanitize DB primary).
 */
function effectivePrimaryImageUrl(row) {
    if (!row) return null;
    const catalog = catalogPrimaryImageForProduct(row);
    if (catalog) return catalog;
    const raw =
        row.primary_image_url != null
            ? String(row.primary_image_url).trim()
            : row.image_url != null
              ? String(row.image_url).trim()
              : '';
    if (!raw) return null;
    return sanitizeLegacyProductImageUrl(raw, row.slug, row.sku);
}

module.exports = {
    DEFAULT_FALLBACK_PRODUCT_IMAGE,
    CATALOG_PRIMARY_IMAGE_BY_SLUG,
    CATALOG_PRIMARY_IMAGE_BY_SKU,
    CATALOG_PRICE_BY_SKU,
    catalogPrimaryImageForSlug,
    canonicalSkuForCatalog,
    catalogPrimaryImageForProduct,
    catalogPriceForSku,
    applyCatalogPriceFix,
    isNonProductMarketingImageUrl,
    sanitizeLegacyProductImageUrl,
    storefrontPrimaryImageFromFields,
    effectivePrimaryImageUrl
};

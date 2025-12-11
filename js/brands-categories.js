/**
 * Brands and Categories Landing Pages
 * Loads and displays brands/categories with animations
 */

class BrandsCategoriesPage {
    constructor() {
        this.apiBaseUrl = this.getApiBaseUrl();
        this.isBrandsPage = window.location.pathname.includes('brands.html');
        this.isCategoriesPage = window.location.pathname.includes('categories.html');
        // Also check if we're on index page with brands section
        this.hasBrandsGrid = document.getElementById('brands-grid') !== null;
        this.init();
    }

    getApiBaseUrl() {
        if (window.location.protocol === 'file:') {
            return 'http://localhost:3001';
        }
        return '';
    }

    async init() {
        if (this.isBrandsPage || this.hasBrandsGrid) {
            await this.loadBrands();
        } else if (this.isCategoriesPage) {
            await this.loadCategories();
        }
    }

    async loadBrands() {
        const grid = document.getElementById('brands-grid');
        if (!grid) return;

        // Use fallback immediately if API is unavailable (file:// protocol)
        if (window.location.protocol === 'file:' || !this.apiBaseUrl) {
            const fallbackBrands = this.getFallbackBrands();
            this.renderBrands(fallbackBrands, grid);
            return;
        }

        try {
            // Set a shorter timeout for faster fallback
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

            const fetchFn = window.fetch || globalThis.fetch;
            const response = await fetchFn(`${this.apiBaseUrl}/api/brands`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error('Failed to load brands');

            const brands = await response.json();
            this.renderBrands(brands, grid);
        } catch (error) {
            // Use fallback immediately on any error
            const fallbackBrands = this.getFallbackBrands();
            this.renderBrands(fallbackBrands, grid);
        }
    }

    async loadCategories() {
        const grid = document.getElementById('categories-grid');
        if (!grid) return;

        // Use fallback immediately if API is unavailable (file:// protocol)
        if (window.location.protocol === 'file:' || !this.apiBaseUrl) {
            const fallbackCategories = this.getFallbackCategories();
            this.renderCategories(fallbackCategories, grid);
            return;
        }

        try {
            // Set a shorter timeout for faster fallback
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

            const fetchFn = window.fetch || globalThis.fetch;
            const response = await fetchFn(`${this.apiBaseUrl}/api/health-categories`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error('Failed to load categories');

            const categories = await response.json();
            this.renderCategories(categories, grid);
        } catch (error) {
            // Use fallback immediately on any error
            const fallbackCategories = this.getFallbackCategories();
            this.renderCategories(fallbackCategories, grid);
        }
    }

    getBrandImagePath(brand) {
        // Map brand names/slugs to image filenames
        const brandImageMap = {
            'standard-enzyme': 'standard-enzyme.jpg',
            'standard enzyme': 'standard-enzyme.jpg',
            'natures-plus': 'natures-plus.jpg',
            'natures plus': 'natures-plus.jpg',
            'global-healing': 'global-healing.jpg',
            'global healing': 'global-healing.jpg',
            'host-defence': 'host-defense.jpg',
            'host defence': 'host-defense.jpg',
            'host-defense': 'host-defense.jpg',
            'host defense': 'host-defense.jpg',
            'hm-enterprise': 'hm-herbs.png',
            'hm enterprise': 'hm-herbs.png',
            'hm-herbs': 'hm-herbs.png',
            'hm herbs': 'hm-herbs.png',
            'terry-naturally': 'terry-naturally.jpg',
            'terry naturally': 'terry-naturally.jpg',
            'unicity': 'unicity.jpg',
            'newton-labs': 'newton-homeopathics.png',
            'newton labs': 'newton-homeopathics.png',
            'newton-homeopathics': 'newton-homeopathics.png',
            'newton homeopathics': 'newton-homeopathics.png',
            'regal-labs': 'regal-labs.jpg',
            'regal labs': 'regal-labs.jpg',
            'doctors-blend': 'doctors-blend.jpg',
            'doctors blend': 'doctors-blend.jpg',
            'doctor\'s-blend': 'doctors-blend.jpg',
            'doctor\'s blend': 'doctors-blend.jpg',
            'ac-grace': 'ac-grace.png',
            'aps': 'APS.jpg',
            'aor': 'APS.jpg',
            'bio-neurix': 'bio-neurix.png',
            'bio neurix': 'bio-neurix.png',
            'edom-labs': 'Edom Labs.jpg',
            'edom labs': 'Edom Labs.jpg',
            'flexcin': 'flexcin-logo.jpg',
            'formor': 'formor.jpg',
            'go-out': 'go-out.jpg',
            'go out': 'go-out.jpg',
            'high-tech-pharmaceuticals': 'High Tech Pharmaceuticals.png',
            'high tech pharmaceuticals': 'High Tech Pharmaceuticals.png',
            'life\'s-fortune': 'life\'s-fortune.jpg',
            'life\'s fortune': 'life\'s-fortune.jpg',
            'lifes-fortune': 'life\'s-fortune.jpg',
            'lifes fortune': 'life\'s-fortune.jpg',
            'life-extension': 'life\'s-fortune.jpg',
            'life extension': 'life\'s-fortune.jpg',
            'natures-balance': 'natures-balance.jpg',
            'natures balance': 'natures-balance.jpg',
            'natures-sunshine': 'natures-sunshine.jpg',
            'natures sunshine': 'natures-sunshine.jpg',
            'now-foods': 'now-foods.jpg',
            'now foods': 'now-foods.jpg',
            'oxy-life': 'oxy-life.png',
            'oxy life': 'oxy-life.png',
            'perrin\'s-naturals': 'perrin\'s-naturals.jpg',
            'perrin\'s naturals': 'perrin\'s-naturals.jpg',
            'perrins-naturals': 'perrin\'s-naturals.jpg',
            'perrins naturals': 'perrin\'s-naturals.jpg',
            'power-thin-phase-2': 'power-thin-phase-II.jpg',
            'power thin phase 2': 'power-thin-phase-II.jpg',
            'powerthin-phase-ii': 'power-thin-phase-II.jpg',
            'powerthin phase ii': 'power-thin-phase-II.jpg',
            'power-thin-phase-ii': 'power-thin-phase-II.jpg',
            'power thin phase ii': 'power-thin-phase-II.jpg',
            'miracle-ii': 'power-thin-phase-II.jpg',
            'miracle ii': 'power-thin-phase-II.jpg',
            'purple-tiger': 'purple-tiger.jpg',
            'purple tiger': 'purple-tiger.jpg',
            'skinny-magic': 'skinny-magic.jpg',
            'skinny magic': 'skinny-magic.jpg',
            'vista-life': 'vista-life.jpg',
            'vista life': 'vista-life.jpg'
        };

        // Try to match by slug first, then by name
        const slug = (brand.slug || brand.name.toLowerCase().replace(/\s+/g, '-')).toLowerCase();
        const name = brand.name.toLowerCase();

        let imageFile = brandImageMap[slug] || brandImageMap[name];

        // If no match found, try to construct filename from slug
        if (!imageFile) {
            // Try common variations
            const variations = [
                slug + '.jpg',
                slug + '.png',
                name.replace(/\s+/g, '-') + '.jpg',
                name.replace(/\s+/g, '-') + '.png'
            ];

            // For now, return null if no match - we'll use a fallback icon
            return null;
        }

        return `images/brand-images/${imageFile}`;
    }

    renderBrands(brands, container) {
        container.innerHTML = '';

        if (brands.length === 0) {
            container.innerHTML = '<div class="loading-state"><p>No brands available</p></div>';
            return;
        }

        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();

        brands.forEach((brand, index) => {
            // Create wrapper to hold card and name
            const wrapper = document.createElement('div');
            wrapper.className = 'brand-item-wrapper';
            wrapper.style.animationDelay = `${index * 0.02}s`;

            const card = document.createElement('a');
            card.href = `products.html?brand=${encodeURIComponent(brand.slug || brand.name.toLowerCase().replace(/\s+/g, '-'))}`;
            card.className = 'brand-card';
            // Add special class for Powerthin Phase II to have black background
            if (brand.slug === 'power-thin-phase-2' || brand.name.toLowerCase().includes('powerthin')) {
                card.className += ' powerthin-card';
            }

            // Try to get brand image, fallback to icon if not found
            const imagePath = this.getBrandImagePath(brand);
            if (imagePath) {
                const img = document.createElement('img');
                img.src = imagePath;
                img.alt = `${brand.name} logo`;
                img.className = 'brand-card-image';
                img.onerror = function () {
                    // If image fails to load, replace with fallback icon
                    const icon = document.createElement('div');
                    icon.className = 'brand-card-icon';
                    icon.innerHTML = '<i class="fas fa-tag" aria-hidden="true"></i>';
                    card.innerHTML = '';
                    card.appendChild(icon);
                };
                card.appendChild(img);
            } else {
                // Fallback to icon if no image found
                const icon = document.createElement('div');
                icon.className = 'brand-card-icon';
                icon.innerHTML = '<i class="fas fa-tag" aria-hidden="true"></i>';
                card.appendChild(icon);
            }

            // Add description overlay that appears on hover
            const descriptionOverlay = document.createElement('div');
            descriptionOverlay.className = 'brand-description-overlay';
            descriptionOverlay.textContent = brand.description || 'Explore products from this trusted brand';
            card.appendChild(descriptionOverlay);

            // Add brand name below the card container
            const brandName = document.createElement('div');
            brandName.className = 'brand-card-name';
            brandName.textContent = brand.name;

            wrapper.appendChild(card);
            wrapper.appendChild(brandName);
            fragment.appendChild(wrapper);
        });

        // Append all at once for better performance
        container.appendChild(fragment);
    }

    renderCategories(categories, container) {
        container.innerHTML = '';

        if (categories.length === 0) {
            container.innerHTML = '<div class="loading-state"><p>No categories available</p></div>';
            return;
        }

        // Icon mapping for categories
        const categoryIcons = {
            'blood-pressure': 'fa-heartbeat',
            'heart-health': 'fa-heart',
            'allergies': 'fa-allergies',
            'digestive-health': 'fa-pills',
            'joint-arthritis': 'fa-bone',
            'immune-support': 'fa-shield-alt',
            'stress-anxiety': 'fa-spa',
            'sleep-support': 'fa-bed',
            'energy-vitality': 'fa-bolt',
            'brain-health': 'fa-brain',
            'womens-health': 'fa-venus',
            'mens-health': 'fa-mars',
            'pet-health': 'fa-paw',
            'weight-management': 'fa-weight',
            'skin-health': 'fa-hand-sparkles',
            'eye-health': 'fa-eye',
            'liver-support': 'fa-leaf',
            'respiratory-health': 'fa-lungs',
            'bone-health': 'fa-bone',
            'anti-aging': 'fa-star'
        };

        categories.forEach((category, index) => {
            const card = document.createElement('a');
            let slug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-');
            // Normalize slug - remove special characters and ensure consistent format
            slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            card.href = `products.html?category=${encodeURIComponent(slug)}`;
            card.className = 'category-card';
            card.style.animationDelay = `${index * 0.05}s`;

            const icon = document.createElement('div');
            icon.className = 'category-card-icon';
            // Try to find icon - check exact match first, then try variations
            let iconClass = categoryIcons[slug];
            if (!iconClass) {
                // Try matching by name if slug doesn't match
                const nameKey = category.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '-');
                iconClass = categoryIcons[nameKey];
            }
            // Fallback to default icon
            iconClass = iconClass || 'fa-layer-group';
            icon.innerHTML = `<i class="fas ${iconClass}" aria-hidden="true"></i>`;

            const title = document.createElement('h3');
            title.className = 'category-card-title';
            title.textContent = category.name;

            const description = document.createElement('p');
            description.className = 'category-card-description';
            description.textContent = category.description || 'Find products for this health condition';

            const arrow = document.createElement('div');
            arrow.className = 'category-card-arrow';
            arrow.innerHTML = '<i class="fas fa-arrow-right" aria-hidden="true"></i>';

            card.appendChild(icon);
            card.appendChild(title);
            card.appendChild(description);
            card.appendChild(arrow);

            container.appendChild(card);
        });
    }

    getFallbackBrands() {
        return [
            { name: 'AC Grace', slug: 'ac-grace', description: 'Premium natural health and wellness products designed to support your overall well-being and vitality.' },
            { name: 'APS', slug: 'aps', description: 'Advanced research-based nutritional supplements formulated with cutting-edge science for optimal health outcomes.' },
            { name: 'Bio Neurix', slug: 'bio-neurix', description: 'Specialized brain health and cognitive support supplements to enhance mental clarity, focus, and memory.' },
            { name: 'Cardio Amaze', slug: 'cardio-amaze', description: 'Comprehensive cardiovascular health supplements designed to support heart function and circulation.' },
            { name: 'Doctors Blend', slug: 'doctors-blend', description: 'Physician-formulated nutritional supplements created by medical professionals for evidence-based health support.' },
            { name: 'Edom Labs', slug: 'edom-labs', description: 'Premium quality nutritional supplements manufactured with the highest standards for purity and potency.' },
            { name: 'Flexcin', slug: 'flexcin', description: 'Advanced joint health and mobility support supplements to help maintain flexibility and reduce joint discomfort.' },
            { name: 'Formor', slug: 'formor', description: 'Natural health and wellness products crafted with traditional ingredients and modern formulations.' },
            { name: 'Global Healing', slug: 'global-healing', description: 'Organic and natural health products sourced from around the world to support holistic wellness.' },
            { name: 'Go Out', slug: 'go-out', description: 'Natural supplements designed to support an active lifestyle and outdoor wellness activities.' },
            { name: 'Herbs for Life', slug: 'herbs-for-life', description: 'Traditional herbal remedies and supplements based on centuries of natural healing wisdom.' },
            { name: 'High Tech Pharmaceuticals', slug: 'high-tech-pharmaceuticals', description: 'Advanced nutritional supplements utilizing pharmaceutical-grade ingredients and cutting-edge formulations.' },
            { name: 'HM Enterprise', slug: 'hm-enterprise', description: 'H&M Herbs proprietary formulations and exclusive products developed for optimal health and wellness.' },
            { name: 'Host Defence', slug: 'host-defence', description: 'Mushroom-based immune support supplements featuring organic, sustainably grown medicinal mushrooms.' },
            { name: 'Life\'s Fortune', slug: 'lifes-fortune', description: 'Anti-aging and longevity supplements designed to support healthy aging and vitality throughout life.' },
            { name: 'Natures Balance', slug: 'natures-balance', description: 'Natural vitamins and supplements formulated to help restore and maintain your body\'s natural balance.' },
            { name: 'Natures Plus', slug: 'natures-plus', description: 'Premium natural vitamins and supplements made with whole food ingredients and advanced nutritional science.' },
            { name: 'Natures Sunshine', slug: 'natures-sunshine', description: 'Premium natural health products backed by over 50 years of research and quality manufacturing standards.' },
            { name: 'Newton Homeopathics', slug: 'newton-labs', description: 'Homeopathic remedies and natural medicines following traditional homeopathic principles for gentle, effective healing.' },
            { name: 'Now Foods', slug: 'now-foods', description: 'Quality natural supplements and foods manufactured with rigorous testing and quality control standards since 1968.' },
            { name: 'Oxy Life', slug: 'oxy-life', description: 'Oxygen-based health and wellness products designed to support cellular health and energy production.' },
            { name: 'Perrin\'s Naturals', slug: 'perrins-naturals', description: 'Natural health and wellness products crafted with care using traditional and modern natural healing methods.' },
            { name: 'Powerthin Phase II', slug: 'power-thin-phase-2', description: 'Advanced weight management and wellness products designed to support healthy metabolism and energy levels.' },
            { name: 'Purple Tiger', slug: 'purple-tiger', description: 'Natural health and wellness products featuring unique formulations for comprehensive wellness support.' },
            { name: 'Regal Labs', slug: 'regal-labs', description: 'Cannabis-based health and wellness products formulated with premium hemp and CBD extracts for natural relief.' },
            { name: 'Skinny Magic', slug: 'skinny-magic', description: 'Weight management and wellness products designed to support healthy weight goals and metabolic function.' },
            { name: 'Standard Enzyme', slug: 'standard-enzyme', description: 'Professional-grade enzyme and nutritional supplements formulated for optimal digestive and systemic health.' },
            { name: 'Terry Naturally', slug: 'terry-naturally', description: 'Clinically studied natural health products backed by scientific research and proven effectiveness.' },
            { name: 'Unicity', slug: 'unicity', description: 'Science-based nutritional supplements developed through extensive research to support optimal health and wellness.' },
            { name: 'Vista Life', slug: 'vista-life', description: 'Natural health and wellness products designed to enhance your quality of life through comprehensive nutritional support.' }
        ];
    }

    getFallbackCategories() {
        return [
            { name: 'Blood Pressure', slug: 'blood-pressure', description: 'Natural supplements to support healthy blood pressure levels' },
            { name: 'Heart Health', slug: 'heart-health', description: 'Cardiovascular support and heart health supplements' },
            { name: 'Allergies', slug: 'allergies', description: 'Natural allergy relief and immune system support' },
            { name: 'Digestive Health', slug: 'digestive-health', description: 'Digestive enzymes, probiotics, and gut health support' },
            { name: 'Joint & Arthritis', slug: 'joint-arthritis', description: 'Joint support, arthritis relief, and mobility supplements' },
            { name: 'Immune Support', slug: 'immune-support', description: 'Immune system boosters and wellness supplements' },
            { name: 'Stress & Anxiety', slug: 'stress-anxiety', description: 'Natural stress relief and anxiety management' },
            { name: 'Sleep Support', slug: 'sleep-support', description: 'Natural sleep aids and relaxation supplements' },
            { name: 'Energy & Vitality', slug: 'energy-vitality', description: 'Energy boosters and vitality supplements' },
            { name: 'Brain Health', slug: 'brain-health', description: 'Cognitive support and brain health supplements' },
            { name: 'Womens Health', slug: 'womens-health', description: 'Specialized supplements for womens health needs' },
            { name: 'Mens Health', slug: 'mens-health', description: 'Specialized supplements for mens health needs' },
            { name: 'Pet Health', slug: 'pet-health', description: 'Natural health products for cats and dogs' },
            { name: 'Weight Management', slug: 'weight-management', description: 'Natural weight loss and metabolism support' },
            { name: 'Skin Health', slug: 'skin-health', description: 'Supplements and topicals for healthy skin' },
            { name: 'Eye Health', slug: 'eye-health', description: 'Vision support and eye health supplements' },
            { name: 'Liver Support', slug: 'liver-support', description: 'Liver detox and hepatic support supplements' },
            { name: 'Respiratory Health', slug: 'respiratory-health', description: 'Lung and respiratory system support' },
            { name: 'Bone Health', slug: 'bone-health', description: 'Calcium, vitamin D, and bone strength supplements' },
            { name: 'Anti-Aging', slug: 'anti-aging', description: 'Antioxidants and anti-aging supplements' }
        ];
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new BrandsCategoriesPage();
    });
} else {
    new BrandsCategoriesPage();
}


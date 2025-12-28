/**
 * Navigation Dropdowns
 * Handles Brands and Categories dropdown menus in the navigation
 */

class NavDropdowns {
    constructor() {
        this.brands = [];
        this.categories = [];
        this.apiBaseUrl = this.getApiBaseUrl();
        this.init();
    }

    getApiBaseUrl() {
        // Detect if we're running on file:// protocol
        if (window.location.protocol === 'file:') {
            return 'http://localhost:3001';
        }
        return '';
    }

    async init() {
        // Check if dropdown elements exist on this page
        const brandsDropdown = document.getElementById('brands-dropdown');
        const categoriesDropdown = document.getElementById('categories-dropdown');

        if (!brandsDropdown && !categoriesDropdown) {
            // No dropdowns on this page, exit silently
            return;
        }

        console.log('🔄 Initializing NavDropdowns...');

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }

        // Load brands and categories only if dropdowns exist
        if (brandsDropdown) {
            await this.loadBrands();
        }
        if (categoriesDropdown) {
            await this.loadCategories();
        }

        // Setup dropdown functionality
        this.setupDropdowns();

        console.log('✅ NavDropdowns initialized');
    }

    async loadBrands() {
        try {
            // Use native fetch directly to avoid wrapper issues
            const fetchFn = window.fetch || globalThis.fetch;
            const response = await fetchFn(`${this.apiBaseUrl}/api/brands`);
            if (!response.ok) {
                throw new Error('Failed to load brands');
            }
            this.brands = await response.json();
            this.populateBrandsDropdown();
        } catch (error) {
            console.log('⚠️ Using fallback brands (API unavailable)');
            // Use fallback brands from seed data
            this.brands = this.getFallbackBrands();
            this.populateBrandsDropdown();
        }
    }

    async loadCategories() {
        try {
            // Use native fetch directly to avoid wrapper issues
            const fetchFn = window.fetch || globalThis.fetch;
            const response = await fetchFn(`${this.apiBaseUrl}/api/health-categories`);
            if (!response.ok) {
                throw new Error('Failed to load categories');
            }
            this.categories = await response.json();
            this.populateCategoriesDropdown();
        } catch (error) {
            console.log('⚠️ Using fallback categories (API unavailable)');
            // Use fallback categories from seed data
            this.categories = this.getFallbackCategories();
            this.populateCategoriesDropdown();
        }
    }

    populateBrandsDropdown() {
        const dropdown = document.getElementById('brands-dropdown');
        if (!dropdown) {
            // Dropdown doesn't exist on this page (expected for pages without nav dropdowns)
            return;
        }

        dropdown.innerHTML = '';

        if (this.brands.length === 0) {
            dropdown.innerHTML = '<li role="none"><span class="dropdown-item">No brands available</span></li>';
            console.warn('⚠️ No brands to display');
            return;
        }

        console.log(`📦 Populating ${this.brands.length} brands`);
        this.brands.forEach(brand => {
            const li = document.createElement('li');
            li.setAttribute('role', 'none');

            const a = document.createElement('a');
            a.setAttribute('role', 'menuitem');
            a.href = `products.html?brand=${encodeURIComponent(brand.slug)}`;
            a.textContent = brand.name;
            a.className = 'dropdown-item';

            li.appendChild(a);
            dropdown.appendChild(li);
        });

        console.log('✅ Brands dropdown populated');
        console.log('🔍 Dropdown HTML:', dropdown.innerHTML.substring(0, 200));

        // Force visibility for debugging
        const parent = dropdown.closest('.nav-dropdown');
        if (parent) {
            console.log('🔍 Parent element found:', parent);
            console.log('🔍 Dropdown computed style:', window.getComputedStyle(dropdown).display);
        }
    }

    populateCategoriesDropdown() {
        const dropdown = document.getElementById('categories-dropdown');
        if (!dropdown) {
            // Dropdown doesn't exist on this page (expected for pages without nav dropdowns)
            return;
        }

        dropdown.innerHTML = '';

        if (this.categories.length === 0) {
            dropdown.innerHTML = '<li role="none"><span class="dropdown-item">No categories available</span></li>';
            console.warn('⚠️ No categories to display');
            return;
        }

        console.log(`📦 Populating ${this.categories.length} categories`);
        this.categories.forEach(category => {
            const li = document.createElement('li');
            li.setAttribute('role', 'none');

            const a = document.createElement('a');
            a.setAttribute('role', 'menuitem');
            a.href = `products.html?category=${encodeURIComponent(category.slug)}`;
            a.textContent = category.name;
            a.className = 'dropdown-item';

            li.appendChild(a);
            dropdown.appendChild(li);
        });

        console.log('✅ Categories dropdown populated');
    }

    setupDropdowns() {
        const dropdownToggles = document.querySelectorAll('.dropdown-toggle');

        if (dropdownToggles.length === 0) {
            // No dropdowns on this page (expected for pages without nav dropdowns)
            return;
        }

        console.log(`🔧 Setting up ${dropdownToggles.length} dropdowns`);

        dropdownToggles.forEach((toggle, index) => {
            const dropdown = toggle.nextElementSibling;
            const parent = toggle.closest('.nav-dropdown');

            if (!dropdown || !parent) {
                console.warn(`⚠️ Dropdown ${index} not found or missing parent`);
                return;
            }

            console.log(`✅ Setting up dropdown ${index + 1}`);

            // Toggle dropdown on click
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Close other dropdowns
                document.querySelectorAll('.nav-dropdown').forEach(item => {
                    if (item !== parent) {
                        item.classList.remove('active');
                        const otherToggle = item.querySelector('.dropdown-toggle');
                        if (otherToggle) {
                            otherToggle.setAttribute('aria-expanded', 'false');
                        }
                    }
                });

                // Toggle current dropdown
                const isActive = parent.classList.contains('active');
                parent.classList.toggle('active', !isActive);
                toggle.setAttribute('aria-expanded', !isActive);
                console.log(`🖱️ Dropdown ${index + 1} ${!isActive ? 'opened' : 'closed'}`);
            });

            // Hover support for desktop (only on non-touch devices)
            if (window.matchMedia('(hover: hover)').matches) {
                parent.addEventListener('mouseenter', () => {
                    // Close other dropdowns
                    document.querySelectorAll('.nav-dropdown').forEach(item => {
                        if (item !== parent) {
                            item.classList.remove('active');
                            const otherToggle = item.querySelector('.dropdown-toggle');
                            if (otherToggle) {
                                otherToggle.setAttribute('aria-expanded', 'false');
                            }
                        }
                    });

                    parent.classList.add('active');
                    toggle.setAttribute('aria-expanded', 'true');
                });

                parent.addEventListener('mouseleave', () => {
                    parent.classList.remove('active');
                    toggle.setAttribute('aria-expanded', 'false');
                });
            }

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!parent.contains(e.target)) {
                    parent.classList.remove('active');
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });

            // Close dropdown on escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && parent.classList.contains('active')) {
                    parent.classList.remove('active');
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.focus();
                }
            });
        });

        console.log('✅ Dropdowns setup complete');

        // Test: Temporarily show dropdowns for debugging
        setTimeout(() => {
            const testDropdown = document.querySelector('.nav-dropdown');
            if (testDropdown) {
                console.log('🧪 Testing dropdown visibility...');
                testDropdown.classList.add('active');
                const menu = testDropdown.querySelector('.dropdown-menu');
                if (menu) {
                    console.log('🧪 Menu element:', menu);
                    console.log('🧪 Menu display:', window.getComputedStyle(menu).display);
                    console.log('🧪 Menu visibility:', window.getComputedStyle(menu).visibility);
                    console.log('🧪 Menu opacity:', window.getComputedStyle(menu).opacity);
                    console.log('🧪 Menu z-index:', window.getComputedStyle(menu).zIndex);
                    console.log('🧪 Menu position:', window.getComputedStyle(menu).position);
                    console.log('🧪 Menu top:', window.getComputedStyle(menu).top);
                    console.log('🧪 Menu left:', window.getComputedStyle(menu).left);
                    console.log('🧪 Menu transform:', window.getComputedStyle(menu).transform);
                    console.log('🧪 Menu children count:', menu.children.length);

                    // Remove test after 3 seconds
                    setTimeout(() => {
                        testDropdown.classList.remove('active');
                        console.log('🧪 Test dropdown closed');
                    }, 3000);
                }
            }
        }, 1000);
    }

    getFallbackBrands() {
        return [
            { name: 'Standard Enzyme', slug: 'standard-enzyme' },
            { name: 'Natures Plus', slug: 'natures-plus' },
            { name: 'Global Healing', slug: 'global-healing' },
            { name: 'Host Defence', slug: 'host-defence' },
            { name: 'HM Enterprise', slug: 'hm-enterprise' },
            { name: 'Terry Naturally', slug: 'terry-naturally' },
            { name: 'Unicity', slug: 'unicity' },
            { name: 'Newton Labs', slug: 'newton-labs' },
            { name: 'Regal Labs', slug: 'regal-labs' },
            { name: 'Doctors Blend', slug: 'doctors-blend' },
            { name: 'Miracle II', slug: 'miracle-ii' },
            { name: 'Herbs for Life', slug: 'herbs-for-life' },
            { name: 'AOR', slug: 'aor' },
            { name: 'Cardio Amaze', slug: 'cardio-amaze' },
            { name: 'Life Extension', slug: 'life-extension' }
        ];
    }

    getFallbackCategories() {
        return [
            { name: 'Blood Pressure', slug: 'blood-pressure' },
            { name: 'Heart Health', slug: 'heart-health' },
            { name: 'Allergies', slug: 'allergies' },
            { name: 'Digestive Health', slug: 'digestive-health' },
            { name: 'Joint & Arthritis', slug: 'joint-arthritis' },
            { name: 'Immune Support', slug: 'immune-support' },
            { name: 'Stress & Anxiety', slug: 'stress-anxiety' },
            { name: 'Sleep Support', slug: 'sleep-support' },
            { name: 'Energy & Vitality', slug: 'energy-vitality' },
            { name: 'Brain Health', slug: 'brain-health' },
            { name: 'Womens Health', slug: 'womens-health' },
            { name: 'Mens Health', slug: 'mens-health' },
            { name: 'Pet Health', slug: 'pet-health' },
            { name: 'Weight Management', slug: 'weight-management' },
            { name: 'Skin Health', slug: 'skin-health' },
            { name: 'Eye Health', slug: 'eye-health' },
            { name: 'Liver Support', slug: 'liver-support' },
            { name: 'Respiratory Health', slug: 'respiratory-health' },
            { name: 'Bone Health', slug: 'bone-health' },
            { name: 'Anti-Aging', slug: 'anti-aging' }
        ];
    }
}

// Initialize when DOM is ready
(function () {
    console.log('📋 NavDropdowns script loaded');

    function initNavDropdowns() {
        try {
            window.navDropdowns = new NavDropdowns();
        } catch (error) {
            console.error('❌ Error initializing NavDropdowns:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavDropdowns);
    } else {
        // DOM already loaded, but wait a bit for other scripts
        setTimeout(initNavDropdowns, 100);
    }
})();


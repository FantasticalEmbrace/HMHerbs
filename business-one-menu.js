// Business One Menu App - JavaScript

// Fallback service data when the API is unavailable
const FALLBACK_SERVICES = [
    {
        id: 'pos',
        title: 'Point of Sale (POS)',
        iconClass: 'fas fa-cash-register',
        description: 'Modern, efficient POS systems to streamline your sales process and inventory management.',
        features: [
            'Real-time inventory tracking',
            'Sales reporting and analytics',
            'Multi-location support',
            'Customer management',
            'Integration with payment processors',
            'Mobile and tablet compatible'
        ],
        details: 'Our Point of Sale systems are designed to help businesses of all sizes manage their sales operations efficiently. With real-time inventory tracking, comprehensive reporting, and seamless payment integration, you can focus on growing your business while we handle the technology.'
    },
    {
        id: 'payment',
        title: 'Payment Processing',
        iconClass: 'fas fa-credit-card',
        description: 'Secure, reliable payment processing solutions with competitive rates and excellent support.',
        features: [
            'Competitive processing rates',
            'Secure payment gateway',
            'Multiple payment methods',
            '24/7 fraud monitoring',
            'Quick settlement times',
            'Dedicated account manager'
        ],
        details: 'Accept payments seamlessly with our secure payment processing solutions. We offer competitive rates, multiple payment methods including credit cards, debit cards, and digital wallets. Our 24/7 fraud monitoring ensures your transactions are always secure.'
    },
    {
        id: 'phone',
        title: 'Phone Service',
        iconClass: 'fas fa-phone-alt',
        description: 'Business phone systems with advanced features, including hold queues that ensure your customers never hear continuous ringing or a busy signal.',
        features: [
            'Professional hold queues',
            'Voicemail to email',
            'Call forwarding and routing',
            'Conference calling',
            'Mobile app integration',
            'Unlimited calling plans'
        ],
        details: 'Stay connected with clients and team members using our advanced business phone systems. Our hold queue technology ensures customers never hear continuous ringing or busy signals, providing a professional experience. Features include voicemail to email, call forwarding, conference calling, and mobile app integration.'
    },
    {
        id: 'website',
        title: 'Website Development',
        iconClass: 'fas fa-globe',
        description: 'Professional website design and development to establish your online presence and attract customers.',
        features: [
            'Responsive design',
            'SEO optimization',
            'Content management system',
            'E-commerce integration',
            'Mobile-first approach',
            'Ongoing support and maintenance'
        ],
        details: 'Establish a strong online presence with our professional website development services. We create responsive, SEO-optimized websites that work seamlessly across all devices. Whether you need a simple business site or a full e-commerce platform, we have the expertise to bring your vision to life.'
    }
];

let services = FALLBACK_SERVICES.slice();

function resolveApiOrigin() {
    if (typeof window === 'undefined' || !window.location) return '';
    if (window.location.protocol === 'file:') return 'http://127.0.0.1:3001';
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (isLocal && window.location.port && window.location.port !== '3001') {
        return 'http://127.0.0.1:3001';
    }
    return window.location.origin;
}

async function fetchServicesFromApi() {
    try {
        const origin = resolveApiOrigin();
        const response = await fetch(`${origin}/api/menu/public/services`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !Array.isArray(data.services) || !data.services.length) {
            return false;
        }
        const fallbackById = Object.fromEntries(FALLBACK_SERVICES.map((s) => [s.id, s]));
        services = data.services.map((service) => {
            const fallback = fallbackById[service.id] || {};
            const features = Array.isArray(service.features) && service.features.length
                ? service.features
                : (fallback.features || []);
            return {
                id: service.id,
                title: service.title || fallback.title || '',
                iconClass: service.iconClass || fallback.iconClass || 'fas fa-briefcase',
                description: service.description || fallback.description || '',
                features,
                details: service.details || fallback.details || service.description || ''
            };
        });
        return true;
    } catch {
        return false;
    }
}

// App State
const appState = {
    themePreference: localStorage.getItem('theme') || 'light',
    compactView: localStorage.getItem('compactView') === 'true',
    showDescriptions: localStorage.getItem('showDescriptions') !== 'false'
};

function resolveTheme(preference) {
    if (preference === 'auto') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return preference === 'dark' ? 'dark' : 'light';
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    applyTheme(appState.themePreference);
    await fetchServicesFromApi();
    loadServices();
});

// Load Services
function loadServices() {
    const servicesGrid = document.getElementById('servicesGrid');
    if (!servicesGrid) return;

    servicesGrid.innerHTML = '';

    services.forEach(service => {
        const card = createServiceCard(service);
        servicesGrid.appendChild(card);
    });
}

// Create Service Card
function createServiceCard(service) {
    const card = document.createElement('div');
    card.className = `service-card ${appState.compactView ? 'compact' : ''}`;
    card.setAttribute('data-service-id', service.id);
    
    card.innerHTML = `
        <div class="service-icon"><i class="${service.iconClass}" aria-hidden="true"></i></div>
        <h3 class="service-title">${service.title}</h3>
        ${appState.showDescriptions ? `<p class="service-description">${service.description}</p>` : ''}
        ${!appState.compactView && service.features.length ? `
        <ul class="service-features">
            ${service.features.slice(0, 3).map((feature) => `<li>${feature}</li>`).join('')}
        </ul>` : ''}
        <span class="service-link">Learn More <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
    `;

    card.addEventListener('click', () => openServiceModal(service));
    
    return card;
}

// Open Service Modal
function openServiceModal(service) {
    const modal = document.getElementById('serviceModal');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalBody) return;

    const titleEl = document.getElementById('serviceModalTitle');
    if (titleEl) titleEl.textContent = service.title;

    modalBody.innerHTML = `
        <div class="service-detail-header">
            <div class="service-icon service-icon--detail"><i class="${service.iconClass}" aria-hidden="true"></i></div>
            <h2>${service.title}</h2>
            <p>${service.description}</p>
        </div>
        <div class="service-detail-content">
            <h3>Key Features</h3>
            <ul>
                ${service.features.map(feature => `<li>${feature}</li>`).join('')}
            </ul>
            <h3>Overview</h3>
            <p>${service.details}</p>
            <button class="cta-button" onclick="contactUs('${service.id}')">Get Started with ${service.title}</button>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close Service Modal
function closeServiceModal() {
    const modal = document.getElementById('serviceModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Open Settings Modal
function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Set current settings
        document.getElementById('compactView').checked = appState.compactView;
        document.getElementById('showDescriptions').checked = appState.showDescriptions;
        
        // Set active theme button
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.theme === appState.themePreference) {
                btn.classList.add('active');
            }
        });
    }
}

// Close Settings Modal
function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Apply Theme
function applyTheme(preference) {
    appState.themePreference = preference;
    document.documentElement.setAttribute('data-theme', resolveTheme(preference));
    localStorage.setItem('theme', preference);
}

// Setup Event Listeners
function setupEventListeners() {
    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettingsModal);
    }

    // Close modals
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', closeServiceModal);
    }

    const closeSettings = document.getElementById('closeSettings');
    if (closeSettings) {
        closeSettings.addEventListener('click', closeSettingsModal);
    }

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Settings checkboxes
    const compactView = document.getElementById('compactView');
    if (compactView) {
        compactView.addEventListener('change', (e) => {
            appState.compactView = e.target.checked;
            localStorage.setItem('compactView', e.target.checked);
            loadServices();
        });
    }

    const showDescriptions = document.getElementById('showDescriptions');
    if (showDescriptions) {
        showDescriptions.addEventListener('change', (e) => {
            appState.showDescriptions = e.target.checked;
            localStorage.setItem('showDescriptions', e.target.checked);
            loadServices();
        });
    }

    // Theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            applyTheme(theme);
            
            // Update active state
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Back to top
    const backToTopBtn = document.getElementById('backToTop');
    if (backToTopBtn) {
        const toggleBackToTop = () => {
            backToTopBtn.classList.toggle('active', window.pageYOffset > 300);
        };
        window.addEventListener('scroll', toggleBackToTop);
        toggleBackToTop();
        backToTopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Contact form
    const contactForm = document.getElementById('contactForm');
    const formSuccess = document.getElementById('formSuccess');
    const formSuccessReset = document.getElementById('formSuccessReset');
    if (formSuccessReset && contactForm && formSuccess) {
        formSuccessReset.addEventListener('click', () => {
            formSuccess.style.display = 'none';
            contactForm.style.display = '';
            const errEl = document.getElementById('formError');
            if (errEl) errEl.style.display = 'none';
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = false;
        });
    }
    if (contactForm && formSuccess) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;
            const interests = [...contactForm.querySelectorAll('input[name="interest"]:checked')]
                .map((el) => el.value);
            const payload = {
                name: contactForm.name.value.trim(),
                email: contactForm.email.value.trim(),
                phone: contactForm.phone.value.trim(),
                businessName: contactForm.subject.value.trim(),
                interests,
                message: contactForm.message.value.trim()
            };
            try {
                const res = await fetch(`${resolveApiOrigin()}/api/business-one/contact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Could not send message');
                contactForm.style.display = 'none';
                formSuccess.style.display = 'block';
                contactForm.reset();
            } catch (err) {
                if (submitBtn) submitBtn.disabled = false;
                const errEl = document.getElementById('formError');
                if (errEl) {
                    errEl.textContent = err.message || 'Could not send message. Please call us instead.';
                    errEl.style.display = 'block';
                }
            }
        });
    }

    // Smooth scroll for in-page links
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
            const targetId = anchor.getAttribute('href');
            if (!targetId || targetId === '#') return;
            const target = document.querySelector(targetId);
            if (!target) return;
            e.preventDefault();
            const header = document.querySelector('.app-header');
            const offset = header ? header.offsetHeight : 0;
            window.scrollTo({
                top: target.offsetTop - offset,
                behavior: 'smooth'
            });
        });
    });

    // Contact link in footer — scroll handled above
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeServiceModal();
            closeSettingsModal();
        }
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (appState.themePreference === 'auto') {
            document.documentElement.setAttribute('data-theme', resolveTheme('auto'));
        }
    });
}

// Contact Us Function
function contactUs(serviceRef = '') {
    closeServiceModal();

    const service = services.find((s) => s.id === serviceRef || s.title === serviceRef);
    const checkboxId = service ? `interest-${service.id}` : null;
    if (checkboxId) {
        const box = document.getElementById(checkboxId);
        if (box) box.checked = true;
    }

    const contact = document.getElementById('contact');
    if (contact) {
        const header = document.querySelector('.app-header');
        const offset = header ? header.offsetHeight : 0;
        window.scrollTo({
            top: contact.offsetTop - offset,
            behavior: 'smooth'
        });
        document.getElementById('message')?.focus();
    }
}

// Export for global access
window.contactUs = contactUs;

// Service Worker Registration (for PWA capabilities)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Service worker can be added later for offline functionality
        console.log('Service Worker support detected');
    });
}

// Analytics (if needed)
function trackEvent(eventName, eventData) {
    // Add analytics tracking here if needed
    console.log('Event:', eventName, eventData);
}

// Initialize on page load
trackEvent('page_view', {
    page: 'business_one_menu',
    timestamp: new Date().toISOString()
});


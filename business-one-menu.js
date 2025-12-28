// Business One Menu App - JavaScript

// Service Data
const services = [
    {
        id: 'pos',
        title: 'Point of Sale (POS)',
        icon: '💳',
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
        icon: '💵',
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
        icon: '📞',
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
        icon: '🌐',
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

// App State
const appState = {
    currentTheme: localStorage.getItem('theme') || 'light',
    compactView: localStorage.getItem('compactView') === 'true',
    showDescriptions: localStorage.getItem('showDescriptions') !== 'false'
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    loadServices();
    setupEventListeners();
    applyTheme(appState.currentTheme);
    applySettings();
});

// Initialize App
function initializeApp() {
    // Check for system theme preference
    if (appState.currentTheme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        appState.currentTheme = prefersDark ? 'dark' : 'light';
    }
}

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
        <div class="service-icon">${service.icon}</div>
        <h3>${service.title}</h3>
        ${appState.showDescriptions ? `<p>${service.description}</p>` : ''}
        <ul class="service-features">
            ${service.features.slice(0, 3).map(feature => `<li>${feature}</li>`).join('')}
        </ul>
    `;

    card.addEventListener('click', () => openServiceModal(service));
    
    return card;
}

// Open Service Modal
function openServiceModal(service) {
    const modal = document.getElementById('serviceModal');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalBody) return;

    modalBody.innerHTML = `
        <div class="service-detail-header">
            <div class="service-icon" style="display: inline-flex; margin-bottom: 1rem;">${service.icon}</div>
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
            <button class="cta-button" onclick="contactUs('${service.title}')">Get Started with ${service.title}</button>
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
            if (btn.dataset.theme === appState.currentTheme) {
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
function applyTheme(theme) {
    if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
    }
    
    document.documentElement.setAttribute('data-theme', theme);
    appState.currentTheme = theme;
    localStorage.setItem('theme', theme);
}

// Apply Settings
function applySettings() {
    // Apply compact view
    if (appState.compactView) {
        document.querySelectorAll('.service-card').forEach(card => {
            card.classList.add('compact');
        });
    }
    
    // Reload services to apply description visibility
    loadServices();
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

    // Contact link
    const contactLink = document.getElementById('contactLink');
    if (contactLink) {
        contactLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeSettingsModal();
            openSettingsModal();
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeServiceModal();
            closeSettingsModal();
        }
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (appState.currentTheme === 'auto') {
            applyTheme('auto');
        }
    });
}

// Contact Us Function
function contactUs(serviceName = '') {
    const subject = serviceName ? `Inquiry about ${serviceName}` : 'Business Inquiry';
    const body = serviceName 
        ? `Hello,\n\nI'm interested in learning more about your ${serviceName} service.\n\nPlease contact me at your earliest convenience.\n\nThank you!`
        : `Hello,\n\nI'm interested in learning more about your business solutions.\n\nPlease contact me at your earliest convenience.\n\nThank you!`;
    
    const emailLink = `mailto:info@businessonecomprehensive.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = emailLink;
    
    // Also close modal
    closeServiceModal();
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


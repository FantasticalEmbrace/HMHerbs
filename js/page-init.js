// Page Initialization
// Force cart closed immediately and prevent scroll restoration
// CRITICAL: Must run early to prevent scroll issues

(function () {
    'use strict';

    // Prevent automatic scroll restoration
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    // Force scroll to top immediately (before any content loads)
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Force cart closed before any other scripts run
    document.addEventListener('DOMContentLoaded', function () {
        // Ensure we're at the top
        if (!window.location.hash) {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }

        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        if (cartSidebar) {
            cartSidebar.classList.remove('show', 'open');
            cartSidebar.setAttribute('aria-hidden', 'true');
            // DO NOT set inline styles - let CSS handle it
        }
        if (cartOverlay) {
            cartOverlay.classList.remove('active');
            // DO NOT set inline styles - let CSS handle it
        }
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    });

    // Also run immediately if DOM is already loaded
    if (document.readyState === 'loading') {
        // Wait for DOM
    } else {
        // DOM already loaded, run immediately
        if (!window.location.hash) {
            window.scrollTo(0, 0);
        }
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        if (cartSidebar) {
            cartSidebar.classList.remove('show', 'open');
            cartSidebar.setAttribute('aria-hidden', 'true');
            // DO NOT set inline styles - let CSS handle it
        }
        if (cartOverlay) {
            cartOverlay.classList.remove('active');
            // DO NOT set inline styles - let CSS handle it
        }
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }

    // Only prevent scroll restoration on initial load, not user scrolling
    // Ensure page starts at top on initial load only (not after user scrolls)
    let hasUserScrolled = false;

    // Track if user has manually scrolled
    window.addEventListener('scroll', function () {
        if (window.scrollY > 10) {
            hasUserScrolled = true;
        }
    }, { passive: true, once: true });

    // Only ensure top on initial window load (before user interaction)
    window.addEventListener('load', function () {
        if (!window.location.hash && !hasUserScrolled) {
            // Only scroll to top once on initial load
            window.scrollTo(0, 0);
        }
    }, { passive: true });
})();

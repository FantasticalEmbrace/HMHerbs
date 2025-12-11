/**
 * Sticky Navbar Enhancement
 * Adds dynamic behavior to the sticky navbar in desktop mode
 */

(function() {
    'use strict';

    // Only run on desktop screens
    function isDesktop() {
        return window.innerWidth >= 769;
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStickyNavbar);
    } else {
        initStickyNavbar();
    }

    function initStickyNavbar() {
        const mainHeader = document.querySelector('.main-header');
        
        if (!mainHeader) {
            console.warn('Main header not found for sticky navbar enhancement');
            return;
        }

        let isScrolled = false;
        let ticking = false;

        // Function to handle scroll events
        function handleScroll() {
            if (!isDesktop()) return;

            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const shouldBeScrolled = scrollTop > 10;

            if (shouldBeScrolled !== isScrolled) {
                isScrolled = shouldBeScrolled;
                
                if (isScrolled) {
                    mainHeader.classList.add('scrolled');
                } else {
                    mainHeader.classList.remove('scrolled');
                }
            }
        }

        // Throttled scroll handler for better performance
        function onScroll() {
            if (!ticking) {
                requestAnimationFrame(function() {
                    handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        }

        // Function to handle window resize
        function handleResize() {
            if (!isDesktop()) {
                // Remove scrolled class on mobile
                mainHeader.classList.remove('scrolled');
                isScrolled = false;
            } else {
                // Re-check scroll position on desktop
                handleScroll();
            }
        }

        // Add event listeners
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', handleResize, { passive: true });

        // Initial check
        handleScroll();

        console.log('Sticky navbar enhancement initialized successfully');
    }
})();


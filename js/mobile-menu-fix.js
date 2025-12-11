/**
 * Mobile Menu Enhancement
 * Fixes hamburger menu functionality for mobile view
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenu);
    } else {
        initMobileMenu();
    }

    function initMobileMenu() {
        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');

        if (!mobileMenuToggle || !navMenu) {
            console.warn('Mobile menu elements not found');
            return;
        }

        // Function to open mobile menu
        function openMobileMenu() {
            mobileMenuToggle.setAttribute('aria-expanded', 'true');
            navMenu.classList.add('show');
            
            // Show overlay if it exists
            if (mobileMenuOverlay) {
                mobileMenuOverlay.classList.add('active');
            }
            
            // Lock body scroll
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            
            // Add class to body for additional styling if needed
            document.body.classList.add('mobile-menu-open');
        }

        // Function to close mobile menu
        function closeMobileMenu() {
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
            navMenu.classList.remove('show');
            
            // Hide overlay if it exists
            if (mobileMenuOverlay) {
                mobileMenuOverlay.classList.remove('active');
            }
            
            // Unlock body scroll
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            
            // Remove class from body
            document.body.classList.remove('mobile-menu-open');
        }

        // Remove any existing event listeners to prevent conflicts
        const existingToggle = mobileMenuToggle.cloneNode(true);
        mobileMenuToggle.parentNode.replaceChild(existingToggle, mobileMenuToggle);
        
        // Update reference to the new element
        const newMobileMenuToggle = document.querySelector('.mobile-menu-toggle');

        // Toggle mobile menu on button click
        newMobileMenuToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const isExpanded = newMobileMenuToggle.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });

        // Close menu when clicking on overlay
        if (mobileMenuOverlay) {
            mobileMenuOverlay.addEventListener('click', function(e) {
                if (e.target === mobileMenuOverlay) {
                    closeMobileMenu();
                }
            });
        }

        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (navMenu.classList.contains('show') &&
                !newMobileMenuToggle.contains(e.target) &&
                !navMenu.contains(e.target) &&
                (!mobileMenuOverlay || !mobileMenuOverlay.contains(e.target))) {
                closeMobileMenu();
            }
        }, true);

        // Close menu on window resize if it becomes desktop size
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768 && navMenu.classList.contains('show')) {
                closeMobileMenu();
            }
        });

        // Close menu on escape key press
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && navMenu.classList.contains('show')) {
                closeMobileMenu();
                newMobileMenuToggle.focus(); // Return focus to toggle button
            }
        });

        // Ensure menu is closed on page load
        closeMobileMenu();
        
        console.log('Mobile menu enhancement initialized successfully');
    }
})();


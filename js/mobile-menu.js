// Mobile Menu Toggle
// Must be in head to be available immediately
// Define mobile menu toggle function immediately

(function() {
    'use strict';
    
    // Define mobile menu toggle function immediately
    function toggleMobileMenu(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Find the toggle button and menu - handle both nav-menu and navbar-menu IDs
        const toggle = e && e.target ? e.target.closest('.mobile-menu-toggle') : document.querySelector('.mobile-menu-toggle');
        const menuId = toggle ? toggle.getAttribute('aria-controls') : null;
        const menu = menuId ? document.getElementById(menuId) : (document.querySelector('.nav-menu') || document.querySelector('#nav-menu') || document.querySelector('#navbar-menu'));

        if (toggle && menu) {
            const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
            const newExpanded = !isExpanded;
            toggle.setAttribute('aria-expanded', newExpanded);

            // Toggle the show class - CSS will handle the display
            menu.classList.toggle('show');
            
            // Prevent body scroll when menu is open
            if (menu.classList.contains('show')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }

            // Clear inline styles when closing or on desktop
            if (!menu.classList.contains('show') || window.innerWidth > 768) {
                menu.style.cssText = '';
                menu.querySelectorAll('li').forEach(li => li.style.cssText = '');
                menu.querySelectorAll('a').forEach(a => a.style.cssText = '');
                document.body.style.overflow = '';
            }
        } else {
            console.error('Menu elements not found:', { toggle: !!toggle, menu: !!menu, menuId });
        }
    }

    // Make function globally available
    window.toggleMobileMenu = toggleMobileMenu;

    // Attach event listeners to all mobile menu toggles
    function setupMobileMenuToggles() {
        const toggles = document.querySelectorAll('.mobile-menu-toggle');
        toggles.forEach(toggle => {
            // Remove existing listeners to avoid duplicates
            const newToggle = toggle.cloneNode(true);
            toggle.parentNode.replaceChild(newToggle, toggle);
            
            // Add event listeners to the new toggle
            newToggle.addEventListener('click', toggleMobileMenu);
            newToggle.addEventListener('touchend', function (e) {
                e.preventDefault();
                toggleMobileMenu(e);
            });
        });
    }

    // Also attach event listeners when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupMobileMenuToggles);
    } else {
        // DOM already loaded
        setupMobileMenuToggles();
    }

    // Add a resize listener to clear inline styles when switching to desktop
    window.addEventListener('resize', function () {
        const menus = document.querySelectorAll('.nav-menu, #nav-menu, #navbar-menu');
        const toggles = document.querySelectorAll('.mobile-menu-toggle');
        
        if (window.innerWidth > 768) {
            menus.forEach(menu => {
                if (menu && menu.classList.contains('show')) {
                    menu.classList.remove('show');
                    document.body.style.overflow = '';
                }
                if (menu) {
                    menu.style.cssText = '';
                    menu.querySelectorAll('li').forEach(li => li.style.cssText = '');
                    menu.querySelectorAll('a').forEach(a => a.style.cssText = '');
                }
            });
            
            toggles.forEach(toggle => {
                if (toggle) {
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    });

    // Close menu when clicking on backdrop (outside menu)
    document.addEventListener('click', function(e) {
        if (window.innerWidth > 768) return; // Only on mobile
        
        const menus = document.querySelectorAll('.nav-menu.show, #nav-menu.show, #navbar-menu.show');
        const toggles = document.querySelectorAll('.mobile-menu-toggle');
        
        menus.forEach(menu => {
            let clickedOutside = true;
            
            // Check if click is on menu or any toggle
            if (menu.contains(e.target)) {
                clickedOutside = false;
            }
            
            toggles.forEach(toggle => {
                if (toggle.contains(e.target)) {
                    clickedOutside = false;
                }
            });
            
            if (clickedOutside && menu.classList.contains('show')) {
                toggleMobileMenu();
            }
        });
    });

    // Close menu when pressing Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
            const menus = document.querySelectorAll('.nav-menu.show, #nav-menu.show, #navbar-menu.show');
            
            menus.forEach(menu => {
                if (menu && menu.classList.contains('show')) {
                    toggleMobileMenu();
                }
            });
        }
    });
})();


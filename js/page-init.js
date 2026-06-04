// Page Initialization
// Force cart closed immediately and prevent scroll restoration
// CRITICAL: Must run early to prevent scroll issues

(function () {
    'use strict';

    /** Keep cart drawer below sticky header (index has taller top bar). */
    function syncHmHeaderOffset() {
        const header = document.querySelector('.header');
        if (!header) return;
        document.documentElement.style.setProperty(
            '--hm-header-offset',
            `${header.offsetHeight}px`
        );
    }

    function resetCartAndScrollLocks() {
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        if (cartSidebar) {
            cartSidebar.classList.remove('show', 'open');
            cartSidebar.setAttribute('aria-hidden', 'true');
        }
        if (cartOverlay) {
            cartOverlay.classList.remove('active');
        }
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.classList.remove(
            'auth-modal-open',
            'edsa-modal-open',
            'modal-open',
            'no-scroll',
            'cart-open',
            'checkout-nmi-active'
        );
    }

    function isEdsaCrossPageNav() {
        if (typeof window.hmIsEdsaCrossPagePending === 'function') {
            return window.hmIsEdsaCrossPagePending();
        }
        try {
            return sessionStorage.getItem('hmPendingEdsaNav') === '1';
        } catch (_) {
            return false;
        }
    }

    function scrollToTopIfNoHash() {
        if (isEdsaCrossPageNav()) return;
        if (!window.location.hash) {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }
    }

    // Prevent automatic scroll restoration
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    // Force scroll to top immediately (before any content loads)
    scrollToTopIfNoHash();

    function releaseAllScrollLocks() {
        if (typeof window.hmReleaseScrollLocks === 'function') {
            window.hmReleaseScrollLocks();
        } else {
            resetCartAndScrollLocks();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        scrollToTopIfNoHash();
        releaseAllScrollLocks();
        syncHmHeaderOffset();
    });

    if (document.readyState !== 'loading') {
        scrollToTopIfNoHash();
        releaseAllScrollLocks();
        syncHmHeaderOffset();
    }

    window.addEventListener('resize', syncHmHeaderOffset, { passive: true });
    window.addEventListener('load', syncHmHeaderOffset, { passive: true });

    // Only prevent scroll restoration on initial load, not after real scrolling.
    // Do NOT use { once: true } on scroll: the first event may still be
    // scrollY <= 10 (inertia / tiny move), which would detach the listener
    // before we ever set hasUserScrolled — then `load` could yank scroll back.
    let hasUserScrolled = false;

    function onScroll() {
        if (window.scrollY > 10) {
            hasUserScrolled = true;
            window.removeEventListener('scroll', onScroll);
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    window.addEventListener('load', function () {
        if (isEdsaCrossPageNav()) return;
        if (!window.location.hash && !hasUserScrolled) {
            window.scrollTo(0, 0);
        }
    }, { passive: true });
})();

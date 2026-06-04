/**
 * Section navigation — EDSA, Contact, etc.
 * Home EDSA click: scrollToEdsaSection() immediately.
 * Other pages → index: same scroll after layout is ready (not stuck at top).
 */
(function () {
    'use strict';

    const INDEX_FILES = new Set(['', 'index.html']);
    const EDSA_PENDING_FLAG = 'hmPendingEdsaNav';
    const EDSA_HASH = '#edsa-service';
    const EDSA_FOCUS_ID = 'edsa-nav-target';

    function currentPageFile() {
        const name = window.location.pathname.split('/').pop() || '';
        return name || 'index.html';
    }

    function isIndexPage() {
        return INDEX_FILES.has(currentPageFile());
    }

    function parseLink(href) {
        try {
            const url = new URL(href, window.location.href);
            let file = url.pathname.split('/').pop() || 'index.html';
            if (!file) file = 'index.html';
            return { file, hash: url.hash };
        } catch {
            return null;
        }
    }

    function isIndexSectionHref(href) {
        const parsed = parseLink(href);
        if (!parsed || !parsed.hash || parsed.hash.length <= 1) return false;
        return INDEX_FILES.has(parsed.file);
    }

    function isEdsaHash(hash) {
        return hash === EDSA_HASH;
    }

    /** Used by page-init.js and script.js to avoid yanking cross-page EDSA nav back to top. */
    function isEdsaCrossPagePending() {
        try {
            return sessionStorage.getItem(EDSA_PENDING_FLAG) === '1';
        } catch (_) {
            return false;
        }
    }

    function markEdsaCrossPagePending() {
        try {
            sessionStorage.setItem(EDSA_PENDING_FLAG, '1');
        } catch (_) {
            /* ignore */
        }
    }

    function clearEdsaCrossPagePending() {
        try {
            sessionStorage.removeItem(EDSA_PENDING_FLAG);
        } catch (_) {
            /* ignore */
        }
    }

    function releaseScrollLocks() {
        document
            .querySelectorAll('.nav-menu.show, #nav-menu.show, #navbar-menu.show')
            .forEach((menu) => {
                menu.classList.remove('show');
                menu.style.cssText = '';
                menu.querySelectorAll('li, a').forEach((el) => {
                    el.style.cssText = '';
                });
            });
        document.querySelectorAll('.mobile-menu-toggle').forEach((toggle) => {
            toggle.setAttribute('aria-expanded', 'false');
        });

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

    function headerOffset() {
        const v = getComputedStyle(document.documentElement).getPropertyValue(
            '--hm-header-offset'
        );
        const parsed = parseFloat(v);
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
        const header = document.querySelector('.header');
        return header ? header.offsetHeight : 76;
    }

    function resolveEdsaScrollTarget() {
        return (
            document.getElementById(EDSA_FOCUS_ID) ||
            document.getElementById('edsa-book-btn') ||
            document.querySelector('#edsa-service .edsa-text') ||
            document.getElementById('edsa-service')
        );
    }

    /**
     * Exact scroll used by the home page EDSA button — book + change/cancel at viewport bottom.
     */
    function scrollToEdsaSection() {
        const el = resolveEdsaScrollTarget();
        if (!el) return false;

        const rect = el.getBoundingClientRect();
        const elTop = rect.top + window.scrollY;
        const elHeight = rect.height || el.offsetHeight;
        const viewport = window.innerHeight;
        const maxScroll = Math.max(
            0,
            document.documentElement.scrollHeight - viewport
        );
        const top = Math.min(
            Math.max(0, elTop + elHeight - viewport + 20),
            maxScroll
        );
        window.scrollTo({ top, left: 0, behavior: 'auto' });
        return true;
    }

    function syncEdsaHash() {
        const next = window.location.pathname + window.location.search + EDSA_HASH;
        const current =
            window.location.pathname + window.location.search + window.location.hash;
        if (current !== next) {
            history.replaceState(null, '', next);
        }
    }

    function handleIndexEdsaClick(e, href) {
        const parsed = parseLink(href);
        if (!parsed || !isEdsaHash(parsed.hash)) return;
        if (!resolveEdsaScrollTarget()) return;

        e.preventDefault();
        releaseScrollLocks();
        syncEdsaHash();
        if (typeof window.hmApplyNavCurrentPage === 'function') {
            window.hmApplyNavCurrentPage(EDSA_HASH);
        }
        scrollToEdsaSection();
    }

    function handleIndexOtherSectionClick(e, href) {
        const parsed = parseLink(href);
        if (!parsed || !parsed.hash || isEdsaHash(parsed.hash)) return;
        const target = document.getElementById(parsed.hash.slice(1));
        if (!target) return;

        e.preventDefault();
        releaseScrollLocks();
        const next = window.location.pathname + window.location.search + parsed.hash;
        if (
            window.location.pathname +
                window.location.search +
                window.location.hash !==
            next
        ) {
            history.replaceState(null, '', next);
        }
        if (typeof window.hmApplyNavCurrentPage === 'function') {
            window.hmApplyNavCurrentPage(parsed.hash);
        }
        const top = target.getBoundingClientRect().top + window.scrollY - headerOffset() - 12;
        window.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'auto' });
    }

    function handleCrossPageEdsaClick(e, parsed) {
        e.preventDefault();
        markEdsaCrossPagePending();
        releaseScrollLocks();
        document.documentElement.classList.add('hm-await-edsa-scroll');
        window.location.assign(parsed.file);
    }

    function initClickDelegation() {
        document.addEventListener(
            'click',
            (e) => {
                const link = e.target.closest('a[href]');
                if (!link) return;
                const href = link.getAttribute('href');
                if (!href || href === '#') return;
                const parsed = parseLink(href);
                if (!parsed) return;

                if (!isIndexPage() && isIndexSectionHref(href) && isEdsaHash(parsed.hash)) {
                    handleCrossPageEdsaClick(e, parsed);
                    return;
                }

                if (isIndexPage() && href.startsWith('#') && href.length > 1) {
                    if (isEdsaHash(parsed.hash)) {
                        handleIndexEdsaClick(e, href);
                    } else {
                        handleIndexOtherSectionClick(e, href);
                    }
                }
            },
            true
        );
    }

    let crossPageEdsaDone = false;

    /** Called after spotlight products render — same viewport as home EDSA button. */
    function completeEdsaCrossPageNav() {
        if (crossPageEdsaDone || !isIndexPage() || !isEdsaCrossPagePending()) {
            return;
        }
        if (!resolveEdsaScrollTarget()) {
            return;
        }

        crossPageEdsaDone = true;
        clearEdsaCrossPagePending();
        releaseScrollLocks();
        syncEdsaHash();
        if (typeof window.hmApplyNavCurrentPage === 'function') {
            window.hmApplyNavCurrentPage(EDSA_HASH);
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollToEdsaSection();
                document.documentElement.classList.remove('hm-await-edsa-scroll');
                document.documentElement.classList.add('hm-edsa-scroll-ready');
            });
        });
    }

    function initCrossPageEdsaLanding() {
        if (!isIndexPage() || !isEdsaCrossPagePending()) return;

        document.documentElement.classList.add('hm-await-edsa-scroll');

        window.addEventListener('hmSpotlightReady', completeEdsaCrossPageNav, {
            once: true
        });
        window.addEventListener(
            'load',
            () => {
                window.setTimeout(completeEdsaCrossPageNav, 50);
            },
            { once: true }
        );
        window.setTimeout(completeEdsaCrossPageNav, 5000);
    }

    function init() {
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }

        window.hmReleaseScrollLocks = releaseScrollLocks;
        window.hmScrollToEdsaSection = scrollToEdsaSection;
        window.hmIsEdsaCrossPagePending = isEdsaCrossPagePending;
        window.hmCompleteEdsaCrossPageNav = completeEdsaCrossPageNav;

        initClickDelegation();
        releaseScrollLocks();
        initCrossPageEdsaLanding();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCrossPageEdsaLanding, {
                once: true
            });
        }
    }

    init();
})();

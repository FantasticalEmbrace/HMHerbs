/**
 * 21+ age gate: sets hmherbs_age_verified_21 and dispatches hmherbs:age-verified
 * (required by js/newsletter-popup.js). Load with defer before newsletter-popup.js.
 */
(function () {
    const STORAGE_KEY = 'hmherbs_age_verified_21';
    const EVENT_NAME = 'hmherbs:age-verified';

    function shouldSkipPage() {
        try {
            const p = (window.location.pathname || '').toLowerCase();
            if (/admin/i.test(p)) return true;
            if (p.includes('menu-admin')) return true;
        } catch (_) {}
        return false;
    }

    function isVerified() {
        try {
            return window.localStorage.getItem(STORAGE_KEY) === 'true';
        } catch (_) {
            return false;
        }
    }

    function persistVerified() {
        try {
            window.localStorage.setItem(STORAGE_KEY, 'true');
        } catch (_) {}
    }

    function notifyAgeVerified() {
        window.dispatchEvent(new CustomEvent(EVENT_NAME));
    }

    /**
     * @param {HTMLElement} root
     * @param {() => void} [afterRemoved]
     */
    function removeGate(root, afterRemoved) {
        if (!root || !root.parentNode) return;
        if (root._hmAgeKeyEsc) {
            document.removeEventListener('keydown', root._hmAgeKeyEsc);
            root._hmAgeKeyEsc = null;
        }
        root.classList.add('is-leaving');
        window.setTimeout(() => {
            try {
                root.parentNode.removeChild(root);
            } catch (_) {}
            document.body.style.overflow = '';
            if (typeof afterRemoved === 'function') {
                afterRemoved();
            }
        }, 280);
    }

    function scrollViewportTop() {
        try {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        } catch (_) {
            window.scrollTo(0, 0);
        }
    }

    function showGate() {
        const root = document.createElement('div');
        root.className = 'hm-age-gate';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'hm-age-gate-title');

        root.innerHTML =
            '<div class="hm-age-gate__dialog">' +
            '<div class="hm-age-gate__badge" aria-hidden="true">21+</div>' +
            '<h1 id="hm-age-gate-title" class="hm-age-gate__title">Age verification</h1>' +
            '<p class="hm-age-gate__text">This site offers age-restricted wellness products. ' +
            'You must be 21 or older to enter.</p>' +
            '<div class="hm-age-gate__actions">' +
            '<button type="button" class="hm-age-gate__confirm" id="hm-age-gate-enter">I am 21 or older</button>' +
            '<button type="button" class="hm-age-gate__exit" id="hm-age-gate-exit">I am under 21 — exit</button>' +
            '</div></div>';

        document.body.appendChild(root);
        document.body.style.overflow = 'hidden';
        scrollViewportTop();

        const enter = root.querySelector('#hm-age-gate-enter');
        const exit = root.querySelector('#hm-age-gate-exit');

        enter.addEventListener('click', () => {
            persistVerified();
            scrollViewportTop();
            removeGate(root, () => {
                scrollViewportTop();
                notifyAgeVerified();
            });
        });

        exit.addEventListener('click', () => {
            window.location.href = 'https://www.google.com/';
        });

        const onKey = (e) => {
            if (e.key === 'Escape') {
                exit.click();
            }
        };
        root._hmAgeKeyEsc = onKey;
        document.addEventListener('keydown', onKey);

        window.requestAnimationFrame(() => {
            try {
                enter.focus({ preventScroll: true });
            } catch (_) {
                enter.focus();
            }
        });
    }

    function run() {
        if (shouldSkipPage()) return;
        if (isVerified()) {
            persistVerified();
            notifyAgeVerified();
            return;
        }
        scrollViewportTop();
        showGate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();

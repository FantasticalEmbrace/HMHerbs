/**
 * Loads store hours from /api/store-info (same admin settings pushed to Google).
 */
(function () {
    const DEFAULT_LINES = ['Mon-Fri: 10am-5pm', 'Sat: 10am-1pm'];

    function getApiOrigin() {
        if (window.location.protocol === 'file:') return 'http://localhost:3001';
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            if (window.location.port === '3001') return '';
            return 'http://localhost:3001';
        }
        return '';
    }

    function linesFromPayload(data) {
        if (Array.isArray(data?.footerLines) && data.footerLines.length) {
            return data.footerLines.map((line) => String(line).trim()).filter(Boolean);
        }
        return DEFAULT_LINES;
    }

    function applyFooterHours(lines) {
        document.querySelectorAll('.footer-hours').forEach((container) => {
            container.innerHTML = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
        });
        document.querySelectorAll('.call-store-hours').forEach((el) => {
            el.innerHTML = lines.map((line) => escapeHtml(line)).join('<br>');
        });
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    let cachedPromise = null;

    function fetchStoreInfo() {
        if (!cachedPromise) {
            const origin = getApiOrigin();
            const url = origin ? `${origin}/api/store-info` : '/api/store-info';
            cachedPromise = fetch(url, { credentials: 'same-origin' })
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null);
        }
        return cachedPromise;
    }

    window.HMHERBS_getStoreHourLines = async function getStoreHourLines() {
        const data = await fetchStoreInfo();
        return linesFromPayload(data);
    };

    async function init() {
        const data = await fetchStoreInfo();
        applyFooterHours(linesFromPayload(data));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

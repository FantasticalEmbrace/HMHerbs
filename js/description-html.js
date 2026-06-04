/**
 * Normalize long product descriptions for display (storefront + admin preview).
 * Renders real HTML from hmherbs; plain text stays plain with paragraph breaks only at display time.
 */
(function (global) {
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    function decodeHtmlEntities(str) {
        if (!str) return '';
        let s = String(str).trim();
        if (!/&lt;|&gt;|&amp;|&#\d+;|&#x[\da-f]+;/i.test(s)) return s;
        const ta = document.createElement('textarea');
        ta.innerHTML = s;
        return ta.value.trim();
    }

    function looksLikeHtml(str) {
        return /<[a-z][\s\S]*>/i.test(String(str || '').trim());
    }

    function formatLongDescriptionForDisplay(raw) {
        let s = decodeHtmlEntities(String(raw || '').trim());
        if (!s) return '';

        if (looksLikeHtml(s)) {
            return s;
        }

        const blocks = s.split(/\n\s*\n/).filter((p) => p.trim());
        if (blocks.length > 1) {
            return blocks.map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('');
        }

        const lines = s.split(/\n/).filter((p) => p.trim());
        if (lines.length > 1) {
            return lines.map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('');
        }

        return `<p>${escapeHtml(s)}</p>`;
    }

    const api = {
        escapeHtml,
        decodeHtmlEntities,
        looksLikeHtml,
        formatLongDescriptionForDisplay
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        global.HMDescriptionHtml = api;
    }
})(typeof window !== 'undefined' ? window : global);

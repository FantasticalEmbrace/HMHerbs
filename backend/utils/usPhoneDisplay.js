'use strict';

/** Display format: (601) 398-5600 */
const US_PHONE_DISPLAY_RE = /^\(\d{3}\) \d{3}-\d{4}$/;

function isUsPhoneDisplay(value) {
    return US_PHONE_DISPLAY_RE.test(String(value || '').trim());
}

/** Optional field: empty OK; otherwise must match display format. */
function isUsPhoneDisplayOrEmpty(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return true;
    return isUsPhoneDisplay(s);
}

module.exports = {
    US_PHONE_DISPLAY_RE,
    isUsPhoneDisplay,
    isUsPhoneDisplayOrEmpty
};

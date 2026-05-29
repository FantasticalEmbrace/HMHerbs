/**
 * Admin panel roles (top → bottom): admin, manager, assistant_manager, marketing.
 * Legacy DB values super_admin → admin, staff → assistant_manager.
 */

const ADMIN_ROLES = Object.freeze([
    'admin',
    'manager',
    'assistant_manager',
    'marketing',
]);

const LEGACY_ROLE_MAP = Object.freeze({
    super_admin: 'admin',
    staff: 'assistant_manager',
});

/** Numeric rank — higher can do everything lower roles can (except marketing-only UI scope). */
const ROLE_LEVEL = Object.freeze({
    marketing: 1,
    assistant_manager: 2,
    manager: 3,
    admin: 4,
});

const ROLE_LABELS = Object.freeze({
    admin: 'Admin',
    manager: 'Manager',
    assistant_manager: 'Assistant Manager',
    marketing: 'Marketing',
});

function normalizeAdminRole(role) {
    if (!role) return '';
    const key = String(role).trim().toLowerCase();
    return LEGACY_ROLE_MAP[key] || key;
}

function adminRoleLevel(role) {
    return ROLE_LEVEL[normalizeAdminRole(role)] || 0;
}

function isMarketingRole(role) {
    return normalizeAdminRole(role) === 'marketing';
}

function hasMinAdminRole(userRole, minRole) {
    return adminRoleLevel(userRole) >= adminRoleLevel(minRole);
}

/** Next rank up (marketing → assistant_manager → manager → admin). */
function getNextRole(role) {
    const normalized = normalizeAdminRole(role);
    const idx = ADMIN_ROLES.indexOf(normalized);
    if (idx <= 0) return null;
    return ADMIN_ROLES[idx - 1];
}

/** Sections visible in admin.html sidebar (data-section values). */
const SECTION_ACCESS = Object.freeze({
    marketing: ['marketing'],
    assistant_manager: [
        'dashboard',
        'orders',
        'customers',
        'edsa',
        'low-stock',
        'marketing',
    ],
    manager: [
        'dashboard',
        'products',
        'low-stock',
        'import',
        'categories',
        'brands',
        'orders',
        'tax-ledger',
        'customers',
        'gift-cards',
        'edsa',
        'marketing',
        'settings',
    ],
    admin: null, // null = all sections
});

function canAccessAdminSection(role, sectionId) {
    const normalized = normalizeAdminRole(role);
    const allowed = SECTION_ACCESS[normalized];
    if (allowed === null) return true;
    if (!allowed) return false;
    return allowed.includes(sectionId);
}

function defaultSectionForRole(role) {
    if (isMarketingRole(role)) return 'marketing';
    return 'dashboard';
}

/** `null` means all sections (Admin). */
function allowedSectionsForRole(role) {
    const normalized = normalizeAdminRole(role);
    if (normalized === 'admin') return null;
    return SECTION_ACCESS[normalized] || [];
}

/** Setting keys marketing may read/write via /admin/settings. */
const MARKETING_SETTING_KEYS = new Set(['store_promo_banner']);

module.exports = {
    ADMIN_ROLES,
    LEGACY_ROLE_MAP,
    ROLE_LEVEL,
    ROLE_LABELS,
    MARKETING_SETTING_KEYS,
    normalizeAdminRole,
    adminRoleLevel,
    isMarketingRole,
    hasMinAdminRole,
    getNextRole,
    canAccessAdminSection,
    defaultSectionForRole,
    allowedSectionsForRole,
};

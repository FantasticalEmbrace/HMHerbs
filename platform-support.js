'use strict';

(function () {
    const waitingList = document.getElementById('waiting-list');
    const progressList = document.getElementById('progress-list');
    const queueApp = document.getElementById('queue-app');
    const loginScreen = document.getElementById('login-screen');
    const statusMsg = document.getElementById('status-msg');
    const loginError = document.getElementById('login-error');

    let authToken = localStorage.getItem('adminToken') || '';
    let platformViewerKey = '';
    let pollTimer = null;

    function setStatus(text) {
        if (statusMsg) statusMsg.textContent = text || '';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function statusBadge(status) {
        const s = String(status || '').toLowerCase();
        const cls =
            s === 'pending'
                ? 'badge-pending'
                : s === 'awaiting_consent'
                  ? 'badge-awaiting'
                  : s === 'connecting'
                    ? 'badge-connecting'
                    : s === 'active'
                      ? 'badge-active'
                      : 'badge-offline';
        const label = s === 'awaiting_consent' ? 'Awaiting consent' : s.replace(/_/g, ' ');
        return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
    }

    function formatWhen(value) {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString();
    }

    async function api(path, options = {}) {
        const res = await fetch(`${window.location.origin}/api/platform/support/hub${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
                ...(options.headers || {})
            }
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = { raw: text };
        }
        if (res.status === 401 || res.status === 403) {
            authToken = '';
            localStorage.removeItem('adminToken');
            showLogin('Session expired — sign in again.');
            throw new Error(data?.error || 'Unauthorized');
        }
        if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
        return data;
    }

    function showLogin(message) {
        if (queueApp) queueApp.classList.add('hidden');
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (message && loginError) loginError.textContent = message;
    }

    function showQueue() {
        if (loginScreen) loginScreen.classList.add('hidden');
        if (queueApp) queueApp.classList.remove('hidden');
    }

    function renderRows(container, items, { allowConnect }) {
        if (!container) return;
        if (!items.length) {
            container.innerHTML = '<div class="empty">None right now.</div>';
            return;
        }
        container.innerHTML = items
            .map((item) => {
                const online = item.registerOnline
                    ? '<span style="color:#15803d;font-weight:600;">Online</span>'
                    : '<span style="color:#64748b;">Offline</span>';
                const connectBtn =
                    allowConnect && item.registerOnline
                        ? `<button type="button" class="btn-primary" data-connect="${item.storeSessionId}" data-store="${escapeHtml(item.storeBaseUrl)}" data-merchant-id="${escapeHtml(item.merchantId)}" data-merchant="${escapeHtml(item.merchantName)}">Connect</button>`
                        : '';
                return `<div class="row">
                    <div>
                        <div class="row-title">${escapeHtml(item.merchantName)} · ${escapeHtml(item.deviceLabel)}</div>
                        <div class="row-meta">
                            ${statusBadge(item.status)} · ${online} · ${escapeHtml(item.platform || 'unknown')}
                            · Code ${escapeHtml(item.sessionCode)}
                        </div>
                        <div class="row-meta">Requested ${escapeHtml(formatWhen(item.sessionCreatedAt))}${item.claimedBy ? ` · Claimed by ${escapeHtml(item.claimedBy)}` : ''}</div>
                        <div class="row-meta">${escapeHtml(item.storeBaseUrl)}</div>
                    </div>
                    <div>${connectBtn}</div>
                </div>`;
            })
            .join('');

        container.querySelectorAll('[data-connect]').forEach((btn) => {
            btn.addEventListener('click', () => connectSession(btn));
        });
    }

    async function connectSession(btn) {
        const sessionId = btn.getAttribute('data-connect');
        const storeBase = btn.getAttribute('data-store');
        const merchantId = btn.getAttribute('data-merchant-id') || '';
        const merchant = btn.getAttribute('data-merchant') || 'Merchant';
        if (!sessionId || !platformViewerKey) {
            alert('Missing session or platform key.');
            return;
        }

        btn.disabled = true;
        try {
            const data = await api('/connect', {
                method: 'POST',
                body: JSON.stringify({
                    storeSessionId: Number(sessionId),
                    merchantId
                })
            });

            const viewer = new URL(data.viewerUrl || `${storeBase}/support-viewer.html`);
            if (!data.viewerUrl) {
                viewer.searchParams.set('session', sessionId);
                viewer.searchParams.set('mode', 'platform');
            }
            viewer.hash = `platformKey=${encodeURIComponent(platformViewerKey)}`;
            window.open(viewer.toString(), '_blank', 'noopener,noreferrer,width=1100,height=720');
            setStatus(`Connecting to ${merchant}…`);
            await loadQueue();
        } catch (e) {
            alert(e.message || 'Connect failed');
        } finally {
            btn.disabled = false;
        }
    }

    async function loadQueue() {
        try {
            const data = await api('/queue');
            platformViewerKey = data.platformViewerKey || platformViewerKey;
            document.getElementById('stat-waiting').textContent = String(data.counts?.waiting || 0);
            document.getElementById('stat-progress').textContent = String(data.counts?.inProgress || 0);
            document.getElementById('stat-total').textContent = String(data.counts?.total || 0);
            renderRows(waitingList, data.waiting || [], { allowConnect: true });
            renderRows(progressList, data.inProgress || [], { allowConnect: true });
            setStatus(`Updated ${new Date().toLocaleTimeString()}`);
            showQueue();
        } catch (e) {
            if (e.message !== 'Unauthorized') {
                setStatus(e.message || 'Failed to load queue');
            }
        }
    }

    async function login() {
        const email = document.getElementById('login-email')?.value?.trim();
        const password = document.getElementById('login-password')?.value || '';
        if (!email || !password) {
            if (loginError) loginError.textContent = 'Email and password required.';
            return;
        }
        if (loginError) loginError.textContent = '';
        try {
            const res = await fetch(`${window.location.origin}/api/admin/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Login failed');
            authToken = data.token;
            localStorage.setItem('adminToken', authToken);
            showQueue();
            await loadQueue();
        } catch (e) {
            if (loginError) loginError.textContent = e.message || 'Login failed';
        }
    }

    function startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (authToken) loadQueue().catch(() => {});
        }, 8000);
    }

    document.getElementById('reload-btn')?.addEventListener('click', () => loadQueue());
    document.getElementById('login-btn')?.addEventListener('click', login);

    if (authToken) {
        loadQueue().then(startPolling).catch(() => showLogin());
    } else {
        showLogin();
    }
})();

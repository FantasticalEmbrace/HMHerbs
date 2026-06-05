/**
 * Gift Cards purchase page
 */
class GiftCardsPage {
    constructor() {
        this.catalog = { products: [] };
        this.activeType = 'digital';
        this.selectedAmount = null;
        this.selectedVariant = null;
        this.activeProduct = null;
        this.cart = [];
        this.init();
    }

    getApiBase() {
        if (typeof window.hmHerbsGetApiBaseUrl === 'function') {
            return window.hmHerbsGetApiBaseUrl();
        }
        if (typeof window.hmHerbsStorefrontApiBase === 'function') {
            const origin = window.hmHerbsStorefrontApiBase();
            if (origin) return origin;
        }
        if (window.location.protocol === 'file:') return 'http://127.0.0.1:3001';
        const h = window.location.hostname;
        if ((h === 'localhost' || h === '127.0.0.1') && window.location.port && window.location.port !== '3001') {
            return 'http://127.0.0.1:3001';
        }
        return window.location.origin || '';
    }

    async init() {
        this.loadCartFromStorage();
        this.setupTabs();
        this.setupCartUi();
        await this.loadCatalog();
        this.updateCartDisplay();
    }

    async loadCatalog() {
        const loading = document.getElementById('gift-cards-loading');
        const panel = document.getElementById('gift-card-panel');
        const errEl = document.getElementById('gift-cards-error');

        try {
            if (loading) loading.style.display = 'block';
            if (panel) panel.hidden = true;
            if (errEl) errEl.hidden = true;

            const res = await fetch(`${this.getApiBase()}/api/gift-cards/catalog`);
            if (!res.ok) throw new Error('Failed to load gift cards');
            this.catalog = await res.json();
            if (!this.catalog.products?.length) throw new Error('Gift cards are not available yet');

            this.selectType(this.activeType);
            if (loading) loading.style.display = 'none';
            if (panel) panel.hidden = false;
        } catch (err) {
            if (loading) loading.style.display = 'none';
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = err.message || 'Could not load gift cards. Please try again later.';
            }
        }
    }

    setupTabs() {
        document.querySelectorAll('[data-gift-type]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.selectType(btn.getAttribute('data-gift-type'));
            });
        });
    }

    selectType(type) {
        this.activeType = type;
        this.selectedAmount = null;
        this.selectedVariant = null;

        document.querySelectorAll('[data-gift-type]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-gift-type') === type);
        });

        this.activeProduct = (this.catalog.products || []).find((p) => p.cardType === type) || null;
        if (!this.activeProduct) return;

        const title = document.getElementById('gift-panel-title');
        const desc = document.getElementById('gift-panel-desc');
        const emailLabel = document.getElementById('recipient-email-label');
        const emailHelp = document.getElementById('recipient-email-help');
        const reqMark = document.querySelector('#recipient-email-label .required-mark');

        if (title) title.textContent = this.activeProduct.name;
        if (desc) {
            desc.textContent = type === 'digital'
                ? 'Delivered instantly by email. Recipient gets an account to track their balance.'
                : 'Mailed to your shipping address. Add a recipient email to create their account for balance tracking.';
        }
        if (emailLabel) emailLabel.textContent = type === 'digital' ? 'Recipient email' : 'Recipient email (optional)';
        if (reqMark) reqMark.style.display = type === 'digital' ? 'inline' : 'none';
        if (emailHelp) {
            emailHelp.textContent = type === 'digital'
                ? 'Required — we email the gift card and create an account for the recipient.'
                : 'Optional — creates an account so the recipient can track their balance online.';
        }

        const emailInput = document.getElementById('recipient-email');
        if (emailInput) emailInput.required = type === 'digital';

        this.renderAmounts();
    }

    renderAmounts() {
        const grid = document.getElementById('amount-grid');
        if (!grid || !this.activeProduct) return;
        grid.innerHTML = '';

        (this.activeProduct.variants || []).forEach((v) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'amount-btn';
            btn.textContent = `$${Number(v.price).toFixed(0)}`;
            btn.setAttribute('data-variant-id', v.id);
            btn.setAttribute('data-amount', v.price);
            if (this.selectedVariant === v.id) btn.classList.add('selected');
            btn.addEventListener('click', () => {
                this.selectedVariant = v.id;
                this.selectedAmount = Number(v.price);
                grid.querySelectorAll('.amount-btn').forEach((b) => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
            grid.appendChild(btn);
        });
    }

    setupCartUi() {
        const form = document.getElementById('gift-card-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addToCart();
            });
        }

        const checkoutBtn = document.getElementById('checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => this.proceedToCheckout());
        }
    }

    addToCart() {
        if (!this.activeProduct || !this.selectedVariant || !this.selectedAmount) {
            this.notify('Please select a gift card amount', 'error');
            return;
        }

        const recipientEmail = document.getElementById('recipient-email')?.value.trim().toLowerCase() || '';
        const recipientName = document.getElementById('recipient-name')?.value.trim() || '';
        const senderName = document.getElementById('sender-name')?.value.trim() || '';
        const personalMessage = document.getElementById('personal-message')?.value.trim() || '';

        if (this.activeType === 'digital') {
            if (!recipientEmail) {
                this.notify('Recipient email is required for digital gift cards', 'error');
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
                this.notify('Please enter a valid recipient email', 'error');
                return;
            }
        } else if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
            this.notify('Please enter a valid recipient email', 'error');
            return;
        }

        const variant = (this.activeProduct.variants || []).find((v) => v.id === this.selectedVariant);
        const lineName = `${this.activeProduct.name} — $${this.selectedAmount.toFixed(0)}`;

        this.cart.push({
            id: this.activeProduct.id,
            cartLineId: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            variant_id: this.selectedVariant,
            name: lineName,
            price: this.selectedAmount,
            quantity: 1,
            image: '',
            inStock: true,
            giftCard: {
                cardType: this.activeType,
                recipientEmail,
                recipientName,
                senderName,
                personalMessage
            }
        });

        this.saveCartToStorage();
        this.updateCartDisplay();
        this.notify(`${lineName} added to cart`, 'success');

        document.getElementById('gift-card-form')?.reset();
        this.selectedAmount = null;
        this.selectedVariant = null;
        this.renderAmounts();
    }

    loadCartFromStorage() {
        try {
            const raw = localStorage.getItem('hmherbs_cart');
            this.cart = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(this.cart)) this.cart = [];
        } catch {
            this.cart = [];
        }
    }

    saveCartToStorage() {
        localStorage.setItem('hmherbs_cart', JSON.stringify(this.cart));
        if (window.hmHerbsApp && Array.isArray(window.hmHerbsApp.cart)) {
            window.hmHerbsApp.cart = this.cart.slice();
        }
    }

    updateCartDisplay() {
        const countEl = document.getElementById('cart-count');
        const totalEl = document.getElementById('cart-total');
        const itemsEl = document.getElementById('cart-items');
        const emptyEl = document.getElementById('cart-empty');
        const total = this.cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
        const count = this.cart.reduce((s, i) => s + (i.quantity || 1), 0);

        if (countEl) countEl.textContent = String(count);
        if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;

        if (!itemsEl) return;

        if (this.cart.length === 0) {
            itemsEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        itemsEl.innerHTML = this.cart
            .map(
                (item, idx) => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${this.escapeHtml(item.name)}</div>
                    ${item.giftCard?.recipientEmail ? `<div class="cart-item-meta">To: ${this.escapeHtml(item.giftCard.recipientEmail)}</div>` : ''}
                    <div class="cart-item-price">$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</div>
                </div>
                <button type="button" class="cart-item-remove" data-idx="${idx}" aria-label="Remove">×</button>
            </div>`
            )
            .join('');

        itemsEl.querySelectorAll('.cart-item-remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-idx'));
                this.cart.splice(idx, 1);
                this.saveCartToStorage();
                this.updateCartDisplay();
            });
        });
    }

    proceedToCheckout() {
        if (!this.cart.length) {
            this.notify('Your cart is empty', 'error');
            return;
        }
        sessionStorage.setItem('checkout_cart', JSON.stringify(this.cart));
        localStorage.setItem('hmherbs_cart', JSON.stringify(this.cart));
        window.location.href = 'checkout.html';
    }

    notify(msg, type) {
        if (window.HMNotify?.show) window.HMNotify.show(msg, type);
        else alert(msg);
    }

    escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.giftCardsPage = new GiftCardsPage();
});

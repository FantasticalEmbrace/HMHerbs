// Checkout Page JavaScript
class CheckoutManager {
    constructor() {
        this.cart = [];
        this.subtotal = 0;
        this.shipping = 0;
        this.tax = 0;
        this.total = 0;
        this.init();
    }

    init() {
        this.loadCart();
        this.setupEventListeners();
        this.setupFormValidation();
    }

    loadCart() {
        try {
            const cartData = sessionStorage.getItem('checkout_cart');
            if (cartData) {
                this.cart = JSON.parse(cartData);
                if (this.cart.length > 0) {
                    this.renderOrderSummary();
                    this.calculateTotals();
                } else {
                    this.showEmptyCart();
                }
            } else {
                // Try loading from localStorage as fallback
                const localCart = localStorage.getItem('hmherbs_cart');
                if (localCart) {
                    this.cart = JSON.parse(localCart);
                    if (this.cart.length > 0) {
                        sessionStorage.setItem('checkout_cart', localCart);
                        this.renderOrderSummary();
                        this.calculateTotals();
                    } else {
                        this.showEmptyCart();
                    }
                } else {
                    this.showEmptyCart();
                }
            }
        } catch (error) {
            console.error('Error loading cart:', error);
            this.showEmptyCart();
        }
    }

    showEmptyCart() {
        const container = document.getElementById('order-items-container');
        const totalsContainer = document.getElementById('order-totals-container');
        if (container) {
            container.innerHTML = `
                <div class="empty-cart-message">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Your cart is empty</p>
                    <a href="products.html" class="btn btn-primary" style="margin-top: var(--space-4); display: inline-block;">Continue Shopping</a>
                </div>
            `;
        }
        if (totalsContainer) {
            totalsContainer.style.display = 'none';
        }
    }

    renderOrderSummary() {
        const container = document.getElementById('order-items-container');
        const totalsContainer = document.getElementById('order-totals-container');
        
        if (!container || this.cart.length === 0) {
            this.showEmptyCart();
            return;
        }

        // Clear container
        container.innerHTML = '';

        this.cart.forEach((item, index) => {
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'order-item';
            itemDiv.innerHTML = `
                <img src="${item.image || this.createPlaceholderImage()}" alt="${item.name}" class="order-item-image" onerror="this.src='${this.createPlaceholderImage()}'">
                <div class="order-item-details">
                    <div class="order-item-name">${this.escapeHtml(item.name)}</div>
                    <div class="order-item-quantity">Quantity: ${item.quantity}</div>
                    <div class="order-item-price">$${itemTotal.toFixed(2)}</div>
                    <button type="button" class="order-item-remove" data-index="${index}" aria-label="Remove ${item.name} from cart">
                        <i class="fas fa-trash-alt" aria-hidden="true"></i> Remove
                    </button>
                </div>
            `;
            
            // Add click listener for remove button
            const removeBtn = itemDiv.querySelector('.order-item-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    this.removeItem(index);
                });
            }
            
            container.appendChild(itemDiv);
        });

        if (totalsContainer) {
            totalsContainer.style.display = 'block';
        }
    }

    removeItem(index) {
        if (index >= 0 && index < this.cart.length) {
            const removedItem = this.cart[index];
            this.cart.splice(index, 1);
            
            // Update storage
            sessionStorage.setItem('checkout_cart', JSON.stringify(this.cart));
            localStorage.setItem('hmherbs_cart', JSON.stringify(this.cart));
            
            // Re-render
            if (this.cart.length > 0) {
                this.renderOrderSummary();
                this.calculateTotals();
            } else {
                this.showEmptyCart();
            }
            
            this.showNotification(`Removed ${removedItem.name} from cart`, 'success');
            
            // Also notify main app if it exists (for sync)
            if (window.hmHerbsApp) {
                window.hmHerbsApp.loadCartFromStorage();
                window.hmHerbsApp.updateCartDisplay();
            }
        }
    }

    calculateTotals() {
        // Calculate subtotal
        this.subtotal = this.cart.reduce((sum, item) => {
            return sum + ((item.price || 0) * (item.quantity || 1));
        }, 0);

        // Calculate shipping (free over $50, otherwise $5.99)
        this.shipping = this.subtotal >= 50 ? 0 : 5.99;

        // Calculate tax (8% for example, adjust as needed)
        this.tax = this.subtotal * 0.08;

        // Calculate total
        this.total = this.subtotal + this.shipping + this.tax;

        // Update display
        const subtotalEl = document.getElementById('subtotal');
        const shippingEl = document.getElementById('shipping');
        const taxEl = document.getElementById('tax');
        const totalEl = document.getElementById('total');

        if (subtotalEl) subtotalEl.textContent = `$${this.subtotal.toFixed(2)}`;
        if (shippingEl) shippingEl.textContent = this.shipping === 0 ? 'FREE' : `$${this.shipping.toFixed(2)}`;
        if (taxEl) taxEl.textContent = `$${this.tax.toFixed(2)}`;
        if (totalEl) totalEl.textContent = `$${this.total.toFixed(2)}`;
    }

    setupEventListeners() {
        // Same as shipping checkbox
        const sameAsShipping = document.getElementById('same-as-shipping');
        const billingFields = document.getElementById('billing-address-fields');
        
        if (sameAsShipping && billingFields) {
            sameAsShipping.addEventListener('change', (e) => {
                if (e.target.checked) {
                    billingFields.style.display = 'none';
                    // Clear billing fields
                    const billingAddress1 = document.getElementById('billing-address-1');
                    const billingAddress2 = document.getElementById('billing-address-2');
                    const billingCity = document.getElementById('billing-city');
                    const billingState = document.getElementById('billing-state');
                    const billingZip = document.getElementById('billing-zip');
                    const billingCountry = document.getElementById('billing-country');
                    
                    if (billingAddress1) billingAddress1.value = '';
                    if (billingAddress2) billingAddress2.value = '';
                    if (billingCity) billingCity.value = '';
                    if (billingState) billingState.value = '';
                    if (billingZip) billingZip.value = '';
                    if (billingCountry) billingCountry.value = 'United States';
                } else {
                    billingFields.style.display = 'block';
                }
            });
        }

        // Payment method change - show/hide EPI payment fields and bank account fields
        const paymentMethod = document.getElementById('payment-method');
        const epiPaymentFields = document.getElementById('epi-payment-fields');
        const bankAccountFields = document.getElementById('bank-account-fields');
        
        if (paymentMethod) {
            // Also check on page load in case a value is already selected
            const checkPaymentMethod = () => {
                const selectedMethod = paymentMethod.value;
                console.log('Payment method changed:', selectedMethod);
                
                // Hide all payment fields first
                if (epiPaymentFields) {
                    epiPaymentFields.style.display = 'none';
                }
                if (bankAccountFields) {
                    bankAccountFields.style.display = 'none';
                }
                
                // Remove required attributes from all payment fields
                const allPaymentFields = [
                    'card-number', 'card-expiry', 'card-cvv', 'cardholder-name',
                    'account-holder-name', 'account-type', 'routing-number', 
                    'account-number', 'confirm-account-number'
                ];
                allPaymentFields.forEach(fieldId => {
                    const field = document.getElementById(fieldId);
                    if (field) field.removeAttribute('required');
                });
                
                if (selectedMethod === 'credit_card' || selectedMethod === 'debit_card') {
                    // Show EPI card fields
                    if (epiPaymentFields) {
                        epiPaymentFields.style.display = 'block';
                        epiPaymentFields.style.visibility = 'visible';
                        epiPaymentFields.style.opacity = '1';
                    }
                    // Make EPI fields required
                    const cardNumber = document.getElementById('card-number');
                    const cardExpiry = document.getElementById('card-expiry');
                    const cardCvv = document.getElementById('card-cvv');
                    const cardholderName = document.getElementById('cardholder-name');
                    
                    if (cardNumber) {
                        cardNumber.setAttribute('required', 'required');
                        cardNumber.removeAttribute('disabled');
                        cardNumber.removeAttribute('readonly');
                    }
                    if (cardExpiry) {
                        cardExpiry.setAttribute('required', 'required');
                        cardExpiry.removeAttribute('disabled');
                        cardExpiry.removeAttribute('readonly');
                    }
                    if (cardCvv) {
                        cardCvv.setAttribute('required', 'required');
                        cardCvv.removeAttribute('disabled');
                        cardCvv.removeAttribute('readonly');
                    }
                    if (cardholderName) {
                        cardholderName.setAttribute('required', 'required');
                        cardholderName.removeAttribute('disabled');
                        cardholderName.removeAttribute('readonly');
                    }
                    console.log('EPI payment fields shown');
                } else if (selectedMethod === 'bank_account') {
                    // Show bank account fields
                    if (bankAccountFields) {
                        bankAccountFields.style.display = 'block';
                        bankAccountFields.style.visibility = 'visible';
                        bankAccountFields.style.opacity = '1';
                    }
                    // Make bank account fields required
                    const accountHolderName = document.getElementById('account-holder-name');
                    const accountType = document.getElementById('account-type');
                    const routingNumber = document.getElementById('routing-number');
                    const accountNumber = document.getElementById('account-number');
                    const confirmAccountNumber = document.getElementById('confirm-account-number');
                    
                    if (accountHolderName) {
                        accountHolderName.setAttribute('required', 'required');
                        accountHolderName.removeAttribute('disabled');
                        accountHolderName.removeAttribute('readonly');
                    }
                    if (accountType) {
                        accountType.setAttribute('required', 'required');
                        accountType.removeAttribute('disabled');
                    }
                    if (routingNumber) {
                        routingNumber.setAttribute('required', 'required');
                        routingNumber.removeAttribute('disabled');
                        routingNumber.removeAttribute('readonly');
                    }
                    if (accountNumber) {
                        accountNumber.setAttribute('required', 'required');
                        accountNumber.removeAttribute('disabled');
                        accountNumber.removeAttribute('readonly');
                    }
                    if (confirmAccountNumber) {
                        confirmAccountNumber.setAttribute('required', 'required');
                        confirmAccountNumber.removeAttribute('disabled');
                        confirmAccountNumber.removeAttribute('readonly');
                    }
                    console.log('Bank account fields shown');
                }
            };
            
            paymentMethod.addEventListener('change', checkPaymentMethod);
            
            // Check on initial load
            setTimeout(checkPaymentMethod, 100);
        } else {
            console.error('Payment method not found');
        }

        // Card number formatting
        const cardNumber = document.getElementById('card-number');
        if (cardNumber) {
            cardNumber.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\s/g, '');
                let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
                if (formattedValue.length <= 19) {
                    e.target.value = formattedValue;
                }
            });
        }

        // Expiry date formatting
        const cardExpiry = document.getElementById('card-expiry');
        if (cardExpiry) {
            cardExpiry.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length >= 2) {
                    value = value.substring(0, 2) + '/' + value.substring(2, 4);
                }
                e.target.value = value;
            });
        }

        // CVV - numbers only
        const cardCvv = document.getElementById('card-cvv');
        if (cardCvv) {
            cardCvv.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
            });
        }

        // Routing number - numbers only, max 9 digits
        const routingNumber = document.getElementById('routing-number');
        if (routingNumber) {
            routingNumber.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').substring(0, 9);
            });
        }

        // Account number - numbers only
        const accountNumber = document.getElementById('account-number');
        if (accountNumber) {
            accountNumber.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
            });
        }

        // Confirm account number - numbers only, and validate match
        const confirmAccountNumber = document.getElementById('confirm-account-number');
        if (confirmAccountNumber) {
            confirmAccountNumber.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
                // Validate match
                const accountNum = document.getElementById('account-number')?.value || '';
                const confirmNum = e.target.value;
                const formGroup = e.target.closest('.form-group');
                const errorMessage = formGroup?.querySelector('.error-message');
                
                if (confirmNum && accountNum && confirmNum !== accountNum) {
                    if (formGroup) formGroup.classList.add('error');
                    if (errorMessage) errorMessage.textContent = 'Account numbers do not match';
                } else if (confirmNum && accountNum && confirmNum === accountNum) {
                    if (formGroup) formGroup.classList.remove('error');
                }
            });
        }

        // Form submission
        const form = document.getElementById('checkout-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSubmit();
            });
        }
    }

    setupFormValidation() {
        const form = document.getElementById('checkout-form');
        if (!form) return;

        const inputs = form.querySelectorAll('input[required], select[required]');
        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                this.validateField(input);
            });
            input.addEventListener('input', () => {
                if (input.classList.contains('error')) {
                    this.validateField(input);
                }
            });
        });
    }

    validateField(field) {
        const formGroup = field.closest('.form-group');
        const errorMessage = formGroup?.querySelector('.error-message');
        
        let isValid = true;
        let errorText = '';

        // Remove previous error state
        if (formGroup) {
            formGroup.classList.remove('error');
        }

        // Check if required field is empty
        if (field.hasAttribute('required') && !field.value.trim()) {
            isValid = false;
            errorText = 'This field is required';
        }

        // Email validation
        if (field.type === 'email' && field.value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(field.value)) {
                isValid = false;
                errorText = 'Please enter a valid email address';
            }
        }

        // Phone validation
        if (field.type === 'tel' && field.value) {
            const phoneRegex = /^[\d\s\-\(\)]+$/;
            if (!phoneRegex.test(field.value) || field.value.replace(/\D/g, '').length < 10) {
                isValid = false;
                errorText = 'Please enter a valid phone number';
            }
        }

        // ZIP code validation
        if (field.id.includes('zip') && field.value) {
            const zipRegex = /^\d{5}(-\d{4})?$/;
            if (!zipRegex.test(field.value)) {
                isValid = false;
                errorText = 'Please enter a valid ZIP code';
            }
        }

        // Routing number validation (9 digits)
        if (field.id === 'routing-number' && field.value) {
            const routingRegex = /^\d{9}$/;
            if (!routingRegex.test(field.value)) {
                isValid = false;
                errorText = 'Please enter a valid routing number (9 digits)';
            }
        }

        // Account number validation (at least 4 digits)
        if (field.id === 'account-number' && field.value) {
            const accountRegex = /^\d{4,}$/;
            if (!accountRegex.test(field.value)) {
                isValid = false;
                errorText = 'Please enter a valid account number (minimum 4 digits)';
            }
        }

        // Confirm account number validation
        if (field.id === 'confirm-account-number' && field.value) {
            const accountNumber = document.getElementById('account-number')?.value || '';
            if (field.value !== accountNumber) {
                isValid = false;
                errorText = 'Account numbers do not match';
            }
        }

        // Update error state
        if (!isValid) {
            if (formGroup) {
                formGroup.classList.add('error');
            }
            if (errorMessage) {
                errorMessage.textContent = errorText;
            }
        }

        return isValid;
    }

    validateForm() {
        const form = document.getElementById('checkout-form');
        if (!form) return false;

        const requiredFields = form.querySelectorAll('input[required], select[required]');
        let isValid = true;

        requiredFields.forEach(field => {
            // Skip billing fields if "same as shipping" is checked
            if (field.id.includes('billing') && document.getElementById('same-as-shipping')?.checked) {
                return;
            }

            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    async handleSubmit() {
        // Validate form
        if (!this.validateForm()) {
            this.showNotification('Please fix the errors in the form', 'error');
            return;
        }

        // Check if cart is empty
        if (this.cart.length === 0) {
            this.showNotification('Your cart is empty', 'error');
            return;
        }

        // Show loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('active');
        }

        // Collect form data
        const formData = this.collectFormData();

        try {
            // Submit order to backend
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const result = await response.json();
                // Clear cart
                sessionStorage.removeItem('checkout_cart');
                localStorage.removeItem('hmherbs_cart');
                
                // Redirect to success page or show success message
                this.showNotification('Order placed successfully!', 'success');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to place order');
            }
        } catch (error) {
            console.error('Error submitting order:', error);
            this.showNotification(error.message || 'Failed to place order. Please try again.', 'error');
        } finally {
            if (loadingOverlay) {
                loadingOverlay.classList.remove('active');
            }
        }
    }

    collectFormData() {
        const sameAsShipping = document.getElementById('same-as-shipping')?.checked;
        
        const customerInfo = {
            first_name: document.getElementById('first-name')?.value || '',
            last_name: document.getElementById('last-name')?.value || '',
            email: document.getElementById('email')?.value || '',
            phone: document.getElementById('phone')?.value || ''
        };

        const shippingAddress = {
            address_line_1: document.getElementById('shipping-address-1')?.value || '',
            address_line_2: document.getElementById('shipping-address-2')?.value || '',
            city: document.getElementById('shipping-city')?.value || '',
            state: document.getElementById('shipping-state')?.value || '',
            postal_code: document.getElementById('shipping-zip')?.value || '',
            country: document.getElementById('shipping-country')?.value || 'United States'
        };

        let billingAddress = shippingAddress;
        if (!sameAsShipping) {
            billingAddress = {
                address_line_1: document.getElementById('billing-address-1')?.value || '',
                address_line_2: document.getElementById('billing-address-2')?.value || '',
                city: document.getElementById('billing-city')?.value || '',
                state: document.getElementById('billing-state')?.value || '',
                postal_code: document.getElementById('billing-zip')?.value || '',
                country: document.getElementById('billing-country')?.value || 'United States'
            };
        }

        const cartItems = this.cart.map(item => ({
            product_id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        }));

        const paymentMethod = document.getElementById('payment-method')?.value || '';
        
        // Collect EPI payment data if credit/debit card is selected
        let paymentData = null;
        if (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
            const cardNumber = document.getElementById('card-number')?.value.replace(/\s/g, '') || '';
            const cardExpiry = document.getElementById('card-expiry')?.value || '';
            const [expMonth, expYear] = cardExpiry.split('/');
            const cardCvv = document.getElementById('card-cvv')?.value || '';
            const cardholderName = document.getElementById('cardholder-name')?.value || '';

            paymentData = {
                card_number: cardNumber,
                exp_month: expMonth,
                exp_year: expYear ? '20' + expYear : '', // Convert YY to YYYY
                cvv: cardCvv,
                cardholder_name: cardholderName,
                processor: 'epi'
            };
        } else if (paymentMethod === 'bank_account') {
            const accountHolderName = document.getElementById('account-holder-name')?.value || '';
            const accountType = document.getElementById('account-type')?.value || '';
            const routingNumber = document.getElementById('routing-number')?.value || '';
            const accountNumber = document.getElementById('account-number')?.value || '';
            const confirmAccountNumber = document.getElementById('confirm-account-number')?.value || '';

            paymentData = {
                account_holder_name: accountHolderName,
                account_type: accountType,
                routing_number: routingNumber,
                account_number: accountNumber,
                confirm_account_number: confirmAccountNumber,
                processor: 'epi'
            };
        }

        return {
            customerInfo,
            shippingAddress,
            billingAddress,
            paymentMethod: paymentMethod,
            paymentData: paymentData, // EPI payment data
            orderNotes: document.getElementById('order-notes')?.value || '',
            cartItems,
            subtotal: this.subtotal,
            tax: this.tax,
            shipping: this.shipping,
            total: this.total
        };
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
        `;

        notification.textContent = message;
        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    createPlaceholderImage() {
        // Create an SVG placeholder image as data URI
        const svgContent = `
            <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#4a7c59;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#5a8c69;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <rect width="200" height="200" fill="url(#grad)"/>
                <circle cx="100" cy="75" r="20" fill="rgba(255,255,255,0.3)"/>
                <rect x="80" y="100" width="40" height="30" rx="3" fill="rgba(255,255,255,0.2)"/>
                <text x="100" y="145" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle">Product</text>
                <text x="100" y="160" font-family="Arial, sans-serif" font-size="10" fill="rgba(255,255,255,0.9)" text-anchor="middle">Image</text>
            </svg>
        `.trim();
        return `data:image/svg+xml;base64,${btoa(svgContent)}`;
    }
}

// Initialize checkout manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.checkoutManager = new CheckoutManager();
    });
} else {
    window.checkoutManager = new CheckoutManager();
}


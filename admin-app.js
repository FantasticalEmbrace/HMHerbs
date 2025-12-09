// HM Herbs Admin Panel Application
// Complete admin interface with backend integration

class AdminApp {
    constructor() {
        // Dynamic API base URL configuration
        this.apiBaseUrl = this.getApiBaseUrl();
        this.authToken = localStorage.getItem('adminToken');
        this.currentUser = null;
        this.eventListeners = []; // Track event listeners for cleanup
        this.timeouts = []; // Track timeouts for cleanup
        
        this.init();
    }
    
    getApiBaseUrl() {
        // Check if we're in development (localhost)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001/api';
        }
        
        // For production, use the same origin with /api path
        return `${window.location.origin}/api`;
    }

    async init() {
        // Check if user is already logged in
        if (this.authToken) {
            try {
                await this.loadDashboard();
            } catch (error) {
                this.logout();
            }
        }

        this.setupEventListeners();
    }

    // Helper function to escape HTML to prevent XSS
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Navigation
        document.querySelectorAll('.nav-link[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.target.closest('.nav-link').dataset.section;
                this.showSection(section);
            });
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const emailElement = document.getElementById('email');
        const passwordElement = document.getElementById('password');
        const errorDiv = document.getElementById('loginError');
        
        if (!emailElement || !passwordElement || !errorDiv) {
            // Log error in development only
            if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
                console.error('Required login form elements not found');
            }
            return;
        }
        
        const email = emailElement.value;
        const password = passwordElement.value;
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/admin/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.authToken = data.token;
                this.currentUser = data.admin;
                localStorage.setItem('adminToken', this.authToken);
                
                await this.loadDashboard();
            } else {
                errorDiv.textContent = data.error || 'Login failed';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            errorDiv.textContent = 'Connection error. Please try again.';
            errorDiv.style.display = 'block';
        }
    }

    async loadDashboard() {
        // Hide login screen and show dashboard
        const loginScreen = document.getElementById('loginScreen');
        const adminDashboard = document.getElementById('adminDashboard');
        const userName = document.getElementById('userName');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (adminDashboard) adminDashboard.style.display = 'flex';
        
        // Update user info
        if (this.currentUser && userName) {
            userName.textContent = 
                `${this.currentUser.firstName} ${this.currentUser.lastName}`;
        }

        // Load dashboard data
        await this.loadDashboardStats();
    }

    async loadDashboardStats() {
        try {
            const response = await this.apiRequest('/admin/dashboard/stats');
            
            if (response.products) {
                const totalProducts = document.getElementById('totalProducts');
                const lowStockProducts = document.getElementById('lowStockProducts');
                
                if (totalProducts) totalProducts.textContent = response.products.total_products || 0;
                if (lowStockProducts) lowStockProducts.textContent = response.products.low_stock_products || 0;
            }
            
            if (response.orders) {
                const totalOrders = document.getElementById('totalOrders');
                if (totalOrders) totalOrders.textContent = response.orders.total_orders || 0;
            }
            
            if (response.edsa) {
                const totalBookings = document.getElementById('totalBookings');
                if (totalBookings) totalBookings.textContent = response.edsa.pending_bookings || 0;
            }
        } catch (error) {
            // Log error in development only
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to load dashboard stats:', error);
            }
            // Show user-friendly error message
            this.showNotification('Failed to load dashboard statistics', 'error');
        }
    }

    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        const activeNavLink = document.querySelector(`[data-section="${sectionName}"]`);
        if (activeNavLink) activeNavLink.classList.add('active');

        // Show section
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        const activeSection = document.getElementById(sectionName);
        if (activeSection) activeSection.classList.add('active');

        // Load section data
        this.loadSectionData(sectionName);
    }

    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'dashboard':
                await this.loadDashboardStats();
                break;
            case 'products':
                await this.loadProducts();
                break;
            case 'orders':
                await this.loadOrders();
                break;
            case 'edsa':
                await this.loadEDSABookings();
                break;
        }
    }

    async loadProducts() {
        const container = document.getElementById('productsTable');
        
        // Create loading indicator safely
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        const loadingText = document.createTextNode('Loading products...');
        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(loadingText);
        
        container.innerHTML = '';
        container.appendChild(loadingDiv);

        try {
            const response = await this.apiRequest('/admin/products?limit=50');
            
            if (response.products && response.products.length > 0) {
                container.innerHTML = this.renderProductsTable(response.products);
            } else {
                // Create empty state safely
                const emptyDiv = document.createElement('div');
                emptyDiv.style.textAlign = 'center';
                emptyDiv.style.padding = '2rem';
                emptyDiv.style.color = 'var(--gray-500)';
                
                const icon = document.createElement('i');
                icon.className = 'fas fa-box-open';
                icon.style.fontSize = '3rem';
                icon.style.marginBottom = '1rem';
                
                const message = document.createElement('p');
                message.textContent = 'No products found. Import products or scrape from HM Herbs website.';
                
                emptyDiv.appendChild(icon);
                emptyDiv.appendChild(message);
                
                // Add scrape button
                const scrapeBtn = document.createElement('button');
                scrapeBtn.className = 'btn btn-primary';
                scrapeBtn.onclick = () => scrapeProducts();
                
                const btnIcon = document.createElement('i');
                btnIcon.className = 'fas fa-download';
                const btnText = document.createTextNode(' Scrape HM Herbs Products');
                
                scrapeBtn.appendChild(btnIcon);
                scrapeBtn.appendChild(btnText);
                emptyDiv.appendChild(scrapeBtn);
                
                container.innerHTML = '';
                container.appendChild(emptyDiv);
            }
        } catch (error) {
            // Create error message safely
            const errorDiv = document.createElement('div');
            errorDiv.style.textAlign = 'center';
            errorDiv.style.padding = '2rem';
            errorDiv.style.color = 'var(--error)';
            
            const errorIcon = document.createElement('i');
            errorIcon.className = 'fas fa-exclamation-triangle';
            errorIcon.style.fontSize = '3rem';
            errorIcon.style.marginBottom = '1rem';
            
            const errorMessage = document.createElement('p');
            errorMessage.textContent = `Failed to load products: ${error.message}`;
            
            errorDiv.appendChild(errorIcon);
            errorDiv.appendChild(errorMessage);
            
            container.innerHTML = '';
            container.appendChild(errorDiv);
        }
    }

    renderProductsTable(products) {
        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Name</th>
                            <th>Brand</th>
                            <th>Price</th>
                            <th>Stock</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(product => `
                            <tr>
                                <td><code>${this.escapeHtml(product.sku)}</code></td>
                                <td>
                                    <div style="font-weight: 500;">${this.escapeHtml(product.name)}</div>
                                    <div style="font-size: 0.75rem; color: var(--gray-500);">${this.escapeHtml(product.category_name || 'No category')}</div>
                                </td>
                                <td>${this.escapeHtml(product.brand_name || 'Unknown')}</td>
                                <td>$${product.price.toFixed(2)}</td>
                                <td>
                                    <span class="badge ${product.inventory_quantity <= (product.low_stock_threshold || 10) ? 'badge-warning' : 'badge-success'}">
                                        ${product.inventory_quantity}
                                    </span>
                                </td>
                                <td>
                                    <span class="badge ${product.is_active ? 'badge-success' : 'badge-danger'}">
                                        ${product.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="editProduct(${product.id})">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`,
                ...options.headers
            },
            ...options
        };

        const response = await fetch(url, config);
        
        if (response.status === 401) {
            this.logout();
            throw new Error('Authentication required');
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'API request failed');
        }

        return data;
    }

    logout() {
        // Clean up event listeners and timeouts
        this.cleanup();
        
        localStorage.removeItem('adminToken');
        this.authToken = null;
        this.currentUser = null;
        
        const adminDashboard = document.getElementById('adminDashboard');
        const loginScreen = document.getElementById('loginScreen');
        const loginForm = document.getElementById('loginForm');
        const loginError = document.getElementById('loginError');
        
        if (adminDashboard) adminDashboard.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'flex';
        
        // Clear forms
        if (loginForm) loginForm.reset();
        if (loginError) loginError.style.display = 'none';
    }

    // Add event listener with tracking for cleanup
    addEventListenerWithCleanup(element, event, handler, options = false) {
        element.addEventListener(event, handler, options);
        this.eventListeners.push({ element, event, handler, options });
    }

    // Add timeout with tracking for cleanup
    addTimeoutWithCleanup(callback, delay) {
        const timeoutId = setTimeout(callback, delay);
        this.timeouts.push(timeoutId);
        return timeoutId;
    }

    // Clean up all tracked event listeners and timeouts
    cleanup() {
        // Remove all tracked event listeners
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            try {
                element.removeEventListener(event, handler, options);
            } catch (error) {
                console.warn('Error removing event listener:', error);
            }
        });
        this.eventListeners = [];

        // Clear all tracked timeouts
        this.timeouts.forEach(timeoutId => {
            try {
                clearTimeout(timeoutId);
            } catch (error) {
                console.warn('Error clearing timeout:', error);
            }
        });
        this.timeouts = [];
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        // Create notification content safely
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; align-items: center; gap: 0.5rem;';
        
        const icon = document.createElement('i');
        const iconClass = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
        icon.className = `fas fa-${iconClass}`;
        
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        
        container.appendChild(icon);
        container.appendChild(messageSpan);
        notification.appendChild(container);
        
        // Add styles
        Object.assign(notification.style, {
            position: 'fixed',
            top: '2rem',
            right: '2rem',
            padding: '1rem 1.5rem',
            borderRadius: 'var(--border-radius)',
            color: 'white',
            backgroundColor: type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--info)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: '9999',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease'
        });
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    }
}

// Global functions for button clicks
async function scrapeProducts() {
    const app = window.adminApp;
    
    try {
        app.showNotification('Starting product scraping from HM Herbs website...', 'info');
        
        const response = await fetch(`${app.apiBaseUrl}/admin/scrape-products`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${app.authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            app.showNotification(`Successfully scraped ${data.productsFound || 0} products!`, 'success');
            app.loadProducts(); // Reload products table
        } else {
            app.showNotification(data.error || 'Scraping failed', 'error');
        }
    } catch (error) {
        app.showNotification('Failed to start scraping: ' + error.message, 'error');
    }
}

async function importProducts() {
    const app = window.adminApp;
    const fileInput = document.getElementById('csvFile');
    const progressDiv = document.getElementById('importProgress');
    
    if (!fileInput.files[0]) {
        app.showNotification('Please select a CSV file first', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('csvFile', fileInput.files[0]);
    
    try {
        progressDiv.style.display = 'block';
        
        const response = await fetch(`${app.apiBaseUrl}/admin/import-products`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${app.authToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            app.showNotification(`Successfully imported ${data.imported || 0} products!`, 'success');
            fileInput.value = '';
        } else {
            app.showNotification(data.error || 'Import failed', 'error');
        }
    } catch (error) {
        app.showNotification('Failed to import products: ' + error.message, 'error');
    } finally {
        progressDiv.style.display = 'none';
    }
}

// Helper function to create form elements safely
function createFormElement(type, attributes = {}, textContent = '') {
    const element = document.createElement(type);
    
    // Set attributes safely
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'textContent') {
            element.textContent = value;
        } else {
            element.setAttribute(key, value);
        }
    });
    
    if (textContent) {
        element.textContent = textContent;
    }
    
    return element;
}

// Helper function to create modal structure safely
function createProductModal(title, formId, isEdit = false) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = function() { this.closest('.modal').remove(); };
    
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    
    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    
    const form = document.createElement('form');
    form.id = formId;
    
    // Create form fields
    const fields = [
        { type: 'input', label: 'SKU *', id: `${isEdit ? 'edit' : 'add'}-sku`, name: 'sku', inputType: 'text', required: true },
        { type: 'input', label: 'Product Name *', id: `${isEdit ? 'edit' : 'add'}-name`, name: 'name', inputType: 'text', required: true },
        { type: 'textarea', label: 'Short Description', id: `${isEdit ? 'edit' : 'add'}-short-description`, name: 'short_description', rows: 2 },
        { type: 'textarea', label: 'Long Description', id: `${isEdit ? 'edit' : 'add'}-long-description`, name: 'long_description', rows: 4 }
    ];
    
    // Add brand and category selects for add modal only
    if (!isEdit) {
        fields.push(
            { type: 'select', label: 'Brand *', id: 'add-brand', name: 'brand_id', required: true, options: [
                { value: '', text: 'Select Brand' },
                { value: '1', text: 'HM Herbs' },
                { value: '2', text: 'Nature\'s Way' },
                { value: '3', text: 'Garden of Life' }
            ]},
            { type: 'select', label: 'Category *', id: 'add-category', name: 'category_id', required: true, options: [
                { value: '', text: 'Select Category' },
                { value: '1', text: 'Herbs & Botanicals' },
                { value: '2', text: 'Vitamins' },
                { value: '3', text: 'Supplements' },
                { value: '4', text: 'Essential Oils' }
            ]}
        );
    }
    
    // Add remaining fields
    fields.push(
        { type: 'input', label: 'Price *', id: `${isEdit ? 'edit' : 'add'}-price`, name: 'price', inputType: 'number', step: '0.01', min: '0', required: true },
        { type: 'input', label: 'Compare Price', id: `${isEdit ? 'edit' : 'add'}-compare-price`, name: 'compare_price', inputType: 'number', step: '0.01', min: '0' },
        { type: 'input', label: 'Inventory Quantity *', id: `${isEdit ? 'edit' : 'add'}-inventory`, name: 'inventory_quantity', inputType: 'number', min: '0', required: true },
        { type: 'input', label: 'Low Stock Threshold', id: `${isEdit ? 'edit' : 'add'}-low-stock`, name: 'low_stock_threshold', inputType: 'number', min: '0', value: '10' },
        { type: 'input', label: 'Weight (oz)', id: `${isEdit ? 'edit' : 'add'}-weight`, name: 'weight', inputType: 'number', step: '0.01', min: '0' }
    );
    
    // Add health categories for add modal only
    if (!isEdit) {
        fields.push({ type: 'input', label: 'Health Categories (comma-separated)', id: 'add-health-categories', name: 'health_categories', inputType: 'text', placeholder: 'e.g., immune support, digestive health' });
    }
    
    // Create form fields
    let currentRow = null;
    fields.forEach((field, index) => {
        const isRowField = (field.label.includes('Price') && field.label !== 'Compare Price') || 
                          (field.label.includes('Brand') || field.label.includes('Category')) ||
                          (field.label.includes('Inventory') || field.label.includes('Low Stock'));
        
        if (isRowField && (!currentRow || currentRow.children.length >= 2)) {
            currentRow = document.createElement('div');
            currentRow.className = 'form-row';
            form.appendChild(currentRow);
        }
        
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.setAttribute('for', field.id);
        label.textContent = field.label;
        formGroup.appendChild(label);
        
        if (field.type === 'input') {
            const input = document.createElement('input');
            input.setAttribute('type', field.inputType);
            input.id = field.id;
            input.setAttribute('name', field.name);
            if (field.required) input.setAttribute('required', '');
            if (field.step) input.setAttribute('step', field.step);
            if (field.min) input.setAttribute('min', field.min);
            if (field.value) input.setAttribute('value', field.value);
            if (field.placeholder) input.setAttribute('placeholder', field.placeholder);
            formGroup.appendChild(input);
        } else if (field.type === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.id = field.id;
            textarea.setAttribute('name', field.name);
            if (field.rows) textarea.setAttribute('rows', field.rows.toString());
            formGroup.appendChild(textarea);
        } else if (field.type === 'select') {
            const select = document.createElement('select');
            select.id = field.id;
            select.setAttribute('name', field.name);
            if (field.required) select.setAttribute('required', '');
            
            field.options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.setAttribute('value', option.value);
                optionEl.textContent = option.text;
                select.appendChild(optionEl);
            });
            formGroup.appendChild(select);
        }
        
        if (isRowField && currentRow) {
            currentRow.appendChild(formGroup);
        } else {
            form.appendChild(formGroup);
        }
    });
    
    // Add checkboxes
    const checkboxRow = document.createElement('div');
    checkboxRow.className = 'form-row';
    
    const activeGroup = document.createElement('div');
    activeGroup.className = 'form-group';
    const activeLabel = document.createElement('label');
    const activeCheckbox = document.createElement('input');
    activeCheckbox.setAttribute('type', 'checkbox');
    activeCheckbox.id = `${isEdit ? 'edit' : 'add'}-is-active`;
    activeCheckbox.setAttribute('name', 'is_active');
    activeCheckbox.checked = true;
    activeLabel.appendChild(activeCheckbox);
    activeLabel.appendChild(document.createTextNode(' Active Product'));
    activeGroup.appendChild(activeLabel);
    
    const featuredGroup = document.createElement('div');
    featuredGroup.className = 'form-group';
    const featuredLabel = document.createElement('label');
    const featuredCheckbox = document.createElement('input');
    featuredCheckbox.setAttribute('type', 'checkbox');
    featuredCheckbox.id = `${isEdit ? 'edit' : 'add'}-is-featured`;
    featuredCheckbox.setAttribute('name', 'is_featured');
    featuredLabel.appendChild(featuredCheckbox);
    featuredLabel.appendChild(document.createTextNode(' Featured Product'));
    featuredGroup.appendChild(featuredLabel);
    
    checkboxRow.appendChild(activeGroup);
    checkboxRow.appendChild(featuredGroup);
    form.appendChild(checkboxRow);
    
    // Form actions
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function() { this.closest('.modal').remove(); };
    
    const submitBtn = document.createElement('button');
    submitBtn.setAttribute('type', 'submit');
    submitBtn.textContent = isEdit ? 'Update Product' : 'Add Product';
    
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    form.appendChild(actions);
    
    body.appendChild(form);
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modal.appendChild(modalContent);
    
    return modal;
}

function editProduct(productId) {
    // Create and show product editing modal using safe helper
    const modal = createProductModal('Edit Product', 'edit-product-form', true);
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // Load existing product data
    loadProductForEdit(productId);
    
    // Handle form submission
    document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProduct(productId, new FormData(e.target));
        modal.remove();
    });
}

async function loadProductForEdit(productId) {
    try {
        const response = await fetch(`/api/admin/products/${productId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            const product = await response.json();
            
            // Populate form fields
            document.getElementById('edit-sku').value = product.sku || '';
            document.getElementById('edit-name').value = product.name || '';
            document.getElementById('edit-short-description').value = product.short_description || '';
            document.getElementById('edit-long-description').value = product.long_description || '';
            document.getElementById('edit-price').value = product.price || '';
            document.getElementById('edit-compare-price').value = product.compare_price || '';
            document.getElementById('edit-inventory').value = product.inventory_quantity || '';
            document.getElementById('edit-low-stock').value = product.low_stock_threshold || '';
            document.getElementById('edit-weight').value = product.weight || '';
            document.getElementById('edit-is-active').checked = product.is_active;
            document.getElementById('edit-is-featured').checked = product.is_featured;
        } else {
            window.adminApp.showNotification('Failed to load product data', 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error loading product: ' + error.message, 'error');
    }
}

async function updateProduct(productId, formData) {
    try {
        const productData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active' || key === 'is_featured') {
                productData[key] = true; // Checkbox was checked
            } else {
                productData[key] = value;
            }
        }
        
        // Handle unchecked checkboxes
        if (!formData.has('is_active')) productData.is_active = false;
        if (!formData.has('is_featured')) productData.is_featured = false;
        
        const response = await fetch(`/api/admin/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify(productData)
        });
        
        if (response.ok) {
            window.adminApp.showNotification('Product updated successfully!', 'success');
            // Refresh the products list
            if (typeof loadProducts === 'function') {
                loadProducts();
            }
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to update product: ' + error.error, 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error updating product: ' + error.message, 'error');
    }
}

function showAddProduct() {
    // Create and show add product modal using safe helper
    const modal = createProductModal('Add New Product', 'add-product-form', false);
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // Handle form submission
    document.getElementById('add-product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createProduct(new FormData(e.target));
        modal.remove();
    });
}

async function createProduct(formData) {
    try {
        const productData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'is_active' || key === 'is_featured') {
                productData[key] = true; // Checkbox was checked
            } else if (key === 'health_categories') {
                // Convert comma-separated string to array
                productData[key] = value.split(',').map(cat => cat.trim()).filter(cat => cat);
            } else {
                productData[key] = value;
            }
        }
        
        // Handle unchecked checkboxes
        if (!formData.has('is_active')) productData.is_active = false;
        if (!formData.has('is_featured')) productData.is_featured = false;
        
        const response = await fetch('/api/admin/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify(productData)
        });
        
        if (response.ok) {
            window.adminApp.showNotification('Product created successfully!', 'success');
            // Refresh the products list
            if (typeof loadProducts === 'function') {
                loadProducts();
            }
        } else {
            const error = await response.json();
            window.adminApp.showNotification('Failed to create product: ' + error.error, 'error');
        }
    } catch (error) {
        window.adminApp.showNotification('Error creating product: ' + error.message, 'error');
    }
}

function logout() {
    window.adminApp.logout();
}

// Initialize the admin app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();
});

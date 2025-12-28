// Business One Menu Admin - JavaScript

const API_BASE_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:3001' 
    : window.location.origin;

let currentEditingItemId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupEventListeners();
    loadMenuItems();
    loadApiKeys();
});

// Tab Switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabName}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// Event Listeners
function setupEventListeners() {
    // Menu Item Modal
    document.getElementById('addMenuItemBtn').addEventListener('click', () => {
        openMenuItemModal();
    });

    document.getElementById('closeMenuItemModal').addEventListener('click', closeMenuItemModal);
    document.getElementById('cancelMenuItemBtn').addEventListener('click', closeMenuItemModal);

    document.getElementById('menuItemForm').addEventListener('submit', handleMenuItemSubmit);

    // API Key Modal
    document.getElementById('addApiKeyBtn').addEventListener('click', () => {
        openApiKeyModal();
    });

    document.getElementById('closeApiKeyModal').addEventListener('click', closeApiKeyModal);
    document.getElementById('cancelApiKeyBtn').addEventListener('click', closeApiKeyModal);
    document.getElementById('apiKeyForm').addEventListener('submit', handleApiKeySubmit);

    // API Key Display Modal
    document.getElementById('closeApiKeyDisplayModal').addEventListener('click', closeApiKeyDisplayModal);
    document.getElementById('closeApiKeyDisplayBtn').addEventListener('click', closeApiKeyDisplayModal);
    document.getElementById('copyApiKeyBtn').addEventListener('click', copyApiKey);

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// Menu Items
async function loadMenuItems() {
    const tbody = document.getElementById('menuItemsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading menu items...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/menu/admin/items`);
        const data = await response.json();

        if (data.success && data.items) {
            renderMenuItems(data.items);
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Error loading menu items</td></tr>';
        }
    } catch (error) {
        console.error('Error loading menu items:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Error: ' + error.message + '</td></tr>';
    }
}

function renderMenuItems(items) {
    const tbody = document.getElementById('menuItemsTableBody');
    
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No menu items found. Add your first item!</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => `
        <tr>
            <td><code>${item.item_id}</code></td>
            <td><strong>${item.name}</strong></td>
            <td>${item.category || '-'}</td>
            <td>${item.display_order}</td>
            <td>
                <span class="status-badge ${item.is_active ? 'active' : 'inactive'}">
                    ${item.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-secondary" onclick="editMenuItem(${item.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMenuItem(${item.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openMenuItemModal(item = null) {
    const modal = document.getElementById('menuItemModal');
    const form = document.getElementById('menuItemForm');
    const title = document.getElementById('menuItemModalTitle');
    
    if (item) {
        title.textContent = 'Edit Menu Item';
        currentEditingItemId = item.id;
        
        document.getElementById('menuItemId').value = item.id;
        document.getElementById('itemId').value = item.item_id;
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemDescription').value = item.description || '';
        document.getElementById('itemCategory').value = item.category || '';
        document.getElementById('itemPrice').value = item.price || '';
        document.getElementById('itemImageUrl').value = item.image_url || '';
        document.getElementById('itemDisplayOrder').value = item.display_order || 0;
        document.getElementById('itemIsActive').checked = item.is_active === 1;
        
        document.getElementById('itemId').disabled = true;
    } else {
        title.textContent = 'Add Menu Item';
        currentEditingItemId = null;
        form.reset();
        document.getElementById('itemId').disabled = false;
    }
    
    modal.classList.add('active');
}

function closeMenuItemModal() {
    document.getElementById('menuItemModal').classList.remove('active');
    document.getElementById('menuItemForm').reset();
    currentEditingItemId = null;
}

async function handleMenuItemSubmit(e) {
    e.preventDefault();
    
    const formData = {
        item_id: document.getElementById('itemId').value,
        name: document.getElementById('itemName').value,
        description: document.getElementById('itemDescription').value,
        price: document.getElementById('itemPrice').value || null,
        image_url: document.getElementById('itemImageUrl').value || null,
        category: document.getElementById('itemCategory').value || null,
        display_order: parseInt(document.getElementById('itemDisplayOrder').value) || 0,
        is_active: document.getElementById('itemIsActive').checked ? 1 : 0
    };
    
    try {
        let response;
        if (currentEditingItemId) {
            // Update
            response = await fetch(`${API_BASE_URL}/api/menu/admin/items/${currentEditingItemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        } else {
            // Create
            response = await fetch(`${API_BASE_URL}/api/menu/admin/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            closeMenuItemModal();
            loadMenuItems();
            alert('Menu item saved successfully!');
        } else {
            alert('Error: ' + (data.error || 'Failed to save menu item'));
        }
    } catch (error) {
        console.error('Error saving menu item:', error);
        alert('Error: ' + error.message);
    }
}

async function editMenuItem(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/menu/admin/items`);
        const data = await response.json();
        
        if (data.success && data.items) {
            const item = data.items.find(i => i.id === id);
            if (item) {
                openMenuItemModal(item);
            }
        }
    } catch (error) {
        console.error('Error loading menu item:', error);
        alert('Error loading menu item');
    }
}

async function deleteMenuItem(id) {
    if (!confirm('Are you sure you want to delete this menu item?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/menu/admin/items/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadMenuItems();
            alert('Menu item deleted successfully!');
        } else {
            alert('Error: ' + (data.error || 'Failed to delete menu item'));
        }
    } catch (error) {
        console.error('Error deleting menu item:', error);
        alert('Error: ' + error.message);
    }
}

// API Keys
async function loadApiKeys() {
    const tbody = document.getElementById('apiKeysTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading API keys...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/menu/admin/keys`);
        const data = await response.json();

        if (data.success && data.keys) {
            renderApiKeys(data.keys);
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Error loading API keys</td></tr>';
        }
    } catch (error) {
        console.error('Error loading API keys:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Error: ' + error.message + '</td></tr>';
    }
}

function renderApiKeys(keys) {
    const tbody = document.getElementById('apiKeysTableBody');
    
    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No API keys found. Generate your first key!</td></tr>';
        return;
    }

    tbody.innerHTML = keys.map(key => `
        <tr>
            <td><strong>${key.name}</strong></td>
            <td><code>${key.api_key ? key.api_key.substring(0, 20) + '...' : 'N/A'}</code></td>
            <td>
                <span class="status-badge ${key.is_active ? 'active' : 'inactive'}">
                    ${key.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${formatDate(key.created_at)}</td>
            <td>${key.last_used_at ? formatDate(key.last_used_at) : 'Never'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm ${key.is_active ? 'btn-secondary' : 'btn-success'}" 
                            onclick="toggleApiKey(${key.id}, ${!key.is_active})">
                        ${key.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteApiKey(${key.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openApiKeyModal() {
    document.getElementById('apiKeyModal').classList.add('active');
    document.getElementById('apiKeyForm').reset();
}

function closeApiKeyModal() {
    document.getElementById('apiKeyModal').classList.remove('active');
}

async function handleApiKeySubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('apiKeyName').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/menu/admin/keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        const data = await response.json();
        
        if (data.success && data.apiKey) {
            closeApiKeyModal();
            showApiKeyDisplay(data.apiKey);
            loadApiKeys();
        } else {
            alert('Error: ' + (data.error || 'Failed to generate API key'));
        }
    } catch (error) {
        console.error('Error generating API key:', error);
        alert('Error: ' + error.message);
    }
}

function showApiKeyDisplay(apiKey) {
    document.getElementById('generatedApiKey').textContent = apiKey;
    document.getElementById('apiKeyDisplayModal').classList.add('active');
}

function closeApiKeyDisplayModal() {
    document.getElementById('apiKeyDisplayModal').classList.remove('active');
}

function copyApiKey() {
    const apiKey = document.getElementById('generatedApiKey').textContent;
    navigator.clipboard.writeText(apiKey).then(() => {
        const btn = document.getElementById('copyApiKeyBtn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('btn-success');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('btn-success');
        }, 2000);
    });
}

async function toggleApiKey(id, isActive) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/menu/admin/keys/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: isActive ? 1 : 0 })
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadApiKeys();
        } else {
            alert('Error: ' + (data.error || 'Failed to update API key'));
        }
    } catch (error) {
        console.error('Error updating API key:', error);
        alert('Error: ' + error.message);
    }
}

async function deleteApiKey(id) {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/menu/admin/keys/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadApiKeys();
            alert('API key deleted successfully!');
        } else {
            alert('Error: ' + (data.error || 'Failed to delete API key'));
        }
    } catch (error) {
        console.error('Error deleting API key:', error);
        alert('Error: ' + error.message);
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Make functions globally available
window.editMenuItem = editMenuItem;
window.deleteMenuItem = deleteMenuItem;
window.toggleApiKey = toggleApiKey;
window.deleteApiKey = deleteApiKey;


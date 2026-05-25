# Octopos API Integration

This document describes the complete integration of the Octopos POS system API into the H&M Herbs application.

## Overview

The integration provides access to all 51+ endpoints from the Octopos API through a unified backend proxy and frontend utility. This allows seamless interaction with the Octopos POS system for managing products, orders, inventory, employees, and more.

## Architecture

### Backend Components

1. **Service Layer** (`backend/services/octopos.js`)
   - Comprehensive API client service
   - Handles all HTTP requests to Octopos API
   - Manages authentication tokens
   - Provides methods for all API endpoints

2. **Routes Layer** (`backend/routes/octopos.js`)
   - Express router with all Octopos endpoints
   - Proxies requests to Octopos API
   - Handles error responses
   - Supports flexible authentication (headers, body, or env vars)

3. **Server Registration** (`backend/server.js`)
   - Routes registered at `/api/octopos/*`

### Frontend Components

1. **API Client** (`js/octopos-api.js`)
   - JavaScript class for making Octopos API calls
   - Available as `window.octoposAPI` globally
   - Provides all endpoint methods
   - Handles authentication automatically

## Setup

### Environment Variables

Add these to your `backend/.env` file:

```env
# Octopos API Configuration (optional - can be set per request)
OCTOPOS_API_URL=https://your-octopos-instance.com
OCTOPOS_TOKEN=your-auth-token-here
```

### Authentication

The integration supports multiple authentication methods:

1. **Environment Variables** (recommended for production)
   ```env
   OCTOPOS_API_URL=https://api.octopos.com
   OCTOPOS_TOKEN=your-token
   ```

2. **Request Headers** (for dynamic configuration)
   ```javascript
   headers: {
     'X-Octopos-BaseUrl': 'https://api.octopos.com',
     'X-Octopos-Token': 'your-token'
   }
   ```

3. **Request Body** (for authentication endpoint)
   ```javascript
   {
     email: 'user@example.com',
     password: 'password',
     baseUrl: 'https://api.octopos.com'
   }
   ```

## Usage Examples

### Backend Usage

```javascript
const OctoposService = require('./services/octopos');

// Initialize service
const octopos = new OctoposService('https://api.octopos.com', 'your-token');

// Authenticate
const authResult = await octopos.authenticate('email@example.com', 'password');
if (authResult.success) {
    console.log('Token:', authResult.data.token);
    console.log('Locations:', authResult.data.locations);
}

// Get products
const products = await octopos.getProducts({ limit: 10, skip: 0 });

// Create a product
const newProduct = await octopos.createProduct({
    name: 'Product Name',
    price: 19.99,
    // ... other product fields
});

// Update inventory
const inventoryUpdate = await octopos.addInventory({
    product_id: 123,
    quantity: 10,
    location_id: 1
});
```

### Frontend Usage

```javascript
// Initialize (if not using global instance)
const octopos = new OctoposAPI('/api/octopos');

// Or use global instance
const octopos = window.octoposAPI;

// Set credentials
octopos.setBaseApiUrl('https://api.octopos.com');
octopos.setToken('your-token');

// Authenticate
const authResult = await octopos.authenticate('email@example.com', 'password', 'https://api.octopos.com');
if (authResult.success) {
    console.log('Authenticated!', authResult.data);
}

// Get products
const products = await octopos.getProducts({ limit: 10 });
if (products.success) {
    console.log('Products:', products.data);
}

// Create a category
const category = await octopos.createCategory({
    name: 'New Category',
    description: 'Category description'
});

// Search products
const searchResults = await octopos.searchProducts('vitamin', { limit: 20 });

// Get orders by filter
const orders = await octopos.getOrdersByFilter({
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    location_id: 1
});
```

## Available Endpoints

### Authentication
- `POST /api/octopos/authenticate` - Authenticate and get token

### Employees
- `GET /api/octopos/employees` - List all employees
- `POST /api/octopos/employees` - Create employee
- `GET /api/octopos/employees/:id` - Get employee by ID
- `PUT /api/octopos/employees/:id` - Update employee

### Categories
- `GET /api/octopos/categories` - List all categories
- `POST /api/octopos/categories` - Create category
- `GET /api/octopos/categories/:id` - Get category by ID
- `PUT /api/octopos/categories/:id` - Update category
- `POST /api/octopos/categories/copy` - Copy categories

### Departments
- `GET /api/octopos/departments` - List all departments
- `POST /api/octopos/departments` - Create department
- `GET /api/octopos/departments/:id` - Get department by ID
- `PUT /api/octopos/departments/:id` - Update department

### Modifier Sets
- `GET /api/octopos/modifier-sets` - List all modifier sets
- `POST /api/octopos/modifier-sets` - Create modifier set
- `GET /api/octopos/modifier-sets/:id` - Get modifier set by ID
- `PUT /api/octopos/modifier-sets/:id` - Update modifier set

### Products
- `GET /api/octopos/products` - List all products
- `POST /api/octopos/products` - Create product
- `GET /api/octopos/products/:id` - Get product by ID
- `PUT /api/octopos/products/:id` - Update product
- `POST /api/octopos/products/filter` - Get products by filter
- `POST /api/octopos/products/filter/single-location` - Get products by filter (single location)
- `GET /api/octopos/products/search/term` - Search products by term

### Taxes
- `GET /api/octopos/taxes` - List all taxes
- `POST /api/octopos/taxes` - Create tax
- `GET /api/octopos/taxes/:id` - Get tax by ID
- `PUT /api/octopos/taxes/:id` - Update tax

### Vendors
- `GET /api/octopos/vendors` - List all vendors
- `POST /api/octopos/vendors` - Create vendor
- `GET /api/octopos/vendors/:id` - Get vendor by ID
- `PUT /api/octopos/vendors/:id` - Update vendor

### Purchase Orders
- `GET /api/octopos/purchase-orders` - List all purchase orders
- `POST /api/octopos/purchase-orders` - Create purchase order
- `GET /api/octopos/purchase-orders/:id` - Get purchase order by ID
- `PUT /api/octopos/purchase-orders/:id` - Update purchase order
- `PUT /api/octopos/purchase-orders/:id/lines` - Update purchase order lines

### Reward Cards
- `GET /api/octopos/reward-cards` - List all reward cards
- `POST /api/octopos/reward-cards` - Create reward card
- `GET /api/octopos/reward-cards/:id` - Get reward card by ID
- `PUT /api/octopos/reward-cards/:id` - Update reward card

### Rewards
- `GET /api/octopos/rewards` - List all rewards
- `POST /api/octopos/rewards` - Create reward
- `GET /api/octopos/rewards/:id` - Get reward by ID
- `PUT /api/octopos/rewards/:id` - Update reward

### Orders
- `GET /api/octopos/orders/:orderNumber` - Get order by order number
- `POST /api/octopos/orders/filter` - Get orders by filter

### Refunds
- `GET /api/octopos/refunds?refund_id=:id` - Get refund by ID
- `GET /api/octopos/refunds?order_number=:number` - Get refund by order number
- `POST /api/octopos/refunds/filter` - Get refunds by filter
- `POST /api/octopos/refunds/without-orders` - Create refund without order
- `GET /api/octopos/refunds/without-orders/:id` - Get refund without order
- `POST /api/octopos/refunds/bottle-deposit` - Create bottle deposit refund
- `GET /api/octopos/refunds/bottle-deposit/:id` - Get bottle deposit refund

### Inventory
- `POST /api/octopos/inventory/add` - Add inventory
- `POST /api/octopos/inventory/subtract` - Subtract inventory
- `POST /api/octopos/inventory/recount` - Recount inventory

### Promotions
- `GET /api/octopos/promotions/types` - Get promotion types
- `GET /api/octopos/promotions` - List all promotions
- `POST /api/octopos/promotions` - Create promotion
- `GET /api/octopos/promotions/:id` - Get promotion by ID
- `PUT /api/octopos/promotions/:id` - Update promotion

### Coupons
- `GET /api/octopos/coupons` - List all coupons
- `POST /api/octopos/coupons` - Create coupon
- `GET /api/octopos/coupons/:id` - Get coupon by ID
- `PUT /api/octopos/coupons/:id` - Update coupon

### Webhooks
- `GET /api/octopos/webhooks` - List all webhooks
- `POST /api/octopos/webhooks` - Create webhook
- `GET /api/octopos/webhooks/:id` - Get webhook by ID
- `GET /api/octopos/webhooks/types` - Get webhook types

### Roles & Permissions
- `GET /api/octopos/roles` - List all roles
- `GET /api/octopos/roles/:id` - Get role by ID
- `GET /api/octopos/permissions` - Get permissions
- `GET /api/octopos/reward-points/calculation-types` - Get reward points calculation types

### Tare Containers
- `GET /api/octopos/tare-containers` - List all tare containers

## Error Handling

All methods return a consistent response format:

```javascript
{
    success: true/false,
    data: {...}, // Response data if success
    error: {...}, // Error object if failed
    status: 200 // HTTP status code
}
```

Example error handling:

```javascript
const result = await octopos.getProducts();

if (result.success) {
    console.log('Products:', result.data);
} else {
    console.error('Error:', result.error);
    // Handle error
}
```

## Integration with Existing POS Service

The Octopos integration can work alongside the existing `POSService` in `backend/services/pos.js`. You can:

1. Use OctoposService directly for Octopos-specific operations
2. Extend POSService to use OctoposService for Octopos systems
3. Use both services independently for different POS systems

## Testing

To test the integration:

1. **Test Authentication:**
   ```bash
   curl -X POST http://localhost:3001/api/octopos/authenticate \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password","baseUrl":"https://api.octopos.com"}'
   ```

2. **Test Getting Products:**
   ```bash
   curl -X GET "http://localhost:3001/api/octopos/products?limit=10" \
     -H "X-Octopos-BaseUrl: https://api.octopos.com" \
     -H "X-Octopos-Token: your-token"
   ```

## Notes

- All endpoints from the Octopos OpenAPI specification are implemented
- The integration supports both RESTful and filter-based endpoints
- Authentication tokens are automatically managed after initial authentication
- The service handles timeouts (default 30 seconds) and retries
- All requests are logged for debugging purposes

## Support

For issues or questions about the Octopos API integration, refer to:
- The Octopos API documentation (Octopos.json)
- Backend service: `backend/services/octopos.js`
- Backend routes: `backend/routes/octopos.js`
- Frontend client: `js/octopos-api.js`

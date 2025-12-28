# API Setup Guide

## Overview

The Business One Menu app connects to your website API to fetch and display menu data dynamically. This allows you to update menu content on your website without needing to update the app.

## API Requirements

### Endpoint

The app calls: `GET /api/menu/items`

### Authentication

The API key is sent in the request header:
```
X-API-Key: your_api_key_here
```

### Expected Response Format

```json
{
  "success": true,
  "items": [
    {
      "id": "pos",
      "name": "Point of Sale (POS)",
      "description": "Modern, efficient POS systems to streamline your sales process and inventory management.",
      "price": null,
      "imageUrl": null,
      "category": "pos"
    },
    {
      "id": "payment",
      "name": "Payment Processing",
      "description": "Secure, reliable payment processing solutions with competitive rates.",
      "price": null,
      "imageUrl": null,
      "category": "payment"
    }
  ],
  "message": null
}
```

### Error Response

If authentication fails or there's an error:
```json
{
  "success": false,
  "items": null,
  "message": "Invalid API key"
}
```

## Backend Implementation Example

### Node.js/Express Example

```javascript
app.get('/api/menu/items', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  
  // Validate API key
  if (!apiKey || !isValidApiKey(apiKey)) {
    return res.status(401).json({
      success: false,
      items: null,
      message: 'Invalid API key'
    });
  }
  
  // Fetch menu items from database
  const menuItems = [
    {
      id: 'pos',
      name: 'Point of Sale (POS)',
      description: 'Modern, efficient POS systems...',
      price: null,
      imageUrl: null,
      category: 'pos'
    },
    // ... more items
  ];
  
  res.json({
    success: true,
    items: menuItems,
    message: null
  });
});
```

### PHP Example

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: X-API-Key');

$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';

if (!$apiKey || !isValidApiKey($apiKey)) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'items' => null,
        'message' => 'Invalid API key'
    ]);
    exit;
}

$menuItems = [
    [
        'id' => 'pos',
        'name' => 'Point of Sale (POS)',
        'description' => 'Modern, efficient POS systems...',
        'price' => null,
        'imageUrl' => null,
        'category' => 'pos'
    ],
    // ... more items
];

echo json_encode([
    'success' => true,
    'items' => $menuItems,
    'message' => null
]);
?>
```

## Security Considerations

1. **API Key Storage**: Store API keys securely on your server
2. **HTTPS**: Always use HTTPS for API endpoints
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **CORS**: Configure CORS headers if needed
5. **Validation**: Validate all input data

## Testing

You can test your API using curl:

```bash
curl -H "X-API-Key: your_api_key" \
     https://yourwebsite.com/api/menu/items
```

## App Configuration

Users configure the API in the app:
1. Open Settings
2. Tap "Configure API Key"
3. Enter API key and API URL
4. Tap "Save"

The app will automatically fetch menu data on launch and when the API key is updated.


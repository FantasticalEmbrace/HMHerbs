# UPC-Based Product Scraper

This scraper is designed to update existing products with UPC codes by extracting only specific data from the HM Herbs website:
- **Images** - Product images
- **Inventory Quantity** - Accurate stock levels
- **Price** - Current product price
- **Short Description** - Brief product description
- **Long Description** - Full product description

## Features

- ✅ Uses UPC codes to identify products (no need to discover products)
- ✅ Only extracts the specific fields you need
- ✅ Supports CSV and JSON input formats
- ✅ Handles multiple search strategies to find products
- ✅ Provides detailed progress and error reporting
- ✅ Saves results in JSON format

## Usage

### Basic Usage

```bash
# Using CSV file
node backend/scripts/scrape-by-upc.js backend/data/products-with-upc.csv

# Using JSON file
node backend/scripts/scrape-by-upc.js backend/data/products-with-upc.json

# Specify custom output file
node backend/scripts/scrape-by-upc.js backend/data/products-with-upc.csv output.json
```

## Input File Format

### CSV Format

The CSV file should have at least one of these columns:
- `upc` or `UPC` - Universal Product Code
- `sku` or `SKU` - Stock Keeping Unit
- `name` or `product_name` or `title` - Product name (optional, used as fallback)

**Example CSV:**
```csv
upc,sku,name
123456789012,12414,Advanced Blood Pressure Support
987654321098,HS-03,Healing Antiseptic Salve
```

### JSON Format

The JSON file can have products in an array or nested under a `products` key:

**Example JSON:**
```json
{
  "products": [
    {
      "upc": "123456789012",
      "sku": "12414",
      "name": "Advanced Blood Pressure Support"
    },
    {
      "upc": "987654321098",
      "sku": "HS-03",
      "name": "Healing Antiseptic Salve"
    }
  ]
}
```

Or a simple array:
```json
[
  {
    "upc": "123456789012",
    "sku": "12414",
    "name": "Advanced Blood Pressure Support"
  }
]
```

## Output Format

The scraper generates a JSON file with the following structure:

```json
{
  "scrapedAt": "2024-01-15T10:30:00.000Z",
  "stats": {
    "total": 100,
    "found": 95,
    "notFound": 3,
    "errors": 2,
    "startTime": "2024-01-15T10:00:00.000Z",
    "endTime": "2024-01-15T10:30:00.000Z",
    "duration": 1800
  },
  "products": [
    {
      "upc": "123456789012",
      "sku": "12414",
      "name": "Advanced Blood Pressure Support",
      "url": "https://hmherbs.com/index.php/products/...",
      "images": [
        {
          "url": "https://hmherbs.com/.../image.jpg",
          "alt": "Product image"
        }
      ],
      "inventoryQuantity": 25,
      "price": 29.99,
      "shortDescription": "Brief product description...",
      "longDescription": "Full detailed product description...",
      "found": true,
      "scrapedAt": "2024-01-15T10:05:00.000Z"
    }
  ]
}
```

## Product Search Strategy

The scraper uses multiple strategies to find products:

1. **Search by UPC/SKU** - Searches the website using the UPC or SKU code
2. **Direct URL Construction** - Tries common URL patterns if SKU is numeric
3. **Search by Product Name** - Falls back to searching by product name

## Extracted Fields

### Images
- Extracts all product images from the page
- Filters out placeholder images, icons, and logos
- Returns full URLs with alt text

### Inventory Quantity
- Extracts actual stock quantity when available
- Returns `null` if product is in stock but quantity is unknown
- Returns `0` if product is out of stock

### Price
- Extracts current product price
- Handles various price formats ($XX.XX, $X,XXX.XX, etc.)
- Validates prices are within reasonable range ($0.01 - $10,000)

### Short Description
- Extracts brief product description (typically 10-500 characters)
- Falls back to first sentence of long description if needed

### Long Description
- Extracts full product description
- Combines multiple description sections when present
- Cleans and formats text

## Error Handling

The scraper handles various error scenarios:

- **Product Not Found** - If product URL cannot be found, marks as `found: false`
- **Extraction Errors** - If data cannot be extracted, includes error message
- **Network Errors** - Retries and continues with next product
- **Invalid Data** - Skips invalid entries and continues

## Progress Reporting

The scraper provides real-time progress updates:

```
[1/100] Processing: UPC=123456789012, SKU=12414, Name=Advanced Blood Pressure Support
   🔍 Found URL: https://hmherbs.com/index.php/products/...
   ✅ Extracted: Price=$29.99, Images=3, Inventory=25

📊 Progress: 10/100 processed | Found: 9 | Not Found: 1 | Errors: 0
```

## Tips

1. **Prepare Your Input File** - Make sure your CSV/JSON file has UPC codes or SKUs
2. **Test with Small Batch** - Start with a few products to test the scraper
3. **Check Output File** - Review the output JSON to verify data quality
4. **Handle Missing Products** - Products marked as `found: false` may need manual review
5. **Rate Limiting** - The scraper includes delays between requests to be respectful

## Troubleshooting

### Product Not Found
- Verify UPC/SKU codes are correct
- Check if product exists on hmherbs.com
- Try searching manually on the website

### Missing Data
- Some products may not have all fields available
- Check the website structure for that specific product
- Review the extracted data in the output file

### Network Errors
- Check your internet connection
- Verify hmherbs.com is accessible
- The scraper will continue with remaining products

## Example Workflow

1. **Prepare your product list with UPC codes:**
   ```csv
   upc,sku,name
   123456789012,12414,Product 1
   987654321098,HS-03,Product 2
   ```

2. **Run the scraper:**
   ```bash
   node backend/scripts/scrape-by-upc.js products.csv
   ```

3. **Review the output:**
   ```bash
   # Check the generated JSON file
   cat backend/data/upc-scraped-products.json
   ```

4. **Use the scraped data:**
   - Import into your database
   - Update existing product records
   - Generate reports

## Notes

- The scraper respects the website by including delays between requests
- All original product data is preserved in the output
- Products are matched by UPC/SKU, not by name
- The scraper only extracts the specified fields (images, quantity, price, descriptions)


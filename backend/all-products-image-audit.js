const mysql = require('mysql2/promise');
const fs = require('fs');
(async () => {
    const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: 'Yahhelpme1!2', database: 'hmherbs' });
    const [rows] = await conn.execute(`SELECT p.id, p.sku, p.name, p.slug, p.price, p.inventory_quantity, p.is_active, b.name as brand_name, pi.image_url FROM products p LEFT JOIN brands b ON p.brand_id = b.id LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1 ORDER BY p.name`);
    fs.writeFileSync('all-products-image-audit.json', JSON.stringify(rows, null, 2));
    conn.end();
})();


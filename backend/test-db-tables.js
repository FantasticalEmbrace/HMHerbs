// Quick test to check if database tables exist
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hmherbs'
});

async function testTables() {
    const tables = ['products', 'brands', 'product_categories', 'admin_users'];
    
    for (const table of tables) {
        try {
            await pool.execute(`SELECT 1 FROM ${table} LIMIT 1`);
            console.log(`✅ Table '${table}' exists`);
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146) {
                console.log(`❌ Table '${table}' does NOT exist`);
            } else {
                console.log(`⚠️  Error checking '${table}': ${error.message}`);
            }
        }
    }
    
    await pool.end();
}

testTables().catch(console.error);


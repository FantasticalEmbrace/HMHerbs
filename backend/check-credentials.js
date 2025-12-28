// Script to check MySQL credentials and list admin users
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function checkCredentials() {
    console.log('🔍 Checking MySQL Credentials and Admin Users\n');
    console.log('=' .repeat(60));
    
    // Show what's in .env (without password)
    console.log('\n📋 Current .env Configuration:');
    console.log('   DB_HOST:', process.env.DB_HOST || 'localhost (default)');
    console.log('   DB_USER:', process.env.DB_USER || 'root (default)');
    console.log('   DB_NAME:', process.env.DB_NAME || 'hmherbs (default)');
    console.log('   DB_PASSWORD:', process.env.DB_PASSWORD ? '***' + process.env.DB_PASSWORD.slice(-3) : 'NOT SET');
    console.log('\n   📁 .env file location:', path.join(__dirname, '.env'));
    
    // Try to connect
    console.log('\n🔌 Testing Database Connection...');
    
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hmherbs'
    };
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Successfully connected to MySQL database!\n');
        
        // Get MySQL version
        const [version] = await connection.execute('SELECT VERSION() as version');
        console.log('   MySQL Version:', version[0].version);
        
        // Check if admin_users table exists and get admin users
        try {
            const [admins] = await connection.execute(
                'SELECT id, email, first_name, last_name, role, is_active, created_at FROM admin_users ORDER BY created_at'
            );
            
            console.log('\n👤 Admin Users in Database:');
            console.log('   ' + '-'.repeat(58));
            
            if (admins.length === 0) {
                console.log('   ⚠️  No admin users found in database.');
                console.log('   💡 You may need to create an admin user.');
            } else {
                admins.forEach((admin, index) => {
                    console.log(`\n   Admin #${index + 1}:`);
                    console.log(`      ID: ${admin.id}`);
                    console.log(`      Email: ${admin.email}`);
                    console.log(`      Name: ${admin.first_name} ${admin.last_name}`);
                    console.log(`      Role: ${admin.role}`);
                    console.log(`      Active: ${admin.is_active ? '✅ Yes' : '❌ No'}`);
                    console.log(`      Created: ${admin.created_at}`);
                });
            }
        } catch (tableError) {
            if (tableError.code === 'ER_NO_SUCH_TABLE' || tableError.errno === 1146) {
                console.log('\n❌ admin_users table does not exist!');
                console.log('   💡 You need to run database migrations first.');
                console.log('   Run: cd backend && npm run migrate');
            } else {
                console.log('\n⚠️  Error querying admin_users table:', tableError.message);
            }
        }
        
        await connection.end();
        console.log('\n' + '='.repeat(60));
        console.log('✅ Check complete!\n');
        
    } catch (error) {
        console.log('❌ Failed to connect to MySQL database!\n');
        console.log('   Error Code:', error.code || error.errno);
        console.log('   Error Message:', error.message);
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.errno === 1045) {
            console.log('\n💡 This usually means:');
            console.log('   1. Wrong username or password');
            console.log('   2. User doesn\'t have access to the database');
            console.log('   3. Password is incorrect in .env file');
            console.log('\n   📝 To fix:');
            console.log('   1. Open: backend/.env');
            console.log('   2. Check DB_USER and DB_PASSWORD');
            console.log('   3. Make sure they match your MySQL root credentials');
        } else if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 This usually means:');
            console.log('   1. MySQL server is not running');
            console.log('   2. Wrong host/port in .env file');
            console.log('\n   📝 To fix:');
            console.log('   1. Make sure MySQL is running');
            console.log('   2. Check DB_HOST in backend/.env');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.log('\n💡 This usually means:');
            console.log('   The database name in .env doesn\'t exist');
            console.log('\n   📝 To fix:');
            console.log('   1. Check DB_NAME in backend/.env');
            console.log('   2. Create the database if it doesn\'t exist');
        }
        
        console.log('\n' + '='.repeat(60));
        process.exit(1);
    }
}

checkCredentials().catch(console.error);


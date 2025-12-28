#!/usr/bin/env node

/**
 * Quick script to set admin password to 'admin1'
 * Usage: node set-admin-password.js
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function setAdminPassword() {
    console.log('🔑 Setting admin password to "admin1"...\n');
    
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hmherbs'
    };

    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database\n');

        // Hash the password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash('admin1', saltRounds);
        console.log('✅ Password hashed\n');

        // Check if admin exists
        const [admins] = await connection.execute(
            'SELECT id, email FROM admin_users WHERE email = ?',
            ['admin@hmherbs.com']
        );

        if (admins.length === 0) {
            // Create admin if doesn't exist
            await connection.execute(
                `INSERT INTO admin_users (email, password_hash, first_name, last_name, role, is_active) 
                 VALUES (?, ?, 'Admin', 'User', 'super_admin', 1)`,
                ['admin@hmherbs.com', passwordHash]
            );
            console.log('✅ Admin user created\n');
        } else {
            // Update existing admin
            await connection.execute(
                'UPDATE admin_users SET password_hash = ?, updated_at = NOW() WHERE email = ?',
                [passwordHash, 'admin@hmherbs.com']
            );
            console.log('✅ Admin password updated\n');
        }

        await connection.end();
        
        console.log('📋 Admin Credentials:');
        console.log('   Email: admin@hmherbs.com');
        console.log('   Password: admin1');
        console.log('\n✅ Password set successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 Make sure MySQL is running and check your .env file for database credentials.');
        }
        process.exit(1);
    }
}

setAdminPassword();


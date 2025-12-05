#!/usr/bin/env node

/**
 * HM Herbs Admin Password Reset Utility
 * 
 * This script allows you to reset the admin password for the HM Herbs application.
 * 
 * Usage:
 *   node scripts/reset-admin-password.js
 *   node scripts/reset-admin-password.js --email admin@hmherbs.com --password newpassword123
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const readline = require('readline');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hmherbs'
};

// Command line interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function resetAdminPassword() {
    console.log('🔑 HM Herbs Admin Password Reset Utility\n');
    
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        let email = null;
        let newPassword = null;
        
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--email' && args[i + 1]) {
                email = args[i + 1];
                i++;
            } else if (args[i] === '--password' && args[i + 1]) {
                newPassword = args[i + 1];
                i++;
            }
        }
        
        // Get email if not provided
        if (!email) {
            email = await question('Enter admin email (default: admin@hmherbs.com): ');
            if (!email.trim()) {
                email = 'admin@hmherbs.com';
            }
        }
        
        // Get password if not provided
        if (!newPassword) {
            newPassword = await question('Enter new password: ');
            if (!newPassword.trim()) {
                console.log('❌ Password cannot be empty!');
                process.exit(1);
            }
        }
        
        console.log('\n🔄 Connecting to database...');
        
        // Connect to database
        const connection = await mysql.createConnection(dbConfig);
        
        console.log('✅ Connected to database');
        
        // Check if admin user exists
        const [users] = await connection.execute(
            'SELECT id, email FROM admin_users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            console.log(`❌ Admin user with email "${email}" not found!`);
            console.log('\n📝 Available admin users:');
            
            const [allUsers] = await connection.execute(
                'SELECT email, first_name, last_name, role FROM admin_users'
            );
            
            if (allUsers.length === 0) {
                console.log('   No admin users found in database.');
                console.log('\n💡 Would you like to create a new admin user? (y/n)');
                const createNew = await question('');
                
                if (createNew.toLowerCase() === 'y' || createNew.toLowerCase() === 'yes') {
                    await createNewAdmin(connection, email, newPassword);
                }
            } else {
                allUsers.forEach(user => {
                    console.log(`   - ${user.email} (${user.first_name} ${user.last_name}) - ${user.role}`);
                });
            }
            
            await connection.end();
            rl.close();
            return;
        }
        
        console.log('🔐 Hashing new password...');
        
        // Hash the new password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(newPassword, saltRounds);
        
        console.log('💾 Updating password in database...');
        
        // Update the password
        const [result] = await connection.execute(
            'UPDATE admin_users SET password_hash = ?, updated_at = NOW() WHERE email = ?',
            [passwordHash, email]
        );
        
        if (result.affectedRows > 0) {
            console.log('✅ Password updated successfully!');
            console.log('\n📋 Login Details:');
            console.log(`   Email: ${email}`);
            console.log(`   Password: ${newPassword}`);
            console.log('\n🌐 Access your admin panel at:');
            console.log('   Development: http://localhost:8000/admin.html');
            console.log('   Production: https://your-domain.com/admin.html');
            console.log('\n⚠️  Remember to change this password after logging in!');
        } else {
            console.log('❌ Failed to update password');
        }
        
        await connection.end();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Database connection failed. Make sure:');
            console.log('   1. MySQL is running');
            console.log('   2. Database credentials in .env are correct');
            console.log('   3. Database "hmherbs" exists');
        }
    }
    
    rl.close();
}

async function createNewAdmin(connection, email, password) {
    try {
        console.log('\n👤 Creating new admin user...');
        
        const firstName = await question('First name (default: Admin): ') || 'Admin';
        const lastName = await question('Last name (default: User): ') || 'User';
        
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        await connection.execute(
            `INSERT INTO admin_users (email, password_hash, first_name, last_name, role, is_active, created_at, updated_at) 
             VALUES (?, ?, ?, ?, 'super_admin', 1, NOW(), NOW())`,
            [email, passwordHash, firstName, lastName]
        );
        
        console.log('✅ New admin user created successfully!');
        console.log('\n📋 Login Details:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        console.log(`   Name: ${firstName} ${lastName}`);
        console.log(`   Role: super_admin`);
        
    } catch (error) {
        console.error('❌ Failed to create admin user:', error.message);
    }
}

// Handle script termination
process.on('SIGINT', () => {
    console.log('\n\n👋 Password reset cancelled');
    rl.close();
    process.exit(0);
});

// Run the script
if (require.main === module) {
    resetAdminPassword();
}

module.exports = { resetAdminPassword };

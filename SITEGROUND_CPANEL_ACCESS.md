# How to Access SiteGround cPanel

## Method 1: Through SiteGround Customer Portal (Recommended)

1. **Go to SiteGround Login Page**
   - Visit: https://www.siteground.com/login
   - Or: https://www.siteground.com/customer-login

2. **Log In**
   - Enter your SiteGround username/email
   - Enter your password
   - Click "Log In"

3. **Access cPanel**
   - After logging in, you'll see your hosting accounts
   - Click on your hosting account (donaldr27.sg-host.com)
   - Look for **"Go to cPanel"** button or **"cPanel"** link
   - Or go to **"Websites"** → Select your site → **"cPanel"**

## Method 2: Direct cPanel URL

If you know your cPanel URL, you can access it directly:

- **Standard URL**: `https://yourdomain.com:2083`
- **For your site**: `https://donaldr27.sg-host.com:2083`
- **Alternative**: `https://cpanel.sg-host.com`

**Note**: You'll need your cPanel username and password (may be different from your SiteGround account)

## Method 3: Through SiteGround Customer Area

1. Log into https://www.siteground.com/login
2. Go to **"Websites"** tab
3. Click on your website
4. Look for **"cPanel"** or **"Site Tools"** button

## What You'll See in cPanel

Once you're in cPanel, you'll see sections like:

### Database Section
- **MySQL Databases** - Create databases and users
- **phpMyAdmin** - Manage databases visually

### Software Section
- **Node.js** - Set up Node.js applications
- **Application Manager** - Deploy applications

### Files Section
- **File Manager** - Upload/manage files
- **FTP Accounts** - Set up FTP access

### Other Useful Tools
- **SSL/TLS** - Manage SSL certificates
- **Email Accounts** - Set up email
- **Subdomains** - Create subdomains

## If You Can't Access cPanel

### Forgot Password?
1. Go to https://www.siteground.com/login
2. Click "Forgot Password?"
3. Enter your email
4. Check email for reset link

### Don't Have Login Details?
1. Check your SiteGround welcome email
2. Look for "cPanel Login" information
3. Contact SiteGround support if needed

### SiteGround Support
- **Live Chat**: Available in customer portal
- **Phone**: Check SiteGround website for support number
- **Ticket System**: Submit support ticket through customer portal

## Quick Links for Your Setup

Once in cPanel, you'll need these sections:

1. **MySQL Databases** (for database setup)
   - Create database
   - Create user
   - Add user to database

2. **File Manager** (for uploading files)
   - Upload backend files
   - Upload database schema

3. **Node.js** (for backend server)
   - Create Node.js application
   - Set environment variables

4. **phpMyAdmin** (for importing database)
   - Import schema.sql
   - Import product data

## Security Note

- cPanel access is usually on port 2083 (HTTPS)
- Make sure you're using HTTPS (secure connection)
- Never share your cPanel credentials
- Use strong passwords


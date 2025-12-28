# SiteGround MySQL Database Setup Guide

## Yes, You Need MySQL Database

Your backend **requires** a MySQL database to function. The backend stores:
- Products (10,000+ products)
- Brands
- Categories
- Orders
- Users/Customers
- Shopping carts
- EDSA bookings
- Admin users
- And more...

## Step-by-Step Database Setup

### Step 1: Create MySQL Database in SiteGround

1. **Log into SiteGround cPanel**
2. Go to **MySQL Databases** section
3. **Create a new database:**
   - Database name: `hmherbs_db` (or your preferred name)
   - Click "Create Database"
4. **Create a database user:**
   - Username: `hmherbs_user` (or your preferred name)
   - Password: Create a strong password (save this!)
   - Click "Create User"
5. **Add user to database:**
   - Select the user you just created
   - Select the database you just created
   - Click "Add"
   - Grant **ALL PRIVILEGES** to the user
   - Click "Make Changes"

### Step 2: Get Database Connection Details

After creating the database, SiteGround will show you connection details. You'll need:

- **Database Host**: Usually `localhost` (or something like `mysql.yourdomain.com`)
- **Database Name**: The name you created (e.g., `hmherbs_db`)
- **Database User**: The username you created (e.g., `hmherbs_user`)
- **Database Password**: The password you set

**Important**: SiteGround might show the full hostname like:
- `localhost` (most common)
- Or `mysql.yourdomain.com`
- Or `yourdomain.com:3306`

### Step 3: Import Database Schema

You need to import the database structure. You have two options:

#### Option A: Using phpMyAdmin (Easiest)

1. In SiteGround cPanel, go to **phpMyAdmin**
2. Select your database from the left sidebar
3. Click **Import** tab
4. Click **Choose File** and select `database/schema.sql` from your local project
5. Click **Go** to import
6. Wait for import to complete (may take a few minutes for 33 tables)

#### Option B: Using Command Line (If you have SSH access)

1. Upload `database/schema.sql` to your SiteGround server
2. SSH into your server
3. Run:
   ```bash
   mysql -u your_username -p your_database_name < schema.sql
   ```

### Step 4: Import Your Product Data (Optional)

If you have existing products in your local database:

1. Export from local database:
   ```bash
   mysqldump -u root -p hmherbs products brands product_categories > products_export.sql
   ```
2. Import to SiteGround database using phpMyAdmin or command line

### Step 5: Configure Backend Environment Variables

In your SiteGround backend folder, create or update `.env` file:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=hmherbs_user
DB_PASSWORD=your_database_password_here
DB_NAME=hmherbs_db

# Server Configuration
PORT=3001
NODE_ENV=production

# JWT Secret (generate a random string)
JWT_SECRET=your-random-secret-key-here-min-32-characters

# Admin Email (optional, for password resets)
ADMIN_EMAIL=your-email@example.com
```

**Important Notes:**
- Replace `DB_HOST` with your actual database host from SiteGround
- Replace `DB_USER` with your actual database username
- Replace `DB_PASSWORD` with your actual database password
- Replace `DB_NAME` with your actual database name
- Generate a secure `JWT_SECRET` (random string, at least 32 characters)

### Step 6: Test Database Connection

After setting up, test if the backend can connect:

1. Start your Node.js app on SiteGround
2. Check the logs for database connection errors
3. If you see connection errors, verify:
   - Database credentials are correct
   - Database user has proper permissions
   - Database host is correct (might not be `localhost`)

## Database Tables Created

The schema creates **33 tables** including:
- `products` - Product catalog
- `brands` - Product brands
- `product_categories` - Product categories
- `health_categories` - Health condition categories
- `users` - Customer accounts
- `orders` - Order history
- `cart_items` - Shopping cart
- `admin_users` - Admin panel users
- `edsa_bookings` - EDSA service bookings
- And more...

## Troubleshooting

### "Access Denied" Error
- Check username and password are correct
- Verify user has permissions on the database
- Check if user is added to the database

### "Can't Connect to MySQL Server"
- Verify `DB_HOST` is correct (might not be `localhost`)
- Check if MySQL is running
- Verify firewall isn't blocking port 3306

### "Unknown Database"
- Verify database name is correct
- Check if database was created successfully
- Ensure database exists in phpMyAdmin

## Quick Checklist

- [ ] MySQL database created in SiteGround
- [ ] Database user created
- [ ] User added to database with ALL PRIVILEGES
- [ ] Database connection details saved
- [ ] `schema.sql` imported successfully
- [ ] `.env` file configured with database credentials
- [ ] Backend can connect to database (check logs)
- [ ] Products data imported (if applicable)

## Next Steps After Database Setup

1. **Set up Node.js app** on SiteGround
2. **Upload backend files**
3. **Configure `.env` file** with database credentials
4. **Start the backend server**
5. **Test API endpoints**: `https://donaldr27.sg-host.com/api/products`

Once the database is set up and the backend is running, your products page will load correctly!


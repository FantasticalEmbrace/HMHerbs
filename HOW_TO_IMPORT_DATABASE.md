# How to Import Database Schema into SiteGround MySQL

## What You're Doing

You're **importing** the SQL file (`schema.sql`) **into** your MySQL database. This creates all the tables your backend needs.

## Step-by-Step Process

### Step 1: Create the Database First

**In SiteGround cPanel:**

1. Go to **MySQL Databases** section
2. Create a new database (e.g., `hmherbs_db`)
3. Create a database user (e.g., `hmherbs_user`)
4. Add the user to the database with ALL PRIVILEGES
5. **Save the connection details** (host, username, password, database name)

### Step 2: Import the SQL File Using phpMyAdmin

**Option A: Using phpMyAdmin (Easiest Method)**

1. **In SiteGround cPanel**, go to **phpMyAdmin** section
2. Click on **phpMyAdmin** to open it
3. **Select your database** from the left sidebar
   - Click on the database name you created (e.g., `hmherbs_db`)
4. Click the **Import** tab at the top
5. Click **Choose File** button
6. **Select `database/schema.sql`** from your local computer
   - This is the file in your `hmherbs-main/database/` folder
7. Scroll down and click **Go** button
8. **Wait for import to complete** (may take 1-2 minutes)
9. You should see "Import has been successfully finished" message

**Option B: Using File Manager + phpMyAdmin**

1. **Upload the SQL file first:**
   - In cPanel, go to **File Manager**
   - Navigate to your domain root or a temporary folder
   - Upload `database/schema.sql` file
2. **Then import:**
   - Go to phpMyAdmin
   - Select your database
   - Click Import tab
   - Choose the uploaded file
   - Click Go

### Step 3: Verify Tables Were Created

After importing, you should see **33 tables** in your database:

- `users`
- `products`
- `brands`
- `product_categories`
- `health_categories`
- `orders`
- `cart_items`
- `admin_users`
- `edsa_bookings`
- And 24 more tables...

**To verify:**
- In phpMyAdmin, click on your database name
- You should see a list of tables on the left sidebar
- Count them - should be 33 tables total

### Step 4: Import Seed Data (Optional)

If you want sample data:

1. In phpMyAdmin, select your database
2. Click **Import** tab again
3. Choose `database/seed-data.sql` file
4. Click **Go**

**Note:** Only import seed data if you want sample/test data. If you already have products in your local database, skip this and import your actual product data instead.

## Important Notes

### What the SQL File Does

The `schema.sql` file contains **CREATE TABLE** statements that:
- Create all the database tables
- Set up relationships between tables
- Create indexes for performance
- Define data types and constraints

### You're NOT Uploading Files TO the Database

- ❌ **Wrong**: Uploading files to a database folder
- ✅ **Correct**: Importing SQL commands INTO the database

Think of it like:
- The database is an empty container
- The SQL file contains instructions to build tables inside that container
- Importing = executing those instructions

### File Location

The SQL file you need is:
- **Location**: `hmherbs-main/database/schema.sql`
- **Size**: Should be around 50-100 KB
- **Contains**: SQL commands to create 33 tables

## Troubleshooting

### "File too large" Error
- If the file is too large, try increasing upload limit in phpMyAdmin
- Or use command line method (if you have SSH access)

### "Access Denied" Error
- Make sure you selected the correct database
- Verify database user has proper permissions
- Try refreshing phpMyAdmin

### "Table already exists" Error
- Database might already have tables
- Either drop existing tables first, or
- Use a fresh/new database

### Import Takes Too Long
- Large schema files can take 1-2 minutes
- Be patient and don't close the browser
- Check browser console for errors

## Quick Checklist

- [ ] Database created in SiteGround
- [ ] Database user created and added to database
- [ ] phpMyAdmin opened
- [ ] Database selected in phpMyAdmin
- [ ] Import tab clicked
- [ ] `schema.sql` file selected
- [ ] Import completed successfully
- [ ] Verified 33 tables were created
- [ ] (Optional) Imported seed data or actual product data

## After Import

Once the schema is imported:

1. **Configure backend `.env` file** with database credentials
2. **Start your Node.js backend**
3. **Test API**: `https://donaldr27.sg-host.com/api/products`

Your products should now load!


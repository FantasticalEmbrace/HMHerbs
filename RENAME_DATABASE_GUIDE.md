# How to Rename a Database in SiteGround phpMyAdmin

## ⚠️ Important Note

**MySQL does NOT support directly renaming a database** with a simple `RENAME DATABASE` command. You need to use one of these methods:

---

## Method 1: Using phpMyAdmin Export/Import (Easiest)

### Step 1: Export Your Current Database
1. Log into SiteGround cPanel
2. Open **phpMyAdmin**
3. Select your current database (e.g., `hmherbs`)
4. Click the **Export** tab
5. Choose **Quick** export method
6. Format: **SQL**
7. Click **Go** to download the `.sql` file

### Step 2: Create New Database
1. In phpMyAdmin, click **New** (or go to Databases section in cPanel)
2. Create a new database with your desired name (e.g., `hmherbs_new`)
3. Note: SiteGround may prefix it like `username_hmherbs_new`

### Step 3: Import Into New Database
1. Select the new database
2. Click the **Import** tab
3. Choose the `.sql` file you downloaded
4. Click **Go** to import

### Step 4: Update Your Application
1. Update `backend/.env` on SiteGround:
   ```env
   DB_NAME=hmherbs_new
   ```
   (or whatever SiteGround prefixed it with)

### Step 5: Drop Old Database (Optional)
1. Select the old database
2. Click **Operations** tab
3. Scroll down and click **Drop the database**
4. ⚠️ **Only do this after confirming the new database works!**

---

## Method 2: Using RENAME TABLE (For Advanced Users)

### Step 1: Create New Database
```sql
CREATE DATABASE `new_database_name` 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;
```

### Step 2: Generate RENAME Statements
Run this query in phpMyAdmin (replace `old_database` and `new_database`):

```sql
SELECT CONCAT('RENAME TABLE `old_database`.`', table_name, '` TO `new_database`.`', table_name, '`;') AS rename_statement
FROM information_schema.tables
WHERE table_schema = 'old_database'
ORDER BY table_name;
```

### Step 3: Copy and Execute Output
Copy all the generated `RENAME TABLE` statements and execute them.

### Step 4: Drop Old Database
```sql
DROP DATABASE IF EXISTS `old_database`;
```

---

## Method 3: Using Command Line (If You Have SSH Access)

```bash
# Export
mysqldump -u username -p old_database > dump.sql

# Create new database
mysql -u username -p -e "CREATE DATABASE new_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Import
mysql -u username -p new_database < dump.sql

# Drop old (after confirming new works)
mysql -u username -p -e "DROP DATABASE old_database;"
```

---

## What Database Name Should You Use?

### On SiteGround:
- SiteGround **automatically prefixes** your database name
- If you create `hmherbs`, it becomes `username_hmherbs`
- Check your actual database name in phpMyAdmin

### To Find Your Database Name:
1. Log into phpMyAdmin
2. Look at the left sidebar - that's your actual database name
3. Use that exact name in your `.env` file

---

## Quick Query to List All Databases

```sql
SHOW DATABASES;
```

This shows all databases you have access to, including SiteGround's prefixed names.

---

## Quick Query to Check Current Database Name

```sql
SELECT DATABASE();
```

This shows which database you're currently using.

---

## After Renaming: Update Your Application

Don't forget to update your SiteGround `.env` file:

```env
DB_HOST=localhost
DB_USER=your_siteground_db_user
DB_PASSWORD=your_siteground_db_password
DB_NAME=your_actual_database_name  # Use the prefixed name from phpMyAdmin!
```

---

## ⚠️ Safety Tips

1. **Always backup first** - Export your database before renaming
2. **Test the new database** - Make sure everything works before dropping the old one
3. **Update your `.env` file** - Use the exact database name from phpMyAdmin
4. **Keep the old database** - Don't drop it until you're 100% sure everything works

---

## Need Help?

If you're unsure, **Method 1 (Export/Import)** is the safest and easiest approach!


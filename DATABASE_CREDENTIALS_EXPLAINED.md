# Database Credentials Explained

## Short Answer: NO, They Don't Need to Match

The database name and password you create in SiteGround can be **anything you want**. Then you just need to update your backend `.env` file to match.

## How It Works

### Step 1: Create Database in SiteGround (Use Any Name/Password)

**In SiteGround cPanel → MySQL Databases:**

You can create:
- **Database name**: `hmherbs_db` (or `donald_db`, `my_products`, anything you want)
- **Username**: `hmherbs_user` (or `db_user`, `admin`, anything you want)
- **Password**: `YourSecurePassword123!` (create a strong password)

**Save these credentials** - you'll need them for Step 2.

### Step 2: Update Your Backend `.env` File

**In your backend folder**, create or update `.env` file:

```env
DB_HOST=localhost
DB_USER=hmherbs_user          ← Must match SiteGround username
DB_PASSWORD=YourSecurePassword123!  ← Must match SiteGround password
DB_NAME=hmherbs_db            ← Must match SiteGround database name
```

**Important**: The `.env` file values must match what you created in SiteGround.

## Example Scenario

### What You Create in SiteGround:
- Database: `donald_products_db`
- Username: `donald_user`
- Password: `MyP@ssw0rd2024!`

### What Goes in Your `.env` File:
```env
DB_HOST=localhost
DB_USER=donald_user           ← Matches SiteGround username
DB_PASSWORD=MyP@ssw0rd2024!   ← Matches SiteGround password
DB_NAME=donald_products_db    ← Matches SiteGround database name
```

## Important Notes

### 1. Local vs Production Are Different

- **Local (your computer)**: Uses one set of credentials
- **SiteGround (production)**: Uses different credentials
- They don't need to match each other!

### 2. The `.env` File is Environment-Specific

Your backend reads from `.env` file, so:
- **On your local machine**: `.env` has local database credentials
- **On SiteGround**: `.env` has SiteGround database credentials
- Same code, different config files

### 3. Database Host Might Be Different

SiteGround might use:
- `localhost` (most common)
- Or `mysql.yourdomain.com`
- Or `yourdomain.com:3306`

Check SiteGround's database connection details - they'll tell you the exact host.

## Step-by-Step Process

### 1. Create Database in SiteGround
```
Database Name: hmherbs_production
Username: hmherbs_admin
Password: [create strong password]
```
**Save these!**

### 2. Import Schema
- Use phpMyAdmin to import `schema.sql` into the database you just created

### 3. Create `.env` File on SiteGround
Upload `.env` file to your backend folder on SiteGround with:
```env
DB_HOST=localhost
DB_USER=hmherbs_admin
DB_PASSWORD=[the password you created]
DB_NAME=hmherbs_production
PORT=3001
JWT_SECRET=your-secret-key-here
```

### 4. Test Connection
- Start your Node.js backend
- Check logs for database connection errors
- If connected successfully, you're good!

## Security Best Practices

### Use Strong Passwords
- At least 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Don't use common words

### Don't Commit `.env` to Git
- `.env` files contain sensitive credentials
- Never upload them to GitHub/public repos
- SiteGround `.env` should only exist on the server

### Different Credentials for Different Environments
- **Development (local)**: `hmherbs_dev`, `dev_user`, `dev_password`
- **Production (SiteGround)**: `hmherbs_prod`, `prod_user`, `strong_prod_password`

## Troubleshooting

### "Access Denied" Error
- Username/password don't match SiteGround credentials
- Check `.env` file values match exactly

### "Unknown Database" Error
- Database name doesn't match
- Check `.env` file `DB_NAME` matches SiteGround database name

### "Can't Connect" Error
- `DB_HOST` might be wrong
- SiteGround might use different host (not `localhost`)
- Check SiteGround's database connection details

## Quick Checklist

- [ ] Created database in SiteGround (any name/password)
- [ ] Saved SiteGround database credentials
- [ ] Created/updated `.env` file in backend folder
- [ ] `.env` file matches SiteGround credentials exactly
- [ ] Imported schema.sql into SiteGround database
- [ ] Tested backend connection (check logs)

## Summary

**You can use ANY database name and password in SiteGround** - just make sure your backend `.env` file matches what you created. The credentials don't need to match your local setup - they're completely separate!


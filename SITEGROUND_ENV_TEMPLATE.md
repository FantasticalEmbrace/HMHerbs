# SiteGround .env File Template

When deploying to SiteGround, create a `backend/.env` file on the server with these values:

```env
# Database Configuration (SiteGround)
DB_HOST=localhost
DB_USER=your_siteground_db_user
DB_PASSWORD=your_siteground_db_password
DB_NAME=dbpzmnx6y5yy0z

# Server Configuration
PORT=3001
NODE_ENV=production

# JWT Secret (use a different secret for production!)
JWT_SECRET=your_production_jwt_secret_here

# Frontend URL
FRONTEND_URL=https://yourdomain.com
```

## Important Notes:

1. **Database Name**: Use the exact database name from SiteGround phpMyAdmin (it may be prefixed)
2. **Database User**: SiteGround creates a separate database user (not `root`)
3. **Database Password**: Use the password SiteGround provided for the database user
4. **JWT Secret**: Use a different, secure secret for production
5. **Frontend URL**: Update with your actual domain name

## How to Find Your SiteGround Database Credentials:

1. Log into SiteGround cPanel
2. Go to **MySQL Databases** section
3. You'll see:
   - Database name (e.g., `username_dbpzmnx6y5yy0z`)
   - Database user (e.g., `username_dbuser`)
   - Database password (click "Show" to reveal)

## Local vs SiteGround:

- **Local Development**: Keep `DB_NAME=hmherbs` in your local `.env`
- **SiteGround Production**: Use `DB_NAME=dbpzmnx6y5yy0z` (or the prefixed version) in SiteGround's `.env`


# How to import the database

This project deploys to **DigitalOcean Managed MySQL**, not phpMyAdmin.

## Quick path

1. Build the bundle: `npm run db:build-staging`
2. Import: see **[database/DEPLOY-DATABASE.md](./database/DEPLOY-DATABASE.md)**
3. Configure the API: **[backend/.env.digitalocean.example](./backend/.env.digitalocean.example)**

Full server setup: **[DIGITALOCEAN_DEPLOY.md](./DIGITALOCEAN_DEPLOY.md)**

## Schema only (empty database)

If you only need table structure without product data:

```bash
mysql -h YOUR_DB_HOST -P 25060 -u YOUR_USER -p --ssl-mode=REQUIRED hmherbs < database/schema.sql
```

Then run migrations listed in `database/DEPLOY-DATABASE.md`, or use `deploy-staging.sql` for the full catalog.

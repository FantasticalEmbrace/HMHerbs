# Database deploy (DigitalOcean Managed MySQL)

## Build the import bundle

```bash
npm run db:build-staging
```

Output: **`database/deploy-staging.sql`** (~0.3 MB) — backup + migrations in one file.

## Import from your computer

1. In DigitalOcean → **Databases** → your cluster → add your **public IP** to trusted sources (temporary).
2. Install MySQL client locally if needed.
3. Run:

```bash
mysql -h db-mysql-nyc3-xxxxx.db.ondigitalocean.com \
  -P 25060 \
  -u doadmin \
  -p \
  --ssl-mode=REQUIRED \
  hmherbs < database/deploy-staging.sql
```

Use the host, port, user, and database name from the control panel.

## Import from a Droplet (recommended for production)

1. Add the Droplet as a **trusted source** on the database cluster.
2. Upload the SQL file:

```bash
scp database/deploy-staging.sql user@YOUR_DROPLET_IP:/tmp/
```

3. On the Droplet:

```bash
bash deploy/import-database.sh /tmp/deploy-staging.sql
```

Or set env vars and run the script (see script header).

## After import

1. Point `backend/.env` at the cluster (`DB_HOST`, `DB_PORT`, `DB_SSL=true`, CA cert path).
2. Restart the API (`pm2 restart hmherbs-api`).
3. Rotate admin passwords.

## Rebuild when catalog changes

1. Export fresh data from local MySQL into `database/` (new `hmherbs_backup_*.sql`).
2. Update the backup path in `database/build-deploy-bundle.js`.
3. Run `npm run db:build-staging` again and re-import.

# HM Herbs — DigitalOcean deployment

Deploy the static storefront + Node API on a **Droplet**, with **Managed MySQL** for the database (recommended).

## Architecture

```text
Internet → Nginx (443) → static HTML/CSS/JS (repo root)
                      → /api/* → Node (PM2, port 3001)
                      → Managed MySQL (port 25060, SSL)
```

## 1. Managed MySQL

1. DigitalOcean control panel → **Databases** → **Create Database Cluster**
   - Engine: **MySQL 8**
   - Name: e.g. `hmherbs-db`
   - Region: same as your Droplet
2. Create a database (e.g. `hmherbs`) and a user with full access.
3. **Settings → Trusted sources**: add your Droplet (or your home IP for first import).
4. Note connection details:
   - Host, port (usually **25060**), user, password, database name
   - Download **CA certificate** (required for SSL)

## 2. Import the database

From your **local machine** (with the bundle built):

```bash
npm run db:build-staging
```

Import `database/deploy-staging.sql`:

```bash
mysql -h YOUR_DB_HOST -P 25060 -u doadmin -p --ssl-mode=REQUIRED hmherbs < database/deploy-staging.sql
```

Or from the **Droplet** after uploading the file:

```bash
sudo apt install -y mysql-client
mysql -h YOUR_DB_HOST -P 25060 -u YOUR_USER -p --ssl-mode=REQUIRED hmherbs < deploy-staging.sql
```

See `database/DEPLOY-DATABASE.md` for bundle contents and rebuild steps.

## 3. Droplet setup

1. **Create Droplet** — Ubuntu 22.04 LTS, 1–2 GB RAM minimum for catalog + API.
2. **DNS** — Point your domain (or staging subdomain) A record to the Droplet IP.
3. SSH in and install dependencies:

```bash
sudo apt update && sudo apt install -y nginx git certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

4. Clone the repo (or deploy via GitHub Actions / `rsync`):

```bash
cd /var/www
sudo git clone YOUR_REPO_URL hmherbs
sudo chown -R $USER:$USER hmherbs
cd hmherbs
npm install
cd backend && npm install && cd ..
```

5. **Environment** — copy `backend/.env.digitalocean.example` → `backend/.env` and fill in:

| Variable | Source |
|----------|--------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Managed MySQL connection panel |
| `DB_SSL=true` | Required for Managed MySQL |
| `DB_SSL_CA_PATH` | Path to downloaded CA `.crt` on the server |
| `FRONTEND_URL`, `STOREFRONT_PUBLIC_URL` | `https://your-domain.com` |
| `JWT_SECRET` | New random hex (see example file) |

6. **SSL CA on server**:

```bash
mkdir -p /var/www/hmherbs/backend/certs
# Upload ca-certificate.crt from DigitalOcean into backend/certs/
# Set DB_SSL_CA_PATH=./certs/ca-certificate.crt in .env
```

7. **PM2**:

```bash
cd /var/www/hmherbs
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

8. **Nginx** — copy and edit the site config:

```bash
sudo cp deploy/nginx/hmherbs.conf.example /etc/nginx/sites-available/hmherbs
sudo nano /etc/nginx/sites-available/hmherbs   # set server_name
sudo ln -s /etc/nginx/sites-available/hmherbs /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

9. **HTTPS**:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 4. Verify

```bash
curl -s http://127.0.0.1:3001/api/health
curl -s https://your-domain.com/api/products?limit=1
```

Change admin passwords after first deploy.

## 5. Staging / temp domain

Use the same steps with a subdomain (e.g. `staging.hmherbs.com`). In `backend/.env`:

```bash
STAGING_BLOCK_INDEXING=true
NMI_SANDBOX=1
```

## 6. App Platform (optional)

If you prefer PaaS instead of a Droplet:

- Static site: **App Platform** static component or Spaces + CDN for `index.html`, `css/`, `js/`, `images/`
- API: **Web Service** component, root `backend`, run `npm start`, attach Managed MySQL
- Set env vars from `.env.digitalocean.example` in the App Platform dashboard

Droplet + Nginx is simpler for this repo’s layout (static files at root + separate API).

## Files in this repo

| Path | Purpose |
|------|---------|
| `DIGITALOCEAN_DEPLOY.md` | This guide |
| `DIGITALOCEAN_CHECKLIST.md` | Printable step-by-step checklist |
| `deploy/README.md` | Index of all deploy scripts |
| `database/DEPLOY-DATABASE.md` | SQL import / bundle |
| `database/deploy-staging.sql` | One-file DB import (`npm run deploy:bundle`) |
| `backend/.env.digitalocean.example` | API `.env` template on the server |
| `deploy/db-connection.env.example` | Credentials for import scripts only |
| `deploy/bootstrap-droplet.sh` | First-time Droplet setup |
| `deploy/setup-nginx-ssl.sh` | Nginx + Let's Encrypt |
| `deploy/import-database.sh` | Import SQL (Linux / Droplet) |
| `deploy/import-database.ps1` | Import SQL (Windows) |
| `deploy/upload-to-droplet.ps1` | Upload SQL to Droplet (Windows) |
| `deploy/nginx/hmherbs.conf.example` | Nginx reverse proxy |
| `deploy/ecosystem.config.cjs` | PM2 process config |
| `.do/app.yaml` | Optional App Platform spec |

Verify everything is present: `npm run deploy:verify`

## Windows quick path

```powershell
npm run deploy:bundle
copy deploy\db-connection.env.example deploy\db-connection.env
# Edit deploy\db-connection.env with DO MySQL credentials
.\deploy\import-database.ps1
.\deploy\upload-to-droplet.ps1 -DropletIp YOUR_IP -BuildBundle
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED` to DB | Check firewall trusted sources; use Managed MySQL host/port, not `localhost` |
| SSL errors | Set `DB_SSL=true` and `DB_SSL_CA_PATH` to DO CA cert |
| 502 on `/api` | `pm2 logs hmherbs-api`; confirm app listens on `PORT=3001` |
| Empty products | DB import failed or `DB_NAME` mismatch; test with `mysql` CLI |

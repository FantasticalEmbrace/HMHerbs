# DigitalOcean deployment checklist

Print or copy this list and check off as you go.

## A. DigitalOcean control panel

- [ ] Create **Managed MySQL** cluster (MySQL 8, same region as Droplet)
- [ ] Create database `hmherbs` (or your chosen name)
- [ ] Create DB user with full privileges on that database
- [ ] Download **CA certificate** from cluster → Connection details
- [ ] Note: host, port (`25060`), username, password, database name
- [ ] Create **Droplet** (Ubuntu 22.04, 2 GB RAM recommended)
- [ ] Add SSH key to Droplet
- [ ] Point domain **A record** to Droplet IP (or use IP for first test)

## B. Local machine

- [ ] Run `npm run db:build-staging` → confirms `database/deploy-staging.sql` exists
- [ ] Copy `backend/.env.digitalocean.example` values you will use on the server
- [ ] Generate production `JWT_SECRET`:  
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## C. Database import

- [ ] Add your IP (or Droplet) to MySQL **Trusted sources**
- [ ] Import SQL:
  - Windows: `deploy/import-database.ps1` (see script header), or
  - Droplet: `bash deploy/import-database.sh /tmp/deploy-staging.sql`
- [ ] Confirm tables exist (e.g. `products` has rows)

## D. Droplet setup

- [ ] SSH into Droplet: `ssh root@YOUR_DROPLET_IP`
- [ ] Run bootstrap:  
  `export REPO_URL=YOUR_GIT_URL`  
  `sudo bash deploy/bootstrap-droplet.sh`
- [ ] Upload CA cert to `backend/certs/ca-certificate.crt`
- [ ] Create `backend/.env` from `.env.digitalocean.example` (fill all values)
- [ ] `pm2 restart hmherbs-api` and `pm2 logs hmherbs-api` (no DB errors)

## E. Nginx + HTTPS

- [ ] Edit `server_name` in `/etc/nginx/sites-available/hmherbs`
- [ ] Run `sudo bash deploy/setup-nginx-ssl.sh your-domain.com`
- [ ] Visit `https://your-domain.com` — homepage loads
- [ ] Visit `https://your-domain.com/api/products?limit=1` — JSON returns

## F. Security & launch

- [ ] Change **admin passwords** (DB had dev hashes from backup)
- [ ] Set real NMI keys (or keep `NMI_SANDBOX=1` on staging)
- [ ] Staging only: `STAGING_BLOCK_INDEXING=true` in `.env`
- [ ] Remove temporary **Trusted sources** (your home IP) if no longer needed
- [ ] `pm2 save` and confirm `pm2 startup` ran

## Done

- [ ] Store production `.env` only on the server (never commit)
- [ ] Bookmark [DIGITALOCEAN_DEPLOY.md](./DIGITALOCEAN_DEPLOY.md) for updates

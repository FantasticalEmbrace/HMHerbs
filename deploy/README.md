# Deploy assets (DigitalOcean)

| File | Use |
|------|-----|
| [../DIGITALOCEAN_DEPLOY.md](../DIGITALOCEAN_DEPLOY.md) | Full deployment guide |
| [../DIGITALOCEAN_CHECKLIST.md](../DIGITALOCEAN_CHECKLIST.md) | Step-by-step checklist |
| [bootstrap-droplet.sh](./bootstrap-droplet.sh) | First-time Droplet setup (Node, PM2, Nginx, deps) |
| [setup-nginx-ssl.sh](./setup-nginx-ssl.sh) | Enable Nginx site + Let's Encrypt |
| [import-database.sh](./import-database.sh) | Import SQL from Linux (Droplet) |
| [import-database.ps1](./import-database.ps1) | Import SQL from Windows |
| [upload-to-droplet.ps1](./upload-to-droplet.ps1) | Upload repo + SQL to Droplet (Windows) |
| [db-connection.env.example](./db-connection.env.example) | DB credentials for import scripts only |
| [nginx/hmherbs.conf.example](./nginx/hmherbs.conf.example) | Nginx config |
| [ecosystem.config.cjs](./ecosystem.config.cjs) | PM2 config |
| [../backend/.env.digitalocean.example](../backend/.env.digitalocean.example) | API `.env` template |
| [../database/deploy-staging.sql](../database/deploy-staging.sql) | One-file DB import (run `npm run db:build-staging` first) |

## Quick start

```bash
# 1. Local — build DB bundle
npm run db:build-staging

# 2. DigitalOcean — create Managed MySQL + Droplet (see checklist)

# 3. Droplet — bootstrap (set REPO_URL and run as root or with sudo)
export REPO_URL=https://github.com/YOUR_USER/hmherbs.git
sudo bash deploy/bootstrap-droplet.sh

# 4. Edit env + import DB (see DIGITALOCEAN_DEPLOY.md)
```

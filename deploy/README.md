# Deploy assets (Linode / Akamai)

| File | Use |
|------|-----|
| [../LINODE_DEPLOY.md](../LINODE_DEPLOY.md) | Full deployment guide |
| [../LINODE_CHECKLIST.md](../LINODE_CHECKLIST.md) | Step-by-step checklist |
| [bootstrap-linode.sh](./bootstrap-linode.sh) | First-time Linode setup (Node, PM2, Nginx, deps) |
| [setup-nginx-ssl.sh](./setup-nginx-ssl.sh) | Enable Nginx site + Let's Encrypt |
| [import-database.sh](./import-database.sh) | Import SQL from Linux (Linode) |
| [import-database.ps1](./import-database.ps1) | Import SQL from Windows |
| [upload-to-linode.ps1](./upload-to-linode.ps1) | Upload SQL to Linode (Windows) |
| [db-connection.env.example](./db-connection.env.example) | DB credentials for import scripts only |
| [nginx/hmherbs.conf.example](./nginx/hmherbs.conf.example) | Nginx config |
| [ecosystem.config.cjs](./ecosystem.config.cjs) | PM2 config |
| [../backend/.env.linode.example](../backend/.env.linode.example) | API `.env` template |
| [../database/deploy-staging.sql](../database/deploy-staging.sql) | One-file DB import (run `npm run db:build-staging` first) |

## Quick start

```bash
# 1. Local — build DB bundle
npm run db:build-staging

# 2. Linode — create Managed MySQL + Linode + NodeBalancer (see checklist)

# 3. Linode — bootstrap (set REPO_URL and run as root or with sudo)
export REPO_URL=https://github.com/YOUR_USER/hmherbs.git
sudo bash deploy/bootstrap-linode.sh

# 4. Edit env + import DB (see LINODE_DEPLOY.md)
```

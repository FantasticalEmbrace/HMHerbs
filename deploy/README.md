# Deploy assets (Linode / Akamai)

| File | Use |
|------|-----|
| [../LINODE_DEPLOY.md](../LINODE_DEPLOY.md) | Full HM Herbs Linode deployment guide |
| [MIAMI-MIGRATION.md](./MIAMI-MIGRATION.md) | **Atlanta → Miami** (NodeBalancer + private IP) |
| [migrate-to-miami.ps1](./migrate-to-miami.ps1) | One-command Miami migration |
| [provision-miami.ps1](./provision-miami.ps1) | Linode API: app + NodeBalancer in us-mia |
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
| [sync-full-linode.ps1](./sync-full-linode.ps1) | Push full site code to Linode (excludes `.env`) |
| [sync-linode-env.ps1](./sync-linode-env.ps1) | Merge local feature credentials into Linode `.env` |
| [verify-linode-features.sh](./verify-linode-features.sh) | Check API + env parity on the server |
| [GOOGLE_OAUTH_REDIRECT_URIS.md](./GOOGLE_OAUTH_REDIRECT_URIS.md) | **Google OAuth redirect URIs** (temp sslip.io + hmherbs.com) |
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

# 5. Windows — keep Linode feature-parity with local dev
.\deploy\sync-full-linode.ps1      # code
.\deploy\sync-linode-env.ps1       # credentials (Google, NMI, POS, SMTP, …)
ssh root@172.235.131.160 'bash /var/www/hmherbs/deploy/verify-linode-features.sh'

# 6. Google OAuth — add redirect URIs in Cloud Console (required for sign-in)
# See deploy/GOOGLE_OAUTH_REDIRECT_URIS.md (temp sslip.io + hmherbs.com)
```

## Temp domain → production cutover

While on `172-238-208-164.sslip.io`, run `sync-linode-env.ps1` after local `.env` changes.

**Before reviewers use Google sign-in on the temp site**, register the four sslip.io callback URLs in Google Cloud Console — see [GOOGLE_OAUTH_REDIRECT_URIS.md](./GOOGLE_OAUTH_REDIRECT_URIS.md).

When `hmherbs.com` DNS moves to Linode:

1. Update nginx + certbot for the real domain
2. Re-run `sync-linode-env.ps1 -TempDomain www.hmherbs.com` (or edit URLs in `.env`)
3. Add the four `https://www.hmherbs.com/api/.../callback` redirect URIs in Google Cloud Console ([full list](./GOOGLE_OAUTH_REDIRECT_URIS.md))
4. Set `STAGING_BLOCK_INDEXING=false` and restart PM2

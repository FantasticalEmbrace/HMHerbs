# Database credentials

Local development and DigitalOcean production use **separate** databases. Values in `backend/.env` must match the database you are connecting to.

## Local (your PC)

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_local_password
DB_NAME=hmherbs
```

No SSL required locally.

## DigitalOcean Managed MySQL (production / staging)

Copy **[backend/.env.digitalocean.example](./backend/.env.digitalocean.example)** and fill in values from:

**DigitalOcean → Databases → your cluster → Connection details**

| Variable | Typical value |
|----------|----------------|
| `DB_HOST` | `db-mysql-....db.ondigitalocean.com` |
| `DB_PORT` | `25060` |
| `DB_USER` | `doadmin` (or your app user) |
| `DB_PASSWORD` | From the control panel |
| `DB_NAME` | e.g. `hmherbs` |
| `DB_SSL` | `true` |
| `DB_SSL_CA_PATH` | Path to downloaded CA cert |

Add your **Droplet** (or your IP for one-time import) under **Trusted sources** on the database cluster.

## Rules

- Local `.env` stays on your machine; production `.env` lives only on the Droplet.
- `DB_NAME`, `DB_USER`, and `DB_PASSWORD` must match what you created in DigitalOcean — they do not need to match local names.
- If you see `ECONNREFUSED`, check host/port and firewall trusted sources.
- If you see SSL errors, set `DB_SSL=true` and point `DB_SSL_CA_PATH` at the DO CA certificate.

See **[DIGITALOCEAN_DEPLOY.md](./DIGITALOCEAN_DEPLOY.md)** for full deployment steps.

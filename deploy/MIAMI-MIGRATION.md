# Miami migration (Atlanta → us-mia + NodeBalancer)

**Why this doc exists:** `LINODE_DEPLOY.md` originally said “use a NodeBalancer” without listing **Atlanta as unsupported**. Atlanta has no VPC and no private IP for new Linodes, so NodeBalancer backend dropdowns stay empty. **Miami, FL (`us-mia`)** is the correct core region for HM Herbs (NodeBalancer + private IP + Managed MySQL).

## What was prepared for you

| Script | Purpose |
|--------|---------|
| [provision-miami.ps1](./provision-miami.ps1) | API: 2 GB Linode + private IP + NodeBalancer + backend |
| [migrate-to-miami.ps1](./migrate-to-miami.ps1) | Full orchestrator (provision + deploy + DB + env) |
| [setup-miami-server.sh](./setup-miami-server.sh) | Nginx/PM2/UFW on the new Linode |
| [apply-db-env-remote.ps1](./apply-db-env-remote.ps1) | Push `DB_*` from `db-connection.env` to server |

State file (local only, gitignored): `deploy/miami-provision.state.json`

---

## Fast path (~30–45 min)

### 1. Create Miami Managed MySQL (Cloud Manager UI)

1. **Databases** → **Create** → **MySQL 8** → **Miami, FL**
2. Database name: `hmherbs`
3. Create an application user with full access on `hmherbs`
4. **Access Controls**: add your **home IP** (for import from PC) — you'll add the new Linode IP in step 3
5. Download **CA certificate** → save e.g. `C:\Users\donal\Downloads\ca-certificate.crt`
6. Update **`deploy/db-connection.env`** with new `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_CA=...`

### 2. Run migration from PowerShell

```powershell
cd "C:\Users\donal\Desktop\Web SItes\hmherbs-main"

# API token: Cloud Manager → Profile → API Tokens → Create (Read/Write)
$env:LINODE_TOKEN = "YOUR_TOKEN_HERE"

.\deploy\migrate-to-miami.ps1
```

This will:

- Create Linode + NodeBalancer in Miami
- Wait for SSH, upload code, run `setup-miami-server.sh`
- Import `database/deploy-staging.sql` (if `db-connection.env` is updated)
- Sync Google/NMI/SMTP credentials via `sync-linode-env.ps1`

**Already provisioned?** Deploy only:

```powershell
.\deploy\migrate-to-miami.ps1 -DeployOnly
```

### 3. Verify NodeBalancer

Cloud Manager → **NodeBalancers** → your config **:80** → backend status **UP**

```powershell
# From deploy/miami-provision.state.json — tempSslipDomain
curl http://YOUR-NB-IP-DASHES.sslip.io/api/health
```

### 4. Google OAuth

Add callback URLs for the new temp domain — see [GOOGLE_OAUTH_REDIRECT_URIS.md](./GOOGLE_OAUTH_REDIRECT_URIS.md)

```powershell
.\deploy\sync-linode-env.ps1 -Remote root@MIAMI_LINODE_PUBLIC_IP -TempDomain "172-xxx-xxx-xxx.sslip.io"
```

### 5. DNS cutover (when ready)

Point **www.hmherbs.com** A record → **NodeBalancer IPv4** (from state file), not the Linode IP.

```bash
# On Miami Linode after DNS points here
sudo bash deploy/setup-nginx-ssl.sh www.hmherbs.com www.hmherbs.com
```

Add NodeBalancer **443 → Linode :443** config after cert exists.

### 6. Retire Atlanta

**Done (2026-06-30):** Atlanta Linode and Managed MySQL were deleted. Production is Miami only.

---

## Architecture (Miami)

```text
Internet → NodeBalancer (Miami, $10/mo)
              ↓  private IP :80
         Linode 2 GB (Miami)
              ↓  SSL
         Managed MySQL (Miami)
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend node DOWN | `ssh root@LINODE_IP` → `curl -s http://127.0.0.1/api/health` → fix PM2/Nginx |
| DB import fails | Add home IP + Linode IP to MySQL Access Controls |
| No private IP after provision | Cloud Manager → Linode → Network → Add **Private IPv4**, re-run attach or provision |
| `LINODE_TOKEN` missing | Create token; only needed once for provision |

---

## Manual provision (no API token)

1. Miami: create Linode 2 GB Ubuntu 22.04, add **Private IPv4**
2. Miami: create NodeBalancer, config :80, backend = **private IP:80**
3. Write `deploy/miami-provision.state.json`:

```json
{
  "linodePublic": "203.0.113.10",
  "nodeBalancerIpv4": "203.0.113.20",
  "tempSslipDomain": "203-0-113-20.sslip.io"
}
```

4. `.\deploy\migrate-to-miami.ps1 -DeployOnly`

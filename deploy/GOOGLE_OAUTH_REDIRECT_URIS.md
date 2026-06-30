# Google OAuth redirect URIs — Linode temp site and hmherbs.com

Google sign-in (storefront, admin staff, Google Business Profile, Google Calendar) uses one OAuth client (`GBP_CLIENT_ID` / `GBP_CLIENT_SECRET` in `backend/.env`).

**OAuth client project number:** `266596824943`  
**Console:** [Google Cloud → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → your **Web client** → **Authorized redirect URIs**

Add **every** URI below that you plan to use. Google requires an exact match (scheme, host, path — no trailing slash).

---

## Required now — Miami Linode (`172-238-208-164.sslip.io`)

Atlanta (`139-177-204-216.sslip.io`) is **decommissioned**. Add these for **Continue with Google** on Miami:

```
https://172-238-208-164.sslip.io/api/auth/google/callback
https://172-238-208-164.sslip.io/api/admin/auth/google/callback
https://172-238-208-164.sslip.io/api/admin/settings/google-business/callback
https://172-238-208-164.sslip.io/api/admin/settings/google-calendar/callback
```

You may **remove** the old Atlanta URIs from Google Console if they are still listed.

These match `backend/.env` on Linode (set by `deploy/sync-linode-env.ps1`):

| Env variable | Callback path |
|--------------|---------------|
| `CUSTOMER_GOOGLE_REDIRECT_URI` | `/api/auth/google/callback` |
| `ADMIN_GOOGLE_REDIRECT_URI` | `/api/admin/auth/google/callback` |
| `GBP_REDIRECT_URI` | `/api/admin/settings/google-business/callback` |
| `GCAL_REDIRECT_URI` | `/api/admin/settings/google-calendar/callback` |

### Verify temp site (after saving URIs in Google Console)

```bash
# API reports Google configured
curl -s http://172-238-208-164.sslip.io/api/admin/auth/google/status
# → {"google":{"enabled":true,"reason":null}}

# OAuth start redirects to accounts.google.com (not redirect_uri_mismatch)
curl -sI "http://172-238-208-164.sslip.io/api/admin/auth/google/start?returnTo=/admin.html" | grep -i location
```

In the browser:

1. Open http://172-238-208-164.sslip.io/admin.html  
2. **Continue with Google** should appear on the login form.  
3. Click it — you should get Google’s account picker (not “Access blocked: invalid request”).  
4. If the app is in **Testing** mode, the Google account must be listed under **OAuth consent screen → Test users** (e.g. `hmherbs1@gmail.com`).

Storefront: http://172-238-208-164.sslip.io/ → Sign in / Create account → **Continue with Google**.

---

## Add before production cutover — `hmherbs.com`

When DNS points to Linode, add these **in addition to** (or instead of) the temp URIs:

```
https://www.hmherbs.com/api/auth/google/callback
https://www.hmherbs.com/api/admin/auth/google/callback
https://www.hmherbs.com/api/admin/settings/google-business/callback
https://www.hmherbs.com/api/admin/settings/google-calendar/callback
```

If you also serve apex or non-www:

```
https://hmherbs.com/api/auth/google/callback
https://hmherbs.com/api/admin/auth/google/callback
https://hmherbs.com/api/admin/settings/google-business/callback
https://hmherbs.com/api/admin/settings/google-calendar/callback
```

Then on the server:

```powershell
# From repo root on your PC
.\deploy\sync-linode-env.ps1 -TempDomain www.hmherbs.com
```

Or edit `backend/.env` on Linode:

```env
FRONTEND_URL=https://www.hmherbs.com
STOREFRONT_PUBLIC_URL=https://www.hmherbs.com
PRODUCTION_DOMAIN=www.hmherbs.com
ADMIN_APP_URL=https://www.hmherbs.com/admin.html
CUSTOMER_GOOGLE_REDIRECT_URI=https://www.hmherbs.com/api/auth/google/callback
ADMIN_GOOGLE_REDIRECT_URI=https://www.hmherbs.com/api/admin/auth/google/callback
GBP_REDIRECT_URI=https://www.hmherbs.com/api/admin/settings/google-business/callback
GCAL_REDIRECT_URI=https://www.hmherbs.com/api/admin/settings/google-calendar/callback
```

Restart: `pm2 restart hmherbs-api --update-env`

---

## Optional — underwriting subdomain (`go.hmherbs.com`)

If you use `go.hmherbs.com` on the same Linode IP:

```
https://go.hmherbs.com/api/auth/google/callback
https://go.hmherbs.com/api/admin/auth/google/callback
https://go.hmherbs.com/api/admin/settings/google-business/callback
https://go.hmherbs.com/api/admin/settings/google-calendar/callback
```

Run `deploy/setup-go-hmherbs-linode.sh` on the server and re-run `sync-linode-env.ps1 -TempDomain go.hmherbs.com`.

---

## Local development (keep these on the same OAuth client)

```
http://127.0.0.1:3001/api/auth/google/callback
http://127.0.0.1:3001/api/admin/auth/google/callback
http://127.0.0.1:3001/api/admin/settings/google-business/callback
http://127.0.0.1:3001/api/admin/settings/google-calendar/callback
http://localhost:3001/api/auth/google/callback
http://localhost:3001/api/admin/auth/google/callback
http://localhost:3001/api/admin/settings/google-business/callback
http://localhost:3001/api/admin/settings/google-calendar/callback
```

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| No **Continue with Google** button | `GBP_CLIENT_ID` / `GBP_CLIENT_SECRET` missing on server. Run `.\deploy\sync-linode-env.ps1`. |
| Google: **redirect_uri_mismatch** | Add the exact callback URL from the error to **Authorized redirect URIs** (see tables above). |
| Google: **Access blocked** / app not verified | Add your email under **OAuth consent screen → Test users** while app is in Testing mode. |
| Admin Google works locally but not on Linode | Linode `.env` must use the **sslip.io or hmherbs.com** redirect URIs, not `localhost`. |

See also: [../GOOGLE_BUSINESS_PROFILE_SETUP.md](../GOOGLE_BUSINESS_PROFILE_SETUP.md) for Business Profile API approval (separate from sign-in).

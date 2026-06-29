# Business One platform — SiteGround + Linode (Option A)

Marketing stays on **SiteGround**. Public POS signup runs on **Linode** at a subdomain. Merchants like HM Herbs get their **own** Linode + database (see `LINODE_DEPLOY.md`).

## Architecture

```text
businessonecomprehensive.com     → SiteGround (static marketing)
signup.businessonecomprehensive.com → Linode platform (Node + signup.html)
hmherbs.com                       → Linode merchant (separate server)
```

SiteGround pages link to signup with a normal `<a href>` — no CORS or API calls from SiteGround required.

## 1. Linode platform server

Create **one Linode** (2 GB RAM, Ubuntu 22.04) for the Business One platform — **not** the HM Herbs store.

1. Deploy this repo (same steps as `LINODE_DEPLOY.md`: Nginx, Node, PM2).
2. Use a **small Managed MySQL** cluster for signup intake (`pos_signup_requests` table).
3. Copy `backend/.env.linode.example` → `backend/.env` and set:

| Variable | Example |
|----------|---------|
| `FRONTEND_URL` | `https://signup.businessonecomprehensive.com` |
| `STOREFRONT_PUBLIC_URL` | `https://signup.businessonecomprehensive.com` |
| `BUSINESS_ONE_SIGNUP_NOTIFY_EMAIL` | Your ISO inbox |
| `SMTP_*` | So signup emails send |

4. Optional platform billing keys: `EPI_PLATFORM_*` (for future card-on-file during signup).

## 2. DNS

At SiteGround (or your registrar):

| Type | Name | Value |
|------|------|--------|
| A | `@` | SiteGround IP (unchanged) |
| A or CNAME | `www` | SiteGround (unchanged) |
| A | `signup` | **Linode NodeBalancer IP** |

Wait for DNS, then HTTPS:

```bash
sudo bash deploy/setup-nginx-ssl.sh signup.businessonecomprehensive.com
```

## 3. Nginx — signup as homepage (optional)

In your platform site config, redirect `/` to signup:

```nginx
location = / {
    return 302 /signup.html;
}
```

Then `https://signup.businessonecomprehensive.com/` opens the form directly.

## 4. SiteGround marketing site

Upload or sync these files to SiteGround:

- `business-one-menu.html` (or your live homepage)
- `business-one-menu.css`, `business-one-menu.js`
- `business-one-privacy-policy.html`
- `images/business-one/*`

**Signup button** — already in `business-one-menu.html`:

```html
<a href="https://signup.businessonecomprehensive.com/signup.html"
   class="btn btn-primary" data-pos-signup-link rel="noopener">
   Sign up for POS
</a>
```

To change the URL without editing every button, update the meta tag in `<head>`:

```html
<meta name="business-one-pos-signup-url"
      content="https://signup.businessonecomprehensive.com/signup.html">
```

`business-one-menu.js` applies that URL to all `[data-pos-signup-link]` elements on load.

## 5. Verify

```bash
curl -s "https://signup.businessonecomprehensive.com/api/pos-billing/pricing?stations=2"
curl -s -X POST "https://signup.businessonecomprehensive.com/api/pos-billing/signup-intake" \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Test Store","contactName":"Jane","email":"test@example.com","stationCount":2}'
```

Open `https://signup.businessonecomprehensive.com/signup.html` in a browser and submit a test request. Check email and the `pos_signup_requests` table.

## 6. HM Herbs (client store)

Deploy **separately** per `LINODE_DEPLOY.md`. Do not point `hmherbs.com` at the platform Linode unless you intentionally combine them (not recommended).

Existing HM Herbs POS billing stays in **Admin → Point of Sale → License**. Public signup is for **new** merchants only.

## Files added for signup

| File | Purpose |
|------|---------|
| `signup.html` | Public signup form |
| `css/pos-signup.css` | Signup page styles |
| `js/pos-signup.js` | Form + `/api/pos-billing/signup-intake` |
| `backend/routes/pos-billing.js` | `POST /signup-intake` |
| `backend/services/posSignupIntake.js` | Save + email ISO |

## Local testing

```bash
cd backend && npm start
# Open http://localhost:3001/signup.html
```

For SiteGround preview locally, open `business-one-menu.html` — hero button points at production signup URL; change the meta tag to `http://localhost:3001/signup.html` while testing.

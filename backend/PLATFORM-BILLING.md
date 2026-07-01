# Business One Platform Billing (ProCharge)

**Business One bills merchants** (you collect revenue). **HM Herbs is a merchant store** — it does not own this billing UI.

| What | Where |
|------|--------|
| **Billing UI** (ProCharge card form, statement) | `business-one-webpage` → `billing-portal.html` on **businessonecomprehensive.com** |
| **Public signup** | `business-one-webpage/pos-signup.html` |
| **Billing API** (today) | Hub backend — deploy on **signup.businessonecomprehensive.com** Linode, not hmherbs.com |
| **HM Herbs admin** | License tab links out to Business One billing portal only |

ProCharge styles use `business-one-webpage/css/platform-billing.css` (orange `btn-primary`, contact-form inputs) — **not** HM Herbs admin CSS.

## Payment processors (clarified)

| Flow | Processor |
|------|-----------|
| **Merchants → Business One** (POS fee, hosting, internet, hardware) | **ProCharge** (your EPI ISO platform MID) |
| **Customers → standard merchant** | **EPI** (merchant’s ISO keys) |
| **Customers → high-risk merchant** | **Durango / NMI** for **all** that merchant’s card volume — not per-product |

Platform billing never uses NMI/Durango.

## Environment (`backend/.env` on the **Business One billing hub**, not store `.env`)

```env
PROCHARGE_SANDBOX=1
PROCHARGE_APPLICATION_KEY=
PROCHARGE_EMAIL=
PROCHARGE_PASSWORD=
PROCHARGE_PIN=
PROCHARGE_MERCHANT_NUMBER=

# CardPointe hosted iFrame — card/ACH tokenized in the browser (recommended)
PROCHARGE_HOSTED_TOKENIZER_HOST=fts-uat.cardconnect.com
PROCHARGE_REQUIRE_HOSTED_FIELDS=true

BILLING_DRY_RUN=true
BILLING_SCHEDULER_ENABLED=false
BILLING_PORTAL_URL=https://businessonecomprehensive.com/billing-portal.html
BILLING_PORTAL_ALLOW_OPEN_SETUP=false
BUSINESS_ONE_POS_SIGNUP_ENABLED=false
```

When `PROCHARGE_HOSTED_TOKENIZER_HOST` (or `PROCHARGE_HOSTED_TOKENIZER_URL`) is set, signup, billing portal, and HM Herbs admin billing load the CardPointe iframe. The API accepts **`payment_token` only** — raw PAN/routing numbers are rejected.

`GET /api/platform/billing/client-config` and `GET /api/business-one/pos/client-config` return `hostedFields.cardTokenizerUrl`, `hostedFields.achTokenizerUrl`, and `hostedFields.messageOrigin` for the browser widget (`js/procharge-hosted.js`).

UAT iframe host: `fts-uat.cardconnect.com`. Production: `fts.cardconnect.com` (or the site EPI assigns).

Point `business-one-webpage` pages at the hub API:

```html
<meta name="business-one-api-origin" content="https://signup.businessonecomprehensive.com">
```

## API routes (hub server)

- `GET /api/platform/billing/account` — statement
- `POST /api/platform/billing/setup` — save ProCharge payment method
- `PUT /api/platform/billing/subscriptions/:type` — hosting / internet / POS config
- `POST /api/business-one/pos/signup` — public signup
- `GET /api/business-one/pos/hardware` — WTI modems for public signup (pay-in-full)

## HM Herbs / principal account rates

Public signup always shows standard list pricing. The **default** billing account (HM Herbs) uses fixed overrides set in the database — not on the signup form:

```env
BILLING_PRINCIPAL_ACCOUNT_KEY=default
BILLING_PRINCIPAL_POS_MONTHLY=100
BILLING_PRINCIPAL_HOSTING_MONTHLY=200
```

Applied on server startup via `syncPrincipalAccountRates`. Admins can also set `monthlyAmountOverride` with `PUT /api/platform/billing/subscriptions/:type` (JWT required).

### HM Herbs in-admin billing

The principal merchant (HM Herbs) manages billing on the **POS License** tab in store admin — not the public portal:

- Monthly statement (custom $100 POS + $200 hosting overrides)
- Save ProCharge card inline (`POST /api/platform/billing/setup` with admin JWT)
- Order WTI modem with ship-to (`POST /api/platform/billing/hardware/purchase`)
- Optional website build balance — pay in full or 3–12 month installments (`GET/POST /api/platform/billing/principal*`)

Build balance defaults (env, seeded once into `billing_accounts.principal_meta_json`):

```env
BILLING_PRINCIPAL_BUILD_FULL=10000
BILLING_PRINCIPAL_BUILD_PAID=5000
BILLING_PRINCIPAL_BUILD_REMAINING=5000
```

Everyone else uses `business-one-webpage/billing-portal.html`.

### Failover data metering

Failover usage is **never entered manually** on any account. Each `billing_accounts` row has its own meter for the billing period.

**Billing rule (all accounts):** POS subscription line is stations only. Failover overage is always a separate `failover_overage` usage line ($10/GB over 2 GB included) and is included in the automatic monthly charge.

Sources:

- **WTI modem / cloud** — `POST /api/platform/billing/failover/ingest` with optional `accountKey` / `accountId`, header `x-failover-ingest-secret`, body `{ "bytesUsed": 3500000000 }`
- **POS registers** — `PUT /api/pos/v1/failover/usage` with `{ "bytesDelta": 12345 }` (resolves the store billing account automatically)

The scheduler runs `processAllAccountsMaintenance`, which syncs failover for **every active billing account** before charging. Usage resets per account after a successful charge.

## WTI hardware

**Required with every POS signup** — customer chooses standard or premium; card charged once at signup (subtotal + sales tax).

| SKU | Name | Subtotal | Total @ 7.5% tax |
|-----|------|----------|------------------|
| `wti-6500` | Standard setup modem (WTI 6500) | $250 | $268.75 |
| `wti-5419` | Premium setup modem (WTI 5419) | $500 | $537.50 |

Tax rate: `BILLING_HARDWARE_SALES_TAX_RATE` (default `0.075`). ACH is not accepted at signup when a router is due today. Orders stored in `billing_hardware_orders` with ship-to for fulfillment.

## Local files

| File | Purpose |
|------|---------|
| `business-one-webpage/billing-portal.html` | Merchant billing portal |
| `business-one-webpage/css/platform-billing.css` | ProCharge form + button styling |
| `business-one-webpage/js/billing-portal.js` | Portal client |
| `business-one-webpage/js/procharge-hosted.js` | CardPointe hosted iframe widget |
| `hmherbs-main/js/procharge-hosted.js` | Same widget for HM Herbs admin billing |
| `hmherbs-main/backend/services/*` | Billing engine (run on hub when split) |

## Going live

1. Deploy hub API to `signup.businessonecomprehensive.com` with ProCharge credentials
2. Upload `business-one-webpage` billing portal to SiteGround
3. Set `meta business-one-api-origin` to the hub URL
4. `BILLING_DRY_RUN=false` and `BILLING_SCHEDULER_ENABLED=true` on the hub
5. Set `BILLING_FAILOVER_INGEST_SECRET` and point the WTI cloud portal (or modem webhook) at the ingest URL

### Failover usage ingest (modem / WTI cloud)

Registers on cellular report through the POS app. **Modem failover** (when the store path does not hit registers) meters through this webhook:

```
POST https://YOUR-HUB/api/platform/billing/failover/ingest
Header: x-failover-ingest-secret: <BILLING_FAILOVER_INGEST_SECRET>
Content-Type: application/json

{ "bytesUsed": 3500000000 }
```

Optional multi-tenant fields: `accountKey`, `accountId`, `bytesDelta`, `source` (default `modem`).

After a hard refresh of admin, the manual failover GB box is gone — usage appears read-only on the license summary.

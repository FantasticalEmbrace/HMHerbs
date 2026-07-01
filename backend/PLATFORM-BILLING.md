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

BILLING_DRY_RUN=true
BILLING_SCHEDULER_ENABLED=false
BILLING_PORTAL_URL=https://businessonecomprehensive.com/billing-portal.html
BILLING_PORTAL_ALLOW_OPEN_SETUP=false
BUSINESS_ONE_POS_SIGNUP_ENABLED=false
```

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
| `hmherbs-main/backend/services/*` | Billing engine (run on hub when split) |

## Going live

1. Deploy hub API to `signup.businessonecomprehensive.com` with ProCharge credentials
2. Upload `business-one-webpage` billing portal to SiteGround
3. Set `meta business-one-api-origin` to the hub URL
4. `BILLING_DRY_RUN=false` and `BILLING_SCHEDULER_ENABLED=true` on the hub

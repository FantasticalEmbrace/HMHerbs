# Business One Support Desk (Windows)

One place for **all** merchant POS help requests. Technicians do **not** log into each customer's store admin.

## Windows installer (recommended for technicians)

Build a normal Windows setup program:

```bat
cd support-desk
build-installer.bat
```

Output: `dist\Business One Support Desk.exe`

Technicians double-click Setup, choose install location, get Start Menu + desktop shortcuts, and uninstall via **Settings → Apps**.

After install, copy `hub-url.example.txt` → `hub-url.txt` in the install folder and set your hub URL (e.g. `https://support.yourbusinessone.com`).

See **[INSTALLER.md](INSTALLER.md)** for:
- **Code signing** (removes SmartScreen / Defender warnings — requires a purchased CA certificate)
- **Firewall** rule added automatically on install
- Unsigned dev builds

## Quick dev test

```bat
cd support-desk
npm install
npm start
```

## Technician workflow

1. Install **Business One Support Desk** from the Setup.exe.
2. Sign in with your **Support Desk** account (`PLATFORM_SUPPORT_TECH_EMAIL` on the hub server).
3. Leave the desk open. When any register taps **Request remote assistance**, it appears under **Waiting for technician**.
4. Click **Connect screen** → cashier allows screen share → viewer opens.

## Server setup (one hub for all customers)

**On your Business One support server:**

```env
POS_PLATFORM_HUB_ENABLED=true
POS_PLATFORM_HUB_SECRET=<long-random-shared-secret>
PLATFORM_SUPPORT_TECH_EMAIL=you@businessone.com
PLATFORM_SUPPORT_TECH_PASSWORD=<strong-password>
PLATFORM_SUPPORT_HUB_TITLE=Business One Support Desk
```

**On each merchant store:**

```env
POS_PLATFORM_HUB_URL=https://support.businessone.com
POS_PLATFORM_HUB_SECRET=<same-secret-as-hub>
POS_PLATFORM_MERCHANT_ID=unique-store-id
POS_PLATFORM_STORE_URL=https://that-store.com
```

## Local development

```env
POS_PLATFORM_HUB_ENABLED=true
POS_PLATFORM_HUB_URL=http://127.0.0.1:3001
POS_PLATFORM_HUB_SECRET=dev-hub-secret
POS_PLATFORM_MERCHANT_ID=hmherbs-dev
POS_PLATFORM_STORE_URL=http://127.0.0.1:3001
PLATFORM_SUPPORT_TECH_EMAIL=support@local.test
PLATFORM_SUPPORT_TECH_PASSWORD=dev-support
```

Set `hub-url.txt` to `http://127.0.0.1:3001` beside the installed app, or use the hub URL field on sign-in.

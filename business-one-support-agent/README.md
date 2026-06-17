# Business One Support Agent

Windows client for **remote support** on register PCs. Installs **RustDesk**, registers the machine with your store API, and sends periodic heartbeats so admins can connect from **Admin → POS → Remote support**.

## Architecture

| Piece | Role |
| :--- | :--- |
| **Windows Support Agent** (`business-one-support-agent/`) | Runs on each register PC — installs RustDesk and registers with the store API |
| **RustDesk** | Remote desktop (like TeamViewer) |
| **Store backend** | Tracks online PCs, RustDesk IDs, encrypted passwords |
| **Admin → POS → Remote support** | List of PCs with **Connect** — copy ID/password or open browser viewer |

## Setup (3 steps)

### 1. Configure the server

In `backend/.env`:

```env
POS_SUPPORT_ENROLL_KEY=your-long-random-enroll-key
POS_SUPPORT_SECRET=optional-separate-encryption-key
```

For a **self-hosted RustDesk server**, also set (from your RustDesk web console):

```env
RUSTDESK_CONFIG_STRING=your-exported-config-string
RUSTDESK_WEB_CLIENT_URL=https://rustdesk.yourdomain.com
```

Restart the backend. In **Admin → POS → Remote support** you should see “Support enrollment is configured.”

### 2. Install on each register PC

Open **https://your-store/support-agent/** in a browser on the Windows PC, fill in the enrollment key, and copy the PowerShell command.

Or run locally (as Administrator):

```powershell
cd path\to\business-one-support-agent
.\install.ps1 -StoreUrl "https://your-store.com" -EnrollKey "your-enroll-key" -MachineLabel "Register 1"
```

The installer will:

- Download and silently install RustDesk (if missing)
- Apply `RUSTDESK_CONFIG_STRING` when configured
- Set a permanent RustDesk password
- Register with `POST /api/pos-support/v1/register`
- Create scheduled task `BusinessOneSupportAgent` for heartbeats

Config is stored at `%ProgramData%\BusinessOne\SupportAgent\config.json`.

### 3. Connect from admin

1. Go to **Admin → POS → Remote support**
2. Find the PC (green **Online** when heartbeats are recent)
3. Click **Connect**
4. Copy RustDesk ID/password, click **Open RustDesk**, or **Open in browser** (if `RUSTDESK_WEB_CLIENT_URL` is set)

## API (agent)

| Endpoint | Auth | Purpose |
| :--- | :--- | :--- |
| `GET /api/pos-support/v1/config` | none | Enrollment status, RustDesk settings |
| `POST /api/pos-support/v1/register` | `x-pos-support-enroll` | First-time registration |
| `POST /api/pos-support/v1/heartbeat` | `x-pos-support-key` | Keep-alive + ID/password sync |

## Uninstall

```powershell
.\uninstall.ps1
```

Removes the scheduled task and local agent config. RustDesk stays installed.

## Troubleshooting

- **PC not online** — Check scheduled task `BusinessOneSupportAgent` and log `%ProgramData%\BusinessOne\SupportAgent\agent.log`
- **No RustDesk ID** — Open RustDesk once manually, then re-run `install.ps1`
- **Password missing in admin** — Ensure `POS_SUPPORT_SECRET` or `JWT_SECRET` is set and stable (changing it invalidates stored passwords)

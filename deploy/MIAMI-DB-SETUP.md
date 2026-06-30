# Miami Managed MySQL — create form (exact settings)

Use this while creating the database cluster in Cloud Manager.

## Plan

| Field | Value |
|--------|--------|
| Cluster label | `hmherbs` |
| Engine | MySQL v8.4 |
| Region | **Miami, FL** |
| Plan | **Linode 2 GB** ($32/mo) |

## Set number of nodes

| Option | Use for HM Herbs launch? |
|--------|-------------------------|
| **1 Node** | **Yes** — fine for Monday launch and early production |
| 3 Nodes HA | Optional later; doubles+ cost ($74/mo) — skip unless you need HA on day one |

## Configure networking → Manage access

Choose **Specific access (recommended)**.

**Allowed IP addresses** — add each on its own line (use **Add an IP**):

1. **Your home/office public IPv4** — so you can import SQL from your PC  
   Find it: https://ifconfig.me or `curl ifconfig.me`
2. **Your IPv6** (if you use it) — OK to keep what’s already in the box
3. **Miami app Linode public IPv4** — add **after** `provision-miami.ps1` creates the server  
   (Cloud Manager → Linode → Networking → IPv4)

Do **not** leave only IPv6 if your PC or Linode connects over IPv4 — imports and the API will fail with “connection refused” or access denied.

**No access** — do not select.

## Assign a VPC

**Recommended for Miami (do not skip).** Atlanta had no VPC/private IP; Miami uses **VPC for NodeBalancer backends** and Managed MySQL.

**Prerequisite:** Create VPC in Miami first — see [MIAMI-VPC-SETUP.md](./MIAMI-VPC-SETUP.md).

| Field | Value |
|--------|--------|
| **VPC** | `hmherbs-mia` (your Miami VPC) |
| **Subnet** | e.g. `10.0.1.0/24` |
| **Enable public access** | **Yes** during migration (import from PC + troubleshooting); tighten after launch |

If the VPC dropdown is empty, you created the DB **before** the VPC — create VPC first, or assign VPC on the cluster **Networking** tab after.

## After cluster is running

1. Create database: **`hmherbs`**
2. Create user with full rights on `hmherbs`
3. Download **CA certificate**
4. Update `deploy/db-connection.env`
5. Run `.\deploy\migrate-to-miami.ps1`

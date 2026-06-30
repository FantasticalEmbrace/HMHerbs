# Miami VPC-first setup (recommended)

Atlanta failed because it has **no VPC and no private IP**. Miami supports **VPC**, and Akamai’s current UI/API is oriented toward **VPC backends for NodeBalancer** and **VPC for Managed MySQL** (beta).

Do **not** rely on legacy datacenter private IP for new stacks. Use this order.

---

## 1. Create VPC (Miami) — do this first

Cloud Manager → **VPC** → **Create VPC**

| Field | Suggested value |
|--------|------------------|
| Region | **Miami, FL** |
| VPC label | `hmherbs-mia` |
| Subnet label | `hmherbs-app` |
| Subnet CIDR | `10.0.1.0/24` |

---

## 2. Managed MySQL (2 GB, Miami)

| Field | Value |
|--------|--------|
| Region | Miami |
| Plan | Linode 2 GB |
| Nodes | 1 (launch) |
| **Assign VPC** | Select `hmherbs-mia` → subnet `hmherbs-app` |
| **Enable public access** | **Yes** for now — so you can import SQL from your PC and use public hostname during migration |
| Manage access | Your home **IPv4** + Miami Linode **public** IPv4 (after Linode exists) |

Database name: **`hmherbs`**

After cutover you can tighten access (public access off, DB only reachable inside VPC).

---

## 3. Create Linode (Miami, in VPC)

Cloud Manager → **Linodes** → **Create**

| Field | Value |
|--------|--------|
| Region | Miami |
| Plan | Linode 2 GB |
| Image | Ubuntu 22.04 |
| **VPC** | `hmherbs-mia` / subnet `10.0.1.0/24` |
| **Public internet** | **Enable** (1:1 NAT or public interface) — needed for SSH, Managed MySQL public hostname, outbound NMI/email |

Note the Linode’s **VPC private IP** (e.g. `10.0.1.x`) and **public IPv4**.

Add **public IPv4** to MySQL allow list if using public DB hostname.

---

## 4. Create NodeBalancer (Miami) — VPC at create time

**Important:** VPC on NodeBalancer must be set **when created** (hard to add later).

| Field | Value |
|--------|--------|
| Region | Miami |
| **VPC** | `hmherbs-mia` |
| **Subnet** | `hmherbs-app` |
| Auto-assign IPs | **Enabled** |
| Config | Port **80**, HTTP, health check `/api/health` |
| **Backend** | Linode **VPC IP** (e.g. `10.0.1.x:80`) — dropdown should list VPC addresses |

DNS (launch): A record → **NodeBalancer public IP** (not Linode public IP).

---

## 5. Deploy app

```powershell
cd "C:\Users\donal\Desktop\Web SItes\hmherbs-main"
# Save state manually or use API — see MIAMI-MIGRATION.md
.\deploy\migrate-to-miami.ps1 -DeployOnly
```

Use `deploy/db-connection.env` with Miami MySQL **connection details** (public or private hostname per panel).

---

## Why this vs “skip VPC”

| Topic | Legacy private IP | VPC (Miami) |
|--------|-------------------|-------------|
| Atlanta | Not available | Not available |
| Miami new accounts | May not appear in UI | **Supported** |
| NodeBalancer backend | Old datacenter private network | **VPC subnet IP** |
| Managed MySQL | Public allow list only | **Private in VPC** + optional public for migration |
| Monday launch | Risky if UI blocks private IP | **Matches what Akamai expects now** |

---

## Connection summary

```text
Internet → NodeBalancer (public, VPC-attached)
              ↓ VPC
         Linode 10.0.1.x (Nginx :80)
              ↓ public hostname or VPC private hostname
         Managed MySQL (same VPC)
```

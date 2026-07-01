# Business One — four-tier web hosting pricing

Managed e-commerce hosting for Business One website clients. **Month-to-month** — see `hmherbs-main/scripts/generate_hosting_agreement_pdf.py` for the fillable agreement PDF.

POS register fees are **billed separately** (`POS-PRICING.md`).

## Standard e-commerce rates

| Tier | Plan | Monthly | Traffic / bandwidth (whichever hits first) | Infrastructure |
|------|------|---------|---------------------------------------------|----------------|
| **1** | **Standard** | **$400/mo** | Up to 100,000 visits/mo or 200 GB/mo | 1× 2 GB Linode, NodeBalancer, Managed MySQL (entry), SSL, backups |
| **2** | **Growth** | **$550/mo** | 100,001–250,000 visits or 201–500 GB | 4 GB Linode, Akamai CDN, same NodeBalancer |
| **3** | **Performance** | **$700/mo** | 250,001–500,000 visits or 501 GB–1 TB | 4 GB + 2nd app node, CDN, enhanced monitoring |
| **4** | **Enterprise** | **$850/mo** | 500,001+ visits or 1 TB+ | Dual app nodes, larger DB tier, full CDN, priority peak support |

Each tier step is **+$150/mo**.

## Legacy / principal rate (e.g. HM Herbs)

Same tiers and limits, **$150 less per tier**:

| Tier | Plan | Monthly |
|------|------|---------|
| 1 | Standard | **$200/mo** |
| 2 | Growth | **$350/mo** |
| 3 | Performance | **$500/mo** |
| 4 | Enterprise | **$650/mo** |

## Tier change rules

- **Upgrade:** Client exceeds the current tier for **2 consecutive calendar months**.
- **Notice:** Business One gives **30 days** written notice before the new rate applies.
- **Downgrade (optional):** Client stays below a tier for **3 consecutive months**.
- **Measurement:** Google Analytics 4 visits **or** Akamai/Linode outbound bandwidth — **whichever is higher**.

## What's included (all tiers)

- Website hosting & server management
- SSL certificate
- Scheduled backups
- Security monitoring
- Technical support during business hours
- Website maintenance (updates & upkeep) per agreement

## Where this appears

- **Marketing site:** `index.html`, `#web-hosting-pricing`, Website Development service modal
- **Agreement PDF:** `hmherbs-main/scripts/generate_hosting_agreement_pdf.py`
- **This file:** `HOSTING-PRICING.md`

## Related files

| File | Purpose |
|------|---------|
| `js/web-hosting-pricing-tiers.js` | Renders tier cards on the Business One website |
| `css/web-hosting-pricing-tiers.css` | Tier card styles |
| `js/pos-pricing-tiers.js` | **POS** register pricing (separate product) |

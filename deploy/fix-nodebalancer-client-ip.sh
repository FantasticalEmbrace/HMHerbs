#!/usr/bin/env bash
# Fix 429 Too Many Requests when traffic enters via Linode NodeBalancer on TCP/443.
set -euo pipefail

python3 /var/www/hmherbs/deploy/patch-nginx-realip.py 2>/dev/null || python3 "$(dirname "$0")/patch-nginx-realip.py"
nginx -t
systemctl reload nginx
pm2 restart hmherbs-api --update-env
echo "Done. Ensure NodeBalancer port 443 has proxy_protocol v1 (deploy/enable-nodebalancer-proxy-protocol.ps1)."

#!/bin/bash
# Add signup.businessonecomprehensive.com to Nginx + Let's Encrypt on the HM Herbs hub.
# Requires DNS: signup.businessonecomprehensive.com -> NodeBalancer IP (172.238.208.164).
set -euo pipefail

DOMAIN="signup.businessonecomprehensive.com"
SITE="/etc/nginx/sites-enabled/hmherbs"
EMAIL="${CERTBOT_EMAIL:-info@businessonecomprehensive.com}"

if [[ ! -f "$SITE" ]]; then
  echo "Nginx site not found: $SITE" >&2
  exit 1
fi

python3 << 'PY'
from pathlib import Path
import re

site = Path("/etc/nginx/sites-enabled/hmherbs")
text = site.read_text()
domain = "signup.businessonecomprehensive.com"

for block in ("server_name",):
    pass

def add_domain(match):
    names = match.group(1)
    if domain in names:
        return match.group(0)
    return f"server_name {names} {domain};"

text2 = re.sub(
    r"server_name\s+([^;]+);",
    add_domain,
    text,
    count=0,
)
if text2 == text:
    print("signup domain already in server_name")
else:
    site.write_text(text2)
    print("added signup.businessonecomprehensive.com to server_name")
PY

nginx -t
systemctl reload nginx

if certbot certificates 2>/dev/null | grep -q "$DOMAIN"; then
  echo "Certificate already exists for $DOMAIN"
  certbot renew --quiet || true
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
fi

nginx -t
systemctl reload nginx

echo "OK: https://$DOMAIN/api/health"

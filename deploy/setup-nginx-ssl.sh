#!/usr/bin/env bash
# Configure Nginx server_name and obtain Let's Encrypt certificate.
#
# Usage:
#   sudo bash deploy/setup-nginx-ssl.sh your-domain.com [www.your-domain.com]
#
set -euo pipefail

DOMAIN="${1:-}"
WWW="${2:-www.$DOMAIN}"
APP_DIR="${APP_DIR:-/var/www/hmherbs}"
NGINX_SITE="/etc/nginx/sites-available/hmherbs"

if [[ -z "$DOMAIN" ]]; then
    echo "Usage: sudo $0 your-domain.com [www.your-domain.com]"
    exit 1
fi

if [[ ! -f "$NGINX_SITE" ]]; then
    sed "s|your-domain.com|$DOMAIN|g; s|www.your-domain.com|$WWW|g; s|/var/www/hmherbs|$APP_DIR|g" \
        "$APP_DIR/deploy/nginx/hmherbs.conf.example" > "$NGINX_SITE"
    ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/hmherbs
    rm -f /etc/nginx/sites-enabled/default
else
    sed -i "s/server_name .*/server_name $DOMAIN $WWW;/" "$NGINX_SITE"
fi

nginx -t
systemctl reload nginx

echo "==> Requesting certificate for $DOMAIN and $WWW ..."
certbot --nginx -d "$DOMAIN" -d "$WWW" --non-interactive --agree-tos -m "admin@$DOMAIN" || \
    certbot --nginx -d "$DOMAIN" -d "$WWW"

echo "HTTPS enabled. Test: https://$DOMAIN/api/products?limit=1"

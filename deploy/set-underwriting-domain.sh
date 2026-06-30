#!/bin/bash
# Set Linode underwriting temp hostname (no external DNS setup required).
set -euo pipefail

TEMP_DOMAIN="${1:-172-238-208-164.sslip.io}"
APP_DIR="${APP_DIR:-/var/www/hmherbs}"
ENV="$APP_DIR/backend/.env"

cd "$APP_DIR"

for kv in \
  "FRONTEND_URL=http://${TEMP_DOMAIN}" \
  "STOREFRONT_PUBLIC_URL=http://${TEMP_DOMAIN}" \
  "PRODUCTION_DOMAIN=${TEMP_DOMAIN}" \
  "ADMIN_APP_URL=http://${TEMP_DOMAIN}/admin.html"
do
  key="${kv%%=*}"
  if grep -q "^${key}=" "$ENV"; then
    sed -i "s|^${key}=.*|${kv}|" "$ENV"
  else
    echo "$kv" >> "$ENV"
  fi
done
grep -q "^STAGING_BLOCK_INDEXING=" "$ENV" || echo "STAGING_BLOCK_INDEXING=true" >> "$ENV"

cat > /etc/nginx/sites-available/hmherbs << NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${TEMP_DOMAIN} 172.238.208.164 _;

    root ${APP_DIR};
    index index.html;
    client_max_body_size 10M;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias ${APP_DIR}/backend/uploads/;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \\.(css|js|jpg|jpeg|png|gif|ico|svg|webp|woff2?)\$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

nginx -t
systemctl reload nginx

if certbot certificates 2>/dev/null | grep -q "${TEMP_DOMAIN}"; then
  certbot renew --quiet || true
else
  certbot --nginx -d "${TEMP_DOMAIN}" --non-interactive --agree-tos -m hmherbs1@gmail.com --redirect || true
fi

if certbot certificates 2>/dev/null | grep -q "${TEMP_DOMAIN}"; then
  sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://${TEMP_DOMAIN}|" "$ENV"
  sed -i "s|^STOREFRONT_PUBLIC_URL=.*|STOREFRONT_PUBLIC_URL=https://${TEMP_DOMAIN}|" "$ENV"
  sed -i "s|^ADMIN_APP_URL=.*|ADMIN_APP_URL=https://${TEMP_DOMAIN}/admin.html|" "$ENV"
fi

python3 /tmp/patch-staging-server.py 2>/dev/null || true
pm2 restart hmherbs-api --update-env
sleep 4
echo "Store:  https://${TEMP_DOMAIN}/"
echo "Admin:  https://${TEMP_DOMAIN}/admin.html"
curl -sf "https://${TEMP_DOMAIN}/api/health" || curl -sf "http://${TEMP_DOMAIN}/api/health"

#!/bin/bash
# Linode only — enable go.hmherbs.com on this server.
# Prerequisite: In Akamai Cloud Manager → Domains → hmherbs.com → add A record:
#   Host: go   →   172.238.208.164  (Miami NodeBalancer)
set -euo pipefail

DOMAIN="go.hmherbs.com"
APP_DIR="/var/www/hmherbs"
ENV="$APP_DIR/backend/.env"
CERT="/etc/letsencrypt/live/${DOMAIN}"

if ! getent hosts "$DOMAIN" | grep -q "172.238.208.164"; then
  echo "DNS not ready yet. Add in Linode Cloud Manager → Domains:"
  echo "  A record: go → 172.238.208.164"
  echo "Then run this script again."
  exit 1
fi

if [[ ! -f "${CERT}/fullchain.pem" ]]; then
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m hmherbs1@gmail.com
fi

cat > /etc/nginx/sites-available/hmherbs << NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN} 172.238.208.164 _;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name ${DOMAIN} 172.238.208.164 _;

    ssl_certificate ${CERT}/fullchain.pem;
    ssl_certificate_key ${CERT}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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

    # Business One POS (separate repo) — proxied to Node which serves ../business-one-pos
    location /pos/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /pos {
        return 301 /pos/;
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

cp /etc/nginx/sites-available/hmherbs /etc/nginx/sites-enabled/hmherbs
nginx -t && systemctl reload nginx

for kv in \
  "FRONTEND_URL=https://${DOMAIN}" \
  "STOREFRONT_PUBLIC_URL=https://${DOMAIN}" \
  "PRODUCTION_DOMAIN=${DOMAIN}" \
  "ADMIN_APP_URL=https://${DOMAIN}/admin.html"
do
  key="${kv%%=*}"
  if grep -q "^${key}=" "$ENV"; then
    sed -i "s|^${key}=.*|${kv}|" "$ENV"
  else
    echo "$kv" >> "$ENV"
  fi
done

python3 /tmp/patch-staging-server.py 2>/dev/null || true
pm2 restart hmherbs-api --update-env
sleep 4
echo "Live:"
echo "  https://${DOMAIN}/"
echo "  https://${DOMAIN}/admin.html"
curl -sf "https://${DOMAIN}/api/health"

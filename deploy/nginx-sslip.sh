#!/bin/bash
set -euo pipefail
TEMP_DOMAIN="${1:-172-238-208-164.sslip.io}"
APP_DIR="/var/www/hmherbs"
CERT="/etc/letsencrypt/live/${TEMP_DOMAIN}"

cat > /etc/nginx/sites-available/hmherbs << NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${TEMP_DOMAIN} 172.238.208.164 _;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name ${TEMP_DOMAIN} 172.238.208.164 _;

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
nginx -t
systemctl reload nginx

ENV="${APP_DIR}/backend/.env"
sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://${TEMP_DOMAIN}|" "$ENV"
sed -i "s|^STOREFRONT_PUBLIC_URL=.*|STOREFRONT_PUBLIC_URL=https://${TEMP_DOMAIN}|" "$ENV"
sed -i "s|^ADMIN_APP_URL=.*|ADMIN_APP_URL=https://${TEMP_DOMAIN}/admin.html|" "$ENV"
sed -i "s|^PRODUCTION_DOMAIN=.*|PRODUCTION_DOMAIN=${TEMP_DOMAIN}|" "$ENV"

pm2 restart hmherbs-api --update-env
sleep 4
curl -sf "https://${TEMP_DOMAIN}/api/health"
echo
curl -sf -o /dev/null -w "store=%{http_code} admin=%{http_code}\n" "https://${TEMP_DOMAIN}/" "https://${TEMP_DOMAIN}/admin.html"

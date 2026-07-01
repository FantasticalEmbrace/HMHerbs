#!/bin/bash
set -euo pipefail
cd /var/www/hmherbs

tar -xzf /tmp/hmherbs-deploy.tgz
rm -f /tmp/hmherbs-deploy.tgz

ENV=backend/.env
for kv in \
  "FRONTEND_URL=http://172.238.208.164" \
  "STOREFRONT_PUBLIC_URL=http://172.238.208.164" \
  "PRODUCTION_DOMAIN=172.238.208.164" \
  "ADMIN_APP_URL=http://172.238.208.164/admin.html"
do
  key="${kv%%=*}"
  if grep -q "^${key}=" "$ENV"; then
    sed -i "s|^${key}=.*|${kv}|" "$ENV"
  else
    echo "$kv" >> "$ENV"
  fi
done
grep -q "^STAGING_BLOCK_INDEXING=" "$ENV" || echo "STAGING_BLOCK_INDEXING=true" >> "$ENV"

cat > /etc/nginx/sites-available/hmherbs << 'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 172.238.208.164 _;

    root /var/www/hmherbs;
    index index.html;
    client_max_body_size 10M;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        alias /var/www/hmherbs/backend/uploads/;
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
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|webp|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

nginx -t
systemctl reload nginx
python3 /tmp/patch-staging-server.py
node --check backend/server.js
cd backend && npm install --omit=dev
cd ..
pm2 restart hmherbs-api --update-env
sleep 5
echo "health:" && curl -s http://172.238.208.164/api/health
echo "pages:" && curl -s -o /dev/null -w "index=%{http_code} " http://172.238.208.164/ && curl -s -o /dev/null -w "admin=%{http_code}\n" http://172.238.208.164/admin.html

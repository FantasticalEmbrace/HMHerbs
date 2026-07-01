#!/usr/bin/env bash
# First boot on Miami Linode — Nginx tuned for NodeBalancer private network.
# Run on the server (or via migrate-to-miami.ps1):
#   bash /var/www/hmherbs/deploy/setup-miami-server.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/hmherbs}"
DOMAIN="${DOMAIN:-_}"

echo "==> System packages + Node + PM2 + Nginx ..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx git curl ca-certificates mysql-client ufw

if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
command -v pm2 &>/dev/null || npm install -g pm2
command -v certbot &>/dev/null || apt-get install -y -qq certbot python3-certbot-nginx

mkdir -p "$APP_DIR/backend/certs" "$APP_DIR/backend/uploads"

if [[ -f "$APP_DIR/package.json" ]]; then
    cd "$APP_DIR"
    npm install
    cd backend && npm install && cd ..
fi

if [[ ! -f "$APP_DIR/backend/.env" && -f "$APP_DIR/backend/.env.linode.example" ]]; then
    cp "$APP_DIR/backend/.env.linode.example" "$APP_DIR/backend/.env"
    echo "Created backend/.env from template — edit Managed MySQL settings."
fi

echo "==> Nginx (NodeBalancer-aware) ..."
install -d /etc/nginx/sites-available /etc/nginx/sites-enabled
cat > /etc/nginx/sites-available/hmherbs << 'NGINX'
# HM Herbs — behind Akamai NodeBalancer (private backend IP)
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # NodeBalancer health checks and client IP forwarding
    set_real_ip_from 192.168.255.0/24;
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;

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

ln -sf /etc/nginx/sites-available/hmherbs /etc/nginx/sites-enabled/hmherbs
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

echo "==> UFW (SSH + HTTP/HTTPS) ..."
ufw --force reset || true
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

if [[ -f "$APP_DIR/deploy/ecosystem.config.cjs" ]]; then
    cd "$APP_DIR"
    pm2 start deploy/ecosystem.config.cjs 2>/dev/null || pm2 restart hmherbs-api --update-env
    pm2 save
    pm2 startup systemd -u root --hp /root 2>/dev/null || true
fi

echo ""
echo "Miami server setup complete."
echo "  Local API:  curl -s http://127.0.0.1:3001/api/health"
echo "  Local Nginx: curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/"
echo "  Edit: $APP_DIR/backend/.env (Miami Managed MySQL + JWT)"
echo "  Import DB: bash $APP_DIR/deploy/import-database.sh /tmp/deploy-staging.sql"

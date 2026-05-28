#!/usr/bin/env bash
# First-time HM Herbs Linode setup (Ubuntu 22.04).
#
# Prerequisites:
#   export REPO_URL=https://github.com/YOUR_USER/hmherbs.git
#   export APP_DIR=/var/www/hmherbs          # optional
#   export DEPLOY_USER=www-data               # optional, owner of app files
#
# Run on the Linode:
#   curl -fsSL .../bootstrap-linode.sh | sudo bash
#   # or after cloning:
#   sudo bash deploy/bootstrap-linode.sh
#
set -euo pipefail

REPO_URL="${REPO_URL:-}"
APP_DIR="${APP_DIR:-/var/www/hmherbs}"
DEPLOY_USER="${DEPLOY_USER:-$SUDO_USER}"
DEPLOY_USER="${DEPLOY_USER:-root}"

if [[ -z "$REPO_URL" && ! -f "$APP_DIR/package.json" ]]; then
    echo "Set REPO_URL to your git repository, or run this script from an existing clone at APP_DIR."
    exit 1
fi

echo "==> Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx git curl ca-certificates mysql-client

if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
    echo "==> Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi

if ! command -v pm2 &>/dev/null; then
    echo "==> Installing PM2..."
    npm install -g pm2
fi

if ! command -v certbot &>/dev/null; then
    echo "==> Installing Certbot..."
    apt-get install -y -qq certbot python3-certbot-nginx
fi

mkdir -p "$(dirname "$APP_DIR")"
if [[ -n "$REPO_URL" && ! -d "$APP_DIR/.git" ]]; then
    echo "==> Cloning $REPO_URL -> $APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
elif [[ ! -d "$APP_DIR" ]]; then
    echo "APP_DIR $APP_DIR does not exist. Clone the repo first."
    exit 1
fi

cd "$APP_DIR"
echo "==> npm install (root + backend)..."
npm install
cd backend && npm install && cd ..

mkdir -p backend/certs backend/uploads
if [[ ! -f backend/.env ]]; then
    cp backend/.env.linode.example backend/.env
    echo ""
    echo "*** Edit $APP_DIR/backend/.env with your Linode Managed MySQL credentials ***"
    echo "*** Place CA cert at backend/certs/ca-certificate.crt ***"
fi

echo "==> Starting API with PM2..."
pm2 start deploy/ecosystem.config.cjs || pm2 restart hmherbs-api
pm2 save
pm2 startup systemd -u "$DEPLOY_USER" --hp "$(eval echo ~$DEPLOY_USER)" || true

if [[ ! -f /etc/nginx/sites-available/hmherbs ]]; then
    echo "==> Installing Nginx site config..."
    sed "s|/var/www/hmherbs|$APP_DIR|g" deploy/nginx/hmherbs.conf.example > /etc/nginx/sites-available/hmherbs
    ln -sf /etc/nginx/sites-available/hmherbs /etc/nginx/sites-enabled/hmherbs
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl reload nginx
fi

chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR" 2>/dev/null || true

echo ""
echo "Bootstrap complete."
echo "  App directory: $APP_DIR"
echo "  Next: edit backend/.env, import database, run deploy/setup-nginx-ssl.sh YOUR_DOMAIN"
echo "  PM2: pm2 status && pm2 logs hmherbs-api"

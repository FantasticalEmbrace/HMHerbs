#!/bin/bash
# Quick feature-parity checks for HM Herbs on Linode.
set -eu

ENV="${ENV_FILE:-/var/www/hmherbs/backend/.env}"
BASE="${VERIFY_BASE_URL:-}"

if [ -z "$BASE" ] && [ -f "$ENV" ]; then
  BASE="$(grep -E '^STOREFRONT_PUBLIC_URL=' "$ENV" | head -1 | cut -d= -f2- | tr -d '\r')"
fi
BASE="${BASE:-http://127.0.0.1:3001}"

pass=0
fail=0
warn=0

check_env() {
  local key="$1"
  local label="${2:-$key}"
  if grep -q "^${key}=" "$ENV" 2>/dev/null; then
    local val
    val="$(grep "^${key}=" "$ENV" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'' ]*//;s/["'\'' ]*$//')"
    if [ -n "$val" ] && ! echo "$val" | grep -qiE '^(your_|replace_|$)'; then
      echo "OK   env $label"
      pass=$((pass + 1))
    else
      echo "WARN env $label (empty or placeholder)"
      warn=$((warn + 1))
    fi
  else
    echo "WARN env $label (missing)"
    warn=$((warn + 1))
  fi
}

check_api() {
  local path="$1"
  local expect="$2"
  local label="$3"
  local code
  code="$(curl -sk -o /tmp/hmherbs-verify-body.txt -w '%{http_code}' "${BASE}${path}" 2>/dev/null || echo 000)"
  if [ "$code" = "$expect" ]; then
    echo "OK   api $label ($code)"
    pass=$((pass + 1))
  else
    echo "FAIL api $label (got $code, want $expect)"
    fail=$((fail + 1))
  fi
}

check_json_enabled() {
  local path="$1"
  local label="$2"
  local body
  body="$(curl -sk "${BASE}${path}" 2>/dev/null || true)"
  if echo "$body" | grep -q '"enabled":true'; then
    echo "OK   api $label enabled"
    pass=$((pass + 1))
  else
    echo "WARN api $label not enabled - $body"
    warn=$((warn + 1))
  fi
}

echo "=== HM Herbs Linode feature check ==="
echo "Base URL: $BASE"
echo ""

check_api "/api/health" "200" "health"
check_env "DB_HOST" "database"
check_env "JWT_SECRET" "JWT"
check_env "SMTP_PASSWORD" "email (SMTP)"
check_env "NMI_PRIVATE_API_KEY" "checkout payments (NMI private)"
check_env "NMI_PUBLIC_TOKENIZATION_KEY" "checkout payments (NMI public)"
check_env "GBP_CLIENT_ID" "Google sign-in / GBP"
check_env "GBP_CLIENT_SECRET" "Google sign-in / GBP secret"
check_env "POS_DEVICE_API_KEY" "POS device API"
check_env "POS_NMI_PRIVATE_API_KEY" "POS payments"
check_env "OPENAI_API_KEY" "AI network assistant"
check_env "SHIPPO_API_TOKEN" "Shippo live rates"

check_json_enabled "/api/auth/google/status" "customer Google sign-in"
check_json_enabled "/api/admin/auth/google/status" "admin Google sign-in"

echo ""
echo "Summary: $pass passed, $warn warnings, $fail failed"
[ "$fail" -eq 0 ]

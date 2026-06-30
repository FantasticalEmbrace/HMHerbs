#!/bin/bash
# Sync EDSA booking changes (frontend + backend) from this repo to Linode staging.
# Usage (from repo root): bash deploy/sync-edsa-to-staging.sh [user@host]
set -euo pipefail

REMOTE="${1:-root@172.235.131.160}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="/var/www/hmherbs"

FILES=(
  index.html
  service-worker.js
  js/edsa-booking.js
  js/visual-bug-fixes.js
  css/edsa-booking.css
  css/emergency-fixes.css
  css/performance-optimizations.css
  backend/routes/edsa.js
  backend/utils/edsaBookingOps.js
  backend/utils/withTimeout.js
)

echo "Syncing ${#FILES[@]} EDSA files to ${REMOTE}:${REMOTE_DIR}"
for rel in "${FILES[@]}"; do
  scp -q "${ROOT}/${rel}" "${REMOTE}:${REMOTE_DIR}/${rel}"
  echo "  ok ${rel}"
done

echo "Applying trust proxy patch on staging server.js (safe — does not overwrite whole file)..."
ssh "${REMOTE}" "bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
cd /var/www/hmherbs
python3 <<'PY'
from pathlib import Path
p = Path('backend/server.js')
text = p.read_text(encoding='utf-8')
if 'trust proxy' not in text:
    text = text.replace(
        'const app = express();',
        "const app = express();\napp.set('trust proxy', 1);",
        1,
    )
    p.write_text(text, encoding='utf-8')
    print('added trust proxy')
else:
    print('trust proxy already present')
PY
cd backend && node --check server.js
pm2 restart hmherbs-api
sleep 3
curl -sf "http://127.0.0.1:3001/api/edsa/booking-context" | head -c 120
echo
REMOTE_SCRIPT

echo "Done. Hard-refresh staging in the browser (Ctrl+Shift+R) after deploy."

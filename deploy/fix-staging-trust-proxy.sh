#!/bin/bash
set -euo pipefail
cd /var/www/hmherbs
git checkout backend/server.js
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
cd backend
node --check server.js
pm2 restart hmherbs-api
sleep 4
curl -s http://127.0.0.1:3001/api/edsa/booking-context | head -c 300
echo

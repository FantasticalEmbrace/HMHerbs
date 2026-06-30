#!/bin/bash
set -euo pipefail
ENV="/var/www/hmherbs/backend/.env"
SNIP="/tmp/nmi-staging-snippet.env"
if [ ! -f "$SNIP" ]; then
  echo "missing $SNIP" >&2
  exit 1
fi
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  key="${line%%=*}"
  [ -z "$key" ] && continue
  if ! grep -q "^${key}=" "$ENV" 2>/dev/null; then
    echo "$line" >> "$ENV"
  fi
done < "$SNIP"
rm -f "$SNIP"
echo "NMI lines in .env: $(grep -c '^NMI_' "$ENV")"

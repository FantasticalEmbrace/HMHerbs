#!/usr/bin/env bash
# Import deploy-staging.sql into DigitalOcean Managed MySQL.
#
# Usage:
#   cp deploy/db-connection.env.example deploy/db-connection.env   # fill in, gitignored
#   bash deploy/import-database.sh database/deploy-staging.sql
#
# Or export DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME manually.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/db-connection.env" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$SCRIPT_DIR/db-connection.env"
    set +a
fi

SQL_FILE="${1:-$SCRIPT_DIR/../database/deploy-staging.sql}"
if [[ -z "$SQL_FILE" || ! -f "$SQL_FILE" ]]; then
    echo "Usage: $0 /path/to/deploy-staging.sql"
    exit 1
fi

: "${DB_HOST:?Set DB_HOST}"
: "${DB_USER:?Set DB_USER}"
: "${DB_PASSWORD:?Set DB_PASSWORD}"
: "${DB_NAME:?Set DB_NAME}"

DB_PORT="${DB_PORT:-25060}"
SSL_ARGS=(--ssl-mode=REQUIRED)
if [[ -n "${DB_SSL_CA:-}" ]]; then
    SSL_ARGS+=(--ssl-ca="$DB_SSL_CA")
fi

export MYSQL_PWD="$DB_PASSWORD"
echo "Importing $SQL_FILE into $DB_NAME @ $DB_HOST:$DB_PORT ..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "${SSL_ARGS[@]}" "$DB_NAME" < "$SQL_FILE"
unset MYSQL_PWD
echo "Done."

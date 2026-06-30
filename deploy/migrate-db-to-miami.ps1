# Option B: Miami Managed MySQL - dump Atlanta live data, import to Miami, wire Miami app.
#
#   $env:LINODE_TOKEN = "..."
#   .\deploy\migrate-db-to-miami.ps1
#
param(
    [string]$Token = $env:LINODE_TOKEN,
    [string]$AtlantaRemote = "",
    [string]$MiamiRemote = "root@172.235.131.160",
    [switch]$SkipProvision,
    [switch]$SkipDump
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "HM Herbs - migrate DB to Miami (Option B)" -ForegroundColor Cyan
Write-Host ""

if (-not $SkipProvision) {
    & (Join-Path $Root "deploy\provision-miami-mysql.ps1") -Token $Token
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path "deploy\db-connection.env")) {
    throw "Missing deploy\db-connection.env - run provision-miami-mysql.ps1 or paste Miami credentials."
}

$envMap = @{}
Get-Content "deploy\db-connection.env" | ForEach-Object {
    if ($_ -match '^\s*(DB_[A-Z_]+)=(.*)$') {
        $envMap[$matches[1]] = $matches[2].Trim()
    }
}
foreach ($k in @("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME")) {
    if (-not $envMap[$k]) { throw "db-connection.env missing $k" }
}
$caLocal = $envMap["DB_SSL_CA"]

if (-not $SkipDump) {
    if (-not $AtlantaRemote) {
        throw "Atlanta server was decommissioned. Use -SkipDump and ensure /tmp/hmherbs-live.sql.gz exists on Miami, or restore from a local SQL dump."
    }
    Write-Host "==> Dumping live database from Atlanta ..."
    $dumpCmd = "set -eu; DB_HOST=`$(grep -m1 '^DB_HOST=' /var/www/hmherbs/backend/.env | cut -d= -f2-); DB_PORT=`$(grep -m1 '^DB_PORT=' /var/www/hmherbs/backend/.env | cut -d= -f2-); DB_USER=`$(grep -m1 '^DB_USER=' /var/www/hmherbs/backend/.env | cut -d= -f2-); DB_NAME=`$(grep -m1 '^DB_NAME=' /var/www/hmherbs/backend/.env | cut -d= -f2-); export MYSQL_PWD=`$(grep -m1 '^DB_PASSWORD=' /var/www/hmherbs/backend/.env | cut -d= -f2-); mysqldump -h `"`$DB_HOST`" -P `"`$DB_PORT`" -u `"`$DB_USER`" --ssl-mode=REQUIRED --ssl-ca=/var/www/hmherbs/backend/certs/ca-certificate.crt --single-transaction --routines --triggers --set-gtid-purged=OFF `"`$DB_NAME`" | gzip -c > /tmp/hmherbs-live.sql.gz; ls -lh /tmp/hmherbs-live.sql.gz"
    ssh $AtlantaRemote $dumpCmd
}

Write-Host "==> Copying dump to Miami app server ..."
scp -q "${AtlantaRemote}:/tmp/hmherbs-live.sql.gz" "${MiamiRemote}:/tmp/hmherbs-live.sql.gz"

Write-Host "==> Uploading Miami DB credentials + CA cert ..."
ssh $MiamiRemote "mkdir -p /var/www/hmherbs/backend/certs /var/www/hmherbs/deploy"
if ($caLocal -and (Test-Path $caLocal)) {
    scp -q $caLocal "${MiamiRemote}:/var/www/hmherbs/backend/certs/ca-certificate.crt"
}
scp -q "deploy\db-connection.env" "${MiamiRemote}:/var/www/hmherbs/deploy/db-connection.env"

$dbHost = $envMap["DB_HOST"]
Write-Host "==> Importing into Miami MySQL ($dbHost) ..."

$importSh = @'
#!/bin/bash
set -eu
source /var/www/hmherbs/deploy/db-connection.env
export MYSQL_PWD="$DB_PASSWORD"
DB_PORT="${DB_PORT:-3306}"
CA=/var/www/hmherbs/backend/certs/ca-certificate.crt
HOST_IP=$(getent ahostsv4 "$DB_HOST" | awk 'NR==1{print $1}')
if [ -n "$HOST_IP" ]; then
  grep -q "$DB_HOST" /etc/hosts || echo "$HOST_IP $DB_HOST" >> /etc/hosts
fi
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --ssl-mode=REQUIRED --ssl-ca="$CA" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --ssl-mode=REQUIRED --ssl-ca="$CA" -e "SELECT 1" "$DB_NAME"
gunzip -c /tmp/hmherbs-live.sql.gz | mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --ssl-mode=REQUIRED --ssl-ca="$CA" "$DB_NAME"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --ssl-mode=REQUIRED --ssl-ca="$CA" -e "SELECT COUNT(*) AS products FROM products;" "$DB_NAME"
'@

$localSh = Join-Path $env:TEMP "hmherbs-import-miami.sh"
$importSh = $importSh -replace "`r`n", "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($localSh, $importSh, $utf8NoBom)
scp -q $localSh "${MiamiRemote}:/tmp/import-miami-db.sh"
ssh $MiamiRemote "bash /tmp/import-miami-db.sh && rm -f /tmp/import-miami-db.sh"

Write-Host "==> Patching Miami backend/.env + restart API ..."
& (Join-Path $Root "deploy\apply-db-env-remote.ps1") -Remote $MiamiRemote
ssh $MiamiRemote "cd /var/www/hmherbs/backend && npm run db:test && pm2 restart hmherbs-api --update-env && sleep 2 && curl -s http://127.0.0.1/api/health"

Write-Host ""
Write-Host "Miami DB migration complete." -ForegroundColor Green
Write-Host "  Test: http://172.235.131.160/api/health"
Write-Host "  Miami is the only production stack."

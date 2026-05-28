# Import database/deploy-staging.sql into Linode Managed MySQL (Windows).
#
# Prerequisites:
#   1. npm run db:build-staging
#   2. Copy deploy/db-connection.env.example -> deploy/db-connection.env (fill in values)
#   3. MySQL client installed (MySQL Installer or MariaDB client) and mysql.exe in PATH
#   4. Your IP added to Linode database Access Controls
#
# Usage:
#   .\deploy\import-database.ps1
#   .\deploy\import-database.ps1 -SqlFile "database\deploy-staging.sql"

param(
    [string]$SqlFile = (Join-Path $PSScriptRoot "..\database\deploy-staging.sql"),
    [string]$EnvFile = (Join-Path $PSScriptRoot "db-connection.env")
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SqlFile = Resolve-Path $SqlFile -ErrorAction SilentlyContinue
if (-not $SqlFile) {
    Write-Host "SQL file not found. Run: npm run db:build-staging" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $EnvFile)) {
    Write-Host "Create $EnvFile from deploy/db-connection.env.example" -ForegroundColor Yellow
    exit 1
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

$host_ = $env:DB_HOST
$user = $env:DB_USER
$pass = $env:DB_PASSWORD
$db = $env:DB_NAME
$port = if ($env:DB_PORT) { $env:DB_PORT } else { "3306" }
$ca = $env:DB_SSL_CA

if (-not $host_ -or -not $user -or -not $pass -or -not $db) {
    Write-Host "db-connection.env must set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME" -ForegroundColor Red
    exit 1
}

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) {
    Write-Host "mysql.exe not in PATH. Install MySQL Shell or MySQL client." -ForegroundColor Red
    exit 1
}

$sslArgs = @("--ssl-mode=REQUIRED")
if ($ca -and (Test-Path $ca)) {
    $sslArgs += "--ssl-ca=$ca"
}

Write-Host "Importing into $db @ ${host_}:${port} ..."
$env:MYSQL_PWD = $pass
& mysql -h $host_ -P $port -u $user @sslArgs $db -e "SELECT 1" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Connection failed. Check Access Controls and credentials." -ForegroundColor Red
    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
    exit 1
}

Get-Content $SqlFile -Raw | & mysql -h $host_ -P $port -u $user @sslArgs $db
$code = $LASTEXITCODE
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue

if ($code -eq 0) {
    Write-Host "Import complete." -ForegroundColor Green
} else {
    Write-Host "Import failed (exit $code)." -ForegroundColor Red
    exit $code
}

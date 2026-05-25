# Upload deploy-staging.sql and optional files to your DigitalOcean Droplet (Windows).
#
# Usage:
#   .\deploy\upload-to-droplet.ps1 -DropletIp 203.0.113.10 -User root
#   .\deploy\upload-to-droplet.ps1 -DropletIp 203.0.113.10 -User root -IncludeEnv

param(
    [Parameter(Mandatory = $true)]
    [string]$DropletIp,
    [string]$User = "root",
    [switch]$IncludeEnv,
    [switch]$BuildBundle
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

if ($BuildBundle -or -not (Test-Path "database\deploy-staging.sql")) {
    Write-Host "Building database bundle..."
    npm run db:build-staging
}

$SqlFile = "database\deploy-staging.sql"
if (-not (Test-Path $SqlFile)) {
    Write-Host "Missing $SqlFile" -ForegroundColor Red
    exit 1
}

$scp = Get-Command scp -ErrorAction SilentlyContinue
if (-not $scp) {
    Write-Host "scp not found. Use OpenSSH client (Windows Settings -> Optional Features)." -ForegroundColor Red
    exit 1
}

Write-Host "Uploading $SqlFile to ${User}@${DropletIp}:/tmp/ ..."
& scp $SqlFile "${User}@${DropletIp}:/tmp/deploy-staging.sql"

if ($IncludeEnv -and (Test-Path "deploy\db-connection.env")) {
    & scp "deploy\db-connection.env" "${User}@${DropletIp}:/tmp/db-connection.env"
}

Write-Host ""
Write-Host "On the Droplet, run:" -ForegroundColor Cyan
Write-Host "  source /tmp/db-connection.env  # if uploaded"
Write-Host "  export DB_HOST DB_USER DB_PASSWORD DB_NAME DB_PORT"
Write-Host "  bash /var/www/hmherbs/deploy/import-database.sh /tmp/deploy-staging.sql"

# Sync HM Herbs underwriting staging (Akamai Linode) from Windows.
# Usage: .\deploy\sync-underwriting-staging.ps1
param(
    [string]$Remote = "root@172.235.131.160",
    [string]$RemoteDir = "/var/www/hmherbs"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$files = @(
    "index.html",
    "products.html",
    "product.html",
    "checkout.html",
    "about.html",
    "script.js",
    "styles.css",
    "service-worker.js",
    "data/spotlight-products.json",
    "js/page-init.js",
    "js/visual-bug-fixes.js",
    "js/section-nav.js",
    "css/emergency-fixes.css",
    "css/performance-optimizations.css",
    "backend/scripts/feature-sample-products.js"
)

Write-Host "Syncing $($files.Count) files to ${Remote}:${RemoteDir}"
foreach ($rel in $files) {
    $local = Join-Path $Root $rel
    if (-not (Test-Path $local)) {
        Write-Warning "Skip missing $rel"
        continue
    }
    scp -q $local "${Remote}:${RemoteDir}/$($rel -replace '\\','/')"
    Write-Host "  ok $rel"
}

Write-Host "Restoring homepage spotlight + restarting API..."
ssh $Remote @"
set -e
cd $RemoteDir/backend
node scripts/feature-sample-products.js || true
node --check server.js
pm2 restart hmherbs-api
"@

Write-Host ""
Write-Host "Staging URLs (Linode — no hmherbs.com DNS needed):"
Write-Host "  http://172-238-208-164.sslip.io/"
Write-Host "  http://172-238-208-164.sslip.io/admin.html"
Write-Host "Hard-refresh the browser after deploy (Ctrl+Shift+R)."

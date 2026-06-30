# Push the full HM Herbs site (this repo) to Linode — no hmherbs.com DNS required.
# Usage: .\deploy\sync-full-linode.ps1
param(
    [string]$Remote = "root@172.235.131.160",
    [string]$RemoteDir = "/var/www/hmherbs"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "Packing site (excluding node_modules, unrelated projects)..."
$tarArgs = @(
    "-czf", "-",
    "--exclude=node_modules",
    "--exclude=backend/node_modules",
    "--exclude=.git",
    "--exclude=rankin-remodeling",
    "--exclude=support-desk",
    "--exclude=business-one-support-agent",
    "--exclude=images/business-one",
    "--exclude=business-one-menu.html",
    "--exclude=business-one-menu.css",
    "--exclude=business-one-menu.js",
    "--exclude=business-one-privacy-policy.html",
    "--exclude=signup.html",
    "--exclude=platform-support.html",
    "--exclude=support-viewer.html",
    "--exclude=css/pos-signup.css",
    "--exclude=css/business-one-support-desk.css",
    "--exclude=js/pos-signup.js",
    "--exclude=backend/services/posSignupIntake.js",
    "--exclude=backend/utils/ensurePosSignupSchema.js",
    "--exclude=.env",
    "--exclude=backend/.env",
    "--exclude=deploy/db-connection.env",
    "."
)
$proc = Start-Process -FilePath "tar" -ArgumentList $tarArgs -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\hmherbs-deploy.tgz" -Wait
if ($proc.ExitCode -ne 0) { throw "tar pack failed" }

Write-Host "Uploading to ${Remote}:${RemoteDir} ..."
scp -q "$env:TEMP\hmherbs-deploy.tgz" "${Remote}:/tmp/hmherbs-deploy.tgz"
Remove-Item "$env:TEMP\hmherbs-deploy.tgz" -Force

scp -q (Join-Path $Root "deploy\patch-staging-server.py") "${Remote}:/tmp/patch-staging-server.py"

ssh $Remote @"
set -e
mkdir -p $RemoteDir
cd $RemoteDir
tar -xzf /tmp/hmherbs-deploy.tgz
rm -f /tmp/hmherbs-deploy.tgz
chmod +x deploy/verify-linode-features.sh 2>/dev/null || true
python3 /tmp/patch-staging-server.py 2>/dev/null || true
node --check backend/server.js
cd backend && npm install --omit=dev
cd ..
pm2 restart hmherbs-api --update-env
"@

Write-Host ""
Write-Host "Live on Linode (Miami NodeBalancer):"
Write-Host "  Store:  http://172-238-208-164.sslip.io/"
Write-Host "  Admin:  http://172-238-208-164.sslip.io/admin.html"
Write-Host "  API:    http://172-238-208-164.sslip.io/api/health"
Write-Host ""
Write-Host "Sync feature credentials from local .env:"
Write-Host "  .\deploy\sync-linode-env.ps1"

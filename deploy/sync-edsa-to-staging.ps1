# Sync EDSA booking changes to Linode staging from Windows.
# Usage: .\deploy\sync-edsa-to-staging.ps1
param(
    [string]$Remote = "root@172.235.131.160",
    [string]$RemoteDir = "/var/www/hmherbs"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$files = @(
    "index.html",
    "service-worker.js",
    "js/edsa-booking.js",
    "js/visual-bug-fixes.js",
    "css/edsa-booking.css",
    "css/emergency-fixes.css",
    "css/performance-optimizations.css",
    "backend/routes/edsa.js",
    "backend/utils/edsaBookingOps.js",
    "backend/utils/withTimeout.js"
)

Write-Host "Syncing $($files.Count) EDSA files to ${Remote}:${RemoteDir}"
foreach ($rel in $files) {
    $local = Join-Path $Root $rel
    scp -q $local "${Remote}:${RemoteDir}/$($rel -replace '\\','/')"
    Write-Host "  ok $rel"
}

Write-Host "Applying trust proxy + restarting API..."
ssh $Remote "cd $RemoteDir && python3 -c `"from pathlib import Path; p=Path('backend/server.js'); t=p.read_text(encoding='utf-8');
import sys
if 'trust proxy' not in t:
 t=t.replace('const app = express();', \"const app = express();\\napp.set('trust proxy', 1);\", 1); p.write_text(t, encoding='utf-8'); print('added trust proxy')
else: print('trust proxy ok')`" && cd backend && node --check server.js && pm2 restart hmherbs-api"

Write-Host "Done. Hard-refresh staging (Ctrl+Shift+R)."

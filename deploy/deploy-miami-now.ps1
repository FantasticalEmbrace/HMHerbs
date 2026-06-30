# Run deploy to Miami Linode
# Usage: .\deploy\deploy-miami-now.ps1
param(
    [string]$Remote = "root@172.235.131.160",
    [string]$VpcBackend = "10.0.0.2",
    [switch]$SkipDbImport
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "=== HM Herbs Miami deploy ===" -ForegroundColor Cyan
Write-Host "Target: $Remote (NodeBalancer backend: ${VpcBackend}:80)"
Write-Host ""

Write-Host "Step 1 - SSH check"
ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new $Remote "echo OK && uptime"
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH failed." -ForegroundColor Red
    exit 1
}

Write-Host "Step 2 - Upload site code"
& (Join-Path $Root "deploy\sync-full-linode.ps1") -Remote $Remote

Write-Host "Step 3 - Server setup"
ssh $Remote "bash /var/www/hmherbs/deploy/setup-miami-server.sh"

if (-not $SkipDbImport) {
    if (-not (Test-Path "deploy\db-connection.env")) {
        Write-Host "Step 4 - DB import skipped (no deploy\db-connection.env)" -ForegroundColor Yellow
    } else {
        Write-Host "Step 4 - Import database"
        npm run db:build-staging | Out-Null
        & (Join-Path $Root "deploy\import-database.ps1")
        $caPath = $null
        Get-Content "deploy\db-connection.env" | ForEach-Object {
            if ($_ -match '^DB_SSL_CA=(.+)$') { $caPath = $matches[1].Trim() }
        }
        if ($caPath -and (Test-Path $caPath)) {
            ssh $Remote "mkdir -p /var/www/hmherbs/backend/certs"
            scp -q $caPath "${Remote}:/var/www/hmherbs/backend/certs/ca-certificate.crt"
        }
        & (Join-Path $Root "deploy\apply-db-env-remote.ps1") -Remote $Remote
        ssh $Remote "bash -lc 'cd /var/www/hmherbs/backend && npm run db:test && pm2 restart hmherbs-api --update-env'"
    }
} else {
    Write-Host "Step 4 - DB import skipped" -ForegroundColor Yellow
}

$sslip = "172-235-131-160.sslip.io"
Write-Host "Step 5 - Sync env credentials"
& (Join-Path $Root "deploy\sync-linode-env.ps1") -Remote $Remote -TempDomain $sslip

Write-Host ""
Write-Host "=== Deploy pass done ===" -ForegroundColor Green
Write-Host "Test: http://172.235.131.160/api/health"
Write-Host "After NodeBalancer: http://NODEBALANCER-IP.sslip.io/api/health"

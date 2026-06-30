# HM Herbs — Atlanta -> Miami migration orchestrator.
#
# Full run (needs LINODE_TOKEN):
#   $env:LINODE_TOKEN = "..."
#   .\deploy\migrate-to-miami.ps1
#
# After manual Cloud Manager setup + provision-miami.ps1:
#   .\deploy\migrate-to-miami.ps1 -DeployOnly
#
param(
    [string]$Token = $env:LINODE_TOKEN,
    [switch]$ProvisionOnly,
    [switch]$DeployOnly,
    [switch]$SkipDbImport,
    [string]$StateFile = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $StateFile) {
    $StateFile = Join-Path $Root "deploy\miami-provision.state.json"
}

function Read-MiamiState {
    if (-not (Test-Path $StateFile)) {
        throw "Missing $StateFile — run .\deploy\provision-miami.ps1 first (or create Miami resources manually and write state JSON)."
    }
    return Get-Content $StateFile -Raw | ConvertFrom-Json
}

Write-Host "HM Herbs -> Miami migration" -ForegroundColor Cyan
Write-Host ""

if (-not $DeployOnly) {
    Write-Host "Step 0: Create Managed MySQL in Miami (Cloud Manager) if you have not yet:" -ForegroundColor Yellow
    Write-Host "  Databases -> Create -> MySQL 8 -> Region: Miami, FL"
    Write-Host "  Create DB hmherbs + app user, download CA cert"
    Write-Host "  Update deploy\db-connection.env with new DB_HOST (keep file local only)"
    Write-Host ""
    if (-not $Token) {
        Write-Host "LINODE_TOKEN not set — cannot auto-provision Linode + NodeBalancer." -ForegroundColor Yellow
        Write-Host "Create token: https://cloud.linode.com/profile/tokens"
        Write-Host "Then: `$env:LINODE_TOKEN='...'; .\deploy\migrate-to-miami.ps1"
        Write-Host ""
        Write-Host "Or run provision manually and continue with: .\deploy\migrate-to-miami.ps1 -DeployOnly"
        if (-not $ProvisionOnly) { exit 1 }
    } else {
        & (Join-Path $Root "deploy\provision-miami.ps1") -Token $Token
    }
    if ($ProvisionOnly) { exit 0 }
}

$state = Read-MiamiState
$publicIp = $state.linodePublic
$nbIp = $state.nodeBalancerIpv4
$sslip = $state.tempSslipDomain
$remote = "root@$publicIp"

Write-Host "==> Building database bundle ..."
npm run db:build-staging

Write-Host "==> Waiting for SSH on $remote ..."
$deadline = (Get-Date).AddMinutes(8)
$sshOk = $false
while ((Get-Date) -lt $deadline) {
    $out = ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new $remote "echo ok" 2>&1
    if ($LASTEXITCODE -eq 0 -and ($out -match "ok")) {
        $sshOk = $true
        break
    }
    Write-Host "  SSH not ready yet ..."
    Start-Sleep -Seconds 12
}
if (-not $sshOk) {
    throw "SSH to $remote failed. Wait for Linode to finish booting, then re-run: .\deploy\migrate-to-miami.ps1 -DeployOnly"
}

Write-Host "==> Uploading site code ..."
& (Join-Path $Root "deploy\sync-full-linode.ps1") -Remote $remote

Write-Host "==> Uploading SQL + running Miami server setup ..."
scp -q "database\deploy-staging.sql" "${remote}:/tmp/deploy-staging.sql"
ssh $remote "bash /var/www/hmherbs/deploy/setup-miami-server.sh"

if (-not $SkipDbImport) {
    if (-not (Test-Path "deploy\db-connection.env")) {
        Write-Host "Skip DB import — create deploy\db-connection.env with Miami MySQL credentials, then:" -ForegroundColor Yellow
        Write-Host "  .\deploy\import-database.ps1"
        Write-Host "  Add Miami Linode IP ($publicIp) to MySQL Access Controls first."
    } else {
        Write-Host "==> Importing database to Miami Managed MySQL (from db-connection.env) ..."
        & (Join-Path $Root "deploy\import-database.ps1")
        Write-Host "==> Uploading CA cert + patching .env on server ..."
        $caPath = $null
        Get-Content "deploy\db-connection.env" | ForEach-Object {
            if ($_ -match '^DB_SSL_CA=(.+)$') { $caPath = $matches[1].Trim() }
        }
        if ($caPath -and (Test-Path $caPath)) {
            ssh $remote "mkdir -p /var/www/hmherbs/backend/certs"
            scp -q $caPath "${remote}:/var/www/hmherbs/backend/certs/ca-certificate.crt"
        }
        & (Join-Path $Root "deploy\apply-db-env-remote.ps1") -Remote $remote
        ssh $remote "cd /var/www/hmherbs/backend && npm run db:test && pm2 restart hmherbs-api --update-env"
    }
}

Write-Host "==> Syncing feature credentials (Google, NMI, SMTP, ...) ..."
& (Join-Path $Root "deploy\sync-linode-env.ps1") -Remote $remote -TempDomain $sslip

Write-Host ""
Write-Host "Migration deploy pass complete." -ForegroundColor Green
Write-Host ""
Write-Host "Test URLs (NodeBalancer — use after backend health = UP):"
Write-Host "  http://$sslip/"
Write-Host "  http://$sslip/api/health"
Write-Host "  http://$sslip/admin.html"
Write-Host ""
Write-Host "SSH (direct to app server): ssh root@$publicIp"
Write-Host "NodeBalancer IP (for DNS):  $nbIp"
Write-Host ""
Write-Host "Cloud Manager checks:"
Write-Host "  NodeBalancer -> Config :80 -> backend node status should be UP"
Write-Host "  If DOWN: confirm Nginx on :80 and /api/health returns 200 on the Linode"
Write-Host ""
Write-Host "Google OAuth: add https://$sslip/api/.../callback URIs (see deploy/GOOGLE_OAUTH_REDIRECT_URIS.md)"
Write-Host "When live: point www.hmherbs.com A record -> $nbIp"

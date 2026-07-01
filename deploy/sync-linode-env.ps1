# Sync feature credentials from local backend/.env to Linode without overwriting
# Linode-only settings (Managed MySQL, JWT, temp/public URLs).
#
# Usage: .\deploy\sync-linode-env.ps1
# Optional: .\deploy\sync-linode-env.ps1 -TempDomain "172-238-208-164.sslip.io"
param(
    [string]$Remote = "root@172.235.131.160",
    [string]$RemoteEnv = "/var/www/hmherbs/backend/.env",
    [string]$LocalEnv = "",
    [string]$TempDomain = "172-238-208-164.sslip.io",
    [string]$NodeBalancerIp = "172.238.208.164",
    [switch]$UseHttps
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $LocalEnv) { $LocalEnv = Join-Path $Root "backend\.env" }

if (-not (Test-Path $LocalEnv)) {
    throw "Local env not found: $LocalEnv"
}

function Parse-DotEnv([string]$Path) {
    $map = @{}
    Get-Content $Path -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1)
        $map[$key] = $val
    }
    return $map
}

function Is-PlaceholderValue([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
    $v = $Value.Trim().Trim('"').Trim("'")
    if (-not $v) { return $true }
    return $v -match '^(your_|replace_with|sk_test_|pk_test_|shippo_test_)' `
        -or $v -eq 'your_password_here' `
        -or $v -eq 'your_super_secret_jwt_key_here_change_in_production'
}

$PreserveKeys = @(
    "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_SSL", "DB_SSL_CA_PATH",
    "JWT_SECRET", "NODE_ENV", "PORT", "STAGING_BLOCK_INDEXING",
    "FRONTEND_URL", "STOREFRONT_PUBLIC_URL", "PRODUCTION_DOMAIN", "ADMIN_APP_URL"
)

Write-Host "Reading local env: $LocalEnv"
$localMap = Parse-DotEnv $LocalEnv

Write-Host "Reading remote env from $Remote ..."
$remoteText = ssh $Remote "cat $RemoteEnv"
$remoteFile = Join-Path $env:TEMP "hmherbs-remote.env"
Set-Content -Path $remoteFile -Value $remoteText -Encoding UTF8
$remoteMap = Parse-DotEnv $remoteFile

$merged = @{}
foreach ($k in $remoteMap.Keys) { $merged[$k] = $remoteMap[$k] }

$copied = @()
foreach ($k in $localMap.Keys) {
    if ($PreserveKeys -contains $k) { continue }
    $val = $localMap[$k]
    if (Is-PlaceholderValue $val) { continue }
    $merged[$k] = $val
    $copied += $k
}

$baseUrl = if ($UseHttps) { "https://$TempDomain" } else { "http://$TempDomain" }
$merged["FRONTEND_URL"] = $baseUrl
$merged["STOREFRONT_PUBLIC_URL"] = $baseUrl
$merged["PRODUCTION_DOMAIN"] = $TempDomain
$merged["ADMIN_APP_URL"] = "$baseUrl/admin.html"
$merged["NODE_ENV"] = "production"
if (-not $merged.ContainsKey("STAGING_BLOCK_INDEXING") -or [string]::IsNullOrWhiteSpace($merged["STAGING_BLOCK_INDEXING"])) {
    $merged["STAGING_BLOCK_INDEXING"] = "true"
}

$merged["CUSTOMER_GOOGLE_REDIRECT_URI"] = "$baseUrl/api/auth/google/callback"
$merged["ADMIN_GOOGLE_REDIRECT_URI"] = "$baseUrl/api/admin/auth/google/callback"
$merged["GBP_REDIRECT_URI"] = "$baseUrl/api/admin/settings/google-business/callback"
$merged["GCAL_REDIRECT_URI"] = "$baseUrl/api/admin/settings/google-calendar/callback"

if ($merged.ContainsKey("POS_PLATFORM_STORE_URL") -and -not (Is-PlaceholderValue $merged["POS_PLATFORM_STORE_URL"])) {
    $merged["POS_PLATFORM_STORE_URL"] = $baseUrl
}

$posOrigins = @()
if ($merged.ContainsKey("POS_ALLOWED_ORIGINS") -and -not (Is-PlaceholderValue $merged["POS_ALLOWED_ORIGINS"])) {
    $posOrigins += ($merged["POS_ALLOWED_ORIGINS"] -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '139\.177\.204\.216|139-177-204-216' })
}
foreach ($origin in @($baseUrl, "http://$TempDomain", "https://$TempDomain", "http://$NodeBalancerIp")) {
    if ($origin -and ($posOrigins -notcontains $origin)) { $posOrigins += $origin }
}
foreach ($origin in @(
    "https://pos.businessonecomprehensive.com",
    "http://pos.businessonecomprehensive.com",
    "https://172-238-220-29.sslip.io",
    "http://172.238.220.29",
    "https://172.238.220.29"
)) {
    if ($origin -and ($posOrigins -notcontains $origin)) { $posOrigins += $origin }
}
if ($posOrigins.Count -gt 0) {
    $merged["POS_ALLOWED_ORIGINS"] = ($posOrigins -join ",")
}

$outFile = Join-Path $env:TEMP "hmherbs-linode.env"
$lines = New-Object System.Collections.Generic.List[string]
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$lines.Add("# HM Herbs Linode env - merged $stamp")
foreach ($k in ($merged.Keys | Sort-Object)) {
    $lines.Add("$k=$($merged[$k])")
}
Set-Content -Path $outFile -Value ($lines -join "`n") -Encoding UTF8 -NoNewline
Add-Content -Path $outFile -Value "" -Encoding UTF8

$keyCount = $merged.Count
$copyCount = $copied.Count
Write-Host "Merged env written ($keyCount keys; copied $copyCount feature keys from local)."
Write-Host "Uploading to $Remote ..."
$backupSuffix = Get-Date -Format "yyyyMMddHHmmss"
$remoteScriptFile = Join-Path $env:TEMP "hmherbs-apply-env.sh"
$scriptLines = @(
    "#!/bin/bash",
    "set -eu",
    "cp '$RemoteEnv' '${RemoteEnv}.bak.$backupSuffix'",
    "mv /tmp/hmherbs-linode.env '$RemoteEnv'",
    "chmod 600 '$RemoteEnv'",
    "python3 /tmp/patch-staging-server.py 2>/dev/null || true",
    "pm2 restart hmherbs-api --update-env",
    "sleep 4",
    "bash /var/www/hmherbs/deploy/verify-linode-features.sh 2>/dev/null || true"
)
$scriptBody = ($scriptLines -join "`n") + "`n"
[System.IO.File]::WriteAllText($remoteScriptFile, $scriptBody, (New-Object System.Text.UTF8Encoding $false))

scp -q $outFile "${Remote}:/tmp/hmherbs-linode.env"
scp -q $remoteScriptFile "${Remote}:/tmp/hmherbs-apply-env.sh"
ssh $Remote "bash /tmp/hmherbs-apply-env.sh"

Remove-Item $remoteFile, $outFile, $remoteScriptFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Public site: $baseUrl"
Write-Host "Add these Google OAuth redirect URIs in Cloud Console (if not already):"
Write-Host "  $($merged['CUSTOMER_GOOGLE_REDIRECT_URI'])"
Write-Host "  $($merged['ADMIN_GOOGLE_REDIRECT_URI'])"
Write-Host "  $($merged['GBP_REDIRECT_URI'])"
Write-Host "  $($merged['GCAL_REDIRECT_URI'])"

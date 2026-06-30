# Configure DNS A record (Hover) + Linode reverse DNS for SMTP unblock ticket.
#
# Prerequisites:
#   - Hover login (hmherbs.com uses ns1.hover.com / ns2.hover.com)
#   - Linode Personal Access Token (read/write): https://cloud.linode.com/profile/tokens
#
# Usage:
#   $env:LINODE_TOKEN = "your-linode-token"
#   $env:HOVER_USERNAME = "your-hover-email"
#   $env:HOVER_PASSWORD = "your-hover-password"
#   .\deploy\setup-smtp-dns.ps1
#
# Optional:
#   .\deploy\setup-smtp-dns.ps1 -Subdomain store -SkipHover

param(
    [string]$Token = $env:LINODE_TOKEN,
    [string]$HoverUser = $env:HOVER_USERNAME,
    [string]$HoverPass = $env:HOVER_PASSWORD,
    [string]$Domain = "hmherbs.com",
    [string]$Subdomain = "store",
    [string]$Ipv4 = "172.235.131.160",
    [switch]$SkipHover,
    [switch]$SkipLinode
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Fqdn = if ($Subdomain -eq "@" -or [string]::IsNullOrWhiteSpace($Subdomain)) { $Domain } else { "$Subdomain.$Domain" }

if (-not $Token) {
    $tokenFile = Join-Path $Root "deploy\.linode-token"
    if (Test-Path $tokenFile) {
        $Token = (Get-Content $tokenFile -Raw).Trim()
    }
}

function Invoke-Linode {
    param([string]$Method, [string]$Path, [object]$Body = $null)
    $headers = @{
        Authorization = "Bearer $Token"
        Accept        = "application/json"
        "Content-Type" = "application/json"
    }
    $uri = "https://api.linode.com/v4$Path"
    $params = @{ Method = $Method; Uri = $uri; Headers = $headers }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Compress)
    }
    Invoke-RestMethod @params
}

function Set-HoverARecord {
    param([string]$User, [string]$Pass, [string]$HostName, [string]$RecordName, [string]$Content)

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ username = $User; password = $Pass }
    $login = Invoke-WebRequest -Uri "https://www.hover.com/api/login" -Method POST -Body $loginBody -WebSession $session -UseBasicParsing
    if ($login.StatusCode -ne 200) {
        throw "Hover login failed (HTTP $($login.StatusCode))"
    }

    $dns = Invoke-RestMethod -Uri "https://www.hover.com/api/dns" -WebSession $session
    $domainRow = $dns.domains | Where-Object { $_.domain_name -eq $HostName } | Select-Object -First 1
    if (-not $domainRow) {
        throw "Domain $HostName not found in Hover account"
    }

    $existing = $domainRow.entries | Where-Object {
        $_.type -eq "A" -and $_.name -eq $RecordName
    } | Select-Object -First 1

    if ($existing) {
        $update = Invoke-RestMethod -Uri "https://www.hover.com/api/dns/$($existing.id)" -Method PUT -WebSession $session -Body (@{ content = $Content } | ConvertTo-Json) -ContentType "application/json"
        if (-not $update.succeeded) { throw "Hover update failed: $($update | ConvertTo-Json -Compress)" }
        Write-Host "Updated Hover A record: $RecordName.$HostName -> $Content" -ForegroundColor Green
    } else {
        $create = Invoke-RestMethod -Uri "https://www.hover.com/api/domains/$($domainRow.id)/dns" -Method POST -WebSession $session -Body (@{
            name    = $RecordName
            type    = "A"
            content = $Content
        } | ConvertTo-Json) -ContentType "application/json"
        if (-not $create.succeeded) { throw "Hover create failed: $($create | ConvertTo-Json -Compress)" }
        Write-Host "Created Hover A record: $RecordName.$HostName -> $Content" -ForegroundColor Green
    }
}

Write-Host "SMTP DNS setup for $Fqdn -> $Ipv4" -ForegroundColor Cyan

if (-not $SkipHover) {
    if (-not $HoverUser -or -not $HoverPass) {
        Write-Host "Hover: skipped — set HOVER_USERNAME and HOVER_PASSWORD, or use -SkipHover" -ForegroundColor Yellow
    } else {
        Set-HoverARecord -User $HoverUser -Pass $HoverPass -HostName $Domain -RecordName $Subdomain -Content $Ipv4
    }
}

if (-not $SkipLinode) {
    if (-not $Token) {
        Write-Host "Linode rDNS: skipped — set LINODE_TOKEN, or use -SkipLinode" -ForegroundColor Yellow
    } else {
        $encodedIp = [uri]::EscapeDataString($Ipv4)
        $result = Invoke-Linode PUT "/networking/ips/$encodedIp" @{ rdns = $Fqdn }
        Write-Host "Linode rDNS set: $Ipv4 -> $($result.rdns)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Verify (may take a few minutes to propagate):" -ForegroundColor Cyan
Write-Host "  nslookup $Fqdn"
Write-Host "  nslookup $Ipv4"

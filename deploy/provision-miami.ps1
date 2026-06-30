# Provision HM Herbs stack in Miami (us-mia): Linode + private IP + NodeBalancer backend.
#
# Requires a Personal Access Token with read/write:
#   https://cloud.linode.com/profile/tokens
#
# Usage:
#   $env:LINODE_TOKEN = "your-token"
#   .\deploy\provision-miami.ps1
#
# Optional:
#   .\deploy\provision-miami.ps1 -LinodeType g6-standard-1 -LabelPrefix hmherbs
#
param(
    [string]$Token = $env:LINODE_TOKEN,
    [string]$Region = "us-mia",
    [string]$LinodeType = "g6-standard-1",
    [string]$LabelPrefix = "hmherbs",
    [string]$SshPublicKeyPath = "",
    [switch]$SkipIfStateExists
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StateFile = Join-Path $Root "deploy\miami-provision.state.json"

function Get-LinodeHeaders {
    param([string]$ApiToken)
    @{
        Authorization = "Bearer $ApiToken"
        "Content-Type"  = "application/json"
        Accept          = "application/json"
    }
}

function Invoke-LinodeApi {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )
    $uri = "https://api.linode.com/v4$Path"
    $params = @{
        Method  = $Method
        Uri     = $uri
        Headers = (Get-LinodeHeaders -ApiToken $Token)
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }
    return Invoke-RestMethod @params
}

function Wait-LinodeRunning {
    param([int]$LinodeId, [int]$TimeoutSec = 600)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $inst = Invoke-LinodeApi GET "/linode/instances/$LinodeId"
        if ($inst.status -eq "running") { return $inst }
        Write-Host "  Linode $LinodeId status: $($inst.status) ..."
        Start-Sleep -Seconds 15
    }
    throw "Timed out waiting for Linode $LinodeId to reach running."
}

function Get-InstanceIpv4 {
    param([object]$Instance, [switch]$Private)
    foreach ($block in $instance.ipv4) {
        if ($Private) {
            if ($block -match '^192\.168\.') { return $block }
        } else {
            if ($block -notmatch '^192\.168\.') { return $block }
        }
    }
    return $null
}

if (-not $Token) {
    Write-Host "Set LINODE_TOKEN (Cloud Manager -> Profile -> API Tokens -> Create Token)." -ForegroundColor Yellow
    Write-Host "  `$env:LINODE_TOKEN = 'your-token'"
    Write-Host "  .\deploy\provision-miami.ps1"
    exit 1
}

if ($SkipIfStateExists -and (Test-Path $StateFile)) {
    Write-Host "State file exists: $StateFile (use -SkipIfStateExists:`$false to reprovision)"
    Get-Content $StateFile -Raw | Write-Host
    exit 0
}

if (-not $SshPublicKeyPath) {
    foreach ($candidate in @(
            "$env:USERPROFILE\.ssh\id_ed25519.pub",
            "$env:USERPROFILE\.ssh\id_rsa.pub"
        )) {
        if (Test-Path $candidate) { $SshPublicKeyPath = $candidate; break }
    }
}
$authorizedKey = $null
if ($SshPublicKeyPath -and (Test-Path $SshPublicKeyPath)) {
    $authorizedKey = (Get-Content $SshPublicKeyPath -Raw).Trim()
    Write-Host "Using SSH key: $SshPublicKeyPath"
} else {
    Write-Host "No SSH public key found — Linode will use root password only (check email/panel)." -ForegroundColor Yellow
}

Write-Host "==> Creating Linode in $Region ($LinodeType) ..."
$createBody = @{
    region = $Region
    type   = $LinodeType
    image  = "linode/ubuntu22.04"
    label  = "$LabelPrefix-mia-app"
    tags   = @("hmherbs", "miami")
}
if ($authorizedKey) {
    $createBody.authorized_keys = @($authorizedKey)
    $createBody.root_pass = [Convert]::ToBase64String([guid]::NewGuid().ToByteArray()) + "Aa1!"
}

$linode = Invoke-LinodeApi POST "/linode/instances" $createBody
$linodeId = [int]$linode.id
Write-Host "  Linode id=$linodeId label=$($linode.label)"

$linode = Wait-LinodeRunning -LinodeId $linodeId
$publicIp = Get-InstanceIpv4 -Instance $linode
Write-Host "  Public IP: $publicIp"

Write-Host "==> Allocating private IPv4 for NodeBalancer backend ..."
try {
    Invoke-LinodeApi POST "/networking/ips" @{
        type      = "ipv4"
        public    = $false
        linode_id = $linodeId
    } | Out-Null
} catch {
    Write-Host "  Private IP allocate API note: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Retrying via instance refresh ..."
}

Start-Sleep -Seconds 5
$linode = Invoke-LinodeApi GET "/linode/instances/$linodeId"
$privateIp = Get-InstanceIpv4 -Instance $linode -Private
if (-not $privateIp) {
    throw "No private IP on Linode $linodeId in $Region. Open Cloud Manager -> Linode -> Network -> Add IP -> Private IPv4, then re-run attach-nodebalancer-miami.ps1"
}
Write-Host "  Private IP: $privateIp"

Write-Host "==> Creating NodeBalancer in $Region ..."
$nb = Invoke-LinodeApi POST "/nodebalancers" @{
    region = $Region
    label  = "$LabelPrefix-mia-nb"
    tags   = @("hmherbs", "miami")
}
$nbId = [int]$nb.id
$nbIpv4 = $nb.ipv4
Write-Host "  NodeBalancer id=$nbId public=$nbIpv4"

Write-Host "==> NodeBalancer config :80 HTTP ..."
$config = Invoke-LinodeApi POST "/nodebalancers/$nbId/configs" @{
    port            = 80
    protocol        = "http"
    algorithm       = "roundrobin"
    stickiness      = "none"
    check           = "http"
    check_path      = "/api/health"
    check_interval  = 10
    check_timeout   = 5
    check_attempts  = 3
    check_passive   = $true
}
$configId = [int]$config.id

Write-Host "==> Attaching backend $privateIp`:80 ..."
$node = Invoke-LinodeApi POST "/nodebalancers/$nbId/configs/$configId/nodes" @{
    address = "${privateIp}:80"
    label   = "$LabelPrefix-app-1"
    weight  = 100
    mode    = "accept"
}
Write-Host "  Backend node id=$($node.id) status=$($node.status)"

$sslip = ($nbIpv4 -replace '\.', '-') + ".sslip.io"
$state = [ordered]@{
    createdAt    = (Get-Date).ToString("o")
    region       = $Region
    linodeId     = $linodeId
    linodeLabel  = $linode.label
    linodePublic = $publicIp
    linodePrivate = $privateIp
    nodeBalancerId = $nbId
    nodeBalancerIpv4 = $nbIpv4
    nodeBalancerConfigId = $configId
    tempSslipDomain = $sslip
    tempUrl        = "http://$sslip/"
}

$state | ConvertTo-Json -Depth 4 | Set-Content -Path $StateFile -Encoding UTF8

Write-Host ""
Write-Host "Provisioned. State saved: $StateFile" -ForegroundColor Green
Write-Host ""
Write-Host "Next (automated deploy):"
Write-Host "  .\deploy\migrate-to-miami.ps1 -DeployOnly"
Write-Host ""
Write-Host "Manual checks:"
Write-Host "  1. Create Managed MySQL in Miami (same region) if not done yet"
Write-Host "  2. Allow $publicIp on MySQL Access Controls"
Write-Host "  3. Update deploy\db-connection.env with Miami DB host"
Write-Host "  4. After deploy, test: http://$sslip/api/health"
Write-Host "  5. Point hmherbs.com DNS A record -> $nbIpv4 (when ready)"

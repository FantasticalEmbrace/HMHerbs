# Provision (or reuse) Miami Managed MySQL for HM Herbs.
#
# Requires LINODE_TOKEN with read/write on Databases + VPCs:
#   $env:LINODE_TOKEN = "..."
#   .\deploy\provision-miami-mysql.ps1
#
# Writes deploy/db-connection.env, deploy/miami-mysql.state.json, and CA cert path.
param(
    [string]$Token = $env:LINODE_TOKEN,
    [string]$Region = "us-mia",
    [string]$Label = "hmherbs-miami",
    [string]$DatabaseName = "hmherbs",
    [string]$MiamiLinodeIp = "172.235.131.160",
    [string]$HomeIp = "216.150.13.6",
    [string]$VpcLabel = "hmherbs",
    [switch]$SkipIfActive
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StateFile = Join-Path $Root "deploy\miami-mysql.state.json"
$EnvFile = Join-Path $Root "deploy\db-connection.env"
$CaFile = Join-Path $Root "deploy\hmherbs-miami-ca-certificate.crt"

if (-not $Token) {
    $tokenFile = Join-Path $Root "deploy\.linode-token"
    if (Test-Path $tokenFile) {
        $Token = (Get-Content $tokenFile -Raw).Trim()
    }
}

if (-not $Token) {
    Write-Host "Set LINODE_TOKEN (Cloud Manager -> Profile -> API Tokens)." -ForegroundColor Yellow
    Write-Host '  $env:LINODE_TOKEN = "your-token"'
    Write-Host "  .\deploy\provision-miami-mysql.ps1"
    exit 1
}

function Get-LinodeHeaders {
    @{
        Authorization = "Bearer $Token"
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
        Headers = (Get-LinodeHeaders)
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }
    return Invoke-RestMethod @params
}

function Wait-MySqlActive {
    param([int]$Id, [int]$TimeoutSec = 1800)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $db = Invoke-LinodeApi GET "/databases/mysql/instances/$Id"
        Write-Host "  Cluster status: $($db.status) ..."
        if ($db.status -eq "active") { return $db }
        if ($db.status -in @("failed", "deleted")) {
            throw "MySQL cluster $Id entered status $($db.status)."
        }
        Start-Sleep -Seconds 20
    }
    throw "Timed out waiting for MySQL cluster $Id to become active."
}

function Find-VpcSubnet {
    $vpcs = Invoke-LinodeApi GET "/vpcs"
    $vpc = $vpcs.data | Where-Object { $_.region -eq $Region -and $_.label -like "*$VpcLabel*" } | Select-Object -First 1
    if (-not $vpc) {
        Write-Host "No VPC matching '$VpcLabel' in $Region - creating cluster without VPC (public access only)." -ForegroundColor Yellow
        return $null
    }
    $subnets = Invoke-LinodeApi GET "/vpcs/$($vpc.id)/subnets"
    $subnet = $subnets.data | Select-Object -First 1
    if (-not $subnet) {
        throw "VPC $($vpc.label) has no subnets."
    }
    return @{ vpc_id = $vpc.id; subnet_id = $subnet.id; vpc_label = $vpc.label; subnet_label = $subnet.label }
}

function Get-MySqlPlanType {
    $types = Invoke-LinodeApi GET "/databases/types"
    $match = $types.data | Where-Object {
        $_.label -match "2 GB" -or $_.id -match "standard-2|dedicated-2|2gb" -or $_.disk -ge 2048
    } | Sort-Object { $_.price.hourly } | Select-Object -First 1
    if (-not $match) {
        $match = $types.data | Sort-Object { $_.disk } | Where-Object { $_.disk -ge 2048 } | Select-Object -First 1
    }
    if (-not $match) {
        throw "Could not find a 2 GB Managed MySQL plan type."
    }
    Write-Host "Using plan type: $($match.id) ($($match.label))"
    return $match.id
}

function Get-MySqlEngine {
    $engines = Invoke-LinodeApi GET "/databases/engines"
    $match = $engines.data | Where-Object {
        $_.version -like "8.4*" -or $_.version -like "8.*"
    } | Sort-Object { $_.version } -Descending | Select-Object -First 1
    if (-not $match) {
        throw "No MySQL 8 engine found."
    }
    Write-Host "Using engine: $($match.id) ($($match.version))"
    return $match.id
}

function Ensure-DatabaseSchema {
    param([int]$Id, [string]$Name)
    $existing = Invoke-LinodeApi GET "/databases/mysql/instances/$Id/databases"
    if ($existing.data | Where-Object { $_.label -eq $Name }) {
        Write-Host "Database '$Name' already exists."
        return
    }
    Write-Host "Creating database '$Name' ..."
    Invoke-LinodeApi POST "/databases/mysql/instances/$Id/databases" @{ label = $Name } | Out-Null
}

Write-Host "HM Herbs - Miami Managed MySQL" -ForegroundColor Cyan
Write-Host ""

$allowList = @(
    "$HomeIp/32",
    "$MiamiLinodeIp/32"
)

$existing = Invoke-LinodeApi GET "/databases/mysql/instances"
$cluster = $existing.data | Where-Object { $_.region -eq $Region -and $_.label -eq $Label } | Select-Object -First 1

if ($cluster -and $SkipIfActive -and $cluster.status -eq "active") {
    Write-Host "Reusing existing cluster '$Label' (id $($cluster.id))."
} elseif (-not $cluster) {
    $vpc = Find-VpcSubnet
    $body = @{
        label        = $Label
        region       = $Region
        type         = (Get-MySqlPlanType)
        engine       = (Get-MySqlEngine)
        cluster_size = 1
        allow_list   = $allowList
    }
    if ($vpc) {
        $body.private_network = @{
            public_access = $true
            vpc_id        = $vpc.vpc_id
            subnet_id     = $vpc.subnet_id
        }
        Write-Host "Attaching VPC $($vpc.vpc_label) / $($vpc.subnet_label)"
    }
    Write-Host "Creating MySQL cluster '$Label' in $Region ..."
    $cluster = Invoke-LinodeApi POST "/databases/mysql/instances" $body
    $cluster = Wait-MySqlActive -Id $cluster.id
} else {
    Write-Host "Updating allow list on existing cluster '$Label' (id $($cluster.id)) ..."
    Invoke-LinodeApi PUT "/databases/mysql/instances/$($cluster.id)" @{ allow_list = $allowList } | Out-Null
    if ($cluster.status -ne "active") {
        $cluster = Wait-MySqlActive -Id $cluster.id
    }
}

Ensure-DatabaseSchema -Id $cluster.id -Name $DatabaseName

$creds = Invoke-LinodeApi GET "/databases/mysql/instances/$($cluster.id)/credentials"
$ssl = Invoke-LinodeApi GET "/databases/mysql/instances/$($cluster.id)/ssl"
$ca = $ssl.ca_certificate
if ($ca -is [byte[]]) {
    [System.IO.File]::WriteAllBytes($CaFile, $ca)
} else {
    $caText = [string]$ca
    if ($caText -notmatch '-----BEGIN') {
        $caBytes = [Convert]::FromBase64String($caText.Trim())
        $caText = [Text.Encoding]::UTF8.GetString($caBytes)
    }
    [System.IO.File]::WriteAllText($CaFile, $caText, (New-Object System.Text.UTF8Encoding $false))
}

$hostName = $null
if ($cluster.hosts.endpoints) {
    $hostName = ($cluster.hosts.endpoints | Where-Object { $_.public_access -eq $true } | Select-Object -First 1).address
}
if (-not $hostName) { $hostName = $cluster.hosts.primary }
$port = [string]$cluster.port

$envLines = @(
    "# Akamai Managed MySQL - Miami ($Label)",
    "# Auto-generated by provision-miami-mysql.ps1",
    "",
    "DB_HOST=$hostName",
    "DB_PORT=$port",
    "DB_USER=$($creds.username)",
    "DB_PASSWORD=$($creds.password)",
    "DB_NAME=$DatabaseName",
    "DB_SSL_CA=$CaFile"
)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($EnvFile, ($envLines -join "`n") + "`n", $utf8NoBom)

$state = @{
    id           = $cluster.id
    label        = $cluster.label
    region       = $cluster.region
    host         = $hostName
    port         = $port
    database     = $DatabaseName
    caFile       = $CaFile
    allowList    = $allowList
    updatedAt    = (Get-Date).ToString("o")
}
$state | ConvertTo-Json -Depth 4 | Set-Content $StateFile -Encoding UTF8

Write-Host ""
Write-Host "Miami MySQL ready." -ForegroundColor Green
Write-Host "  Host: ${hostName}:${port}"
Write-Host "  DB:   $DatabaseName"
Write-Host "  CA:   $CaFile"
Write-Host "  Env:  $EnvFile"
Write-Host ""
Write-Host "Next: .\deploy\migrate-db-to-miami.ps1"

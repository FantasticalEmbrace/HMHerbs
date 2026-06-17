# Business One Support Agent — installs RustDesk and registers this PC with the store API.
# Run as Administrator on each Windows register PC.
param(
    [Parameter(Mandatory = $true)]
    [string]$StoreUrl,

    [Parameter(Mandatory = $true)]
    [string]$EnrollKey,

    [string]$MachineLabel = '',
    [string]$RegisterLabel = ''
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib\SupportCommon.ps1"

if (-not (Test-Administrator)) {
    $argList = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
        '-StoreUrl', "`"$StoreUrl`"",
        '-EnrollKey', "`"$EnrollKey`""
    )
    if ($MachineLabel) { $argList += @('-MachineLabel', "`"$MachineLabel`"") }
    if ($RegisterLabel) { $argList += @('-RegisterLabel', "`"$RegisterLabel`"") }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList | Out-Null
    exit
}

try {
    Write-Host 'Business One Support Agent — installing...' -ForegroundColor Cyan
    $store = Normalize-StoreUrl $StoreUrl

    Write-AgentLog "Install started for store $store"
    $remote = Invoke-SupportApi -StoreUrl $store -Path '/config'
    if (-not $remote.enrolled) {
        throw 'Server enrollment is not configured. Set POS_SUPPORT_ENROLL_KEY in backend .env first.'
    }

    Ensure-RustDeskInstalled

    if ($remote.rustdesk.configString) {
        Apply-RustDeskServerConfig -ConfigString $remote.rustdesk.configString
        Write-AgentLog 'Applied RustDesk server config string'
    }

    $password = New-RandomPassword -Length 12
    Set-RustDeskPermanentPassword -Password $password

    $rustdeskId = Get-RustDeskId
    if (-not $rustdeskId) {
        throw 'Could not read RustDesk ID. Open RustDesk once manually, then re-run install.ps1.'
    }

    if (-not $MachineLabel) {
        $MachineLabel = $env:COMPUTERNAME
    }

    $body = @{
        machineLabel = $MachineLabel
        hostname = $env:COMPUTERNAME
        platform = 'windows'
        osVersion = [System.Environment]::OSVersion.VersionString
        rustdeskId = $rustdeskId
        rustdeskPassword = $password
        registerLabel = $RegisterLabel
    }

    $reg = Invoke-SupportApi -StoreUrl $store -Path '/register' -Method 'POST' -Headers @{
        'x-pos-support-enroll' = $EnrollKey
    } -Body $body

    if (-not $reg.agentKey) {
        throw 'Registration succeeded but no agent key was returned.'
    }

    $heartbeat = [int]$remote.heartbeatSeconds
    if ($heartbeat -lt 15) { $heartbeat = 30 }

    $config = [ordered]@{
        storeUrl = $store
        agentKey = $reg.agentKey
        agentId = $reg.agentId
        machineLabel = $MachineLabel
        registerLabel = $RegisterLabel
        heartbeatSeconds = $heartbeat
        rustdeskId = $rustdeskId
        installedAt = (Get-Date).ToString('o')
    }
    Save-AgentConfig -Config $config

    $installDir = Join-Path $script:AgentDataDir 'bin'
    New-Item -ItemType Directory -Force -Path (Join-Path $installDir 'lib') | Out-Null
    Copy-Item -Path (Join-Path $PSScriptRoot 'agent.ps1') -Destination $installDir -Force
    Copy-Item -Path (Join-Path $PSScriptRoot 'lib\SupportCommon.ps1') -Destination (Join-Path $installDir 'lib') -Force

    $agentScript = Join-Path $installDir 'agent.ps1'
    Register-SupportAgentScheduledTask -AgentScriptPath $agentScript -IntervalSeconds $heartbeat

    # Immediate heartbeat
    & $agentScript

    Write-Host ''
    Write-Host 'Installation complete.' -ForegroundColor Green
    Write-Host "  Machine:    $MachineLabel"
    Write-Host "  RustDesk:   $rustdeskId"
    Write-Host "  Agent ID:   $($reg.agentId)"
    Write-Host ''
    Write-Host 'This PC will appear in Admin → POS → Remote support when online.'
    Write-AgentLog "Install complete — agent $($reg.agentId), RustDesk $rustdeskId"
} catch {
    Write-AgentLog $_.Exception.Message 'ERROR'
    Write-Host "Install failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

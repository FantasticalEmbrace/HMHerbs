# Business One Support Agent — heartbeat (runs via scheduled task).
$ErrorActionPreference = 'SilentlyContinue'
. "$PSScriptRoot\lib\SupportCommon.ps1"

$config = Get-AgentConfig
if (-not $config -or -not $config.storeUrl -or -not $config.agentKey) {
    Write-AgentLog 'No agent config — run install.ps1 first' 'WARN'
    exit 0
}

try {
    $rustdeskId = Get-RustDeskId
    if (-not $rustdeskId) { $rustdeskId = $config.rustdeskId }

    $body = @{
        hostname = $env:COMPUTERNAME
        osVersion = [System.Environment]::OSVersion.VersionString
        rustdeskId = $rustdeskId
        registerLabel = $config.registerLabel
    }

    $result = Invoke-SupportApi -StoreUrl $config.storeUrl -Path '/heartbeat' -Method 'POST' -Headers @{
        'x-pos-support-key' = $config.agentKey
    } -Body $body

    if ($rustdeskId -and $rustdeskId -ne $config.rustdeskId) {
        $config.rustdeskId = $rustdeskId
        Save-AgentConfig -Config $config
    }

    if ($result.ok) {
        Write-AgentLog "Heartbeat OK — RustDesk $rustdeskId"
    }
} catch {
    Write-AgentLog "Heartbeat failed: $($_.Exception.Message)" 'WARN'
}

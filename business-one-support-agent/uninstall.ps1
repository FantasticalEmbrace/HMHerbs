# Removes Business One Support Agent scheduled task and local config (does not uninstall RustDesk).
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib\SupportCommon.ps1"

if (-not (Test-Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
    ) | Out-Null
    exit
}

Remove-SupportAgentScheduledTask
$installDir = Join-Path $script:AgentDataDir 'bin'
if (Test-Path $installDir) {
    Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path $script:AgentConfigPath) {
    Remove-Item -Path $script:AgentConfigPath -Force
}
Write-Host 'Support agent removed. RustDesk was left installed.' -ForegroundColor Yellow
Write-AgentLog 'Agent uninstalled'

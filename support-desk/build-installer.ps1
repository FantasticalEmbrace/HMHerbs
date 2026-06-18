#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'node_modules')) {
    Write-Host 'Installing dependencies (first run)...'
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path 'assets\icon.ico')) {
    Write-Host 'Generating installer icon...'
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'scripts\make-icon.ps1')
}

$signingFile = Join-Path $PSScriptRoot 'signing.env'
if (Test-Path $signingFile) {
    Get-Content $signingFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
    if ($env:WIN_CSC_LINK -or $env:CSC_LINK) {
        Write-Host 'Code signing: ENABLED (signing.env loaded)'
        Remove-Item Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
    } else {
        Write-Host 'Code signing: skipped — copy signing.env.example to signing.env when you have a .pfx certificate'
        $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    }
} else {
    Write-Host 'Code signing: skipped — copy signing.env.example to signing.env when you have a .pfx certificate'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
}

Write-Host 'Building Windows installer (NSIS)...'
npm run build:installer
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Done. Installer:'
Get-ChildItem -Path (Join-Path $PSScriptRoot 'dist') -Filter 'Business One Support Desk.exe' | ForEach-Object { Write-Host "  $($_.FullName)" }

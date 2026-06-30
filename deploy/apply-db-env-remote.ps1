# Apply deploy/db-connection.env DB_* values to remote backend/.env
param(
    [Parameter(Mandatory = $true)]
    [string]$Remote,
    [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $EnvFile) { $EnvFile = Join-Path $Root "deploy\db-connection.env" }
if (-not (Test-Path $EnvFile)) { throw "Missing $EnvFile" }

$lines = New-Object System.Collections.Generic.List[string]
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*(DB_[A-Z_]+)=(.*)$') {
        $lines.Add("$($matches[1])=$($matches[2])")
    }
}
if ($lines.Count -eq 0) { throw "No DB_* keys in $EnvFile" }

$lines.Add("DB_SSL=true")
$lines.Add("DB_SSL_CA_PATH=./certs/ca-certificate.crt")

$patchSh = @'
#!/bin/bash
set -eu
ENV=/var/www/hmherbs/backend/.env
touch "$ENV"
'@
foreach ($line in $lines) {
    $k = ($line -split '=', 2)[0]
    $v = ($line -split '=', 2)[1]
    $vEsc = $v -replace '\\', '\\\\' -replace '"', '\"'
    $patchSh += "`nif grep -q '^${k}=' `"`$ENV`"; then sed -i 's|^${k}=.*|${k}=${vEsc}|' `"`$ENV`"; else echo '${k}=${vEsc}' >> `"`$ENV`"; fi"
}

$localSh = Join-Path $env:TEMP "hmherbs-patch-db-env.sh"
$patchSh = $patchSh -replace "`r`n", "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($localSh, $patchSh, $utf8NoBom)
scp -q $localSh "${Remote}:/tmp/patch-db-env.sh"
ssh $Remote "bash /tmp/patch-db-env.sh && rm -f /tmp/patch-db-env.sh"

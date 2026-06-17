# Shared helpers for Business One Support Agent
$script:AgentDataDir = Join-Path $env:ProgramData 'BusinessOne\SupportAgent'
$script:AgentConfigPath = Join-Path $script:AgentDataDir 'config.json'
$script:AgentLogPath = Join-Path $script:AgentDataDir 'agent.log'
$script:RustDeskExe = Join-Path ${env:ProgramFiles} 'RustDesk\rustdesk.exe'
$script:ScheduledTaskName = 'BusinessOneSupportAgent'

function Write-AgentLog {
    param([string]$Message, [string]$Level = 'INFO')
    try {
        if (-not (Test-Path $script:AgentDataDir)) {
            New-Item -ItemType Directory -Force -Path $script:AgentDataDir | Out-Null
        }
        $line = "[{0}] {1} {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
        Add-Content -Path $script:AgentLogPath -Value $line -Encoding UTF8
    } catch { }
}

function Test-Administrator {
    $current = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Administrator {
    if (Test-Administrator) { return }
    $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath) + $args
    Start-Process powershell.exe -Verb RunAs -ArgumentList $args | Out-Null
    exit
}

function Get-AgentConfig {
    if (-not (Test-Path $script:AgentConfigPath)) { return $null }
    try {
        return Get-Content -Raw -Path $script:AgentConfigPath | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Save-AgentConfig {
    param($Config)
    if (-not (Test-Path $script:AgentDataDir)) {
        New-Item -ItemType Directory -Force -Path $script:AgentDataDir | Out-Null
    }
    $Config | ConvertTo-Json -Depth 6 | Set-Content -Path $script:AgentConfigPath -Encoding UTF8
}

function Normalize-StoreUrl {
    param([string]$Url)
    $u = ($Url -replace '/+$', '').Trim()
    if ($u -match '^https?://') { return $u }
    return "https://$u"
}

function Invoke-SupportApi {
    param(
        [string]$StoreUrl,
        [string]$Path,
        [string]$Method = 'GET',
        [hashtable]$Headers = @{},
        [object]$Body = $null
    )
    $base = Normalize-StoreUrl $StoreUrl
    $uri = "$base/api/pos-support/v1$Path"
    $params = @{
        Uri = $uri
        Method = $Method
        Headers = $Headers
        UseBasicParsing = $true
        TimeoutSec = 60
    }
    if ($null -ne $Body) {
        $params.ContentType = 'application/json'
        $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress)
    }
    return Invoke-RestMethod @params
}

function Get-LatestRustDeskDownload {
    $page = Invoke-WebRequest -Uri 'https://github.com/rustdesk/rustdesk/releases/latest' -UseBasicParsing
    $match = [regex]::Match($page.Content, 'href="([^"]+/rustdesk-[^"]+x86_64\.exe)"')
    if (-not $match.Success) {
        throw 'Could not find RustDesk Windows download URL.'
    }
    $href = $match.Groups[1].Value -replace '^/', 'https://github.com/'
    return $href
}

function Ensure-RustDeskInstalled {
    if (Test-Path $script:RustDeskExe) { return }

    Write-AgentLog 'Downloading RustDesk...'
    $tempDir = Join-Path $env:TEMP 'business-one-rustdesk'
    if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Force -Path $tempDir | Out-Null }
    $installer = Join-Path $tempDir 'rustdesk.exe'
    $url = Get-LatestRustDeskDownload
    Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
    Start-Process -FilePath $installer -ArgumentList '--silent-install' -Wait
    Start-Sleep -Seconds 20

    if (-not (Test-Path $script:RustDeskExe)) {
        throw 'RustDesk install failed — executable not found.'
    }

    $service = Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
    if (-not $service) {
        Start-Process -FilePath $script:RustDeskExe -ArgumentList '--install-service' -Wait
        Start-Sleep -Seconds 15
        $service = Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
    }
    if ($service -and $service.Status -ne 'Running') {
        Start-Service -Name 'RustDesk'
        Start-Sleep -Seconds 5
    }
}

function Get-RustDeskId {
    if (-not (Test-Path $script:RustDeskExe)) { return '' }

    # RustDesk is a GUI app; --get-id may land on clipboard instead of stdout.
    $id = ''
    try {
        $job = Start-Job -ScriptBlock {
            param($exe)
            & $exe --get-id 2>&1 | Out-String
        } -ArgumentList $script:RustDeskExe
        Wait-Job -Job $job -Timeout 8 | Out-Null
        $out = Receive-Job -Job $job -ErrorAction SilentlyContinue
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        if ($out) { $id = ($out -replace '\s+', '').Trim() }
    } catch { }

    if (-not $id) {
        try {
            $clip = Get-Clipboard -ErrorAction SilentlyContinue
            if ($clip -match '^\d{6,12}$') { $id = $clip.Trim() }
        } catch { }
    }

    if (-not $id) {
        $configPath = Join-Path $env:APPDATA 'RustDesk\config\RustDesk2.toml'
        if (Test-Path $configPath) {
            $text = Get-Content -Raw -Path $configPath
            $m = [regex]::Match($text, 'id\s*=\s*["'']([^"'']+)["'']')
            if ($m.Success) { $id = $m.Groups[1].Value.Trim() }
        }
    }

    return $id
}

function Set-RustDeskPermanentPassword {
    param([string]$Password)
    if (-not (Test-Path $script:RustDeskExe)) { return }
    Start-Process -FilePath $script:RustDeskExe -ArgumentList @('--password', $Password) -Wait -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

function Apply-RustDeskServerConfig {
    param([string]$ConfigString)
    if (-not $ConfigString -or -not (Test-Path $script:RustDeskExe)) { return }
    Start-Process -FilePath $script:RustDeskExe -ArgumentList @('--config', $ConfigString) -Wait -WindowStyle Hidden
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
    if ($svc) {
        Restart-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
    }
}

function New-RandomPassword {
    param([int]$Length = 12)
    $chars = (65..90) + (97..122) + (48..57)
    return -join ($chars | Get-Random -Count $Length | ForEach-Object { [char]$_ })
}

function Register-SupportAgentScheduledTask {
    param(
        [string]$AgentScriptPath,
        [int]$IntervalSeconds = 30
    )
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentScriptPath`""
    $triggerBoot = New-ScheduledTaskTrigger -AtStartup
    $triggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Seconds $IntervalSeconds) -RepetitionDuration ([TimeSpan]::MaxValue)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0)
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    Unregister-ScheduledTask -TaskName $script:ScheduledTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $script:ScheduledTaskName -Action $action -Trigger @($triggerBoot, $triggerRepeat) -Settings $settings -Principal $principal -Force | Out-Null
}

function Remove-SupportAgentScheduledTask {
    Unregister-ScheduledTask -TaskName $script:ScheduledTaskName -Confirm:$false -ErrorAction SilentlyContinue
}

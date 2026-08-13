param([string]$InstallRoot = "C:\Nexo")

$ErrorActionPreference = "Stop"
$TaskName = "Nexo API"
$TargetScript = Join-Path $InstallRoot "scripts\server-api.ps1"
$Backend = Join-Path $InstallRoot "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Logs = Join-Path $InstallRoot "logs"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute este reparo em um PowerShell aberto como Administrador."
}
if (-not (Test-Path $Python)) { throw "Python do Nexo nao encontrado em $Python" }
if (-not (Test-Path (Split-Path $TargetScript))) { throw "Pasta de scripts do Nexo nao encontrada." }

$scriptContent = @'
param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Logs = Join-Path $Root "logs"
$OutputLog = Join-Path $Logs "api.log"
$ErrorLog = Join-Path $Logs "api-error.log"

if (-not (Test-Path $Python)) { throw "Ambiente Python do Nexo nao encontrado em $Python" }
New-Item -ItemType Directory -Path $Logs -Force | Out-Null
Push-Location $Backend
try {
    & $Python -m uvicorn app.main:app --host 0.0.0.0 --port $Port *>> $OutputLog
    exit $LASTEXITCODE
} catch {
    $_ | Out-String | Add-Content -LiteralPath $ErrorLog
    throw
} finally {
    Pop-Location
}
'@

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$listeners = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
    $processId = [int]$listener.OwningProcess
    if ($processId -gt 0) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}
Get-Process python -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $Python } |
    Stop-Process -Force -ErrorAction SilentlyContinue
Set-Content -LiteralPath $TargetScript -Value $scriptContent -Encoding UTF8

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$TargetScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2
        if ($health.status -eq "ok") { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Host "A API ainda nao respondeu. Consulte $Logs\api-error.log" -ForegroundColor Red
    if (Test-Path (Join-Path $Logs "api-error.log")) { Get-Content (Join-Path $Logs "api-error.log") -Tail 50 }
    exit 1
}

Write-Host "API do Nexo reparada e funcionando em http://127.0.0.1:8000" -ForegroundColor Green

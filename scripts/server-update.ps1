param([string]$InstallRoot = "C:\Nexo")

$ErrorActionPreference = "Stop"
$TaskName = "Nexo API"
$BackupTaskName = "Nexo Backup Diario"
$SourceRoot = Split-Path -Parent $PSScriptRoot
$SourceBackend = Join-Path $SourceRoot "backend"
$SourceScripts = Join-Path $SourceRoot "scripts"
$TargetBackend = Join-Path $InstallRoot "backend"
$TargetScripts = Join-Path $InstallRoot "scripts"
$Python = Join-Path $TargetBackend ".venv\Scripts\python.exe"
$Logs = Join-Path $InstallRoot "logs"
$InstallLog = Join-Path $Logs "install.log"
$BootstrapLog = Join-Path $env:TEMP "Nexo-server-install.log"

New-Item -ItemType Directory -Path $Logs -Force | Out-Null
Start-Transcript -Path $BootstrapLog -Append | Out-Null
trap {
    $message = $_.Exception.Message
    Write-Host "ERRO: $message" -ForegroundColor Red
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
    Copy-Item -LiteralPath $BootstrapLog -Destination $InstallLog -Force -ErrorAction SilentlyContinue
    exit 1
}

function Stop-PortListener([int]$Port) {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $processId = [int]$listener.OwningProcess
        if ($processId -gt 0) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $busy) { return }
        Start-Sleep -Seconds 1
    }
}

function Test-ApiReady {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2
        if ($health.status -ne "ok") { return $false }
        Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/setup/status" -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-ApiReady([int]$Attempts = 30) {
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        if (Test-ApiReady) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Register-NexoApiTask([string]$ScriptPath) {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force | Out-Null
}

function Register-NexoBackupTask([string]$ScriptPath) {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
    $trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $BackupTaskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force | Out-Null
}

function Get-PortDiagnostic {
    $listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { return "Nenhum processo ouvindo na porta 8000." }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    return "Porta 8000: PID $($listener.OwningProcess). Executavel: $($process.ExecutablePath). Comando: $($process.CommandLine)"
}

function Import-NexoEnv([string]$Path) {
    foreach ($line in Get-Content -LiteralPath $Path) {
        if (-not $line -or $line.TrimStart().StartsWith("#") -or $line -notmatch "=") { continue }
        $name, $value = $line -split "=", 2
        Set-Item -Path "Env:$name" -Value $value
    }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute a atualizacao em um PowerShell aberto como Administrador."
}
if (-not (Test-Path $SourceBackend)) { throw "Backend nao encontrado no pacote de atualizacao." }
if (-not (Test-Path $Python)) { throw "Servidor Nexo nao instalado em $InstallRoot" }
if (-not (Test-Path $SourceScripts)) { throw "Scripts de atualizacao nao encontrados no pacote." }

Write-Host "Gerando backup obrigatorio antes da atualizacao..." -ForegroundColor Cyan
Import-NexoEnv (Join-Path $InstallRoot ".env")
Push-Location $SourceBackend
try {
    & $Python -m scripts.backup
    if ($LASTEXITCODE -ne 0) { throw "Atualizacao cancelada porque o backup de seguranca falhou." }
} finally {
    Pop-Location
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Stop-PortListener 8000
$processes = Get-CimInstance Win32_Process -Filter "name = 'python.exe' OR name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine -like "*uvicorn*" -and
        $_.CommandLine -like "*app.main:app*" -and
        $_.CommandLine -like "*--port*" -and
        $_.CommandLine -like "*8000*"
    }
foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1
& robocopy $SourceBackend $TargetBackend /E /R:2 /W:1 /XD .venv __pycache__ .pytest_cache .ruff_cache tests /XF *.pyc *.log | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Falha ao atualizar arquivos do backend." }
New-Item -ItemType Directory -Path $TargetScripts -Force | Out-Null
& robocopy $SourceScripts $TargetScripts /E /R:2 /W:1 /XD .venv __pycache__ .pytest_cache .ruff_cache tests /XF *.pyc *.log | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Falha ao atualizar scripts do servidor." }

Push-Location $TargetBackend
try {
    & $Python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar dependencias." }
    & $Python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar migrations." }
    & $Python -m scripts.seed
    if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar dados iniciais." }
} finally {
    Pop-Location
}

$apiScript = Join-Path $TargetScripts "server-api.ps1"
Register-NexoApiTask $apiScript
Register-NexoBackupTask (Join-Path $TargetScripts "server-backup.ps1")
Start-ScheduledTask -TaskName $TaskName
$ready = Wait-ApiReady 30
if (-not $ready) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-PortListener 8000
    New-Item -ItemType Directory -Path $Logs -Force | Out-Null
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$apiScript`"" -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs "api-fallback.log") -RedirectStandardError (Join-Path $Logs "api-fallback-error.log")
    $ready = Wait-ApiReady 30
    if (-not $ready) {
        throw "A API nao iniciou nem no modo de diagnostico. $(Get-PortDiagnostic) Consulte os logs em C:\Nexo\logs."
    }

    Write-Host "API validada. Transferindo a execucao para a tarefa automatica..." -ForegroundColor Cyan
    Stop-PortListener 8000
    Register-NexoApiTask $apiScript
    Start-ScheduledTask -TaskName $TaskName
    $ready = Wait-ApiReady 30
}
if (-not $ready) {
    throw "A API funciona diretamente, mas a tarefa automatica nao assumiu a execucao. $(Get-PortDiagnostic) Rode C:\Nexo\scripts\repair-server-api.ps1 como Administrador."
}
Write-Host "Servidor Nexo atualizado." -ForegroundColor Green
Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
Copy-Item -LiteralPath $BootstrapLog -Destination $InstallLog -Force -ErrorAction SilentlyContinue

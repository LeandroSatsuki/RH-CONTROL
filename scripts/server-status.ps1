$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "Nexo API"
$BackupTaskName = "Nexo Backup Diario"
$EnvPath = Join-Path $Root ".env"
$BackupDirectory = Join-Path $Root "backups"
$hasCriticalFailure = $false

Write-Host "Nexo - Diagnostico do servidor"
Write-Host ""

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "Tarefa da API: $($task.State)"
    Write-Host "Ultimo resultado: $($taskInfo.LastTaskResult)"
} else {
    Write-Host "Tarefa da API: NAO INSTALADA" -ForegroundColor Red
    $hasCriticalFailure = $true
}

$backupTask = Get-ScheduledTask -TaskName $BackupTaskName -ErrorAction SilentlyContinue
if ($backupTask) {
    $backupTaskInfo = Get-ScheduledTaskInfo -TaskName $BackupTaskName
    Write-Host "Backup diario: $($backupTask.State)"
    Write-Host "Proximo backup: $($backupTaskInfo.NextRunTime)"
    Write-Host "Ultimo resultado do backup: $($backupTaskInfo.LastTaskResult)"
} else {
    Write-Host "Backup diario: NAO INSTALADO" -ForegroundColor Red
}

$latestBackup = Get-ChildItem -LiteralPath $BackupDirectory -Filter "*.dump" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if ($latestBackup) {
    Write-Host "Ultimo arquivo: $($latestBackup.FullName) ($([math]::Round($latestBackup.Length / 1MB, 2)) MB)"
    Write-Host "Criado em: $($latestBackup.LastWriteTime)"
} else {
    Write-Host "Ultimo arquivo: nenhum backup encontrado" -ForegroundColor Yellow
}

$postgres = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue
Write-Host "PostgreSQL 5432: $($postgres.TcpTestSucceeded)"
if (-not $postgres.TcpTestSucceeded) { $hasCriticalFailure = $true }

$api = Test-NetConnection -ComputerName 127.0.0.1 -Port 8000 -WarningAction SilentlyContinue
Write-Host "API 8000: $($api.TcpTestSucceeded)"
if (-not $api.TcpTestSucceeded) { $hasCriticalFailure = $true }

$listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    Write-Host "Processo na porta 8000: $($listener.OwningProcess)"
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "Executavel: $($process.ExecutablePath)"
        Write-Host "Comando: $($process.CommandLine)"
    }
}

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5
    Write-Host "Saude da API: $($health.status)" -ForegroundColor Green
} catch {
    $hasCriticalFailure = $true
    Write-Host "Saude da API: indisponivel" -ForegroundColor Red
    Write-Host "Teste /health: $($_.Exception.Message)" -ForegroundColor Yellow
    try {
        $setup = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/setup/status" -TimeoutSec 5 -UseBasicParsing
        Write-Host "Teste /api/setup/status: HTTP $($setup.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "Teste /api/setup/status: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    $errorLog = Join-Path $Root "logs\api-error.log"
    if (Test-Path $errorLog) {
        Write-Host "Ultimos erros da API:"
        Get-Content $errorLog -Tail 20
    }
}

Write-Host ".env: $(Test-Path $EnvPath)"
Write-Host ""
Write-Host "Enderecos para configurar nos clientes:"
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Sort-Object InterfaceAlias, IPAddress |
    ForEach-Object { Write-Host "http://$($_.IPAddress):8000" }

if ($hasCriticalFailure) { exit 1 }
exit 0

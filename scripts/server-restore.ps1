param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [string]$InstallRoot = "C:\Nexo"
)

$ErrorActionPreference = "Stop"
$TaskName = "Nexo API"
$Backend = Join-Path $InstallRoot "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$ApiScript = Join-Path $InstallRoot "scripts\server-api.ps1"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute a restauração em um PowerShell aberto como Administrador."
}
if (-not (Test-Path $BackupFile)) { throw "Arquivo de backup não encontrado: $BackupFile" }
if (-not (Test-Path $Python)) { throw "Servidor Nexo não encontrado em $InstallRoot" }

Write-Host "Gerando cópia de segurança antes da restauração..." -ForegroundColor Cyan
Push-Location $Backend
try {
    & $Python -m scripts.backup
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível criar o backup de segurança. Restauração cancelada." }
} finally {
    Pop-Location
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$processes = Get-CimInstance Win32_Process -Filter "name = 'python.exe' OR name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*uvicorn*app.main:app*" -and $_.CommandLine -like "*8000*" }
foreach ($process in $processes) { Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Write-Host "Restaurando banco de dados..." -ForegroundColor Cyan
Push-Location $Backend
try {
    & $Python -m scripts.restore_backup --file (Resolve-Path $BackupFile)
    if ($LASTEXITCODE -ne 0) { throw "Falha na restauração. O backup de segurança foi preservado em $InstallRoot\backups." }
    & $Python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Dados restaurados, mas as migrations não foram concluídas." }
} finally {
    Pop-Location
}

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5
$health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 10
if ($health.status -ne "ok") { throw "Restauração concluída, mas a API não respondeu. Rode server-status.ps1." }
Write-Host "Restauração concluída e API disponível." -ForegroundColor Green

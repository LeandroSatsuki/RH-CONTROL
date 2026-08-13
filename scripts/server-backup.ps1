param([string]$InstallRoot = "C:\Nexo")

$ErrorActionPreference = "Stop"
$Backend = Join-Path $InstallRoot "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Log = Join-Path $InstallRoot "logs\backup.log"

if (-not (Test-Path $Python)) { throw "Ambiente Python do Nexo não encontrado." }
New-Item -ItemType Directory -Path (Split-Path $Log) -Force | Out-Null
Push-Location $Backend
try {
    & $Python -m scripts.backup *>> $Log
    if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar backup automático. Consulte $Log" }
} finally {
    Pop-Location
}

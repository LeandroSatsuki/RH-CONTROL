param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [int]$Port = 8000
)

$ErrorActionPreference = "Continue"
$Root = [System.IO.Path]::GetFullPath($Root)
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Logs = Join-Path $Root "logs"
$LogFile = Join-Path $Logs "server-service.log"

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw "Python do servidor não encontrado em $Python. Execute install-server-service.ps1 como administrador."
}

New-Item -ItemType Directory -Path $Logs -Force | Out-Null
Set-Location -LiteralPath $Backend

while ($true) {
    Add-Content -LiteralPath $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Iniciando API Nexo na porta $Port."
    try {
        & $Python -m uvicorn app.main:app --host 0.0.0.0 --port $Port --proxy-headers *>> $LogFile
        $exitCode = $LASTEXITCODE
        Add-Content -LiteralPath $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] API encerrada com código $exitCode. Reinício em 5 segundos."
    } catch {
        Add-Content -LiteralPath $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Falha ao iniciar API: $($_.Exception.Message). Reinício em 5 segundos."
    }
    Start-Sleep -Seconds 5
}

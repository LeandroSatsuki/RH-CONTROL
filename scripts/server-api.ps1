param([int]$Port = 8000)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Logs = Join-Path $Root "logs"
$OutputLog = Join-Path $Logs "api.log"
$ErrorLog = Join-Path $Logs "api-error.log"

if (-not (Test-Path $Python)) {
    throw "Ambiente Python do Nexo nao encontrado em $Python"
}

New-Item -ItemType Directory -Path $Logs -Force | Out-Null
Push-Location $Backend
try {
    # Uvicorn envia logs INFO para stderr. No PowerShell 5.1, com a preferencia
    # Stop, isso vira NativeCommandError e encerra uma API que iniciou normalmente.
    $ErrorActionPreference = "Continue"
    while ($true) {
        "Iniciando API em $(Get-Date -Format s)." | Add-Content -LiteralPath $OutputLog
        & $Python -m uvicorn app.main:app --host 0.0.0.0 --port $Port 1>> $OutputLog 2>> $ErrorLog
        $exitCode = $LASTEXITCODE
        "API encerrada com codigo $exitCode em $(Get-Date -Format s). Reinicio em 5 segundos." | Add-Content -LiteralPath $ErrorLog
        Start-Sleep -Seconds 5
    }
} finally {
    Pop-Location
}

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Logs = Join-Path $Root "logs"
$EnvPath = Join-Path $Root ".env"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"

function Write-Step([string]$Message) {
    Write-Host "[dev-start] $Message"
}

function Test-Port([int]$Port) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return $null -ne $connection
}

function Ensure-Command([string]$Command, [string]$InstallHint) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "$Command nao encontrado. $InstallHint"
    }
}

function Import-FrontendEnv {
    if (-not (Test-Path $EnvPath)) {
        return
    }
    Get-Content $EnvPath | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }
        $parts = $line.Split("=", 2)
        if ($parts[0].Trim() -eq "VITE_API_URL") {
            $env:VITE_API_URL = $parts[1].Trim()
            Write-Step "VITE_API_URL carregado do .env: $env:VITE_API_URL"
        }
    }
}

Ensure-Command -Command "python" -InstallHint "Instale Python 3.12 ou superior."
Ensure-Command -Command "node" -InstallHint "Instale Node.js 20 ou superior."
Ensure-Command -Command "npm.cmd" -InstallHint "Instale Node.js com npm."

if (-not (Test-Path $Logs)) {
    New-Item -ItemType Directory -Path $Logs | Out-Null
}

Write-Step "Preparando banco de dados..."
& (Join-Path $PSScriptRoot "dev-db.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Banco de dados nao esta pronto. Veja as instrucoes acima."
}

Write-Step "Preparando backend e seed..."
& (Join-Path $PSScriptRoot "dev-seed.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Migrations ou seed falharam."
}

if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    Write-Step "Instalando dependencias do frontend..."
    Push-Location $Frontend
    try {
        npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependencias do frontend." }
    } finally {
        Pop-Location
    }
}

Import-FrontendEnv

$backendLog = Join-Path $Logs "backend.log"
$backendErr = Join-Path $Logs "backend.err.log"
$frontendLog = Join-Path $Logs "frontend.log"
$frontendErr = Join-Path $Logs "frontend.err.log"

if (Test-Port -Port 8000) {
    Write-Step "Porta 8000 ja esta em uso. Mantendo backend existente."
} else {
    Write-Step "Iniciando backend em http://127.0.0.1:8000..."
    Start-Process -FilePath $VenvPython `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $Backend `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError $backendErr `
        -PassThru `
        -WindowStyle Hidden | Out-Null
}

if (Test-Port -Port 5173) {
    Write-Step "Porta 5173 ja esta em uso. Mantendo frontend existente."
} else {
    Write-Step "Iniciando frontend em http://127.0.0.1:5173..."
    Start-Process -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") `
        -WorkingDirectory $Frontend `
        -RedirectStandardOutput $frontendLog `
        -RedirectStandardError $frontendErr `
        -PassThru `
        -WindowStyle Hidden | Out-Null
}

Write-Host ""
Write-Host "Ambiente local iniciado."
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Backend:  http://127.0.0.1:8000"
Write-Host "API docs: http://127.0.0.1:8000/docs"
Write-Host ""
Write-Host "Usuario inicial: admin"
Write-Host "Senha inicial:   Admin@123"
Write-Host ""
Write-Host "Logs:"
Write-Host "Backend:  $backendLog"
Write-Host "Frontend: $frontendLog"

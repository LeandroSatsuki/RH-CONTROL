$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$EnvPath = Join-Path $Root ".env"
$EnvExamplePath = Join-Path $Root ".env.example"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"

function Write-Step([string]$Message) {
    Write-Host "[dev-seed] $Message"
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python nao encontrado. Instale Python 3.12 ou superior e tente novamente."
}

if (-not (Test-Path $EnvPath)) {
    Copy-Item $EnvExamplePath $EnvPath
    Write-Step "Arquivo .env criado a partir de .env.example."
}

if (-not (Test-Path $VenvPython)) {
    Write-Step "Criando ambiente virtual do backend..."
    Push-Location $Backend
    try {
        python -m venv .venv
    } finally {
        Pop-Location
    }
}

Push-Location $Backend
try {
    & $VenvPython -c "import alembic, fastapi, psycopg, pytest, sqlalchemy" *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Step "Instalando dependencias do backend..."
        & $VenvPython -m pip install -r requirements-dev.txt
        if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependencias do backend." }
    } else {
        Write-Step "Dependencias do backend ja instaladas."
    }

    Write-Step "Aplicando migrations..."
    & $VenvPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao aplicar migrations. Verifique se o PostgreSQL esta rodando e se DATABASE_URL esta correto no .env."
    }

    Write-Step "Executando seed inicial..."
    & $VenvPython -m scripts.seed
    if ($LASTEXITCODE -ne 0) { throw "Falha ao executar seed inicial." }
} finally {
    Pop-Location
}

Write-Step "Migrations e seed concluidos."

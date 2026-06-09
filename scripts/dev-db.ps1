$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $Root ".env"
$EnvExamplePath = Join-Path $Root ".env.example"

function Write-Step([string]$Message) {
    Write-Host "[dev-db] $Message"
}

function Ensure-EnvFile {
    if (-not (Test-Path $EnvPath)) {
        Copy-Item $EnvExamplePath $EnvPath
        Write-Step "Arquivo .env criado a partir de .env.example."
    }
}

function Read-EnvFile {
    $values = @{}
    if (Test-Path $EnvPath) {
        Get-Content $EnvPath | ForEach-Object {
            $line = $_.Trim()
            if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
                return
            }
            $parts = $line.Split("=", 2)
            $values[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
    return $values
}

function Test-DockerCompose {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        return $false
    }
    & docker compose version *> $null
    return $LASTEXITCODE -eq 0
}

function Wait-PostgresInDocker([string]$User, [string]$Database) {
    Write-Step "Aguardando PostgreSQL ficar pronto..."
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        & docker compose exec -T postgres pg_isready -U $User -d $Database *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Step "PostgreSQL pronto."
            return
        }
        Start-Sleep -Seconds 2
    }
    throw "PostgreSQL do Docker nao ficou pronto dentro do tempo esperado."
}

function Test-LocalPostgres([string]$HostName, [int]$Port) {
    try {
        $result = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
        return [bool]$result.TcpTestSucceeded
    } catch {
        return $false
    }
}

Ensure-EnvFile
$envValues = Read-EnvFile
$postgresDb = $envValues["POSTGRES_DB"]
$postgresUser = $envValues["POSTGRES_USER"]
if (-not $postgresDb) { $postgresDb = "indicadores_folha" }
if (-not $postgresUser) { $postgresUser = "indicadores" }

if (Test-DockerCompose) {
    Write-Step "Docker encontrado. Subindo PostgreSQL via docker compose..."
    Push-Location $Root
    try {
        & docker compose up -d postgres
        if ($LASTEXITCODE -ne 0) {
            throw "docker compose up falhou. Verifique se o Docker Desktop esta aberto."
        }
        Wait-PostgresInDocker -User $postgresUser -Database $postgresDb
    } finally {
        Pop-Location
    }
    exit 0
}

Write-Step "Docker nao encontrado."
if (Test-LocalPostgres -HostName "127.0.0.1" -Port 5432) {
    Write-Step "Foi encontrado um PostgreSQL local em 127.0.0.1:5432."
    Write-Step "Garanta que usuario, senha e banco do .env ja existam antes de rodar migrations."
    exit 0
}

Write-Host ""
Write-Host "PostgreSQL indisponivel para desenvolvimento local."
Write-Host ""
Write-Host "Opcao recomendada:"
Write-Host "1. Instale e abra o Docker Desktop."
Write-Host "2. Rode novamente: .\scripts\dev-db.ps1"
Write-Host ""
Write-Host "Alternativa sem Docker:"
Write-Host "1. Instale PostgreSQL 16 ou superior."
Write-Host "2. Crie o banco e usuario definidos no .env:"
Write-Host "   POSTGRES_DB=$postgresDb"
Write-Host "   POSTGRES_USER=$postgresUser"
Write-Host "3. Confirme que a porta 5432 esta acessivel em 127.0.0.1."
Write-Host ""
exit 1

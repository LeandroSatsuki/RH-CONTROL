param(
    [string]$InstallRoot = "C:\Nexo",
    [string]$PostgresAdminUser = "postgres",
    [string]$PostgresAdminPassword = "",
    [string]$InitialAdminPassword = "",
    [string]$PythonExecutable = ""
)

$ErrorActionPreference = "Stop"
$TaskName = "Nexo API"
$BackupTaskName = "Nexo Backup Diario"
$FirewallName = "Nexo API 8000"
$SourceRoot = Split-Path -Parent $PSScriptRoot
$SourceBackend = Join-Path $SourceRoot "backend"
$TargetBackend = Join-Path $InstallRoot "backend"
$TargetScripts = Join-Path $InstallRoot "scripts"
$TargetEnv = Join-Path $InstallRoot ".env"
$InstallLogs = Join-Path $InstallRoot "logs"
$InstallLog = Join-Path $InstallLogs "install.log"
$BootstrapLog = Join-Path $env:TEMP "Nexo-server-install.log"

Start-Transcript -Path $BootstrapLog -Append | Out-Null
trap {
    $message = $_.Exception.Message
    Write-Host "ERRO: $message" -ForegroundColor Red
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
    if (Test-Path $InstallLogs) {
        Copy-Item -LiteralPath $BootstrapLog -Destination $InstallLog -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

New-Item -ItemType Directory -Path $InstallLogs -Force | Out-Null

function Write-Step([string]$Message) {
    Write-Host "[Nexo Servidor] $Message" -ForegroundColor Cyan
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Execute este instalador em um PowerShell aberto como Administrador."
    }
}

function Read-Secret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Find-Psql {
    $command = Get-Command psql -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $root = "C:\Program Files\PostgreSQL"
    if (Test-Path $root) {
        $candidate = Get-ChildItem $root -Directory |
            Sort-Object { [int]($_.Name -replace '\D', '') } -Descending |
            ForEach-Object { Join-Path $_.FullName "bin\psql.exe" } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1
        if ($candidate) { return $candidate }
    }
    throw "PostgreSQL nao encontrado. Instale PostgreSQL 16 ou superior neste computador e execute novamente."
}

function Invoke-Psql([string]$Psql, [string]$Sql) {
    $output = & $Psql -h 127.0.0.1 -U $PostgresAdminUser -d postgres -v ON_ERROR_STOP=1 -tAc $Sql 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel autenticar no PostgreSQL. Se ele ja estava instalado, informe a senha atual do usuario postgres. Detalhe: $($output -join ' ')"
    }
    return $output
}

function Get-EnvValue([string]$Path, [string]$Name) {
    if (-not (Test-Path $Path)) { return "" }
    $escaped = [regex]::Escape($Name)
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$escaped=" } | Select-Object -First 1
    if (-not $line) { return "" }
    return $line.Substring($Name.Length + 1)
}

function Set-EnvValue([string]$Path, [string]$Name, [string]$Value) {
    $lines = @()
    if (Test-Path $Path) {
        $lines = @(Get-Content -LiteralPath $Path)
    }
    $escaped = [regex]::Escape($Name)
    $found = $false
    $updated = @(
        foreach ($line in $lines) {
            if ($line -match "^$escaped=") {
                $found = $true
                "$Name=$Value"
            } else {
                $line
            }
        }
    )
    if (-not $found) {
        $updated += "$Name=$Value"
    }
    Set-Content -LiteralPath $Path -Value $updated -Encoding UTF8
}

function Stop-NexoApiProcess {
    Write-Step "Parando API antiga do Nexo, se existir..."
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $listeners = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $processId = [int]$listener.OwningProcess
        if ($processId -gt 0) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
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
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        $busy = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $busy) { return }
        Start-Sleep -Seconds 1
    }
    $remaining = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($remaining) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($remaining.OwningProcess)" -ErrorAction SilentlyContinue
        throw "A porta 8000 continua ocupada pelo processo $($remaining.OwningProcess): $($process.CommandLine)"
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

function Get-PortDiagnostic {
    $listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { return "Nenhum processo ouvindo na porta 8000." }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    return "Porta 8000: PID $($listener.OwningProcess). Executavel: $($process.ExecutablePath). Comando: $($process.CommandLine)"
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
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $BackupTaskName -Action $action -Trigger $trigger -Principal $principal -Settings $taskSettings -Force | Out-Null
}

Assert-Administrator
if (-not $PostgresAdminPassword) { $PostgresAdminPassword = $env:NEXO_POSTGRES_ADMIN_PASSWORD }
if (-not $InitialAdminPassword) { $InitialAdminPassword = $env:NEXO_INITIAL_ADMIN_PASSWORD }
if (-not $PythonExecutable) { $PythonExecutable = $env:NEXO_PYTHON_EXECUTABLE }
if (-not $PythonExecutable) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) { $PythonExecutable = $pythonCommand.Source }
}
if (-not $PythonExecutable -or -not (Test-Path $PythonExecutable)) {
    throw "Python 3.12 ou superior nao encontrado. Instale o Python marcando Add Python to PATH."
}
if (-not (Test-Path $SourceBackend)) {
    throw "Pasta backend nao encontrada no pacote do servidor."
}

if (-not $InitialAdminPassword) {
    $InitialAdminPassword = Read-Secret "Senha inicial do administrador do Nexo"
}
if ($InitialAdminPassword.Length -lt 8) {
    throw "A senha inicial do administrador deve ter pelo menos 8 caracteres."
}

$existingDatabaseUrl = Get-EnvValue $TargetEnv "DATABASE_URL"
$existingInstall = (Test-Path $TargetEnv) -and $existingDatabaseUrl
$psql = Find-Psql

if ($existingInstall) {
    Write-Step "Instalacao existente encontrada. Atualizando sem recriar o banco."
} else {
    if (-not $PostgresAdminPassword) {
        $PostgresAdminPassword = Read-Secret "Senha do usuario postgres"
    }

    $databasePassword = -join ((1..32) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
    $secretKey = -join ((1..64) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
    $escapedDbPassword = $databasePassword.Replace("'", "''")
    $env:PGPASSWORD = $PostgresAdminPassword

    try {
        Write-Step "Validando PostgreSQL..."
        $pgIsReady = Join-Path (Split-Path $psql) "pg_isready.exe"
        for ($attempt = 1; $attempt -le 30; $attempt++) {
            & $pgIsReady -h 127.0.0.1 -p 5432 *> $null
            if ($LASTEXITCODE -eq 0) { break }
            Start-Sleep -Seconds 2
        }
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL nao iniciou na porta 5432 dentro do tempo esperado." }
        Invoke-Psql $psql "SELECT 1" | Out-Null
        $roleExists = ((& $psql -h 127.0.0.1 -U $PostgresAdminUser -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='indicadores'") | Out-String).Trim()
        if ($roleExists -ne "1") {
            Invoke-Psql $psql "CREATE ROLE indicadores LOGIN PASSWORD '$escapedDbPassword'"
        } else {
            Invoke-Psql $psql "ALTER ROLE indicadores WITH LOGIN PASSWORD '$escapedDbPassword'"
        }
        $databaseExists = ((& $psql -h 127.0.0.1 -U $PostgresAdminUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='indicadores_folha'") | Out-String).Trim()
        if ($databaseExists -ne "1") {
            Invoke-Psql $psql "CREATE DATABASE indicadores_folha OWNER indicadores"
        }
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

Write-Step "Copiando arquivos para $InstallRoot..."
New-Item -ItemType Directory -Path $InstallRoot, $TargetBackend, $TargetScripts, (Join-Path $InstallRoot "logs"), (Join-Path $InstallRoot "backups") -Force | Out-Null
Stop-NexoApiProcess
& robocopy $SourceBackend $TargetBackend /E /R:2 /W:1 /XD .venv __pycache__ .pytest_cache .ruff_cache tests /XF *.pyc *.log | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Falha ao copiar o backend para $TargetBackend" }
Copy-Item (Join-Path $PSScriptRoot "server-api.ps1") $TargetScripts -Force
Copy-Item (Join-Path $PSScriptRoot "server-status.ps1") $TargetScripts -Force
Copy-Item (Join-Path $PSScriptRoot "server-update.ps1") $TargetScripts -Force
Copy-Item (Join-Path $PSScriptRoot "repair-server-api.ps1") $TargetScripts -Force
Copy-Item (Join-Path $PSScriptRoot "reset-admin-password.ps1") $TargetScripts -Force
Copy-Item (Join-Path $PSScriptRoot "server-backup.ps1") $TargetScripts -Force
Copy-Item (Join-Path $PSScriptRoot "server-restore.ps1") $TargetScripts -Force

$envContent = @"
POSTGRES_DB=indicadores_folha
POSTGRES_USER=indicadores
POSTGRES_PASSWORD=$databasePassword
DATABASE_URL=postgresql+psycopg://indicadores:$databasePassword@127.0.0.1:5432/indicadores_folha
SECRET_KEY=$secretKey
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=$InitialAdminPassword
BACKUP_DIRECTORY=$InstallRoot\backups
POSTGRES_BIN=$(Split-Path $psql)
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,null
CNPJ_LOOKUP_URL=https://apigateway.conectagov.estaleiro.serpro.gov.br/api-cnpj-empresa/v2/empresa/
CNPJ_LOOKUP_BEARER_TOKEN=
CNPJ_LOOKUP_TIMEOUT_SECONDS=8
"@
if ($existingInstall) {
    Set-EnvValue $TargetEnv "INITIAL_ADMIN_PASSWORD" $InitialAdminPassword
    Set-EnvValue $TargetEnv "POSTGRES_BIN" (Split-Path $psql)
    if (-not (Get-EnvValue $TargetEnv "CNPJ_LOOKUP_URL")) {
        Set-EnvValue $TargetEnv "CNPJ_LOOKUP_URL" "https://apigateway.conectagov.estaleiro.serpro.gov.br/api-cnpj-empresa/v2/empresa/"
    }
    if (-not (Get-EnvValue $TargetEnv "CNPJ_LOOKUP_BEARER_TOKEN")) {
        Set-EnvValue $TargetEnv "CNPJ_LOOKUP_BEARER_TOKEN" ""
    }
    if (-not (Get-EnvValue $TargetEnv "CNPJ_LOOKUP_TIMEOUT_SECONDS")) {
        Set-EnvValue $TargetEnv "CNPJ_LOOKUP_TIMEOUT_SECONDS" "8"
    }
} else {
    Set-Content -LiteralPath $TargetEnv -Value $envContent -Encoding UTF8
}

Write-Step "Preparando ambiente Python..."
$python = Join-Path $TargetBackend ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    & $PythonExecutable -m venv (Join-Path $TargetBackend ".venv")
}
& $python -m pip install --upgrade pip
& $python -m pip install -r (Join-Path $TargetBackend "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependencias da API." }

Write-Step "Aplicando migrations e seed..."
Push-Location $TargetBackend
try {
    & $python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar migrations." }
    & $python -m scripts.seed
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar dados iniciais." }
    & $python -m scripts.reset_admin_password
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar a senha inicial do administrador." }
} finally {
    Pop-Location
}

Write-Step "Registrando inicializacao automatica..."
$apiScript = Join-Path $TargetScripts "server-api.ps1"
Register-NexoApiTask $apiScript
$backupScript = Join-Path $TargetScripts "server-backup.ps1"
Register-NexoBackupTask $backupScript

if (-not (Get-NetFirewallRule -DisplayName $FirewallName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $FirewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000 -Profile Domain,Private | Out-Null
}

Start-ScheduledTask -TaskName $TaskName
Write-Step "Aguardando API..."
$ready = Wait-ApiReady 30
if (-not $ready) {
    Write-Step "Agendador nao respondeu a tempo. Validando a API diretamente antes de reparar a tarefa..."
    Stop-NexoApiProcess
    $fallbackLog = Join-Path $InstallLogs "api-fallback.log"
    $fallbackErr = Join-Path $InstallLogs "api-fallback-error.log"
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$apiScript`"" -WindowStyle Hidden -RedirectStandardOutput $fallbackLog -RedirectStandardError $fallbackErr
    $ready = Wait-ApiReady 30
    if (-not $ready) {
        throw "A API nao iniciou nem no modo de diagnostico. $(Get-PortDiagnostic) Verifique C:\Nexo\logs\api.log e C:\Nexo\logs\api-error.log."
    }

    Write-Step "API validada. Transferindo a execucao para a tarefa automatica..."
    $listeners = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        if ([int]$listener.OwningProcess -gt 0) {
            Stop-Process -Id ([int]$listener.OwningProcess) -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
    Register-NexoApiTask $apiScript
    Start-ScheduledTask -TaskName $TaskName
    $ready = Wait-ApiReady 30
}
if (-not $ready) {
    throw "A API funciona diretamente, mas a tarefa automatica nao assumiu a execucao. $(Get-PortDiagnostic) Rode C:\Nexo\scripts\repair-server-api.ps1 como Administrador."
}

Write-Host ""
Write-Host "Servidor Nexo instalado com sucesso." -ForegroundColor Green
Write-Host "Usuario inicial: admin"
Write-Host "Configure os aplicativos clientes com um dos enderecos abaixo:"
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Sort-Object InterfaceAlias, IPAddress |
    ForEach-Object { Write-Host "http://$($_.IPAddress):8000" -ForegroundColor Yellow }

Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
Copy-Item -LiteralPath $BootstrapLog -Destination $InstallLog -Force -ErrorAction SilentlyContinue

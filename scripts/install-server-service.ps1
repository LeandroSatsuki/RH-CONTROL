param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [string]$TaskName = "NexoServer",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$Root = [System.IO.Path]::GetFullPath($Root)
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Requirements = Join-Path $Backend "requirements.txt"
$EnvFile = Join-Path $Root ".env"
$Runner = Join-Path $PSScriptRoot "server-runner.ps1"

function Write-Step([string]$Message) {
    Write-Host "[Nexo Server] $Message"
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute este script como Administrador."
}

foreach ($requiredPath in @($Backend, $Requirements, $EnvFile, $Runner)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Arquivo obrigatório não encontrado: $requiredPath"
    }
}

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $systemPython) {
        throw "Python não encontrado. Instale o Python 3.12 antes de configurar o servidor."
    }
    Write-Step "Criando ambiente Python do servidor..."
    & $systemPython.Source -m venv (Join-Path $Backend ".venv")
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o ambiente Python." }
}

Write-Step "Atualizando somente os componentes da aplicação..."
& $Python -m pip install --disable-pip-version-check -r $Requirements
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar dependências do servidor." }

Push-Location $Backend
try {
    Write-Step "Aplicando atualizações compatíveis da estrutura do banco..."
    & $Python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar migrations. A base existente não foi apagada." }

    Write-Step "Validando cadastros iniciais sem duplicar registros..."
    & $Python -m scripts.seed
    if ($LASTEXITCODE -ne 0) { throw "Falha na validação dos dados iniciais." }
} finally {
    Pop-Location
}

$powerShell = Join-Path $PSHOME "powershell.exe"
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Runner`" -Root `"$Root`" -Port $Port"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $Backend
$trigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Write-Step "Registrando inicialização automática e reinício em caso de falha..."
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Description "API Nexo com inicialização automática e recuperação de falhas." -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Step "Aguardando resposta da API..."
$ready = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
        if ($response.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {
        # O processo pode ainda estar inicializando ou aguardando a porta ficar livre.
    }
}

if (-not $ready) {
    $logPath = Join-Path $Root "logs\server-service.log"
    throw "A tarefa foi instalada, mas a API não respondeu. Consulte $logPath e o Agendador de Tarefas ($TaskName)."
}

Write-Step "Servidor ativo. A tarefa $TaskName iniciará com o Windows e reiniciará a API automaticamente."
Write-Step "A base existente foi preservada."

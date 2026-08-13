param([string]$Version = "1.0.3")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$StageRoot = Join-Path $Root "deploy\package"
$PackageName = "Nexo-Servidor-$Version"
$Stage = Join-Path $StageRoot $PackageName
$Output = Join-Path $Root "entregas\$PackageName.zip"

if (Test-Path $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $Stage "backend"), (Join-Path $Stage "scripts") -Force | Out-Null

& robocopy (Join-Path $Root "backend") (Join-Path $Stage "backend") /E /R:2 /W:1 /XD .venv __pycache__ .pytest_cache .ruff_cache tests /XF *.pyc *.log | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Falha ao preparar backend." }

foreach ($name in "server-install.ps1", "server-api.ps1", "server-status.ps1", "server-update.ps1", "server-backup.ps1", "server-restore.ps1", "repair-server-api.ps1", "reset-admin-password.ps1") {
    Copy-Item (Join-Path $PSScriptRoot $name) (Join-Path $Stage "scripts") -Force
}
Copy-Item (Join-Path $Root "deploy\SERVIDOR.md") (Join-Path $Stage "LEIA-ME.md") -Force

$Commit = (& git -C $Root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $Commit) { throw "Nao foi possivel identificar o commit da versao." }
@"
Nexo Servidor
Versao: $Version
Commit: $Commit
Gerado em: $([DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss zzz"))
"@ | Set-Content -LiteralPath (Join-Path $Stage "RELEASE-METADATA.txt") -Encoding UTF8

if (Test-Path $Output) { Remove-Item -LiteralPath $Output -Force }
Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Output -CompressionLevel Optimal
Write-Host "Pacote criado: $Output"

param([string]$Version = "0.1.12")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$InstallerDir = Join-Path $Root "installer"
$Payload = Join-Path $InstallerDir "payload"
$Client = Join-Path $Root "frontend\release\Nexo-$Version.exe"
$Server = Join-Path $Root "entregas\Nexo-Servidor-$Version.zip"
$NsisRoot = "C:\Users\lpsan\AppData\Local\electron-builder\Cache\nsis\nsis-3.0.4.1-nsis-3.0.4.1"
$MakeNsis = Join-Path $NsisRoot "Bin\makensis.exe"

foreach ($required in $Client, $Server, $MakeNsis) {
    if (-not (Test-Path $required)) { throw "Arquivo necessario nao encontrado: $required" }
}

New-Item -ItemType Directory -Path $Payload -Force | Out-Null
Remove-Item -LiteralPath (Join-Path $Payload "Nexo-$Version.exe"), (Join-Path $Payload "Nexo-Servidor-$Version.zip") -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $Client -Destination (Join-Path $Payload "Nexo-$Version.exe") -Force
Copy-Item -LiteralPath $Server -Destination (Join-Path $Payload "Nexo-Servidor-$Version.zip") -Force

foreach ($artifact in (Join-Path $Payload "Nexo-$Version.exe"), (Join-Path $Payload "Nexo-Servidor-$Version.zip")) {
    if (-not (Test-Path $artifact)) { throw "Artefato nao foi copiado: $artifact" }
    if ((Get-Item $artifact).Length -le 0) { throw "Artefato vazio: $artifact" }
}

Push-Location $InstallerDir
try {
    & $MakeNsis "/INPUTCHARSET" "UTF8" "/DAPP_VERSION=$Version" "nexo-setup.nsi"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador unificado." }
} finally {
    Pop-Location
}

Write-Host "Instalador criado: $Root\entregas\Nexo-Setup-$Version.exe"

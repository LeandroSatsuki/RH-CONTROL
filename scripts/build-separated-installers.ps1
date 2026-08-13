param([string]$Version = "1.0.2")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$InstallerDir = Join-Path $Root "installer"
$Payload = Join-Path $InstallerDir "payload"
$Client = Join-Path $Root "frontend\release\Nexo-$Version.exe"
$Server = Join-Path $Root "entregas\Nexo-Servidor-$Version.zip"
$NsisRoot = "C:\Users\lpsan\AppData\Local\electron-builder\Cache\nsis\nsis-3.0.4.1-nsis-3.0.4.1"
$MakeNsis = Join-Path $NsisRoot "Bin\makensis.exe"
$ClientDelivery = Join-Path $Root "entregas\Nexo-Cliente-Setup-$Version.exe"

foreach ($required in $Client, $Server, $MakeNsis) {
    if (-not (Test-Path $required)) { throw "Arquivo necessario nao encontrado: $required" }
    if ((Get-Item $required).Length -le 0) { throw "Arquivo vazio: $required" }
}

New-Item -ItemType Directory -Path $Payload, (Join-Path $Root "entregas") -Force | Out-Null
Remove-Item -LiteralPath (Join-Path $Payload "Nexo-Servidor-$Version.zip") -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $Server -Destination (Join-Path $Payload "Nexo-Servidor-$Version.zip") -Force
Copy-Item -LiteralPath $Client -Destination $ClientDelivery -Force

Push-Location $InstallerDir
try {
    & $MakeNsis "/INPUTCHARSET" "UTF8" "/DAPP_VERSION=$Version" "nexo-server-setup.nsi"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador do servidor." }
} finally {
    Pop-Location
}

foreach ($artifact in (Join-Path $Root "entregas\Nexo-Servidor-Setup-$Version.exe"), $ClientDelivery) {
    if (-not (Test-Path $artifact)) { throw "Artefato nao foi gerado: $artifact" }
    if ((Get-Item $artifact).Length -le 0) { throw "Artefato vazio: $artifact" }
}

Write-Host "Instalador do servidor: $Root\entregas\Nexo-Servidor-Setup-$Version.exe"
Write-Host "Instalador do cliente:  $ClientDelivery"

param([string]$Version = "1.0.7")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$InstallerDir = Join-Path $Root "installer"
$Payload = Join-Path $InstallerDir "payload"
$Client = Join-Path $Root "frontend\release\Nexo-$Version.exe"
$ClientBlockMap = Join-Path $Root "frontend\release\Nexo-$Version.exe.blockmap"
$ClientUpdateManifest = Join-Path $Root "frontend\release\latest.yml"
$Server = Join-Path $Root "entregas\Nexo-Servidor-$Version.zip"
$NsisCache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache"
$MakeNsis = Get-ChildItem (Join-Path $NsisCache "nsis-*") -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq "Bin" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
$NsisResources = Get-ChildItem (Join-Path $NsisCache "nsis-resources-*") -Recurse -Filter nsisunz.dll -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq "x86-unicode" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty DirectoryName
$ClientDelivery = Join-Path $Root "entregas\Nexo-Cliente-Setup-$Version.exe"

foreach ($required in $Client, $ClientBlockMap, $ClientUpdateManifest, $Server, $MakeNsis, $NsisResources) {
    if (-not (Test-Path $required)) { throw "Arquivo necessario nao encontrado: $required" }
    if ((Get-Item $required).Length -le 0) { throw "Arquivo vazio: $required" }
}

New-Item -ItemType Directory -Path $Payload, (Join-Path $Root "entregas") -Force | Out-Null
Remove-Item -LiteralPath (Join-Path $Payload "Nexo-Servidor-$Version.zip") -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $Server -Destination (Join-Path $Payload "Nexo-Servidor-$Version.zip") -Force
Copy-Item -LiteralPath $Client -Destination $ClientDelivery -Force
Copy-Item -LiteralPath $Client -Destination (Join-Path $Root "entregas\Nexo-$Version.exe") -Force
Copy-Item -LiteralPath $ClientBlockMap -Destination (Join-Path $Root "entregas\Nexo-$Version.exe.blockmap") -Force
Copy-Item -LiteralPath $ClientUpdateManifest -Destination (Join-Path $Root "entregas\latest.yml") -Force

Push-Location $InstallerDir
try {
    & $MakeNsis "/INPUTCHARSET" "UTF8" "/DAPP_VERSION=$Version" "/DNSIS_RESOURCES=$NsisResources" "nexo-server-setup.nsi"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador do servidor." }
    & $MakeNsis "/INPUTCHARSET" "UTF8" "/DAPP_VERSION=$Version" "/DNSIS_RESOURCES=$NsisResources" "nexo-server-updater.nsi"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o atualizador do servidor." }
} finally {
    Pop-Location
}

foreach ($artifact in (Join-Path $Root "entregas\Nexo-Servidor-Setup-$Version.exe"), (Join-Path $Root "entregas\Nexo-Servidor-Atualizador-$Version.exe"), $ClientDelivery, (Join-Path $Root "entregas\Nexo-$Version.exe"), (Join-Path $Root "entregas\Nexo-$Version.exe.blockmap"), (Join-Path $Root "entregas\latest.yml")) {
    if (-not (Test-Path $artifact)) { throw "Artefato nao foi gerado: $artifact" }
    if ((Get-Item $artifact).Length -le 0) { throw "Artefato vazio: $artifact" }
}

Write-Host "Instalador do servidor: $Root\entregas\Nexo-Servidor-Setup-$Version.exe"
Write-Host "Atualizador do servidor: $Root\entregas\Nexo-Servidor-Atualizador-$Version.exe"
Write-Host "Instalador do cliente:  $ClientDelivery"
Write-Host "Assets do auto-update:  Nexo-$Version.exe, Nexo-$Version.exe.blockmap e latest.yml"

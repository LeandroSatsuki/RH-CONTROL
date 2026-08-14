param([string]$Version = "1.0.6")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$InstallerDir = Join-Path $Root "installer"
$Payload = Join-Path $InstallerDir "payload"
$ServerPackage = Join-Path $Root "entregas\Nexo-Servidor-$Version.zip"
$PayloadPackage = Join-Path $Payload "Nexo-Servidor-$Version.zip"
$NsisCache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache"
$MakeNsis = Get-ChildItem (Join-Path $NsisCache "nsis-*") -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq "Bin" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
$NsisResources = Get-ChildItem (Join-Path $NsisCache "nsis-resources-*") -Recurse -Filter nsisunz.dll -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq "x86-unicode" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty DirectoryName
$Output = Join-Path $Root "entregas\Nexo-Servidor-Setup-$Version.exe"

if (-not (Test-Path $ServerPackage)) { throw "Pacote do servidor nao encontrado: $ServerPackage" }
if ((Get-Item $ServerPackage).Length -le 0) { throw "Pacote do servidor esta vazio: $ServerPackage" }
if (-not (Test-Path $MakeNsis)) { throw "Compilador NSIS nao encontrado: $MakeNsis" }
if (-not (Test-Path $NsisResources)) { throw "Plugins NSIS nao encontrados: $NsisResources" }

New-Item -ItemType Directory -Path $Payload -Force | Out-Null
Copy-Item -LiteralPath $ServerPackage -Destination $PayloadPackage -Force

Push-Location $InstallerDir
try {
    & $MakeNsis "/INPUTCHARSET" "UTF8" "/DAPP_VERSION=$Version" "/DNSIS_RESOURCES=$NsisResources" "nexo-server-setup.nsi"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador do servidor." }
} finally {
    Pop-Location
}

if (-not (Test-Path $Output)) { throw "Instalador nao foi gerado: $Output" }
if ((Get-Item $Output).Length -le 0) { throw "Instalador gerado esta vazio: $Output" }

Write-Host "Instalador do servidor criado: $Output" -ForegroundColor Green

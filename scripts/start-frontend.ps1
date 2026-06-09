$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $Root "frontend")
& npm.cmd install
& npm.cmd run dev

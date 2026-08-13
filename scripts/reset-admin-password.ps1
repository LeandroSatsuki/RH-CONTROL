param([string]$InstallRoot = "C:\Nexo")

$ErrorActionPreference = "Stop"
$Backend = Join-Path $InstallRoot "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute este utilitario em um PowerShell aberto como Administrador."
}
if (-not (Test-Path $Python)) { throw "Servidor Nexo nao encontrado em $InstallRoot" }

$secure = Read-Host "Nova senha do usuario admin" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
if ($password.Length -lt 8) { throw "A senha precisa ter pelo menos 8 caracteres." }

$env:NEXO_NEW_ADMIN_PASSWORD = $password
$pythonCode = @'
import os
from sqlalchemy import select
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User

password = os.environ["NEXO_NEW_ADMIN_PASSWORD"]
with SessionLocal() as db:
    user = db.scalar(select(User).where(User.username == "admin"))
    if not user:
        raise RuntimeError("Usuário admin não encontrado")
    user.password_hash = hash_password(password)
    db.commit()
print("Senha do usuário admin atualizada.")
'@

Push-Location $Backend
try {
    & $Python -c $pythonCode
    if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar a senha." }
} finally {
    Pop-Location
    Remove-Item Env:NEXO_NEW_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}

Write-Host "Login: admin" -ForegroundColor Green
Write-Host "Senha atualizada com sucesso." -ForegroundColor Green

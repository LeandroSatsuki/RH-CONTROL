$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $Root "backend")

if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
& ".\.venv\Scripts\python.exe" -m alembic upgrade head
& ".\.venv\Scripts\python.exe" -m scripts.seed
& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000

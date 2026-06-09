import os
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.engine import make_url

from app.core.config import settings


def create_postgres_backup(directory: str | Path) -> Path:
    target_dir = Path(directory)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"indicadores_{datetime.now():%Y%m%d_%H%M%S}.dump"
    env = os.environ.copy()
    url = make_url(settings.database_url)
    if url.password:
        env["PGPASSWORD"] = url.password
    command = [
        "pg_dump",
        "--format=custom",
        "--file",
        str(target),
        "--host",
        url.host or "localhost",
        "--port",
        str(url.port or 5432),
        "--username",
        url.username or "",
        url.database or "",
    ]
    try:
        subprocess.run(command, env=env, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        message = exc.stderr.strip() or "pg_dump retornou erro"
        raise RuntimeError(message) from exc
    return target


def remove_old_backups(directory: str | Path, retention_days: int = 90) -> int:
    cutoff = datetime.now() - timedelta(days=retention_days)
    removed = 0
    for path in Path(directory).glob("indicadores_*.dump"):
        if datetime.fromtimestamp(path.stat().st_mtime) < cutoff:
            path.unlink()
            removed += 1
    return removed

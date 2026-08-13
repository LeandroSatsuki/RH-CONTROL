import os
import hashlib
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.engine import make_url

from app.core.config import settings


def find_postgres_tool(name: str) -> str:
    executable = f"{name}.exe" if os.name == "nt" else name
    configured = getattr(settings, "postgres_bin", None)
    if configured:
        candidate = Path(configured) / executable
        if candidate.is_file():
            return str(candidate)
    discovered = shutil.which(executable) or shutil.which(name)
    if discovered:
        return discovered
    if os.name == "nt":
        roots = [os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")]
        candidates: list[Path] = []
        for root in filter(None, roots):
            candidates.extend(Path(root).glob(f"PostgreSQL/*/bin/{executable}"))
        if candidates:
            return str(sorted(candidates, key=lambda path: path.parts[-3], reverse=True)[0])
    raise RuntimeError(
        f"{executable} não encontrado. Instale as ferramentas do PostgreSQL ou configure POSTGRES_BIN."
    )


def backup_checksum(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_postgres_backup(path: str | Path) -> dict[str, str | int | bool]:
    backup_path = Path(path)
    if not backup_path.is_file() or backup_path.stat().st_size == 0:
        raise RuntimeError("Arquivo de backup vazio ou inexistente")
    command = [find_postgres_tool("pg_restore"), "--list", str(backup_path)]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        message = exc.stderr.strip() or "pg_restore não reconheceu o arquivo"
        raise RuntimeError(message) from exc
    entries = sum(1 for line in result.stdout.splitlines() if line and not line.startswith(";"))
    if entries == 0:
        raise RuntimeError("Backup não contém objetos restauráveis")
    return {
        "valid": True,
        "entries": entries,
        "size_bytes": backup_path.stat().st_size,
        "sha256": backup_checksum(backup_path),
    }


def create_postgres_backup(directory: str | Path) -> Path:
    target_dir = Path(directory)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"nexo_{datetime.now():%Y%m%d_%H%M%S}.dump"
    partial = target.with_suffix(".partial")
    env = os.environ.copy()
    url = make_url(settings.database_url)
    if url.password:
        env["PGPASSWORD"] = url.password
    command = [
        find_postgres_tool("pg_dump"),
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        str(partial),
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
        verify_postgres_backup(partial)
        partial.replace(target)
    except subprocess.CalledProcessError as exc:
        partial.unlink(missing_ok=True)
        message = exc.stderr.strip() or "pg_dump retornou erro"
        raise RuntimeError(message) from exc
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    return target


def remove_old_backups(directory: str | Path, retention_days: int = 90) -> int:
    cutoff = datetime.now() - timedelta(days=retention_days)
    removed = 0
    for pattern in ("nexo_*.dump", "indicadores_*.dump"):
        for path in Path(directory).glob(pattern):
            if datetime.fromtimestamp(path.stat().st_mtime) < cutoff:
                path.unlink()
                removed += 1
    return removed

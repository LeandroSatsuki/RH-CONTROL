from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.dependencies import AdminUser, DbSession
from app.core.config import settings
from app.models.system_setting import SystemSetting
from app.services.backup import create_postgres_backup, remove_old_backups, verify_postgres_backup

router = APIRouter()


def backup_directory(db: DbSession) -> Path:
    configured = db.scalar(
        select(SystemSetting)
        .where(SystemSetting.backup_directory != "")
        .order_by(SystemSetting.id)
    )
    return Path(configured.backup_directory) if configured else settings.backup_directory


def backup_path(db: DbSession, filename: str) -> Path:
    if Path(filename).name != filename or not filename.endswith(".dump"):
        raise HTTPException(status_code=400, detail="Nome de backup inválido")
    directory = backup_directory(db).resolve()
    path = (directory / filename).resolve()
    if path.parent != directory or not path.is_file():
        raise HTTPException(status_code=404, detail="Backup não encontrado")
    return path


def human_size(path: Path) -> str:
    size = path.stat().st_size
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    if size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    return f"{size / (1024 * 1024 * 1024):.1f} GB"


@router.get("")
def list_backups(db: DbSession, _: AdminUser) -> list[dict[str, str | int]]:
    directory = backup_directory(db)
    if not directory.exists():
        return []
    items = sorted(
        [*directory.glob("nexo_*.dump"), *directory.glob("indicadores_*.dump")],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return [
        {
            "id": index + 1,
            "date": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
            "file": path.name,
            "size": human_size(path),
            "status": "Disponível",
        }
        for index, path in enumerate(items)
    ]


@router.get("/status")
def backup_status(db: DbSession, _: AdminUser) -> dict[str, bool | str]:
    directory = backup_directory(db)
    prefixes = (f"nexo_{date.today():%Y%m%d}_", f"indicadores_{date.today():%Y%m%d}_")
    exists = directory.exists() and any(path.name.startswith(prefixes) for path in directory.glob("*.dump"))
    return {"backup_exists_today": exists, "directory": str(directory)}


@router.post("")
def create_backup(db: DbSession, _: AdminUser) -> dict[str, str | int]:
    directory = backup_directory(db)
    try:
        path = create_postgres_backup(directory)
        removed = remove_old_backups(directory)
    except (OSError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar backup: {exc}") from exc
    verification = verify_postgres_backup(path)
    return {
        "path": str(path),
        "file": path.name,
        "old_backups_removed": removed,
        **verification,
    }


@router.get("/{filename}/verify")
def verify_backup(filename: str, db: DbSession, _: AdminUser) -> dict[str, str | int | bool]:
    return verify_postgres_backup(backup_path(db, filename))


@router.get("/{filename}/download")
def download_backup(filename: str, db: DbSession, _: AdminUser) -> FileResponse:
    path = backup_path(db, filename)
    return FileResponse(path, filename=path.name, media_type="application/octet-stream")

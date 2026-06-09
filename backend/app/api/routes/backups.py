from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api.dependencies import AdminUser, DbSession
from app.core.config import settings
from app.models.system_setting import SystemSetting
from app.services.backup import create_postgres_backup, remove_old_backups

router = APIRouter()


@router.get("/status")
def backup_status(db: DbSession, _: AdminUser) -> dict[str, bool | str]:
    configured = db.get(SystemSetting, 1)
    directory = Path(configured.backup_directory or settings.backup_directory) if configured else settings.backup_directory
    today_prefix = f"indicadores_{date.today():%Y%m%d}_"
    exists = directory.exists() and any(path.name.startswith(today_prefix) for path in directory.glob("*.dump"))
    return {"backup_exists_today": exists, "directory": str(directory)}


@router.post("")
def create_backup(db: DbSession, _: AdminUser) -> dict[str, str | int]:
    configured = db.get(SystemSetting, 1)
    directory = configured.backup_directory if configured and configured.backup_directory else settings.backup_directory
    try:
        path = create_postgres_backup(directory)
        removed = remove_old_backups(directory)
    except (OSError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar backup: {exc}") from exc
    return {"path": str(path), "old_backups_removed": removed}


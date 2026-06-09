from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.dependencies import DbSession
from app.core.security import hash_password
from app.models.enums import UserRole
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.setup import InitialSetup, SetupStatus

router = APIRouter()


@router.get("/status", response_model=SetupStatus)
def setup_status(db: DbSession) -> SetupStatus:
    return SetupStatus(configured=db.get(SystemSetting, 1) is not None)


@router.post("", status_code=201)
def initial_setup(payload: InitialSetup, db: DbSession) -> dict[str, str]:
    if db.get(SystemSetting, 1):
        raise HTTPException(status_code=409, detail="Sistema já configurado")

    settings = SystemSetting(
        id=1,
        company_name=payload.company_name,
        backup_directory=payload.backup_directory,
        auto_backup_on_start=payload.auto_backup_on_start,
        include_saturdays=payload.include_saturdays,
        include_sundays=payload.include_sundays,
        default_daily_hours=payload.default_daily_hours,
    )
    db.add(settings)
    admin = db.scalar(select(User).where(User.username == payload.admin_username.strip()))
    if admin:
        admin.full_name = payload.admin_full_name.strip()
        admin.password_hash = hash_password(payload.admin_password)
        admin.role = UserRole.ADMIN
        admin.active = True
    else:
        db.add(
            User(
                username=payload.admin_username.strip(),
                full_name=payload.admin_full_name.strip(),
                password_hash=hash_password(payload.admin_password),
                role=UserRole.ADMIN,
            )
        )
    db.commit()
    return {"message": "Configuração inicial concluída"}

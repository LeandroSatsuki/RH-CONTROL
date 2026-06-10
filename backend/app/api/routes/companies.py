from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.company import Company
from app.models.system_setting import SystemSetting
from app.schemas.catalog import CompanyCreate, CompanyRead

router = APIRouter()


@router.get("", response_model=list[CompanyRead])
def list_companies(db: DbSession, _: CurrentUser) -> list[Company]:
    return list(db.scalars(select(Company).order_by(Company.code)))


@router.post("", response_model=CompanyRead, status_code=201)
def create_company(payload: CompanyCreate, db: DbSession, _: AdminUser) -> Company:
    item = Company(**payload.model_dump())
    db.add(item)
    try:
        db.flush()
        db.add(
            SystemSetting(
                id=item.id,
                company_id=item.id,
                company_name=item.name,
                backup_directory="",
                auto_backup_on_start=True,
                include_saturdays=False,
                include_sundays=False,
                default_daily_hours=8.8,
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Código de empresa já existe") from None
    db.refresh(item)
    return item

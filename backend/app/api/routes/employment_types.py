from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.company import Company
from app.models.employment_type import EmploymentType
from app.schemas.catalog import EmploymentTypeCreate, EmploymentTypeRead

router = APIRouter()


@router.get("", response_model=list[EmploymentTypeRead])
def list_employment_types(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[EmploymentType]:
    query = select(EmploymentType).order_by(EmploymentType.name)
    if company_id != 0:
        query = query.where(EmploymentType.company_id == company_id)
    return list(db.scalars(query))


@router.post("", response_model=EmploymentTypeRead, status_code=201)
def create_employment_type(
    payload: EmploymentTypeCreate, db: DbSession, _: AdminUser
) -> EmploymentType:
    if not db.get(Company, payload.company_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    item = EmploymentType(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Modalidade já existe para esta empresa") from None
    db.refresh(item)
    return item

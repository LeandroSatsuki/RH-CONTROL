from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.company import Company
from app.models.result_center import ResultCenter
from app.schemas.catalog import ResultCenterCreate, ResultCenterRead

router = APIRouter()


@router.get("", response_model=list[ResultCenterRead])
def list_result_centers(db: DbSession, _: CurrentUser, company_id: int = 1) -> list[ResultCenter]:
    query = select(ResultCenter).order_by(ResultCenter.code)
    if company_id != 0:
        query = query.where(ResultCenter.company_id == company_id)
    return list(db.scalars(query))


@router.post("", response_model=ResultCenterRead, status_code=201)
def create_result_center(payload: ResultCenterCreate, db: DbSession, _: AdminUser) -> ResultCenter:
    if not db.get(Company, payload.company_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    item = ResultCenter(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Código de Centro de Resultado já existe para esta empresa") from None
    db.refresh(item)
    return item

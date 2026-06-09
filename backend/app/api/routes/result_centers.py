from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.result_center import ResultCenter
from app.schemas.catalog import ResultCenterCreate, ResultCenterRead

router = APIRouter()


@router.get("", response_model=list[ResultCenterRead])
def list_result_centers(db: DbSession, _: CurrentUser) -> list[ResultCenter]:
    return list(db.scalars(select(ResultCenter).order_by(ResultCenter.code)))


@router.post("", response_model=ResultCenterRead, status_code=201)
def create_result_center(payload: ResultCenterCreate, db: DbSession, _: AdminUser) -> ResultCenter:
    item = ResultCenter(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Código de Centro de Resultado já existe") from None
    db.refresh(item)
    return item


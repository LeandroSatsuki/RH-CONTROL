from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.company import Company
from app.models.result_center import ResultCenter
from app.schemas.catalog import ResultCenterCreate, ResultCenterRead, ResultCenterUpdate

router = APIRouter()


def catalog_company_id(db: DbSession, company_id: int) -> int:
    if company_id != 0:
        if not db.get(Company, company_id):
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
        return company_id
    primary_id = db.scalar(
        select(Company.id).order_by(Company.is_primary.desc(), Company.id)
    )
    if primary_id is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return primary_id


@router.get("", response_model=list[ResultCenterRead])
def list_result_centers(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[ResultCenter]:
    if company_id == 0:
        return list(db.scalars(select(ResultCenter).order_by(ResultCenter.company_id, ResultCenter.code)))
    scope_id = catalog_company_id(db, company_id)
    query = (
        select(ResultCenter)
        .where(ResultCenter.company_id == scope_id)
        .order_by(ResultCenter.code)
    )
    return list(db.scalars(query))


@router.post("", response_model=ResultCenterRead, status_code=201)
def create_result_center(
    payload: ResultCenterCreate, db: DbSession, _: AdminUser, company_id: int = 1
) -> ResultCenter:
    scope_id = catalog_company_id(db, payload.company_id or company_id)
    code = payload.code.strip().upper()
    if db.scalar(select(ResultCenter.id).where(ResultCenter.code == code).limit(1)):
        raise HTTPException(
            status_code=409,
            detail="Código de Centro de Resultado já existe no catálogo global",
        )
    companies = list(db.scalars(select(Company).order_by(Company.id)))
    created: ResultCenter | None = None
    for company in companies:
        item = ResultCenter(
            company_id=company.id,
            code=code,
            name=payload.name.strip().upper(),
            color=payload.color,
            active=payload.active,
        )
        db.add(item)
        if company.id == scope_id:
            created = item
    try:
        db.flush()
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Código de Centro de Resultado já existe no catálogo global",
        ) from None
    if created is None:
        raise HTTPException(
            status_code=409,
            detail="Não foi possível criar o Centro de Resultado global",
        )
    db.refresh(created)
    return created


@router.patch("/{item_id}", response_model=ResultCenterRead)
def update_result_center(
    item_id: int,
    payload: ResultCenterUpdate,
    db: DbSession,
    _: AdminUser,
    company_id: int = 1,
) -> ResultCenter:
    item = db.get(ResultCenter, item_id)
    if not item:
        raise HTTPException(
            status_code=404, detail="Centro de Resultado não encontrado"
        )
    catalog_company_id(db, company_id)
    old_code = item.code
    changes = payload.model_dump(exclude_unset=True)
    next_code = str(changes.get("code", old_code)).strip().upper()
    collision = db.scalar(
        select(ResultCenter.id)
        .where(ResultCenter.code == next_code, ResultCenter.code != old_code)
        .limit(1)
    )
    if collision:
        raise HTTPException(
            status_code=409,
            detail="Código de Centro de Resultado já existe no catálogo global",
        )
    related = list(
        db.scalars(select(ResultCenter).where(ResultCenter.code == old_code))
    )
    for related_item in related:
        for field, value in changes.items():
            setattr(
                related_item,
                field,
                value.strip().upper() if field in {"code", "name"} else value,
            )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Código de Centro de Resultado já existe no catálogo global",
        ) from None
    db.refresh(item)
    return item

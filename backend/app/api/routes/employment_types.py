from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.company import Company
from app.models.employment_type import EmploymentType
from app.schemas.catalog import (
    EmploymentTypeCreate,
    EmploymentTypeRead,
    EmploymentTypeUpdate,
)

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


@router.get("", response_model=list[EmploymentTypeRead])
def list_employment_types(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[EmploymentType]:
    if company_id == 0:
        return list(db.scalars(select(EmploymentType).order_by(EmploymentType.company_id, EmploymentType.name)))
    scope_id = catalog_company_id(db, company_id)
    query = (
        select(EmploymentType)
        .where(EmploymentType.company_id == scope_id)
        .order_by(EmploymentType.name)
    )
    return list(db.scalars(query))


@router.post("", response_model=EmploymentTypeRead, status_code=201)
def create_employment_type(
    payload: EmploymentTypeCreate, db: DbSession, _: AdminUser, company_id: int = 1
) -> EmploymentType:
    scope_id = catalog_company_id(db, payload.company_id or company_id)
    name = payload.name.strip().upper()
    existing = list(db.scalars(select(EmploymentType)))
    if any(item.name.strip().upper() == name for item in existing):
        raise HTTPException(
            status_code=409, detail="Modalidade já existe no catálogo global"
        )
    companies = list(db.scalars(select(Company).order_by(Company.id)))
    created: EmploymentType | None = None
    for company in companies:
        item = EmploymentType(
            company_id=company.id,
            name=name,
            has_charges=payload.has_charges,
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
            status_code=409, detail="Modalidade já existe no catálogo global"
        ) from None
    if created is None:
        raise HTTPException(
            status_code=409, detail="Não foi possível criar a modalidade global"
        )
    db.refresh(created)
    return created


@router.patch("/{item_id}", response_model=EmploymentTypeRead)
def update_employment_type(
    item_id: int,
    payload: EmploymentTypeUpdate,
    db: DbSession,
    _: AdminUser,
    company_id: int = 1,
) -> EmploymentType:
    item = db.get(EmploymentType, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Modalidade não encontrada")
    catalog_company_id(db, company_id)
    old_name = item.name.strip().upper()
    changes = payload.model_dump(exclude_unset=True)
    next_name = str(changes.get("name", old_name)).strip().upper()
    existing = list(db.scalars(select(EmploymentType)))
    if any(
        candidate.name.strip().upper() == next_name
        and candidate.name.strip().upper() != old_name
        for candidate in existing
    ):
        raise HTTPException(
            status_code=409, detail="Modalidade já existe no catálogo global"
        )
    related = [
        candidate
        for candidate in existing
        if candidate.name.strip().upper() == old_name
    ]
    for related_item in related:
        for field, value in changes.items():
            setattr(
                related_item, field, value.strip().upper() if field == "name" else value
            )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Modalidade já existe no catálogo global"
        ) from None
    db.refresh(item)
    return item

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.company import Company
from app.models.employment import Employee, Employment, SalaryHistory
from app.models.employment_type import EmploymentType
from app.models.result_center import ResultCenter
from app.schemas.employee import EmployeeCreate, EmploymentRead, SalaryHistoryCreate

router = APIRouter()


def employment_query():
    return (
        select(Employment)
        .options(
            joinedload(Employment.employee),
            joinedload(Employment.employment_type),
            joinedload(Employment.result_center),
            selectinload(Employment.salary_history),
        )
        .order_by(Employee.full_name)
        .join(Employment.employee)
    )


@router.get("", response_model=list[EmploymentRead])
def list_employees(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[Employment]:
    query = employment_query()
    if company_id != 0:
        query = query.where(Employment.company_id == company_id)
    return list(db.scalars(query))


@router.post("", response_model=EmploymentRead, status_code=201)
def create_employee(payload: EmployeeCreate, db: DbSession, _: AdminUser) -> Employment:
    if not db.get(Company, payload.company_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    if db.scalar(select(Employee).where(Employee.cpf == payload.cpf)):
        raise HTTPException(
            status_code=409,
            detail="CPF já cadastrado. Novos vínculos devem ser criados no histórico da pessoa.",
        )
    employment_type = db.get(EmploymentType, payload.employment_type_id)
    if not employment_type:
        raise HTTPException(status_code=404, detail="Modalidade não encontrada")
    result_center = db.get(ResultCenter, payload.result_center_id)
    if not result_center:
        raise HTTPException(status_code=404, detail="Centro de Resultado não encontrado")
    if employment_type.company_id != payload.company_id:
        raise HTTPException(status_code=409, detail="Modalidade não pertence à empresa selecionada")
    if result_center.company_id != payload.company_id:
        raise HTTPException(status_code=409, detail="Centro de Resultado não pertence à empresa selecionada")

    data = payload.model_dump(exclude={"cpf", "full_name", "company_id"})
    person = Employee(company_id=payload.company_id, cpf=payload.cpf, full_name=payload.full_name)
    employment = Employment(company_id=payload.company_id, employee=person, **data)
    employment.salary_history.append(
        SalaryHistory(
            effective_date=payload.admission_date,
            amount=payload.salary_base,
            family_allowance=0,
            reason="Cadastro inicial",
        )
    )
    db.add(employment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Matrícula já cadastrada") from None
    return db.scalar(
        employment_query().where(Employment.id == employment.id)
    )


@router.post("/{employment_id}/salary-history", response_model=EmploymentRead, status_code=201)
def add_salary_history(
    employment_id: int,
    payload: SalaryHistoryCreate,
    db: DbSession,
    _: AdminUser,
    company_id: int = 1,
) -> Employment:
    employment_query = select(Employment).where(Employment.id == employment_id)
    if company_id != 0:
        employment_query = employment_query.where(Employment.company_id == company_id)
    employment = db.scalar(employment_query)
    if not employment:
        raise HTTPException(status_code=404, detail="Vínculo não encontrado")

    history = SalaryHistory(
        employment_id=employment.id,
        effective_date=payload.effective_date,
        amount=payload.amount,
        family_allowance=payload.family_allowance,
        reason=payload.reason,
    )
    employment.salary_base = payload.amount
    db.add(history)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Já existe um ajuste histórico para esta data.",
        ) from None
    refreshed_query = select(Employment).options(
        joinedload(Employment.employee),
        joinedload(Employment.employment_type),
        joinedload(Employment.result_center),
        selectinload(Employment.salary_history),
    )
    return db.scalar(
        refreshed_query.where(Employment.id == employment.id)
    )

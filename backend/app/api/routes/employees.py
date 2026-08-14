from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.core.security import verify_password
from app.models.audit_entry import AuditEntry
from app.models.benefit import BenefitDistribution
from app.models.company import Company
from app.models.employment import Employee, Employment, SalaryHistory
from app.models.employment_type import EmploymentType
from app.models.mei_contract import MeiContract
from app.models.movement import Movement
from app.models.payroll_override import PayrollOverride
from app.models.launch import LaunchItem
from app.models.result_center import ResultCenter
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmploymentRead, SalaryHistoryCreate

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


def next_employee_code(
    db: DbSession, *, company_id: int, center_code: str, exclude_id: int
) -> str:
    prefix = center_code.strip().upper()
    codes = db.scalars(
        select(Employment.employee_code).where(
            Employment.company_id == company_id,
            Employment.id != exclude_id,
            Employment.employee_code.like(f"{prefix}-%"),
        )
    )
    last_number = max(
        (
            int(code.rsplit("-", 1)[-1])
            for code in codes
            if code.rsplit("-", 1)[-1].isdigit()
        ),
        default=0,
    )
    return f"{prefix}-{last_number + 1:03d}"


@router.get("", response_model=list[EmploymentRead])
def list_employees(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[Employment]:
    query = employment_query()
    if company_id != 0:
        query = query.where(Employment.company_id == company_id)
    return list(db.scalars(query))


@router.post("", response_model=EmploymentRead, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    db: DbSession,
    _: AdminUser,
    company_id: int | None = None,
) -> Employment:
    target_company_id = company_id if company_id is not None else payload.company_id
    if not db.get(Company, target_company_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    duplicate = db.scalar(select(Employee).where(Employee.cpf == payload.cpf))
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"CPF/CNPJ já cadastrado para {duplicate.full_name}. Reative ou transfira o cadastro existente.",
        )
    employment_type = db.get(EmploymentType, payload.employment_type_id)
    if not employment_type:
        raise HTTPException(status_code=404, detail="Modalidade não encontrada")
    result_center = db.get(ResultCenter, payload.result_center_id)
    if not result_center:
        raise HTTPException(status_code=404, detail="Centro de Resultado não encontrado")
    if employment_type.company_id != target_company_id:
        raise HTTPException(status_code=409, detail="Modalidade não pertence à empresa selecionada")
    if result_center.company_id != target_company_id:
        raise HTTPException(status_code=409, detail="Centro de Resultado não pertence à empresa selecionada")

    data = payload.model_dump(exclude={"cpf", "full_name", "company_id"})
    person = Employee(company_id=target_company_id, cpf=payload.cpf, full_name=payload.full_name)
    employment = Employment(company_id=target_company_id, employee=person, **data)
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


@router.patch("/{employment_id}", response_model=EmploymentRead)
def update_employee(
    employment_id: int,
    payload: EmployeeUpdate,
    db: DbSession,
    _: AdminUser,
    company_id: int = 1,
) -> Employment:
    query = employment_query().where(Employment.id == employment_id)
    if company_id != 0:
        query = query.where(Employment.company_id == company_id)
    employment = db.scalar(query)
    if not employment:
        raise HTTPException(status_code=404, detail="Vínculo não encontrado")

    data = payload.model_dump(exclude_unset=True)
    full_name = data.pop("full_name", None)
    salary_mode = data.pop("salary_mode", None)
    target_company_id = data.pop("company_id", employment.company_id)
    employment_type_id = data.pop("employment_type_id", None)
    result_center_id = data.pop("result_center_id", None)

    target_company = db.get(Company, target_company_id)
    if not target_company:
        raise HTTPException(status_code=404, detail="Empresa de destino não encontrada")
    previous_company_id = employment.company_id
    previous_result_center_id = employment.result_center_id
    result_center_changed = (
        result_center_id is not None
        and result_center_id != previous_result_center_id
    )

    if employment_type_id is not None:
        employment_type = db.get(EmploymentType, employment_type_id)
        if not employment_type or employment_type.company_id != target_company_id:
            raise HTTPException(status_code=409, detail="Modalidade não pertence à empresa de destino")
        employment.employment_type = employment_type
    if result_center_id is not None:
        result_center = db.get(ResultCenter, result_center_id)
        if not result_center or result_center.company_id != target_company_id:
            raise HTTPException(status_code=409, detail="Centro de Resultado não pertence à empresa de destino")
        employment.result_center = result_center
    if target_company_id != previous_company_id:
        if employment.result_center.company_id != target_company_id:
            raise HTTPException(status_code=409, detail="Selecione um Centro de Resultado da empresa de destino")
        if employment.employment_type.company_id != target_company_id:
            raise HTTPException(status_code=409, detail="Selecione uma modalidade da empresa de destino")
        employment.company_id = target_company_id
        employment.employee.company_id = target_company_id
        db.add(
            Movement(
                company_id=target_company_id,
                competency=date.today().strftime("%Y-%m"),
                employee_id=employment.id,
                type="transferência entre empresas",
                start_date=date.today(),
                end_date=None,
                days=0,
                hour_impact=0,
                observation=f"TRANSFERÊNCIA ENTRE EMPRESAS: {previous_company_id} PARA {target_company_id}",
                status="Aplicada",
            )
        )
    if (
        target_company_id != previous_company_id
        or result_center_changed
    ):
        employment.employee_code = next_employee_code(
            db,
            company_id=target_company_id,
            center_code=employment.result_center.code,
            exclude_id=employment.id,
        )
    if full_name is not None:
        employment.employee.full_name = full_name.strip().upper()

    next_salary = data.pop("salary_base", None)
    for field, value in data.items():
        setattr(employment, field, value)
    if next_salary is not None:
        employment.salary_base = next_salary
        if salary_mode == "correction" and employment.salary_history:
            latest = max(employment.salary_history, key=lambda item: item.effective_date)
            latest.amount = next_salary
            latest.reason = "CORREÇÃO CADASTRAL"

    db.commit()
    return db.scalar(employment_query().where(Employment.id == employment.id))


@router.delete("/{employment_id}")
def delete_employee(
    employment_id: int,
    payload: dict[str, str],
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> dict[str, bool]:
    if not verify_password(str(payload.get("password") or ""), user.password_hash):
        raise HTTPException(status_code=403, detail="Senha de confirmação inválida.")

    query = employment_query().where(Employment.id == employment_id)
    if company_id != 0:
        query = query.where(Employment.company_id == company_id)
    employment = db.scalar(query)
    if not employment:
        raise HTTPException(status_code=404, detail="Vínculo não encontrado")

    linked_records = [
        (Movement, Movement.employee_id, "movimentações"),
        (MeiContract, MeiContract.employee_id, "contratos MEI"),
        (BenefitDistribution, BenefitDistribution.employee_id, "benefícios lançados"),
        (PayrollOverride, PayrollOverride.employment_id, "ajustes de folha"),
        (LaunchItem, LaunchItem.employment_id, "lançamentos"),
    ]
    blockers = [
        label
        for model, field, label in linked_records
        if db.scalar(select(model.id).where(field == employment.id).limit(1)) is not None
    ]
    if blockers:
        raise HTTPException(
            status_code=409,
            detail=(
                "Este colaborador possui registros vinculados: "
                f"{', '.join(blockers)}. Inative-o para preservar o histórico."
            ),
        )

    employee = employment.employee
    employee_name = employee.full_name
    employee_code = employment.employee_code
    company_id_for_audit = employment.company_id
    result_center = {
        "code": employment.result_center.code,
        "name": employment.result_center.name,
        "color": employment.result_center.color,
    }
    db.add(
        AuditEntry(
            company_id=company_id_for_audit,
            module="Colaboradores",
            action="Colaborador excluído",
            employee_name=employee_name,
            result_center=result_center,
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"Matrícula {employee_code} | cadastro sem movimentações ou registros operacionais",
        )
    )
    db.delete(employment)
    try:
        db.flush()
        remaining_employment = db.scalar(
            select(Employment.id).where(Employment.employee_id == employee.id).limit(1)
        )
        if remaining_employment is None:
            db.delete(employee)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="O colaborador ainda possui registros vinculados. Inative-o em vez de excluir.",
        ) from None
    return {"deleted": True}


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
    db.add(
        Movement(
            company_id=employment.company_id,
            competency=payload.effective_date.strftime("%Y-%m"),
            employee_id=employment.id,
            type="alteração salarial",
            start_date=payload.effective_date,
            end_date=None,
            days=0,
            hour_impact=0,
            observation=f"AJUSTE SALARIAL: {payload.reason} | NOVO SALÁRIO {payload.amount}",
            status="Aplicada",
        )
    )
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

from datetime import date, timedelta
from decimal import Decimal

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
from app.models.enums import EmploymentStatus
from app.models.mei_contract import MeiContract
from app.models.movement import Movement
from app.models.payroll_override import PayrollOverride
from app.models.launch import LaunchItem
from app.models.monthly_closing import MonthlyClosing
from app.models.result_center import ResultCenter
from app.models.system_setting import SystemSetting
from app.services.competency import departure_map, effective_end, active_in_period as period_active
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmploymentRead, EmploymentTransitionCreate, SalaryHistoryCreate

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
    db: DbSession,
    _: CurrentUser,
    company_id: int = 1,
    reference_date: date | None = None,
    include_history: bool = False,
) -> list[EmploymentRead]:
    query = employment_query()
    if company_id != 0:
        query = query.where(Employment.company_id == company_id)
    if reference_date:
        query = query.where(
            Employment.admission_date <= reference_date,
            (Employment.termination_date.is_(None))
            | (Employment.termination_date >= reference_date),
        )
    employments = list(db.scalars(query))
    exits = departure_map(db, company_id)
    if reference_date:
        employments = [item for item in employments if period_active(item, reference_date, reference_date, exits)]
    latest_by_person: dict[int, Employment] = {}
    for item in employments:
        current = latest_by_person.get(item.employee_id)
        if current is None or (item.admission_date, item.id) > (current.admission_date, current.id):
            latest_by_person[item.employee_id] = item
    selected = employments if include_history else latest_by_person.values()
    results = []
    primary_settings = db.scalar(select(SystemSetting).join(Company).order_by(Company.is_primary.desc(), Company.id))
    applicable = [rate for rate in (primary_settings.family_allowance_rates or [] if primary_settings else []) if rate["effective_date"] <= (reference_date or date.today()).isoformat()]
    family_amount = max(applicable, key=lambda rate: rate["effective_date"])["amount"] if applicable else 0
    for item in sorted(selected, key=lambda item: item.employee.full_name):
        view = EmploymentRead.model_validate(item)
        view.family_allowance_amount = Decimal(str(family_amount)) if item.family_allowance_eligible else Decimal("0")
        view.termination_date = effective_end(item, exits)
        if view.termination_date and view.termination_date < (reference_date or date.today()):
            view.status = EmploymentStatus.INACTIVE
        results.append(view)
    return results


@router.get("/{employment_id}/history", response_model=list[EmploymentRead])
def employment_history(
    employment_id: int, db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[Employment]:
    source = db.scalar(employment_query().where(Employment.id == employment_id))
    if not source or (company_id != 0 and source.company_id != company_id):
        raise HTTPException(status_code=404, detail="Vínculo não encontrado")
    return list(
        db.scalars(
            employment_query()
            .where(Employment.employee_id == source.employee_id)
            .order_by(Employment.admission_date.desc(), Employment.id.desc())
        )
    )


@router.post("/{employment_id}/transition", response_model=EmploymentRead, status_code=201)
def transition_employment(
    employment_id: int,
    payload: EmploymentTransitionCreate,
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> Employment:
    source = db.scalar(employment_query().where(Employment.id == employment_id))
    if not source or (company_id != 0 and source.company_id != company_id):
        raise HTTPException(status_code=404, detail="Vínculo não encontrado")
    latest = db.scalar(
        select(Employment)
        .where(Employment.employee_id == source.employee_id)
        .order_by(Employment.admission_date.desc(), Employment.id.desc())
        .limit(1)
    )
    if not latest or latest.id != source.id:
        raise HTTPException(status_code=409, detail="A transição só pode ser feita a partir do vínculo mais recente.")
    if payload.effective_date <= source.admission_date:
        raise HTTPException(status_code=422, detail="A nova vigência deve começar depois do início do vínculo atual.")
    competency = payload.effective_date.strftime("%Y-%m")
    closed = db.scalar(
        select(MonthlyClosing.id).where(
            MonthlyClosing.company_id == source.company_id,
            MonthlyClosing.competency == competency,
            MonthlyClosing.status == "CLOSED",
        )
    )
    if closed:
        raise HTTPException(status_code=409, detail="Competência fechada. Reabra o mês antes de alterar o vínculo.")
    employment_type = db.get(EmploymentType, payload.employment_type_id)
    result_center = db.get(ResultCenter, payload.result_center_id)
    if not employment_type or employment_type.company_id != source.company_id:
        raise HTTPException(status_code=409, detail="Modalidade não pertence à empresa selecionada")
    if not result_center or result_center.company_id != source.company_id:
        raise HTTPException(status_code=409, detail="Centro de Resultado não pertence à empresa selecionada")
    if employment_type.id == source.employment_type_id and source.status != EmploymentStatus.INACTIVE:
        raise HTTPException(status_code=409, detail="Selecione uma modalidade diferente da atual.")

    previous_type = source.employment_type.name
    if source.termination_date is None or source.termination_date >= payload.effective_date:
        source.termination_date = payload.effective_date - timedelta(days=1)
    source.status = EmploymentStatus.INACTIVE
    new_employment = Employment(
        company_id=source.company_id,
        employee=source.employee,
        employee_code=next_employee_code(
            db,
            company_id=source.company_id,
            center_code=result_center.code,
            exclude_id=0,
        ),
        employment_type=employment_type,
        result_center=result_center,
        job_title=payload.job_title.strip().upper(),
        department=source.department,
        admission_date=payload.effective_date,
        termination_date=None,
        status=EmploymentStatus.ACTIVE,
        daily_hours=payload.daily_hours,
        salary_base=payload.salary_base,
        gratification=payload.gratification,
        cost_aid=payload.cost_aid,
        notes=payload.notes.strip().upper(),
        email=source.email,
        phone=source.phone,
        supervisor_name=payload.supervisor_name.strip().upper(),
        cep=source.cep,
        street=source.street,
        address_number=source.address_number,
        address_complement=source.address_complement,
        neighborhood=source.neighborhood,
        city=source.city,
        state=source.state,
        bank_code=source.bank_code,
        bank_name=source.bank_name,
        bank_agency=source.bank_agency,
        bank_account=source.bank_account,
        bank_account_digit=source.bank_account_digit,
        pix_key_type=source.pix_key_type,
        pix_key=source.pix_key,
        benefits=payload.benefits,
        family_allowance_eligible=source.family_allowance_eligible,
    )
    new_employment.salary_history.append(
        SalaryHistory(
            effective_date=payload.effective_date,
            amount=payload.salary_base,
            family_allowance=0,
            reason=f"Início do vínculo {employment_type.name}",
        )
    )
    db.add(new_employment)
    db.flush()
    db.add(
        Movement(
            company_id=source.company_id,
            competency=competency,
            employee_id=new_employment.id,
            type="alteração de vínculo",
            start_date=payload.effective_date,
            end_date=None,
            days=0,
            hour_impact=0,
            observation=f"TRANSIÇÃO DE {previous_type} PARA {employment_type.name} | VÍNCULO ANTERIOR ENCERRADO EM {source.termination_date.isoformat()}",
            status="Aplicada",
        )
    )
    db.add(
        AuditEntry(
            company_id=source.company_id,
            module="Colaboradores",
            action="Alteração de vínculo",
            employee_name=source.employee.full_name,
            result_center={"code": result_center.code, "name": result_center.name, "color": result_center.color},
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"{previous_type} até {source.termination_date.isoformat()} → {employment_type.name} desde {payload.effective_date.isoformat()} | {new_employment.employee_code}",
        )
    )
    db.commit()
    return db.scalar(employment_query().where(Employment.id == new_employment.id))


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
            detail=f"CPF/CNPJ já cadastrado para {duplicate.full_name}. Abra a ficha existente e use Alterar vínculo/modalidade.",
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
        if (
            employment_type.id != employment.employment_type_id
            and employment_type.name.strip().upper()
            != employment.employment_type.name.strip().upper()
        ):
            raise HTTPException(status_code=409, detail="Use Alterar vínculo/modalidade para preservar o histórico da pessoa.")
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

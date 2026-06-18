from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.core.security import verify_password
from app.models.benefit import BenefitDefinition, BenefitDistribution
from app.models.company import Company
from app.models.employment import Employment
from app.models.enums import EmploymentStatus
from app.models.mei_contract import MeiContract
from app.models.movement import Movement
from app.models.monthly_closing import MonthlyClosing
from app.models.result_center import ResultCenter
from app.models.system_setting import SystemSetting

router = APIRouter()

DEFAULT_PAYROLL_RATES = {
    "inss": 20,
    "rat": 1,
    "terceiros": 5.2,
    "fgts": 8,
    "fgts_vacation": 8,
    "fgts_thirteenth": 8,
    "fgts_notice": 8,
    "multa_fgts": 50,
    "patronal": 27.3,
}
DEFAULT_JOB_TITLES = [
    "Analista Administrativo",
    "Assistente Administrativo",
    "Supervisor",
    "Promotor",
    "Coordenador",
    "Gerente",
]
DEFAULT_BENEFITS = [
    ("VT", "Vale transporte", "DAILY", "Pode ser distribuído em lote ou individualmente no mês."),
    ("AL", "Alimentação", "DAILY", "Pode ser distribuído em lote ou individualmente no mês."),
    ("PS", "Plano de saúde", "MONTHLY", "Valor mensal por titular e dependentes."),
    ("SV", "Seguro de vida", "MONTHLY", "Valor mensal recorrente por colaborador."),
]


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def as_float(value: Decimal | float | int) -> float:
    return float(money(value))


def ensure_company(db: DbSession, company_id: int) -> Company:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return company


def ensure_settings(db: DbSession, company: Company) -> SystemSetting:
    settings = db.scalar(select(SystemSetting).where(SystemSetting.company_id == company.id))
    if settings:
        changed = False
        if not settings.payroll_rates:
            settings.payroll_rates = DEFAULT_PAYROLL_RATES
            changed = True
        if not settings.job_titles:
            settings.job_titles = DEFAULT_JOB_TITLES
            changed = True
        if changed:
            db.commit()
        return settings
    settings = SystemSetting(
        id=company.id,
        company_id=company.id,
        company_name=company.name,
        company_logo="",
        backup_directory="",
        auto_backup_on_start=True,
        include_saturdays=False,
        include_sundays=False,
        default_daily_hours=Decimal("8.80"),
        payroll_rates=DEFAULT_PAYROLL_RATES,
        job_titles=DEFAULT_JOB_TITLES,
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def ensure_benefits(db: DbSession, company_id: int) -> list[BenefitDefinition]:
    existing = list(db.scalars(select(BenefitDefinition).where(BenefitDefinition.company_id == company_id)))
    if existing:
        return sorted(existing, key=lambda item: item.code)
    for code, name, mode, notes in DEFAULT_BENEFITS:
        db.add(
            BenefitDefinition(
                company_id=company_id,
                code=code,
                name=name,
                mode=mode,
                active=True,
                applies_to=["ADM", "IND", "COM", "DIR"],
                notes=notes,
            )
        )
    db.commit()
    return list(db.scalars(select(BenefitDefinition).where(BenefitDefinition.company_id == company_id).order_by(BenefitDefinition.code)))


def benefit_to_dict(item: BenefitDefinition) -> dict[str, Any]:
    return {
        "id": item.id,
        "code": item.code,
        "name": item.name,
        "active": item.active,
        "mode": item.mode,
        "applies_to": item.applies_to,
        "notes": item.notes,
    }


def result_center_to_dict(employment: Employment) -> dict[str, Any]:
    center = employment.result_center
    return {
        "id": center.id,
        "company_id": center.company_id,
        "code": center.code,
        "name": center.name,
        "color": center.color,
        "active": center.active,
    }


def employment_type_to_dict(employment: Employment) -> dict[str, Any]:
    employment_type = employment.employment_type
    return {
        "id": employment_type.id,
        "company_id": employment_type.company_id,
        "name": employment_type.name,
        "has_charges": employment_type.has_charges,
        "active": employment_type.active,
    }


def distribution_to_dict(item: BenefitDistribution) -> dict[str, Any]:
    employment = item.employment
    return {
        "id": item.id,
        "company_id": item.company_id,
        "competency": item.competency,
        "benefit_code": item.benefit_code,
        "benefit_name": item.benefit_name,
        "employee_id": item.employee_id,
        "employee_name": employment.employee.full_name if employment else "",
        "result_center": result_center_to_dict(employment) if employment else None,
        "supervisor_name": employment.supervisor_name if employment else "",
        "employment_type": employment.employment_type.name if employment else "",
        "state": employment.state if employment else "",
        "days_worked": as_float(item.days_worked),
        "value_per_day": as_float(item.value_per_day),
        "monthly_value": as_float(item.monthly_value),
        "dependents_count": item.dependents_count,
        "dependent_value": as_float(item.dependent_value),
        "amount": as_float(item.amount),
        "source": item.source,
        "description": item.description,
        "created_at": item.created_at.isoformat(),
        "created_by": item.created_by,
    }


def movement_to_dict(item: Movement) -> dict[str, Any]:
    employment = item.employment
    return {
        "id": item.id,
        "company_id": item.company_id,
        "competency": item.competency,
        "employee_id": item.employee_id,
        "employee_name": employment.employee.full_name,
        "type": item.type,
        "start_date": item.start_date.isoformat(),
        "end_date": item.end_date.isoformat() if item.end_date else None,
        "days": item.days,
        "hour_impact": as_float(item.hour_impact),
        "result_center": result_center_to_dict(employment),
        "observation": item.observation,
        "status": item.status,
    }


def mei_contract_to_dict(item: MeiContract) -> dict[str, Any]:
    employment = item.employment
    return {
        "id": item.id,
        "company_id": item.company_id,
        "employee_id": item.employee_id,
        "employee_name": employment.employee.full_name,
        "employee_code": employment.employee_code,
        "result_center": result_center_to_dict(employment),
        "employment_type": employment.employment_type.name,
        "status": item.status,
        "start_date": item.start_date.isoformat(),
        "end_date": item.end_date.isoformat(),
        "attachment_name": item.attachment_name,
        "attachment_data_url": item.attachment_data_url,
        "created_at": item.created_at.isoformat() if item.created_at else "",
        "signed_at": item.signed_at.isoformat() if item.signed_at else None,
        "signed_by": item.signed_by,
        "notified_not_signed": item.notified_not_signed,
        "notified_15": item.notified_15,
        "notified_10": item.notified_10,
        "notified_5": item.notified_5,
        "movement_created_5": item.movement_created_5,
    }


def parse_date(value: Any, fallback: date | None = None) -> date:
    if isinstance(value, date):
        return value
    if value:
        try:
            return date.fromisoformat(str(value))
        except ValueError:
            raise HTTPException(status_code=422, detail="Data inválida. Use o formato AAAA-MM-DD") from None
    if fallback:
        return fallback
    raise HTTPException(status_code=422, detail="Data é obrigatória")


def parse_competency(value: str) -> tuple[int, int, date, date]:
    try:
        year_raw, month_raw = value.split("-")
        year = int(year_raw)
        month = int(month_raw)
        return year, month, date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Competência deve estar no formato AAAA-MM") from None


def employment_active_in_period(employment: Employment, start: date, end: date) -> bool:
    return employment.admission_date <= end and (
        employment.termination_date is None or employment.termination_date >= start
    )


def get_or_create_closing(db: DbSession, company_id: int, competency: str) -> MonthlyClosing:
    closing = db.scalar(
        select(MonthlyClosing).where(
            MonthlyClosing.company_id == company_id,
            MonthlyClosing.competency == competency,
        )
    )
    if closing:
        return closing
    closing = MonthlyClosing(
        company_id=company_id,
        competency=competency,
        status="OPEN",
        justification="",
        closed_by="",
        closed_at=None,
    )
    db.add(closing)
    db.commit()
    db.refresh(closing)
    return closing


def is_competency_closed(db: DbSession, company_id: int, competency: str) -> bool:
    if company_id == 0:
        return False
    closing = db.scalar(
        select(MonthlyClosing.status).where(
            MonthlyClosing.company_id == company_id,
            MonthlyClosing.competency == competency,
        )
    )
    return closing == "CLOSED"


def closing_to_dict(closing: MonthlyClosing) -> dict[str, Any]:
    return {
        "id": closing.id,
        "company_id": closing.company_id,
        "competency": closing.competency,
        "status": closing.status,
        "justification": closing.justification,
        "closed_by": closing.closed_by,
        "closed_at": closing.closed_at.isoformat() if closing.closed_at else None,
        "warnings": [],
        "checklist": {
            "Colaboradores revisados": True,
            "Benefícios conferidos": True,
            "Custo/Folha conferido": True,
            "Movimentações registradas": True,
        },
    }


def benefit_matches(employment: Employment, benefit: BenefitDefinition) -> bool:
    aliases = {
        "VT": "vale transporte",
        "AL": "alimentação",
        "PS": "plano de saúde",
        "SV": "seguro de vida",
    }
    wanted = {benefit.name.strip().lower(), aliases.get(benefit.code.upper(), benefit.code).lower()}
    return any(str(item).strip().lower() in wanted for item in employment.benefits)


@router.get("/settings")
def get_settings(db: DbSession, _: CurrentUser, company_id: int = 1) -> dict[str, Any]:
    company = ensure_company(db, company_id)
    settings = ensure_settings(db, company)
    return {
        "company_name": settings.company_name,
        "cnpj": "",
        "company_logo": settings.company_logo,
        "initial_month": "2026-06",
        "default_daily_hours": as_float(settings.default_daily_hours),
        "include_saturdays": settings.include_saturdays,
        "include_sundays": settings.include_sundays,
        "holidays": [],
        "charges": [],
        "payroll_rates": settings.payroll_rates or DEFAULT_PAYROLL_RATES,
        "backup_directory": settings.backup_directory,
        "auto_backup_on_start": settings.auto_backup_on_start,
        "backup_retention": 90,
        "job_titles": settings.job_titles or DEFAULT_JOB_TITLES,
    }


@router.post("/settings")
def update_settings(payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1) -> dict[str, Any]:
    company = ensure_company(db, company_id)
    settings = ensure_settings(db, company)
    if "company_name" in payload:
        settings.company_name = str(payload["company_name"])
    if "company_logo" in payload:
        settings.company_logo = str(payload["company_logo"] or "")
    if "default_daily_hours" in payload:
        settings.default_daily_hours = Decimal(str(payload["default_daily_hours"] or "8.80"))
    if "job_titles" in payload and isinstance(payload["job_titles"], list):
        settings.job_titles = [str(item).strip() for item in payload["job_titles"] if str(item).strip()]
    if "payroll_rates" in payload and isinstance(payload["payroll_rates"], dict):
        settings.payroll_rates = {**DEFAULT_PAYROLL_RATES, **payload["payroll_rates"]}
    db.commit()
    return get_settings(db, _, company_id)


@router.get("/benefits/catalog")
def list_benefits(db: DbSession, _: CurrentUser, company_id: int = 1) -> list[dict[str, Any]]:
    ensure_company(db, company_id)
    return [benefit_to_dict(item) for item in ensure_benefits(db, company_id)]


@router.post("/benefits/catalog", status_code=201)
def upsert_benefit(payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1) -> dict[str, Any]:
    ensure_company(db, company_id)
    code = str(payload.get("code", "")).strip().upper()
    if not code:
        raise HTTPException(status_code=422, detail="Código do benefício é obrigatório")
    item = db.scalar(
        select(BenefitDefinition).where(
            BenefitDefinition.company_id == company_id,
            BenefitDefinition.code == code,
        )
    )
    if not item:
        item = BenefitDefinition(company_id=company_id, code=code)
        db.add(item)
    item.name = str(payload.get("name", code)).strip()
    item.mode = str(payload.get("mode", "DAILY")).strip().upper()
    item.active = bool(payload.get("active", True))
    item.applies_to = [str(value) for value in payload.get("applies_to", ["ADM", "IND", "COM", "DIR"])]
    item.notes = str(payload.get("notes", ""))
    db.commit()
    db.refresh(item)
    return benefit_to_dict(item)


@router.get("/benefit-distributions")
def list_distributions(db: DbSession, _: CurrentUser, competency: str = "2026-06", company_id: int = 1) -> list[dict[str, Any]]:
    query = (
        select(BenefitDistribution)
        .options(
            joinedload(BenefitDistribution.employment).joinedload(Employment.employee),
            joinedload(BenefitDistribution.employment).joinedload(Employment.result_center),
            joinedload(BenefitDistribution.employment).joinedload(Employment.employment_type),
        )
        .where(BenefitDistribution.competency == competency)
        .order_by(BenefitDistribution.created_at.desc())
    )
    if company_id != 0:
        query = query.where(BenefitDistribution.company_id == company_id)
    return [distribution_to_dict(item) for item in db.scalars(query)]


@router.get("/movements")
def list_movements(db: DbSession, _: CurrentUser, competency: str | None = None, company_id: int = 1) -> list[dict[str, Any]]:
    query = (
        select(Movement)
        .options(
            joinedload(Movement.employment).joinedload(Employment.employee),
            joinedload(Movement.employment).joinedload(Employment.result_center),
        )
        .order_by(Movement.start_date.desc(), Movement.id.desc())
    )
    if company_id != 0:
        query = query.where(Movement.company_id == company_id)
    if competency:
        query = query.where(Movement.competency == competency)
    return [movement_to_dict(item) for item in db.scalars(query)]


@router.post("/movements", status_code=201)
def create_movement(payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1) -> dict[str, Any]:
    ensure_company(db, company_id)
    employee_id = payload.get("employee_id")
    employment_query = (
        select(Employment)
        .options(joinedload(Employment.employee), joinedload(Employment.result_center))
        .where(Employment.company_id == company_id, Employment.status == EmploymentStatus.ACTIVE)
        .order_by(Employment.id)
    )
    if employee_id:
        employment_query = employment_query.where(Employment.id == int(employee_id))
    employment = db.scalar(employment_query)
    if not employment:
        raise HTTPException(status_code=422, detail="Cadastre ao menos um colaborador ativo antes de lançar movimentações.")
    start_date = parse_date(payload.get("start_date"), date.today())
    movement = Movement(
        company_id=company_id,
        competency=str(payload.get("competency") or start_date.strftime("%Y-%m")),
        employee_id=employment.id,
        type=str(payload.get("type") or "falta"),
        start_date=start_date,
        end_date=parse_date(payload.get("end_date")) if payload.get("end_date") else None,
        days=max(int(payload.get("days") or 1), 1),
        hour_impact=Decimal(str(payload.get("hour_impact") or employment.daily_hours or 0)),
        observation=str(payload.get("observation") or "Movimentação criada no modo oficial."),
        status="Pendente",
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement_to_dict(movement)


@router.patch("/movements/{movement_id}")
def update_movement(movement_id: int, payload: dict[str, Any], db: DbSession, user: AdminUser, company_id: int = 1) -> dict[str, Any]:
    if not verify_password(str(payload.get("password") or ""), user.password_hash):
        raise HTTPException(status_code=403, detail="Senha de confirmação inválida.")
    query = (
        select(Movement)
        .options(
            joinedload(Movement.employment).joinedload(Employment.employee),
            joinedload(Movement.employment).joinedload(Employment.result_center),
        )
        .where(Movement.id == movement_id)
    )
    if company_id != 0:
        query = query.where(Movement.company_id == company_id)
    movement = db.scalar(query)
    if not movement:
        raise HTTPException(status_code=404, detail="Movimentação não encontrada")
    movement.competency = str(payload.get("competency") or movement.competency)
    movement.type = str(payload.get("type") or movement.type)
    movement.start_date = parse_date(payload.get("start_date"), movement.start_date)
    movement.end_date = parse_date(payload.get("end_date")) if payload.get("end_date") else None
    movement.days = max(int(payload.get("days") or movement.days), 1)
    movement.hour_impact = Decimal(str(payload.get("hour_impact") or movement.hour_impact))
    movement.observation = str(payload.get("observation") or movement.observation)
    movement.status = str(payload.get("status") or movement.status)
    db.commit()
    db.refresh(movement)
    return movement_to_dict(movement)


@router.get("/mei-contracts")
def list_mei_contracts(db: DbSession, _: CurrentUser, company_id: int = 1) -> list[dict[str, Any]]:
    query = (
        select(MeiContract)
        .options(
            joinedload(MeiContract.employment).joinedload(Employment.employee),
            joinedload(MeiContract.employment).joinedload(Employment.result_center),
            joinedload(MeiContract.employment).joinedload(Employment.employment_type),
        )
        .order_by(MeiContract.id.desc())
    )
    if company_id != 0:
        query = query.where(MeiContract.company_id == company_id)
    return [mei_contract_to_dict(item) for item in db.scalars(query)]


@router.post("/mei-contracts", status_code=201)
def create_mei_contract(payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1) -> dict[str, Any]:
    ensure_company(db, company_id)
    employment = db.scalar(
        select(Employment)
        .options(
            joinedload(Employment.employee),
            joinedload(Employment.result_center),
            joinedload(Employment.employment_type),
        )
        .where(
            Employment.company_id == company_id,
            Employment.id == int(payload.get("employee_id") or 0),
            Employment.status == EmploymentStatus.ACTIVE,
        )
    )
    if not employment:
        raise HTTPException(status_code=422, detail="Selecione um MEI cadastrado.")
    if employment.employment_type.name.upper() != "MEI":
        raise HTTPException(status_code=422, detail="Selecione apenas colaboradores da modalidade MEI.")
    start_date = parse_date(payload.get("start_date"))
    end_date = parse_date(payload.get("end_date"))
    contract = MeiContract(
        company_id=company_id,
        employee_id=employment.id,
        status="Pendente de assinatura",
        start_date=start_date,
        end_date=end_date,
        attachment_name=None,
        attachment_data_url=None,
        signed_at=None,
        signed_by=None,
        notified_not_signed=True,
        notified_15=False,
        notified_10=False,
        notified_5=False,
        movement_created_5=False,
    )
    db.add(contract)
    db.flush()
    db.add(
        Movement(
            company_id=company_id,
            competency=start_date.strftime("%Y-%m"),
            employee_id=employment.id,
            type="contrato não assinado",
            start_date=start_date,
            end_date=None,
            days=0,
            hour_impact=Decimal("0.00"),
            observation=f"MEI#{contract.id} - contrato pendente de assinatura",
            status="Pendente",
        )
    )
    db.commit()
    db.refresh(contract)
    return mei_contract_to_dict(contract)


@router.patch("/mei-contracts/{contract_id}/sign")
def sign_mei_contract(contract_id: int, payload: dict[str, Any], db: DbSession, user: AdminUser, company_id: int = 1) -> dict[str, Any]:
    attachment_name = str(payload.get("attachment_name") or "").strip()
    if not attachment_name:
        raise HTTPException(status_code=422, detail="Anexe o contrato para concluir a assinatura.")
    query = (
        select(MeiContract)
        .options(
            joinedload(MeiContract.employment).joinedload(Employment.employee),
            joinedload(MeiContract.employment).joinedload(Employment.result_center),
            joinedload(MeiContract.employment).joinedload(Employment.employment_type),
        )
        .where(MeiContract.id == contract_id)
    )
    if company_id != 0:
        query = query.where(MeiContract.company_id == company_id)
    contract = db.scalar(query)
    if not contract:
        raise HTTPException(status_code=404, detail="Contrato MEI não encontrado")
    contract.status = "Ativo"
    contract.attachment_name = attachment_name
    contract.attachment_data_url = str(payload.get("attachment_data_url") or "") or None
    contract.signed_at = datetime.now()
    contract.signed_by = user.full_name
    db.commit()
    db.refresh(contract)
    return mei_contract_to_dict(contract)


@router.post("/benefit-distributions", status_code=201)
def create_distribution(payload: dict[str, Any], db: DbSession, user: AdminUser, company_id: int = 1) -> dict[str, Any]:
    company = ensure_company(db, company_id)
    benefit_code = str(payload.get("benefit_code", "")).strip().upper()
    benefit = db.scalar(
        select(BenefitDefinition).where(
            BenefitDefinition.company_id == company.id,
            BenefitDefinition.code == benefit_code,
            BenefitDefinition.active.is_(True),
        )
    )
    if not benefit:
        raise HTTPException(status_code=404, detail="Benefício não encontrado ou inativo")
    employee_ids = [int(value) for value in payload.get("employee_ids", [])]
    if not employee_ids:
        raise HTTPException(status_code=422, detail="Selecione ao menos um colaborador")
    description = str(payload.get("description", "")).strip()
    if not description:
        raise HTTPException(status_code=422, detail="Informe a descrição da distribuição")

    items = {int(item.get("employee_id")): item for item in payload.get("items", []) if item.get("employee_id")}
    employments = list(
        db.scalars(
            select(Employment)
            .options(joinedload(Employment.employee), joinedload(Employment.result_center), joinedload(Employment.employment_type))
            .where(
                Employment.company_id == company.id,
                Employment.id.in_(employee_ids),
                Employment.status == EmploymentStatus.ACTIVE,
            )
        )
    )
    eligible = [employment for employment in employments if benefit_matches(employment, benefit)]
    if not eligible:
        raise HTTPException(status_code=422, detail="Nenhum colaborador elegível foi encontrado para este benefício")

    created: list[BenefitDistribution] = []
    for employment in eligible:
        item = items.get(employment.id, {})
        days_worked = Decimal(str(item.get("days_worked", payload.get("days_worked", 0)) or 0))
        value_per_day = Decimal(str(item.get("value_per_day", payload.get("value_per_day", 0)) or 0))
        monthly_value = Decimal(str(item.get("monthly_value", payload.get("monthly_value", 0)) or 0))
        dependents_count = int(item.get("dependents_count", payload.get("dependents_count", 0)) or 0)
        dependent_value = Decimal(str(item.get("dependent_value", payload.get("dependent_value", 0)) or 0))
        amount = money(days_worked * value_per_day) if benefit.mode == "DAILY" else money(monthly_value + Decimal(dependents_count) * dependent_value)
        if amount <= 0:
            raise HTTPException(status_code=422, detail="Valor do benefício deve ser maior que zero")
        distribution = BenefitDistribution(
            company_id=company.id,
            competency=str(payload.get("competency", "2026-06")),
            benefit_code=benefit.code,
            benefit_name=benefit.name,
            employee_id=employment.id,
            days_worked=days_worked,
            value_per_day=value_per_day,
            monthly_value=monthly_value,
            dependents_count=dependents_count,
            dependent_value=dependent_value,
            amount=amount,
            source=str(payload.get("source", "Lote")),
            description=description,
            created_by=user.full_name,
        )
        db.add(distribution)
        created.append(distribution)
    db.commit()
    for item in created:
        db.refresh(item)
    return {"created": len(created), "items": [distribution_to_dict(item) for item in created]}


@router.get("/payroll")
def payroll(db: DbSession, _: CurrentUser, competency: str = "2026-06", company_id: int = 1) -> list[dict[str, Any]]:
    company = ensure_company(db, company_id) if company_id != 0 else None
    rates = ensure_settings(db, company).payroll_rates if company else DEFAULT_PAYROLL_RATES
    rates = {**DEFAULT_PAYROLL_RATES, **(rates or {})}
    employment_query = (
        select(Employment)
        .options(joinedload(Employment.employee), joinedload(Employment.result_center), joinedload(Employment.employment_type))
        .where(Employment.status != EmploymentStatus.INACTIVE)
        .order_by(Employment.employee_id)
    )
    if company_id != 0:
        employment_query = employment_query.where(Employment.company_id == company_id)
    employments = list(db.scalars(employment_query))
    distributions = list(
        db.scalars(
            select(BenefitDistribution).where(
                BenefitDistribution.competency == competency,
                BenefitDistribution.company_id.in_([employment.company_id for employment in employments] or [company_id]),
            )
        )
    )
    benefit_totals: dict[int, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: Decimal("0.00")))
    for item in distributions:
        benefit_totals[item.employee_id][item.benefit_code.upper()] += item.amount

    return [payroll_row(employment, benefit_totals[employment.id], rates) for employment in employments]


@router.get("/closing")
def get_closing(db: DbSession, _: CurrentUser, competency: str = "2026-06", company_id: int = 1) -> dict[str, Any]:
    company = ensure_company(db, company_id)
    parse_competency(competency)
    closing = get_or_create_closing(db, company.id, competency)
    return closing_to_dict(closing)


@router.post("/closing")
def update_closing(payload: dict[str, Any], db: DbSession, user: AdminUser, company_id: int = 1) -> dict[str, Any]:
    company = ensure_company(db, company_id)
    competency = str(payload.get("competency") or "2026-06")
    parse_competency(competency)
    status = str(payload.get("status") or "OPEN").upper()
    if status not in {"OPEN", "CLOSED"}:
        raise HTTPException(status_code=422, detail="Status de fechamento inválido")
    closing = get_or_create_closing(db, company.id, competency)
    closing.status = status
    closing.justification = str(payload.get("justification") or "").strip()
    if status == "CLOSED":
        closing.closed_by = user.full_name
        closing.closed_at = datetime.now()
    else:
        closing.closed_by = ""
        closing.closed_at = None
    db.commit()
    db.refresh(closing)
    return closing_to_dict(closing)


@router.get("/indicators")
def indicators(db: DbSession, user: CurrentUser, competency: str = "2026-06", company_id: int = 1) -> dict[str, Any]:
    _, _, start, end = parse_competency(competency)
    if company_id != 0:
        ensure_company(db, company_id)
    if not is_competency_closed(db, company_id, competency):
        return {
            "initial_headcount": 0,
            "admissions": 0,
            "terminations": 0,
            "final_headcount": 0,
            "average_headcount": 0,
            "absenteeism": 0,
            "turnover": 0,
            "gross_payroll": 0,
            "net_payroll": 0,
            "salary_per_capita": 0,
            "total_cost": 0,
            "productive_days": 0,
            "non_productive_hours": 0,
        }
    employment_query = (
        select(Employment)
        .options(joinedload(Employment.employee), joinedload(Employment.result_center), joinedload(Employment.employment_type))
    )
    if company_id != 0:
        employment_query = employment_query.where(Employment.company_id == company_id)
    employments = list(db.scalars(employment_query))

    active = [
        item
        for item in employments
        if employment_active_in_period(item, start, end) and item.status != EmploymentStatus.INACTIVE
    ]
    initial_headcount = sum(
        employment_active_in_period(item, start, start) and item.status != EmploymentStatus.INACTIVE
        for item in employments
    )
    final_headcount = len(active)
    admissions = sum(start <= item.admission_date <= end for item in employments)
    terminations = sum(bool(item.termination_date and start <= item.termination_date <= end) for item in employments)
    average_headcount = (initial_headcount + final_headcount) / 2 if (initial_headcount or final_headcount) else 0

    movement_query = select(Movement).where(Movement.competency == competency)
    if company_id != 0:
        movement_query = movement_query.where(Movement.company_id == company_id)
    movements = list(db.scalars(movement_query))
    non_productive_hours = sum(as_float(item.hour_impact) for item in movements)
    scheduled_hours = sum(as_float(item.daily_hours) * 22 for item in active)

    payroll_rows = payroll(db, user, competency, company_id)
    gross_payroll = sum(float(row["gross_payroll"]) for row in payroll_rows)
    net_payroll = sum(float(row["net_payroll"]) for row in payroll_rows)
    total_cost = sum(float(row["total_cost"]) for row in payroll_rows)

    return {
        "initial_headcount": int(initial_headcount),
        "admissions": int(admissions),
        "terminations": int(terminations),
        "final_headcount": int(final_headcount),
        "average_headcount": average_headcount,
        "absenteeism": non_productive_hours / scheduled_hours if scheduled_hours else 0,
        "turnover": ((admissions + terminations) / 2 / final_headcount) if final_headcount else 0,
        "gross_payroll": gross_payroll,
        "net_payroll": net_payroll,
        "salary_per_capita": gross_payroll / final_headcount if final_headcount else 0,
        "total_cost": total_cost,
        "productive_days": 22 if final_headcount else 0,
        "non_productive_hours": non_productive_hours,
    }


@router.get("/indicators/sheets")
def indicator_sheets(db: DbSession, user: CurrentUser, competency: str = "2026-06", company_id: int = 1) -> dict[str, Any]:
    year, _, _, _ = parse_competency(competency)
    if company_id != 0:
        ensure_company(db, company_id)
    centers_query = select(ResultCenter).where(ResultCenter.active.is_(True))
    if company_id != 0:
        centers_query = centers_query.where(ResultCenter.company_id == company_id)
    centers = list(db.scalars(centers_query.order_by(ResultCenter.code)))
    sheets = {center.code: build_indicator_sheet(db, user, year, center, company_id) for center in centers}
    return {
        "year": year,
        "centers": [
            {
                "id": center.id,
                "company_id": center.company_id,
                "code": center.code,
                "name": center.name,
                "color": center.color,
                "active": center.active,
            }
            for center in centers
        ],
        "sheets": sheets,
    }


def build_indicator_sheet(db: DbSession, user: CurrentUser, year: int, center: Any, company_id: int) -> dict[str, Any]:
    month_labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    cost_keys = {
        "Salário": "salary",
        "Prolabore": "pro_labore",
        "Dist. Lucro": "profit_distribution",
        "Benefício": "benefits_total",
        "Patronal": "employer_contribution",
        "FGTS": "fgts",
        "Provisão": "total_provisions",
        "Total": "total_cost",
    }
    costs: dict[str, list[float]] = {label: [] for label in cost_keys}
    operational: dict[str, list[float]] = {
        "Efetivo Inicial (Un)": [],
        "Afastamentos": [],
        "Novas Contratações (Un)": [],
        "Desligamentos (Un)": [],
        "Horas Programadas": [],
        "Horas não Produtivas": [],
        "Efetivo Médio": [],
        "Efetivo Final": [],
    }
    finance_rows: list[dict[str, Any]] = []
    turnover_rows: list[dict[str, Any]] = []
    absenteeism_rows: list[dict[str, Any]] = []
    turnover_values: list[float] = []
    absenteeism_values: list[float] = []

    employment_query = select(Employment).where(Employment.result_center_id == center.id)
    if company_id != 0:
        employment_query = employment_query.where(Employment.company_id == company_id)
    employments = list(db.scalars(employment_query))

    for month in range(1, 13):
        month_competency = f"{year}-{month:02d}"
        if not is_competency_closed(db, company_id, month_competency):
            for values in costs.values():
                values.append(0)
            for values in operational.values():
                values.append(0)
            finance_rows.append(
                {
                    "month": month_labels[month - 1],
                    "faturamento": 0,
                    "custo": 0,
                    "percent": 0,
                    "meta": 0,
                    "metric": 0,
                    "metricLabel": "Colab",
                    "costPerMetric": 0,
                }
            )
            turnover_rows.append(
                {
                    "month": month_labels[month - 1],
                    "admissions": 0,
                    "terminations": 0,
                    "employees": 0,
                    "turnover": 0,
                    "average": 0,
                    "meta": 0,
                }
            )
            absenteeism_rows.append(
                {
                    "month": month_labels[month - 1],
                    "planned": 0,
                    "unproductive": 0,
                    "absenteeism": 0,
                    "average": 0,
                    "meta": 0,
                }
            )
            continue
        _, _, start, end = parse_competency(month_competency)
        month_payroll_rows = [
            row
            for row in payroll(db, user, month_competency, company_id)
            if row["result_center"]["code"] == center.code
        ]
        month_movements = list(
            db.scalars(
                select(Movement).where(
                    Movement.competency == month_competency,
                    Movement.company_id == center.company_id,
                )
            )
        )
        month_movements = [
            item
            for item in month_movements
            if item.employment and item.employment.result_center_id == center.id
        ]
        initial = sum(employment_active_in_period(item, start, start) and item.status != EmploymentStatus.INACTIVE for item in employments)
        final = sum(employment_active_in_period(item, start, end) and item.status != EmploymentStatus.INACTIVE for item in employments)
        active_month = [
            item
            for item in employments
            if employment_active_in_period(item, start, end) and item.status != EmploymentStatus.INACTIVE
        ]
        admissions = sum(start <= item.admission_date <= end for item in employments)
        terminations = sum(bool(item.termination_date and start <= item.termination_date <= end) for item in employments)
        non_productive = sum(as_float(item.hour_impact) for item in month_movements)
        scheduled = sum(as_float(item.daily_hours) * 22 for item in active_month)
        absence_days = sum(
            item.days
            for item in month_movements
            if any(marker in item.type.lower() for marker in ("afast", "falta", "ferias", "férias", "atestado"))
        )
        average_headcount = (initial + final) / 2 if (initial or final) else 0
        turnover_value = ((admissions + terminations) / 2 / final) if final else 0
        absenteeism_value = non_productive / scheduled if scheduled else 0
        turnover_values.append(turnover_value)
        absenteeism_values.append(absenteeism_value)

        for label, key in cost_keys.items():
            if key == "benefits_total":
                value = sum(
                    float(row["transport"]) + float(row["meal"]) + float(row["lodging"]) + float(row["insurance"]) + float(row["health_plan"])
                    for row in month_payroll_rows
                )
            else:
                value = sum(float(row[key]) for row in month_payroll_rows)
            costs[label].append(round(value, 2))

        operational["Efetivo Inicial (Un)"].append(float(initial))
        operational["Afastamentos"].append(float(absence_days))
        operational["Novas Contratações (Un)"].append(float(admissions))
        operational["Desligamentos (Un)"].append(float(terminations))
        operational["Horas Programadas"].append(round(scheduled, 2))
        operational["Horas não Produtivas"].append(round(non_productive, 2))
        operational["Efetivo Médio"].append(round(average_headcount, 2))
        operational["Efetivo Final"].append(float(final))

        total_cost = costs["Total"][-1]
        finance_rows.append(
            {
                "month": month_labels[month - 1],
                "faturamento": 0,
                "custo": total_cost,
                "percent": 0,
                "meta": 0,
                "metric": final,
                "metricLabel": "Colab",
                "costPerMetric": round(total_cost / final, 2) if final else 0,
            }
        )
        turnover_rows.append(
            {
                "month": month_labels[month - 1],
                "admissions": admissions,
                "terminations": terminations,
                "employees": final,
                "turnover": turnover_value,
                "average": sum(turnover_values) / len(turnover_values),
                "meta": 0,
            }
        )
        absenteeism_rows.append(
            {
                "month": month_labels[month - 1],
                "planned": round(scheduled, 2),
                "unproductive": round(non_productive, 2),
                "absenteeism": absenteeism_value,
                "average": sum(absenteeism_values) / len(absenteeism_values),
                "meta": 0,
            }
        )

    return {
        "title": f"{center.code} {year}",
        "subtitle": center.name,
        "costRows": [{"label": label, "values": values, "total": round(sum(values), 2)} for label, values in costs.items()],
        "operationalRows": [{"label": label, "values": values, "total": round(sum(values), 2)} for label, values in operational.items()],
        "financeRows": finance_rows,
        "turnoverRows": turnover_rows,
        "absenteeismRows": absenteeism_rows,
        "financeMetricLabel": "Colab",
        "financeMetricUnit": "colaboradores",
        "turnoverMeta": 0,
        "absenteeismMeta": 0,
        "costMeta": 0,
    }


def payroll_row(employment: Employment, benefits: dict[str, Decimal], rates: dict[str, Any]) -> dict[str, Any]:
    salary = money(employment.salary_base if employment.employment_type.name.upper() == "CLT" else 0)
    pro_labore = money(employment.salary_base if "PRÓ" in employment.employment_type.name.upper() or "PRO" in employment.employment_type.name.upper() else 0)
    cost_aid = money(employment.salary_base if employment.employment_type.name.upper() in {"MEI", "FREELANCER", "OUTROS"} else 0)
    transport = money(benefits.get("VT", Decimal("0.00")))
    meal = money(benefits.get("AL", Decimal("0.00")))
    health_plan = money(benefits.get("PS", Decimal("0.00")))
    insurance = money(benefits.get("SV", Decimal("0.00")))
    profit_distribution = Decimal("0.00")
    lodging = Decimal("0.00")
    subtotal = money(salary + pro_labore + profit_distribution + cost_aid + transport + meal + lodging + insurance + health_plan)
    inss = money(subtotal * Decimal(str(rates["inss"])) / 100)
    rat = money(subtotal * Decimal(str(rates["rat"])) / 100)
    terceiros = money(subtotal * Decimal(str(rates["terceiros"])) / 100)
    fgts = money(subtotal * Decimal(str(rates["fgts"])) / 100)
    charges = money(inss + rat + terceiros + fgts)
    vacation = money(subtotal / 12)
    vacation_third = money(vacation / 3)
    fgts_vacation = money((vacation + vacation_third) * Decimal(str(rates["fgts_vacation"])) / 100)
    thirteenth = money(subtotal / 12)
    fgts_thirteenth = money(thirteenth * Decimal(str(rates["fgts_thirteenth"])) / 100)
    notice = money(subtotal / 12)
    fgts_notice = money(notice * Decimal(str(rates["fgts_notice"])) / 100)
    fgts_fine = money((fgts + fgts_vacation + fgts_thirteenth + fgts_notice) * Decimal(str(rates["multa_fgts"])) / 100)
    patronal = money((vacation + vacation_third + thirteenth + notice) * Decimal(str(rates["patronal"])) / 100)
    provisions = money(vacation + vacation_third + fgts_vacation + thirteenth + fgts_thirteenth + notice + fgts_notice + fgts_fine + patronal)
    total_cost = money(subtotal + charges + provisions)
    return {
        "employee_id": employment.id,
        "employee_name": employment.employee.full_name,
        "result_center": result_center_to_dict(employment),
        "employment_type": employment_type_to_dict(employment),
        "salary": as_float(salary),
        "pro_labore": as_float(pro_labore),
        "profit_distribution": as_float(profit_distribution),
        "cost_aid": as_float(cost_aid),
        "transport": as_float(transport),
        "meal": as_float(meal),
        "lodging": as_float(lodging),
        "insurance": as_float(insurance),
        "health_plan": as_float(health_plan),
        "subtotal_earnings": as_float(subtotal),
        "inss": as_float(inss),
        "rat": as_float(rat),
        "terceiros": as_float(terceiros),
        "fgts": as_float(fgts),
        "charges": as_float(charges),
        "vacation": as_float(vacation),
        "vacation_third": as_float(vacation_third),
        "fgts_vacation": as_float(fgts_vacation),
        "thirteenth_salary": as_float(thirteenth),
        "fgts_thirteenth_salary": as_float(fgts_thirteenth),
        "notice_indemnity": as_float(notice),
        "fgts_notice": as_float(fgts_notice),
        "fgts_fine": as_float(fgts_fine),
        "employer_contribution": as_float(patronal),
        "total_provisions": as_float(provisions),
        "gross_payroll": as_float(subtotal),
        "net_payroll": as_float(subtotal + charges),
        "total_cost": as_float(total_cost),
        "grand_total": as_float(total_cost),
    }

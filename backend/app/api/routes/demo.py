from __future__ import annotations

from collections import defaultdict
from datetime import date
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
from app.models.movement import Movement
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

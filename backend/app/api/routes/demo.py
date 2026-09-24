from __future__ import annotations

import calendar
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.core.security import verify_password
from app.models.benefit import BenefitDefinition, BenefitDistribution
from app.models.audit_entry import AuditEntry
from app.models.company import Company
from app.models.employment import Employment
from app.models.enums import EmploymentStatus
from app.models.mei_contract import MeiContract
from app.models.launch import LaunchBatch, LaunchItem
from app.models.movement import Movement
from app.models.monthly_closing import MonthlyClosing
from app.models.payroll_override import PayrollOverride
from app.models.result_center import ResultCenter
from app.models.system_setting import SystemSetting
from app.services.competency import (
    active_in_period as period_active, business_days, departure_map, effective_end,
    movement_share, overlapping_movements, operational_metrics,
)

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
    (
        "VT",
        "Vale transporte",
        "DAILY",
        "Pode ser distribuído em lote ou individualmente no mês.",
    ),
    (
        "AL",
        "Alimentação",
        "DAILY",
        "Pode ser distribuído em lote ou individualmente no mês.",
    ),
    (
        "CB",
        "Cesta básica",
        "MONTHLY",
        "Benefício mensal de cesta básica por colaborador.",
    ),
    ("PS", "Plano de saúde", "MONTHLY", "Valor mensal por titular e dependentes."),
    ("PO", "Plano odontológico", "MONTHLY", "Valor mensal por titular e dependentes."),
    ("SV", "Seguro de vida", "MONTHLY", "Valor mensal recorrente por colaborador."),
]
PERIOD_MOVEMENT_TYPES = {"atestado", "afastamento", "férias"}
LAUNCH_FIELDS = {"MEI": "salary", "FREELANCER": "salary", "BONUS": "bonus", "COST_AID": "cost_aid", "LODGING": "lodging"}
LAUNCH_KINDS = {*LAUNCH_FIELDS, "BASIC_BASKET"}


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def as_float(value: Decimal | float | int) -> float:
    return float(money(value))


def normalized(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", value or "")
        if unicodedata.category(char) != "Mn"
    ).strip().upper()


def launch_eligible(
    employment: Employment,
    kind: str,
    valid_mei_ids: set[int] | None = None,
    competency: str = "",
) -> bool:
    if kind == "MEI":
        _, _, period_start, period_end = parse_competency(competency)
        return (
            normalized(employment.employment_type.name) == "MEI"
            and employment.id in (valid_mei_ids or set())
            and employment_active_in_period(employment, period_start, period_end)
        )
    _, _, period_start, period_end = parse_competency(competency)
    if not employment_active_in_period(employment, period_start, period_end):
        return False
    if kind == "FREELANCER":
        return normalized(employment.employment_type.name) == "FREELANCER"
    if kind == "BASIC_BASKET":
        return any(normalized(value) == "CESTA BASICA" for value in (employment.benefits or []))
    return kind in {"BONUS", "COST_AID", "LODGING"}


def launch_batch_to_dict(
    batch: LaunchBatch, employments: list[Employment], valid_mei_ids: set[int]
) -> dict[str, Any]:
    stored = {item.employment_id: item for item in batch.items}
    eligible = [
        item for item in employments
        if (batch.status == "CONFIRMED" and item.id in stored)
        or (batch.status != "CONFIRMED" and launch_eligible(item, batch.kind, valid_mei_ids, batch.competency))
    ]
    return {
        "id": batch.id,
        "company_id": batch.company_id,
        "competency": batch.competency,
        "kind": batch.kind,
        "status": batch.status,
        "filters": batch.filters or {},
        "created_by": batch.created_by,
        "updated_by": batch.updated_by,
        "created_at": batch.created_at.isoformat() if batch.created_at else "",
        "updated_at": batch.updated_at.isoformat() if batch.updated_at else "",
        "confirmed_at": batch.confirmed_at.isoformat() if batch.confirmed_at else None,
        "total": as_float(sum((item.amount for item in batch.items), Decimal("0.00"))),
        "filled_count": sum(1 for item in batch.items if item.amount > 0),
        "eligible_count": len(eligible),
        "employees": [
            {
                "employment_id": employment.id,
                "employee_name": employment.employee.full_name,
                "employee_code": employment.employee_code,
                "supervisor_name": employment.supervisor_name,
                "employment_type": employment.employment_type.name,
                "result_center": result_center_to_dict(employment),
                "amount": as_float(stored[employment.id].amount) if employment.id in stored else 0,
                "note": stored[employment.id].note if employment.id in stored else "",
            }
            for employment in eligible
        ],
    }


def movement_period_values(
    movement_type: str,
    start_date: date,
    days: int,
    daily_hours: Decimal | float | int,
    end_date: date | None,
    hour_impact: Decimal | float | int,
) -> tuple[date | None, Decimal]:
    """Keep period movements consistent regardless of the client that saved them."""
    if movement_type.strip().lower() in PERIOD_MOVEMENT_TYPES:
        return start_date + timedelta(days=days - 1), money(
            Decimal(str(daily_hours)) * days
        )
    return end_date, Decimal(str(hour_impact))


def employment_for_movement_date(
    db: DbSession, selected: Employment, movement_date: date, company_id: int
) -> Employment:
    """Resolve the person's relationship that was valid on the movement date."""
    employment = db.scalar(
        select(Employment)
        .options(joinedload(Employment.employee), joinedload(Employment.result_center))
        .where(
            Employment.employee_id == selected.employee_id,
            Employment.company_id == company_id,
            Employment.admission_date <= movement_date,
            (Employment.termination_date.is_(None))
            | (Employment.termination_date >= movement_date),
        )
        .order_by(Employment.admission_date.desc(), Employment.id.desc())
        .limit(1)
    )
    if not employment:
        raise HTTPException(
            status_code=422,
            detail="Não há vínculo vigente para este colaborador na data informada.",
        )
    return employment


def dismissal_values(db, employment, start, end, override=None):
    end = end or date(start.year, start.month, calendar.monthrange(start.year, start.month)[1])
    if end < start:
        raise HTTPException(status_code=422, detail="A data final deve ser igual ou posterior à data de saída.")
    settings = ensure_settings(db, ensure_company(db, employment.company_id))
    calculated = len(business_days(start + timedelta(days=1), end, settings))
    days = max(int(override), 0) if override is not None else calculated
    return end, days, money(Decimal(str(employment.daily_hours or 0)) * days)


@router.post("/movement-preview")
def preview_movement(payload: dict[str, Any], db: DbSession, _: CurrentUser, company_id: int = 1):
    employment = db.get(Employment, int(payload.get("employee_id") or 0))
    if not employment or employment.company_id != company_id:
        raise HTTPException(status_code=422, detail="Selecione um colaborador da empresa.")
    start = parse_date(payload.get("start_date"))
    employment = employment_for_movement_date(db, employment, start, company_id)
    end, days, hours = dismissal_values(db, employment, start, parse_date(payload["end_date"]) if payload.get("end_date") else None)
    return {"end_date": end.isoformat(), "days": days, "hour_impact": as_float(hours), "daily_hours": as_float(employment.daily_hours)}


def ensure_company(db: DbSession, company_id: int) -> Company:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return company


def ensure_settings(db: DbSession, company: Company) -> SystemSetting:
    settings = db.scalar(
        select(SystemSetting).where(SystemSetting.company_id == company.id)
    )
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


def settings_for_scope(db: DbSession, company_id: int) -> SystemSetting:
    if company_id == 0:
        company = db.scalar(
            select(Company).order_by(Company.is_primary.desc(), Company.id)
        )
        if not company:
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
    else:
        company = ensure_company(db, company_id)
    return ensure_settings(db, company)


def global_job_titles(db: DbSession) -> list[str]:
    settings = list(
        db.scalars(
            select(SystemSetting)
            .join(SystemSetting.company)
            .order_by(Company.is_primary.desc(), Company.id)
        )
    )
    titles: list[str] = []
    for item in settings:
        for title in item.job_titles or []:
            normalized = str(title).strip().upper()
            if normalized and normalized not in titles:
                titles.append(normalized)
    return sorted(titles or DEFAULT_JOB_TITLES, key=str.casefold)


def ensure_benefits(db: DbSession, company_id: int) -> list[BenefitDefinition]:
    existing = list(
        db.scalars(
            select(BenefitDefinition).where(BenefitDefinition.company_id == company_id)
        )
    )
    existing_codes = {item.code for item in existing}
    for code, name, mode, notes in DEFAULT_BENEFITS:
        if code in existing_codes:
            continue
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
    return list(
        db.scalars(
            select(BenefitDefinition)
            .where(BenefitDefinition.company_id == company_id)
            .order_by(BenefitDefinition.code)
        )
    )


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
        "daily_hours": as_float(employment.daily_hours),
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
        "renewed_from_id": item.renewed_from_id,
        "terminated_on": item.terminated_on.isoformat() if item.terminated_on else None,
        "termination_attachment_name": item.termination_attachment_name,
        "termination_attachment_data_url": item.termination_attachment_data_url,
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
            raise HTTPException(
                status_code=422, detail="Data inválida. Use o formato AAAA-MM-DD"
            ) from None
    if fallback:
        return fallback
    raise HTTPException(status_code=422, detail="Data é obrigatória")


def parse_competency(value: str) -> tuple[int, int, date, date]:
    try:
        year_raw, month_raw = value.split("-")
        year = int(year_raw)
        month = int(month_raw)
        return (
            year,
            month,
            date(year, month, 1),
            date(year, month, calendar.monthrange(year, month)[1]),
        )
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=422, detail="Competência deve estar no formato AAAA-MM"
        ) from None


def employment_active_in_period(employment: Employment, start: date, end: date) -> bool:
    return employment.admission_date <= end and (
        employment.termination_date is None or employment.termination_date >= start
    )


def get_or_create_closing(
    db: DbSession, company_id: int, competency: str
) -> MonthlyClosing:
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


def closed_company_ids(db: DbSession, company_id: int, competency: str) -> list[int]:
    if company_id != 0:
        return [company_id] if is_competency_closed(db, company_id, competency) else []
    return list(
        db.scalars(
            select(MonthlyClosing.company_id).where(
                MonthlyClosing.competency == competency,
                MonthlyClosing.status == "CLOSED",
            )
        )
    )


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
        "PO": "plano odontológico",
        "SV": "seguro de vida",
    }
    wanted = {
        benefit.name.strip().lower(),
        aliases.get(benefit.code.upper(), benefit.code).lower(),
    }
    return any(str(item).strip().lower() in wanted for item in employment.benefits)


@router.get("/settings")
def get_settings(db: DbSession, _: CurrentUser, company_id: int = 1) -> dict[str, Any]:
    if company_id == 0:
        company = db.scalar(
            select(Company).order_by(Company.is_primary.desc(), Company.id)
        )
        if not company:
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
    else:
        company = ensure_company(db, company_id)
    settings = ensure_settings(db, company)
    return {
        "company_name": settings.company_name,
        "cnpj": company.cnpj or "",
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
        "job_titles": global_job_titles(db),
        "family_allowance_rates": list(settings_for_scope(db, 0).family_allowance_rates or []),
    }


@router.post("/settings")
def update_settings(
    payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1
) -> dict[str, Any]:
    companies = (
        list(db.scalars(select(Company).order_by(Company.id)))
        if company_id == 0
        else [ensure_company(db, company_id)]
    )
    if not companies:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    if "family_allowance_rates" in payload:
        incoming = payload["family_allowance_rates"]
        if not isinstance(incoming, list):
            raise HTTPException(status_code=422, detail="Informe uma lista de vigências.")
        global_settings = settings_for_scope(db, 0)
        rates = {item["effective_date"]: item for item in global_settings.family_allowance_rates or []}
        try:
            for item in incoming:
                effective = date.fromisoformat(str(item["effective_date"])).isoformat()
                amount = Decimal(str(item["amount"]))
                if not amount.is_finite() or amount < 0 or amount > 1000000:
                    raise ValueError("Valor inválido")
                if effective in rates and money(rates[effective]["amount"]) != money(amount):
                    raise HTTPException(status_code=409, detail="Vigência já cadastrada. Cadastre uma nova data para preservar o histórico.")
                rates[effective] = {"effective_date": effective, "amount": as_float(amount)}
        except (KeyError, TypeError, ValueError, ArithmeticError):
            raise HTTPException(status_code=422, detail="Informe data inicial válida e valor não negativo.") from None
        global_settings.family_allowance_rates = sorted(rates.values(), key=lambda item: item["effective_date"])
    for company in companies:
        settings = ensure_settings(db, company)
        if "company_name" in payload and company_id != 0:
            settings.company_name = str(payload["company_name"])
        if "company_logo" in payload:
            settings.company_logo = str(payload["company_logo"] or "")
        if "default_daily_hours" in payload:
            settings.default_daily_hours = Decimal(
                str(payload["default_daily_hours"] or "8.80")
            )
        if "payroll_rates" in payload and isinstance(payload["payroll_rates"], dict):
            settings.payroll_rates = {
                **DEFAULT_PAYROLL_RATES,
                **payload["payroll_rates"],
            }
    if "job_titles" in payload and isinstance(payload["job_titles"], list):
        global_titles = sorted(
            {
                str(item).strip().upper()
                for item in payload["job_titles"]
                if str(item).strip()
            },
            key=str.casefold,
        )
        for company in db.scalars(select(Company).order_by(Company.id)):
            ensure_settings(db, company).job_titles = global_titles
    db.commit()
    return get_settings(db, _, company_id)


@router.get("/report-templates")
def list_report_templates(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[dict[str, Any]]:
    return list(settings_for_scope(db, company_id).report_templates or [])


@router.put("/report-templates")
def save_report_templates(
    payload: list[dict[str, Any]], db: DbSession, _: AdminUser, company_id: int = 1
) -> list[dict[str, Any]]:
    settings = settings_for_scope(db, company_id)
    settings.report_templates = payload
    db.commit()
    return list(settings.report_templates or [])


@router.get("/indicator-revenue")
def get_indicator_revenue(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> dict[str, Any]:
    return dict(settings_for_scope(db, company_id).indicator_revenue or {})


@router.patch("/indicator-revenue")
def update_indicator_revenue(
    payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1
) -> dict[str, Any]:
    scope = str(payload.get("scope", "")).strip()
    values = payload.get("values")
    if not scope or not isinstance(values, dict):
        raise HTTPException(
            status_code=422, detail="Escopo e valores de faturamento são obrigatórios"
        )
    settings = settings_for_scope(db, company_id)
    revenue = dict(settings.indicator_revenue or {})
    revenue[scope] = {str(month): as_float(value) for month, value in values.items()}
    settings.indicator_revenue = revenue
    db.commit()
    return revenue


@router.get("/benefits/catalog")
def list_benefits(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[dict[str, Any]]:
    if company_id != 0:
        ensure_company(db, company_id)
        return [benefit_to_dict(item) for item in ensure_benefits(db, company_id)]
    definitions: dict[str, BenefitDefinition] = {}
    for company in db.scalars(select(Company).order_by(Company.id)):
        for item in ensure_benefits(db, company.id):
            definitions.setdefault(item.code, item)
    return [benefit_to_dict(item) for item in definitions.values()]


@router.post("/benefits/catalog", status_code=201)
def upsert_benefit(
    payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1
) -> dict[str, Any]:
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
    item.applies_to = [
        str(value) for value in payload.get("applies_to", ["ADM", "IND", "COM", "DIR"])
    ]
    item.notes = str(payload.get("notes", ""))
    db.commit()
    db.refresh(item)
    return benefit_to_dict(item)


@router.get("/benefit-distributions")
def list_distributions(
    db: DbSession, _: CurrentUser, competency: str = "2026-06", company_id: int = 1
) -> list[dict[str, Any]]:
    query = (
        select(BenefitDistribution)
        .options(
            joinedload(BenefitDistribution.employment).joinedload(Employment.employee),
            joinedload(BenefitDistribution.employment).joinedload(
                Employment.result_center
            ),
            joinedload(BenefitDistribution.employment).joinedload(
                Employment.employment_type
            ),
        )
        .where(BenefitDistribution.competency == competency)
        .order_by(BenefitDistribution.created_at.desc())
    )
    if company_id != 0:
        query = query.where(BenefitDistribution.company_id == company_id)
    return [distribution_to_dict(item) for item in db.scalars(query)]


@router.get("/movements")
def list_movements(
    db: DbSession, _: CurrentUser, competency: str | None = None, company_id: int = 1
) -> list[dict[str, Any]]:
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
    if not competency:
        return [movement_to_dict(item) for item in db.scalars(query)]
    _, _, start, end = parse_competency(competency)
    from sqlalchemy import func
    query = query.where(Movement.start_date <= end, func.coalesce(Movement.end_date, Movement.start_date) >= start)
    settings_by_company = {item.company_id: item for item in db.scalars(select(SystemSetting))}
    result = []
    for item in db.scalars(query):
        value = movement_to_dict(item)
        days, hours = movement_share(item, start, end, settings_by_company.get(item.company_id))
        value.update(source_competency=item.competency, competency=competency,
                     total_days=item.days, total_hour_impact=as_float(item.hour_impact),
                     days=days, hour_impact=as_float(hours))
        result.append(value)
    return result


@router.post("/movements", status_code=201)
def create_movement(
    payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1
) -> dict[str, Any]:
    ensure_company(db, company_id)
    employee_id = payload.get("employee_id")
    if not employee_id:
        raise HTTPException(status_code=422, detail="Selecione um colaborador.")
    start_date = parse_date(payload.get("start_date"), date.today())
    employment_query = (
        select(Employment)
        .options(joinedload(Employment.employee), joinedload(Employment.result_center))
        .where(
            Employment.company_id == company_id,
            Employment.id == int(employee_id),
        )
    )
    selected_employment = db.scalar(employment_query)
    if not selected_employment:
        raise HTTPException(
            status_code=422,
            detail="Colaborador não encontrado na empresa selecionada.",
        )
    employment = employment_for_movement_date(
        db, selected_employment, start_date, company_id
    )
    movement_type = str(payload.get("type") or "falta")
    days = max(int(payload.get("days") or 1), 1)
    end_date, hour_impact = movement_period_values(
        movement_type,
        start_date,
        days,
        employment.daily_hours or 0,
        parse_date(payload.get("end_date")) if payload.get("end_date") else None,
        payload.get("hour_impact") or employment.daily_hours or 0,
    )
    if normalized(movement_type) == "DESLIGAMENTO":
        end_date, days, hour_impact = dismissal_values(db, employment, start_date, end_date, payload.get("days"))
    if normalized(movement_type) != "DESLIGAMENTO" and employment.termination_date and (end_date or start_date) > employment.termination_date:
        raise HTTPException(
            status_code=422,
            detail=(
                "A movimentação ultrapassa o fim deste vínculo. "
                "Divida o lançamento entre os períodos de vínculo."
            ),
        )
    movement = Movement(
        company_id=company_id,
        competency=str(payload.get("competency") or start_date.strftime("%Y-%m")),
        employee_id=employment.id,
        type=movement_type,
        start_date=start_date,
        end_date=end_date,
        days=days,
        hour_impact=hour_impact,
        observation=str(
            payload.get("observation") or "Movimentação criada no modo oficial."
        ),
        status="Pendente",
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement_to_dict(movement)


@router.patch("/movements/{movement_id}")
def update_movement(
    movement_id: int,
    payload: dict[str, Any],
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> dict[str, Any]:
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
    previous = movement_to_dict(movement)
    movement.competency = str(payload.get("competency") or movement.competency)
    movement.type = str(payload.get("type") or movement.type)
    movement.start_date = parse_date(payload.get("start_date"), movement.start_date)
    movement.employment = employment_for_movement_date(
        db, movement.employment, movement.start_date, movement.company_id
    )
    movement.employee_id = movement.employment.id
    movement.days = max(int(payload.get("days") or movement.days), 1)
    movement.end_date, movement.hour_impact = movement_period_values(
        movement.type,
        movement.start_date,
        movement.days,
        movement.employment.daily_hours or 0,
        parse_date(payload.get("end_date")) if payload.get("end_date") else None,
        payload.get("hour_impact") or movement.hour_impact,
    )
    if normalized(movement.type) == "DESLIGAMENTO":
        movement.end_date, movement.days, movement.hour_impact = dismissal_values(
            db, movement.employment, movement.start_date, movement.end_date, payload.get("days")
        )
    if (
        normalized(movement.type) != "DESLIGAMENTO" and movement.employment.termination_date
        and (movement.end_date or movement.start_date)
        > movement.employment.termination_date
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "A movimentação ultrapassa o fim deste vínculo. "
                "Divida o lançamento entre os períodos de vínculo."
            ),
        )
    movement.observation = str(payload.get("observation") or movement.observation)
    movement.status = str(payload.get("status") or movement.status)
    db.add(
        AuditEntry(
            company_id=movement.company_id,
            module="Movimentações",
            action="Movimentação editada",
            employee_name=movement.employment.employee.full_name,
            result_center=result_center_to_dict(movement.employment),
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"Antes: {previous['type']} | {previous['status']} | {previous['start_date']} | Depois: {movement.type} | {movement.status} | {movement.start_date.isoformat()}",
        )
    )
    db.commit()
    db.refresh(movement)
    return movement_to_dict(movement)


@router.delete("/movements/{movement_id}")
def delete_movement(
    movement_id: int,
    payload: dict[str, Any],
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> dict[str, bool]:
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
    db.add(
        AuditEntry(
            company_id=movement.company_id,
            module="Movimentações",
            action="Movimentação excluída",
            employee_name=movement.employment.employee.full_name,
            result_center=result_center_to_dict(movement.employment),
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"{movement.type} | {movement.status} | início {movement.start_date.isoformat()} | {movement.observation}",
        )
    )
    db.delete(movement)
    db.commit()
    return {"deleted": True}


@router.get("/mei-contracts")
def list_mei_contracts(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[dict[str, Any]]:
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
def create_mei_contract(
    payload: dict[str, Any], db: DbSession, _: AdminUser, company_id: int = 1
) -> dict[str, Any]:
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
        raise HTTPException(
            status_code=422, detail="Selecione apenas colaboradores da modalidade MEI."
        )
    start_date = parse_date(payload.get("start_date"))
    end_date = parse_date(payload.get("end_date"))
    if end_date < start_date:
        raise HTTPException(
            status_code=422, detail="A vigência final não pode ser anterior à inicial."
        )
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
def sign_mei_contract(
    contract_id: int,
    payload: dict[str, Any],
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> dict[str, Any]:
    attachment_name = str(payload.get("attachment_name") or "").strip()
    if not attachment_name:
        raise HTTPException(
            status_code=422, detail="Anexe o contrato para concluir a assinatura."
        )
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
    if contract.status != "Pendente de assinatura":
        raise HTTPException(status_code=409, detail="Somente contratos pendentes podem ser assinados.")
    if not str(payload.get("attachment_data_url") or "").startswith(("data:application/pdf;base64,", "data:image/png;base64,", "data:image/jpeg;base64,")):
        raise HTTPException(status_code=422, detail="Anexe um documento PDF, PNG ou JPEG válido.")
    contract.status = "Ativo"
    contract.attachment_name = attachment_name
    contract.attachment_data_url = str(payload.get("attachment_data_url") or "") or None
    contract.signed_at = datetime.now()
    contract.signed_by = user.full_name
    if contract.renewed_from_id:
        previous = db.get(MeiContract, contract.renewed_from_id)
        if previous and previous.status == "Ativo":
            previous.status = "Renovado"
    pending_movements = db.scalars(
        select(Movement).where(
            Movement.company_id == contract.company_id,
            Movement.observation.like(f"MEI#{contract.id} - contrato pendente%"),
            Movement.status == "Pendente",
        )
    )
    for movement in pending_movements:
        movement.status = "Aplicada"
    db.commit()
    db.refresh(contract)
    return mei_contract_to_dict(contract)


@router.patch("/mei-contracts/{contract_id}")
def update_mei_contract(
    contract_id: int,
    payload: dict[str, Any],
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> dict[str, Any]:
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
    if contract.status != "Pendente de assinatura":
        raise HTTPException(
            status_code=409,
            detail="Contrato assinado não pode ser alterado. Use Renovar para preservar o documento original.",
        )
    previous = mei_contract_to_dict(contract)
    employment_id = int(payload.get("employee_id") or contract.employee_id)
    employment = db.scalar(
        select(Employment)
        .options(
            joinedload(Employment.employee),
            joinedload(Employment.result_center),
            joinedload(Employment.employment_type),
        )
        .where(
            Employment.id == employment_id,
            Employment.company_id == contract.company_id,
            Employment.status == EmploymentStatus.ACTIVE,
        )
    )
    if not employment or employment.employment_type.name.strip().upper() != "MEI":
        raise HTTPException(status_code=422, detail="Selecione um colaborador MEI ativo.")
    start_date = parse_date(payload.get("start_date"), contract.start_date)
    end_date = parse_date(payload.get("end_date"), contract.end_date)
    if end_date < start_date:
        raise HTTPException(
            status_code=422, detail="A vigência final não pode ser anterior à inicial."
        )
    contract.employee_id = employment.id
    contract.start_date = start_date
    contract.end_date = end_date
    for movement in db.scalars(
        select(Movement).where(
            Movement.company_id == contract.company_id,
            Movement.observation.like(f"MEI#{contract.id} - contrato pendente%"),
            Movement.status == "Pendente",
        )
    ):
        movement.employee_id = employment.id
        movement.competency = start_date.strftime("%Y-%m")
        movement.start_date = start_date
    db.add(
        AuditEntry(
            company_id=contract.company_id,
            module="Contratos MEI",
            action="Contrato pendente editado",
            employee_name=employment.employee.full_name,
            result_center=result_center_to_dict(employment),
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"Antes: {previous['start_date']} a {previous['end_date']} | Depois: {start_date.isoformat()} a {end_date.isoformat()}",
        )
    )
    db.commit()
    db.refresh(contract)
    return mei_contract_to_dict(contract)


@router.post("/mei-contracts/{contract_id}/renew", status_code=201)
def renew_mei_contract(
    contract_id: int,
    payload: dict[str, Any],
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> dict[str, Any]:
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
    source = db.scalar(query)
    if not source:
        raise HTTPException(status_code=404, detail="Contrato MEI não encontrado")
    if source.status != "Ativo":
        raise HTTPException(status_code=409, detail="Somente contratos ativos podem ser renovados.")
    start_date = parse_date(payload.get("start_date"))
    end_date = parse_date(payload.get("end_date"))
    if start_date <= source.end_date:
        raise HTTPException(status_code=422, detail="A renovação deve começar depois do fim do contrato anterior.")
    if end_date < start_date:
        raise HTTPException(
            status_code=422, detail="A vigência final não pode ser anterior à inicial."
        )
    duplicate = db.scalar(
        select(MeiContract.id).where(
            MeiContract.company_id == source.company_id,
            MeiContract.employee_id == source.employee_id,
            MeiContract.status == "Pendente de assinatura",
        )
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="Já existe uma renovação pendente de assinatura para este MEI.",
        )
    renewed = MeiContract(
        renewed_from_id=source.id,
        company_id=source.company_id,
        employee_id=source.employee_id,
        status="Pendente de assinatura",
        start_date=start_date,
        end_date=end_date,
        notified_not_signed=True,
        notified_15=False,
        notified_10=False,
        notified_5=False,
        movement_created_5=False,
    )
    db.add(renewed)
    db.flush()
    db.add(
        Movement(
            company_id=source.company_id,
            competency=start_date.strftime("%Y-%m"),
            employee_id=source.employee_id,
            type="contrato não assinado",
            start_date=start_date,
            end_date=None,
            days=0,
            hour_impact=Decimal("0.00"),
            observation=f"MEI#{renewed.id} - contrato pendente de assinatura",
            status="Pendente",
        )
    )
    db.add(
        AuditEntry(
            company_id=source.company_id,
            module="Contratos MEI",
            action="Renovação de contrato criada",
            employee_name=source.employment.employee.full_name,
            result_center=result_center_to_dict(source.employment),
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"Contrato anterior #{source.id} | nova vigência {start_date.isoformat()} a {end_date.isoformat()}",
        )
    )
    db.commit()
    db.refresh(renewed)
    return mei_contract_to_dict(renewed)


@router.delete("/mei-contracts/{contract_id}")
def delete_mei_contract(
    contract_id: int,
    payload: dict[str, Any],
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> dict[str, bool]:
    if not verify_password(str(payload.get("password") or ""), user.password_hash):
        raise HTTPException(status_code=403, detail="Senha de confirmação inválida.")
    query = (
        select(MeiContract)
        .options(
            joinedload(MeiContract.employment).joinedload(Employment.employee),
            joinedload(MeiContract.employment).joinedload(Employment.result_center),
        )
        .where(MeiContract.id == contract_id)
    )
    if company_id != 0:
        query = query.where(MeiContract.company_id == company_id)
    contract = db.scalar(query)
    if not contract:
        raise HTTPException(status_code=404, detail="Contrato MEI não encontrado")
    if contract.cancelled_at:
        return {"deleted": True}
    # Logical deletion keeps signed documents and past financial references intact.
    contract.cancelled_at = datetime.now(timezone.utc)
    contract.status = "Cancelado"
    if contract.renewed_from_id:
        previous = db.get(MeiContract, contract.renewed_from_id)
        remaining = db.scalar(select(MeiContract.id).where(MeiContract.renewed_from_id == contract.renewed_from_id,
            MeiContract.id != contract.id, MeiContract.signed_at.is_not(None), MeiContract.cancelled_at.is_(None)))
        if previous and previous.status == "Renovado" and not remaining:
            previous.status = "Ativo"
    db.add(
        AuditEntry(
            company_id=contract.company_id,
            module="Contratos MEI",
            action="Contrato excluído (histórico preservado)",
            employee_name=contract.employment.employee.full_name,
            result_center=result_center_to_dict(contract.employment),
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"Contrato #{contract.id} | vigência {contract.start_date.isoformat()} a {contract.end_date.isoformat()}",
        )
    )
    for movement in db.scalars(
        select(Movement).where(
            Movement.company_id == contract.company_id,
            Movement.observation.like(f"MEI#{contract.id} - contrato pendente%"),
        )
    ):
        movement.status = "Aplicada"
    db.commit()
    return {"deleted": True}


@router.post("/mei-contracts/{contract_id}/terminate")
def terminate_mei_contract(contract_id: int, payload: dict[str, Any], db: DbSession, user: AdminUser, company_id: int = 1):
    contract = db.get(MeiContract, contract_id)
    if not contract or (company_id and contract.company_id != company_id):
        raise HTTPException(status_code=404, detail="Contrato MEI não encontrado")
    if contract.status != "Ativo" or not contract.signed_at:
        raise HTTPException(status_code=409, detail="O distrato exige um contrato assinado ativo.")
    terminated_on = parse_date(payload.get("terminated_on"))
    if not contract.start_date <= terminated_on <= contract.end_date:
        raise HTTPException(status_code=422, detail="A data do distrato deve estar dentro da vigência do contrato.")
    attachment = str(payload.get("attachment_data_url") or "")
    name = str(payload.get("attachment_name") or "").strip()
    if not name or len(name) > 240 or not attachment.startswith(("data:application/pdf;base64,", "data:image/png;base64,", "data:image/jpeg;base64,")) or len(attachment) > 14_000_000:
        raise HTTPException(status_code=422, detail="Anexe o distrato em PDF, PNG ou JPEG, até 10 MB.")
    contract.terminated_on = terminated_on
    contract.termination_attachment_name = name
    contract.termination_attachment_data_url = attachment
    contract.status = "Distratado"
    db.add(AuditEntry(company_id=contract.company_id, module="Contratos MEI", action="Distrato registrado",
        employee_name=contract.employment.employee.full_name, result_center=result_center_to_dict(contract.employment),
        performed_by=user.full_name, performed_role=user.role.value,
        details=f"Contrato #{contract.id} | distrato {terminated_on.isoformat()} | {name} | lançamentos anteriores preservados"))
    db.commit()
    return mei_contract_to_dict(contract)


@router.post("/benefit-distributions", status_code=201)
def create_distribution(
    payload: dict[str, Any], db: DbSession, user: AdminUser, company_id: int = 1
) -> dict[str, Any]:
    company = ensure_company(db, company_id)
    competency = str(payload.get("competency", "2026-06"))
    if is_competency_closed(db, company.id, competency):
        raise HTTPException(
            status_code=409,
            detail="Competência fechada. Reabra o mês para alterar benefícios.",
        )
    benefit_code = str(payload.get("benefit_code", "")).strip().upper()
    benefit = db.scalar(
        select(BenefitDefinition).where(
            BenefitDefinition.company_id == company.id,
            BenefitDefinition.code == benefit_code,
            BenefitDefinition.active.is_(True),
        )
    )
    if not benefit:
        raise HTTPException(
            status_code=404, detail="Benefício não encontrado ou inativo"
        )
    employee_ids = [int(value) for value in payload.get("employee_ids", [])]
    if not employee_ids:
        raise HTTPException(status_code=422, detail="Selecione ao menos um colaborador")
    description = str(payload.get("description", "")).strip()
    if not description:
        raise HTTPException(
            status_code=422, detail="Informe a descrição da distribuição"
        )

    items = {
        int(item.get("employee_id")): item
        for item in payload.get("items", [])
        if item.get("employee_id")
    }
    employments = list(
        db.scalars(
            select(Employment)
            .options(
                joinedload(Employment.employee),
                joinedload(Employment.result_center),
                joinedload(Employment.employment_type),
            )
            .where(
                Employment.company_id == company.id,
                Employment.id.in_(employee_ids),
                Employment.status == EmploymentStatus.ACTIVE,
            )
        )
    )
    eligible = [
        employment for employment in employments if benefit_matches(employment, benefit)
    ]
    if not eligible:
        raise HTTPException(
            status_code=422,
            detail="Nenhum colaborador elegível foi encontrado para este benefício",
        )

    created: list[BenefitDistribution] = []
    for employment in eligible:
        item = items.get(employment.id, {})
        days_worked = Decimal(
            str(item.get("days_worked", payload.get("days_worked", 0)) or 0)
        )
        value_per_day = Decimal(
            str(item.get("value_per_day", payload.get("value_per_day", 0)) or 0)
        )
        monthly_value = Decimal(
            str(item.get("monthly_value", payload.get("monthly_value", 0)) or 0)
        )
        dependents_count = int(
            item.get("dependents_count", payload.get("dependents_count", 0)) or 0
        )
        dependent_value = Decimal(
            str(item.get("dependent_value", payload.get("dependent_value", 0)) or 0)
        )
        amount = (
            money(days_worked * value_per_day)
            if benefit.mode == "DAILY"
            else money(monthly_value + Decimal(dependents_count) * dependent_value)
        )
        if amount <= 0:
            raise HTTPException(
                status_code=422, detail="Valor do benefício deve ser maior que zero"
            )
        distribution = BenefitDistribution(
            company_id=company.id,
            competency=competency,
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
    return {
        "created": len(created),
        "items": [distribution_to_dict(item) for item in created],
    }


@router.patch("/benefit-distributions/{distribution_id}")
def update_distribution(
    distribution_id: int,
    payload: dict[str, Any],
    db: DbSession,
    _: AdminUser,
    company_id: int = 1,
) -> dict[str, Any]:
    query = (
        select(BenefitDistribution)
        .options(
            joinedload(BenefitDistribution.employment).joinedload(Employment.employee),
            joinedload(BenefitDistribution.employment).joinedload(
                Employment.result_center
            ),
            joinedload(BenefitDistribution.employment).joinedload(
                Employment.employment_type
            ),
        )
        .where(BenefitDistribution.id == distribution_id)
    )
    if company_id != 0:
        query = query.where(BenefitDistribution.company_id == company_id)
    distribution = db.scalar(query)
    if not distribution:
        raise HTTPException(
            status_code=404, detail="Distribuição de benefício não encontrada"
        )
    if is_competency_closed(db, distribution.company_id, distribution.competency):
        raise HTTPException(
            status_code=409,
            detail="Competência fechada. Reabra o mês para alterar benefícios.",
        )

    distribution.days_worked = Decimal(
        str(payload.get("days_worked", distribution.days_worked) or 0)
    )
    distribution.value_per_day = Decimal(
        str(payload.get("value_per_day", distribution.value_per_day) or 0)
    )
    distribution.monthly_value = Decimal(
        str(payload.get("monthly_value", distribution.monthly_value) or 0)
    )
    distribution.dependents_count = int(
        payload.get("dependents_count", distribution.dependents_count) or 0
    )
    distribution.dependent_value = Decimal(
        str(payload.get("dependent_value", distribution.dependent_value) or 0)
    )
    distribution.description = str(
        payload.get("description", distribution.description)
    ).strip()
    distribution.amount = money(
        distribution.days_worked * distribution.value_per_day
        if distribution.days_worked > 0
        else distribution.monthly_value
        + Decimal(distribution.dependents_count) * distribution.dependent_value
    )
    if distribution.amount <= 0:
        raise HTTPException(
            status_code=422, detail="Valor do benefício deve ser maior que zero"
        )
    db.commit()
    db.refresh(distribution)
    return distribution_to_dict(distribution)


@router.delete("/benefit-distributions/{distribution_id}")
def delete_distribution(
    distribution_id: int,
    db: DbSession,
    _: AdminUser,
    company_id: int = 1,
) -> dict[str, bool]:
    query = select(BenefitDistribution).where(BenefitDistribution.id == distribution_id)
    if company_id != 0:
        query = query.where(BenefitDistribution.company_id == company_id)
    distribution = db.scalar(query)
    if not distribution:
        raise HTTPException(
            status_code=404, detail="Distribuição de benefício não encontrada"
        )
    if is_competency_closed(db, distribution.company_id, distribution.competency):
        raise HTTPException(
            status_code=409,
            detail="Competência fechada. Reabra o mês para alterar benefícios.",
        )
    db.delete(distribution)
    db.commit()
    return {"ok": True}


@router.get("/cost-allocations")
def list_cost_allocations(
    _: CurrentUser, company_id: int = 1, competency: str = "2026-06"
) -> list[dict[str, Any]]:
    return []


def launch_employments(db: DbSession, company_id: int) -> list[Employment]:
    return list(
        db.scalars(
            select(Employment)
            .options(
                joinedload(Employment.employee),
                joinedload(Employment.result_center),
                joinedload(Employment.employment_type),
            )
            .where(Employment.company_id == company_id)
            .order_by(Employment.employee_id)
        )
    )


def valid_mei_contract_ids(
    db: DbSession, company_id: int, competency: str
) -> set[int]:
    try:
        year, month = (int(value) for value in competency.split("-"))
        period_start = date(year, month, 1)
        period_end = date(year, month, calendar.monthrange(year, month)[1])
    except (TypeError, ValueError):
        return set()
    return set(
        db.scalars(
            select(MeiContract.employee_id).where(
                MeiContract.company_id == company_id,
                MeiContract.status.in_(["Ativo", "Renovado", "Distratado"]),
                MeiContract.signed_at.is_not(None),
                MeiContract.start_date <= period_end,
                MeiContract.end_date >= period_start,
                (MeiContract.terminated_on.is_(None)) | (MeiContract.terminated_on >= period_start),
            )
        )
    )


def launch_response(db: DbSession, batch: LaunchBatch) -> dict[str, Any]:
    return launch_batch_to_dict(
        batch,
        launch_employments(db, batch.company_id),
        valid_mei_contract_ids(db, batch.company_id, batch.competency),
    )


def load_launch_batch(db: DbSession, batch_id: int, company_id: int) -> LaunchBatch:
    batch = db.scalar(
        select(LaunchBatch)
        .options(selectinload(LaunchBatch.items))
        .where(LaunchBatch.id == batch_id, LaunchBatch.company_id == company_id)
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return batch


@router.get("/launches")
def list_launches(
    db: DbSession, _: CurrentUser, company_id: int = 1, competency: str = "2026-06"
) -> list[dict[str, Any]]:
    ensure_company(db, company_id)
    batches = list(
        db.scalars(
            select(LaunchBatch)
            .options(selectinload(LaunchBatch.items))
            .where(
                LaunchBatch.company_id == company_id,
                LaunchBatch.competency == competency,
            )
            .order_by(LaunchBatch.updated_at.desc(), LaunchBatch.id.desc())
        )
    )
    return [launch_response(db, batch) for batch in batches]


@router.post("/launches")
def create_launch(
    payload: dict[str, Any], db: DbSession, user: AdminUser, company_id: int = 1
) -> dict[str, Any]:
    ensure_company(db, company_id)
    competency = str(payload.get("competency") or "")
    kind = str(payload.get("kind") or "").upper()
    if kind not in LAUNCH_KINDS:
        raise HTTPException(status_code=422, detail="Tipo de lançamento inválido")
    parse_competency(competency)
    if is_competency_closed(db, company_id, competency):
        raise HTTPException(status_code=409, detail="Competência fechada. Reabra o mês para lançar valores.")
    batch = db.scalar(
        select(LaunchBatch)
        .options(selectinload(LaunchBatch.items))
        .where(
            LaunchBatch.company_id == company_id,
            LaunchBatch.competency == competency,
            LaunchBatch.kind == kind,
        )
    )
    if not batch:
        batch = LaunchBatch(
            company_id=company_id,
            competency=competency,
            kind=kind,
            status="PENDING",
            filters=payload.get("filters") or {},
            created_by=user.full_name,
            updated_by=user.full_name,
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)
    return launch_response(db, batch)


@router.get("/launches/{batch_id}")
def get_launch(
    batch_id: int, db: DbSession, _: CurrentUser, company_id: int = 1
) -> dict[str, Any]:
    batch = load_launch_batch(db, batch_id, company_id)
    return launch_response(db, batch)


@router.patch("/launches/{batch_id}")
def save_launch_draft(
    batch_id: int,
    payload: dict[str, Any],
    db: DbSession,
    user: AdminUser,
    company_id: int = 1,
) -> dict[str, Any]:
    batch = load_launch_batch(db, batch_id, company_id)
    if batch.status != "PENDING":
        raise HTTPException(status_code=409, detail="Lançamento já confirmado e bloqueado para edição.")
    if is_competency_closed(db, company_id, batch.competency):
        raise HTTPException(status_code=409, detail="Competência fechada. Reabra o mês para editar.")
    employments = launch_employments(db, company_id)
    valid_mei_ids = valid_mei_contract_ids(db, company_id, batch.competency)
    eligible_ids = {
        item.id for item in employments
        if launch_eligible(item, batch.kind, valid_mei_ids, batch.competency)
    }
    incoming: dict[int, tuple[Decimal, str]] = {}
    for raw in payload.get("items") or []:
        employment_id = int(raw.get("employment_id") or 0)
        amount = money(raw.get("amount") or 0)
        if employment_id not in eligible_ids:
            raise HTTPException(status_code=422, detail="Há colaborador inelegível neste lançamento.")
        if amount < 0:
            raise HTTPException(status_code=422, detail="O valor não pode ser negativo.")
        if amount > 0:
            incoming[employment_id] = (amount, str(raw.get("note") or "")[:240])
    for item in list(batch.items):
        db.delete(item)
    db.flush()
    for employment_id, (amount, note) in incoming.items():
        db.add(LaunchItem(batch_id=batch.id, employment_id=employment_id, amount=amount, note=note))
    batch.filters = payload.get("filters") or {}
    batch.updated_by = user.full_name
    db.commit()
    batch = load_launch_batch(db, batch.id, company_id)
    return launch_response(db, batch)


@router.post("/launches/{batch_id}/confirm")
def confirm_launch(
    batch_id: int, db: DbSession, user: AdminUser, company_id: int = 1
) -> dict[str, Any]:
    batch = load_launch_batch(db, batch_id, company_id)
    if batch.status != "PENDING":
        raise HTTPException(status_code=409, detail="Este lançamento já foi confirmado.")
    if is_competency_closed(db, company_id, batch.competency):
        raise HTTPException(status_code=409, detail="Competência fechada. Reabra o mês para confirmar.")
    employments = {item.id: item for item in launch_employments(db, company_id)}
    valid_mei_ids = valid_mei_contract_ids(db, company_id, batch.competency)
    valid_items = [
        item for item in batch.items
        if item.amount > 0 and item.employment_id in employments
        and launch_eligible(
            employments[item.employment_id], batch.kind, valid_mei_ids, batch.competency
        )
    ]
    if not valid_items:
        raise HTTPException(status_code=422, detail="Informe ao menos um valor antes de confirmar.")
    if len(valid_items) != len(batch.items):
        raise HTTPException(status_code=409, detail="A lista de elegíveis mudou. Salve o rascunho novamente.")
    if batch.kind in LAUNCH_FIELDS:
        field = LAUNCH_FIELDS[batch.kind]
        existing_overrides = {
            item.employment_id: item
            for item in db.scalars(
                select(PayrollOverride).where(
                    PayrollOverride.company_id == company_id,
                    PayrollOverride.competency == batch.competency,
                    PayrollOverride.employment_id.in_([item.employment_id for item in valid_items]),
                )
            )
        }
        conflicts = [
            employments[item.employment_id].employee.full_name
            for item in valid_items
            if item.employment_id in existing_overrides
            and any(money((existing_overrides[item.employment_id].values or {}).get(key, 0)) != Decimal("0.00")
                for key in ([field, "pro_labore"] if batch.kind == "MEI" else [field]))
        ]
        if conflicts:
            raise HTTPException(
                status_code=409,
                detail=f"Já existe valor no Custo/Folha para: {', '.join(conflicts[:5])}. Remova o ajuste anterior antes de confirmar.",
            )
        for item in valid_items:
            override = existing_overrides.get(item.employment_id)
            if not override:
                override = PayrollOverride(
                    company_id=company_id,
                    competency=batch.competency,
                    employment_id=item.employment_id,
                    values={},
                    updated_by=user.full_name,
                )
                db.add(override)
            override.values = {**(override.values or {}), field: as_float(item.amount)}
            override.updated_by = user.full_name
    else:
        existing_baskets = set(
            db.scalars(
                select(BenefitDistribution.employee_id).where(
                    BenefitDistribution.company_id == company_id,
                    BenefitDistribution.competency == batch.competency,
                    BenefitDistribution.benefit_code == "CB",
                    BenefitDistribution.employee_id.in_([item.employment_id for item in valid_items]),
                )
            )
        )
        if existing_baskets:
            names = [employments[item_id].employee.full_name for item_id in existing_baskets]
            raise HTTPException(
                status_code=409,
                detail=f"Já existe Cesta básica lançada para: {', '.join(names[:5])}. Remova o lançamento anterior antes de confirmar.",
            )
        for item in valid_items:
            db.add(
                BenefitDistribution(
                    company_id=company_id,
                    competency=batch.competency,
                    benefit_code="CB",
                    benefit_name="Cesta básica",
                    employee_id=item.employment_id,
                    monthly_value=item.amount,
                    amount=item.amount,
                    source="Lançamentos",
                    description="Lançamento mensal confirmado",
                    created_by=user.full_name,
                )
            )
    batch.status = "CONFIRMED"
    batch.updated_by = user.full_name
    batch.confirmed_at = datetime.now(timezone.utc)
    total = sum((item.amount for item in valid_items), Decimal("0.00"))
    db.add(
        AuditEntry(
            company_id=company_id,
            module="Lançamentos",
            action="Lançamento confirmado",
            employee_name=None,
            result_center=None,
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"{batch.kind} | {batch.competency} | {len(valid_items)} colaborador(es) | Total R$ {total:.2f}",
        )
    )
    db.commit()
    batch = load_launch_batch(db, batch.id, company_id)
    return launch_response(db, batch)


@router.delete("/launches/{batch_id}")
def delete_launch_draft(
    batch_id: int, db: DbSession, _: AdminUser, company_id: int = 1
) -> dict[str, bool]:
    batch = load_launch_batch(db, batch_id, company_id)
    if batch.status != "PENDING":
        raise HTTPException(status_code=409, detail="Somente rascunhos podem ser excluídos.")
    db.delete(batch)
    db.commit()
    return {"deleted": True}


@router.get("/payroll")
def payroll(
    db: DbSession, _: CurrentUser, competency: str = "2026-06", company_id: int = 1
) -> list[dict[str, Any]]:
    _, _, period_start, period_end = parse_competency(competency)
    exits = departure_map(db, company_id)
    company = ensure_company(db, company_id) if company_id != 0 else None
    rates = (
        ensure_settings(db, company).payroll_rates if company else DEFAULT_PAYROLL_RATES
    )
    rates = {**DEFAULT_PAYROLL_RATES, **(rates or {})}
    employment_query = (
        select(Employment)
        .options(
            joinedload(Employment.employee),
            joinedload(Employment.result_center),
            joinedload(Employment.employment_type),
        )
        .order_by(Employment.employee_id)
    )
    if company_id != 0:
        employment_query = employment_query.where(Employment.company_id == company_id)
    employments = [
        item for item in db.scalars(employment_query)
        if period_active(item, period_start, period_end, exits)
    ]
    distributions = list(
        db.scalars(
            select(BenefitDistribution).where(
                BenefitDistribution.competency == competency,
                BenefitDistribution.company_id.in_(
                    [employment.company_id for employment in employments]
                    or [company_id]
                ),
            )
        )
    )
    benefit_totals: dict[int, dict[str, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0.00"))
    )
    for item in distributions:
        benefit_totals[item.employee_id][item.benefit_code.upper()] += item.amount
    overrides = {
        item.employment_id: item.values
        for item in db.scalars(
            select(PayrollOverride).where(
                PayrollOverride.competency == competency,
                PayrollOverride.company_id.in_(
                    [employment.company_id for employment in employments]
                    or [company_id]
                ),
            )
        )
    }

    rows = []
    for employment in employments:
        employment_rates = rates
        if company_id == 0:
            employment_company = ensure_company(db, employment.company_id)
            stored_rates = ensure_settings(db, employment_company).payroll_rates
            employment_rates = {**DEFAULT_PAYROLL_RATES, **(stored_rates or {})}
        rows.append(
            payroll_row(
                employment,
                benefit_totals[employment.id],
                employment_rates,
                overrides.get(employment.id),
                period_start,
                period_end,
                effective_end(employment, exits),
            )
        )
    return rows


@router.patch("/payroll/{employment_id}")
def save_payroll_override(
    employment_id: int,
    payload: dict[str, Any],
    db: DbSession,
    user: AdminUser,
    competency: str = "2026-06",
    company_id: int = 1,
) -> dict[str, Any]:
    employment = db.get(Employment, employment_id)
    if not employment or (company_id != 0 and employment.company_id != company_id):
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")
    if is_competency_closed(db, employment.company_id, competency):
        raise HTTPException(
            status_code=409,
            detail="Competência fechada. Reabra o mês para editar o custo.",
        )
    allowed = {
        "salary",
        "gratification",
        "pro_labore",
        "profit_distribution",
        "bonus",
        "cost_aid",
        "transport",
        "meal",
        "basic_basket",
        "lodging",
        "insurance",
        "health_plan",
        "dental_plan",
    }
    values = {key: as_float(value) for key, value in payload.items() if key in allowed}
    override = db.scalar(
        select(PayrollOverride).where(
            PayrollOverride.company_id == employment.company_id,
            PayrollOverride.competency == competency,
            PayrollOverride.employment_id == employment.id,
        )
    )
    if override:
        override.values = values
        override.updated_by = user.full_name
    else:
        override = PayrollOverride(
            company_id=employment.company_id,
            competency=competency,
            employment_id=employment.id,
            values=values,
            updated_by=user.full_name,
        )
        db.add(override)
    db.commit()
    return {
        "saved": True,
        "employment_id": employment.id,
        "competency": competency,
        "values": values,
    }


@router.get("/report-preview")
def report_preview(
    db: DbSession, user: CurrentUser, competency: str = "2026-06", company_id: int = 1,
    supervisor: str = "", state: str = "", modality: str = "", query: str = "", center_code: str = "",
) -> dict[str, Any]:
    company = ensure_company(db, company_id) if company_id != 0 else None
    settings = ensure_settings(db, company) if company else None
    from app.api.routes.dashboard import get_dashboard
    year, month, _, _ = parse_competency(competency)
    dashboard = get_dashboard(db, user, month=month, year=year, company_id=company_id,
        supervisor=supervisor, state=state, modality=modality, query=query, center_code=center_code)
    return {
        "company": company.name if company else "Todas as empresas",
        "company_logo": settings.company_logo if settings else "",
        "cards": [card.model_dump() for card in dashboard.cards],
        "summary": dashboard.consolidated.model_dump(),
    }


@router.get("/closing")
def get_closing(
    db: DbSession, _: CurrentUser, competency: str = "2026-06", company_id: int = 1
) -> dict[str, Any]:
    company = ensure_company(db, company_id)
    parse_competency(competency)
    closing = get_or_create_closing(db, company.id, competency)
    return closing_to_dict(closing)


@router.post("/closing")
def update_closing(
    payload: dict[str, Any], db: DbSession, user: AdminUser, company_id: int = 1
) -> dict[str, Any]:
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


@router.get("/alerts")
def list_alerts(
    db: DbSession, _: CurrentUser, company_id: int = 1
) -> list[dict[str, Any]]:
    today = date.today()
    alerts: list[dict[str, Any]] = []

    mei_query = (
        select(MeiContract)
        .options(
            joinedload(MeiContract.company),
            joinedload(MeiContract.employment).joinedload(Employment.employee),
            joinedload(MeiContract.employment).joinedload(Employment.result_center),
            joinedload(MeiContract.employment).joinedload(Employment.employment_type),
        )
        .order_by(MeiContract.end_date.asc(), MeiContract.id.asc())
    )
    movement_query = (
        select(Movement)
        .options(
            joinedload(Movement.company),
            joinedload(Movement.employment).joinedload(Employment.employee),
            joinedload(Movement.employment).joinedload(Employment.result_center),
        )
        .where(Movement.status == "Pendente")
        .order_by(Movement.start_date.asc(), Movement.id.asc())
    )

    if company_id != 0:
        ensure_company(db, company_id)
        mei_query = mei_query.where(MeiContract.company_id == company_id)
        movement_query = movement_query.where(Movement.company_id == company_id)

    for contract in db.scalars(mei_query):
        if contract.status not in {"Ativo", "Pendente de assinatura"}:
            continue
        employment = contract.employment
        if not employment:
            continue
        company_name = (
            contract.company.name
            if contract.company
            else employment.company.name
            if employment.company
            else ""
        )
        days_left = (contract.end_date - today).days

        if contract.status == "Pendente de assinatura":
            alerts.append(
                {
                    "id": f"mei-pending-{contract.id}",
                    "target_id": contract.id,
                    "company_id": contract.company_id,
                    "company_name": company_name,
                    "type": "Contrato não assinado",
                    "employee_name": employment.employee.full_name,
                    "result_center": result_center_to_dict(employment),
                    "due_date": contract.start_date.isoformat(),
                    "message": f"Assine o contrato de {employment.employee.full_name} para ativar o vínculo.",
                    "severity": "Alta",
                }
            )
            continue

        if days_left > 15:
            continue

        severity = "Baixa"
        if days_left <= 5:
            severity = "Alta"
        elif days_left <= 10:
            severity = "Média"

        alerts.append(
            {
                "id": f"mei-due-{contract.id}",
                "target_id": contract.id,
                "company_id": contract.company_id,
                "company_name": company_name,
                "type": "Contrato próximo do vencimento",
                "employee_name": employment.employee.full_name,
                "result_center": result_center_to_dict(employment),
                "due_date": contract.end_date.isoformat(),
                "message": f"A vigência termina em {days_left} dia(s).",
                "severity": severity,
            }
        )

    for movement in db.scalars(movement_query):
        if movement.type in {"contrato não assinado", "contrato MEI a vencer"} and movement.observation.startswith("MEI#"):
            contract_number = movement.observation.split(" ", 1)[0][4:]
            linked_contract = db.get(MeiContract, int(contract_number)) if contract_number.isdigit() else None
            if linked_contract and (linked_contract.status not in {"Ativo", "Pendente de assinatura"}
                or (movement.type == "contrato não assinado" and linked_contract.signed_at)):
                continue
        employment = movement.employment
        if not employment:
            continue
        company_name = (
            movement.company.name
            if movement.company
            else employment.company.name
            if employment.company
            else ""
        )
        age_days = max((today - movement.start_date).days, 0)
        severity = "Baixa"
        if age_days >= 7:
            severity = "Alta"
        elif age_days >= 3:
            severity = "Média"
        alerts.append(
            {
                "id": f"movement-pending-{movement.id}",
                "target_id": movement.id,
                "company_id": movement.company_id,
                "company_name": company_name,
                "type": "Ajuste pendente",
                "employee_name": employment.employee.full_name,
                "result_center": result_center_to_dict(employment),
                "due_date": movement.start_date.isoformat(),
                "message": f"Movimentação {movement.type} pendente de conferência.",
                "severity": severity,
            }
        )

    severity_order = {"Alta": 0, "Média": 1, "Baixa": 2}
    alerts.sort(
        key=lambda item: (
            severity_order.get(item["severity"], 99),
            item["due_date"],
            item["employee_name"],
        )
    )
    return alerts[:200]


@router.get("/audit-logs")
def audit_logs(
    db: DbSession,
    _: CurrentUser,
    company_id: int = 1,
    module: str = "",
    query: str = "",
    limit: int = 100,
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []

    employment_query = (
        select(Employment)
        .options(
            joinedload(Employment.company),
            joinedload(Employment.employee),
            joinedload(Employment.result_center),
            joinedload(Employment.employment_type),
            selectinload(Employment.salary_history),
        )
        .order_by(Employment.id.desc())
    )
    benefit_query = (
        select(BenefitDistribution)
        .options(
            joinedload(BenefitDistribution.company),
            joinedload(BenefitDistribution.employment).joinedload(Employment.company),
            joinedload(BenefitDistribution.employment).joinedload(Employment.employee),
            joinedload(BenefitDistribution.employment).joinedload(
                Employment.result_center
            ),
        )
        .order_by(BenefitDistribution.created_at.desc(), BenefitDistribution.id.desc())
    )
    movement_query = (
        select(Movement)
        .options(
            joinedload(Movement.company),
            joinedload(Movement.employment).joinedload(Employment.company),
            joinedload(Movement.employment).joinedload(Employment.employee),
            joinedload(Movement.employment).joinedload(Employment.result_center),
        )
        .order_by(Movement.start_date.desc(), Movement.id.desc())
    )
    mei_query = (
        select(MeiContract)
        .options(
            joinedload(MeiContract.company),
            joinedload(MeiContract.employment).joinedload(Employment.company),
            joinedload(MeiContract.employment).joinedload(Employment.employee),
            joinedload(MeiContract.employment).joinedload(Employment.result_center),
            joinedload(MeiContract.employment).joinedload(Employment.employment_type),
        )
        .order_by(MeiContract.created_at.desc(), MeiContract.id.desc())
    )
    settings_query = (
        select(SystemSetting)
        .options(joinedload(SystemSetting.company))
        .order_by(SystemSetting.id.desc())
    )
    persistent_query = (
        select(AuditEntry)
        .options(joinedload(AuditEntry.company))
        .order_by(AuditEntry.created_at.desc())
    )

    if company_id != 0:
        ensure_company(db, company_id)
        employment_query = employment_query.where(Employment.company_id == company_id)
        benefit_query = benefit_query.where(
            BenefitDistribution.company_id == company_id
        )
        movement_query = movement_query.where(Movement.company_id == company_id)
        mei_query = mei_query.where(MeiContract.company_id == company_id)
        settings_query = settings_query.where(SystemSetting.company_id == company_id)
        persistent_query = persistent_query.where(AuditEntry.company_id == company_id)
    if module:
        persistent_query = persistent_query.where(AuditEntry.module == module)

    for item in db.scalars(persistent_query.limit(min(max(limit, 1), 200))):
        entries.append(
            {
                "id": f"audit-{item.id}",
                "company_id": item.company_id,
                "company_name": item.company.name if item.company else "",
                "module": item.module,
                "action": item.action,
                "employee_name": item.employee_name,
                "result_center": item.result_center,
                "performed_by": item.performed_by,
                "performed_role": item.performed_role,
                "created_at": item.created_at.isoformat() if item.created_at else "",
                "details": item.details,
            }
        )

    for employment in db.scalars(employment_query):
        if not employment.salary_history:
            continue
        for item in sorted(
            employment.salary_history,
            key=lambda history: history.effective_date,
            reverse=True,
        ):
            company_name = employment.company.name if employment.company else ""
            entries.append(
                {
                    "id": f"salary-{employment.id}-{item.effective_date.isoformat()}",
                    "company_id": employment.company_id,
                    "company_name": company_name,
                    "module": "Colaboradores",
                    "action": "Atualização salarial",
                    "employee_name": employment.employee.full_name,
                    "result_center": result_center_to_dict(employment),
                    "performed_by": "Sistema",
                    "performed_role": "ADMIN",
                    "created_at": item.effective_date.isoformat(),
                    "details": f"{item.reason or 'Histórico salarial'} | salário {money(item.amount)} | família {money(item.family_allowance)}",
                }
            )

    for item in db.scalars(benefit_query):
        employment = item.employment
        if not employment:
            continue
        company_name = (
            item.company.name
            if item.company
            else employment.company.name
            if employment.company
            else ""
        )
        entries.append(
            {
                "id": f"benefit-{item.id}",
                "company_id": item.company_id,
                "company_name": company_name,
                "module": "Benefícios",
                "action": f"Distribuição de {item.benefit_name}",
                "employee_name": employment.employee.full_name,
                "result_center": result_center_to_dict(employment),
                "performed_by": item.created_by or "Sistema",
                "performed_role": "ADMIN",
                "created_at": item.created_at.isoformat(),
                "details": f"{item.source} | {item.description} | valor {money(item.amount)}",
            }
        )

    for movement in db.scalars(movement_query):
        employment = movement.employment
        if not employment:
            continue
        company_name = (
            movement.company.name
            if movement.company
            else employment.company.name
            if employment.company
            else ""
        )
        entries.append(
            {
                "id": f"movement-{movement.id}",
                "company_id": movement.company_id,
                "company_name": company_name,
                "module": "Movimentações",
                "action": f"Lançamento de {movement.type}",
                "employee_name": employment.employee.full_name,
                "result_center": result_center_to_dict(employment),
                "performed_by": "Sistema",
                "performed_role": "ADMIN",
                "created_at": movement.start_date.isoformat(),
                "details": f"{movement.status} | {movement.observation}",
            }
        )

    for contract in db.scalars(mei_query):
        employment = contract.employment
        if not employment:
            continue
        company_name = (
            contract.company.name
            if contract.company
            else employment.company.name
            if employment.company
            else ""
        )
        entries.append(
            {
                "id": f"mei-{contract.id}",
                "company_id": contract.company_id,
                "company_name": company_name,
                "module": "Contratos MEI",
                "action": "Lançamento de contrato",
                "employee_name": employment.employee.full_name,
                "result_center": result_center_to_dict(employment),
                "performed_by": "Sistema",
                "performed_role": "ADMIN",
                "created_at": contract.created_at.isoformat()
                if contract.created_at
                else contract.start_date.isoformat(),
                "details": f"{contract.status} | vigência {contract.start_date.isoformat()} a {contract.end_date.isoformat()}",
            }
        )
        if contract.signed_at:
            entries.append(
                {
                    "id": f"mei-sign-{contract.id}",
                    "company_id": contract.company_id,
                    "company_name": company_name,
                    "module": "Contratos MEI",
                    "action": "Assinatura de contrato",
                    "employee_name": employment.employee.full_name,
                    "result_center": result_center_to_dict(employment),
                    "performed_by": contract.signed_by or "Sistema",
                    "performed_role": "ADMIN",
                    "created_at": contract.signed_at.isoformat(),
                    "details": f"Anexo {contract.attachment_name or '-'}",
                }
            )

    for settings in db.scalars(settings_query):
        company_name = (
            settings.company.name if settings.company else settings.company_name
        )
        entries.append(
            {
                "id": f"settings-{settings.id}",
                "company_id": settings.company_id,
                "company_name": company_name,
                "module": "Configurações",
                "action": "Ajustes do sistema salvos",
                "employee_name": None,
                "result_center": None,
                "performed_by": "Sistema",
                "performed_role": "ADMIN",
                "created_at": settings.configured_at.isoformat()
                if settings.configured_at
                else "",
                "details": "Cargos, encargos, backup e parâmetros por empresa.",
            }
        )

    if module:
        entries = [item for item in entries if item["module"] == module]
    if query.strip():
        normalized_query = query.strip().casefold()
        entries = [
            item
            for item in entries
            if normalized_query
            in " ".join(
                str(item.get(field) or "")
                for field in (
                    "action",
                    "details",
                    "performed_by",
                    "employee_name",
                    "company_name",
                )
            ).casefold()
        ]
    entries.sort(key=lambda item: item["created_at"], reverse=True)
    return entries[: min(max(limit, 1), 200)]


@router.post("/import-preview")
def import_preview(_: CurrentUser) -> dict[str, Any]:
    return {"rows": 0, "valid": 0, "errors": []}


@router.get("/indicators")
def indicators(
    db: DbSession, user: CurrentUser, competency: str = "2026-06", company_id: int = 1
) -> dict[str, Any]:
    _, _, start, end = parse_competency(competency)
    if company_id != 0:
        ensure_company(db, company_id)
    closed_ids = closed_company_ids(db, company_id, competency)
    if not closed_ids:
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
    employment_query = select(Employment).options(
        joinedload(Employment.employee),
        joinedload(Employment.result_center),
        joinedload(Employment.employment_type),
    )
    employment_query = employment_query.where(Employment.company_id.in_(closed_ids))
    employments = list(db.scalars(employment_query))

    movement_query = overlapping_movements(start, end)
    movement_query = movement_query.where(Movement.company_id.in_(closed_ids))
    movements = list(db.scalars(movement_query))
    settings_by_company = {item.company_id: item for item in db.scalars(select(SystemSetting))}
    metrics = operational_metrics(employments, movements, start, end, settings_by_company, departure_map(db, company_id))
    initial_headcount, final_headcount = metrics["initial"], metrics["final"]
    admissions, terminations = metrics["admissions"], metrics["terminations"]
    average_headcount = metrics["average"]
    non_productive_hours, scheduled_hours = metrics["unproductive"], metrics["scheduled"]

    payroll_rows = [
        row
        for scoped_company_id in closed_ids
        for row in payroll(db, user, competency, scoped_company_id)
    ]
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
        "turnover": ((admissions + terminations) / 2 / final_headcount)
        if final_headcount
        else 0,
        "gross_payroll": gross_payroll,
        "net_payroll": net_payroll,
        "salary_per_capita": gross_payroll / final_headcount if final_headcount else 0,
        "total_cost": total_cost,
        "productive_days": max((len(business_days(start, end, settings_by_company.get(item.company_id))) for item in employments), default=0),
        "non_productive_hours": non_productive_hours,
    }


@router.get("/indicators/sheets")
def indicator_sheets(
    db: DbSession, user: CurrentUser, competency: str = "2026-06", company_id: int = 1
) -> dict[str, Any]:
    year, _, _, _ = parse_competency(competency)
    if company_id != 0:
        ensure_company(db, company_id)
    centers_query = select(ResultCenter).where(ResultCenter.active.is_(True))
    if company_id != 0:
        centers_query = centers_query.where(ResultCenter.company_id == company_id)
    centers = list(db.scalars(centers_query.order_by(ResultCenter.code)))
    centers = list({center.code: center for center in centers}.values())
    sheets = {
        center.code: build_indicator_sheet(db, user, year, center, company_id)
        for center in centers
    }
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


def build_indicator_sheet(
    db: DbSession, user: CurrentUser, year: int, center: Any, company_id: int
) -> dict[str, Any]:
    month_labels = [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
    ]
    cost_keys = {
        "Salário": "salary",
        "Gratificação": "gratification",
        "Prolabore": "pro_labore",
        "Dist. Lucro": "profit_distribution",
        "Premiação": "bonus",
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

    employment_query = select(Employment).join(ResultCenter).options(joinedload(Employment.employment_type)).where(ResultCenter.code == center.code)
    if company_id != 0:
        employment_query = employment_query.where(Employment.company_id == company_id)
    employments = list(db.scalars(employment_query))
    settings_by_company = {item.company_id: ensure_settings(db, ensure_company(db, item.company_id)) for item in employments}
    exits = departure_map(db, company_id)

    for month in range(1, 13):
        month_competency = f"{year}-{month:02d}"
        closed_ids = {key for key in settings_by_company if is_competency_closed(db, key, month_competency)}
        if not closed_ids:
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
            if row["result_center"]["code"] == center.code and row["result_center"]["company_id"] in closed_ids
        ]
        month_movements = list(db.scalars(overlapping_movements(start, end).where(Movement.company_id.in_(closed_ids))))
        month_movements = [
            item
            for item in month_movements
            if item.employment and item.employment.result_center.code == center.code
        ]
        metrics = operational_metrics([item for item in employments if item.company_id in closed_ids], month_movements, start, end,
            settings_by_company, exits)
        initial, final = metrics["initial"], metrics["final"]
        admissions, terminations = metrics["admissions"], metrics["terminations"]
        non_productive, scheduled = metrics["unproductive"], metrics["scheduled"]
        absence_days = metrics["absence_days"]
        average_headcount = (initial + final) / 2 if (initial or final) else 0
        turnover_value = ((admissions + terminations) / 2 / final) if final else 0
        absenteeism_value = non_productive / scheduled if scheduled else 0
        turnover_values.append(turnover_value)
        absenteeism_values.append(absenteeism_value)

        for label, key in cost_keys.items():
            if key == "benefits_total":
                value = sum(
                    float(row["transport"])
                    + float(row["meal"])
                    + float(row["lodging"])
                    + float(row["insurance"])
                    + float(row["health_plan"])
                    + float(row["dental_plan"])
                    + float(row["basic_basket"])
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
        "costRows": [
            {"label": label, "values": values, "total": round(sum(values), 2)}
            for label, values in costs.items()
        ],
        "operationalRows": [
            {"label": label, "values": values, "total": round(sum(values), 2)}
            for label, values in operational.items()
        ],
        "financeRows": finance_rows,
        "turnoverRows": turnover_rows,
        "absenteeismRows": absenteeism_rows,
        "financeMetricLabel": "Colab",
        "financeMetricUnit": "colaboradores",
        "turnoverMeta": 0,
        "absenteeismMeta": 0,
        "costMeta": 0,
    }


def payroll_row(
    employment: Employment,
    benefits: dict[str, Decimal],
    rates: dict[str, Any],
    override: dict[str, Any] | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    termination_date: date | None = None,
) -> dict[str, Any]:
    values = override or {}
    allocation_factor = Decimal("1")
    if period_start and period_end:
        active_start = max(period_start, employment.admission_date)
        active_end = min(period_end, termination_date or employment.termination_date or period_end)
        active_days = max((active_end - active_start).days + 1, 0)
        allocation_factor = Decimal(active_days) / Decimal((period_end - period_start).days + 1)
    salary = money(
        values.get(
            "salary",
            employment.salary_base * allocation_factor
            if employment.employment_type.name.upper() == "CLT"
            else 0,
        )
    )
    pro_labore = money(
        values.get(
            "pro_labore",
            employment.salary_base
            if "PRÓ" in employment.employment_type.name.upper()
            or "PRO" in employment.employment_type.name.upper()
            else 0,
        )
    )
    if normalized(employment.employment_type.name) == "MEI":
        # Preserve amounts already posted to the legacy pro_labore field.
        salary = money(salary + pro_labore)
        pro_labore = Decimal("0")
    cost_aid = money(values.get("cost_aid", employment.cost_aid * allocation_factor))
    gratification = money(values.get("gratification", employment.gratification * allocation_factor))
    transport = money(values.get("transport", benefits.get("VT", Decimal("0.00"))))
    meal = money(values.get("meal", benefits.get("AL", Decimal("0.00"))))
    basic_basket = money(values.get("basic_basket", benefits.get("CB", Decimal("0.00"))))
    health_plan = money(values.get("health_plan", benefits.get("PS", Decimal("0.00"))))
    dental_plan = money(values.get("dental_plan", benefits.get("PO", Decimal("0.00"))))
    insurance = money(values.get("insurance", benefits.get("SV", Decimal("0.00"))))
    profit_distribution = money(values.get("profit_distribution", 0))
    bonus = money(values.get("bonus", 0))
    lodging = money(values.get("lodging", 0))
    subtotal = money(
        salary + gratification + pro_labore + profit_distribution + bonus + cost_aid
    )
    benefit_total = money(transport + meal + basic_basket + lodging + insurance + health_plan + dental_plan)
    charge_base = subtotal if employment.employment_type.has_charges and normalized(employment.employment_type.name) not in {"MEI", "FREELANCER"} else Decimal("0")
    inss = money(charge_base * Decimal(str(rates["inss"])) / 100)
    rat = money(charge_base * Decimal(str(rates["rat"])) / 100)
    terceiros = money(charge_base * Decimal(str(rates["terceiros"])) / 100)
    fgts = money(charge_base * Decimal(str(rates["fgts"])) / 100)
    charges = money(inss + rat + terceiros + fgts)
    vacation = money(charge_base / 12)
    vacation_third = money(vacation / 3)
    fgts_vacation = money(
        (vacation + vacation_third) * Decimal(str(rates["fgts_vacation"])) / 100
    )
    thirteenth = money(charge_base / 12)
    fgts_thirteenth = money(thirteenth * Decimal(str(rates["fgts_thirteenth"])) / 100)
    notice = money(charge_base / 12)
    fgts_notice = money(notice * Decimal(str(rates["fgts_notice"])) / 100)
    fgts_fine = money(
        (fgts + fgts_vacation + fgts_thirteenth + fgts_notice)
        * Decimal(str(rates["multa_fgts"]))
        / 100
    )
    patronal = money(
        (vacation + vacation_third + thirteenth + notice)
        * Decimal(str(rates["patronal"]))
        / 100
    )
    provisions = money(
        vacation
        + vacation_third
        + fgts_vacation
        + thirteenth
        + fgts_thirteenth
        + notice
        + fgts_notice
        + fgts_fine
        + patronal
    )
    total_cost = money(subtotal + charges + provisions + benefit_total)
    return {
        "employee_id": employment.id,
        "person_id": employment.employee_id,
        "employee_name": employment.employee.full_name,
        "period_start": max(period_start, employment.admission_date).isoformat() if period_start else employment.admission_date.isoformat(),
        "period_end": min(period_end, termination_date or employment.termination_date or period_end).isoformat() if period_end else (employment.termination_date.isoformat() if employment.termination_date else None),
        "allocation_factor": as_float(allocation_factor),
        "result_center": result_center_to_dict(employment),
        "employment_type": employment_type_to_dict(employment),
        "salary": as_float(salary),
        "gratification": as_float(gratification),
        "pro_labore": as_float(pro_labore),
        "profit_distribution": as_float(profit_distribution),
        "bonus": as_float(bonus),
        "cost_aid": as_float(cost_aid),
        "transport": as_float(transport),
        "meal": as_float(meal),
        "basic_basket": as_float(basic_basket),
        "lodging": as_float(lodging),
        "insurance": as_float(insurance),
        "health_plan": as_float(health_plan),
        "dental_plan": as_float(dental_plan),
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
        "gross_payroll": as_float(subtotal + benefit_total),
        "net_payroll": as_float(subtotal + charges),
        "total_cost": as_float(total_cost),
        "grand_total": as_float(total_cost),
    }

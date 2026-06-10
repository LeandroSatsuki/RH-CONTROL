import calendar
from datetime import date

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.api.dependencies import CurrentUser, DbSession
from app.models.company import Company
from app.models.employment import Employment
from app.models.enums import EmploymentStatus
from app.models.result_center import ResultCenter
from app.schemas.dashboard import DashboardCard, DashboardCompany, DashboardResponse
from app.services.indicators import turnover

router = APIRouter()


def month_bounds(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def active_in_period(item: Employment, start: date, end: date) -> bool:
    return item.admission_date <= end and (
        item.termination_date is None or item.termination_date >= start
    )


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    db: DbSession,
    _: CurrentUser,
    month: int = Query(ge=1, le=12),
    year: int = Query(ge=2000, le=2100),
    company_id: int = 1,
    result_center_id: int | None = None,
    employment_type_id: int | None = None,
) -> DashboardResponse:
    start, end = month_bounds(year, month)
    previous_end = start.fromordinal(start.toordinal() - 1)
    previous_start = previous_end.replace(day=1)

    company = db.get(Company, company_id) if company_id != 0 else None
    if company_id != 0 and not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    centers_query = select(ResultCenter).where(ResultCenter.active.is_(True)).order_by(ResultCenter.code)
    if company_id != 0:
        centers_query = centers_query.where(ResultCenter.company_id == company_id)
    if result_center_id:
        centers_query = centers_query.where(ResultCenter.id == result_center_id)
    centers = list(db.scalars(centers_query))

    employment_query = select(Employment).options(joinedload(Employment.employment_type))
    if company_id != 0:
        employment_query = employment_query.where(Employment.company_id == company_id)
    if employment_type_id:
        employment_query = employment_query.where(Employment.employment_type_id == employment_type_id)
    employments = list(db.scalars(employment_query))

    cards: list[DashboardCard] = []
    for center in centers:
        scoped = [item for item in employments if item.result_center_id == center.id]
        active = [
            item
            for item in scoped
            if active_in_period(item, start, end) and item.status != EmploymentStatus.INACTIVE
        ]
        previous_active = [item for item in scoped if active_in_period(item, previous_start, previous_end)]
        admissions = sum(start <= item.admission_date <= end for item in scoped)
        terminations = sum(
            bool(item.termination_date and start <= item.termination_date <= end) for item in scoped
        )
        by_type: dict[str, int] = {}
        for item in active:
            by_type[item.employment_type.name] = by_type.get(item.employment_type.name, 0) + 1
        average = (len(previous_active) + len(active)) / 2
        cards.append(
            DashboardCard(
                id=center.id,
                code=center.code,
                name=center.name,
                color=center.color,
                active_employees=len(active),
                by_employment_type=by_type,
                admissions=admissions,
                terminations=terminations,
                absenteeism=0,
                turnover=turnover(admissions, terminations, len(active)),
                gross_payroll=0,
                net_payroll=0,
                total_cost=0,
                previous_active_employees=len(previous_active),
            )
        )
    return DashboardResponse(
        company=None if company_id == 0 else DashboardCompany(id=company.id, code=company.code, name=company.name, kind=company.kind, group_name=company.group_name),
        month=month,
        year=year,
        cards=cards,
    )

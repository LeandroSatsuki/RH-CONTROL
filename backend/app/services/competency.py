"""Shared date rules for movements, headcount and monthly reports."""
import calendar
import unicodedata
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, select

from app.models.movement import Movement


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFD", value or "") if unicodedata.category(c) != "Mn").strip().upper()


ABSENCE_TYPES = {"FALTA", "ATESTADO", "AFASTAMENTO", "FERIAS", "DESLIGAMENTO"}


def month_bounds(competency):
    year, month = map(int, competency.split("-"))
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def business_days(start, end, settings=None):
    saturday = bool(getattr(settings, "include_saturdays", False))
    sunday = bool(getattr(settings, "include_sundays", False))
    holidays = set(getattr(settings, "holidays", []) or [])
    return [
        start + timedelta(days=offset)
        for offset in range(max((end - start).days + 1, 0))
        if ((start + timedelta(days=offset)).weekday() < 5
            or ((start + timedelta(days=offset)).weekday() == 5 and saturday)
            or ((start + timedelta(days=offset)).weekday() == 6 and sunday))
        and (start + timedelta(days=offset)).isoformat() not in holidays
    ]


def overlapping_movements(start, end):
    return select(Movement).where(
        Movement.start_date <= end,
        func.coalesce(Movement.end_date, Movement.start_date) >= start,
    )


def departures(movements):
    result = {}
    for movement in movements:
        if normalized(movement.type) == "DESLIGAMENTO" and normalized(movement.status) != "CANCELADA":
            result[movement.employee_id] = min(result.get(movement.employee_id, movement.start_date), movement.start_date)
    return result


def departure_map(db, company_id=0):
    query = select(Movement).where(func.lower(Movement.type) == "desligamento")
    if company_id:
        query = query.where(Movement.company_id == company_id)
    return departures(db.scalars(query))


def effective_end(employment, exits):
    dates = [value for value in (employment.termination_date, exits.get(employment.id)) if value]
    return min(dates) if dates else None


def active_in_period(employment, start, end, exits):
    ending = effective_end(employment, exits)
    return employment.admission_date <= end and (ending is None or ending >= start)


def movement_share(movement, start, end, settings=None):
    """Allocate editable totals cumulatively so monthly parts sum to the original."""
    first = movement.start_date
    last = movement.end_date or first
    if normalized(movement.type) == "DESLIGAMENTO":
        first += timedelta(days=1)
        dates = business_days(first, last, settings)
    else:
        dates = [first + timedelta(days=i) for i in range(max((last - first).days + 1, 0))]
    if not dates:
        return 0, Decimal("0.00")
    before = sum(day < start for day in dates)
    through = sum(day <= end for day in dates)
    total_days = max(movement.days, 0)
    def apportioned(count):
        return int((Decimal(total_days) * count / len(dates)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    days = apportioned(through) - apportioned(before)
    if total_days:
        def hours(count):
            return (Decimal(str(movement.hour_impact or 0)) * apportioned(count) / total_days).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        def hours(count):
            return (Decimal(str(movement.hour_impact or 0)) * count / len(dates)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return days, hours(through) - hours(before)


def operational_metrics(employments, movements, start, end, settings_by_company, exits=None):
    exits = exits if exits is not None else departures(movements)
    clt = [item for item in employments if normalized(item.employment_type.name) == "CLT"]
    previous_day = start - timedelta(days=1)
    initial = len({item.employee_id for item in clt if active_in_period(item, previous_day, previous_day, exits)})
    final = len({item.employee_id for item in clt if active_in_period(item, end, end, exits)})
    admissions = len({item.employee_id for item in clt if start <= item.admission_date <= end and not any(
        other.id != item.id and other.employee_id == item.employee_id
        and effective_end(other, exits) == item.admission_date - timedelta(days=1)
        for other in clt
    )})
    ids = {item.id for item in clt}
    terminations = len({item.employee_id for item in movements if item.employee_id in ids
        and normalized(item.type) == "DESLIGAMENTO" and start <= item.start_date <= end
        and normalized(item.status) != "CANCELADA"})
    scheduled = Decimal("0")
    for item in clt:
        if not active_in_period(item, start, end, exits):
            continue
        last = min(effective_end(item, exits) or end, end)
        # Vacant business days after an explicit dismissal remain in the denominator.
        if item.id in exits and start <= exits[item.id] <= end:
            last = end
        scheduled += Decimal(str(item.daily_hours or 0)) * len(business_days(max(start, item.admission_date), last, settings_by_company.get(item.company_id)))
    absence_days = 0
    hours = Decimal("0")
    for item in movements:
        if item.employee_id not in ids or normalized(item.type) not in ABSENCE_TYPES or normalized(item.status) == "CANCELADA":
            continue
        part_days, part_hours = movement_share(item, start, end, settings_by_company.get(item.company_id))
        hours += part_hours
        if normalized(item.type) in {"AFASTAMENTO", "FALTA", "FERIAS", "ATESTADO"}:
            absence_days += part_days
    return {"initial": initial, "final": final, "admissions": admissions, "terminations": terminations,
        "scheduled": float(scheduled), "unproductive": float(hours), "absence_days": absence_days,
        "average": (initial + final) / 2,
        "absenteeism": float(hours / scheduled) if scheduled else 0,
        "turnover": (admissions + terminations) / 2 / final if final else 0}

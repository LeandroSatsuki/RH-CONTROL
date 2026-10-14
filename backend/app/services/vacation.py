"""Consultative rules from the supplied specification, not a payroll/legal engine.

Intervals are [start, end): acquisition completes on its anniversary; the UI
shows the previous day as the last acquisition/concession day. Event dates are
inclusive. Avos use completed anniversary months (2.5 days each), not a legal
15-day fraction. Suspensions postpone milestones by unique calendar days.
Manual RESTART/LOSE takes effect on the day after the leave ends.
"""

from calendar import monthrange
from datetime import date, timedelta

DAY = timedelta(days=1)


def add_months(value: date, months: int) -> date:
    year, month = divmod(value.year * 12 + value.month - 1 + months, 12)
    return date(year, month + 1, min(value.day, monthrange(year, month + 1)[1]))


def merged_suspensions(events: list[dict]) -> list[tuple[date, date]]:
    intervals = sorted(
        (e["start_date"], e["end_date"] + DAY)
        for e in events
        if e["kind"] == "LEAVE" and e["effect"] != "NONE"
    )
    merged: list[tuple[date, date]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def milestone(start: date, months: int, suspensions: list[tuple[date, date]]) -> date:
    target = add_months(start, months)
    # Each disjoint suspension is applied once; no day-by-day loop.
    for left, right in suspensions:
        if right <= start:
            continue
        if left >= target:
            break
        target += right - max(start, left)
    return target


def accrued(period: dict, at: date) -> float:
    cutoff = min(at, period["reset_on"]) if period["reset_on"] else at
    return sum(point <= cutoff for point in period["milestones"]) * 2.5


def duration(event: dict) -> int:
    return (event["end_date"] - event["start_date"]).days + 1


def calculate(admission: date, events: list[dict], as_of: date) -> dict:
    events = sorted(events, key=lambda e: (e["start_date"], e["id"]))
    suspensions = merged_suspensions(events)
    horizon = max([as_of, admission] + [e["end_date"] for e in events])
    periods: list[dict] = []
    start = admission
    while start <= horizon:
        milestones = [milestone(start, n, suspensions) for n in range(1, 13)]
        end = milestones[-1]
        period = {
            "start": start,
            "end": end,
            "milestones": milestones,
            "reset_on": None,
            "reason": "",
            "reset_event_id": None,
        }
        resets = [
            (e["end_date"] + DAY, e)
            for e in events
            if e["kind"] == "LEAVE"
            and e["effect"] in ("RESTART", "LOSE")
            and start < e["end_date"] + DAY <= end
            and e["end_date"] >= admission
        ]
        if not periods:
            for event in events:
                if (
                    event["kind"] != "COLLECTIVE"
                    or not start <= event["start_date"] < end
                ):
                    continue
                used = sum(
                    duration(e) + e["sold_days"]
                    for e in events
                    if e["kind"] in ("VACATION", "COLLECTIVE")
                    and e["start_date"] < event["start_date"]
                    and (e["period_start"] == start or e["kind"] == "COLLECTIVE")
                )
                if duration(event) > accrued(period, event["start_date"]) - used:
                    resets.append((event["end_date"] + DAY, event))
                    break
        if resets:
            reset_on, event = min(resets, key=lambda pair: (pair[0], pair[1]["id"]))
            period.update(
                reset_on=reset_on,
                reset_event_id=event["id"],
                reason=(
                    "Perdido por afastamento"
                    if event["effect"] == "LOSE"
                    else "Reiniciado por férias coletivas"
                    if event["kind"] == "COLLECTIVE"
                    else "Reiniciado por afastamento"
                ),
            )
        periods.append(period)
        start = period["reset_on"] or end

    allocations: dict[int, dict | None] = {}
    for event in events:
        if event["kind"] == "VACATION":
            allocations[event["id"]] = next(
                (p for p in periods if p["start"] == event["period_start"]), None
            )
        elif event["kind"] == "COLLECTIVE":
            allocations[event["id"]] = next(
                (
                    p
                    for p in periods
                    if p["start"] <= event["start_date"] < (p["reset_on"] or p["end"])
                ),
                None,
            )

    warnings: list[dict] = []

    def warn(event: dict, code: str, message: str):
        warnings.append({"event_id": event["id"], "code": code, "message": message})

    for index, event in enumerate(events):
        if event["start_date"] < admission:
            warn(event, "BEFORE_ADMISSION", "Lançamento anterior à admissão informada.")
        if event["kind"] not in ("VACATION", "COLLECTIVE"):
            continue
        period = allocations[event["id"]]
        if not period:
            warn(
                event,
                "PERIOD_NOT_FOUND",
                "Período aquisitivo não encontrado; revise a vinculação manual.",
            )
        else:
            previous = [e for e in events[:index] if allocations.get(e["id"]) is period]
            balance = accrued(period, event["start_date"]) - sum(
                duration(e) + e["sold_days"] for e in previous
            )
            if period["reset_on"] and event["start_date"] >= period["reset_on"]:
                balance = 0
                warn(
                    event,
                    "PERIOD_RESET",
                    "Lançamento vinculado a período perdido ou reiniciado.",
                )
            if duration(event) + event["sold_days"] > balance:
                warn(
                    event,
                    "INSUFFICIENT_DAYS",
                    f"Avos/saldo insuficientes: {balance:g} dia(s) disponível(is) no início.",
                )
            concession_end = add_months(period["end"], 12)
            if event["kind"] == "VACATION" and (
                event["start_date"] < period["end"]
                or event["end_date"] >= concession_end
            ):
                warn(
                    event,
                    "OUTSIDE_CONCESSION",
                    "Férias fora do período concessivo calculado.",
                )
            if event["sold_days"] and accrued(period, event["start_date"]) < 30:
                warn(
                    event,
                    "SALE_WITHOUT_FULL_PERIOD",
                    "Venda de dias sem aquisição do período integral.",
                )
            if event["sold_days"] + sum(e["sold_days"] for e in previous) > 10:
                warn(
                    event,
                    "SALE_ABOVE_THIRD",
                    "Dias vendidos ultrapassam 1/3 do período-base de 30 dias.",
                )
            # Advisory CLT art.134 reference only; never rejects a submission.
            # https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm
            individual = [e for e in [*previous, event] if e["kind"] == "VACATION"]
            lengths = [duration(e) for e in individual]
            used = sum(duration(e) + e["sold_days"] for e in [*previous, event])
            if event["kind"] == "VACATION" and (
                len(lengths) > 3
                or min(lengths) < 5
                or ((len(lengths) >= 3 or used >= 30) and max(lengths) < 14)
            ):
                warn(
                    event,
                    "SPLITTING",
                    "Revisar fracionamento: referência de até 3 períodos, um de 14 dias e demais de 5 dias ou mais.",
                )
        for other in events:
            if other["id"] == event["id"] or other["kind"] == "ABSENCE":
                continue
            if (
                event["start_date"] <= other["end_date"]
                and other["start_date"] <= event["end_date"]
            ):
                label = {
                    "LEAVE": "afastamento",
                    "COLLECTIVE": "férias coletivas",
                    "VACATION": "outras férias",
                }[other["kind"]]
                warn(
                    event,
                    f"CONFLICT_{other['kind']}",
                    f"Conflito com {label} ({other['start_date'].strftime('%d/%m/%Y')} a {other['end_date'].strftime('%d/%m/%Y')}).",
                )

    result = []
    for period in periods:
        assigned = [e for e in events if allocations.get(e["id"]) is period]
        consumed = sum(duration(e) + e["sold_days"] for e in assigned)
        realized = sum(
            duration(e) + e["sold_days"] for e in assigned if e["end_date"] <= as_of
        )
        earned = accrued(period, as_of)
        reset = bool(period["reset_on"] and period["reset_on"] <= as_of)
        available = 0 if reset else earned - consumed
        concession_end = add_months(period["end"], 12)
        overdue = not reset and as_of >= concession_end and earned > realized
        status = (
            period["reason"]
            if reset
            else "Vencido"
            if overdue
            else "Concessivo"
            if as_of >= period["end"]
            else "Aquisitivo"
            if as_of >= period["start"]
            else "Futuro"
        )
        result.append(
            {
                "start": period["start"].isoformat(),
                "end": (period["end"] - DAY).isoformat(),
                "concession_start": period["end"].isoformat(),
                "concession_end": (concession_end - DAY).isoformat(),
                "reset_on": period["reset_on"].isoformat()
                if period["reset_on"]
                else None,
                "reset_reason": period["reason"],
                "reset_event_id": period["reset_event_id"],
                "accrued_days": earned,
                "allocated_days": consumed,
                "available_days": available,
                "overdue_days": max(0, earned - realized) if overdue else 0,
                "status": status,
            }
        )
    return {"as_of": as_of.isoformat(), "periods": result, "warnings": warnings}

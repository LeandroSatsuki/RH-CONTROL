from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select, update

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.audit_entry import AuditEntry
from app.models.company import Company
from app.models.vacation import VacationDossier, VacationEvent, VacationHistory
from app.schemas.vacation import DossierInput, DossierUpdate, EventInput
from app.services.vacation import calculate

router = APIRouter()


@router.get("/reports")
def consultative_report(
    db: DbSession,
    _: CurrentUser,
    company_id: int = Query(0, ge=0),
    kind: Literal[
        "map", "acquisition", "concession", "overdue", "insufficient"
    ] = "map",
    as_of: date = Query(
        default_factory=date.today, ge=date(1900, 1, 1), le=date(2100, 12, 31)
    ),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    # Explicit, on-demand report. Process bounded batches; only retain requested
    # page in memory. No N+1 event lookup and no load of historical JSON snapshots.
    query = select(VacationDossier).order_by(VacationDossier.id)
    if company_id:
        query = query.where(VacationDossier.company_id == company_id)
    company_names = dict(db.execute(select(Company.id, Company.name)).all())
    rows, total, cursor = [], 0, 0
    while True:
        batch = list(db.scalars(query.where(VacationDossier.id > cursor).limit(100)))
        if not batch:
            break
        grouped: dict[int, list[dict]] = {item.id: [] for item in batch}
        for event in db.scalars(
            select(VacationEvent).where(
                VacationEvent.dossier_id.in_(grouped),
                VacationEvent.cancelled_at.is_(None),
            )
        ):
            grouped[event.dossier_id].append(event_data(event))
        for item in batch:
            result = calculate(item.admission_date, grouped[item.id], as_of)
            base = {
                "Empresa": company_names.get(item.company_id, ""),
                "Nome": item.name,
                "Referência": item.reference,
            }
            candidates = []
            if kind == "insufficient":
                for warning in result["warnings"]:
                    if warning["code"] == "INSUFFICIENT_DAYS":
                        event = next(
                            e
                            for e in grouped[item.id]
                            if e["id"] == warning["event_id"]
                        )
                        candidates.append(
                            {
                                **base,
                                "Início": event["start_date"].strftime("%d/%m/%Y"),
                                "Fim": event["end_date"].strftime("%d/%m/%Y"),
                                "Aviso": warning["message"],
                            }
                        )
            else:
                for period in result["periods"]:
                    if period["start"] > as_of.isoformat():
                        continue
                    if kind == "overdue" and not period["overdue_days"]:
                        continue
                    row = {
                        **base,
                        "Aquisitivo início": date.fromisoformat(
                            period["start"]
                        ).strftime("%d/%m/%Y"),
                        "Aquisitivo fim previsto": date.fromisoformat(
                            period["end"]
                        ).strftime("%d/%m/%Y"),
                        "Concessivo início": date.fromisoformat(
                            period["concession_start"]
                        ).strftime("%d/%m/%Y"),
                        "Concessivo fim": date.fromisoformat(
                            period["concession_end"]
                        ).strftime("%d/%m/%Y"),
                        "Avos em dias": period["accrued_days"],
                        "Dias lançados/reservados": period["allocated_days"],
                        "Dias disponíveis": period["available_days"],
                        "Dias vencidos": period["overdue_days"],
                        "Situação": period["status"],
                        "Reinício/perda em": period["reset_on"] or "",
                    }
                    if kind == "acquisition":
                        row = {
                            key: value
                            for key, value in row.items()
                            if not key.startswith("Concessivo")
                            and key != "Dias vencidos"
                        }
                    elif kind == "concession":
                        row.pop("Dias lançados/reservados")
                        row.pop("Avos em dias")
                    elif kind == "map":
                        row["Férias individuais informadas"] = "; ".join(
                            f"{e['start_date'].strftime('%d/%m/%Y')} a {e['end_date'].strftime('%d/%m/%Y')} ({e['sold_days']} vendidos)"
                            for e in grouped[item.id]
                            if e["kind"] == "VACATION"
                            and e["period_start"]
                            and e["period_start"].isoformat() == period["start"]
                        )
                    candidates.append(row)
            for row in candidates:
                if offset <= total < offset + limit:
                    rows.append(row)
                total += 1
        cursor = batch[-1].id
    return {"as_of": as_of, "total": total, "items": rows}


def event_data(event: VacationEvent) -> dict:
    return {
        key: getattr(event, key)
        for key in (
            "id",
            "kind",
            "start_date",
            "end_date",
            "leave_type",
            "effect",
            "sold_days",
            "period_start",
            "notes",
            "cancelled_at",
        )
    }


def dossier_data(item: VacationDossier) -> dict:
    return {
        key: getattr(item, key)
        for key in (
            "id",
            "company_id",
            "name",
            "reference",
            "admission_date",
            "notes",
            "revision",
        )
    }


def get_dossier(db, dossier_id: int, company_id: int) -> VacationDossier:
    item = db.get(VacationDossier, dossier_id)
    if not item or (company_id and item.company_id != company_id):
        raise HTTPException(404, "Ficha de férias não encontrada nesta empresa.")
    return item


def snapshot(db, item: VacationDossier, as_of: date | None = None) -> dict:
    events = [
        event_data(e)
        for e in db.scalars(
            select(VacationEvent)
            .where(VacationEvent.dossier_id == item.id)
            .order_by(VacationEvent.start_date, VacationEvent.id)
        )
    ]
    return jsonable_encoder(
        {
            **dossier_data(item),
            "events": events,
            **calculate(
                item.admission_date,
                [e for e in events if not e["cancelled_at"]],
                as_of or date.today(),
            ),
        }
    )


def claim_revision(db, item: VacationDossier, expected: int):
    result = db.execute(
        update(VacationDossier)
        .where(VacationDossier.id == item.id, VacationDossier.revision == expected)
        .values(revision=VacationDossier.revision + 1)
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            409, "Esta ficha foi alterada em outra sessão. Recarregue antes de salvar."
        )
    db.refresh(item)


def record_history(db, item, user, action, before):
    db.flush()
    after = snapshot(db, item)
    db.add(
        VacationHistory(
            dossier_id=item.id,
            action=action,
            performed_by=user.full_name,
            before=before,
            after=after,
        )
    )
    db.add(
        AuditEntry(
            company_id=item.company_id,
            module="Férias consultivas",
            action=action,
            employee_name=item.name,
            performed_by=user.full_name,
            performed_role=user.role.value,
            details=f"Ficha manual {item.id}, revisão {item.revision}. Sem reflexos financeiros.",
        )
    )
    db.commit()
    return after


@router.get("/dossiers")
def list_dossiers(
    db: DbSession,
    _: CurrentUser,
    company_id: int = Query(0, ge=0),
    search: str = Query("", max_length=180),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    as_of: date = Query(
        default_factory=date.today, ge=date(1900, 1, 1), le=date(2100, 12, 31)
    ),
):
    query = select(VacationDossier)
    if company_id:
        query = query.where(VacationDossier.company_id == company_id)
    if search.strip():
        query = query.where(
            VacationDossier.name.icontains(search.strip(), autoescape=True)
            | VacationDossier.reference.icontains(search.strip(), autoescape=True)
        )
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = list(
        db.scalars(
            query.order_by(VacationDossier.name, VacationDossier.id)
            .offset(offset)
            .limit(limit)
        )
    )
    events: dict[int, list[dict]] = {item.id: [] for item in items}
    if items:
        for event in db.scalars(
            select(VacationEvent).where(
                VacationEvent.dossier_id.in_(events),
                VacationEvent.cancelled_at.is_(None),
            )
        ):
            events[event.dossier_id].append(event_data(event))
    return {
        "total": total,
        "items": [
            {
                **dossier_data(item),
                **calculate(item.admission_date, events[item.id], as_of),
            }
            for item in items
        ],
    }


@router.post("/dossiers", status_code=201)
def create_dossier(
    payload: DossierInput,
    db: DbSession,
    user: AdminUser,
    company_id: int = Query(..., gt=0),
):
    if not db.get(Company, company_id):
        raise HTTPException(404, "Empresa não encontrada.")
    item = VacationDossier(company_id=company_id, **payload.model_dump())
    db.add(item)
    db.flush()
    return record_history(db, item, user, "Ficha criada", None)


@router.get("/dossiers/{dossier_id}")
def read_dossier(
    dossier_id: int,
    db: DbSession,
    _: CurrentUser,
    company_id: int = Query(0, ge=0),
    as_of: date = Query(
        default_factory=date.today, ge=date(1900, 1, 1), le=date(2100, 12, 31)
    ),
):
    return snapshot(db, get_dossier(db, dossier_id, company_id), as_of)


@router.put("/dossiers/{dossier_id}")
def edit_dossier(
    dossier_id: int,
    payload: DossierUpdate,
    db: DbSession,
    user: AdminUser,
    company_id: int = Query(..., gt=0),
):
    item = get_dossier(db, dossier_id, company_id)
    before = snapshot(db, item)
    claim_revision(db, item, payload.revision)
    for key, value in payload.model_dump(exclude={"revision"}).items():
        setattr(item, key, value)
    return record_history(
        db, item, user, "Ficha editada e períodos recalculados", before
    )


@router.post("/dossiers/{dossier_id}/preview")
def preview_event(
    dossier_id: int,
    payload: EventInput,
    db: DbSession,
    _: CurrentUser,
    company_id: int = Query(..., gt=0),
    event_id: int | None = None,
):
    item = get_dossier(db, dossier_id, company_id)
    if item.revision != payload.revision:
        raise HTTPException(
            409, "Ficha alterada em outra sessão. Recarregue para simular."
        )
    events = [
        event_data(e)
        for e in db.scalars(
            select(VacationEvent).where(
                VacationEvent.dossier_id == item.id,
                VacationEvent.cancelled_at.is_(None),
            )
        )
    ]
    if event_id is not None and not any(e["id"] == event_id for e in events):
        raise HTTPException(404, "Lançamento não encontrado.")
    proposal = {
        **payload.model_dump(exclude={"revision"}),
        "id": event_id or 2147483647,
    }
    result = calculate(
        item.admission_date,
        [e for e in events if e["id"] != event_id] + [proposal],
        payload.start_date,
    )
    return {**result, "proposal_id": proposal["id"]}


@router.post("/dossiers/{dossier_id}/events", status_code=201)
def create_event(
    dossier_id: int,
    payload: EventInput,
    db: DbSession,
    user: AdminUser,
    company_id: int = Query(..., gt=0),
):
    item = get_dossier(db, dossier_id, company_id)
    before = snapshot(db, item)
    claim_revision(db, item, payload.revision)
    db.add(
        VacationEvent(dossier_id=item.id, **payload.model_dump(exclude={"revision"}))
    )
    return record_history(
        db, item, user, "Lançamento incluído; avisos e períodos recalculados", before
    )


@router.put("/dossiers/{dossier_id}/events/{event_id}")
def edit_event(
    dossier_id: int,
    event_id: int,
    payload: EventInput,
    db: DbSession,
    user: AdminUser,
    company_id: int = Query(..., gt=0),
):
    item = get_dossier(db, dossier_id, company_id)
    event = db.get(VacationEvent, event_id)
    if not event or event.dossier_id != item.id or event.cancelled_at:
        raise HTTPException(404, "Lançamento não encontrado ou cancelado.")
    before = snapshot(db, item)
    claim_revision(db, item, payload.revision)
    for key, value in payload.model_dump(exclude={"revision"}).items():
        setattr(event, key, value)
    return record_history(
        db, item, user, "Lançamento editado; avisos e períodos recalculados", before
    )


@router.delete("/dossiers/{dossier_id}/events/{event_id}")
def cancel_event(
    dossier_id: int,
    event_id: int,
    db: DbSession,
    user: AdminUser,
    revision: int = Query(..., ge=1),
    company_id: int = Query(..., gt=0),
):
    item = get_dossier(db, dossier_id, company_id)
    event = db.get(VacationEvent, event_id)
    if not event or event.dossier_id != item.id or event.cancelled_at:
        raise HTTPException(404, "Lançamento não encontrado ou cancelado.")
    before = snapshot(db, item)
    claim_revision(db, item, revision)
    event.cancelled_at = datetime.now(timezone.utc)
    return record_history(
        db, item, user, "Lançamento cancelado (registro preservado)", before
    )


@router.get("/dossiers/{dossier_id}/history")
def read_history(
    dossier_id: int,
    db: DbSession,
    _: CurrentUser,
    company_id: int = Query(0, ge=0),
    before_id: int | None = Query(None, gt=0),
    limit: int = Query(20, ge=1, le=50),
):
    get_dossier(db, dossier_id, company_id)
    query = select(VacationHistory).where(VacationHistory.dossier_id == dossier_id)
    if before_id:
        query = query.where(VacationHistory.id < before_id)
    items = list(db.scalars(query.order_by(VacationHistory.id.desc()).limit(limit + 1)))
    return {
        "items": [
            {
                "id": e.id,
                "action": e.action,
                "performed_by": e.performed_by,
                "created_at": e.created_at,
                "before": e.before,
                "after": e.after,
            }
            for e in items[:limit]
        ],
        "next_before_id": items[limit - 1].id if len(items) > limit else None,
    }

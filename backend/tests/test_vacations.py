from datetime import date
import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import app
from app.models.vacation import VacationDossier, VacationEvent, VacationHistory
from app.services.vacation import add_months, calculate
from test_api_flow import auth_header, client  # noqa: F401


def event(id=1, kind="VACATION", start="2025-01-01", end="2025-01-30", **changes):
    return {
        "id": id,
        "kind": kind,
        "start_date": date.fromisoformat(start),
        "end_date": date.fromisoformat(end),
        "sold_days": 0,
        "effect": "NONE",
        "period_start": date(2024, 1, 1),
        **changes,
    }


def codes(result):
    return {w["code"] for w in result["warnings"]}


@pytest.mark.parametrize(
    "start,months,expected",
    [
        ("2024-02-29", 12, "2025-02-28"),
        ("2024-01-31", 1, "2024-02-29"),
        ("2025-01-31", 1, "2025-02-28"),
        ("2025-12-31", 2, "2026-02-28"),
    ],
)
def test_anniversaries_clamp_month_end(start, months, expected):
    assert add_months(date.fromisoformat(start), months).isoformat() == expected


def test_acquisition_and_concession_boundaries_full_months():
    before = calculate(date(2024, 1, 15), [], date(2024, 2, 14))["periods"][0]
    after = calculate(date(2024, 1, 15), [], date(2024, 2, 15))["periods"][0]
    assert before["accrued_days"] == 0
    assert after["accrued_days"] == 2.5
    assert after["end"] == "2025-01-14"
    assert after["concession_start"] == "2025-01-15"
    assert after["concession_end"] == "2026-01-14"


def test_suspension_union_does_not_double_count_and_absence_has_no_impact():
    leaves = [
        event(kind="LEAVE", start="2024-01-10", end="2024-01-19", effect="SUSPEND"),
        event(2, "LEAVE", "2024-01-15", "2024-01-21", effect="SUSPEND"),
    ]
    result = calculate(date(2024, 1, 1), leaves, date(2024, 2, 12))
    assert result["periods"][0]["accrued_days"] == 0
    result = calculate(date(2024, 1, 1), leaves, date(2024, 2, 13))
    assert result["periods"][0]["accrued_days"] == 2.5
    assert result["periods"][0]["end"] == "2025-01-12"
    assert (
        calculate(date(2024, 1, 1), [event(kind="ABSENCE")], date(2024, 2, 1))[
            "periods"
        ][0]["accrued_days"]
        == 2.5
    )


@pytest.mark.parametrize(
    "effect,status",
    [("RESTART", "Reiniciado por afastamento"), ("LOSE", "Perdido por afastamento")],
)
def test_manual_leave_restarts_and_preserves_old_period(effect, status):
    result = calculate(
        date(2024, 1, 1),
        [event(kind="LEAVE", start="2024-06-01", end="2024-06-30", effect=effect)],
        date(2024, 8, 1),
    )
    assert result["periods"][0]["status"] == status
    assert result["periods"][0]["available_days"] == 0
    assert result["periods"][1]["start"] == "2024-07-01"
    assert result["periods"][1]["accrued_days"] == 2.5


def test_collective_restarts_only_first_insufficient_period():
    early = event(kind="COLLECTIVE", start="2024-02-01", end="2024-02-15")
    result = calculate(date(2024, 1, 1), [early], date(2024, 3, 16))
    assert result["periods"][0]["reset_on"] == "2024-02-16"
    assert result["periods"][1]["accrued_days"] == 2.5
    assert "INSUFFICIENT_DAYS" in codes(result)
    sufficient = event(kind="COLLECTIVE", start="2024-07-01", end="2024-07-15")
    result = calculate(date(2024, 1, 1), [sufficient], date(2024, 8, 1))
    assert result["periods"][0]["reset_on"] is None
    later = event(kind="COLLECTIVE", start="2025-02-01", end="2025-02-15")
    result = calculate(date(2024, 1, 1), [later], date(2025, 3, 1))
    assert all(p["reset_on"] is None for p in result["periods"])


def test_warning_rules_conflicts_balance_sold_days_and_splitting():
    events = [
        event(start="2024-02-01", end="2024-02-03", sold_days=11),
        event(2, "LEAVE", "2024-02-02", "2024-02-04"),
        event(3, "COLLECTIVE", "2024-02-03", "2024-02-05"),
    ]
    result = calculate(date(2024, 1, 1), events, date(2024, 2, 1))
    assert {
        "INSUFFICIENT_DAYS",
        "SALE_WITHOUT_FULL_PERIOD",
        "SALE_ABOVE_THIRD",
        "SPLITTING",
        "OUTSIDE_CONCESSION",
        "CONFLICT_LEAVE",
        "CONFLICT_COLLECTIVE",
    } <= codes(result)


def test_future_reservation_does_not_hide_overdue_and_concession_end_is_inclusive():
    result = calculate(
        date(2024, 1, 1),
        [event(start="2026-02-01", end="2026-03-02")],
        date(2026, 1, 1),
    )
    assert result["periods"][0]["available_days"] == 0
    assert result["periods"][0]["overdue_days"] == 30
    on_last_day = event(start="2025-12-02", end="2025-12-31")
    assert "OUTSIDE_CONCESSION" not in codes(
        calculate(date(2024, 1, 1), [on_last_day], date(2025, 12, 31))
    )
    outside = event(start="2025-12-03", end="2026-01-01")
    assert "OUTSIDE_CONCESSION" in codes(
        calculate(date(2024, 1, 1), [outside], date(2026, 1, 1))
    )


def setup_headers(test_client):
    assert (
        test_client.post(
            "/api/setup",
            json={
                "company_name": "Empresa principal",
                "backup_directory": "",
                "auto_backup_on_start": False,
                "include_saturdays": False,
                "include_sundays": False,
                "default_daily_hours": 8.8,
                "admin_username": "admin",
                "admin_full_name": "Administrador",
                "admin_password": "SenhaForte123",
            },
        ).status_code
        == 201
    )
    return auth_header(test_client, "admin", "SenhaForte123")


def create_dossier(test_client, headers, name="Pessoa manual"):
    result = test_client.post(
        "/api/vacations/dossiers?company_id=1",
        headers=headers,
        json={"name": name, "reference": "REF-1", "admission_date": "2024-01-01"},
    )
    assert result.status_code == 201, result.text
    return result.json()


def test_manual_crud_warnings_history_revision_and_no_payroll_integration(client):  # noqa: F811
    headers = setup_headers(client)
    dossier = create_dossier(client, headers)
    base = f"/api/vacations/dossiers/{dossier['id']}"
    payload = {
        "kind": "VACATION",
        "start_date": "2024-02-01",
        "end_date": "2024-02-03",
        "sold_days": 11,
        "period_start": "2024-01-01",
        "revision": 1,
    }
    preview = client.post(f"{base}/preview?company_id=1", headers=headers, json=payload)
    assert preview.status_code == 200, preview.text
    assert "INSUFFICIENT_DAYS" in codes(preview.json())
    assert client.get(f"{base}?company_id=1", headers=headers).json()["revision"] == 1
    result = client.post(f"{base}/events?company_id=1", headers=headers, json=payload)
    assert result.status_code == 201, result.text  # warnings never block
    data = result.json()
    assert data["revision"] == 2
    event_id = data["events"][0]["id"]
    assert (
        client.post(
            f"{base}/events?company_id=1", headers=headers, json=payload
        ).status_code
        == 409
    )
    edit = client.put(
        f"{base}/events/{event_id}?company_id=1",
        headers=headers,
        json={**payload, "revision": 2, "sold_days": 0},
    )
    assert edit.status_code == 200
    assert "SALE_ABOVE_THIRD" not in codes(edit.json())
    cancelled = client.delete(
        f"{base}/events/{event_id}?company_id=1&revision=3", headers=headers
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["events"][0]["cancelled_at"]
    assert not cancelled.json()["warnings"]
    history = client.get(f"{base}/history?company_id=1&limit=2", headers=headers).json()
    assert len(history["items"]) == 2
    assert history["items"][0]["before"]["revision"] == 3
    assert history["items"][0]["after"]["revision"] == 4
    previous = client.get(
        f"{base}/history?company_id=1&before_id={history['next_before_id']}",
        headers=headers,
    ).json()
    assert len(previous["items"]) == 2
    assert previous["items"][-1]["before"] is None
    # No hidden creation of employee, employment, movement, payroll or launch rows.
    with next(app.dependency_overrides[get_db]()) as db:
        for table in (
            "employees",
            "employments",
            "movements",
            "launch_batches",
            "payroll_overrides",
        ):
            assert db.scalar(text(f"SELECT count(*) FROM {table}")) == 0
        assert db.scalar(select(VacationHistory.id).limit(1)) is not None


def test_scope_permissions_validation_and_reports(client):  # noqa: F811
    headers = setup_headers(client)
    dossier = create_dossier(client, headers)
    base = f"/api/vacations/dossiers/{dossier['id']}"
    assert client.get(base).status_code == 401
    assert client.get(f"{base}?company_id=999", headers=headers).status_code == 404
    assert (
        client.get("/api/vacations/dossiers?company_id=999", headers=headers).json()[
            "total"
        ]
        == 0
    )
    assert (
        client.post(
            "/api/vacations/dossiers?company_id=0",
            headers=headers,
            json={"name": "A", "admission_date": "2024-01-01"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/users",
            headers=headers,
            json={
                "username": "reader",
                "full_name": "Leitor",
                "password": "SenhaReader123",
                "role": "CONSULTANT",
            },
        ).status_code
        == 201
    )
    reader = auth_header(client, "reader", "SenhaReader123")
    assert client.get(f"{base}?company_id=1", headers=reader).status_code == 200
    assert (
        client.post(
            "/api/vacations/dossiers?company_id=1",
            headers=reader,
            json={"name": "A", "admission_date": "2024-01-01"},
        ).status_code
        == 403
    )
    payload = {
        "kind": "LEAVE",
        "start_date": "2024-04-10",
        "end_date": "2024-04-01",
        "revision": 1,
    }
    assert (
        client.post(
            f"{base}/events?company_id=1", headers=headers, json=payload
        ).status_code
        == 422
    )
    assert client.get(f"{base}?as_of=9999-12-31", headers=headers).status_code == 422
    report = client.get(
        "/api/vacations/reports?company_id=1&as_of=2026-02-01&kind=overdue",
        headers=reader,
    )
    assert report.status_code == 200, report.text
    assert report.json()["total"] == 1
    assert report.json()["items"][0]["Dias vencidos"] == 30
    assert (
        client.get(
            "/api/vacations/reports?company_id=999&kind=overdue", headers=headers
        ).json()["total"]
        == 0
    )
    assert (
        client.get(
            "/api/vacations/dossiers?company_id=1&search=REF&limit=1", headers=headers
        ).json()["total"]
        == 1
    )


def test_admission_edit_preserves_orphaned_launch_and_history(client):  # noqa: F811
    headers = setup_headers(client)
    dossier = create_dossier(client, headers)
    base = f"/api/vacations/dossiers/{dossier['id']}"
    assert (
        client.post(
            f"{base}/events?company_id=1",
            headers=headers,
            json={
                "kind": "VACATION",
                "start_date": "2025-02-01",
                "end_date": "2025-02-20",
                "period_start": "2024-01-01",
                "revision": 1,
            },
        ).status_code
        == 201
    )
    result = client.put(
        f"{base}?company_id=1",
        headers=headers,
        json={
            "name": "Pessoa corrigida",
            "admission_date": "2024-01-02",
            "revision": 2,
        },
    )
    assert result.status_code == 200
    assert "PERIOD_NOT_FOUND" in codes(result.json())
    assert result.json()["events"][0]["period_start"] == "2024-01-01"


def test_additive_migration_preserves_existing_rows_and_matches_models():
    path = (
        Path(__file__).parents[1]
        / "alembic/versions/20261014_0025_consultative_vacations.py"
    )
    spec = importlib.util.spec_from_file_location("vacation_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE companies (id INTEGER PRIMARY KEY, name VARCHAR(180))")
        )
        connection.execute(
            text("INSERT INTO companies VALUES (1, 'Preservar empresa')")
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert (
            connection.execute(text("SELECT name FROM companies WHERE id = 1")).scalar()
            == "Preservar empresa"
        )
        inspector = inspect(connection)
        for model in (VacationDossier, VacationEvent, VacationHistory):
            assert {
                c["name"] for c in inspector.get_columns(model.__tablename__)
            } == set(model.__table__.columns.keys())
        with Session(connection) as db:
            db.add(
                VacationDossier(
                    company_id=1,
                    name="Teste migração",
                    reference="",
                    admission_date=date(2024, 1, 1),
                    notes="",
                )
            )
            db.flush()
            assert db.scalar(select(VacationDossier.revision)) == 1

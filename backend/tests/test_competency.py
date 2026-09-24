from datetime import date
from decimal import Decimal
from types import SimpleNamespace as Record
from test_api_flow import client  # noqa: F401

from app.services.competency import business_days, movement_share, operational_metrics


def test_leave_is_allocated_to_each_month_without_losing_days_or_hours():
    movement = Record(type="afastamento", start_date=date(2026, 8, 25), end_date=date(2026, 9, 5), days=12, hour_impact=Decimal("105.60"))
    assert movement_share(movement, date(2026, 8, 1), date(2026, 8, 31)) == (7, Decimal("61.60"))
    assert movement_share(movement, date(2026, 9, 1), date(2026, 9, 30)) == (5, Decimal("44.00"))


def test_dismissal_excludes_last_day_worked_and_weekend():
    assert business_days(date(2026, 8, 28), date(2026, 8, 31)) == [date(2026, 8, 28), date(2026, 8, 31)]
    movement = Record(type="desligamento", start_date=date(2026, 8, 27), end_date=date(2026, 8, 31), days=2, hour_impact=Decimal("17.60"))
    assert movement_share(movement, date(2026, 8, 1), date(2026, 8, 31)) == (2, Decimal("17.60"))


def test_historical_headcount_ignores_current_status_and_counts_clt_admissions_only():
    existing = Record(id=1, employee_id=1, company_id=1, admission_date=date(2026, 1, 1), termination_date=None, daily_hours=Decimal("8.8"), employment_type=Record(name="CLT"), status="INACTIVE")
    freelancer = Record(id=2, employee_id=2, company_id=1, admission_date=date(2026, 8, 1), termination_date=None, daily_hours=8, employment_type=Record(name="FREELANCER"), status="ACTIVE")
    dismissal = Record(type="desligamento", start_date=date(2026, 8, 27), end_date=date(2026, 8, 31), days=2, hour_impact=Decimal("17.60"), status="Aplicada", employee_id=1, company_id=1)
    metrics = operational_metrics([existing, freelancer], [dismissal], date(2026, 8, 1), date(2026, 8, 31), {})
    assert metrics["initial"] == 1
    assert metrics["final"] == 0
    assert metrics["admissions"] == 0
    assert metrics["terminations"] == 1
    assert metrics["unproductive"] == 17.6
    assert metrics["scheduled"] == 184.8


def test_monthly_routes_preserve_costs_and_split_movements(client):  # noqa: F811
    setup = client.post("/api/setup", json={"company_name": "Competências", "backup_directory": "", "auto_backup_on_start": False,
        "include_saturdays": False, "include_sundays": False, "default_daily_hours": 8.8,
        "admin_username": "admin", "admin_full_name": "Administrador", "admin_password": "SenhaForte123"})
    assert setup.status_code == 201
    login = client.post("/api/auth/login", json={"username": "admin", "password": "SenhaForte123"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    center = client.post("/api/result-centers", headers=headers, json={"code": "ADM", "name": "Administrativo", "active": True}).json()
    clt = client.post("/api/employment-types", headers=headers, json={"name": "CLT", "has_charges": True, "active": True}).json()
    freelancer = client.post("/api/employment-types", headers=headers, json={"name": "FREELANCER", "has_charges": False, "active": True}).json()
    people = []
    for index, cpf in enumerate(["52998224725", "39053344705", "11144477735"]):
        response = client.post("/api/employees", headers=headers, json={"cpf": cpf, "full_name": f"Pessoa {index}", "employee_code": f"ADM-{index}",
            "company_id": 1, "employment_type_id": freelancer["id"] if index == 2 else clt["id"], "result_center_id": center["id"],
            "job_title": "Promotor", "admission_date": "2026-08-01" if index == 2 else "2026-01-01", "salary_base": 3100,
            "pix_key_type": "CPF", "pix_key": cpf, "daily_hours": 8.8})
        assert response.status_code == 201, response.text
        people.append(response.json())
    leave = client.post("/api/demo/movements", headers=headers, json={"employee_id": people[0]["id"], "type": "afastamento", "competency": "2026-08",
        "start_date": "2026-08-25", "end_date": "2026-09-05", "days": 12})
    assert leave.status_code == 201
    for competency, expected_days in [("2026-08", 7), ("2026-09", 5)]:
        rows = client.get(f"/api/demo/movements?competency={competency}", headers=headers).json()
        row = next(row for row in rows if row["id"] == leave.json()["id"])
        assert row["days"] == expected_days
        assert row["total_days"] == 12
    preview = client.post("/api/demo/movement-preview", headers=headers, json={"employee_id": people[1]["id"], "start_date": "2026-08-27", "end_date": "2026-08-31"})
    assert preview.status_code == 200
    assert preview.json()["days"] == 2
    dismissal = client.post("/api/demo/movements", headers=headers, json={"employee_id": people[1]["id"], "type": "desligamento", "competency": "2026-08",
        "start_date": "2026-08-27", "end_date": "2026-08-31", "days": 2, "hour_impact": 99})
    assert dismissal.status_code == 201
    assert dismissal.json()["hour_impact"] == 17.6
    assert client.patch(f"/api/employees/{people[1]['id']}", headers=headers, json={"status": "INACTIVE"}).status_code == 200
    payroll = client.get("/api/demo/payroll?competency=2026-08", headers=headers).json()
    assert any(row["employee_id"] == people[1]["id"] and row["salary"] == 2700 for row in payroll)
    september = client.get("/api/demo/payroll?competency=2026-09", headers=headers).json()
    assert all(row["employee_id"] != people[1]["id"] for row in september)
    dashboard = client.get("/api/dashboard?competency=2026-08", headers=headers).json()["consolidated"]
    assert dashboard["admissions"] == 0
    assert dashboard["terminations"] == 1
    assert round(dashboard["total_cost"], 2) == round(sum(row["total_cost"] for row in payroll), 2)
    filtered_report = client.get("/api/demo/report-preview?competency=2026-08&query=Pessoa%201", headers=headers).json()
    assert filtered_report["summary"]["terminations"] == 1
    assert sum(row["total_cost"] for row in filtered_report["cards"]) == next(row["total_cost"] for row in payroll if row["employee_id"] == people[1]["id"])
    empty_report = client.get("/api/demo/report-preview?competency=2026-08&supervisor=inexistente", headers=headers).json()
    assert sum(row["total_cost"] for row in empty_report["cards"]) == 0
    # Deleting an erroneous dismissal restores computed dates without rewriting the person.
    assert client.request("DELETE", f"/api/demo/movements/{dismissal.json()['id']}", headers=headers, json={"password": "SenhaForte123"}).status_code == 200
    assert any(row["employee_id"] == people[1]["id"] for row in client.get("/api/demo/payroll?competency=2026-09", headers=headers).json())

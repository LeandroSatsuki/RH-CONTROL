from datetime import date

import pytest

from app.api.routes.demo import default_contract_end
from app.core.database import get_db
from app.models.monthly_closing import MonthlyClosing
from test_api_flow import auth_header, client  # noqa: F401


@pytest.fixture
def launch_setup(client):  # noqa: F811
    assert client.post("/api/setup", json={
        "company_name": "Empresa QA", "backup_directory": "", "auto_backup_on_start": False,
        "include_saturdays": False, "include_sundays": False, "default_daily_hours": 8,
        "admin_username": "admin", "admin_full_name": "Admin", "admin_password": "SenhaForte123",
    }).status_code == 201
    headers = auth_header(client, "admin", "SenhaForte123")
    center = client.post("/api/result-centers", headers=headers, json={"code": "QA", "name": "Teste", "active": True}).json()
    modality = client.post("/api/employment-types", headers=headers, json={"name": "MEI", "has_charges": False, "active": True}).json()
    response = client.post("/api/employees", headers=headers, json={
        "cpf": "52998224725", "full_name": "Pessoa teste", "employee_code": "QA-01",
        "company_id": 1, "employment_type_id": modality["id"], "result_center_id": center["id"],
        "job_title": "Promotor", "admission_date": "2025-01-01", "salary_base": 1,
        "benefits": ["Cesta básica"], "pix_key_type": "CPF", "pix_key": "52998224725",
    })
    assert response.status_code == 201, response.text
    person = response.json()["id"]
    contract = client.post("/api/demo/mei-contracts", headers=headers, json={"employee_id": person, "start_date": "2025-01-01"}).json()
    assert contract["end_date"] == "2025-06-30"
    signed = client.patch(f"/api/demo/mei-contracts/{contract['id']}/sign", headers=headers,
                          json={"attachment_name": "qa.pdf", "attachment_data_url": "data:application/pdf;base64,AA=="})
    assert signed.status_code == 200
    batch = client.post("/api/demo/launches", headers=headers, json={"kind": "MEI", "competency": "2025-03"}).json()
    return headers, person, contract["id"], batch


@pytest.mark.parametrize("start,end", [("2026-01-01", "2026-06-30"), ("2026-08-31", "2027-02-27"), ("2023-08-31", "2024-02-28")])
def test_six_calendar_months(start, end):
    assert default_contract_end(date.fromisoformat(start)).isoformat() == end


def test_save_returns_current_values_and_revision(client, launch_setup):  # noqa: F811
    headers, person, _, batch = launch_setup
    path = f"/api/demo/launches/{batch['id']}"
    saved = client.patch(path, headers=headers, json={"updated_at": batch["updated_at"], "items": [{"employment_id": person, "amount": 1250.55}]}).json()
    assert saved["total"] == 1250.55
    assert saved["employees"][0]["amount"] == 1250.55
    assert client.patch(path, headers=headers, json={"updated_at": batch["updated_at"], "items": []}).status_code == 409
    cleared = client.patch(path, headers=headers, json={"updated_at": saved["updated_at"], "items": []}).json()
    assert cleared["total"] == 0 and cleared["employees"][0]["amount"] == 0


def test_correct_confirmed_mei_without_duplication_and_respect_closing(client, launch_setup):  # noqa: F811
    headers, person, _, batch = launch_setup
    path = f"/api/demo/launches/{batch['id']}"
    def save(amount):
        return client.patch(path, headers=headers, json={"items": [{"employment_id": person, "amount": amount}]})
    assert save(1000).status_code == 200
    assert client.post(path + "/confirm", headers=headers).status_code == 200
    for amount in (1200.50, 1200.50, 0, 800):
        corrected = save(amount)
        assert corrected.status_code == 200
        assert corrected.json()["status"] == "CONFIRMED"
        row = client.get("/api/demo/payroll?competency=2025-03", headers=headers).json()[0]
        assert row["salary"] == amount
    logs = client.get("/api/demo/audit-logs?module=Lançamentos", headers=headers).json()
    assert any(item["action"] == "Lançamento MEI corrigido" for item in logs)
    session = next(client.app.dependency_overrides[get_db]())
    session.add(MonthlyClosing(company_id=1, competency="2025-03", status="CLOSED"))
    session.commit()
    assert save(900).status_code == 409


def test_contract_presentation_keeps_financial_history(client, launch_setup):  # noqa: F811
    headers, _, contract_id, batch = launch_setup
    original = next(item for item in client.get("/api/demo/mei-contracts", headers=headers).json() if item["id"] == contract_id)
    assert original["display_status"] == "Finalizado / não renovado"
    renewed = client.post(f"/api/demo/mei-contracts/{contract_id}/renew", headers=headers, json={"start_date": "2025-07-01"}).json()
    assert renewed["end_date"] == "2025-12-31"
    assert client.patch(f"/api/demo/mei-contracts/{renewed['id']}/sign", headers=headers,
                        json={"attachment_name": "qa.pdf", "attachment_data_url": "data:application/pdf;base64,AA=="}).status_code == 200
    original = next(item for item in client.get("/api/demo/mei-contracts", headers=headers).json() if item["id"] == contract_id)
    assert original["display_status"] == "Finalizado"
    assert client.get(f"/api/demo/launches/{batch['id']}", headers=headers).json()["eligible_count"] == 1


def test_manual_payroll_edit_is_not_overwritten_by_batch(client, launch_setup):  # noqa: F811
    headers, person, _, batch = launch_setup
    path = f"/api/demo/launches/{batch['id']}"
    assert client.patch(path, headers=headers, json={"items": [{"employment_id": person, "amount": 1000}]}).status_code == 200
    assert client.post(path + "/confirm", headers=headers).status_code == 200
    assert client.patch(f"/api/demo/payroll/{person}?competency=2025-03", headers=headers, json={"salary": 2000}).status_code == 200
    assert client.patch(path, headers=headers, json={"items": [{"employment_id": person, "amount": 3000}]}).status_code == 409
    assert client.get("/api/demo/payroll?competency=2025-03", headers=headers).json()[0]["salary"] == 2000
    assert client.get(path, headers=headers).json()["total"] == 1000


@pytest.mark.parametrize("amount", ["NaN", "Infinity", -1, "abc"])
def test_invalid_amount_is_rejected_without_destroying_draft(client, launch_setup, amount):  # noqa: F811
    headers, person, _, batch = launch_setup
    path = f"/api/demo/launches/{batch['id']}"
    assert client.patch(path, headers=headers, json={"items": [{"employment_id": person, "amount": amount}]}).status_code == 422
    assert client.get(path, headers=headers).json()["total"] == 0

from collections.abc import Generator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.routes import companies as companies_routes
from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models.enums import UserRole
from app.models.user import User


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def override_db() -> Generator[Session, None, None]:
        with Session(engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def auth_header(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_delete_empty_employee_and_company_with_safety_guards(
    client: TestClient,
) -> None:
    setup = client.post(
        "/api/setup",
        json={
            "company_name": "Empresa Principal",
            "backup_directory": "",
            "auto_backup_on_start": True,
            "include_saturdays": False,
            "include_sundays": False,
            "default_daily_hours": 8.8,
            "admin_username": "admin",
            "admin_full_name": "Administrador",
            "admin_password": "SenhaForte123",
        },
    )
    assert setup.status_code == 201
    admin = auth_header(client, "admin", "SenhaForte123")
    center = client.post(
        "/api/result-centers",
        headers=admin,
        json={"code": "ADM", "name": "Administrativo", "active": True},
    ).json()
    employment_type = client.post(
        "/api/employment-types",
        headers=admin,
        json={"name": "CLT", "has_charges": True, "active": True},
    ).json()

    def employee_payload(cpf: str, code: str, name: str) -> dict[str, object]:
        return {
            "cpf": cpf,
            "full_name": name,
            "employee_code": code,
            "company_id": 1,
            "employment_type_id": employment_type["id"],
            "result_center_id": center["id"],
            "job_title": "Analista",
            "admission_date": "2026-08-01",
            "salary_base": 3000,
            "pix_key_type": "CPF",
            "pix_key": cpf,
        }

    removable = client.post(
        "/api/employees",
        headers=admin,
        json=employee_payload("52998224725", "ADM-001", "Cadastro sem movimento"),
    )
    assert removable.status_code == 201
    removable_id = removable.json()["id"]
    assert client.request(
        "DELETE",
        f"/api/employees/{removable_id}",
        headers=admin,
        json={"password": "senha-errada"},
    ).status_code == 403
    removed = client.request(
        "DELETE",
        f"/api/employees/{removable_id}",
        headers=admin,
        json={"password": "SenhaForte123"},
    )
    assert removed.status_code == 200
    assert removed.json() == {"deleted": True}

    protected = client.post(
        "/api/employees",
        headers=admin,
        json=employee_payload("11144477735", "ADM-002", "Cadastro com movimento"),
    )
    assert protected.status_code == 201
    protected_id = protected.json()["id"]
    assert client.post(
        "/api/demo/movements",
        headers=admin,
        json={
            "competency": "2026-08",
            "employee_id": protected_id,
            "type": "falta",
            "start_date": "2026-08-05",
            "days": 1,
            "observation": "Movimento de proteção",
        },
    ).status_code == 201
    blocked_employee = client.request(
        "DELETE",
        f"/api/employees/{protected_id}",
        headers=admin,
        json={"password": "SenhaForte123"},
    )
    assert blocked_employee.status_code == 409
    assert "movimenta" in blocked_employee.json()["detail"].lower()

    empty_company = client.post(
        "/api/companies",
        headers=admin,
        json={"code": "TEMP", "name": "Empresa temporária"},
    )
    assert empty_company.status_code == 201
    company_id = empty_company.json()["id"]
    assert client.request(
        "DELETE",
        f"/api/companies/{company_id}",
        headers=admin,
        json={"password": "senha-errada"},
    ).status_code == 403
    removed_company = client.request(
        "DELETE",
        f"/api/companies/{company_id}",
        headers=admin,
        json={"password": "SenhaForte123"},
    )
    assert removed_company.status_code == 200
    assert removed_company.json() == {"deleted": True}
    assert client.request(
        "DELETE",
        "/api/companies/1",
        headers=admin,
        json={"password": "SenhaForte123"},
    ).status_code == 409


def test_monthly_launches_resume_confirm_and_feed_payroll(client: TestClient) -> None:
    assert client.post(
        "/api/setup",
        json={
            "company_name": "Empresa Principal",
            "backup_directory": "",
            "auto_backup_on_start": True,
            "include_saturdays": False,
            "include_sundays": False,
            "default_daily_hours": 8.8,
            "admin_username": "admin",
            "admin_full_name": "Administrador",
            "admin_password": "SenhaForte123",
        },
    ).status_code == 201
    admin = auth_header(client, "admin", "SenhaForte123")
    center = client.post(
        "/api/result-centers", headers=admin,
        json={"code": "COM", "name": "Comercial", "active": True},
    ).json()
    mei_type = client.post(
        "/api/employment-types", headers=admin,
        json={"name": "MEI", "has_charges": False, "active": True},
    ).json()
    employee = client.post(
        "/api/employees",
        headers=admin,
        json={
            "cpf": "52998224725",
            "full_name": "Promotor MEI",
            "employee_code": "MEI-001",
            "company_id": 1,
            "employment_type_id": mei_type["id"],
            "result_center_id": center["id"],
            "job_title": "Promotor",
            "admission_date": "2026-08-01",
            "salary_base": 1,
            "supervisor_name": "Supervisora A",
            "benefits": ["Cesta básica"],
            "pix_key_type": "CPF",
            "pix_key": "52998224725",
        },
    )
    assert employee.status_code == 201
    employment_id = employee.json()["id"]

    created = client.post(
        "/api/demo/launches", headers=admin,
        json={"competency": "2026-08", "kind": "MEI"},
    )
    assert created.status_code == 200
    batch = created.json()
    assert batch["status"] == "PENDING"
    assert batch["eligible_count"] == 1
    assert client.patch(
        f"/api/demo/launches/{batch['id']}", headers=admin,
        json={"filters": {}, "items": [{"employment_id": employment_id, "amount": 1800, "note": "NF agosto"}]},
    ).status_code == 200
    resumed = client.get(
        "/api/demo/launches?competency=2026-08", headers=admin
    ).json()[0]
    assert resumed["total"] == 1800
    assert resumed["employees"][0]["note"] == "NF agosto"
    confirmed = client.post(
        f"/api/demo/launches/{batch['id']}/confirm", headers=admin
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "CONFIRMED"
    assert client.post(
        f"/api/demo/launches/{batch['id']}/confirm", headers=admin
    ).status_code == 409
    payroll = client.get(
        "/api/demo/payroll?competency=2026-08", headers=admin
    ).json()[0]
    assert payroll["pro_labore"] == 1800

    basket = client.post(
        "/api/demo/launches", headers=admin,
        json={"competency": "2026-08", "kind": "BASIC_BASKET"},
    ).json()
    assert basket["eligible_count"] == 1
    client.patch(
        f"/api/demo/launches/{basket['id']}", headers=admin,
        json={"filters": {}, "items": [{"employment_id": employment_id, "amount": 250}]},
    )
    assert client.post(
        f"/api/demo/launches/{basket['id']}/confirm", headers=admin
    ).status_code == 200
    payroll = client.get(
        "/api/demo/payroll?competency=2026-08", headers=admin
    ).json()[0]
    assert payroll["basic_basket"] == 250
    assert payroll["grand_total"] > payroll["pro_labore"] + payroll["basic_basket"]

    bonus = client.post(
        "/api/demo/launches", headers=admin,
        json={"competency": "2026-08", "kind": "BONUS"},
    ).json()
    saved_bonus = client.patch(
        f"/api/demo/launches/{bonus['id']}", headers=admin,
        json={
            "filters": {"supervisor": "Supervisora A", "modality": "MEI", "center": "COM"},
            "items": [{"employment_id": employment_id, "amount": 400}],
        },
    )
    assert saved_bonus.status_code == 200
    assert saved_bonus.json()["filters"]["supervisor"] == "Supervisora A"
    assert client.post(
        f"/api/demo/launches/{bonus['id']}/confirm", headers=admin
    ).status_code == 200
    payroll = client.get(
        "/api/demo/payroll?competency=2026-08", headers=admin
    ).json()[0]
    assert payroll["profit_distribution"] == 400

    audit = client.get(
        "/api/demo/audit-logs?module=Lançamentos", headers=admin
    ).json()
    assert len(audit) == 3


def test_initial_flow_permissions_and_duplicate_cpf(client: TestClient) -> None:
    setup = client.post(
        "/api/setup",
        json={
            "company_name": "Empresa Teste",
            "backup_directory": "",
            "auto_backup_on_start": True,
            "include_saturdays": False,
            "include_sundays": False,
            "default_daily_hours": 8.8,
            "admin_username": "admin",
            "admin_full_name": "Administrador",
            "admin_password": "SenhaForte123",
        },
    )
    assert setup.status_code == 201
    admin = auth_header(client, "admin", "SenhaForte123")

    users_list = client.get("/api/users", headers=admin)
    assert users_list.status_code == 200
    created_user = client.post(
        "/api/users",
        headers=admin,
        json={
            "username": "consulta",
            "full_name": "Consulta",
            "password": "SenhaForte123",
            "role": "CONSULTANT",
        },
    )
    assert created_user.status_code == 201
    toggled_user = client.patch(
        f"/api/users/{created_user.json()['id']}", headers=admin, json={"active": False}
    )
    assert toggled_user.status_code == 200
    assert toggled_user.json()["active"] is False

    center = client.post(
        "/api/result-centers",
        headers=admin,
        json={
            "code": "ADM",
            "name": "Administrativo",
            "color": "#2563EB",
            "active": True,
        },
    )
    employment_type = client.post(
        "/api/employment-types",
        headers=admin,
        json={"name": "CLT", "has_charges": True, "active": True},
    )
    mei_type = client.post(
        "/api/employment-types",
        headers=admin,
        json={"name": "MEI", "has_charges": False, "active": True},
    )
    assert (
        center.status_code == employment_type.status_code == mei_type.status_code == 201
    )
    edited_center = client.patch(
        f"/api/result-centers/{center.json()['id']}?company_id=1",
        headers=admin,
        json={"name": "ADMINISTRATIVO GERAL", "active": False},
    )
    assert edited_center.status_code == 200
    assert edited_center.json()["name"] == "ADMINISTRATIVO GERAL"
    assert edited_center.json()["active"] is False
    assert (
        client.patch(
            f"/api/result-centers/{center.json()['id']}?company_id=1",
            headers=admin,
            json={"active": True},
        ).status_code
        == 200
    )

    employee = {
        "cpf": "529.982.247-25",
        "full_name": "Pessoa Teste",
        "employee_code": "0001",
        "company_id": 1,
        "employment_type_id": employment_type.json()["id"],
        "result_center_id": center.json()["id"],
        "job_title": "Analista",
        "department": "RH",
        "admission_date": "2026-06-01",
        "status": "ACTIVE",
        "daily_hours": 8.8,
        "salary_base": 4500,
        "notes": "",
        "email": "pessoa@empresa.com.br",
        "phone": "27999990000",
        "bank_name": "Banco Demo",
        "bank_agency": "0001",
        "bank_account": "12345",
        "bank_account_digit": "0",
        "pix_key_type": "CPF",
        "pix_key": "52998224725",
        "benefits": ["Vale transporte"],
    }
    created = client.post("/api/employees", headers=admin, json=employee)
    assert created.status_code == 201
    created_employee = created.json()
    assert created_employee["email"] == "pessoa@empresa.com.br"
    assert created_employee["phone"] == "27999990000"
    assert Decimal(created_employee["salary_history"][0]["amount"]) == Decimal("4500")
    assert Decimal(
        created_employee["salary_history"][0]["family_allowance"]
    ) == Decimal("0")
    assert created_employee["salary_history"][0]["reason"] == "Cadastro inicial"
    employee["employee_code"] = "0002"
    assert (
        client.post("/api/employees", headers=admin, json=employee).status_code == 409
    )
    missing_pix = {**employee, "employee_code": "0003"}
    missing_pix.pop("pix_key")
    response = client.post("/api/employees", headers=admin, json=missing_pix)
    assert response.status_code == 422

    updated_employee = client.patch(
        f"/api/employees/{created_employee['id']}",
        headers=admin,
        json={
            "full_name": "Pessoa Atualizada",
            "email": "atualizada@empresa.com.br",
            "phone": "27988887777",
            "job_title": "Analista Senior",
        },
    )
    assert updated_employee.status_code == 200
    assert updated_employee.json()["employee"]["full_name"] == "PESSOA ATUALIZADA"
    assert updated_employee.json()["email"] == "atualizada@empresa.com.br"
    assert updated_employee.json()["phone"] == "27988887777"

    salary_change = client.post(
        f"/api/employees/{created_employee['id']}/salary-history",
        headers=admin,
        json={
            "effective_date": "2026-07-01",
            "amount": 4800,
            "family_allowance": 124.08,
            "reason": "Reajuste com salário-família",
        },
    )
    assert salary_change.status_code == 201
    salary_history = sorted(
        salary_change.json()["salary_history"],
        key=lambda item: item["effective_date"],
        reverse=True,
    )
    assert Decimal(salary_history[0]["amount"]) == Decimal("4800")
    assert Decimal(salary_history[0]["family_allowance"]) == Decimal("124.08")
    assert Decimal(salary_history[1]["amount"]) == Decimal("4500")
    assert Decimal(salary_history[1]["family_allowance"]) == Decimal("0")
    duplicate_adjustment = client.post(
        f"/api/employees/{created_employee['id']}/salary-history",
        headers=admin,
        json={
            "effective_date": "2026-07-01",
            "amount": 5000,
            "family_allowance": 124.08,
            "reason": "Tentativa duplicada",
        },
    )
    assert duplicate_adjustment.status_code == 409

    movement = client.post(
        "/api/demo/movements",
        headers=admin,
        json={
            "competency": "2026-06",
            "employee_id": created_employee["id"],
            "type": "falta",
            "start_date": "2026-06-12",
            "days": 1,
            "hour_impact": 8.8,
            "observation": "Falta homologada",
        },
    )
    assert movement.status_code == 201
    movement_id = movement.json()["id"]
    listed_movements = client.get(
        "/api/demo/movements?competency=2026-06", headers=admin
    )
    assert listed_movements.status_code == 200
    assert listed_movements.json()[0]["observation"] == "Falta homologada"
    forbidden_movement_update = client.patch(
        f"/api/demo/movements/{movement_id}",
        headers=admin,
        json={"password": "senha-errada", "status": "Conferida"},
    )
    assert forbidden_movement_update.status_code == 403
    updated_movement = client.patch(
        f"/api/demo/movements/{movement_id}",
        headers=admin,
        json={
            "password": "SenhaForte123",
            "competency": "2026-06",
            "type": "falta",
            "start_date": "2026-06-12",
            "days": 1,
            "hour_impact": 8.8,
            "observation": "Falta conferida",
            "status": "Conferida",
        },
    )
    assert updated_movement.status_code == 200
    assert updated_movement.json()["status"] == "Conferida"
    forbidden_movement_delete = client.request(
        "DELETE",
        f"/api/demo/movements/{movement_id}",
        headers=admin,
        json={"password": "senha-errada"},
    )
    assert forbidden_movement_delete.status_code == 403
    deleted_movement = client.request(
        "DELETE",
        f"/api/demo/movements/{movement_id}",
        headers=admin,
        json={"password": "SenhaForte123"},
    )
    assert deleted_movement.status_code == 200
    assert deleted_movement.json() == {"deleted": True}
    assert (
        client.get("/api/demo/movements?competency=2026-06", headers=admin).json() == []
    )

    vacation = client.post(
        "/api/demo/movements",
        headers=admin,
        json={
            "competency": "2026-06",
            "employee_id": created_employee["id"],
            "type": "férias",
            "start_date": "2026-06-10",
            "end_date": "2026-06-30",
            "days": 3,
            "hour_impact": 1,
            "observation": "Férias com cálculo automático",
        },
    )
    assert vacation.status_code == 201
    assert vacation.json()["end_date"] == "2026-06-12"
    assert Decimal(str(vacation.json()["hour_impact"])) == Decimal("26.4")

    mei_employee_payload = {
        "cpf": "111.444.777-35",
        "full_name": "Pessoa MEI",
        "employee_code": "MEI-001",
        "company_id": 1,
        "employment_type_id": mei_type.json()["id"],
        "result_center_id": center.json()["id"],
        "job_title": "Prestador MEI",
        "department": "",
        "admission_date": "2026-06-01",
        "status": "ACTIVE",
        "daily_hours": 8.8,
        "salary_base": 3000,
        "cost_aid": 0,
        "notes": "",
        "bank_name": "Banco Demo",
        "bank_agency": "0001",
        "bank_account": "54321",
        "bank_account_digit": "1",
        "pix_key_type": "CPF",
        "pix_key": "11144477735",
        "benefits": [],
    }
    mei_employee = client.post(
        "/api/employees", headers=admin, json=mei_employee_payload
    )
    assert mei_employee.status_code == 201
    mei_contract = client.post(
        "/api/demo/mei-contracts",
        headers=admin,
        json={
            "employee_id": mei_employee.json()["id"],
            "start_date": "2026-06-01",
            "end_date": "2026-07-01",
        },
    )
    assert mei_contract.status_code == 201
    assert mei_contract.json()["status"] == "Pendente de assinatura"
    edited_mei_contract = client.patch(
        f"/api/demo/mei-contracts/{mei_contract.json()['id']}",
        headers=admin,
        json={
            "employee_id": mei_employee.json()["id"],
            "start_date": "2026-06-02",
            "end_date": "2026-07-02",
        },
    )
    assert edited_mei_contract.status_code == 200
    assert edited_mei_contract.json()["start_date"] == "2026-06-02"
    mei_movements = client.get("/api/demo/movements?competency=2026-06", headers=admin)
    assert any(item["type"] == "contrato não assinado" for item in mei_movements.json())
    signed_contract = client.patch(
        f"/api/demo/mei-contracts/{mei_contract.json()['id']}/sign",
        headers=admin,
        json={
            "attachment_name": "contrato-mei.pdf",
            "attachment_data_url": "data:application/pdf;base64,JVBERi0=",
        },
    )
    assert signed_contract.status_code == 200
    assert signed_contract.json()["status"] == "Ativo"
    assert signed_contract.json()["attachment_name"] == "contrato-mei.pdf"
    movements_after_sign = client.get(
        "/api/demo/movements?competency=2026-06", headers=admin
    ).json()
    assert any(
        item["type"] == "contrato não assinado" and item["status"] == "Aplicada"
        for item in movements_after_sign
    )
    protected_signed_contract = client.patch(
        f"/api/demo/mei-contracts/{mei_contract.json()['id']}",
        headers=admin,
        json={"end_date": "2026-08-01"},
    )
    assert protected_signed_contract.status_code == 409
    renewed_contract = client.post(
        f"/api/demo/mei-contracts/{mei_contract.json()['id']}/renew",
        headers=admin,
        json={"start_date": "2026-07-03", "end_date": "2027-07-02"},
    )
    assert renewed_contract.status_code == 201
    assert renewed_contract.json()["status"] == "Pendente de assinatura"
    deleted_renewal = client.request(
        "DELETE",
        f"/api/demo/mei-contracts/{renewed_contract.json()['id']}",
        headers=admin,
        json={"password": "SenhaForte123"},
    )
    assert deleted_renewal.status_code == 200
    assert deleted_renewal.json()["deleted"] is True

    unused_center = client.post(
        "/api/result-centers",
        headers=admin,
        json={"code": "TMP", "name": "Temporário", "color": "#64748B", "active": True},
    )
    assert unused_center.status_code == 201
    assert client.delete(
        f"/api/result-centers/{unused_center.json()['id']}?company_id=1",
        headers=admin,
    ).status_code == 204
    assert client.delete(
        f"/api/result-centers/{center.json()['id']}?company_id=1", headers=admin
    ).status_code == 409

    unused_type = client.post(
        "/api/employment-types",
        headers=admin,
        json={"name": "TEMPORÁRIO", "has_charges": False, "active": True},
    )
    assert unused_type.status_code == 201
    assert client.delete(
        f"/api/employment-types/{unused_type.json()['id']}?company_id=1",
        headers=admin,
    ).status_code == 204
    assert client.delete(
        f"/api/employment-types/{mei_type.json()['id']}?company_id=1",
        headers=admin,
    ).status_code == 409

    benefits = client.get("/api/demo/benefits/catalog", headers=admin)
    assert benefits.status_code == 200
    assert {item["code"] for item in benefits.json()} >= {"VT", "AL", "CB", "PS", "SV"}
    distribution = client.post(
        "/api/demo/benefit-distributions",
        headers=admin,
        json={
            "competency": "2026-06",
            "benefit_code": "VT",
            "employee_ids": [created_employee["id"]],
            "description": "Vale transporte teste",
            "source": "Lote",
            "days_worked": 22,
            "value_per_day": 10,
        },
    )
    assert distribution.status_code == 201
    distribution_id = distribution.json()["items"][0]["id"]
    updated_distribution = client.patch(
        f"/api/demo/benefit-distributions/{distribution_id}",
        headers=admin,
        json={"days_worked": 20, "value_per_day": 11, "description": "VT ajustado"},
    )
    assert updated_distribution.status_code == 200
    assert Decimal(str(updated_distribution.json()["amount"])) == Decimal("220.0")
    payroll = client.get("/api/demo/payroll?competency=2026-06", headers=admin)
    assert payroll.status_code == 200
    row = payroll.json()[0]
    assert Decimal(str(row["transport"])) == Decimal("220.0")
    assert Decimal(str(row["subtotal_earnings"])) == Decimal("4800.0")
    assert Decimal(str(row["inss"])) == Decimal("960.0")
    assert Decimal(str(row["gross_payroll"])) == Decimal("5020.0")
    templates = [
        {"id": 1, "name": "Custo mensal", "source": "Custo / Folha", "fields": []}
    ]
    assert (
        client.put(
            "/api/demo/report-templates", headers=admin, json=templates
        ).status_code
        == 200
    )
    assert client.get("/api/demo/report-templates", headers=admin).json() == templates
    revenue = client.patch(
        "/api/demo/indicator-revenue",
        headers=admin,
        json={"scope": "1:2026:ADM", "values": {"Jan": 100000}},
    )
    assert revenue.status_code == 200
    assert (
        client.get("/api/demo/indicator-revenue", headers=admin).json()["1:2026:ADM"][
            "Jan"
        ]
        == 100000
    )
    override = client.patch(
        f"/api/demo/payroll/{created_employee['id']}?competency=2026-06",
        headers=admin,
        json={"salary": 4500, "cost_aid": 125},
    )
    assert override.status_code == 200
    adjusted = client.get("/api/demo/payroll?competency=2026-06", headers=admin).json()
    adjusted_row = next(
        item for item in adjusted if item["employee_id"] == created_employee["id"]
    )
    assert Decimal(str(adjusted_row["cost_aid"])) == Decimal("125.0")
    report_preview = client.get(
        "/api/demo/report-preview?competency=2026-06", headers=admin
    )
    assert report_preview.status_code == 200
    assert report_preview.json()["company"] == "Empresa Teste"
    assert report_preview.json()["cards"][0]["code"] == "ADM"
    assert Decimal(str(report_preview.json()["cards"][0]["total_cost"])) >= Decimal("0")
    assert (
        client.get(
            "/api/demo/cost-allocations?competency=2026-06", headers=admin
        ).json()
        == []
    )
    indicators = client.get("/api/demo/indicators?competency=2026-06", headers=admin)
    assert indicators.status_code == 200
    assert indicators.json()["final_headcount"] == 0
    closing = client.post(
        "/api/demo/closing",
        headers=admin,
        json={"competency": "2026-06", "status": "CLOSED"},
    )
    assert closing.status_code == 200
    assert closing.json()["status"] == "CLOSED"
    locked_distribution = client.patch(
        f"/api/demo/benefit-distributions/{distribution_id}",
        headers=admin,
        json={"days_worked": 21},
    )
    assert locked_distribution.status_code == 409
    alerts = client.get("/api/demo/alerts?company_id=1", headers=admin)
    assert alerts.status_code == 200
    assert any(
        item["type"] == "Contrato próximo do vencimento" for item in alerts.json()
    )
    audit_logs = client.get("/api/demo/audit-logs?company_id=1", headers=admin)
    assert audit_logs.status_code == 200
    assert any(item["module"] == "Benefícios" for item in audit_logs.json())
    movement_audit = client.get(
        "/api/demo/audit-logs?company_id=1&module=Movimenta%C3%A7%C3%B5es&query=movimenta%C3%A7%C3%A3o&limit=100",
        headers=admin,
    )
    assert movement_audit.status_code == 200
    assert {item["action"] for item in movement_audit.json()} >= {
        "Movimentação editada",
        "Movimentação excluída",
    }
    assert all(item["module"] == "Movimentações" for item in movement_audit.json())
    indicators = client.get("/api/demo/indicators?competency=2026-06", headers=admin)
    assert indicators.status_code == 200
    assert indicators.json()["final_headcount"] >= 1
    assert Decimal(str(indicators.json()["total_cost"])) >= Decimal("0")
    indicator_sheets = client.get(
        "/api/demo/indicators/sheets?competency=2026-06", headers=admin
    )
    assert indicator_sheets.status_code == 200
    assert "ADM" in indicator_sheets.json()["sheets"]
    adm_total = next(
        row
        for row in indicator_sheets.json()["sheets"]["ADM"]["costRows"]
        if row["label"] == "Total"
    )
    assert Decimal(str(adm_total["values"][5])) >= Decimal("0")

    for code, name, color in [
        ("IND", "Industrial", "#F59E0B"),
        ("COM", "Comercial", "#10B981"),
        ("DIR", "Diretoria", "#8B5CF6"),
    ]:
        response = client.post(
            "/api/result-centers",
            headers=admin,
            json={"code": code, "name": name, "color": color, "active": True},
        )
        assert response.status_code == 201

    dashboard = client.get("/api/dashboard?month=6&year=2026", headers=admin)
    assert dashboard.status_code == 200
    assert [card["code"] for card in dashboard.json()["cards"]] == [
        "ADM",
        "COM",
        "DIR",
        "IND",
    ]
    assert dashboard.json()["consolidated"]["total_cost"] == 0
    dashboard_by_competency = client.get(
        "/api/dashboard?competency=2026-06", headers=admin
    )
    assert dashboard_by_competency.status_code == 200
    dashboard_default = client.get("/api/dashboard", headers=admin)
    assert dashboard_default.status_code == 200

    company = client.post(
        "/api/companies",
        headers=admin,
        json={
            "code": "BETA-IND",
            "cnpj": "11.222.333/0001-81",
            "name": "Beta Industrial S.A.",
            "trade_name": "Beta",
            "kind": "OUTRA",
            "group_name": "Grupo Beta",
            "parent_company_id": None,
            "active": True,
        },
    )
    assert company.status_code == 201
    company_id = company.json()["id"]
    assert company.json()["is_primary"] is False

    duplicate_company = client.post(
        "/api/companies",
        headers=admin,
        json={
            "code": "BETA-OUT",
            "cnpj": "11.222.333/0001-81",
            "name": "Beta Outra Ltda.",
            "trade_name": "Beta Outra",
            "kind": "OUTRA",
            "group_name": "Grupo Beta",
            "parent_company_id": None,
            "active": True,
        },
    )
    assert duplicate_company.status_code == 409

    invalid_company = client.post(
        "/api/companies",
        headers=admin,
        json={
            "code": "INVALIDA",
            "cnpj": "11.222.333/0001-80",
            "name": "Empresa Inválida Ltda.",
            "kind": "OUTRA",
            "group_name": "Grupo Beta",
            "parent_company_id": None,
            "active": True,
        },
    )
    assert invalid_company.status_code == 422

    updated_company = client.patch(
        f"/api/companies/{company_id}",
        headers=admin,
        json={"name": "Beta Industrial Atualizada S.A.", "active": False},
    )
    assert updated_company.status_code == 200
    assert updated_company.json()["name"] == "Beta Industrial Atualizada S.A."
    assert updated_company.json()["active"] is False
    primary_company = client.patch(
        f"/api/companies/{company_id}",
        headers=admin,
        json={"active": True, "is_primary": True},
    )
    assert primary_company.status_code == 200
    assert primary_company.json()["is_primary"] is True
    inactive_primary = client.patch(
        f"/api/companies/{company_id}",
        headers=admin,
        json={"active": False},
    )
    assert inactive_primary.status_code == 422
    company_list = client.get("/api/companies", headers=admin)
    assert company_list.status_code == 200
    assert company_list.json()[0]["id"] == company_id
    assert sum(1 for item in company_list.json() if item["is_primary"]) == 1

    scoped_center = client.post(
        "/api/result-centers",
        headers=admin,
        json={
            "company_id": company_id,
            "code": "BETA",
            "name": "Beta",
            "color": "#14B8A6",
            "active": True,
        },
    )
    assert scoped_center.status_code == 201
    filtered_centers = client.get(
        f"/api/result-centers?company_id={company_id}", headers=admin
    )
    assert filtered_centers.status_code == 200
    assert [item["code"] for item in filtered_centers.json()] == [
        "ADM",
        "BETA",
        "COM",
        "DIR",
        "IND",
    ]
    primary_centers = client.get(
        "/api/result-centers?company_id=1", headers=admin
    ).json()
    assert any(item["code"] == "BETA" for item in primary_centers)
    scoped_type = next(
        item
        for item in client.get(
            f"/api/employment-types?company_id={company_id}", headers=admin
        ).json()
        if item["name"] == "CLT"
    )
    updated_global_center = client.patch(
        f"/api/result-centers/{scoped_center.json()['id']}?company_id={company_id}",
        headers=admin,
        json={"name": "BETA GLOBAL"},
    )
    assert updated_global_center.status_code == 200
    assert (
        next(
            item
            for item in client.get(
                "/api/result-centers?company_id=1", headers=admin
            ).json()
            if item["code"] == "BETA"
        )["name"]
        == "BETA GLOBAL"
    )
    transferred_employee = client.patch(
        f"/api/employees/{created_employee['id']}?company_id=1",
        headers=admin,
        json={
            "company_id": company_id,
            "result_center_id": scoped_center.json()["id"],
            "employment_type_id": scoped_type["id"],
        },
    )
    assert transferred_employee.status_code == 200
    assert transferred_employee.json()["company_id"] == company_id
    assert transferred_employee.json()["employee_code"].startswith("BETA-")
    assert client.get("/api/employees?company_id=1", headers=admin).status_code == 200
    assert all(
        item["id"] != created_employee["id"]
        for item in client.get("/api/employees?company_id=1", headers=admin).json()
    )
    assert any(
        item["id"] == created_employee["id"]
        for item in client.get(
            f"/api/employees?company_id={company_id}", headers=admin
        ).json()
    )

    with next(app.dependency_overrides[get_db]()) as db:
        db.add(
            User(
                username="consultor",
                full_name="Consultor",
                password_hash=hash_password("SenhaForte123"),
                role=UserRole.CONSULTANT,
            )
        )
        db.commit()
    consultant = auth_header(client, "consultor", "SenhaForte123")
    forbidden = client.post(
        "/api/result-centers",
        headers=consultant,
        json={"code": "FIN", "name": "Financeiro", "color": "#14B8A6", "active": True},
    )
    assert forbidden.status_code == 403


def test_company_lookup_endpoint_uses_brasil_api_payload_shape(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    setup = client.post(
        "/api/setup",
        json={
            "company_name": "Empresa Teste",
            "backup_directory": "",
            "auto_backup_on_start": True,
            "include_saturdays": False,
            "include_sundays": False,
            "default_daily_hours": 8.8,
            "admin_username": "admin",
            "admin_full_name": "Administrador",
            "admin_password": "SenhaForte123",
        },
    )
    assert setup.status_code == 201
    admin = auth_header(client, "admin", "SenhaForte123")

    def fake_request_json(
        url: str, headers: dict[str, str] | None = None
    ) -> dict[str, object]:
        assert "brasilapi.com.br/api/cnpj" in url
        return {
            "razao_social": "Alpha Matriz Ltda.",
            "nome_fantasia": "Alpha",
            "descricao_identificador_matriz_filial": "MATRIZ",
            "descricao_situacao_cadastral": "ATIVA",
            "data_inicio_atividade": "2020-01-15",
            "logradouro": "Rua Central",
            "numero": "100",
            "complemento": "Sala 10",
            "bairro": "Centro",
            "municipio": "São Paulo",
            "uf": "SP",
            "cep": "01000-000",
        }

    monkeypatch.setattr(companies_routes.settings, "cnpj_lookup_bearer_token", "")
    monkeypatch.setattr(companies_routes.settings, "cnpj_lookup_url", "")
    monkeypatch.setattr(companies_routes, "request_json", fake_request_json)
    response = client.get("/api/companies/lookup?cnpj=11222333000181", headers=admin)
    assert response.status_code == 200
    data = response.json()
    assert data["cnpj"] == "11.222.333/0001-81"
    assert data["name"] == "Alpha Matriz Ltda."
    assert data["kind"] == "MATRIZ"
    assert data["source"] == "BrasilAPI"


def test_company_lookup_falls_back_without_blocking_form(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    setup = client.post(
        "/api/setup",
        json={
            "company_name": "Empresa Teste",
            "backup_directory": "",
            "auto_backup_on_start": True,
            "include_saturdays": False,
            "include_sundays": False,
            "default_daily_hours": 8.8,
            "admin_username": "admin",
            "admin_full_name": "Administrador",
            "admin_password": "SenhaForte123",
        },
    )
    assert setup.status_code == 201
    admin = auth_header(client, "admin", "SenhaForte123")

    monkeypatch.setattr(companies_routes.settings, "cnpj_lookup_bearer_token", "")
    monkeypatch.setattr(companies_routes.settings, "cnpj_lookup_url", "")

    def broken_request_json(
        url: str, headers: dict[str, str] | None = None
    ) -> dict[str, object]:
        raise OSError("service down")

    monkeypatch.setattr(companies_routes, "request_json", broken_request_json)
    response = client.get("/api/companies/lookup?cnpj=11222333000181", headers=admin)
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "Consulta de CNPJ indisponível no momento"
    assert data["cnpj"] == "11.222.333/0001-81"
    assert data["name"] == "Empresa sem nome"

    invalid = client.get("/api/companies/lookup?cnpj=11222333000180", headers=admin)
    assert invalid.status_code == 422


def test_database_unavailable_returns_clear_error(client: TestClient) -> None:
    def broken_db() -> Generator[Session, None, None]:
        raise OperationalError("select 1", {}, Exception("connection failed"))
        yield

    app.dependency_overrides[get_db] = broken_db
    response = client.get("/api/setup/status")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Banco de dados indisponível. Solicite ao administrador que verifique "
        "o PostgreSQL no computador principal."
    )


def test_legacy_unprefixed_routes_redirect_to_api(client: TestClient) -> None:
    response = client.get("/setup/status")
    assert response.status_code == 200
    assert response.json() == {"configured": False}

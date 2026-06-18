from collections.abc import Generator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

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
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


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

    center = client.post(
        "/api/result-centers",
        headers=admin,
        json={"code": "ADM", "name": "Administrativo", "color": "#2563EB", "active": True},
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
    assert center.status_code == employment_type.status_code == mei_type.status_code == 201

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
    assert Decimal(created_employee["salary_history"][0]["amount"]) == Decimal("4500")
    assert Decimal(created_employee["salary_history"][0]["family_allowance"]) == Decimal("0")
    assert created_employee["salary_history"][0]["reason"] == "Cadastro inicial"
    employee["employee_code"] = "0002"
    assert client.post("/api/employees", headers=admin, json=employee).status_code == 409
    missing_pix = {**employee, "employee_code": "0003"}
    missing_pix.pop("pix_key")
    response = client.post("/api/employees", headers=admin, json=missing_pix)
    assert response.status_code == 422

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
    listed_movements = client.get("/api/demo/movements?competency=2026-06", headers=admin)
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
        "notes": "",
        "bank_name": "Banco Demo",
        "bank_agency": "0001",
        "bank_account": "54321",
        "bank_account_digit": "1",
        "pix_key_type": "CPF",
        "pix_key": "11144477735",
        "benefits": [],
    }
    mei_employee = client.post("/api/employees", headers=admin, json=mei_employee_payload)
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
    mei_movements = client.get("/api/demo/movements?competency=2026-06", headers=admin)
    assert any(item["type"] == "contrato não assinado" for item in mei_movements.json())
    signed_contract = client.patch(
        f"/api/demo/mei-contracts/{mei_contract.json()['id']}/sign",
        headers=admin,
        json={"attachment_name": "contrato-mei.pdf", "attachment_data_url": "data:application/pdf;base64,JVBERi0="},
    )
    assert signed_contract.status_code == 200
    assert signed_contract.json()["status"] == "Ativo"
    assert signed_contract.json()["attachment_name"] == "contrato-mei.pdf"

    benefits = client.get("/api/demo/benefits/catalog", headers=admin)
    assert benefits.status_code == 200
    assert {item["code"] for item in benefits.json()} >= {"VT", "AL", "PS", "SV"}
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
    payroll = client.get("/api/demo/payroll?competency=2026-06", headers=admin)
    assert payroll.status_code == 200
    row = payroll.json()[0]
    assert Decimal(str(row["transport"])) == Decimal("220.0")
    assert Decimal(str(row["subtotal_earnings"])) == Decimal("5020.0")
    indicators = client.get("/api/demo/indicators?competency=2026-06", headers=admin)
    assert indicators.status_code == 200
    assert indicators.json()["final_headcount"] >= 1
    assert Decimal(str(indicators.json()["total_cost"])) >= Decimal("0")

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
    assert [card["code"] for card in dashboard.json()["cards"]] == ["ADM", "COM", "DIR", "IND"]
    assert dashboard.json()["consolidated"]["total_cost"] == 0
    dashboard_by_competency = client.get("/api/dashboard?competency=2026-06", headers=admin)
    assert dashboard_by_competency.status_code == 200
    dashboard_default = client.get("/api/dashboard", headers=admin)
    assert dashboard_default.status_code == 200

    company = client.post(
        "/api/companies",
        headers=admin,
        json={
            "code": "BETA-IND",
            "name": "Beta Industrial S.A.",
            "kind": "OUTRA",
            "group_name": "Grupo Beta",
            "parent_company_id": None,
            "active": True,
        },
    )
    assert company.status_code == 201
    company_id = company.json()["id"]

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
    filtered_centers = client.get(f"/api/result-centers?company_id={company_id}", headers=admin)
    assert filtered_centers.status_code == 200
    assert [item["code"] for item in filtered_centers.json()] == ["BETA"]

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


def test_database_unavailable_returns_clear_error(client: TestClient) -> None:
    def broken_db() -> Generator[Session, None, None]:
        raise OperationalError("select 1", {}, Exception("connection failed"))
        yield

    app.dependency_overrides[get_db] = broken_db
    response = client.get("/api/setup/status")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Banco de dados indisponível. Rode .\\scripts\\dev-db.ps1 ou configure "
        "o PostgreSQL antes de continuar."
    )

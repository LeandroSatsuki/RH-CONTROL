from collections.abc import Generator

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
    assert center.status_code == employment_type.status_code == 201

    employee = {
        "cpf": "529.982.247-25",
        "full_name": "Pessoa Teste",
        "employee_code": "0001",
        "employment_type_id": employment_type.json()["id"],
        "result_center_id": center.json()["id"],
        "job_title": "Analista",
        "department": "RH",
        "admission_date": "2026-06-01",
        "status": "ACTIVE",
        "daily_hours": 8.8,
        "notes": "",
    }
    assert client.post("/api/employees", headers=admin, json=employee).status_code == 201
    employee["employee_code"] = "0002"
    assert client.post("/api/employees", headers=admin, json=employee).status_code == 409

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

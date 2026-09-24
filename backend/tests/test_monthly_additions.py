from decimal import Decimal

from test_api_flow import auth_header, client  # noqa: F401


def test_freelancer_avulsos_dental_and_global_family_allowance(client):  # noqa: F811
    assert client.post("/api/setup", json={"company_name": "Empresa", "backup_directory": "", "auto_backup_on_start": False,
        "include_saturdays": False, "include_sundays": False, "default_daily_hours": 8.8,
        "admin_username": "admin", "admin_full_name": "Admin", "admin_password": "SenhaForte123"}).status_code == 201
    headers = auth_header(client, "admin", "SenhaForte123")
    center = client.post("/api/result-centers", headers=headers, json={"code": "IND", "name": "Indústria", "active": True}).json()
    modality = client.post("/api/employment-types", headers=headers, json={"name": "FREELANCER", "has_charges": False, "active": True}).json()
    response = client.post("/api/employees", headers=headers, json={"cpf": "52998224725", "full_name": "Pessoa Teste", "employee_code": "IND-1",
        "company_id": 1, "employment_type_id": modality["id"], "result_center_id": center["id"], "job_title": "Promotor",
        "admission_date": "2026-08-01", "salary_base": 1, "pix_key_type": "CPF", "pix_key": "52998224725",
        "benefits": ["Plano odontológico"], "family_allowance_eligible": True})
    assert response.status_code == 201, response.text
    employee_id = response.json()["id"]
    for kind, value in [("FREELANCER", 1500), ("COST_AID", 200), ("LODGING", 300)]:
        batch = client.post("/api/demo/launches", headers=headers, json={"kind": kind, "competency": "2026-08"}).json()
        assert batch["eligible_count"] == 1
        saved = client.patch(f"/api/demo/launches/{batch['id']}", headers=headers, json={"items": [{"employment_id": employee_id, "amount": value}]})
        assert saved.status_code == 200, saved.text
        assert client.post(f"/api/demo/launches/{batch['id']}/confirm", headers=headers).status_code == 200
        assert client.post(f"/api/demo/launches/{batch['id']}/confirm", headers=headers).status_code == 409
    catalog = client.get("/api/demo/benefits/catalog", headers=headers).json()
    assert any(item["code"] == "PO" for item in catalog)
    dental = client.post("/api/demo/benefit-distributions", headers=headers, json={"competency": "2026-08", "benefit_code": "PO", "employee_ids": [employee_id], "monthly_value": 60, "description": "Plano odontológico"})
    assert dental.status_code == 201, dental.text
    payroll = client.get("/api/demo/payroll?competency=2026-08", headers=headers).json()[0]
    assert payroll["salary"] == 1500
    assert payroll["cost_aid"] == 200
    assert payroll["lodging"] == 300
    assert payroll["dental_plan"] == 60
    assert payroll["charges"] == payroll["total_provisions"] == 0
    assert payroll["grand_total"] == 2060
    for effective, amount in [("2026-01-01", 50), ("2026-09-01", 70)]:
        result = client.post("/api/demo/settings?company_id=0", headers=headers, json={"family_allowance_rates": [{"effective_date": effective, "amount": amount}]})
        assert result.status_code == 200, result.text
    for reference, expected in [("2026-08-31", 50), ("2026-09-30", 70)]:
        item = client.get(f"/api/employees?reference_date={reference}", headers=headers).json()[0]
        assert item["family_allowance_eligible"]
        assert Decimal(item["family_allowance_amount"]) == expected
    assert client.post("/api/demo/settings", headers=headers, json={"family_allowance_rates": [{"effective_date": "2026-01-01", "amount": 99}]}).status_code == 409
    assert client.get("/api/demo/payroll?competency=2026-08", headers=headers).json()[0]["grand_total"] == 2060
    revenue = client.patch("/api/demo/indicator-revenue", headers=headers, json={"scope": "1:2026:IND", "values": {"Ago": 10000, "Ago:kg": 500, "Ago:meta": 0.07}})
    assert revenue.status_code == 200
    assert client.get("/api/demo/indicator-revenue", headers=headers).json()["1:2026:IND"]["Ago:kg"] == 500
    # Logical CR codes consolidate physical rows from every closed company.
    company = client.post("/api/companies", headers=headers, json={"code": "BETA", "name": "Empresa Beta", "kind": "OUTRA", "group_name": "Grupo", "active": True}).json()
    company_id = company["id"]
    global_rates = client.get(f"/api/demo/settings?company_id={company_id}", headers=headers).json()["family_allowance_rates"]
    assert len(global_rates) == 2
    other_center = next(item for item in client.get(f"/api/result-centers?company_id={company_id}", headers=headers).json() if item["code"] == "IND")
    other_type = next(item for item in client.get(f"/api/employment-types?company_id={company_id}", headers=headers).json() if item["name"] == "FREELANCER")
    other = client.post(f"/api/employees?company_id={company_id}", headers=headers, json={"cpf": "39053344705", "full_name": "Outra Pessoa", "employee_code": "IND-2", "company_id": company_id,
        "employment_type_id": other_type["id"], "result_center_id": other_center["id"], "job_title": "Promotor", "admission_date": "2026-08-01", "salary_base": 1, "pix_key_type": "CPF", "pix_key": "39053344705"})
    assert other.status_code == 201, other.text
    assert client.patch(f"/api/demo/payroll/{other.json()['id']}?company_id={company_id}&competency=2026-08", headers=headers, json={"salary": 900}).status_code == 200
    for company_scope in [1, company_id]:
        assert client.post(f"/api/demo/closing?company_id={company_scope}", headers=headers, json={"competency": "2026-08", "status": "CLOSED"}).status_code == 200
    sheets_response = client.get("/api/demo/indicators/sheets?company_id=0&competency=2026-08", headers=headers)
    assert sheets_response.status_code == 200, sheets_response.text
    sheets = sheets_response.json()
    assert len([item for item in sheets["centers"] if item["code"] == "IND"]) == 1
    total_row = next(row for row in sheets["sheets"]["IND"]["costRows"] if row["label"] == "Total")
    assert total_row["values"][7] == 2960

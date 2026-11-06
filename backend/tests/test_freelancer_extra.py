from decimal import Decimal

import pytest

from app.core.database import get_db
from app.models.monthly_closing import MonthlyClosing
from test_api_flow import client  # noqa: F401
from test_launch_adjustments import launch_setup  # noqa: F401


def post_extra(api_client, headers, person, amount=500.55):
    response = api_client.post("/api/demo/launches", headers=headers,
                           json={"kind": "FREELANCER", "competency": "2025-03"})
    assert response.status_code == 200, response.text
    batch = response.json()
    assert person in [item["employment_id"] for item in batch["employees"]]
    path = f"/api/demo/launches/{batch['id']}"
    saved = api_client.patch(path, headers=headers, json={"items": [{"employment_id": person, "amount": amount}]})
    assert saved.status_code == 200, saved.text
    assert api_client.post(path + "/confirm", headers=headers).status_code == 200
    assert api_client.post(path + "/confirm", headers=headers).status_code == 409
    return path


@pytest.mark.parametrize("effective_date", ["2025-02-01", "2025-03-16"])
def test_clt_extra_preserves_salary_charges_and_all_analysis_totals(client, launch_setup, effective_date):  # noqa: F811
    headers, original_id, _, _ = launch_setup
    original = next(item for item in client.get("/api/employees", headers=headers).json() if item["id"] == original_id)
    clt = client.post("/api/employment-types", headers=headers, json={"name": "CLT", "has_charges": True, "active": True}).json()
    transitioned = client.post(f"/api/employees/{original_id}/transition", headers=headers, json={
        "effective_date": effective_date, "employment_type_id": clt["id"],
        "result_center_id": original["result_center"]["id"], "job_title": "Promotor", "salary_base": 3000,
    })
    assert transitioned.status_code == 201, transitioned.text
    person = transitioned.json()["id"]
    def rows():
        return client.get("/api/demo/payroll?competency=2025-03", headers=headers).json()
    before_rows = rows()
    before = next(row for row in before_rows if row["employee_id"] == person)
    path = post_extra(client, headers, person)
    for amount in (800, 0, 500.55):
        response = client.patch(path, headers=headers, json={"items": [{"employment_id": person, "amount": amount}]})
        assert response.status_code == 200, response.text
        corrected = next(row for row in rows() if row["employee_id"] == person)
        assert Decimal(str(corrected["salary"])) == Decimal(str(before["salary"])) + Decimal(str(amount))
        assert corrected["charges"] == before["charges"]
        assert corrected["total_provisions"] == before["total_provisions"]
    after_rows = rows()
    after = next(row for row in after_rows if row["employee_id"] == person)
    assert Decimal(str(after["salary"])) == Decimal(str(before["salary"])) + Decimal("500.55")
    assert after["freelancer_extra"] == 500.55  # Never prorate an entered extra.
    for field in ("inss", "rat", "terceiros", "fgts", "charges", "vacation", "total_provisions"):
        assert after[field] == before[field], field
    assert Decimal(str(after["grand_total"])) == Decimal(str(before["grand_total"])) + Decimal("500.55")
    directory = client.get("/api/employees", headers=headers).json()
    assert Decimal(next(item for item in directory if item["id"] == person)["salary_base"]) == 3000
    expected_total = round(sum(row["total_cost"] for row in after_rows), 2)
    dashboard = client.get("/api/dashboard?competency=2025-03", headers=headers).json()
    assert round(dashboard["consolidated"]["total_cost"], 2) == expected_total
    report = client.get("/api/demo/report-preview?competency=2025-03", headers=headers).json()
    assert round(report["summary"]["total_cost"], 2) == expected_total
    # Editing the inclusive displayed value must not add the extra a second time.
    for _ in range(2):
        assert client.patch(f"/api/demo/payroll/{person}?competency=2025-03", headers=headers,
                            json={"salary": after["salary"], "freelancer_extra": 500.55}).status_code == 200
        current = next(row for row in rows() if row["employee_id"] == person)
        assert current["grand_total"] == after["grand_total"]
        assert current["freelancer_extra"] == 500.55
    assert client.patch(f"/api/demo/payroll/{person}?competency=2025-03", headers=headers, json={"salary": 1}).status_code == 422
    assert client.patch(f"/api/demo/payroll/{person}?competency=2025-03", headers=headers, json={"salary": before["salary"], "freelancer_extra": 0}).status_code == 409
    generator = client.app.dependency_overrides[get_db]()
    session = next(generator)
    try:
        session.add(MonthlyClosing(company_id=1, competency="2025-03", status="CLOSED"))
        session.commit()
    finally:
        generator.close()
    sheets = client.get("/api/demo/indicators/sheets?competency=2025-03", headers=headers).json()
    total_row = next(row for row in sheets["sheets"]["QA"]["costRows"] if row["label"] == "Total")
    assert round(total_row["values"][2], 2) == expected_total


def test_extra_coexists_with_confirmed_mei_corrections(client, launch_setup):  # noqa: F811
    headers, person, _, mei = launch_setup
    path = f"/api/demo/launches/{mei['id']}"
    assert client.patch(path, headers=headers, json={"items": [{"employment_id": person, "amount": 1000}]}).status_code == 200
    assert client.post(path + "/confirm", headers=headers).status_code == 200
    post_extra(client, headers, person, 250)
    assert client.patch(path, headers=headers, json={"items": [{"employment_id": person, "amount": 1200}]}).status_code == 200
    row = client.get("/api/demo/payroll?competency=2025-03", headers=headers).json()[0]
    assert row["salary"] == row["grand_total"] == 1450
    assert row["freelancer_extra"] == 250
    assert row["charges"] == row["total_provisions"] == 0
    # A PATCH to a different field must preserve both components.
    assert client.patch(f"/api/demo/payroll/{person}?competency=2025-03", headers=headers, json={"lodging": 50}).status_code == 200
    updated = client.get("/api/demo/payroll?competency=2025-03", headers=headers).json()[0]
    assert updated["salary"] == 1450 and updated["grand_total"] == 1500


def test_legacy_salary_override_is_not_reinterpreted_or_duplicated(client, launch_setup):  # noqa: F811
    headers, person, _, _ = launch_setup
    assert client.patch(f"/api/demo/payroll/{person}?competency=2025-03", headers=headers, json={"salary": 900}).status_code == 200
    for _ in range(2):
        row = client.get("/api/demo/payroll?competency=2025-03", headers=headers).json()[0]
        assert row["salary"] == row["grand_total"] == 900
        assert row["freelancer_extra"] == 0

from pydantic import BaseModel

from app.models.enums import CompanyKind


class DashboardCompany(BaseModel):
    id: int
    code: str
    name: str
    kind: CompanyKind
    group_name: str


class DashboardCard(BaseModel):
    id: int
    code: str
    name: str
    color: str
    active_employees: int
    by_employment_type: dict[str, int]
    admissions: int
    terminations: int
    absenteeism: float
    turnover: float
    gross_payroll: float
    net_payroll: float
    total_cost: float
    previous_active_employees: int


class DashboardConsolidated(BaseModel):
    active_employees: int
    admissions: int
    terminations: int
    gross_payroll: float
    net_payroll: float
    total_cost: float
    absenteeism: float
    turnover: float


class DashboardResponse(BaseModel):
    company: DashboardCompany | None = None
    month: int
    year: int
    cards: list[DashboardCard]
    consolidated: DashboardConsolidated

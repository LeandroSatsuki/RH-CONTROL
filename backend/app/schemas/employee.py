import re
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import EmploymentStatus
from app.schemas.catalog import EmploymentTypeRead, ResultCenterRead


def normalize_cpf(value: str) -> str:
    return re.sub(r"\D", "", value)


def is_valid_cpf(value: str) -> bool:
    cpf = normalize_cpf(value)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for size in (9, 10):
        total = sum(int(cpf[index]) * (size + 1 - index) for index in range(size))
        digit = (total * 10) % 11
        if digit == 10:
            digit = 0
        if digit != int(cpf[size]):
            return False
    return True


class EmployeeCreate(BaseModel):
    cpf: str
    full_name: str = Field(min_length=3, max_length=180)
    employee_code: str = Field(min_length=1, max_length=40)
    employment_type_id: int
    result_center_id: int
    job_title: str = Field(min_length=2, max_length=120)
    department: str = Field(default="", max_length=120)
    admission_date: date
    termination_date: date | None = None
    status: EmploymentStatus = EmploymentStatus.ACTIVE
    daily_hours: Decimal = Field(default=Decimal("8.80"), gt=0, le=24)
    notes: str = ""

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, value: str) -> str:
        normalized = normalize_cpf(value)
        if not is_valid_cpf(normalized):
            raise ValueError("CPF inválido")
        return normalized

    @field_validator("employee_code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()


class EmployeePersonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cpf: str
    full_name: str


class EmploymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_code: str
    job_title: str
    department: str
    admission_date: date
    termination_date: date | None
    status: EmploymentStatus
    daily_hours: Decimal
    notes: str
    employee: EmployeePersonRead
    employment_type: EmploymentTypeRead
    result_center: ResultCenterRead


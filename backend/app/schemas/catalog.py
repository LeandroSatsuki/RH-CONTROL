import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import CompanyKind


class ResultCenterBase(BaseModel):
    company_id: int = 1
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=120)
    color: str = "#2563EB"
    active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            raise ValueError("Cor deve estar no formato hexadecimal #RRGGBB")
        return value.upper()


class ResultCenterCreate(ResultCenterBase):
    pass


class ResultCenterRead(ResultCenterBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class EmploymentTypeBase(BaseModel):
    company_id: int = 1
    name: str = Field(min_length=2, max_length=80)
    has_charges: bool = False
    active: bool = True


class EmploymentTypeCreate(EmploymentTypeBase):
    pass


class EmploymentTypeRead(EmploymentTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CompanyBase(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=180)
    kind: CompanyKind = CompanyKind.OUTRA
    group_name: str = ""
    parent_company_id: int | None = None
    active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()


class CompanyCreate(CompanyBase):
    pass


class CompanyRead(CompanyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CompanyListRead(CompanyRead):
    pass

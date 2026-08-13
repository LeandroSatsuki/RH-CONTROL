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


class ResultCenterUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=20)
    name: str | None = Field(default=None, min_length=2, max_length=120)
    color: str | None = None
    active: bool | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else value

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            raise ValueError("Cor deve estar no formato hexadecimal #RRGGBB")
        return value.upper() if value is not None else value


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


class EmploymentTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    has_charges: bool | None = None
    active: bool | None = None


class EmploymentTypeRead(EmploymentTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CompanyBase(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    cnpj: str | None = None
    name: str = Field(min_length=2, max_length=180)
    trade_name: str = ""
    kind: CompanyKind = CompanyKind.OUTRA
    group_name: str = ""
    parent_company_id: int | None = None
    active: bool = True
    is_primary: bool = False
    registration_status: str = ""
    opening_date: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("cnpj")
    @classmethod
    def normalize_cnpj(cls, value: str | None) -> str | None:
        if value is None:
            return None
        digits = re.sub(r"\D", "", value)
        if not digits:
            return None
        if not is_valid_cnpj(digits):
            raise ValueError("CNPJ inválido")
        return digits


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=20)
    cnpj: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=180)
    trade_name: str | None = None
    kind: CompanyKind | None = None
    group_name: str | None = None
    parent_company_id: int | None = None
    active: bool | None = None
    is_primary: bool | None = None
    registration_status: str | None = None
    opening_date: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else value

    @field_validator("cnpj")
    @classmethod
    def normalize_cnpj(cls, value: str | None) -> str | None:
        if value is None:
            return None
        digits = re.sub(r"\D", "", value)
        if not digits:
            return None
        if not is_valid_cnpj(digits):
            raise ValueError("CNPJ inválido")
        return digits


class CompanyRead(CompanyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CompanyListRead(CompanyRead):
    pass


class CompanyLookupRead(BaseModel):
    cnpj: str
    code: str
    name: str
    trade_name: str = ""
    kind: CompanyKind = CompanyKind.OUTRA
    group_name: str = ""
    parent_company_id: int | None = None
    active: bool = True
    status: str = ""
    opening_date: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    source: str = ""


def is_valid_cnpj(value: str) -> bool:
    cnpj = re.sub(r"\D", "", value)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False
    checks = (
        (12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
        (13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
    )
    for size, weights in checks:
        total = sum(int(cnpj[index]) * weights[index] for index in range(size))
        digit = 0 if total % 11 < 2 else 11 - total % 11
        if digit != int(cnpj[size]):
            return False
    return True

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    CONSULTANT = "CONSULTANT"


class EmploymentStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ON_LEAVE = "ON_LEAVE"


class CompanyKind(StrEnum):
    MATRIZ = "MATRIZ"
    FILIAL = "FILIAL"
    OUTRA = "OUTRA"


class PixKeyType(StrEnum):
    CPF = "CPF"
    CNPJ = "CNPJ"
    EMAIL = "EMAIL"
    PHONE = "PHONE"
    RANDOM = "RANDOM"

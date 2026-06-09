from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    CONSULTANT = "CONSULTANT"


class EmploymentStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ON_LEAVE = "ON_LEAVE"


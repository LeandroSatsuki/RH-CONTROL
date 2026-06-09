from decimal import Decimal

from pydantic import BaseModel, Field


class SetupStatus(BaseModel):
    configured: bool


class InitialSetup(BaseModel):
    company_name: str = Field(min_length=2, max_length=180)
    backup_directory: str = ""
    auto_backup_on_start: bool = True
    include_saturdays: bool = False
    include_sundays: bool = False
    default_daily_hours: Decimal = Field(default=Decimal("8.80"), gt=0, le=24)
    admin_username: str = Field(min_length=3, max_length=80)
    admin_full_name: str = Field(min_length=2, max_length=160)
    admin_password: str = Field(min_length=8, max_length=128)


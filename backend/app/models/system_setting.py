from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), unique=True)
    company_name: Mapped[str] = mapped_column(String(180))
    company_logo: Mapped[str] = mapped_column(String(4000), default="")
    backup_directory: Mapped[str] = mapped_column(String(500), default="")
    auto_backup_on_start: Mapped[bool] = mapped_column(Boolean, default=True)
    include_saturdays: Mapped[bool] = mapped_column(Boolean, default=False)
    include_sundays: Mapped[bool] = mapped_column(Boolean, default=False)
    default_daily_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("8.80"))
    configured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="settings")

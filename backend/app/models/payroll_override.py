from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PayrollOverride(Base):
    __tablename__ = "payroll_overrides"
    __table_args__ = (UniqueConstraint("company_id", "competency", "employment_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    competency: Mapped[str] = mapped_column(String(7), index=True)
    employment_id: Mapped[int] = mapped_column(ForeignKey("employments.id"), index=True)
    values: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    updated_by: Mapped[str] = mapped_column(String(120))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

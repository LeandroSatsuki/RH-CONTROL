from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BenefitDefinition(Base):
    __tablename__ = "benefit_definitions"
    __table_args__ = (UniqueConstraint("company_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    code: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(120))
    mode: Mapped[str] = mapped_column(String(20), default="DAILY")
    active: Mapped[bool] = mapped_column(default=True)
    applies_to: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    notes: Mapped[str] = mapped_column(String(500), default="", nullable=False)

    company = relationship("Company", back_populates="benefit_definitions")


class BenefitDistribution(Base):
    __tablename__ = "benefit_distributions"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    competency: Mapped[str] = mapped_column(String(7), index=True)
    benefit_code: Mapped[str] = mapped_column(String(20), index=True)
    benefit_name: Mapped[str] = mapped_column(String(120))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employments.id"))
    days_worked: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    value_per_day: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    monthly_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    dependents_count: Mapped[int] = mapped_column(default=0)
    dependent_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    source: Mapped[str] = mapped_column(String(30), default="Lote")
    description: Mapped[str] = mapped_column(String(240), default="", nullable=False)
    created_by: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="benefit_distributions")
    employment = relationship("Employment")

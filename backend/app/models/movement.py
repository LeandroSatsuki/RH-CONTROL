from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Movement(Base):
    __tablename__ = "movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    competency: Mapped[str] = mapped_column(String(7), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employments.id"))
    type: Mapped[str] = mapped_column(String(80), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    days: Mapped[int] = mapped_column(default=1)
    hour_impact: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    observation: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="Pendente", nullable=False)

    company = relationship("Company")
    employment = relationship("Employment")

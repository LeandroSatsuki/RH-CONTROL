from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MeiContract(Base):
    __tablename__ = "mei_contracts"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employments.id"))
    status: Mapped[str] = mapped_column(String(40), default="Pendente de assinatura", nullable=False)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    attachment_name: Mapped[str | None] = mapped_column(String(240), nullable=True)
    attachment_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notified_not_signed: Mapped[bool] = mapped_column(default=False)
    notified_15: Mapped[bool] = mapped_column(default=False)
    notified_10: Mapped[bool] = mapped_column(default=False)
    notified_5: Mapped[bool] = mapped_column(default=False)
    movement_created_5: Mapped[bool] = mapped_column(default=False)

    company = relationship("Company")
    employment = relationship("Employment")

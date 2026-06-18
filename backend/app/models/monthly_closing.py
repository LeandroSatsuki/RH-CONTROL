from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MonthlyClosing(Base):
    __tablename__ = "monthly_closings"
    __table_args__ = (UniqueConstraint("company_id", "competency"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    competency: Mapped[str] = mapped_column(String(7), index=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False)
    justification: Mapped[str] = mapped_column(Text, default="", nullable=False)
    closed_by: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company")

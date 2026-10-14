"""Independent manual records. Never write employment, movement or payroll data."""

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VacationDossier(Base):
    __tablename__ = "vacation_dossiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    reference: Mapped[str] = mapped_column(String(80), default="")
    admission_date: Mapped[date] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(Text, default="")
    revision: Mapped[int] = mapped_column(Integer, default=1)


class VacationEvent(Base):
    __tablename__ = "vacation_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    dossier_id: Mapped[int] = mapped_column(
        ForeignKey("vacation_dossiers.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    leave_type: Mapped[str] = mapped_column(String(120), default="")
    effect: Mapped[str] = mapped_column(String(20), default="NONE")
    sold_days: Mapped[int] = mapped_column(Integer, default=0)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class VacationHistory(Base):
    __tablename__ = "vacation_history"
    __table_args__ = (Index("ix_vacation_history_dossier_id_id", "dossier_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    dossier_id: Mapped[int] = mapped_column(ForeignKey("vacation_dossiers.id"))
    action: Mapped[str] = mapped_column(String(80))
    performed_by: Mapped[str] = mapped_column(String(180))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Immutable snapshots include inputs, recalculated periods and warnings.
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict] = mapped_column(JSON)

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AuditEntry(Base):
    __tablename__ = "audit_entries"
    __table_args__ = (
        Index(
            "ix_audit_entries_company_module_created",
            "company_id",
            "module",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    module: Mapped[str] = mapped_column(String(80), index=True)
    action: Mapped[str] = mapped_column(String(120))
    employee_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    result_center: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    performed_by: Mapped[str] = mapped_column(String(180))
    performed_role: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    details: Mapped[str] = mapped_column(Text, default="", nullable=False)

    company = relationship("Company")

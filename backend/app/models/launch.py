from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, JSON, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LaunchBatch(Base):
    __tablename__ = "launch_batches"
    __table_args__ = (UniqueConstraint("company_id", "competency", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    competency: Mapped[str] = mapped_column(String(7), index=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    filters: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items = relationship("LaunchItem", back_populates="batch", cascade="all, delete-orphan")


class LaunchItem(Base):
    __tablename__ = "launch_items"
    __table_args__ = (UniqueConstraint("batch_id", "employment_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("launch_batches.id"), index=True)
    employment_id: Mapped[int] = mapped_column(ForeignKey("employments.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    note: Mapped[str] = mapped_column(String(240), default="", nullable=False)

    batch = relationship("LaunchBatch", back_populates="items")
    employment = relationship("Employment")

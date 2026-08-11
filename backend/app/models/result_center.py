from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ResultCenter(Base):
    __tablename__ = "result_centers"
    __table_args__ = (UniqueConstraint("company_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # Kept only for compatibility with databases created before global catalogs.
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    code: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(7), default="#2563EB")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    company = relationship("Company", back_populates="result_centers")
    employments = relationship("Employment", back_populates="result_center")

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ResultCenter(Base):
    __tablename__ = "result_centers"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(7), default="#2563EB")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    employments = relationship("Employment", back_populates="result_center")


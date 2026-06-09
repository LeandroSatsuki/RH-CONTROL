from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import EmploymentStatus


class Employee(Base):
    """Pessoa física. Vínculos futuros preservam a mesma pessoa e o histórico."""

    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    cpf: Mapped[str] = mapped_column(String(11), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(180), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employments = relationship("Employment", back_populates="employee", cascade="all, delete-orphan")


class Employment(Base):
    __tablename__ = "employments"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    employee_code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    employment_type_id: Mapped[int] = mapped_column(ForeignKey("employment_types.id"))
    result_center_id: Mapped[int] = mapped_column(ForeignKey("result_centers.id"))
    job_title: Mapped[str] = mapped_column(String(120))
    department: Mapped[str] = mapped_column(String(120), default="")
    admission_date: Mapped[date] = mapped_column(Date)
    termination_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[EmploymentStatus] = mapped_column(
        Enum(EmploymentStatus), default=EmploymentStatus.ACTIVE
    )
    daily_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("8.80"))
    notes: Mapped[str] = mapped_column(Text, default="")

    employee = relationship("Employee", back_populates="employments")
    employment_type = relationship("EmploymentType", back_populates="employments")
    result_center = relationship("ResultCenter", back_populates="employments")
    salary_history = relationship(
        "SalaryHistory", back_populates="employment", cascade="all, delete-orphan"
    )


class SalaryHistory(Base):
    __tablename__ = "salary_history"
    __table_args__ = (UniqueConstraint("employment_id", "effective_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employment_id: Mapped[int] = mapped_column(ForeignKey("employments.id"))
    effective_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))

    employment = relationship("Employment", back_populates="salary_history")


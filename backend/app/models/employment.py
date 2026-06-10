from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import EmploymentStatus, PixKeyType


class Employee(Base):
    """Pessoa física. Vínculos futuros preservam a mesma pessoa e o histórico."""

    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    cpf: Mapped[str] = mapped_column(String(11), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(180), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="employees")
    employments = relationship("Employment", back_populates="employee", cascade="all, delete-orphan")


class Employment(Base):
    __tablename__ = "employments"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
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
    daily_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("8.80"), nullable=False)
    salary_base: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    bank_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    bank_agency: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    bank_account: Mapped[str] = mapped_column(String(30), default="", nullable=False)
    bank_account_digit: Mapped[str] = mapped_column(String(5), default="", nullable=False)
    pix_key_type: Mapped[PixKeyType] = mapped_column(Enum(PixKeyType), default=PixKeyType.CPF, nullable=False)
    pix_key: Mapped[str] = mapped_column(String(120), default="", nullable=False)

    company = relationship("Company", back_populates="employments")
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
    family_allowance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(180), default="", nullable=False)

    employment = relationship("Employment", back_populates="salary_history")

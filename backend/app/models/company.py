from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import CompanyKind


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    cnpj: Mapped[str | None] = mapped_column(String(14), unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(180))
    trade_name: Mapped[str] = mapped_column(String(180), default="")
    kind: Mapped[CompanyKind] = mapped_column(Enum(CompanyKind), default=CompanyKind.OUTRA)
    group_name: Mapped[str] = mapped_column(String(180), default="")
    parent_company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    registration_status: Mapped[str] = mapped_column(String(80), default="")
    opening_date: Mapped[str] = mapped_column(String(20), default="")
    address: Mapped[str] = mapped_column(String(240), default="")
    city: Mapped[str] = mapped_column(String(120), default="")
    state: Mapped[str] = mapped_column(String(2), default="")
    zip_code: Mapped[str] = mapped_column(String(12), default="")

    parent_company = relationship("Company", remote_side=[id], back_populates="child_companies")
    child_companies = relationship("Company", back_populates="parent_company")
    settings = relationship("SystemSetting", back_populates="company", cascade="all, delete-orphan")
    result_centers = relationship("ResultCenter", back_populates="company", cascade="all, delete-orphan")
    employment_types = relationship("EmploymentType", back_populates="company", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="company", cascade="all, delete-orphan")
    employments = relationship("Employment", back_populates="company", cascade="all, delete-orphan")
    benefit_definitions = relationship("BenefitDefinition", back_populates="company", cascade="all, delete-orphan")
    benefit_distributions = relationship("BenefitDistribution", back_populates="company", cascade="all, delete-orphan")

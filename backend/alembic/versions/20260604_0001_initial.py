"""Initial relational model.

Revision ID: 20260604_0001
Revises:
Create Date: 2026-06-04
"""
from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260604_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

user_role = postgresql.ENUM("ADMIN", "CONSULTANT", name="userrole", create_type=False)
employment_status = postgresql.ENUM(
    "ACTIVE", "INACTIVE", "ON_LEAVE", name="employmentstatus", create_type=False
)
company_kind = postgresql.ENUM("MATRIZ", "FILIAL", "OUTRA", name="companykind", create_type=False)


def upgrade() -> None:
    user_role.create(op.get_bind(), checkfirst=True)
    employment_status.create(op.get_bind(), checkfirst=True)
    company_kind.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("kind", company_kind, nullable=False),
        sa.Column("group_name", sa.String(180), nullable=False),
        sa.Column("parent_company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_companies_code", "companies", ["code"], unique=True)
    op.create_table(
        "employment_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("has_charges", sa.Boolean(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("company_id", "name"),
    )
    op.create_index("ix_employment_types_name", "employment_types", ["name"], unique=False)
    op.create_table(
        "result_centers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("company_id", "code"),
    )
    op.create_index("ix_result_centers_code", "result_centers", ["code"], unique=False)
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("company_name", sa.String(180), nullable=False),
        sa.Column("backup_directory", sa.String(500), nullable=False),
        sa.Column("auto_backup_on_start", sa.Boolean(), nullable=False),
        sa.Column("include_saturdays", sa.Boolean(), nullable=False),
        sa.Column("include_sundays", sa.Boolean(), nullable=False),
        sa.Column("default_daily_hours", sa.Numeric(5, 2), nullable=False),
        sa.Column("configured_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(80), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("cpf", sa.String(11), nullable=False),
        sa.Column("full_name", sa.String(180), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_employees_cpf", "employees", ["cpf"], unique=True)
    op.create_index("ix_employees_full_name", "employees", ["full_name"], unique=False)
    op.create_table(
        "employments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("employee_code", sa.String(40), nullable=False),
        sa.Column("employment_type_id", sa.Integer(), sa.ForeignKey("employment_types.id"), nullable=False),
        sa.Column("result_center_id", sa.Integer(), sa.ForeignKey("result_centers.id"), nullable=False),
        sa.Column("job_title", sa.String(120), nullable=False),
        sa.Column("department", sa.String(120), nullable=False),
        sa.Column("admission_date", sa.Date(), nullable=False),
        sa.Column("termination_date", sa.Date(), nullable=True),
        sa.Column("status", employment_status, nullable=False),
        sa.Column("daily_hours", sa.Numeric(5, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.UniqueConstraint("company_id", "employee_code"),
    )
    op.create_index("ix_employments_employee_code", "employments", ["employee_code"], unique=False)
    op.create_table(
        "salary_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employment_id", sa.Integer(), sa.ForeignKey("employments.id"), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.UniqueConstraint("employment_id", "effective_date"),
    )


def downgrade() -> None:
    op.drop_table("salary_history")
    op.drop_index("ix_employments_employee_code", table_name="employments")
    op.drop_table("employments")
    op.drop_index("ix_employees_full_name", table_name="employees")
    op.drop_index("ix_employees_cpf", table_name="employees")
    op.drop_table("employees")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
    op.drop_table("system_settings")
    op.drop_index("ix_result_centers_code", table_name="result_centers")
    op.drop_table("result_centers")
    op.drop_index("ix_employment_types_name", table_name="employment_types")
    op.drop_table("employment_types")
    op.drop_index("ix_companies_code", table_name="companies")
    op.drop_table("companies")
    employment_status.drop(op.get_bind(), checkfirst=True)
    company_kind.drop(op.get_bind(), checkfirst=True)
    user_role.drop(op.get_bind(), checkfirst=True)

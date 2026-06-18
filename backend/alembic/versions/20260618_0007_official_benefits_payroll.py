"""Official benefits, payroll support fields and settings

Revision ID: 20260618_0007_official_benefits_payroll
Revises: 20260611_0006_company_logo_setting
Create Date: 2026-06-18 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260618_0007_official_benefits_payroll"
down_revision: str | None = "20260611_0006_company_logo_setting"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("employees", "cpf", type_=sa.String(length=14), existing_type=sa.String(length=11))
    op.add_column("employments", sa.Column("cep", sa.String(length=8), nullable=False, server_default=""))
    op.add_column("employments", sa.Column("address_complement", sa.String(length=80), nullable=False, server_default=""))
    op.add_column("employments", sa.Column("bank_code", sa.String(length=3), nullable=False, server_default=""))
    op.alter_column("employments", "cep", server_default=None)
    op.alter_column("employments", "address_complement", server_default=None)
    op.alter_column("employments", "bank_code", server_default=None)

    op.add_column("system_settings", sa.Column("payroll_rates", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("system_settings", sa.Column("job_titles", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.alter_column("system_settings", "payroll_rates", server_default=None)
    op.alter_column("system_settings", "job_titles", server_default=None)

    op.create_table(
        "benefit_definitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("applies_to", sa.JSON(), nullable=False),
        sa.Column("notes", sa.String(length=500), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "code"),
    )
    op.create_index(op.f("ix_benefit_definitions_code"), "benefit_definitions", ["code"], unique=False)

    op.create_table(
        "benefit_distributions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("competency", sa.String(length=7), nullable=False),
        sa.Column("benefit_code", sa.String(length=20), nullable=False),
        sa.Column("benefit_name", sa.String(length=120), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("days_worked", sa.Numeric(10, 2), nullable=False),
        sa.Column("value_per_day", sa.Numeric(14, 2), nullable=False),
        sa.Column("monthly_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("dependents_count", sa.Integer(), nullable=False),
        sa.Column("dependent_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("description", sa.String(length=240), nullable=False),
        sa.Column("created_by", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["employee_id"], ["employments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_benefit_distributions_benefit_code"), "benefit_distributions", ["benefit_code"], unique=False)
    op.create_index(op.f("ix_benefit_distributions_competency"), "benefit_distributions", ["competency"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_benefit_distributions_competency"), table_name="benefit_distributions")
    op.drop_index(op.f("ix_benefit_distributions_benefit_code"), table_name="benefit_distributions")
    op.drop_table("benefit_distributions")
    op.drop_index(op.f("ix_benefit_definitions_code"), table_name="benefit_definitions")
    op.drop_table("benefit_definitions")
    op.drop_column("system_settings", "job_titles")
    op.drop_column("system_settings", "payroll_rates")
    op.drop_column("employments", "bank_code")
    op.drop_column("employments", "address_complement")
    op.drop_column("employments", "cep")
    op.alter_column("employees", "cpf", type_=sa.String(length=11), existing_type=sa.String(length=14))

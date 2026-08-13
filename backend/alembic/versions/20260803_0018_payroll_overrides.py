"""Persist manual payroll adjustments by competency."""

from alembic import op
import sqlalchemy as sa


revision = "20260803_0018"
down_revision = "20260803_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payroll_overrides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("competency", sa.String(length=7), nullable=False),
        sa.Column("employment_id", sa.Integer(), nullable=False),
        sa.Column("values", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.String(length=120), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["employment_id"], ["employments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "competency", "employment_id"),
    )
    op.create_index(op.f("ix_payroll_overrides_company_id"), "payroll_overrides", ["company_id"])
    op.create_index(op.f("ix_payroll_overrides_competency"), "payroll_overrides", ["competency"])
    op.create_index(op.f("ix_payroll_overrides_employment_id"), "payroll_overrides", ["employment_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_payroll_overrides_employment_id"), table_name="payroll_overrides")
    op.drop_index(op.f("ix_payroll_overrides_competency"), table_name="payroll_overrides")
    op.drop_index(op.f("ix_payroll_overrides_company_id"), table_name="payroll_overrides")
    op.drop_table("payroll_overrides")

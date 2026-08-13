"""Add official movements table

Revision ID: 20260618_0008
Revises: 20260618_0007
Create Date: 2026-06-18 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260618_0008"
down_revision: str | None = "20260618_0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("competency", sa.String(length=7), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=80), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("hour_impact", sa.Numeric(10, 2), nullable=False),
        sa.Column("observation", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["employee_id"], ["employments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_movements_competency"), "movements", ["competency"], unique=False)
    op.create_index(op.f("ix_movements_type"), "movements", ["type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_movements_type"), table_name="movements")
    op.drop_index(op.f("ix_movements_competency"), table_name="movements")
    op.drop_table("movements")

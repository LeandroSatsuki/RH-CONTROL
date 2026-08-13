"""add monthly closings

Revision ID: 20260618_0010
Revises: 20260618_0009
Create Date: 2026-06-18 00:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260618_0010"
down_revision: str | None = "20260618_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "monthly_closings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("competency", sa.String(length=7), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("justification", sa.Text(), nullable=False),
        sa.Column("closed_by", sa.String(length=120), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "competency"),
    )
    op.create_index(op.f("ix_monthly_closings_company_id"), "monthly_closings", ["company_id"], unique=False)
    op.create_index(op.f("ix_monthly_closings_competency"), "monthly_closings", ["competency"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_monthly_closings_competency"), table_name="monthly_closings")
    op.drop_index(op.f("ix_monthly_closings_company_id"), table_name="monthly_closings")
    op.drop_table("monthly_closings")

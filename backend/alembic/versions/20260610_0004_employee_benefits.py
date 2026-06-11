"""Add employee benefits

Revision ID: 20260610_0004_employee_benefits
Revises: 20260609_0003_salary_history_family_allowance
Create Date: 2026-06-10 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260610_0004_employee_benefits"
down_revision: str | None = "20260609_0003_salary_history_family_allowance"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "employments",
        sa.Column("benefits", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.alter_column("employments", "benefits", server_default=None)


def downgrade() -> None:
    op.drop_column("employments", "benefits")

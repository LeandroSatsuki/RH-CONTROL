"""Extend salary history with family allowance and reason.

Revision ID: 20260609_0003
Revises: 20260609_0002
Create Date: 2026-06-09
"""
from typing import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260609_0003"
down_revision: str | None = "20260609_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "salary_history",
        sa.Column("family_allowance", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "salary_history",
        sa.Column("reason", sa.String(180), nullable=False, server_default=""),
    )
    op.alter_column("salary_history", "family_allowance", server_default=None)
    op.alter_column("salary_history", "reason", server_default=None)


def downgrade() -> None:
    op.drop_column("salary_history", "reason")
    op.drop_column("salary_history", "family_allowance")

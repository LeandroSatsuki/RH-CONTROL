"""Add optional employee email and allow empty banking fields.

Revision ID: 20260811_0011
Revises: 20260618_0010
Create Date: 2026-08-11
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260811_0011"
down_revision: str | None = "20260618_0010"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("email", sa.String(length=254), nullable=False, server_default=""),
    )
    op.alter_column("employees", "email", server_default=None)


def downgrade() -> None:
    op.drop_column("employees", "email")

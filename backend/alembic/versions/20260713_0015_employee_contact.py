"""Add employee contact fields

Revision ID: 20260713_0015
Revises: 20260623_0014
Create Date: 2026-07-13 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_0015"
down_revision: str | None = "20260623_0014"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("employments", sa.Column("email", sa.String(length=180), nullable=False, server_default=""))
    op.add_column("employments", sa.Column("phone", sa.String(length=20), nullable=False, server_default=""))
    op.alter_column("employments", "email", server_default=None)
    op.alter_column("employments", "phone", server_default=None)


def downgrade() -> None:
    op.drop_column("employments", "phone")
    op.drop_column("employments", "email")

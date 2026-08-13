"""Add company logo to system settings

Revision ID: 20260611_0006
Revises: 20260611_0005
Create Date: 2026-06-11 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260611_0006"
down_revision: str | None = "20260611_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("system_settings", sa.Column("company_logo", sa.String(length=4000), nullable=False, server_default=""))
    op.alter_column("system_settings", "company_logo", server_default=None)


def downgrade() -> None:
    op.drop_column("system_settings", "company_logo")

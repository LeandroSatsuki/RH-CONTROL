"""add primary company flag

Revision ID: 20260623_0013
Revises: 20260623_0012
Create Date: 2026-06-23 00:13:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260623_0013"
down_revision: str | None = "20260623_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()))
    connection = op.get_bind()
    first_id = connection.execute(sa.text("SELECT id FROM companies ORDER BY id LIMIT 1")).scalar()
    if first_id is not None:
        connection.execute(sa.text("UPDATE companies SET is_primary = false"))
        connection.execute(sa.text("UPDATE companies SET is_primary = true WHERE id = :id"), {"id": first_id})


def downgrade() -> None:
    op.drop_column("companies", "is_primary")

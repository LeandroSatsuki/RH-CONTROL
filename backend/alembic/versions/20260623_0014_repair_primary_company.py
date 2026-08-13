"""repair primary company consistency

Revision ID: 20260623_0014
Revises: 20260623_0013
Create Date: 2026-06-23 10:55:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260623_0014"
down_revision: str | None = "20260623_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    primary_id = connection.execute(
        sa.text(
            """
            SELECT id
            FROM companies
            WHERE is_primary = true AND active = true
            ORDER BY id
            LIMIT 1
            """
        )
    ).scalar()
    if primary_id is None:
        primary_id = connection.execute(
            sa.text(
                """
                SELECT id
                FROM companies
                WHERE active = true
                ORDER BY id
                LIMIT 1
                """
            )
        ).scalar()
    if primary_id is None:
        primary_id = connection.execute(sa.text("SELECT id FROM companies ORDER BY id LIMIT 1")).scalar()
    if primary_id is not None:
        connection.execute(sa.text("UPDATE companies SET is_primary = false"))
        connection.execute(
            sa.text("UPDATE companies SET is_primary = true, active = true WHERE id = :id"),
            {"id": primary_id},
        )


def downgrade() -> None:
    pass

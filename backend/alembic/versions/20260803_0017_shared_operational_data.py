"""Persist report templates and indicator revenue in PostgreSQL."""

from alembic import op
import sqlalchemy as sa


revision = "20260803_0017"
down_revision = "20260803_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "system_settings",
        sa.Column("report_templates", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "system_settings",
        sa.Column("indicator_revenue", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.alter_column("system_settings", "report_templates", server_default=None)
    op.alter_column("system_settings", "indicator_revenue", server_default=None)


def downgrade() -> None:
    op.drop_column("system_settings", "indicator_revenue")
    op.drop_column("system_settings", "report_templates")

"""Add explicit cost aid to employment records."""

from alembic import op
import sqlalchemy as sa


revision = "20260803_0016"
down_revision = "20260713_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employments",
        sa.Column("cost_aid", sa.Numeric(14, 2), nullable=False, server_default=sa.text("0.00")),
    )
    op.alter_column("employments", "cost_aid", server_default=None)


def downgrade() -> None:
    op.drop_column("employments", "cost_aid")

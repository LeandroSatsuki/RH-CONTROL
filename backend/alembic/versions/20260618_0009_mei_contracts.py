"""Add official MEI contracts table

Revision ID: 20260618_0009
Revises: 20260618_0008
Create Date: 2026-06-18 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260618_0009"
down_revision: str | None = "20260618_0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mei_contracts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("attachment_name", sa.String(length=240), nullable=True),
        sa.Column("attachment_data_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signed_by", sa.String(length=120), nullable=True),
        sa.Column("notified_not_signed", sa.Boolean(), nullable=False),
        sa.Column("notified_15", sa.Boolean(), nullable=False),
        sa.Column("notified_10", sa.Boolean(), nullable=False),
        sa.Column("notified_5", sa.Boolean(), nullable=False),
        sa.Column("movement_created_5", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["employee_id"], ["employments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("mei_contracts")

"""Add resumable monthly launch batches.

Revision ID: 20260814_0021
Revises: 20260813_0020
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260814_0021"
down_revision: str | None = "20260813_0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "launch_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("competency", sa.String(length=7), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=120), nullable=False),
        sa.Column("updated_by", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "competency", "kind"),
    )
    op.create_index("ix_launch_batches_company_id", "launch_batches", ["company_id"])
    op.create_index("ix_launch_batches_competency", "launch_batches", ["competency"])
    op.create_index("ix_launch_batches_kind", "launch_batches", ["kind"])
    op.create_index("ix_launch_batches_status", "launch_batches", ["status"])
    op.create_table(
        "launch_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("employment_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.String(length=240), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["launch_batches.id"]),
        sa.ForeignKeyConstraint(["employment_id"], ["employments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "employment_id"),
    )
    op.create_index("ix_launch_items_batch_id", "launch_items", ["batch_id"])
    op.create_index("ix_launch_items_employment_id", "launch_items", ["employment_id"])


def downgrade() -> None:
    op.drop_table("launch_items")
    op.drop_table("launch_batches")

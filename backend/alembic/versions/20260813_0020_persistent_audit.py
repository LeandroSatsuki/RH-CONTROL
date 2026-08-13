"""Add persistent audit entries for mutable operations.

Revision ID: 20260813_0020
Revises: 20260813_0019
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260813_0020"
down_revision: str | None = "20260813_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("module", sa.String(length=80), nullable=False),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("employee_name", sa.String(length=180), nullable=True),
        sa.Column("result_center", sa.JSON(), nullable=True),
        sa.Column("performed_by", sa.String(length=180), nullable=False),
        sa.Column("performed_role", sa.String(length=30), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("details", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_entries_company_id", "audit_entries", ["company_id"])
    op.create_index("ix_audit_entries_module", "audit_entries", ["module"])
    op.create_index(
        "ix_audit_entries_company_module_created",
        "audit_entries",
        ["company_id", "module", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_entries_company_module_created", table_name="audit_entries")
    op.drop_index("ix_audit_entries_module", table_name="audit_entries")
    op.drop_index("ix_audit_entries_company_id", table_name="audit_entries")
    op.drop_table("audit_entries")

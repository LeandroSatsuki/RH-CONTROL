"""Add bank data and PIX key to employments.

Revision ID: 20260609_0002
Revises: 20260604_0001
Create Date: 2026-06-09
"""
from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260609_0002"
down_revision: str | None = "20260604_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

pix_key_type = postgresql.ENUM(
    "CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM", name="pixkeytype", create_type=False
)


def upgrade() -> None:
    pix_key_type.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "employments",
        sa.Column("bank_name", sa.String(length=120), nullable=False, server_default=""),
    )
    op.add_column(
        "employments",
        sa.Column("salary_base", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "employments",
        sa.Column("bank_agency", sa.String(length=20), nullable=False, server_default=""),
    )
    op.add_column(
        "employments",
        sa.Column("bank_account", sa.String(length=30), nullable=False, server_default=""),
    )
    op.add_column(
        "employments",
        sa.Column("bank_account_digit", sa.String(length=5), nullable=False, server_default=""),
    )
    op.add_column(
        "employments",
        sa.Column("pix_key_type", pix_key_type, nullable=False, server_default="CPF"),
    )
    op.add_column(
        "employments",
        sa.Column("pix_key", sa.String(length=120), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("employments", "salary_base")
    op.drop_column("employments", "pix_key")
    op.drop_column("employments", "pix_key_type")
    op.drop_column("employments", "bank_account_digit")
    op.drop_column("employments", "bank_account")
    op.drop_column("employments", "bank_agency")
    op.drop_column("employments", "bank_name")
    pix_key_type.drop(op.get_bind(), checkfirst=True)

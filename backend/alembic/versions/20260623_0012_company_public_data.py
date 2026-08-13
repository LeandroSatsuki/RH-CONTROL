"""add company public data fields

Revision ID: 20260623_0012
Revises: 20260618_0011_company_cnpj
Create Date: 2026-06-23 00:12:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260623_0012"
down_revision: str | None = "20260618_0011_company_cnpj"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("trade_name", sa.String(length=180), nullable=False, server_default=""))
    op.add_column("companies", sa.Column("registration_status", sa.String(length=80), nullable=False, server_default=""))
    op.add_column("companies", sa.Column("opening_date", sa.String(length=20), nullable=False, server_default=""))
    op.add_column("companies", sa.Column("address", sa.String(length=240), nullable=False, server_default=""))
    op.add_column("companies", sa.Column("city", sa.String(length=120), nullable=False, server_default=""))
    op.add_column("companies", sa.Column("state", sa.String(length=2), nullable=False, server_default=""))
    op.add_column("companies", sa.Column("zip_code", sa.String(length=12), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("companies", "zip_code")
    op.drop_column("companies", "state")
    op.drop_column("companies", "city")
    op.drop_column("companies", "address")
    op.drop_column("companies", "opening_date")
    op.drop_column("companies", "registration_status")
    op.drop_column("companies", "trade_name")

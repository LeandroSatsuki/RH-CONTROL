"""add company cnpj

Revision ID: 20260618_0011_company_cnpj
Revises: 20260618_0010_monthly_closings
Create Date: 2026-06-18 00:11:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260618_0011_company_cnpj"
down_revision: str | None = "20260618_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("cnpj", sa.String(length=14), nullable=True))
    op.create_index(op.f("ix_companies_cnpj"), "companies", ["cnpj"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_companies_cnpj"), table_name="companies")
    op.drop_column("companies", "cnpj")

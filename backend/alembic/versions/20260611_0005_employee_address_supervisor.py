"""Add employee supervisor and address fields

Revision ID: 20260611_0005_employee_address_supervisor
Revises: 20260610_0004_employee_benefits
Create Date: 2026-06-11 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260611_0005_employee_address_supervisor"
down_revision: str | None = "20260610_0004_employee_benefits"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("employments", sa.Column("supervisor_name", sa.String(length=120), nullable=False, server_default=""))
    op.add_column("employments", sa.Column("street", sa.String(length=180), nullable=False, server_default=""))
    op.add_column("employments", sa.Column("address_number", sa.String(length=20), nullable=False, server_default=""))
    op.add_column("employments", sa.Column("neighborhood", sa.String(length=120), nullable=False, server_default=""))
    op.add_column("employments", sa.Column("city", sa.String(length=120), nullable=False, server_default=""))
    op.add_column("employments", sa.Column("state", sa.String(length=2), nullable=False, server_default=""))
    op.alter_column("employments", "supervisor_name", server_default=None)
    op.alter_column("employments", "street", server_default=None)
    op.alter_column("employments", "address_number", server_default=None)
    op.alter_column("employments", "neighborhood", server_default=None)
    op.alter_column("employments", "city", server_default=None)
    op.alter_column("employments", "state", server_default=None)


def downgrade() -> None:
    op.drop_column("employments", "state")
    op.drop_column("employments", "city")
    op.drop_column("employments", "neighborhood")
    op.drop_column("employments", "address_number")
    op.drop_column("employments", "street")
    op.drop_column("employments", "supervisor_name")

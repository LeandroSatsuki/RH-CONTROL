"""Add isolated consultative vacation records; no changes to existing data."""

from alembic import op
import sqlalchemy as sa

revision = "20261014_0025"
down_revision = "20260924_0024"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "vacation_dossiers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False
        ),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("reference", sa.String(80), nullable=False),
        sa.Column("admission_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_index(
        "ix_vacation_dossiers_company_id", "vacation_dossiers", ["company_id"]
    )
    op.create_table(
        "vacation_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "dossier_id",
            sa.Integer(),
            sa.ForeignKey("vacation_dossiers.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("leave_type", sa.String(120), nullable=False),
        sa.Column("effect", sa.String(20), nullable=False),
        sa.Column("sold_days", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_vacation_events_dossier_id", "vacation_events", ["dossier_id"])
    op.create_table(
        "vacation_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "dossier_id",
            sa.Integer(),
            sa.ForeignKey("vacation_dossiers.id"),
            nullable=False,
        ),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("performed_by", sa.String(180), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_vacation_history_dossier_id_id", "vacation_history", ["dossier_id", "id"]
    )


def downgrade():
    op.drop_table("vacation_history")
    op.drop_table("vacation_events")
    op.drop_table("vacation_dossiers")

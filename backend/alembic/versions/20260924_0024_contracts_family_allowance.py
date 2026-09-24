"""Add contract lifecycle and family allowance eligibility without rewriting history."""
from alembic import op
import sqlalchemy as sa
from datetime import timedelta

revision = "20260924_0024"
down_revision = "20260814_0023"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("mei_contracts") as batch:
        batch.add_column(sa.Column("renewed_from_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_mei_contract_renewed_from", "mei_contracts", ["renewed_from_id"], ["id"])
    op.add_column("mei_contracts", sa.Column("terminated_on", sa.Date(), nullable=True))
    op.add_column("mei_contracts", sa.Column("termination_attachment_name", sa.String(240), nullable=True))
    op.add_column("mei_contracts", sa.Column("termination_attachment_data_url", sa.Text(), nullable=True))
    op.add_column("mei_contracts", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("employments", sa.Column("family_allowance_eligible", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("system_settings", sa.Column("family_allowance_rates", sa.JSON(), server_default=sa.text("'[]'"), nullable=False))
    connection = op.get_bind()
    contracts = sa.table("mei_contracts", sa.column("id"), sa.column("company_id"), sa.column("employee_id"),
        sa.column("start_date", sa.Date()), sa.column("end_date", sa.Date()), sa.column("status"), sa.column("signed_at"), sa.column("renewed_from_id"))
    rows = list(connection.execute(sa.select(contracts)).mappings())
    for previous in rows:
        if not previous["signed_at"] or previous["status"] != "Ativo":
            continue
        successors = [row for row in rows if row["company_id"] == previous["company_id"] and row["employee_id"] == previous["employee_id"]
            and row["start_date"] == previous["end_date"] + timedelta(days=1)]
        if len(successors) == 1:
            successor = successors[0]
            connection.execute(contracts.update().where(contracts.c.id == successor["id"]).values(renewed_from_id=previous["id"]))
            if successor["signed_at"]:
                connection.execute(contracts.update().where(contracts.c.id == previous["id"]).values(status="Renovado"))


def downgrade():
    op.drop_column("system_settings", "family_allowance_rates")
    op.drop_column("employments", "family_allowance_eligible")
    for name in ("cancelled_at", "termination_attachment_data_url", "termination_attachment_name", "terminated_on", "renewed_from_id"):
        op.drop_column("mei_contracts", name)

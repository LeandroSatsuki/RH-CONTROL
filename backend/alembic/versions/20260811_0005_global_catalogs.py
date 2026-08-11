"""Make operational catalogs global and add the job title catalog.

Revision ID: 20260811_0005
Revises: 20260610_0004_employee_benefits
Create Date: 2026-08-11
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260811_0005"
down_revision: str | None = "20260610_0004_employee_benefits"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # Existing IDs remain unchanged, so employees and historical records keep
    # pointing to exactly the same catalog entries after this migration.
    op.alter_column("result_centers", "company_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column("employment_types", "company_id", existing_type=sa.Integer(), nullable=True)
    op.execute("UPDATE result_centers SET company_id = NULL")
    op.execute("UPDATE employment_types SET company_id = NULL")

    op.create_table(
        "job_titles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_job_titles_name", "job_titles", ["name"], unique=False)
    op.add_column("employments", sa.Column("job_title_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_employments_job_title_id", "employments", "job_titles", ["job_title_id"], ["id"]
    )
    op.execute(
        """
        INSERT INTO job_titles (name, active)
        SELECT DISTINCT BTRIM(job_title), TRUE
        FROM employments
        WHERE BTRIM(job_title) <> ''
        ON CONFLICT (name) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE employments AS employment
        SET job_title_id = job_title.id
        FROM job_titles AS job_title
        WHERE job_title.name = BTRIM(employment.job_title)
        """
    )


def downgrade() -> None:
    # Catalog and employee data are intentionally retained on downgrade. Only
    # the relation added by this revision is removed.
    op.drop_constraint("fk_employments_job_title_id", "employments", type_="foreignkey")
    op.drop_column("employments", "job_title_id")
    op.drop_index("ix_job_titles_name", table_name="job_titles")
    op.drop_table("job_titles")

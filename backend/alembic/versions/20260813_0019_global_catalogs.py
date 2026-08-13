"""Synchronize job titles, employment types and result centers globally.

Revision ID: 20260813_0019
Revises: 20260803_0018
"""

from collections.abc import Sequence
import json

import sqlalchemy as sa
from alembic import op


revision: str = "20260813_0019"
down_revision: str | None = "20260803_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    companies = list(
        connection.execute(
            sa.text("SELECT id, is_primary FROM companies ORDER BY is_primary DESC, id")
        ).mappings()
    )
    if not companies:
        return

    company_ids = [int(company["id"]) for company in companies]
    synchronize_catalog(
        connection,
        table="result_centers",
        key="code",
        fields=("code", "name", "color", "active"),
        company_ids=company_ids,
        employment_reference="result_center_id",
    )
    synchronize_catalog(
        connection,
        table="employment_types",
        key="name",
        fields=("name", "has_charges", "active"),
        company_ids=company_ids,
        employment_reference="employment_type_id",
    )
    synchronize_job_titles(connection)


def synchronize_catalog(
    connection: sa.Connection,
    *,
    table: str,
    key: str,
    fields: tuple[str, ...],
    company_ids: list[int],
    employment_reference: str,
) -> None:
    rows = list(
        connection.execute(
            sa.text(
                f"SELECT id, company_id, {', '.join(fields)} FROM {table} ORDER BY company_id, id"
            )
        ).mappings()
    )
    templates: dict[str, dict[str, object]] = {}
    by_company: dict[tuple[int, str], list[dict[str, object]]] = {}
    primary_id = company_ids[0]

    for raw in rows:
        row = dict(raw)
        normalized = str(row[key]).strip().upper()
        by_company.setdefault((int(row["company_id"]), normalized), []).append(row)
        if normalized not in templates or int(row["company_id"]) == primary_id:
            templates[normalized] = row

    for company_id in company_ids:
        for normalized, template in templates.items():
            matches = by_company.get((company_id, normalized), [])
            if matches:
                target = matches[0]
                for duplicate in matches[1:]:
                    connection.execute(
                        sa.text(
                            f"UPDATE employments SET {employment_reference} = :target "
                            f"WHERE {employment_reference} = :duplicate"
                        ),
                        {"target": target["id"], "duplicate": duplicate["id"]},
                    )
                    connection.execute(
                        sa.text(f"DELETE FROM {table} WHERE id = :id"),
                        {"id": duplicate["id"]},
                    )
                assignments = ", ".join(f"{field} = :{field}" for field in fields)
                connection.execute(
                    sa.text(f"UPDATE {table} SET {assignments} WHERE id = :id"),
                    {
                        "id": target["id"],
                        **{field: template[field] for field in fields},
                    },
                )
                continue

            columns = ("company_id", *fields)
            connection.execute(
                sa.text(
                    f"INSERT INTO {table} ({', '.join(columns)}) "
                    f"VALUES ({', '.join(':' + column for column in columns)})"
                ),
                {
                    "company_id": company_id,
                    **{field: template[field] for field in fields},
                },
            )


def synchronize_job_titles(connection: sa.Connection) -> None:
    settings = list(
        connection.execute(
            sa.text(
                "SELECT id, job_titles FROM system_settings ORDER BY company_id, id"
            )
        ).mappings()
    )
    def setting_titles(value: object) -> list[object]:
        if isinstance(value, str):
            try:
                decoded = json.loads(value)
                return decoded if isinstance(decoded, list) else []
            except json.JSONDecodeError:
                return []
        return value if isinstance(value, list) else []

    titles = sorted(
        {
            str(title).strip().upper()
            for setting in settings
            for title in setting_titles(setting["job_titles"])
            if str(title).strip()
        },
        key=str.casefold,
    )
    settings_table = sa.table(
        "system_settings",
        sa.column("id", sa.Integer),
        sa.column("job_titles", sa.JSON),
    )
    for setting in settings:
        connection.execute(
            settings_table.update()
            .where(settings_table.c.id == setting["id"])
            .values(job_titles=titles)
        )


def downgrade() -> None:
    # Global catalog synchronization preserves all references but cannot infer
    # the former per-company differences safely.
    pass

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_contract_upgrade_preserves_existing_records_and_infers_only_unique_renewal():
    path = Path(__file__).parents[1] / "alembic/versions/20260924_0024_contracts_family_allowance.py"
    spec = importlib.util.spec_from_file_location("update_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE mei_contracts (id INTEGER PRIMARY KEY, company_id INTEGER, employee_id INTEGER, start_date DATE, end_date DATE, status TEXT, signed_at DATETIME, attachment_data_url TEXT)")
        connection.exec_driver_sql("CREATE TABLE employments (id INTEGER PRIMARY KEY, salary_base NUMERIC)")
        connection.exec_driver_sql("CREATE TABLE system_settings (id INTEGER PRIMARY KEY, company_name TEXT)")
        connection.exec_driver_sql("INSERT INTO employments VALUES (1, 3100)")
        connection.exec_driver_sql("INSERT INTO system_settings VALUES (1, 'Empresa existente')")
        connection.exec_driver_sql("INSERT INTO mei_contracts VALUES (1,1,1,'2026-01-01','2026-06-30','Ativo','2026-01-01','documento-original'), (2,1,1,'2026-07-01','2026-12-31','Ativo','2026-07-01','renovacao')")
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        contracts = list(connection.execute(sa.text("SELECT * FROM mei_contracts ORDER BY id")).mappings())
        assert len(contracts) == 2
        assert contracts[0]["status"] == "Renovado"
        assert contracts[0]["attachment_data_url"] == "documento-original"
        assert contracts[1]["renewed_from_id"] == 1
        assert connection.execute(sa.text("SELECT salary_base FROM employments")).scalar() == 3100
        assert connection.execute(sa.text("SELECT family_allowance_eligible FROM employments")).scalar() == 0

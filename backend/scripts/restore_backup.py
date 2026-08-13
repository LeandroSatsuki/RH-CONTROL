import argparse
import os
import subprocess
from pathlib import Path

from sqlalchemy.engine import make_url

from app.core.config import settings
from app.services.backup import find_postgres_tool, verify_postgres_backup


def restore(path: Path) -> None:
    verify_postgres_backup(path)
    url = make_url(settings.database_url)
    env = os.environ.copy()
    if url.password:
        env["PGPASSWORD"] = url.password
    command = [
        find_postgres_tool("pg_restore"),
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--host",
        url.host or "127.0.0.1",
        "--port",
        str(url.port or 5432),
        "--username",
        url.username or "",
        "--dbname",
        url.database or "",
        str(path),
    ]
    result = subprocess.run(command, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Falha ao restaurar o banco")


def main() -> None:
    parser = argparse.ArgumentParser(description="Restaura um backup integral do Nexo")
    parser.add_argument("--file", required=True)
    args = parser.parse_args()
    restore(Path(args.file).resolve())
    print("Backup restaurado com sucesso.")


if __name__ == "__main__":
    main()

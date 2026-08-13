import json

from app.core.config import settings
from app.services.backup import create_postgres_backup, remove_old_backups, verify_postgres_backup


def main() -> None:
    path = create_postgres_backup(settings.backup_directory)
    removed = remove_old_backups(settings.backup_directory)
    print(json.dumps({"path": str(path), "removed": removed, **verify_postgres_backup(path)}))


if __name__ == "__main__":
    main()

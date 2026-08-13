from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.core.config import settings
from app.models.user import User


def reset_admin_password() -> None:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == settings.initial_admin_username))
        if not user:
            raise RuntimeError(f"Usuário {settings.initial_admin_username} não encontrado")
        user.password_hash = hash_password(settings.initial_admin_password)
        db.commit()
    print(f"Senha do usuário {settings.initial_admin_username} atualizada.")


if __name__ == "__main__":
    reset_admin_password()

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.employment_type import EmploymentType
from app.models.job_title import JobTitle
from app.models.enums import UserRole
from app.models.result_center import ResultCenter
from app.models.user import User

CENTERS = [
    ("ADM", "Administrativo", "#2563EB"),
    ("IND", "Industrial", "#F59E0B"),
    ("COM", "Comercial", "#10B981"),
    ("DIR", "Diretoria", "#8B5CF6"),
]
EMPLOYMENT_TYPES = [
    ("CLT", True),
    ("MEI", False),
    ("Freelancer", False),
    ("Pró-labore", False),
    ("Outros", False),
]
JOB_TITLES = ["Analista", "Assistente", "Coordenador", "Gerente", "Supervisor"]


def seed() -> None:
    with SessionLocal() as db:
        for code, name, color in CENTERS:
            if not db.scalar(select(ResultCenter).where(ResultCenter.code == code)):
                db.add(ResultCenter(code=code, name=name, color=color))
        for name, has_charges in EMPLOYMENT_TYPES:
            if not db.scalar(select(EmploymentType).where(EmploymentType.name == name)):
                db.add(EmploymentType(name=name, has_charges=has_charges))
        for name in JOB_TITLES:
            if not db.scalar(select(JobTitle).where(JobTitle.name == name)):
                db.add(JobTitle(name=name))
        if not db.scalar(select(User).where(User.username == settings.initial_admin_username)):
            db.add(
                User(
                    username=settings.initial_admin_username,
                    full_name="Administrador do Sistema",
                    password_hash=hash_password(settings.initial_admin_password),
                    role=UserRole.ADMIN,
                )
            )
        db.commit()
    print("Dados iniciais criados.")


if __name__ == "__main__":
    seed()


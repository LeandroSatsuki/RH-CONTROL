from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.company import Company
from app.models.employment_type import EmploymentType
from app.models.enums import CompanyKind, UserRole
from app.models.result_center import ResultCenter
from app.models.system_setting import SystemSetting
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


def seed() -> None:
    with SessionLocal() as db:
        company = db.scalar(select(Company).order_by(Company.id))
        if not company:
            company = Company(
                code="EMPRESA",
                name="Empresa Principal",
                kind=CompanyKind.MATRIZ,
                group_name="Empresa Principal",
                active=True,
                is_primary=True,
            )
            db.add(company)
            db.flush()
        elif not db.scalar(select(Company).where(Company.is_primary.is_(True))):
            company.is_primary = True
        if not db.scalar(select(SystemSetting).where(SystemSetting.company_id == company.id)):
            db.add(
                SystemSetting(
                    id=company.id,
                    company_id=company.id,
                    company_name=company.name,
                    company_logo="",
                    backup_directory="",
                    auto_backup_on_start=True,
                    include_saturdays=False,
                    include_sundays=False,
                    default_daily_hours=8.8,
                    payroll_rates={
                        "inss": 20,
                        "rat": 1,
                        "terceiros": 5.2,
                        "fgts": 8,
                        "fgts_vacation": 8,
                        "fgts_thirteenth": 8,
                        "fgts_notice": 8,
                        "multa_fgts": 50,
                        "patronal": 27.3,
                    },
                    job_titles=[
                        "Analista Administrativo",
                        "Assistente Administrativo",
                        "Supervisor",
                        "Promotor",
                        "Coordenador",
                        "Gerente",
                    ],
                )
            )
        for code, name, color in CENTERS:
            if not db.scalar(
                select(ResultCenter).where(
                    ResultCenter.company_id == company.id,
                    ResultCenter.code == code,
                )
            ):
                db.add(ResultCenter(company_id=company.id, code=code, name=name, color=color))
        for name, has_charges in EMPLOYMENT_TYPES:
            if not db.scalar(
                select(EmploymentType).where(
                    EmploymentType.company_id == company.id,
                    EmploymentType.name == name,
                )
            ):
                db.add(EmploymentType(company_id=company.id, name=name, has_charges=has_charges))
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

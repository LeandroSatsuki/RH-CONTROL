from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.employment import Employee, Employment
from app.models.employment_type import EmploymentType
from app.models.result_center import ResultCenter
from app.schemas.employee import EmployeeCreate, EmploymentRead

router = APIRouter()


def employment_query():
    return (
        select(Employment)
        .options(
            joinedload(Employment.employee),
            joinedload(Employment.employment_type),
            joinedload(Employment.result_center),
        )
        .order_by(Employee.full_name)
        .join(Employment.employee)
    )


@router.get("", response_model=list[EmploymentRead])
def list_employees(db: DbSession, _: CurrentUser) -> list[Employment]:
    return list(db.scalars(employment_query()))


@router.post("", response_model=EmploymentRead, status_code=201)
def create_employee(payload: EmployeeCreate, db: DbSession, _: AdminUser) -> Employment:
    if db.scalar(select(Employee).where(Employee.cpf == payload.cpf)):
        raise HTTPException(
            status_code=409,
            detail="CPF já cadastrado. Novos vínculos devem ser criados no histórico da pessoa.",
        )
    if not db.get(EmploymentType, payload.employment_type_id):
        raise HTTPException(status_code=404, detail="Modalidade não encontrada")
    if not db.get(ResultCenter, payload.result_center_id):
        raise HTTPException(status_code=404, detail="Centro de Resultado não encontrado")

    data = payload.model_dump(exclude={"cpf", "full_name"})
    person = Employee(cpf=payload.cpf, full_name=payload.full_name)
    employment = Employment(employee=person, **data)
    db.add(employment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Matrícula já cadastrada") from None
    return db.scalar(employment_query().where(Employment.id == employment.id))


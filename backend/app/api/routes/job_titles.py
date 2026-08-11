from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.models.job_title import JobTitle
from app.schemas.catalog import JobTitleCreate, JobTitleRead

router = APIRouter()


@router.get("", response_model=list[JobTitleRead])
def list_job_titles(db: DbSession, _: CurrentUser) -> list[JobTitle]:
    return list(db.scalars(select(JobTitle).order_by(JobTitle.name)))


@router.post("", response_model=JobTitleRead, status_code=201)
def create_job_title(payload: JobTitleCreate, db: DbSession, _: AdminUser) -> JobTitle:
    item = JobTitle(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cargo ou função já existe") from None
    db.refresh(item)
    return item

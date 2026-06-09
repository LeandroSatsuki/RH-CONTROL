from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminUser, DbSession
from app.core.security import hash_password
from app.models.user import User
from app.schemas.auth import UserCreate, UserRead

router = APIRouter()


@router.get("", response_model=list[UserRead])
def list_users(db: DbSession, _: AdminUser) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name)))


@router.post("", response_model=UserRead, status_code=201)
def create_user(payload: UserCreate, db: DbSession, _: AdminUser) -> User:
    user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Nome de usuário já existe") from None
    db.refresh(user)
    return user


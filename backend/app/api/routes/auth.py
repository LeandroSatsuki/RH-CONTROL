from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DbSession
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserRead

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == payload.username.strip()))
    if not user or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    return TokenResponse(access_token=create_access_token(user.username), user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(current_user: CurrentUser) -> User:
    return current_user


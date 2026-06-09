from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.router import api_router
from app.core.config import settings

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.api_prefix)


@app.exception_handler(SQLAlchemyError)
def database_error_handler(_: Request, __: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "detail": (
                "Banco de dados indisponível. Rode .\\scripts\\dev-db.ps1 ou configure "
                "o PostgreSQL antes de continuar."
            )
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

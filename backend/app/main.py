from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.router import api_router
from app.core.config import settings

app = FastAPI(title=settings.app_name, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def legacy_api_prefix_redirect(request: Request, call_next):
    path = request.url.path
    legacy_prefixes = (
        "/auth",
        "/setup",
        "/companies",
        "/dashboard",
        "/demo",
        "/result-centers",
        "/employment-types",
        "/employees",
        "/users",
        "/backups",
        "/chat",
    )
    if path != "/health" and not path.startswith("/api") and any(path == prefix or path.startswith(f"{prefix}/") for prefix in legacy_prefixes):
        return RedirectResponse(url=f"/api{path}{('?' + request.url.query) if request.url.query else ''}", status_code=307)
    return await call_next(request)

app.include_router(api_router, prefix=settings.api_prefix)


@app.exception_handler(SQLAlchemyError)
def database_error_handler(_: Request, __: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "detail": (
                "Banco de dados indisponível. Solicite ao administrador que verifique "
                "o PostgreSQL no computador principal."
            )
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

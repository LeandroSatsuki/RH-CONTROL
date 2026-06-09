from fastapi import APIRouter

from app.api.routes import (
    auth,
    backups,
    dashboard,
    employees,
    employment_types,
    result_centers,
    setup,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Autenticação"])
api_router.include_router(setup.router, prefix="/setup", tags=["Configuração inicial"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(result_centers.router, prefix="/result-centers", tags=["Centros de Resultado"])
api_router.include_router(employment_types.router, prefix="/employment-types", tags=["Modalidades"])
api_router.include_router(employees.router, prefix="/employees", tags=["Colaboradores"])
api_router.include_router(users.router, prefix="/users", tags=["Usuários"])
api_router.include_router(backups.router, prefix="/backups", tags=["Backup"])


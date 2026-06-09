from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Sistema de Indicadores de Folha"
    api_prefix: str = "/api"
    database_url: str = (
        "postgresql+psycopg://indicadores:troque-esta-senha@127.0.0.1:5432/indicadores_folha"
    )
    secret_key: str = "desenvolvimento-apenas-troque-em-producao"
    access_token_expire_minutes: int = 480
    initial_admin_username: str = "admin"
    initial_admin_password: str = "Admin@123"
    backup_directory: Path = Path("backups")
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

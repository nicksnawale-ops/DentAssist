from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "VisionEdge DentAssist API"
    environment: str = "development"  # development | production
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://dentassist:dentassist@localhost:5432/dentassist"

    # JWT
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Comma-separated list of allowed browser origins for the React app
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Create tables on startup (handy for local dev; use Alembic migrations in production)
    auto_create_tables: bool = False

    @field_validator("database_url")
    @classmethod
    def _normalise_driver(cls, v: str) -> str:
        # Accept plain postgres URLs (e.g. from hosting providers) and use the psycopg 3 driver.
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def validate_for_production(self) -> None:
        if self.environment == "production" and (
            self.jwt_secret_key == "change-me-in-production" or len(self.jwt_secret_key) < 32
        ):
            raise RuntimeError("JWT_SECRET_KEY must be set to a random string of 32+ characters in production.")


@lru_cache
def get_settings() -> Settings:
    return Settings()

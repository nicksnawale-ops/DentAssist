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

    # Billing
    default_gst_rate: float = 18.0  # applied only to lines marked taxable (e.g. cosmetic procedures)
    currency: str = "INR"

    # Razorpay (online UPI/card payments). Leave blank to disable online payments.
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_api_base: str = "https://api.razorpay.com/v1"

    @property
    def razorpay_enabled(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)

    # WhatsApp (Meta WhatsApp Cloud API).
    # provider: "console" logs messages instead of sending (default, good for development),
    #           "meta" sends for real, "disabled" turns messaging off.
    whatsapp_provider: str = "console"
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = ""  # any string you also type into Meta's webhook settings
    whatsapp_app_secret: str = ""  # to check X-Hub-Signature-256 on webhooks
    whatsapp_api_version: str = "v21.0"
    whatsapp_default_country_code: str = "91"
    # Run the reminder sweep inside the API process every few minutes.
    reminders_enabled: bool = False
    reminders_interval_seconds: int = 300
    # Used in messages that link back to the app (bills, booking page)
    public_app_url: str = "http://localhost:3000"

    @property
    def whatsapp_ready(self) -> bool:
        if self.whatsapp_provider == "console":
            return True
        return self.whatsapp_provider == "meta" and bool(self.whatsapp_access_token and self.whatsapp_phone_number_id)

    # Documents and X-rays. Files are stored on disk under this folder (mount a volume in Docker).
    upload_dir: str = "./uploads"
    max_upload_mb: int = 25

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
        if self.environment == "production" and self.whatsapp_provider == "meta" and not self.whatsapp_app_secret:
            raise RuntimeError("WHATSAPP_APP_SECRET is required with WHATSAPP_PROVIDER=meta, to verify webhooks.")


@lru_cache
def get_settings() -> Settings:
    return Settings()

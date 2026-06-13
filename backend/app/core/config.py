from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    app_name: str = "Document Flow Management"
    app_env: str = "local"
    frontend_url: str = "http://localhost:5173"
    database_url: str = ""
    captcha_secret: str = ""
    cors_origins: str = "http://127.0.0.1:8000,http://localhost:8000,http://localhost:5173,http://127.0.0.1:5173"

    auth_provider: str = "local"

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 1440

    storage_provider: str = "local"
    local_storage_path: str = "uploads"
    max_upload_mb: int = 50
    r2_endpoint_url: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@example.com"
    smtp_from_name: str = "He thong quan ly van ban"
    smtp_use_tls: bool = True
    email_enabled: bool = False
    resend_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def validate_runtime(self) -> None:
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is required.")
        if self.database_url.startswith("sqlite"):
            raise RuntimeError("SQLite is intentionally disabled. Use PostgreSQL for DATABASE_URL.")
        if self.auth_provider != "local":
            raise RuntimeError("AUTH_PROVIDER must be local.")
        if not self.jwt_secret_key:
            raise RuntimeError("Local auth requires JWT_SECRET_KEY.")
        if self.storage_provider not in {"r2", "local"}:
            raise RuntimeError("STORAGE_PROVIDER must be r2 or local.")
        if self.storage_provider == "r2" and not all([self.r2_endpoint_url, self.r2_access_key_id, self.r2_secret_access_key, self.r2_bucket]):
            raise RuntimeError("R2 storage requires endpoint, access key, secret key, and bucket.")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

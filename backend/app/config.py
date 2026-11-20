"""Application settings loaded from environment variables / .env."""

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # Core
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    LOG_LEVEL: str = "INFO"
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/slotease"
    SECRET_KEY: str  # required, never defaulted
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"
    CORS_ORIGINS: str = "http://localhost:5173"  # comma-separated

    # Google (login + calendar)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_LOGIN_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"
    GOOGLE_CALENDAR_REDIRECT_URI: str = "http://localhost:8000/api/calendar/google/callback"
    TOKEN_ENCRYPTION_KEY: str = ""  # Fernet key (base64), required when calendar sync is used

    # Dodo Payments
    DODO_API_KEY: str = ""
    DODO_WEBHOOK_SECRET: str = ""
    DODO_DEPOSIT_PRODUCT_ID: str = ""
    ROOT_PATH: str = ""
    DODO_ENVIRONMENT: Literal["test_mode", "live_mode"] = "test_mode"

    # Booking defaults
    DEFAULT_DEPOSIT_PERCENT: int = 15
    MIN_DEPOSIT_PERCENT: int = 10
    DEFAULT_CANCELLATION_CUTOFF_HOURS: int = 8
    HOLD_MINUTES: int = 10

    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "no-reply@localhost"
    CONTACT_TO: str = ""
    GUEST_BOOKING_SLUGS: str = "prasanth-sundararajan"
    MEET_BUSINESS_SLUGS: str = "prasanth-sundararajan"

    # Rate limiting (slowapi/limits storage). memory:// is per worker process; use a
    # shared store such as redis://redis:6379/0 when running several workers.
    RATE_LIMIT_STORAGE_URI: str = "memory://"

    # Background jobs: run in exactly one process (see PRP RISKS)
    SCHEDULER_ENABLED: bool = True

    # Production (server .env only)
    DOMAIN: str = "localhost"
    CERTBOT_EMAIL: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()  # type: ignore[call-arg]  # values come from env

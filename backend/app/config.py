import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict

# Secrets that have shipped in this repo, docs or compose files. Never valid outside DEV.
KNOWN_WEAK_SECRETS = {
    "change-me-in-production-3dhub-iran",
    "change-me-in-production",
    "changeme",
    "secret",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "3D Hub Iran API"
    dev: bool = False                      # DEV=true: docs on, random secret allowed, demo seed
    seed_demo: bool = False                # SEED_DEMO=true creates demo@3dhub.ir (never in prod)
    database_url: str = "sqlite:///./data/hub3d.db"

    jwt_secret: str = ""                   # REQUIRED outside DEV: >= 32 chars, not a known default
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "3dhub-iran"
    jwt_expire_minutes: int = 60 * 24      # 24 h; there is no refresh/revocation yet
    quote_ttl_minutes: int = 60 * 24       # how long a signed price quote stays valid

    cors_origins: str = "http://localhost:3560,http://localhost:3200,http://localhost:3000"
    platform_commission: float = 0.15      # 3D Hubs model: 15% per order

    max_upload_mb: int = 60
    max_json_kb: int = 64
    login_rate_limit: int = 10             # attempts per IP per window (login + register)
    login_rate_window_s: int = 60
    orders_per_hour: int = 60              # per user
    analyze_per_minute: int = 30           # mesh uploads per IP
    max_parallel_parses: int = 2           # CPU-bound mesh parses running at once


def _guard(s: Settings) -> Settings:
    weak = (not s.jwt_secret) or len(s.jwt_secret) < 32 or s.jwt_secret in KNOWN_WEAK_SECRETS
    if weak:
        if not s.dev:
            raise RuntimeError(
                "JWT_SECRET must be set to a random value of at least 32 characters "
                "(e.g. `openssl rand -hex 32`). Set DEV=true only for local development."
            )
        s.jwt_secret = secrets.token_urlsafe(48)  # per-process; dev tokens die on restart
    return s


settings = _guard(Settings())

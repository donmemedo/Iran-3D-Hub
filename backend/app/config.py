from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "3D Hub Iran API"
    database_url: str = "sqlite:///./data/hub3d.db"
    jwt_secret: str = "change-me-in-production-3dhub-iran"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3560,http://localhost:3200,http://localhost:3000"
    platform_commission: float = 0.15  # 3D Hubs model: 15% per order

    class Config:
        env_file = ".env"


settings = Settings()

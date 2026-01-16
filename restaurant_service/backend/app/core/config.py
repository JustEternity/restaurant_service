from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "Restaurant Service"
    DEBUG: bool = False

    DATABASE_URL: str = ""

    # JWT настройки
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # CORS настройки
    ALLOWED_ORIGINS: list = ["http://localhost:3000", "http://localhost:19006"]

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
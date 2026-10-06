import os
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "cake-images"
    APP_BASE_URL: str = "http://localhost:8000"
    ALLOWED_ORIGINS: str = "http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000"
    LOCAL_DB_PATH: str = "hearmeoutcake.db"
    LOCAL_UPLOADS_DIR: str = "public/uploads"

    @property
    def allowed_origins_list(self) -> List[str]:
        if not self.ALLOWED_ORIGINS:
            return ["*"]
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def is_supabase_configured(self) -> bool:
        return bool(
            self.SUPABASE_URL
            and self.SUPABASE_SERVICE_ROLE_KEY
            and self.SUPABASE_URL.startswith("http")
            and len(self.SUPABASE_SERVICE_ROLE_KEY) > 20
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

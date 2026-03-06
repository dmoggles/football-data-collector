from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Football Data Collector API"
    app_env: str = "development"
    app_debug: bool = True

    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "football_app"
    mysql_password: str = "football_app_password"
    mysql_database: str = "football_data_collector"
    mysql_pool_pre_ping: bool = True

    session_cookie_name: str = "fdc_session"
    session_expiry_hours: int = Field(default=24, ge=1)
    session_secure_cookies: bool = False

    @property
    def sqlalchemy_database_uri(self) -> str:
        encoded_user = quote_plus(self.mysql_user)
        encoded_password = quote_plus(self.mysql_password)
        return (
            "mysql+pymysql://"
            f"{encoded_user}:{encoded_password}@{self.mysql_host}:{self.mysql_port}/"
            f"{self.mysql_database}"
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

"""Runtime configuration, sourced from env vars + optional .env file."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

TrustProfile = Literal["c2pa-prod", "c2pa-prod+itl", "dev"]


class Settings(BaseSettings):
    """All knobs the operator can tweak via environment variables.

    The single most important one is `trust_profile`: it determines what
    counts as "Verified" vs "Signed (untrusted)". See trust/README.md and
    Implementation Guidance §6.3 for the design discussion.
    """

    model_config = SettingsConfigDict(
        env_prefix="C2PA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    trust_profile: TrustProfile = "dev"
    trust_dir: Path = Path("./trust")

    host: str = "0.0.0.0"
    port: int = 8001

    ocsp_live: bool = False
    max_ingredient_depth: int = 10
    max_upload_bytes: int = 10 * 1024 * 1024
    cors_origins: str = "*"

    log_level: str = Field(default="INFO")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def get_settings() -> Settings:
    """Loaded once at import time below; exported for tests that override it."""
    return Settings()


settings = get_settings()

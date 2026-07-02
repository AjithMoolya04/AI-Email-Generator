from dataclasses import dataclass
from pathlib import Path
import os
from typing import List

from dotenv import load_dotenv


load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    mongodb_uri: str = os.getenv("MONGODB_URI", "")
    mongodb_database: str = os.getenv("MONGODB_DATABASE", "ai_email_generator")
    mongodb_collection: str = os.getenv("MONGODB_COLLECTION", "prompt_history")
    cors_origins: List[str] = None

    def __post_init__(self) -> None:
        if self.cors_origins is None:
            object.__setattr__(self, "cors_origins", self._parse_origins())

    @staticmethod
    def _parse_origins() -> List[str]:
        raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    @property
    def has_gemini_key(self) -> bool:
        return bool(self.gemini_api_key.strip())

    @property
    def has_openai_key(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def has_groq_key(self) -> bool:
        return bool(self.groq_api_key.strip())

    @property
    def has_mongodb_uri(self) -> bool:
        return bool(self.mongodb_uri.strip())


settings = Settings()

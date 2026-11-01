from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values


ENV_FILE = Path(__file__).resolve().parent / ".env"


@dataclass(frozen=True)
class Settings:
    api_key: str = field(default="", repr=False)
    base_url: str = "https://api.meta.ai/v1"
    model: str = "muse-spark-1.3"
    cors_origins: tuple[str, ...] = ("*",)

    @classmethod
    def load(cls):
        # Deliberately read the key only here, never from frontend configuration
        # or another environment file. Disable interpolation of environment vars.
        values = dotenv_values(ENV_FILE, interpolate=False)
        return cls(
            api_key=(values.get("MODEL_API_KEY") or "").strip(),
            base_url=(values.get("MODEL_API_BASE_URL") or cls.base_url).rstrip("/"),
            model=values.get("MODEL_API_MODEL") or cls.model,
            cors_origins=tuple(
                origin.strip()
                for origin in (values.get("CORS_ORIGINS") or "*").split(",")
                if origin.strip()
            ),
        )

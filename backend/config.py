import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values


ENV_FILE = Path(__file__).resolve().parent / ".env"
ENV_NAMES = ("MODEL_API_KEY", "MODEL_API_BASE_URL", "MODEL_API_MODEL", "CORS_ORIGINS")


@dataclass(frozen=True)
class Settings:
    api_key: str = field(default="", repr=False)
    base_url: str = "https://api.meta.ai/v1"
    model: str = "muse-spark-1.3"
    cors_origins: tuple[str, ...] = ("*",)

    @classmethod
    def load(cls, env_file: Path | None = ENV_FILE, environ: Mapping[str, str] | None = None):
        """Real environment variables win; backend/.env is a local-dev fallback.

        Hosts such as Render/Railway set secrets as environment variables and
        have no .env file. An environment variable that is set but empty counts
        as unset. Only the backend reads the key, never frontend configuration.
        """
        environ = os.environ if environ is None else environ
        # interpolate=False: never expand ${VARS} inside the file.
        file_values = (
            dotenv_values(env_file, interpolate=False)
            if env_file is not None and Path(env_file).is_file()
            else {}
        )

        def get(name: str) -> str:
            value = (environ.get(name) or "").strip()
            return value or (file_values.get(name) or "").strip()

        values = {name: get(name) for name in ENV_NAMES}
        return cls(
            api_key=values["MODEL_API_KEY"],
            base_url=(values["MODEL_API_BASE_URL"] or cls.base_url).rstrip("/"),
            model=values["MODEL_API_MODEL"] or cls.model,
            cors_origins=tuple(
                origin.strip()
                for origin in (values["CORS_ORIGINS"] or "*").split(",")
                if origin.strip()
            ),
        )

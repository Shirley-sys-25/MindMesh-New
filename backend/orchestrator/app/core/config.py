from __future__ import annotations

import os
from dataclasses import dataclass


def _as_int(value: str | None, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _as_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _orchestrator_engine(value: str | None) -> str:
    normalized = (value or "auto").strip().lower()
    if normalized in {"auto", "crewai", "skeleton"}:
        return normalized
    return "auto"


@dataclass(frozen=True)
class Settings:
    service_name: str
    host: str
    port: int
    log_level: str
    orchestrator_engine: str
    openai_api_key: str
    openai_model: str
    openai_base_url: str
    internal_auth_issuer: str
    internal_auth_audience: str
    internal_auth_leeway_sec: int
    internal_auth_shared_secrets: list[str]


def get_settings() -> Settings:
    secrets = _as_list(
        os.getenv("INTERNAL_AUTH_SHARED_SECRETS")
        or os.getenv("INTERNAL_AUTH_SHARED_SECRET")
    )

    return Settings(
        service_name=os.getenv("ORCHESTRATOR_SERVICE_NAME", "mindmesh-orchestrator"),
        host=os.getenv("ORCHESTRATOR_HOST", "0.0.0.0"),
        port=_as_int(os.getenv("ORCHESTRATOR_PORT"), 8081),
        log_level=os.getenv("ORCHESTRATOR_LOG_LEVEL", "INFO"),
        orchestrator_engine=_orchestrator_engine(os.getenv("ORCHESTRATOR_ENGINE")),
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-5.4-mini"),
        openai_base_url=os.getenv("OPENAI_BASE_URL", ""),
        internal_auth_issuer=os.getenv("INTERNAL_AUTH_ISSUER", "public-api"),
        internal_auth_audience=os.getenv(
            "INTERNAL_AUTH_AUDIENCE", "crewai-orchestrator"
        ),
        internal_auth_leeway_sec=_as_int(os.getenv("INTERNAL_AUTH_LEEWAY_SEC"), 60),
        internal_auth_shared_secrets=secrets,
    )

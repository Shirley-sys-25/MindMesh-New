from __future__ import annotations

from fastapi import FastAPI

from .api.internal import router as internal_router
from .core.config import get_settings
from .core.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(title=settings.service_name)
app.include_router(internal_router)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}

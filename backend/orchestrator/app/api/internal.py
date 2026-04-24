from __future__ import annotations

from fastapi import APIRouter, Header

from ..core.auth_internal import InternalAuth
from ..crew.orchestrator import MindMeshCrewOrchestrator
from ..models.io_models import OrchestrateRequest, OrchestrateResponse

router = APIRouter(prefix="/internal", tags=["internal"])
orchestrator = MindMeshCrewOrchestrator()


@router.get("/healthz")
def internal_healthz() -> dict:
    return {"status": "ok"}


@router.post("/orchestrate", response_model=OrchestrateResponse)
def orchestrate(
    payload: OrchestrateRequest,
    _auth: dict = InternalAuth,
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> OrchestrateResponse:
    result = orchestrator.run([message.model_dump() for message in payload.messages])
    metadata = result.get("metadata", {})
    if x_request_id:
        metadata["request_id"] = x_request_id
    return OrchestrateResponse(content=result["content"], metadata=metadata)

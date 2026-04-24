from __future__ import annotations

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str = Field(min_length=1)
    content: str = Field(min_length=1)


class OrchestrateRequest(BaseModel):
    messages: list[Message] = Field(min_length=1)


class OrchestrateResponse(BaseModel):
    content: str
    metadata: dict = Field(default_factory=dict)

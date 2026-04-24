from __future__ import annotations

import logging
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings

logger = logging.getLogger(__name__)


def _extract_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_MISSING_TOKEN", "message": "Token manquant."},
        )

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_INVALID_TOKEN", "message": "Format token invalide."},
        )

    return parts[1].strip()


def _decode_with_secrets(token: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.internal_auth_shared_secrets:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "AUTH_CONFIG_ERROR",
                "message": "Secrets internes manquants.",
            },
        )

    last_error: Exception | None = None
    for secret in settings.internal_auth_shared_secrets:
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                issuer=settings.internal_auth_issuer,
                audience=settings.internal_auth_audience,
                leeway=settings.internal_auth_leeway_sec,
            )
            return payload
        except Exception as exc:  # noqa: BLE001
            last_error = exc

    logger.warning("internal_token_validation_failed", extra={"error": str(last_error)})
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "code": "AUTH_INVALID_TOKEN",
            "message": "Token interne invalide ou expire.",
        },
    )


def verify_internal_token(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    token = _extract_token(authorization)
    payload = _decode_with_secrets(token)

    scopes_raw = payload.get("scope", "")
    scopes = {scope.strip() for scope in str(scopes_raw).split(" ") if scope.strip()}
    if "orchestrate:invoke" not in scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AUTH_FORBIDDEN", "message": "Scope interne insuffisant."},
        )

    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_INVALID_TOKEN", "message": "sub manquant."},
        )

    return payload


InternalAuth = Depends(verify_internal_token)

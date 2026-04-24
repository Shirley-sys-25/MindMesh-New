from __future__ import annotations

import os
import time
import unittest

import jwt
from fastapi import HTTPException

from backend.orchestrator.app.core.auth_internal import verify_internal_token


class InternalAuthTests(unittest.TestCase):
    ENV_KEYS = (
        "INTERNAL_AUTH_ISSUER",
        "INTERNAL_AUTH_AUDIENCE",
        "INTERNAL_AUTH_LEEWAY_SEC",
        "INTERNAL_AUTH_SHARED_SECRETS",
    )

    def setUp(self) -> None:
        self._previous_env = {key: os.environ.get(key) for key in self.ENV_KEYS}
        self.secret_current = "current-secret-key-with-32-bytes-min"
        self.secret_next = "next-secret-key-with-32-bytes-min---"
        os.environ["INTERNAL_AUTH_ISSUER"] = "public-api"
        os.environ["INTERNAL_AUTH_AUDIENCE"] = "crewai-orchestrator"
        os.environ["INTERNAL_AUTH_LEEWAY_SEC"] = "0"
        os.environ["INTERNAL_AUTH_SHARED_SECRETS"] = (
            f"{self.secret_current},{self.secret_next}"
        )

    def tearDown(self) -> None:
        for key, value in self._previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _mint_token(
        self,
        *,
        secret: str,
        scope: str = "orchestrate:invoke",
        subject: str | None = "user-123",
        exp_delta: int = 60,
    ) -> str:
        now = int(time.time())
        payload: dict[str, object] = {
            "iss": "public-api",
            "aud": "crewai-orchestrator",
            "scope": scope,
            "iat": now,
            "exp": now + exp_delta,
        }
        if subject is not None:
            payload["sub"] = subject
        return jwt.encode(payload, secret, algorithm="HS256")

    def test_missing_token_returns_401(self) -> None:
        with self.assertRaises(HTTPException) as context:
            verify_internal_token(None)

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail["code"], "AUTH_MISSING_TOKEN")

    def test_invalid_format_returns_401(self) -> None:
        with self.assertRaises(HTTPException) as context:
            verify_internal_token("Token invalid")

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail["code"], "AUTH_INVALID_TOKEN")

    def test_missing_scope_returns_403(self) -> None:
        token = self._mint_token(secret=self.secret_current, scope="read:only")

        with self.assertRaises(HTTPException) as context:
            verify_internal_token(f"Bearer {token}")

        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(context.exception.detail["code"], "AUTH_FORBIDDEN")

    def test_expired_token_returns_401(self) -> None:
        token = self._mint_token(secret=self.secret_current, exp_delta=-5)

        with self.assertRaises(HTTPException) as context:
            verify_internal_token(f"Bearer {token}")

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail["code"], "AUTH_INVALID_TOKEN")

    def test_rotated_secret_is_accepted(self) -> None:
        token = self._mint_token(secret=self.secret_next)
        payload = verify_internal_token(f"Bearer {token}")

        self.assertEqual(payload["sub"], "user-123")
        self.assertEqual(payload["scope"], "orchestrate:invoke")

    def test_missing_sub_returns_401(self) -> None:
        token = self._mint_token(secret=self.secret_current, subject=None)

        with self.assertRaises(HTTPException) as context:
            verify_internal_token(f"Bearer {token}")

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail["code"], "AUTH_INVALID_TOKEN")


if __name__ == "__main__":
    unittest.main()

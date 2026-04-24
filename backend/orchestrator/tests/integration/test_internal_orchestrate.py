from __future__ import annotations

import os
import time
import unittest

import jwt
from fastapi.testclient import TestClient

os.environ["ORCHESTRATOR_ENGINE"] = "skeleton"

from backend.orchestrator.app.main import app


class InternalOrchestrateIntegrationTests(unittest.TestCase):
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
        self.client = TestClient(app)

    def tearDown(self) -> None:
        for key, value in self._previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _mint_token(
        self,
        *,
        secret: str | None = None,
        scope: str = "orchestrate:invoke",
        exp_delta: int = 60,
    ) -> str:
        now = int(time.time())
        payload = {
            "iss": "public-api",
            "aud": "crewai-orchestrator",
            "sub": "integration-user",
            "scope": scope,
            "iat": now,
            "exp": now + exp_delta,
        }
        return jwt.encode(payload, secret or self.secret_current, algorithm="HS256")

    def test_missing_token_returns_401(self) -> None:
        response = self.client.post(
            "/internal/orchestrate",
            json={"messages": [{"role": "user", "content": "Bonjour"}]},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "AUTH_MISSING_TOKEN")

    def test_bad_scope_returns_403(self) -> None:
        token = self._mint_token(scope="read:only")
        response = self.client.post(
            "/internal/orchestrate",
            headers={"Authorization": f"Bearer {token}"},
            json={"messages": [{"role": "user", "content": "Bonjour"}]},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"]["code"], "AUTH_FORBIDDEN")

    def test_valid_token_returns_orchestrated_response(self) -> None:
        token = self._mint_token()
        response = self.client.post(
            "/internal/orchestrate",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Request-Id": "req-int-001",
            },
            json={
                "messages": [
                    {"role": "user", "content": "Je veux lancer mon agence web"}
                ]
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("content", payload)
        self.assertIn("metadata", payload)
        self.assertEqual(payload["metadata"]["request_id"], "req-int-001")
        self.assertEqual(payload["metadata"]["engine"], "crewai-skeleton")


if __name__ == "__main__":
    unittest.main()

"""Instagram OAuth connects the account but never publishes during login."""

import asyncio
import os
from pathlib import Path
import sys

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "puff2door_instagram_callback")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-thirty-two-bytes-long")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402


def test_instagram_callback_connects_without_publishing(monkeypatch):
    calls = []

    class Fake:
        async def exchange_code(self, code, state):
            calls.append(("exchange", code, state))

        async def publish_draft(self, *args, **kwargs):
            calls.append(("publish", args, kwargs))

    monkeypatch.setattr(server, "instagram_integration", lambda: Fake())

    async def go():
        response = await server.instagram_oauth_callback(code="auth-code", state="state-1", error="")
        assert response.status_code == 303
        assert response.headers["location"].endswith("/admin/agents?instagram=connected")
        assert calls == [("exchange", "auth-code", "state-1")]

    asyncio.run(go())


def test_instagram_callback_error_does_not_exchange(monkeypatch):
    calls = []

    class Fake:
        async def exchange_code(self, code, state):
            calls.append((code, state))

    monkeypatch.setattr(server, "instagram_integration", lambda: Fake())

    async def go():
        response = await server.instagram_oauth_callback(code="", state="", error="access_denied")
        assert response.status_code == 303
        assert response.headers["location"].endswith("/admin/agents?instagram=error")
        assert calls == []

    asyncio.run(go())

"""OAuth callback stores the connection and does not pull inventory."""
import os
from pathlib import Path
import sys

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "puff2door_clover_callback")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-thirty-two-bytes-long")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402


def test_oauth_callback_does_not_sync(monkeypatch):
    calls = []

    class Fake:
        sync_enabled = False

        async def exchange_code(self, code, merchant_id, state):
            calls.append(("exchange", merchant_id))
            return {"merchantId": merchant_id}

        async def sync_catalog(self, source="manual"):
            calls.append(("sync", source))

        async def sync_from_clover(self, source="manual", include_prices=False):
            calls.append(("legacy", source))

    monkeypatch.setattr(server, "clover_integration", lambda: Fake())

    async def go():
        response = await server.clover_oauth_callback(code="auth-code", merchant_id="API-MERCHANT", state="state-1", error="")
        assert response.status_code == 303
        assert response.headers["location"].endswith("/admin/clover?clover=connected")
        assert calls == [("exchange", "API-MERCHANT")]

    import asyncio
    asyncio.run(go())


def test_sync_flag_is_off_unless_enabled(monkeypatch):
    monkeypatch.delenv("CLOVER_SYNC_ENABLED", raising=False)
    assert os.environ.get("CLOVER_SYNC_ENABLED", "").strip().lower() not in {"1", "true", "yes", "on"}
    assert server.CLOVER_SYNC_ENABLED is False

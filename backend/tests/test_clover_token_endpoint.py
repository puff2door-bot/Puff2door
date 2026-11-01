"""Admin test-connection endpoint for merchant API token mode."""
import asyncio
import json
import os
import sys
from pathlib import Path

import httpx
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "puff2door_clover_token")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-thirty-two-bytes-long")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from clover import CloverError  # noqa: E402


def run(coro):
    return asyncio.run(coro)


def test_status_reports_token_mode_without_the_secret():
    original_db = server.db
    original_token = server.CLOVER_API_TOKEN
    original_mid = server.CLOVER_MERCHANT_ID
    server.db = AsyncMongoMockClient()["clover_token_status"]
    server.CLOVER_API_TOKEN = "super-secret-token"
    server.CLOVER_MERCHANT_ID = "AB12CD34EF567"
    try:
        async def go():
            status = await server.admin_clover_status(admin={"id": "admin"})
            encoded = json.dumps(status, default=str)
            assert "super-secret-token" not in encoded
            assert status["tokenMode"] is True
            assert status["connected"] is True
            assert status["merchantId"] == "AB12CD34EF567"
            assert status["syncEnabled"] is False

        run(go())
    finally:
        server.db = original_db
        server.CLOVER_API_TOKEN = original_token
        server.CLOVER_MERCHANT_ID = original_mid


def test_test_connection_endpoint_auth_and_payload(monkeypatch):
    class Ok:
        async def test_connection(self):
            return {"name": "HD Smoke Shop", "itemCount": 4, "apiToken": "super-secret-token"}

    class Denied:
        async def test_connection(self):
            raise CloverError("Clover token missing a permission or revoked")

    async def go():
        db = AsyncMongoMockClient()["clover_token_http"]
        original = server.db
        server.db = db
        await db.users.insert_one({"id": "customer-1", "email": "shopper@example.com", "role": "customer"})
        await db.users.insert_one({"id": "admin-1", "email": "owner@example.com", "role": "admin"})
        customer = server.create_token("customer-1")
        admin = server.create_token("admin-1")
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://test") as client:
                path = "/api/admin/clover/test-connection"
                anonymous = await client.post(path)
                assert anonymous.status_code == 401
                forbidden = await client.post(path, headers={"Authorization": f"Bearer {customer}"})
                assert forbidden.status_code == 403

                monkeypatch.setattr(server, "clover_integration", lambda: Denied())
                rejected = await client.post(path, headers={"Authorization": f"Bearer {admin}"})
                assert rejected.status_code == 400
                assert rejected.json()["detail"] == "Clover token missing a permission or revoked"

                monkeypatch.setattr(server, "clover_integration", lambda: Ok())
                accepted = await client.post(path, headers={"Authorization": f"Bearer {admin}"})
                assert accepted.status_code == 200
                assert accepted.json() == {"name": "HD Smoke Shop", "itemCount": 4}
                assert "super-secret-token" not in accepted.text
        finally:
            server.db = original

    run(go())

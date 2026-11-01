"""Real admin auth on the private inventory routes. No catalog writes."""
import asyncio
import io
import os
from pathlib import Path

import httpx
import pytest
from mongomock_motor import AsyncMongoMockClient
from PIL import Image

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "puff2door_inventory_privacy")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-thirty-two-bytes-long")

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402


def _png():
    raw = io.BytesIO()
    Image.new("RGB", (32, 32), "blue").save(raw, "PNG")
    return raw.getvalue()


def run(coro):
    return asyncio.run(coro)


PATHS = [
    ("GET", "/api/admin/inventory-captures"),
    ("GET", "/api/admin/inventory-captures/export.csv"),
    ("GET", "/api/admin/inventory-captures/missing-record"),
    ("GET", "/api/admin/inventory-captures/missing-record/photo"),
    ("POST", "/api/admin/inventory-captures/prepare"),
    ("POST", "/api/admin/inventory-captures"),
    ("PUT", "/api/admin/inventory-captures/missing-record"),
    ("POST", "/api/admin/inventory-captures/missing-record/photo"),
]


def _request(client, method, path, headers):
    photo = _png()
    if method == "GET":
        return client.get(path, headers=headers)
    if method == "PUT":
        return client.put(path, headers=headers, json={"name": "Should not save", "retailPrice": "9.00", "barcode": "0001"})
    if path.endswith("/prepare") or path.endswith("/photo"):
        return client.post(path, headers=headers, files={"file": ("item.png", photo)})
    return client.post(path, headers=headers, files={"file": ("item.png", photo)}, data={"identifier": "0001", "name": "Nope", "retailPrice": "9.00"})


@pytest.fixture
def privacy_db():
    original = server.db
    server.db = AsyncMongoMockClient()["inventory_privacy"]
    try:
        yield server.db
    finally:
        server.db = original


def test_inventory_routes_reject_anonymous_and_non_admin(privacy_db):
    async def go():
        await privacy_db.users.insert_one({
            "id": "customer-1",
            "email": "customer-inventory@example.com",
            "role": "customer",
        })
        customer = server.create_token("customer-1")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://test") as client:
            for method, path in PATHS:
                anonymous = await _request(client, method, path, {})
                assert anonymous.status_code == 401, (method, path, anonymous.status_code, anonymous.text[:200])
                rejected = await _request(client, method, path, {"Authorization": f"Bearer {customer}"})
                assert rejected.status_code == 403, (method, path, rejected.status_code, rejected.text[:200])

    run(go())

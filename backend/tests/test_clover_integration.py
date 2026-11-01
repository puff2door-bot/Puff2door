import asyncio
import json
from urllib.parse import parse_qs, urlsplit

import httpx
from mongomock_motor import AsyncMongoMockClient

from clover import CloverIntegration


def run(coro):
    return asyncio.run(coro)


def integration(db, handler):
    transport = httpx.MockTransport(handler)
    return CloverIntegration(
        db,
        client_id="app-123",
        client_secret="secret-123",
        jwt_secret="test-secret-that-is-at-least-thirty-two-bytes-long",
        environment="sandbox",
        redirect_uri="https://api.example.com/api/clover/oauth/callback",
        site_url="https://example.com",
        webhook_auth_code="webhook-secret",
        http_client_factory=lambda **kwargs: httpx.AsyncClient(transport=transport, **kwargs),
    )


async def seed_connection(db, clover):
    await db.integrations.insert_one({
        "key": "clover",
        "merchantId": "merchant-1",
        "encryptedAccessToken": clover.encrypt("access-token"),
        "encryptedRefreshToken": clover.encrypt("refresh-token"),
    })


def test_sync_matches_only_exact_unique_sku_or_barcode_and_updates_stock():
    async def go():
        db = AsyncMongoMockClient()["clover_sync_test"]

        def handler(request):
            assert request.headers["Authorization"] == "Bearer access-token"
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"elements": [
                    {"id": "clover-a", "name": "Exact match", "sku": "SKU-100", "code": "111", "price": 2499},
                    {"id": "clover-b", "name": "Name happens to match", "sku": "DIFFERENT", "code": "222", "price": 1099},
                ]})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": [
                    {"item": {"id": "clover-a"}, "quantity": 17},
                    {"item": {"id": "clover-b"}, "quantity": 9},
                ]})
            raise AssertionError(request.url)

        clover = integration(db, handler)
        await seed_connection(db, clover)
        await db.products.insert_many([
            {"id": 1, "name": "Exact match", "sku": "sku 100", "barcode": "", "stock": 0},
            {"id": 2, "name": "Name happens to match", "sku": "", "barcode": "", "stock": 3},
        ])

        summary = await clover.sync_from_clover()
        matched = await db.products.find_one({"id": 1})
        name_only = await db.products.find_one({"id": 2})
        config = await db.integrations.find_one({"key": "clover"})

        assert matched["cloverItemId"] == "clover-a"
        assert matched["stock"] == 17
        assert name_only.get("cloverItemId") is None and name_only["stock"] == 3
        assert summary["autoMatchedItems"] == 1
        assert summary["unmatchedItems"] == 1
        assert config["unmatchedItems"][0]["id"] == "clover-b"

    run(go())


def test_stock_push_uses_clover_item_stock_endpoint_and_quantity():
    async def go():
        db = AsyncMongoMockClient()["clover_push_test"]
        received = {}

        def handler(request):
            received["method"] = request.method
            received["path"] = request.url.path
            received["body"] = json.loads(request.content)
            return httpx.Response(200, json={"quantity": 6})

        clover = integration(db, handler)
        await seed_connection(db, clover)
        await db.products.insert_one({"id": 7, "name": "Linked", "cloverItemId": "item-7", "stock": 6})

        assert await clover.push_product_stock(7, source="test") is True
        assert received == {
            "method": "PUT",
            "path": "/v3/merchants/merchant-1/item_stocks/item-7",
            "body": {"quantity": 6},
        }
        assert await db.clover_sync_logs.count_documents({"status": "success", "action": "stock_push"}) == 1

    run(go())


def test_new_website_product_is_created_in_clover_then_stock_is_sent():
    async def go():
        db = AsyncMongoMockClient()["clover_product_create_test"]
        requests = []

        def handler(request):
            requests.append((request.method, request.url.path, json.loads(request.content)))
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"id": "new-clover-item"})
            if request.url.path.endswith("/item_stocks/new-clover-item"):
                return httpx.Response(200, json={"quantity": 12})
            raise AssertionError(request.url)

        clover = integration(db, handler)
        await seed_connection(db, clover)
        await db.products.insert_one({
            "id": 9, "name": "New website product", "price": 19.99, "stock": 12,
            "sku": "P2D-009", "barcode": "012345678901", "active": True, "minimumAge": 21,
        })

        result = await clover.sync_product_details(9, source="test")
        product = await db.products.find_one({"id": 9})

        assert result["status"] == "success" and result["action"] == "create"
        assert product["cloverItemId"] == "new-clover-item"
        assert requests[0][0:2] == ("POST", "/v3/merchants/merchant-1/items")
        assert requests[0][2]["price"] == 1999
        assert requests[0][2]["sku"] == "P2D-009"
        assert requests[0][2]["code"] == "012345678901"
        assert requests[1] == ("PUT", "/v3/merchants/merchant-1/item_stocks/new-clover-item", {"quantity": 12})

    run(go())


def test_stored_tokens_are_encrypted_and_round_trip():
    db = AsyncMongoMockClient()["clover_crypto_test"]
    clover = integration(db, lambda request: httpx.Response(500))
    encrypted = clover.encrypt("top-secret-token")
    assert "top-secret-token" not in encrypted
    assert clover.decrypt(encrypted) == "top-secret-token"


def test_oauth_state_is_one_time_and_tokens_are_encrypted_at_rest():
    async def go():
        db = AsyncMongoMockClient()["clover_oauth_test"]

        def handler(request):
            if request.url.path.endswith("/oauth/v2/token"):
                assert json.loads(request.content) == {"client_id": "app-123", "client_secret": "secret-123", "code": "auth-code"}
                return httpx.Response(200, json={
                    "access_token": "live-access",
                    "refresh_token": "live-refresh",
                    "access_token_expiration": 4102444800,
                    "refresh_token_expiration": 4133980800,
                })
            if request.url.path.endswith("/v3/merchants/merchant-9"):
                return httpx.Response(200, json={"id": "merchant-9", "name": "Puff2Door Clover"})
            raise AssertionError(request.url)

        clover = integration(db, handler)
        url = await clover.create_authorization_url("admin-1")
        state = parse_qs(urlsplit(url).query)["state"][0]
        await clover.exchange_code("auth-code", "merchant-9", state)
        saved = await db.integrations.find_one({"key": "clover"})

        assert saved["merchantName"] == "Puff2Door Clover"
        assert "live-access" not in saved["encryptedAccessToken"]
        assert "live-refresh" not in saved["encryptedRefreshToken"]
        assert clover.decrypt(saved["encryptedAccessToken"]) == "live-access"
        assert await db.clover_oauth_states.count_documents({}) == 0

    run(go())


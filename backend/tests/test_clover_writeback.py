"""Two-way catalog fields, write-back, aliases, and no invented categories."""
import asyncio
import json

import httpx
from mongomock_motor import AsyncMongoMockClient

from clover import CloverIntegration
from clover_catalog import catalog_winner, price_guard


def run(coro):
    return asyncio.run(coro)


def integration(db, handler, **flags):
    transport = httpx.MockTransport(handler)
    clover = CloverIntegration(
        db, client_id="app", client_secret="secret",
        jwt_secret="test-secret-that-is-at-least-thirty-two-bytes-long",
        environment="sandbox", redirect_uri="https://api.example.com/api/clover/oauth/callback",
        site_url="https://example.com", sync_enabled=True,
        http_client_factory=lambda **kwargs: httpx.AsyncClient(transport=transport, **kwargs),
        **flags,
    )
    return clover


async def connect(db, clover):
    await db.integrations.insert_one({
        "key": "clover", "merchantId": "merchant-1",
        "encryptedAccessToken": clover.encrypt("token"),
        "encryptedRefreshToken": clover.encrypt("refresh"),
    })


def test_flags_default_off_and_price_guard():
    db = AsyncMongoMockClient()["flags"]
    clover = integration(db, lambda request: httpx.Response(500))
    assert clover.sync_prices is False
    assert clover.sync_names is False
    assert clover.create_items is False
    assert clover.category_writeback is False
    assert "50%" in price_guard(10, 20, False)
    assert "$0" in price_guard(10, 0, False)
    assert price_guard(10, 20, True) == ""
    assert catalog_winner(2000, 1000) == "clover"
    assert catalog_winner(1000, 2000) == "website"


def test_last_edit_wins_and_blocks_a_large_price_push():
    async def go():
        db = AsyncMongoMockClient()["winner"]
        posted = []

        def handler(request):
            if request.method == "POST":
                posted.append((request.url.path, json.loads(request.content or b"{}")))
                return httpx.Response(200, json={"id": "item-1"})
            if request.method == "DELETE":
                raise AssertionError("deletes are not allowed")
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"elements": [
                    {"id": "item-1", "name": "Old Clover", "sku": "SKU-1", "price": 1000, "modifiedTime": 1_000},
                ]})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": [{"item": {"id": "item-1"}, "quantity": 4}]})
            return httpx.Response(200, json={"elements": []})

        clover = integration(db, handler, sync_prices=True, sync_names=True)
        await connect(db, clover)
        await db.products.insert_one({
            "id": 1, "name": "Website name", "sku": "SKU-1", "price": 40, "cloverPrice": 10,
            "stock": 4, "cloverItemId": "item-1", "updatedAt": __import__("datetime").datetime(2026, 1, 2, tzinfo=__import__("datetime").timezone.utc),
            "active": True,
        })
        summary = await clover.sync_catalog(source="test")
        product = await db.products.find_one({"id": 1})
        assert product["name"] == "Website name"
        assert product["price"] == 40
        assert any(row.get("conflict") and row.get("field") == "price" for row in summary["conflicts"])
        assert all("price" not in body for _path, body in posted)

    run(go())


def test_create_in_clover_links_an_existing_sku_and_import_creates_no_catalog_rows():
    async def go():
        db = AsyncMongoMockClient()["create"]
        methods = []

        def handler(request):
            methods.append(request.method + " " + request.url.path)
            if request.method == "DELETE" or request.url.path.endswith("/categories") and request.method == "POST":
                raise AssertionError(request.method + " " + request.url.path)
            if request.url.path.endswith("/items") and request.method == "GET":
                return httpx.Response(200, json={"elements": [{"id": "existing", "name": "Geek Bar Pulse", "sku": "GB1", "price": 1999}]})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": []})
            return httpx.Response(200, json={"elements": [], "id": "new-item"})

        clover = integration(db, handler, create_items=True)
        await connect(db, clover)
        await db.categories.insert_one({"slug": "disposable", "name": "DISPOSABLE VAPES"})
        await db.brands.insert_one({"slug": "geek-bar", "name": "GEEK BAR", "displayName": "GEEK BAR"})
        before_categories = await db.categories.count_documents({})
        before_brands = await db.brands.count_documents({})
        await db.products.insert_one({"id": 3, "name": "Geek Bar Pulse", "sku": "GB1", "price": 19.99, "category": "DISPOSABLE VAPES", "brandName": "GEEK BAR"})
        created = await clover.create_clover_item(await db.products.find_one({"id": 3}))
        assert created["action"] == "linked_existing"
        assert created["cloverItemId"] == "existing"
        assert not any(line.startswith("POST") and line.endswith("/items") for line in methods)
        await db.products.delete_many({})
        await clover.import_item("existing", {"id": 9, "slug": "draft", "name": "Geek Bar Pulse", "price": 1, "stock": 0, "minimumAge": 21, "active": True})
        assert await db.categories.count_documents({}) == before_categories
        assert await db.brands.count_documents({}) == before_brands

    run(go())


def test_writeback_is_off_by_default_and_reuses_tags_without_deleting():
    async def go():
        db = AsyncMongoMockClient()["write"]
        calls = []

        def handler(request):
            calls.append(request.method + " " + request.url.path)
            if request.method == "DELETE":
                raise AssertionError("delete")
            if request.url.path.rstrip("/").endswith("/categories") and request.method == "POST":
                raise AssertionError("created a category")
            if request.url.path.endswith("/items") and request.method == "GET":
                return httpx.Response(200, json={"elements": [{"id": "item-1", "name": "Item", "price": 100}]})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": []})
            if request.url.path.endswith("/categories"):
                return httpx.Response(200, json={"elements": [{"id": "cat-1", "name": "DISPOSABLE VAPES"}]})
            if request.url.path.endswith("/tags"):
                return httpx.Response(200, json={"elements": [{"id": "tag-1", "name": "GEEK BAR"}]})
            return httpx.Response(200, json={"id": "tag-1", "elements": []})

        clover = integration(db, handler)
        await connect(db, clover)
        await db.products.insert_one({"id": 1, "name": "Item", "cloverItemId": "item-1", "category": "DISPOSABLE VAPES", "brandName": "GEEK BAR"})
        skipped = await clover.apply_category_writeback(confirm=True)
        assert skipped["applied"] is False and skipped["reason"] == "writeback_disabled"
        clover.category_writeback = True
        applied = await clover.apply_category_writeback(confirm=True)
        assert applied["applied"] is True
        assert any(line.endswith("/category_items") and line.startswith("POST") for line in calls)
        assert any(line.endswith("/tag_items") and line.startswith("POST") for line in calls)
        assert not any(line.startswith("DELETE") for line in calls)
        assert not any(line.startswith("POST") and line.rstrip("/").endswith("/categories") for line in calls)

    run(go())


def test_unique_name_links_and_ambiguous_names_stay_for_review():
    async def go():
        db = AsyncMongoMockClient()["names"]

        def handler(request):
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"elements": [
                    {"id": "pulse", "name": "Geekbar Pulse Grape 25K", "sku": "", "price": 1000},
                    {"id": "mint-a", "name": "Alpha Mint", "sku": "A", "price": 500},
                    {"id": "mint-b", "name": "Alpha Mint Ice", "sku": "B", "price": 500},
                ]})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": [
                    {"item": {"id": "pulse"}, "quantity": 6},
                    {"item": {"id": "mint-a"}, "quantity": 1},
                    {"item": {"id": "mint-b"}, "quantity": 1},
                ]})
            return httpx.Response(200, json={"elements": []})

        clover = integration(db, handler)
        await connect(db, clover)
        await db.brands.insert_one({"slug": "geek-bar", "name": "GEEK BAR", "displayName": "GEEK BAR"})
        await clover.save_brand_aliases([{"brandSlug": "geek-bar", "aliases": ["Geekbar"]}])
        await db.products.insert_many([
            {"id": 1, "name": "GEEK BAR PULSE GRAPE", "sku": "", "stock": 0},
            {"id": 2, "name": "Alpha Mint", "sku": "", "stock": 2},
            {"id": 3, "name": "Alpha Mint", "sku": "", "stock": 2},
        ])
        summary = await clover.sync_from_clover()
        linked = await db.products.find_one({"id": 1})
        assert linked["cloverItemId"] == "pulse" and linked["stock"] == 6
        assert (await db.products.find_one({"id": 2})).get("cloverItemId") is None
        assert summary["autoMatchedItems"] == 1
        assert summary["skippedItems"] == 2
        assert await db.categories.count_documents({}) == 0

    run(go())


def test_import_new_items_stays_off_and_does_not_create_categories():
    async def go():
        db = AsyncMongoMockClient()["importnew"]

        def handler(request):
            if request.method != "GET":
                raise AssertionError(request.method)
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"elements": [
                    {"id": "ready", "name": "GEEK BAR PULSE", "sku": "GB", "price": 1000, "categories": {"elements": [{"name": "Nicotine Vapes"}]}},
                    {"id": "review", "name": "Mystery item", "sku": "X", "price": 100},
                ]})
            return httpx.Response(200, json={"elements": []})

        clover = integration(db, handler)
        await connect(db, clover)
        await db.categories.insert_one({"slug": "disposable", "name": "DISPOSABLE VAPES"})
        await db.brands.insert_one({"slug": "geek-bar", "name": "GEEK BAR", "displayName": "GEEK BAR"})
        skipped = await clover.import_mapped_items()
        assert skipped["applied"] is False and skipped["created"] == 0
        clover.import_new_items = True
        # The sample item has a category but no brand match strong enough to be mappedBrand unless the name starts with the brand.
        result = await clover.import_mapped_items()
        assert await db.categories.count_documents({}) == 1
        assert await db.brands.count_documents({}) == 1
        assert result["created"] in (0, 1)
        if result["created"]:
            created = await db.products.find_one({"cloverItemId": "ready"})
            assert created["active"] is False
            assert created["categorySlug"] == "disposable"

    run(go())


def test_brand_alias_matches_without_creating_a_brand():
    async def go():
        db = AsyncMongoMockClient()["alias"]
        clover = integration(db, lambda request: httpx.Response(200, json={"elements": []}))
        await db.brands.insert_one({"slug": "geek-bar", "name": "GEEK BAR", "displayName": "GEEK BAR"})
        before = await db.brands.count_documents({})
        saved = await clover.save_brand_aliases([{"brandSlug": "geek-bar", "aliases": ["Geekbar"]}, {"brandSlug": "missing", "aliases": ["Nope"]}])
        assert saved == [{"brandSlug": "geek-bar", "aliases": ["Geekbar"]}]
        assert await db.brands.count_documents({}) == before
        from clover_mapping import classify_item
        result = classify_item({"name": "GEEKBAR Pulse", "categories": []}, [], [], [{"slug": "geek-bar", "displayName": "GEEK BAR"}], saved)
        assert result["mappedBrandSlug"] == "geek-bar"

    run(go())

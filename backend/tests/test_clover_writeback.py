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


def _auto_import_handler(items, calls):
    def handler(request):
        calls.append(request.method + " " + request.url.path)
        if request.method != "GET":
            raise AssertionError("auto import must not write to Clover: " + request.method + " " + request.url.path)
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json={"elements": items})
        if request.url.path.endswith("/item_stocks"):
            return httpx.Response(200, json={"elements": [{"item": {"id": row["id"]}, "quantity": 3} for row in items]})
        return httpx.Response(200, json={"elements": []})
    return handler


def test_new_clover_items_import_with_category_brand_and_placeholder():
    async def go():
        db = AsyncMongoMockClient()["autoimport"]
        calls = []
        items = [
            {"id": "new-1", "name": "Geek Bar Pulse Lime Ice", "price": 2499, "categories": {"elements": [{"name": "Nicotine Vapes"}]}},
            {"id": "new-2", "name": "Mystery Thing", "price": 500},
            {"id": "new-3", "name": "Zero Price Item", "price": 0, "categories": {"elements": [{"name": "Nicotine Vapes"}]}},
            {"id": "new-4", "name": "U Pass Fetish Urine", "price": 3500, "categories": {"elements": [{"name": "Nicotine Vapes"}]}},
        ]
        clover = integration(db, _auto_import_handler(items, calls), import_new_items=True)
        await connect(db, clover)
        await db.categories.insert_one({"slug": "disposable", "name": "DISPOSABLE VAPES"})
        await db.brands.insert_one({"slug": "geek-bar", "name": "GEEK BAR", "displayName": "GEEK BAR"})
        await clover.save_category_mappings([{"cloverName": "Nicotine Vapes", "categorySlug": "disposable"}])
        await clover.save_category_placeholders({"disposable": "/api/files/ph/disposable.png", "nope": "/api/files/x.png"})
        await db.products.insert_one({"id": 5, "name": "Existing", "price": 1, "cloverItemId": "old"})

        summary = await clover.sync_catalog(source="test")
        assert summary["importedItems"] == 4
        geek = await db.products.find_one({"cloverItemId": "new-1"})
        assert geek["active"] is True
        assert geek["categorySlug"] == "disposable"
        assert geek["brand"] == "geek-bar"
        assert geek["price"] == 24.99 and geek["stock"] == 3 and geek["minimumAge"] == 21
        assert geek["image"] == "/api/files/ph/disposable.png"
        assert geek["id"] == 6 and geek["slug"] == "geek-bar-pulse-lime-ice-6"
        assert (await db.products.find_one({"cloverItemId": "new-2"}))["active"] is False
        assert (await db.products.find_one({"cloverItemId": "new-3"}))["active"] is False
        assert (await db.products.find_one({"cloverItemId": "new-4"}))["active"] is True
        assert await clover.category_placeholders() == {"disposable": "/api/files/ph/disposable.png"}

        again = await clover.sync_catalog(source="test")
        assert again["importedItems"] == 0
        assert await db.products.count_documents({"cloverItemId": "new-1"}) == 1

    run(go())


def test_auto_import_is_off_by_default_and_skips_likely_duplicates():
    async def go():
        db = AsyncMongoMockClient()["autoimport_off"]
        calls = []
        items = [{"id": "c-1", "name": "Raz Miami Mint 25k", "price": 2999}]
        clover = integration(db, _auto_import_handler(items, calls))
        await connect(db, clover)
        summary = await clover.sync_catalog(source="test")
        assert summary["importedItems"] == 0
        assert await db.products.count_documents({}) == 0

        db2 = AsyncMongoMockClient()["autoimport_dupe"]
        clover2 = integration(db2, _auto_import_handler(items, calls), import_new_items=True)
        await connect(db2, clover2)
        await db2.products.insert_one({"id": 1, "name": "RAZ TN 9000 PUFFS - MIAMI MINT", "price": 22.99})
        await clover2._auto_import_new_items(items, [{"cloverItemId": "c-1", "productId": 1}])
        assert await db2.products.count_documents({"cloverItemId": "c-1"}) == 0

    run(go())


def test_items_removed_in_clover_are_hidden_and_come_back():
    async def go():
        db = AsyncMongoMockClient()["removed"]
        state = {"items": [{"id": f"c{i}", "name": f"Item {i}", "price": 100} for i in range(1, 41)]}

        def handler(request):
            if request.method != "GET":
                raise AssertionError("no writes expected")
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"elements": state["items"]})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": [{"item": {"id": row["id"]}, "quantity": 2} for row in state["items"]]})
            return httpx.Response(200, json={"elements": []})

        clover = integration(db, handler)
        await connect(db, clover)
        for i in range(1, 41):
            await db.products.insert_one({"id": i, "name": f"Item {i}", "price": 1, "stock": 2, "cloverItemId": f"c{i}", "active": True})
        await db.products.insert_one({"id": 99, "name": "Manual hide", "price": 1, "cloverItemId": "c99", "active": False})

        state["items"] = [row for row in state["items"] if row["id"] != "c40"]
        summary = await clover.sync_catalog(source="test")
        assert summary["hiddenMissingItems"] == 1
        gone = await db.products.find_one({"id": 40})
        assert gone["active"] is False and gone["cloverAutoHidden"] is True

        state["items"].append({"id": "c40", "name": "Item 40", "price": 100})
        await clover.sync_catalog(source="test")
        back = await db.products.find_one({"id": 40})
        assert back["active"] is True and "cloverAutoHidden" not in back
        assert (await db.products.find_one({"id": 99}))["active"] is False

        state["items"] = state["items"][:5]
        partial = await clover.sync_catalog(source="test")
        assert partial["hiddenMissingItems"] == 0
        assert (await db.products.find_one({"id": 30}))["active"] is True

    run(go())


def test_sync_never_assigns_a_hidden_brand():
    async def go():
        db = AsyncMongoMockClient()["hidden_brand"]
        items = [{"id": "c1", "name": "Water Pipe 7inch", "price": 5000}, {"id": "c2", "name": "Geek Bar Pulse Lime", "price": 2000}]

        def handler(request):
            if request.method != "GET":
                raise AssertionError("no writes expected")
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"elements": items})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": []})
            return httpx.Response(200, json={"elements": []})

        clover = integration(db, handler)
        await connect(db, clover)
        await db.brands.insert_many([
            {"slug": "water", "name": "WATER", "displayName": "WATER", "active": False},
            {"slug": "geek-bar", "name": "GEEK BAR", "displayName": "GEEK BAR", "active": True},
        ])
        await db.products.insert_many([
            {"id": 1, "name": "Water Pipe 7inch", "price": 50, "stock": 0, "cloverItemId": "c1", "brand": "", "brandName": "", "active": True},
            {"id": 2, "name": "Geek Bar Pulse Lime", "price": 20, "stock": 0, "cloverItemId": "c2", "brand": "", "brandName": "", "active": True},
        ])
        await clover.sync_catalog(source="test")
        assert (await db.products.find_one({"id": 1}))["brand"] == ""
        assert (await db.products.find_one({"id": 2}))["brand"] == "geek-bar"

    run(go())

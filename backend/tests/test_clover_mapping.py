"""Category and brand mapping for Clover imports. No live Clover calls."""
import asyncio
import json

import httpx
from mongomock_motor import AsyncMongoMockClient

from clover import CloverError, CloverIntegration
from clover_mapping import classify_item, seed_category_mappings

CATEGORIES = [
    {"slug": "disposable", "name": "DISPOSABLE VAPES"},
    {"slug": "delta-edibles", "name": "DELTA EDIBLES"},
    {"slug": "hookah-accessories", "name": "HOOKAH ACCESSORIES"},
    {"slug": "glass-pipes", "name": "GLASS PIPES"},
    {"slug": "kratom", "name": "KRATOM"},
    {"slug": "cigars", "name": "CIGARS"},
]
BRANDS = [
    {"slug": "geek", "name": "GEEK", "displayName": "GEEK"},
    {"slug": "geek-bar", "name": "GEEK BAR", "displayName": "GEEK BAR"},
    {"slug": "raz", "name": "RAZ", "displayName": "RAZ"},
]


def test_seed_uses_only_existing_categories_and_is_case_insensitive():
    seeded = seed_category_mappings(row["slug"] for row in CATEGORIES)
    slugs = {row["categorySlug"] for row in seeded}
    assert "cbd" not in slugs
    assert "disposable" in slugs
    assert "hookah-accessories" in slugs
    mapping = seeded
    matched = classify_item(
        {"name": "Mint bar", "categories": {"elements": [{"name": "disposable vapes"}]}},
        mapping, CATEGORIES, BRANDS,
    )
    assert matched["mappedCategorySlug"] == "disposable"
    assert matched["confidence"] == "high"
    assert matched["needsReview"] is False


def test_keyword_fallback_is_low_confidence_and_does_not_invent_cbd():
    mapping = seed_category_mappings(row["slug"] for row in CATEGORIES)
    hookah = classify_item({"name": "Premium hookah hose", "categories": {"elements": [{"name": "Widgets"}]}}, mapping, CATEGORIES, BRANDS)
    assert hookah["mappedCategorySlug"] == "hookah-accessories"
    assert hookah["confidence"] == "low"
    assert hookah["needsReview"] is True
    cbd = classify_item({"name": "CBD gummies", "categories": []}, mapping, CATEGORIES, BRANDS)
    assert cbd["mappedCategorySlug"] == "delta-edibles"
    assert "cbd" not in {row["categorySlug"] for row in mapping}


def test_brand_match_prefers_the_longest_name():
    mapping = seed_category_mappings(["disposable"])
    geek = classify_item({"name": "GEEK BAR Pulse Blue", "categories": {"elements": [{"name": "Disposable Vapes"}]}}, mapping, CATEGORIES, BRANDS)
    assert geek["mappedBrandSlug"] == "geek-bar"
    assert geek["mappedBrandName"] == "GEEK BAR"
    razzle = classify_item({"name": "Razzle dazzle", "categories": []}, mapping, CATEGORIES, BRANDS)
    assert razzle["mappedBrandSlug"] == ""


def run(coro):
    return asyncio.run(coro)


def test_sync_fills_empty_category_only_and_import_stays_hidden():
    async def go():
        db = AsyncMongoMockClient()["clover_mapping_sync"]
        seen = []

        def handler(request):
            seen.append((request.url.path, request.url.params.get("expand")))
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"elements": [
                    {"id": "item-1", "name": "GEEK BAR Pulse", "sku": "GB1", "code": "001", "price": 1999,
                     "categories": {"elements": [{"id": "c1", "name": "Disposable Vapes"}]}},
                    {"id": "item-2", "name": "House hookah hose", "sku": "HK1", "code": "002", "price": 999,
                     "categories": {"elements": [{"name": "Unknown"}]}},
                    {"id": "item-3", "name": "Travel hookah hose", "sku": "NEW3", "code": "003", "price": 500,
                     "categories": {"elements": [{"name": "Widgets"}]}},
                ]})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": [
                    {"item": {"id": "item-1"}, "quantity": 5},
                    {"item": {"id": "item-2"}, "quantity": 2},
                    {"item": {"id": "item-3"}, "quantity": 1},
                ]})
            raise AssertionError(request.url.path)

        transport = httpx.MockTransport(handler)
        clover = CloverIntegration(
            db, client_id="app", client_secret="secret",
            jwt_secret="test-secret-that-is-at-least-thirty-two-bytes-long",
            environment="sandbox", redirect_uri="https://api.example.com/api/clover/oauth/callback",
            site_url="https://example.com", sync_enabled=False,
            http_client_factory=lambda **kwargs: httpx.AsyncClient(transport=transport, **kwargs),
        )
        await db.integrations.insert_one({"key": "clover", "merchantId": "merchant-1", "encryptedAccessToken": clover.encrypt("access-token"), "encryptedRefreshToken": clover.encrypt("refresh-token")})
        await db.categories.insert_many(CATEGORIES)
        await db.brands.insert_many(BRANDS)
        await db.products.insert_one({
            "id": 1, "name": "Already set", "sku": "GB1", "barcode": "", "price": 10, "stock": 1,
            "categorySlug": "kratom", "category": "KRATOM", "brand": "raz", "brandName": "RAZ",
            "active": True, "minimumAge": 21,
        })

        preview = await clover.sync_catalog(source="admin")
        kept = await db.products.find_one({"id": 1})
        assert preview["applied"] is False
        assert kept["categorySlug"] == "kratom" and kept["brand"] == "raz"
        assert seen[0][1] == "categories,tags"
        review = {row["id"]: row for row in preview["reviewItems"]}
        assert "item-1" not in review
        assert review["item-2"]["mappedCategorySlug"] == "hookah-accessories"
        assert review["item-2"]["needsReview"] is True

        clover.sync_enabled = True
        await clover.sync_catalog(source="admin")
        kept = await db.products.find_one({"id": 1})
        assert kept["categorySlug"] == "kratom" and kept["brandName"] == "RAZ"
        assert kept["stock"] == 5 and kept["active"] is True and kept["minimumAge"] == 21

        await db.products.insert_one({"id": 2, "name": "Empty fields", "sku": "HK1", "price": 3, "stock": 0, "categorySlug": "", "brand": "", "brandName": "", "active": True, "minimumAge": 21})
        await clover.sync_from_clover(source="test", include_prices=True)
        filled = await db.products.find_one({"id": 2})
        assert filled["categorySlug"] == "hookah-accessories"
        assert filled["active"] is True

        imported = await clover.import_item("item-3", {
            "id": 9, "slug": "draft-9", "category": "Clover imports", "categorySlug": "clover-imports",
            "brand": "", "brandName": "", "minimumAge": 21, "active": True,
        })
        assert imported["active"] is False
        assert imported["minimumAge"] == 21
        assert imported["categorySlug"] == "hookah-accessories"
        assert imported["cloverNeedsReview"] is True
        assert "clover-imports" != imported["categorySlug"]

        try:
            await clover.save_category_mappings([{"cloverName": "Nope", "categorySlug": "not-a-real-category"}])
        except CloverError as exc:
            assert "does not exist" in str(exc)
        else:
            raise AssertionError("unknown category should be rejected")
        saved = await clover.save_category_mappings([{"cloverName": "Shop Vapes", "categorySlug": "disposable"}])
        assert saved == [{"cloverName": "Shop Vapes", "categorySlug": "disposable"}]
        assert json.dumps(saved)

    run(go())

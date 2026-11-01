"""Live-shaped Clover payloads: mapped categories beat keywords."""
import asyncio

import httpx
from mongomock_motor import AsyncMongoMockClient

from clover import CloverIntegration
from clover_mapping import classify_item, seed_category_mappings


def run(coro):
    return asyncio.run(coro)


CATEGORIES = [
    {"slug": "disposable", "name": "DISPOSABLE VAPES"},
    {"slug": "delta", "name": "DELTA DISPOSABLES"},
    {"slug": "delta-cartridges", "name": "DELTA CARTRIDGES"},
    {"slug": "delta-edibles", "name": "DELTA EDIBLES"},
    {"slug": "delta-smokeables", "name": "DELTA SMOKEABLES"},
    {"slug": "e-liquids", "name": "PODS"},
    {"slug": "hemp-wraps", "name": "HEMP WRAPS"},
    {"slug": "paper-cones", "name": "PAPER & CONES"},
    {"slug": "cigars", "name": "CIGARS"},
    {"slug": "hookah-accessories", "name": "HOOKAH ACCESSORIES"},
    {"slug": "glass-pipes", "name": "GLASS PIPES"},
    {"slug": "lighter", "name": "LIGHTER"},
    {"slug": "kratom", "name": "KRATOM"},
    {"slug": "miscellaneous", "name": "MISCELLANEOUS"},
]


def test_examples_keep_the_mapped_category_and_do_not_use_keywords():
    mapping = seed_category_mappings(row["slug"] for row in CATEGORIES)
    examples = [
        ("Vip Boyz Cosmic Za 1g", "Flower", "delta-smokeables", "DELTA SMOKEABLES"),
        ("Geek Bar Pulse 2", "Nicotine Vapes", "disposable", "DISPOSABLE VAPES"),
        ("Budget Durban Gelato Disposable 1g", "THC-P Vapes", "delta", "DELTA DISPOSABLES"),
        ("Budget Pink Gummy Disposable 1g", "THC-P Vapes", "delta", "DELTA DISPOSABLES"),
    ]
    for name, clover_category, slug, label in examples:
        item = {"id": name, "name": name, "categories": {"elements": [{"id": "cat", "name": clover_category}]}}
        result = classify_item(item, mapping, CATEGORIES, [])
        assert result["cloverCategories"] == [clover_category]
        assert result["mappedCategorySlug"] == slug
        assert result["mappedCategoryName"] == label
        assert result["needsReview"] is False
        assert result["confidence"] == "high"


def test_saved_old_mappings_gain_the_real_clover_names_once():
    async def go():
        db = AsyncMongoMockClient()["clover_mapping_migration"]

        def handler(request):
            if request.url.path.endswith("/items"):
                return httpx.Response(200, json={"elements": [
                    {"id": "flower-1", "name": "Vip Boyz Cosmic Za 1g", "sku": "VZ1", "price": 1000,
                     "categories": {"elements": [{"id": "cat-flower"}]}},
                    {"id": "thc-1", "name": "Budget Pink Gummy Disposable 1g", "sku": "BG1", "price": 1500,
                     "categories": {"elements": [{"id": "cat-thc"}]}},
                ]})
            if request.url.path.endswith("/item_stocks"):
                return httpx.Response(200, json={"elements": []})
            if request.url.path.endswith("/categories"):
                return httpx.Response(200, json={"elements": [
                    {"id": "cat-flower", "name": "Flower"},
                    {"id": "cat-thc", "name": "THC-P Vapes"},
                ]})
            if request.url.path.endswith("/category_items"):
                return httpx.Response(200, json={"elements": [
                    {"category": {"id": "cat-flower"}, "item": {"id": "flower-1"}},
                    {"category": {"id": "cat-thc"}, "item": {"id": "thc-1"}},
                ]})
            raise AssertionError(request.url.path)

        transport = httpx.MockTransport(handler)
        clover = CloverIntegration(
            db, client_id="app", client_secret="secret",
            jwt_secret="test-secret-that-is-at-least-thirty-two-bytes-long",
            environment="sandbox", redirect_uri="https://api.example.com/api/clover/oauth/callback",
            site_url="https://example.com",
            http_client_factory=lambda **kwargs: httpx.AsyncClient(transport=transport, **kwargs),
        )
        await db.integrations.insert_one({
            "key": "clover", "merchantId": "merchant-1",
            "encryptedAccessToken": clover.encrypt("token"),
            "encryptedRefreshToken": clover.encrypt("refresh"),
            "categoryMappings": [
                {"cloverName": "Disposables", "categorySlug": "disposable"},
                {"cloverName": "Vapes", "categorySlug": "disposable"},
            ],
        })
        await db.categories.insert_many(CATEGORIES)
        plan = await clover.sync_catalog(source="admin")
        saved = await db.integrations.find_one({"key": "clover"})
        names = {row["cloverName"] for row in saved["categoryMappings"]}
        assert "Flower" in names and "Nicotine Vapes" in names and "THC-P Vapes" in names
        assert any(row.get("keywordSplit") and row["cloverName"] == "Tobacco" for row in saved["categoryMappings"])
        assert saved["categoryMappingsMigrated"] is True
        rows = {row["name"]: row for row in plan["previewItems"]}
        assert rows["Vip Boyz Cosmic Za 1g"]["mappedCategoryName"] == "DELTA SMOKEABLES"
        assert rows["Vip Boyz Cosmic Za 1g"]["needsReview"] is False
        assert rows["Budget Pink Gummy Disposable 1g"]["mappedCategoryName"] == "DELTA DISPOSABLES"
        assert rows["Budget Pink Gummy Disposable 1g"]["needsReview"] is False
        assert plan["previewTotal"] == 2

    run(go())

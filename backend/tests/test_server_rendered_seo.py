"""Regression checks for SEO metadata returned in the first HTML response."""

import asyncio
import os

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "seo_test")
os.environ.setdefault("JWT_SECRET", "12345678901234567890123456789012")

import server


def test_static_and_private_route_metadata():
    home = asyncio.run(server._seo_meta_for_path(""))
    private = asyncio.run(server._seo_meta_for_path("admin/orders"))

    assert home["title"].startswith("HD Smoke Shop")
    assert home["canonical"] == "https://puff2door.com/"
    assert home["robots"].startswith("index")
    assert private["robots"] == "noindex, nofollow"


def test_catalog_route_metadata(monkeypatch):
    async def fake_categories():
        return [{"slug": "disposable-vapes", "name": "DISPOSABLE VAPES", "active": True}]

    async def fake_brands():
        return {"geek-bar": {"name": "Geek Bar", "displayName": "Geek Bar", "active": True}}

    class Products:
        async def find_one(self, query):
            if query.get("slug") != "geek-bar-pulse":
                return None
            return {
                "slug": "geek-bar-pulse",
                "name": "Geek Bar Pulse",
                "brandName": "Geek Bar",
                "category": "DISPOSABLE VAPES",
                "categorySlug": "disposable-vapes",
                "price": 19.99,
                "stock": 4,
                "image": "/api/files/pulse.webp",
                "sku": "GBP-1",
                "active": True,
            }

    class FakeDB:
        products = Products()

    monkeypatch.setattr(server, "get_categories", fake_categories)
    monkeypatch.setattr(server, "get_brand_map", fake_brands)
    monkeypatch.setattr(server, "db", FakeDB())

    category = asyncio.run(server._seo_meta_for_path("product-category/disposable-vapes"))
    brand = asyncio.run(server._seo_meta_for_path("brand/geek-bar"))
    product = asyncio.run(server._seo_meta_for_path("shop/geek-bar-pulse"))

    assert category["title"] == "Disposable Vapes – Shop Online or In Store | HD Smoke Shop"
    assert brand["title"].startswith("Geek Bar")
    assert product["canonical"].endswith("/shop/geek-bar-pulse")
    assert product["jsonLd"][0]["@type"] == "Product"


def test_html_injection_replaces_stale_brand_and_adds_social_metadata():
    source = (
        '<!doctype html><html><head><title>Emergent | Fullstack App - Puff2door</title>'
        '<meta name="description" content="old"><meta name="robots" content="index">'
        '<meta property="og:type" content="website"><meta property="og:title" content="old">'
        '<meta property="og:description" content="old"><meta property="og:image" content="old">'
        '<meta property="og:url" content="old"><meta name="twitter:card" content="summary_large_image">'
        '<link rel="canonical" href="old"></head><body></body></html>'
    )
    meta = {
        "title": "Geek Bar Pulse | HD Smoke Shop",
        "description": "Product description.",
        "canonical": "https://puff2door.com/shop/geek-bar-pulse",
        "robots": "index, follow, max-image-preview:large",
        "type": "product",
        "image": "https://puff2door.com/api/files/pulse.webp",
        "jsonLd": [{"@context": "https://schema.org", "@type": "Product", "name": "Geek Bar Pulse"}],
    }

    output = server._seo_inject_html(source, meta)

    assert "Emergent" not in output
    assert "Puff2door</title>" not in output
    assert "<title>Geek Bar Pulse | HD Smoke Shop</title>" in output
    assert 'rel="canonical" href="https://puff2door.com/shop/geek-bar-pulse"' in output
    assert 'name="twitter:title" content="Geek Bar Pulse | HD Smoke Shop"' in output
    assert 'data-seo-ld="page"' in output

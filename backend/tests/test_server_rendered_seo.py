"""Regression checks for SEO metadata returned in the first HTML response."""

import asyncio
import os

from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "seo_test")
os.environ.setdefault("JWT_SECRET", "12345678901234567890123456789012")

import server


def _request(host):
    return Request({
        "type": "http",
        "method": "GET",
        "scheme": "https",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [(b"host", host.encode())],
        "client": ("127.0.0.1", 1234),
        "server": (host, 443),
    })


def test_render_html_is_noindex_but_primary_domain_and_api_are_not():
    async def html_response(_request):
        return HTMLResponse("<html></html>")

    async def json_response(_request):
        return JSONResponse({"ok": True})

    render_html = asyncio.run(server.security_headers(_request("puff2door.onrender.com"), html_response))
    primary_html = asyncio.run(server.security_headers(_request("puff2door.com"), html_response))
    render_api = asyncio.run(server.security_headers(_request("puff2door.onrender.com"), json_response))

    assert render_html.headers["X-Robots-Tag"] == "noindex, nofollow"
    assert "X-Robots-Tag" not in primary_html.headers
    assert "X-Robots-Tag" not in render_api.headers


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
            requested_slugs = {
                clause.get("slug") or clause.get("legacySlugs")
                for clause in query.get("$or", [])
            }
            if "geek-bar-pulse" not in requested_slugs:
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
    monkeypatch.setattr(server, "_settings_cache", {"pickupEnabled": True})

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

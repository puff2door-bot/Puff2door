"""Iteration 8: catalog brand-slug backfill + sitemap (114 URLs / 35 brands) validation."""
import json
import os
import re
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}

EXPECTED_BRANDS = {
    "APEX", "BANGBANG", "BLACK SHEEP", "BOUTIQ", "CAKE", "CKARATS", "DANKLEAF",
    "FIERY CUBES", "FLYING HORSE", "FLYING MONKEY", "FOGER", "GEEK BAR",
    "GLASS TOBACCO PIPE", "HC8", "MAGIC TRIP", "MEADOW", "MELLOW FELLOW",
    "MINTS", "MODUS", "MUHA", "NEXA", "NUGG LIFE", "PRSNLS", "PURE GRAM",
    "PURE ZEN", "RAZ", "RED DEVIL", "RED DRAGON", "RED TRIANGLE", "SILLY DOTS",
    "SMOGGER", "TWENTY ONE", "UNIVERSITY", "VENOM", "WILD HEMP",
}


@pytest.fixture(scope="module")
def products():
    r = requests.get(f"{BASE}/api/products", timeout=60)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert "products" in data
    return data["products"]


@pytest.fixture(scope="module")
def seed():
    return json.loads(Path("/app/backend/seed_products.json").read_text())


# ---------------- Products / brand slugs ----------------
class TestProducts:
    def test_count_67(self, products):
        assert len(products) == 67, len(products)

    def test_every_product_has_brand_slug(self, products):
        missing = [p["id"] for p in products if not (p.get("brand") or "").strip()]
        assert not missing, f"products without brand slug: {missing}"

    def test_brand_slug_format(self, products):
        bad = [(p["id"], p["brand"]) for p in products if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", p["brand"])]
        assert not bad, bad

    def test_35_distinct_brands(self, products):
        slugs = {p["brand"] for p in products}
        assert len(slugs) == 35, sorted(slugs)

    def test_brand_names_match_expected(self, products):
        names = {(p.get("brandName") or p["brand"]).upper() for p in products}
        assert names == EXPECTED_BRANDS, (names - EXPECTED_BRANDS, EXPECTED_BRANDS - names)

    def test_7_distinct_categories(self, products):
        cats = {p["categorySlug"] for p in products}
        assert len(cats) == 7, sorted(cats)

    def test_report_counts(self, products):
        cat = Counter(p["categorySlug"] for p in products)
        brand = Counter((p["brand"], p.get("brandName")) for p in products)
        print("\n=== PRODUCTS PER CATEGORY ===")
        for k, v in sorted(cat.items()):
            print(f"{k}: {v}")
        print("=== PRODUCTS PER BRAND ===")
        for (slug, name), v in sorted(brand.items()):
            print(f"{slug} ({name}): {v}")
        assert sum(cat.values()) == 67

    @pytest.mark.parametrize("pid", [1, 14, 62])
    def test_sample_products_identity_unmodified(self, products, seed, pid):
        """name/slug/category/image/brandName must match the seed file (identity fields untouched by the fix).
        price/stock/description are excluded: pre-existing admin-edit drift on ids 1,2,14,15,16 (see report)."""
        api_p = next(p for p in products if p["id"] == pid)
        seed_p = next(p for p in seed if p["id"] == pid)
        for f in ["name", "slug", "category", "categorySlug", "image", "brandName"]:
            assert api_p[f] == seed_p.get(f, ""), f"{f}: {api_p[f]!r} != {seed_p.get(f)!r}"
        assert api_p["inStock"] == (api_p["stock"] > 0)

    def test_identity_fields_match_seed_for_all(self, products, seed):
        seed_by_id = {p["id"]: p for p in seed}
        diffs = []
        for p in products:
            s = seed_by_id.get(p["id"])
            assert s, f"product {p['id']} not in seed"
            for f in ["name", "slug", "category", "categorySlug", "image", "brandName"]:
                if p[f] != s.get(f, ""):
                    diffs.append((p["id"], f, s.get(f), p[f]))
        assert not diffs, diffs

    def test_no_mongo_id_leak(self, products):
        assert not any("_id" in p for p in products)


# ---------------- Sitemap ----------------
def _urls(xml):
    root = ET.fromstring(xml)
    assert root.tag.endswith("urlset")
    urls = root.findall("s:url", NS)
    out = []
    for u in urls:
        loc = u.find("s:loc", NS)
        lm = u.find("s:lastmod", NS)
        assert loc is not None and loc.text
        assert lm is not None and re.fullmatch(r"\d{4}-\d{2}-\d{2}", lm.text or "")
        out.append(loc.text)
    return out


@pytest.mark.parametrize("path", ["/sitemap.xml", "/api/sitemap.xml"])
class TestSitemap:
    def test_sitemap(self, path, products):
        r = requests.get(f"{BASE}{path}", timeout=60)
        assert r.status_code == 200, r.status_code
        assert "xml" in r.headers.get("content-type", "").lower(), r.headers.get("content-type")
        locs = _urls(r.text)
        assert len(locs) == 114, len(locs)
        assert len(set(locs)) == 114
        assert all(l.startswith("https://puff2door.com/") for l in locs)
        assert "image:" not in r.text and "<image" not in r.text
        paths = [l.replace("https://puff2door.com", "") for l in locs]
        brands = [p for p in paths if p.startswith("/brand/")]
        cats = [p for p in paths if p.startswith("/product-category/")]
        shop = [p for p in paths if p.startswith("/shop/")]
        assert len(brands) == 35, len(brands)
        assert len(cats) == 7, len(cats)
        assert len(shop) == 67, len(shop)
        for b in ["/brand/muha", "/brand/twenty-one", "/brand/glass-tobacco-pipe"]:
            assert b in brands, b
        for p in paths:
            assert not re.search(r"/(cart|checkout|admin|my-account|account|wishlist|track|order)\b", p), p
            assert "?" not in p
        # brand slugs in sitemap match product brand slugs
        assert {b.split("/brand/")[1] for b in brands} == {p["brand"] for p in products}


def test_robots():
    r = requests.get(f"{BASE}/robots.txt", timeout=30)
    assert r.status_code == 200
    assert "Sitemap: https://puff2door.com/sitemap.xml" in r.text


def test_static_and_api_sitemap_identical():
    a = requests.get(f"{BASE}/sitemap.xml", timeout=60).text
    b = requests.get(f"{BASE}/api/sitemap.xml", timeout=60).text
    assert set(_urls(a)) == set(_urls(b))

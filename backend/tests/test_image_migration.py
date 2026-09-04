"""Tests for product image migration to local storage + brand logo import (iteration 11)."""
import json
import os
import re
import time
from io import BytesIO
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

CREDS = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
ADMIN_EMAIL = re.search(r"Email: `([^`]+)` / Password: `([^`]+)`", CREDS).group(1)
ADMIN_PASSWORD = re.search(r"Email: `([^`]+)` / Password: `([^`]+)`", CREDS).group(2)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin(client):
    r = client.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token, "no token in login response"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def products(client):
    r = client.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    return data["products"] if isinstance(data, dict) else data


# ---- Module: products / migrated images ----
class TestProductImages:
    def test_product_count(self, products):
        assert len(products) == 67, f"expected 67 products, got {len(products)}"

    def test_all_images_local(self, products):
        bad = []
        for p in products:
            for f in ("image", "image2"):
                v = p.get(f) or ""
                if v and not v.startswith("/api/files/"):
                    bad.append((p["id"], f, v))
                if "nonaonlinesmokeshop" in v:
                    bad.append((p["id"], f, v))
        assert not bad, f"non-local images: {bad[:10]}"

    def test_five_images_fetchable(self, client, products):
        from PIL import Image
        picks = [products[i] for i in (0, 13, 30, 45, 66)]
        for p in picks:
            url = f"{BASE_URL}{p['image']}"
            r = client.get(url)
            assert r.status_code == 200, f"{url} -> {r.status_code}"
            ct = r.headers.get("content-type", "")
            assert ct.startswith("image/"), f"{url} content-type {ct}"
            assert len(r.content) > 500, f"{url} tiny body {len(r.content)}"
            im = Image.open(BytesIO(r.content))
            assert im.width > 0 and max(im.size) <= 1200, f"{url} size {im.size}"

    def test_product_fields_match_seed(self, products):
        seed = json.loads(Path("/app/backend/seed_products.json").read_text())
        seed_by_id = {str(s["id"]): s for s in seed}
        drift_allowed = {"1", "2", "14", "15", "16"}
        diffs = []
        for p in products:
            s = seed_by_id.get(str(p["id"]))
            if not s or str(p["id"]) in drift_allowed:
                continue
            for f in ("name", "price", "stock", "description"):
                if f in s and p.get(f) != s.get(f):
                    diffs.append((p["id"], f, s.get(f), p.get(f)))
        assert not diffs, f"unexpected product drift: {diffs[:10]}"


# ---- Module: admin migration endpoints ----
class TestMigrationEndpoints:
    def test_status_unauthenticated(self, client):
        r = client.get(f"{BASE_URL}/api/admin/products/migrate-images/status")
        assert r.status_code in (401, 403), f"got {r.status_code}"

    def test_status_migrated_state(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/products/migrate-images/status")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["running"] is False
        assert d["externalRemaining"] == 0, d
        assert d["products"] == 67, d
        assert d["failed"] == [], d["failed"]
        assert d.get("migrated") == 82, f"migrated={d.get('migrated')} (in-memory counter)"

    def test_start_migration_when_nothing_external(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/products/migrate-images", json={})
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("started") is True
        time.sleep(3)
        s = admin.get(f"{BASE_URL}/api/admin/products/migrate-images/status").json()
        assert s["running"] is False, s
        assert s["total"] == 0, s
        assert s["externalRemaining"] == 0, s
        assert s["failed"] == [], s


# ---- Module: brand logos ----
EXPECTED_BRANDS = {"apex", "geek-bar", "mellow-fellow", "modus", "raz", "red-devil"}


class TestBrands:
    def test_six_brands_local_and_fetchable(self, client):
        r = client.get(f"{BASE_URL}/api/brands")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        brands = data["brands"] if isinstance(data, dict) else data
        slugs = {b["slug"] for b in brands}
        assert slugs == EXPECTED_BRANDS, slugs
        for b in brands:
            assert b["image"].startswith("/api/files/"), b
            ir = client.get(f"{BASE_URL}{b['image']}")
            assert ir.status_code == 200, f"{b['slug']} image {ir.status_code}"
            assert ir.headers.get("content-type", "").startswith("image/")

    def test_import_brand_logo_lifecycle(self, admin, client):
        try:
            r = admin.post(f"{BASE_URL}/api/admin/brands/testbrand/import",
                           json={"image": "https://puff2door.com/img/logo.png", "name": "TESTBRAND"})
            assert r.status_code == 200, r.text[:300]
            d = r.json()
            assert d["image"].startswith("/api/files/"), d
            assert d["slug"] == "testbrand"
            lst = client.get(f"{BASE_URL}/api/brands").json()
            brands = lst["brands"] if isinstance(lst, dict) else lst
            assert len(brands) == 7, len(brands)
            imported = [b for b in brands if b["slug"] == "testbrand"][0]
            assert imported["image"] == d["image"]
            ir = client.get(f"{BASE_URL}{imported['image']}")
            assert ir.status_code == 200 and ir.headers.get("content-type", "").startswith("image/")

            bad = admin.post(f"{BASE_URL}/api/admin/brands/testbrand2/import",
                             json={"image": "not-a-url", "name": "BAD"})
            assert bad.status_code == 400, f"{bad.status_code} {bad.text[:200]}"
        finally:
            dr = admin.delete(f"{BASE_URL}/api/admin/brands/testbrand")
            assert dr.status_code in (200, 204)
            admin.delete(f"{BASE_URL}/api/admin/brands/testbrand2")
        lst = client.get(f"{BASE_URL}/api/brands").json()
        brands = lst["brands"] if isinstance(lst, dict) else lst
        assert {b["slug"] for b in brands} == EXPECTED_BRANDS

    def test_import_unauthenticated(self, client):
        r = client.post(f"{BASE_URL}/api/admin/brands/nope/import",
                        json={"image": "https://puff2door.com/img/logo.png", "name": "N"})
        assert r.status_code in (401, 403)


# ---- Module: regression (sitemap / robots) ----
class TestRegression:
    def test_sitemap(self, client):
        r = client.get(f"{BASE_URL}/sitemap.xml")
        assert r.status_code == 200, r.status_code
        assert r.text.count("<loc>") == 115, r.text.count("<loc>")

    def test_robots(self, client):
        r = client.get(f"{BASE_URL}/robots.txt")
        assert r.status_code == 200
        assert "Sitemap:" in r.text

    def test_product_detail(self, client):
        r = client.get(f"{BASE_URL}/api/products/geek-bar-pulse-2-25k-grape-hubba-14")
        assert r.status_code == 200, r.text[:200]
        p = r.json()
        assert (p.get("product") or p)["image"].startswith("/api/files/")

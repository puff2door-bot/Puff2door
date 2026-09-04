"""Brand Management (centralized `brands` collection) — public + admin API tests."""
import json
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@puff2door.com"
ADMIN_PASSWORD = "Puff2Door-Admin1"
LOGO_BRANDS = {"apex", "geek-bar", "mellow-fellow", "modus", "raz", "red-devil"}
DRIFT_IDS = {"1", "2", "14", "15", "16", 1, 2, 14, 15, 16}


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin(client):
    r = client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text[:300]
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    return s


def products(client):
    r = client.get(f"{API}/products")
    assert r.status_code == 200
    d = r.json()
    return d["products"] if isinstance(d, dict) else d


def brands(client):
    r = client.get(f"{API}/brands")
    assert r.status_code == 200
    return r.json()["brands"]


# ---------- Public catalog ----------
class TestPublicCatalog:
    def test_products_have_brand_slugs(self, client):
        ps = products(client)
        assert len(ps) == 67, f"expected 67 products, got {len(ps)}"
        missing = [p["id"] for p in ps if not p.get("brand")]
        assert not missing, f"products with empty brand slug: {missing}"
        assert all(p.get("brandName") for p in ps), "some products missing brandName"
        assert len({p["brand"] for p in ps}) == 35

    def test_product_fields_unchanged_vs_seed(self, client):
        with open("/app/backend/seed_products.json") as f:
            seed = json.load(f)
        seed = seed["products"] if isinstance(seed, dict) else seed
        by_id = {str(p["id"]): p for p in products(client)}
        diffs = []
        for s in seed:
            sid = str(s["id"])
            if sid in DRIFT_IDS or sid not in by_id:
                continue
            cur = by_id[sid]
            for f in ("name", "price", "stock", "description", "slug", "categorySlug"):
                if f in s and str(s[f]) != str(cur.get(f)):
                    diffs.append((sid, f, s[f], cur.get(f)))
        assert not diffs, f"seed drift: {diffs[:10]}"

    def test_brands_endpoint(self, client):
        bs = brands(client)
        bs = [b for b in bs if b.get("productCount", 0) > 0]
        assert len(bs) == 35, f"expected 35 active brands, got {len(bs)}"
        for b in bs:
            for k in ("id", "slug", "name", "displayName", "logo", "active", "productCount"):
                assert k in b, f"{b.get('slug')} missing {k}"
            assert b["active"] is True
            assert "_id" not in b
        with_logo = {b["slug"] for b in bs if b.get("logo")}
        assert with_logo == LOGO_BRANDS, f"logo brands mismatch: {with_logo}"
        assert all(b["logo"].startswith("/api/files/") for b in bs if b["logo"])

    def test_all_product_brand_slugs_present(self, client):
        slugs = {b["slug"] for b in brands(client)}
        pslugs = {p["brand"] for p in products(client)}
        assert pslugs <= slugs, f"missing brands: {pslugs - slugs}"
        for s in ("muha", "twenty-one", "glass-tobacco-pipe", "raz"):
            assert s in slugs


# ---------- Admin brands ----------
class TestAdminBrands:
    def test_admin_list(self, admin):
        r = admin.get(f"{API}/admin/brands")
        assert r.status_code == 200
        bs = r.json()["brands"]
        bs = [b for b in bs if b.get("productCount", 0) > 0]
        assert len(bs) == 35
        assert all("productCount" in b for b in bs)

    def test_update_brand_keeps_slug_and_syncs_products(self, admin, client):
        r = admin.put(f"{API}/admin/brands/muha", json={
            "name": "MUHA", "displayName": "Muha Meds", "logo": "", "active": True})
        assert r.status_code == 200, r.text[:300]
        assert r.json()["slug"] == "muha"
        assert r.json()["displayName"] == "Muha Meds"
        muha = [p for p in products(client) if p["brand"] == "muha"]
        assert len(muha) == 7, f"expected 7 muha products, got {len(muha)}"
        assert all(p["brandName"] == "Muha Meds" for p in muha)
        pub = {b["slug"]: b for b in brands(client)}
        assert pub["muha"]["displayName"] == "Muha Meds"
        # restore
        r = admin.put(f"{API}/admin/brands/muha", json={
            "name": "MUHA", "displayName": "MUHA", "logo": "", "active": True})
        assert r.status_code == 200
        assert {b["slug"]: b for b in brands(client)}["muha"]["displayName"] == "MUHA"

    def test_create_duplicate_update_delete(self, admin):
        admin.delete(f"{API}/admin/brands/exotic-test")
        r = admin.post(f"{API}/admin/brands", json={"name": "Exotic Test"})
        assert r.status_code in (200, 201), r.text[:300]
        d = r.json()
        assert d["slug"] == "exotic-test"
        assert d["displayName"] == "Exotic Test"
        r2 = admin.post(f"{API}/admin/brands", json={"name": "Exotic Test"})
        assert r2.status_code == 409, f"expected 409, got {r2.status_code}"
        r3 = admin.put(f"{API}/admin/brands/exotic-test", json={
            "name": "Exotic Test", "displayName": "EXOTIC TEST", "logo": "", "active": False})
        assert r3.status_code == 200
        assert r3.json()["slug"] == "exotic-test"
        assert r3.json()["active"] is False
        r4 = admin.delete(f"{API}/admin/brands/exotic-test")
        assert r4.status_code in (200, 204)
        assert "exotic-test" not in {b["slug"] for b in admin.get(f"{API}/admin/brands").json()["brands"]}

    def test_delete_brand_in_use_400(self, admin):
        r = admin.delete(f"{API}/admin/brands/muha")
        assert r.status_code == 400, f"expected 400, got {r.status_code}"

    def test_import_invalid_url_400(self, admin):
        r = admin.post(f"{API}/admin/brands/raz/import", json={"image": "not-a-url"})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"

    def test_unauthenticated_blocked(self, client):
        assert client.post(f"{API}/admin/brands", json={"name": "Nope"}).status_code in (401, 403)
        assert client.put(f"{API}/admin/brands/raz", json={"name": "x", "displayName": "x"}).status_code in (401, 403)
        assert client.delete(f"{API}/admin/brands/raz").status_code in (401, 403)


# ---------- Product create with brand slug ----------
class TestProductBrandResolution:
    def test_create_product_with_brand_slug(self, admin):
        payload = {"name": "TEST_ Brand Slug Product", "price": 9.99, "brand": "raz",
                   "active": False, "stock": 1, "description": "TEST",
                   "category": "Vapes", "categorySlug": "vapes"}
        r = admin.post(f"{API}/admin/products", json=payload)
        assert r.status_code in (200, 201), r.text[:400]
        d = r.json()
        assert d["brand"] == "raz"
        assert d["brandName"] == "RAZ", d.get("brandName")
        pid = d["id"]
        dr = admin.delete(f"{API}/admin/products/{pid}")
        assert dr.status_code in (200, 204), dr.text[:200]


# ---------- SEO / regression ----------
class TestRegression:
    def test_sitemap(self, client):
        r = client.get(f"{BASE_URL}/sitemap.xml")
        assert r.status_code == 200
        locs = [x.split("</loc>")[0] for x in r.text.split("<loc>")[1:]]
        assert len(locs) == 115, f"expected 115 urls, got {len(locs)}"
        brand_urls = {u.split("/brand/")[1] for u in locs if "/brand/" in u}
        assert len(brand_urls) == 35, brand_urls

    def test_robots(self, client):
        r = client.get(f"{BASE_URL}/robots.txt")
        assert r.status_code == 200
        assert "Sitemap" in r.text

    def test_settings(self, client):
        r = client.get(f"{API}/settings")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_order_zelle(self, client):
        payload = {
            "items": [{"productId": 1, "name": "TEST_ item", "price": 25.0, "qty": 1}],
            "shipping": {"firstName": "TEST", "lastName": "QA", "email": "qa.brand@example.com",
                         "phone": "4075551234", "address": "1 Main St", "city": "Orlando",
                         "state": "FL", "zip": "32801"},
            "subtotal": 25.0, "total": 25.0, "paymentMethod": "zelle",
        }
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code in (200, 201), r.text[:400]
        assert r.json().get("orderNumber") or r.json().get("id")

"""Category Manager regression suite (iteration 13).

Covers:
- Public GET /api/categories (active, ordered, productCount)
- GET /api/products integrity (67 products)
- Admin category CRUD: list / create (+409) / reorder / update (slug immutable,
  renames products.category) / delete (400 when in use)
- Auth gating on admin category mutations
- sitemap.xml / robots.txt / POST /api/orders smoke
"""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

EXPECTED_FIRST_FIVE = ["disposable", "delta", "delta-cartridges", "delta-edibles", "delta-smokeables"]
EXPECTED_COUNTS = {
    "disposable": 13, "delta": 11, "delta-cartridges": 12, "delta-edibles": 12,
    "delta-smokeables": 11, "kratom": 2, "glass-pipes": 6,
}
EXPECTED_ZERO = ["vape-accessories", "hemp-wraps", "paper-cones", "lighter",
                 "air-freshner", "hookah-accessories", "miscellaneous"]


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def credentials():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing test_credentials.md")
    c = p.read_text(encoding="utf-8")
    m = re.search(r"Email:\s*`([^`]+)`\s*/\s*Password:\s*`([^`]+)`", c)
    if not m:
        pytest.skip("no admin creds found")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="session")
def admin_token(client, credentials):
    r = client.post(f"{API}/auth/login", json={"email": credentials["email"], "password": credentials["password"]})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("token") or r.json().get("access_token")
    if not tok:
        pytest.fail(f"no token in login response: {r.text[:300]}")
    return tok


@pytest.fixture(scope="session")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


def public_categories(client):
    r = client.get(f"{API}/categories")
    assert r.status_code == 200, r.text[:300]
    return r.json()["categories"]


# ---------- module: public categories ----------
class TestPublicCategories:
    def test_shape_and_order(self, client):
        cats = public_categories(client)
        assert len(cats) >= 14
        slugs = [c["slug"] for c in cats]
        assert slugs[:5] == EXPECTED_FIRST_FIVE, slugs[:8]
        orders = [c["order"] for c in cats]
        assert orders == sorted(orders), orders
        for c in cats:
            assert c["active"] is True
            assert "_id" not in c
            assert set(c) >= {"id", "slug", "name", "order", "active", "productCount"}
            assert isinstance(c["name"], str) and c["name"]

    def test_product_counts(self, client):
        cats = {c["slug"]: c for c in public_categories(client)}
        for slug, n in EXPECTED_COUNTS.items():
            assert slug in cats, f"{slug} missing from public categories"
            assert cats[slug]["productCount"] == n, f"{slug}: {cats[slug]['productCount']} != {n}"
        for slug in EXPECTED_ZERO:
            assert slug in cats, f"{slug} missing"
            assert cats[slug]["productCount"] == 0, f"{slug} count {cats[slug]['productCount']}"

    def test_default_names(self, client):
        cats = {c["slug"]: c["name"] for c in public_categories(client)}
        assert cats["disposable"] == "DISPOSABLE VAPES"
        assert cats["delta"] == "DELTA DISPOSABLES"
        assert cats["kratom"] == "KRATOM"
        assert cats["glass-pipes"] == "GLASS PIPES"

    def test_products_unchanged(self, client):
        r = client.get(f"{API}/products")
        assert r.status_code == 200
        prods = r.json()["products"]
        assert len(prods) == 67, len(prods)
        by_cat = {}
        for p in prods:
            assert p["categorySlug"]
            assert p["category"]
            assert isinstance(p["price"], (int, float)) and p["price"] > 0
            by_cat[p["categorySlug"]] = by_cat.get(p["categorySlug"], 0) + 1
        for slug, n in EXPECTED_COUNTS.items():
            assert by_cat.get(slug) == n, f"{slug}: {by_cat.get(slug)} != {n}"


# ---------- module: admin categories ----------
class TestAdminCategoryList:
    def test_admin_list_superset(self, client, admin):
        r = admin.get(f"{API}/admin/categories")
        assert r.status_code == 200, r.text[:300]
        cats = r.json()["categories"]
        pub = {c["slug"] for c in public_categories(client)}
        assert pub.issubset({c["slug"] for c in cats})
        orders = [c["order"] for c in cats]
        assert orders == sorted(orders)
        for c in cats:
            assert "_id" not in c

    def test_auth_required(self, client):
        assert client.post(f"{API}/admin/categories", json={"name": "TEST_ NoAuth"}).status_code in (401, 403)
        assert client.put(f"{API}/admin/categories/kratom", json={"name": "X", "active": True}).status_code in (401, 403)
        assert client.delete(f"{API}/admin/categories/kratom").status_code in (401, 403)
        assert client.get(f"{API}/admin/categories").status_code in (401, 403)
        assert client.put(f"{API}/admin/categories/reorder", json={"slugs": []}).status_code in (401, 403)


class TestCategoryRename:
    def test_rename_kratom_propagates_and_restores(self, client, admin):
        new_name = "Kratom & Botanicals"
        r = admin.put(f"{API}/admin/categories/kratom", json={"name": new_name, "active": True})
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body["slug"] == "kratom"
        assert body["name"] == new_name
        assert body["productCount"] == 2

        # products renamed
        prods = client.get(f"{API}/products").json()["products"]
        kratom = [p for p in prods if p["categorySlug"] == "kratom"]
        assert len(kratom) == 2
        assert all(p["category"] == new_name for p in kratom), [p["category"] for p in kratom]

        # public list reflects rename
        cats = {c["slug"]: c["name"] for c in public_categories(client)}
        assert cats["kratom"] == new_name

        # restore
        r2 = admin.put(f"{API}/admin/categories/kratom", json={"name": "KRATOM", "active": True})
        assert r2.status_code == 200
        assert r2.json()["name"] == "KRATOM"
        prods = client.get(f"{API}/products").json()["products"]
        assert all(p["category"] == "KRATOM" for p in prods if p["categorySlug"] == "kratom")
        assert {c["slug"]: c["name"] for c in public_categories(client)}["kratom"] == "KRATOM"

    def test_rename_unknown_slug_404(self, admin):
        r = admin.put(f"{API}/admin/categories/no-such-cat-xyz", json={"name": "X", "active": True})
        assert r.status_code == 404


class TestCategoryCreateReorderDelete:
    def test_full_lifecycle(self, client, admin):
        original_order = [c["slug"] for c in admin.get(f"{API}/admin/categories").json()["categories"]]

        # CREATE
        r = admin.post(f"{API}/admin/categories", json={"name": "Nicotine Pouches"})
        assert r.status_code == 200, r.text[:300]
        created = r.json()
        assert created["slug"] == "nicotine-pouches"
        assert created["name"] == "Nicotine Pouches"
        assert created["active"] is True
        assert created["productCount"] == 0

        try:
            admin_slugs = [c["slug"] for c in admin.get(f"{API}/admin/categories").json()["categories"]]
            assert admin_slugs[-1] == "nicotine-pouches", admin_slugs[-3:]
            assert [c["slug"] for c in public_categories(client)][-1] == "nicotine-pouches"

            # DUPLICATE
            dup = admin.post(f"{API}/admin/categories", json={"name": "Nicotine Pouches"})
            assert dup.status_code == 409, dup.status_code
            assert "already exists" in dup.json().get("detail", "")

            # blank name
            assert admin.post(f"{API}/admin/categories", json={"name": "   "}).status_code == 400

            # REORDER: move to first
            moved = ["nicotine-pouches"] + [s for s in admin_slugs if s != "nicotine-pouches"]
            rr = admin.put(f"{API}/admin/categories/reorder", json={"slugs": moved})
            assert rr.status_code == 200
            assert [c["slug"] for c in public_categories(client)][0] == "nicotine-pouches"

            # REORDER back
            back = [s for s in admin_slugs if s != "nicotine-pouches"] + ["nicotine-pouches"]
            assert admin.put(f"{API}/admin/categories/reorder", json={"slugs": back}).status_code == 200
            pub = [c["slug"] for c in public_categories(client)]
            assert pub[:5] == EXPECTED_FIRST_FIVE
            assert pub[-1] == "nicotine-pouches"

            # DEACTIVATE -> hidden publicly, visible in admin, slug unchanged
            up = admin.put(f"{API}/admin/categories/nicotine-pouches", json={"name": "Nicotine Pouches", "active": False})
            assert up.status_code == 200
            assert up.json()["slug"] == "nicotine-pouches"
            assert up.json()["active"] is False
            assert "nicotine-pouches" not in [c["slug"] for c in public_categories(client)]
            assert "nicotine-pouches" in [c["slug"] for c in admin.get(f"{API}/admin/categories").json()["categories"]]
        finally:
            d = admin.delete(f"{API}/admin/categories/nicotine-pouches")
            assert d.status_code == 200, d.text[:200]

        assert "nicotine-pouches" not in [c["slug"] for c in admin.get(f"{API}/admin/categories").json()["categories"]]

        # restore original order and verify
        assert admin.put(f"{API}/admin/categories/reorder", json={"slugs": original_order}).status_code == 200
        assert [c["slug"] for c in admin.get(f"{API}/admin/categories").json()["categories"]] == original_order

    def test_delete_in_use_400(self, admin):
        r = admin.delete(f"{API}/admin/categories/disposable")
        assert r.status_code == 400, r.status_code
        assert "product" in r.json().get("detail", "").lower()
        # still there
        assert "disposable" in [c["slug"] for c in admin.get(f"{API}/admin/categories").json()["categories"]]


# ---------- module: SEO + orders smoke ----------
class TestSeoAndOrders:
    def test_sitemap(self, client):
        r = client.get(f"{BASE_URL}/sitemap.xml")
        assert r.status_code == 200
        urls = re.findall(r"<loc>(.*?)</loc>", r.text)
        assert len(urls) == 115, len(urls)
        cat_urls = sorted(u.rsplit("/", 1)[-1] for u in urls if "/product-category/" in u)
        assert cat_urls == sorted(EXPECTED_COUNTS.keys()), cat_urls

    def test_robots(self, client):
        r = client.get(f"{BASE_URL}/robots.txt")
        assert r.status_code == 200
        assert "Sitemap" in r.text

    def test_order_zelle(self, client):
        payload = {
            "items": [{"productId": 1, "name": "TEST_ item", "price": 25.0, "qty": 1}],
            "shipping": {"firstName": "TEST", "lastName": "QA", "email": "qa.cat@example.com",
                         "phone": "4075551234", "address": "1 Main St", "city": "Orlando",
                         "state": "FL", "zip": "32801"},
            "subtotal": 25.0, "total": 25.0, "paymentMethod": "zelle",
        }
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert data.get("orderNumber") or data.get("id")

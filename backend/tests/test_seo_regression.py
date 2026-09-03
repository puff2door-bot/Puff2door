"""SEO + light regression tests (iteration 6): static SEO files, sitemap endpoint, core catalog/orders/admin."""
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def creds():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("no credentials file")
    c = p.read_text()
    m = re.search(r"Email:\s*`([^`]+)`\s*/\s*Password:\s*`([^`]+)`", c)
    if not m:
        pytest.skip("no admin creds")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="session")
def admin_token(api, creds):
    r = api.post(f"{BASE_URL}/api/auth/login", json=creds)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in {data}"
    assert data.get("user", {}).get("role") == "admin"
    return tok


# --- static SEO files ---
class TestStaticSeoFiles:
    def test_robots(self, api):
        r = api.get(f"{BASE_URL}/robots.txt")
        assert r.status_code == 200
        assert "text/plain" in r.headers.get("content-type", "")
        body = r.text
        for needle in ["Disallow: /admin", "Disallow: /cart", "Disallow: /checkout",
                       "Allow: /api/files/", "Sitemap: https://puff2door.com/sitemap.xml"]:
            assert needle in body, f"missing {needle}"
        # the puff2door block must not blanket-block crawlers
        p2d = body.split("# Puff2door")[-1]
        assert not any(line.strip() == "Disallow: /" for line in p2d.splitlines())

    @pytest.mark.parametrize("path", ["/sitemap.xml", "/api/sitemap.xml"])
    def test_sitemap(self, api, path):
        r = api.get(f"{BASE_URL}{path}")
        assert r.status_code == 200
        assert "xml" in r.headers.get("content-type", "")
        root = ET.fromstring(r.content)
        locs = [u.find("s:loc", NS).text for u in root.findall("s:url", NS)]
        assert len(locs) >= 80, len(locs)
        assert all(l.startswith("https://puff2door.com/") for l in locs)
        for need in ["https://puff2door.com/", "https://puff2door.com/shop",
                     "https://puff2door.com/product-category/disposable",
                     "https://puff2door.com/shop/geek-bar-pulse-2-25k-grape-hubba-14"]:
            assert need in locs, need
        assert not [l for l in locs if any(x in l for x in
                    ["/cart", "/checkout", "/admin", "/my-account", "/wishlist", "/track"])]

    @pytest.mark.parametrize("path,ctype", [("/img/og-image.jpg", "image/jpeg"), ("/img/hero-geekbar.webp", "image/webp")])
    def test_seo_images(self, api, path, ctype):
        r = api.get(f"{BASE_URL}{path}")
        assert r.status_code == 200
        assert ctype in r.headers.get("content-type", "")


# --- catalog / content / settings regression ---
class TestCatalogRegression:
    def test_products(self, api):
        r = api.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("products", data.get("items"))
        assert len(items) == 67, f"expected 67 products, got {len(items)}"
        assert all("_id" not in p for p in items)
        assert {"id", "name", "slug", "price", "category"} <= set(items[0])

    def test_home_content_webp_heroes(self, api):
        r = api.get(f"{BASE_URL}/api/content/home")
        assert r.status_code == 200
        slides = r.json().get("heroSlides") or []
        assert slides
        for s in slides:
            img = s.get("image") or ""
            assert img.endswith(".webp"), img

    def test_settings(self, api):
        r = api.get(f"{BASE_URL}/api/settings")
        assert r.status_code == 200
        s = r.json()
        assert "pricing" in s and "delivery" in s
        assert isinstance(s["delivery"], dict)

    def test_product_by_slug(self, api):
        r = api.get(f"{BASE_URL}/api/products/geek-bar-pulse-2-25k-grape-hubba-14")
        assert r.status_code == 200, r.text[:200]
        p = r.json()
        assert p["slug"] == "geek-bar-pulse-2-25k-grape-hubba-14"
        assert "_id" not in p


# --- orders ---
class TestOrders:
    def test_zelle_order_local_zip(self, api):
        prod = api.get(f"{BASE_URL}/api/products").json()
        prod = prod if isinstance(prod, list) else prod.get("products")
        p = next(x for x in prod if x.get("inStock", True))
        payload = {
            "items": [{"productId": p["id"], "name": p["name"], "price": p["price"], "quantity": 1, "image": p.get("image", "")}],
            "shipping": {"firstName": "TEST", "lastName": "Seo", "email": "test_seo@example.com", "phone": "4075551234",
                         "address": "123 Test St", "city": "Orlando", "state": "FL", "zip": "32801"},
            "paymentMethod": "zelle",
        }
        r = api.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:400]}"
        o = r.json()
        assert o.get("orderNumber") or o.get("order_number") or o.get("id")
        assert "_id" not in o


# --- admin product update + sitemap regeneration ---
class TestAdminProductUpdate:
    def test_put_product_unchanged_and_sitemap_valid(self, api, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        prods = api.get(f"{BASE_URL}/api/products").json()
        prods = prods if isinstance(prods, list) else prods.get("products")
        p = prods[0]
        r = api.put(f"{BASE_URL}/api/admin/products/{p['id']}", json=p, headers=h)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        after = api.get(f"{BASE_URL}/api/products/{p['slug']}")
        if after.status_code == 200:
            assert after.json()["name"] == p["name"]
        sm = Path("/app/frontend/public/sitemap.xml")
        assert sm.exists()
        root = ET.fromstring(sm.read_bytes())
        assert len(root.findall("s:url", NS)) >= 80

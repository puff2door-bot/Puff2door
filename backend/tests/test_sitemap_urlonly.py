"""Iteration 7: URL-only sitemap validation (preview + production report) and quick catalog/admin regression."""
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing from env and /app/frontend/.env")
BASE_URL = base_url.rstrip("/")
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
NORMAL_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
EXCLUDED = ["/cart", "/checkout", "/admin", "/my-account", "/wishlist", "/track", "/order/"]


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def creds():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("no credentials file")
    m = re.search(r"Email:\s*`([^`]+)`\s*/\s*Password:\s*`([^`]+)`", p.read_text())
    if not m:
        pytest.skip("no admin creds")
    return {"email": m.group(1), "password": m.group(2)}


def parse_locs(body_bytes):
    root = ET.fromstring(body_bytes)
    assert root.tag == "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset", root.tag
    urls = root.findall("s:url", NS)
    locs = []
    for u in urls:
        loc = u.find("s:loc", NS)
        lastmod = u.find("s:lastmod", NS)
        assert loc is not None and loc.text, "url without loc"
        assert lastmod is not None and re.fullmatch(r"\d{4}-\d{2}-\d{2}", (lastmod.text or "").strip()), \
            f"bad/missing lastmod for {loc.text}"
        locs.append(loc.text.strip())
    return locs


# --- PREVIEW: static /sitemap.xml with both UAs ---
class TestPreviewStaticSitemap:
    @pytest.mark.parametrize("ua", [NORMAL_UA, GOOGLEBOT_UA], ids=["normal-ua", "googlebot-ua"])
    def test_sitemap_is_valid_url_only_xml(self, api, ua):
        r = api.get(f"{BASE_URL}/sitemap.xml", headers={"User-Agent": ua}, timeout=30)
        assert r.status_code == 200, r.status_code
        assert "xml" in r.headers.get("content-type", "").lower(), r.headers.get("content-type")
        body = r.text
        low = body.lower()
        assert "<html" not in low and "<!doctype" not in low, "sitemap served as HTML"
        assert body.startswith('<?xml version="1.0" encoding="UTF-8"?>'), body[:80]
        assert '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' in body.split("\n")[1]
        assert body.rstrip().endswith("</urlset>")
        assert "<image:" not in body and "image:image" not in body, "image extension elements present"
        assert "nonaonlinesmokeshop" not in low, "external host referenced"

        locs = parse_locs(r.content)
        assert len(locs) == len(set(locs)), "duplicate <loc> entries"
        assert all(l.startswith("https://puff2door.com/") or l == "https://puff2door.com/" for l in locs)
        assert all("?" not in l for l in locs), "query strings present"
        bad = [l for l in locs if any(x in urlparse(l).path for x in EXCLUDED)]
        assert not bad, f"excluded paths present: {bad}"

        paths = [urlparse(l).path for l in locs]
        for need in ["/", "/shop", "/about", "/contact", "/brands"]:
            assert need in paths, f"missing {need}"
        cats = [p for p in paths if p.startswith("/product-category/")]
        brands = [p for p in paths if p.startswith("/brand/")]
        prods = [p for p in paths if p.startswith("/shop/")]
        assert len(cats) == 7, f"categories={len(cats)}"
        assert len(brands) == 35, f"brands={len(brands)}"
        assert len(prods) == 67, f"products={len(prods)}"
        assert len(locs) == 115, f"total={len(locs)}"


# --- PREVIEW: dynamic /api/sitemap.xml + robots.txt ---
class TestPreviewApiSitemapAndRobots:
    def test_api_sitemap_matches_static(self, api):
        r = api.get(f"{BASE_URL}/api/sitemap.xml", headers={"User-Agent": GOOGLEBOT_UA}, timeout=30)
        assert r.status_code == 200
        assert "application/xml" in r.headers.get("content-type", "").lower(), r.headers.get("content-type")
        api_locs = parse_locs(r.content)
        static = api.get(f"{BASE_URL}/sitemap.xml", timeout=30)
        static_locs = parse_locs(static.content)
        assert set(api_locs) == set(static_locs), (
            f"only-in-api={set(api_locs) - set(static_locs)} only-in-static={set(static_locs) - set(api_locs)}")
        assert "<image:" not in r.text

    def test_robots(self, api):
        r = api.get(f"{BASE_URL}/robots.txt", timeout=30)
        assert r.status_code == 200
        assert "text/plain" in r.headers.get("content-type", "").lower()
        body = r.text
        sitemap_lines = [l.strip() for l in body.splitlines() if l.strip().lower().startswith("sitemap:")]
        assert sitemap_lines == ["Sitemap: https://puff2door.com/sitemap.xml"], sitemap_lines
        assert "/api/sitemap.xml" not in body
        # Cloudflare injects a managed block that blanket-blocks AI crawlers; only the
        # Puff2door block matters for Googlebot.
        p2d_block = body.split("# Puff2door")[-1]
        assert not [l for l in p2d_block.splitlines() if l.strip() == "Disallow: /"]
        assert "Allow: /" in p2d_block


# --- PRODUCTION (read-only report, non-blocking) ---
class TestProductionReport:
    @pytest.mark.parametrize("ua", [NORMAL_UA, GOOGLEBOT_UA], ids=["normal-ua", "googlebot-ua"])
    def test_prod_sitemap_report(self, ua):
        try:
            r = requests.get("https://puff2door.com/sitemap.xml", headers={"User-Agent": ua}, timeout=30)
        except Exception as e:
            print(f"[PROD sitemap {ua[:20]}] request failed: {e}")
            pytest.skip("production unreachable from preview network")
        ct = r.headers.get("content-type", "")
        is_xml = r.text.lstrip().startswith("<?xml")
        count, first5 = 0, []
        if is_xml:
            try:
                locs = [u.find("s:loc", NS).text for u in ET.fromstring(r.content).findall("s:url", NS)]
                count, first5 = len(locs), locs[:5]
            except Exception as e:
                print(f"[PROD sitemap] parse error: {e}")
        print(f"[PROD sitemap ua={'googlebot' if 'Googlebot' in ua else 'normal'}] status={r.status_code} "
              f"ct={ct} xml={is_xml} html={'<html' in r.text.lower()} urls={count} "
              f"has_image_tags={'<image:' in r.text} first5={first5}")

    def test_prod_robots_report(self):
        try:
            r = requests.get("https://puff2door.com/robots.txt", headers={"User-Agent": GOOGLEBOT_UA}, timeout=30)
        except Exception as e:
            pytest.skip(f"production unreachable: {e}")
        print(f"[PROD robots] status={r.status_code} ct={r.headers.get('content-type')}\n{r.text[:800]}")

    def test_prod_www_redirect_report(self):
        try:
            r = requests.get("https://www.puff2door.com/sitemap.xml", timeout=30, allow_redirects=False)
        except Exception as e:
            pytest.skip(f"www unreachable: {e}")
        print(f"[PROD www] status={r.status_code} location={r.headers.get('location')} "
              f"ct={r.headers.get('content-type')}")


# --- REGRESSION: admin login, no-op product update, static file still valid, catalog count ---
class TestRegression:
    def test_products_count(self, api):
        r = api.get(f"{BASE_URL}/api/products", timeout=30)
        assert r.status_code == 200
        assert len(r.json()["products"]) == 67, len(r.json()["products"])

    def test_admin_noop_update_keeps_sitemap_valid(self, api, creds):
        login = api.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
        if login.status_code != 200:
            pytest.fail(f"admin login failed {login.status_code}: {login.text[:300]}")
        data = login.json()
        token = data.get("token") or data.get("access_token")
        assert token and data.get("user", {}).get("role") == "admin", data
        headers = {"Authorization": f"Bearer {token}"}

        prods = api.get(f"{BASE_URL}/api/admin/products", headers=headers, timeout=30)
        assert prods.status_code == 200, prods.text[:300]
        items = prods.json().get("products", prods.json() if isinstance(prods.json(), list) else [])
        assert items, "no admin products"
        p = items[0]
        fields = ["name", "category", "categorySlug", "price", "salePrice", "image", "image2",
                  "brand", "brandName", "flavors", "puffs", "stock", "active", "description"]
        payload = {k: p[k] for k in fields if k in p}
        upd = api.put(f"{BASE_URL}/api/admin/products/{p['id']}", json=payload, headers=headers, timeout=30)
        assert upd.status_code == 200, f"{upd.status_code} {upd.text[:300]}"

        static = Path("/app/frontend/public/sitemap.xml").read_bytes()
        assert static.decode().startswith('<?xml version="1.0" encoding="UTF-8"?>')
        locs = parse_locs(static)
        assert len(locs) == 115, len(locs)
        assert b"<image:" not in static

        # product data unchanged
        after = api.get(f"{BASE_URL}/api/products/{p['slug']}", timeout=30).json()
        assert after["name"] == p["name"]
        assert float(after["price"]) == float(p["price"])

    def test_home_page_title(self, api):
        r = api.get(f"{BASE_URL}/", headers={"User-Agent": NORMAL_UA}, timeout=30)
        assert r.status_code == 200
        assert "Online Smoke Shop &amp; Vape Delivery | Puff2door" in r.text or \
               "Online Smoke Shop & Vape Delivery | Puff2door" in r.text, r.text[:300]

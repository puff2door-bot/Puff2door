"""Iteration 10: GET /api/delivery/area, admin brand logos CRUD, sitemap delivery-area entry."""
import io
import os
import re
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"

TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753"
    "de0000000c4944415408d763f8cfc0000003010100189dd1de0000000049454e44ae426082"
)


@pytest.fixture(scope="session")
def creds():
    content = Path("/app/memory/test_credentials.md").read_text()
    m = re.search(r"Email: `(admin@[^`]+)` / Password: `([^`]+)`", content)
    if not m:
        pytest.skip("admin creds not found")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="session")
def admin_client(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": creds["email"], "password": creds["password"]})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    token = data.get("token") or data.get("access_token") or (data.get("session") or {}).get("token")
    if not token:
        pytest.fail(f"no token in login response: {list(data.keys())}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------------- Delivery area ----------------
class TestDeliveryArea:
    EXPECTED = {"Orlando": 27, "Kissimmee": 4, "Saint Cloud": 3, "Winter Park": 2, "Christmas": 1, "Oviedo": 1}

    def test_area_shape(self):
        r = requests.get(f"{API}/delivery/area")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["centerZip"] == "32832"
        assert d["centerCity"] == "Orlando"
        assert float(d["radiusMiles"]) == 20.0
        assert d["zipCount"] == 38, f"zipCount={d['zipCount']}"
        got = {a["city"]: len(a["zips"]) for a in d["areas"]}
        assert got == self.EXPECTED, got
        for a in d["areas"]:
            assert a["state"] == "FL"
            for z in a["zips"]:
                assert re.fullmatch(r"\d{5}", z["zip"])
                assert 0 <= z["distanceMiles"] <= 20.0
        # sorted desc by zip count
        counts = [len(a["zips"]) for a in d["areas"]]
        assert counts == sorted(counts, reverse=True)

    def test_area_cached_identical(self):
        r1 = requests.get(f"{API}/delivery/area")
        t0 = time.time()
        r2 = requests.get(f"{API}/delivery/area")
        elapsed = time.time() - t0
        assert r1.json() == r2.json()
        assert elapsed < 3.0, f"second (cached) call took {elapsed:.2f}s"

    def test_radius_change_shrinks_area(self, admin_client):
        cur = admin_client.get(f"{API}/admin/settings")
        assert cur.status_code == 200
        original = cur.json()
        payload = {k: original[k] for k in ("taxRate", "deliveryFee", "freeDeliveryMin", "deliveryZip", "deliveryRadiusMiles")}
        try:
            upd = dict(payload, deliveryRadiusMiles=10.0)
            r = admin_client.put(f"{API}/admin/settings", json=upd)
            assert r.status_code == 200, r.text[:300]
            assert float(r.json()["deliveryRadiusMiles"]) == 10.0
            a = requests.get(f"{API}/delivery/area").json()
            assert float(a["radiusMiles"]) == 10.0
            assert a["zipCount"] < 38, a["zipCount"]
            assert all(z["distanceMiles"] <= 10.0 for ar in a["areas"] for z in ar["zips"])
        finally:
            rr = admin_client.put(f"{API}/admin/settings", json=payload)
            assert rr.status_code == 200
            back = requests.get(f"{API}/delivery/area").json()
            assert back["zipCount"] == 38, "failed to restore radius 20"


# ---------------- Brand logos ----------------
class TestBrandLogos:
    def test_public_brands_initially_empty(self):
        r = requests.get(f"{API}/brands")
        assert r.status_code == 200
        assert "brands" in r.json()
        assert isinstance(r.json()["brands"], list)

    def test_put_unauthenticated_rejected(self):
        r = requests.put(f"{API}/admin/brands/muha", json={"image": "/api/files/x.png", "name": "MUHA"})
        assert r.status_code in (401, 403), r.status_code

    def test_brand_logo_crud(self, admin_client):
        try:
            r = admin_client.put(f"{API}/admin/brands/muha", json={"image": "/api/files/test.png", "name": "MUHA"})
            assert r.status_code == 200, r.text[:300]
            d = r.json()
            assert d == {"slug": "muha", "name": "MUHA", "image": "/api/files/test.png"}

            pub = requests.get(f"{API}/brands").json()["brands"]
            match = [b for b in pub if b["slug"] == "muha"]
            assert len(match) == 1, pub
            assert match[0]["image"] == "/api/files/test.png"
            assert "_id" not in match[0]

            # update (no duplicate)
            r2 = admin_client.put(f"{API}/admin/brands/muha", json={"image": "/api/files/test2.png", "name": "MUHA"})
            assert r2.status_code == 200
            pub2 = requests.get(f"{API}/brands").json()["brands"]
            m2 = [b for b in pub2 if b["slug"] == "muha"]
            assert len(m2) == 1
            assert m2[0]["image"] == "/api/files/test2.png"
        finally:
            dr = admin_client.delete(f"{API}/admin/brands/muha")
            assert dr.status_code == 200 and dr.json() == {"ok": True}
            assert not [b for b in requests.get(f"{API}/brands").json()["brands"] if b["slug"] == "muha"]

    def test_blank_slug_rejected(self, admin_client):
        r = admin_client.put(f"{API}/admin/brands/%20%20", json={"image": "/x.png", "name": "X"})
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_upload_then_set_brand_logo(self, admin_client):
        up = admin_client.post(
            f"{API}/admin/upload",
            files={"file": ("TEST_tiny.png", io.BytesIO(TINY_PNG), "image/png")},
        )
        assert up.status_code == 200, up.text[:300]
        url = up.json().get("url", "")
        assert url.startswith("/api/files/"), url
        f = requests.get(BASE_URL + url)
        assert f.status_code == 200, f.status_code
        assert f.headers.get("content-type", "").startswith("image/"), f.headers.get("content-type")
        try:
            r = admin_client.put(f"{API}/admin/brands/raz", json={"image": url, "name": "RAZ"})
            assert r.status_code == 200
            assert r.json()["image"] == url
            pub = [b for b in requests.get(f"{API}/brands").json()["brands"] if b["slug"] == "raz"]
            assert len(pub) == 1 and pub[0]["image"] == url
        finally:
            assert admin_client.delete(f"{API}/admin/brands/raz").status_code == 200


# ---------------- Sitemap ----------------
class TestSitemap:
    @pytest.mark.parametrize("path", ["/sitemap.xml", "/api/sitemap.xml"])
    def test_sitemap(self, path):
        r = requests.get(BASE_URL + path)
        assert r.status_code == 200, r.status_code
        assert "xml" in r.headers.get("content-type", ""), r.headers.get("content-type")
        assert r.text.count("<url>") == 115, r.text.count("<url>")
        assert "<loc>https://puff2door.com/delivery-area</loc>" in r.text

    def test_robots(self):
        r = requests.get(BASE_URL + "/robots.txt")
        assert r.status_code == 200
        assert "Sitemap: https://puff2door.com/sitemap.xml" in r.text


# ---------------- Regression ----------------
class TestRegression:
    def test_products_count(self):
        r = requests.get(f"{API}/products")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("products", data.get("items", []))
        assert len(items) == 67, len(items)

    def test_delivery_check(self):
        ok = requests.get(f"{API}/delivery/check", params={"zip": "32801"}).json()
        bad = requests.get(f"{API}/delivery/check", params={"zip": "33101"}).json()
        assert ok.get("eligible") is True, ok
        assert bad.get("eligible") is False, bad

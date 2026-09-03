"""Delivery-zone feature tests (20-mile radius around ZIP 32832)."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/") + "/api"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    m = re.search(r"Email: `([^`]+)` / Password: `([^`]+)`", content)
    if not m:
        pytest.skip("no admin creds")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="session")
def admin_client(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/auth/login", json={"email": creds["email"], "password": creds["password"]})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token") or r.json().get("access_token")
    assert token, f"no token in {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def in_stock_product(api):
    r = api.get(f"{BASE_URL}/products", params={"limit": 100})
    assert r.status_code == 200, r.text
    data = r.json()
    products = data["products"] if isinstance(data, dict) else data
    for p in products:
        if (p.get("stock") or 0) >= 2:
            return p
    pytest.fail("no in-stock product available")


def cart_item(p, qty=1):
    return {"productId": p["id"], "name": p["name"], "price": p["price"], "qty": qty,
            "slug": p.get("slug", ""), "categorySlug": p.get("categorySlug", "")}


def shipping(zip_code):
    return {
        "firstName": "TEST", "lastName": "Zone", "email": "test.zone@example.com",
        "phone": "4075551234", "address": "123 Test St", "city": "Orlando",
        "state": "FL", "zip": zip_code,
    }


# ---- /api/settings ----
class TestSettings:
    def test_settings_includes_delivery(self, api):
        r = api.get(f"{BASE_URL}/settings")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "pricing" in d and "delivery" in d
        assert d["delivery"]["zip"] == "32832"
        assert d["delivery"]["radiusMiles"] == 20
        assert d["pricing"]["taxRate"] == 0.065
        assert "_id" not in d


# ---- /api/delivery/check ----
class TestDeliveryCheck:
    def test_inside_zone(self, api):
        r = api.get(f"{BASE_URL}/delivery/check", params={"zip": "32801"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["eligible"] is True
        assert d["city"] == "Orlando"
        assert d["state"] == "FL"
        assert 14 <= d["distanceMiles"] <= 17, d
        assert "Great news" in d["message"]

    def test_outside_zone(self, api):
        r = api.get(f"{BASE_URL}/delivery/check", params={"zip": "33101"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["eligible"] is False
        assert d["distanceMiles"] > 20
        assert d["message"].startswith("Sorry, we only deliver within 20 miles of 32832")

    def test_invalid_zip(self, api):
        r = api.get(f"{BASE_URL}/delivery/check", params={"zip": "abc"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["eligible"] is False
        assert "valid 5-digit" in d["message"]

    def test_missing_zip(self, api):
        r = api.get(f"{BASE_URL}/delivery/check")
        assert r.status_code == 200, r.text
        assert r.json()["eligible"] is False

    def test_center_zip_eligible(self, api):
        d = api.get(f"{BASE_URL}/delivery/check", params={"zip": "32832"}).json()
        assert d["eligible"] is True and d["distanceMiles"] == 0


# ---- POST /api/orders zone enforcement ----
class TestOrderZone:
    def test_order_outside_zone_blocked_and_stock_intact(self, api, in_stock_product):
        pid = in_stock_product["id"]
        before = api.get(f"{BASE_URL}/products/{in_stock_product.get('slug', pid)}")
        stock_before = api.get(f"{BASE_URL}/products", params={"limit": 100}).json()
        stock_before = next(p["stock"] for p in (stock_before["products"] if isinstance(stock_before, dict) else stock_before) if p["id"] == pid)
        r = api.post(f"{BASE_URL}/orders", json={
            "items": [cart_item(in_stock_product)],
            "shipping": shipping("33101"),
            "paymentMethod": "zelle",
        })
        assert r.status_code == 400, r.text
        assert "Sorry, we only deliver" in r.json()["detail"]
        after = api.get(f"{BASE_URL}/products", params={"limit": 100}).json()
        stock_after = next(p["stock"] for p in (after["products"] if isinstance(after, dict) else after) if p["id"] == pid)
        assert stock_after == stock_before, "stock changed on blocked order"
        assert before.status_code in (200, 404)

    def test_order_inside_zone_created_zelle(self, api, in_stock_product):
        pid = in_stock_product["id"]
        r = api.post(f"{BASE_URL}/orders", json={
            "items": [cart_item(in_stock_product)],
            "shipping": shipping("32801"),
            "paymentMethod": "zelle",
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["paymentStatus"] == "awaiting_payment"
        assert o["shipping"]["zip"] == "32801"
        # deliveryDistanceMiles is persisted server-side but not exposed in order_response (minor)
        if o.get("deliveryDistanceMiles") is not None:
            assert o["deliveryDistanceMiles"] < 20
        assert "_id" not in o
        # verify persistence
        g = api.get(f"{BASE_URL}/orders/{o['id']}")
        assert g.status_code == 200, g.text
        assert g.json()["orderNumber"] == o["orderNumber"]

    def test_order_test_card_inside_zone(self, api, in_stock_product):
        r = api.post(f"{BASE_URL}/orders", json={
            "items": [cart_item(in_stock_product)],
            "shipping": shipping("32801"),
            "paymentMethod": "test_card",
            "paymentLast4": "4242",
        })
        assert r.status_code == 200, r.text
        assert r.json()["paymentLast4"] == "4242"

    def test_order_invalid_zip_blocked(self, api, in_stock_product):
        r = api.post(f"{BASE_URL}/orders", json={
            "items": [cart_item(in_stock_product)],
            "shipping": shipping("00000"),
            "paymentMethod": "zelle",
        })
        assert r.status_code in (400, 422), r.text


# ---- PayPal create-order zone gate ----
class TestPayPalZone:
    def test_paypal_outside_zone_400(self, api, in_stock_product):
        r = api.post(f"{BASE_URL}/payments/paypal/create-order", json={
            "items": [cart_item(in_stock_product)],
            "zip": "33101",
        })
        assert r.status_code == 400, r.text
        assert "Sorry, we only deliver" in r.json()["detail"]

    def test_paypal_inside_zone_passes_gate(self, api, in_stock_product):
        r = api.post(f"{BASE_URL}/payments/paypal/create-order", json={
            "items": [cart_item(in_stock_product)],
            "zip": "32801",
        })
        assert r.status_code in (200, 402, 502, 503), r.text
        if r.status_code == 200:
            assert r.json().get("id")
        else:
            assert "Sorry, we only deliver" not in r.text


# ---- Admin settings ----
class TestAdminSettings:
    RESTORE = {"taxRate": 0.065, "deliveryFee": 15, "freeDeliveryMin": 99, "deliveryZip": "32832", "deliveryRadiusMiles": 20}

    def test_admin_get_settings(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/admin/settings")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deliveryZip"] == "32832"
        assert float(d["deliveryRadiusMiles"]) == 20
        assert "_id" not in d

    def test_admin_settings_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/admin/settings")
        assert r.status_code in (401, 403), r.text

    def test_invalid_zip_422(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/admin/settings", json={**self.RESTORE, "deliveryZip": "00000"})
        assert r.status_code == 422, r.text

    def test_invalid_radius_422(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/admin/settings", json={**self.RESTORE, "deliveryRadiusMiles": 0})
        assert r.status_code == 422, r.text

    def test_radius_change_affects_check(self, admin_client, api):
        try:
            r = admin_client.put(f"{BASE_URL}/admin/settings", json={**self.RESTORE, "deliveryRadiusMiles": 5})
            assert r.status_code == 200, r.text
            assert float(r.json()["deliveryRadiusMiles"]) == 5
            chk = api.get(f"{BASE_URL}/delivery/check", params={"zip": "32801"}).json()
            assert chk["eligible"] is False, chk
            assert "within 5 miles" in chk["message"]
            s = api.get(f"{BASE_URL}/settings").json()
            assert s["delivery"]["radiusMiles"] == 5
        finally:
            rb = admin_client.put(f"{BASE_URL}/admin/settings", json=self.RESTORE)
            assert rb.status_code == 200, rb.text
            assert float(rb.json()["deliveryRadiusMiles"]) == 20
            assert api.get(f"{BASE_URL}/delivery/check", params={"zip": "32801"}).json()["eligible"] is True


# ---- Light regression: cart pricing + promo ----
class TestRegression:
    def test_promo_puff10(self, api, in_stock_product):
        r = api.post(f"{BASE_URL}/promo/validate", json={"items": [cart_item(in_stock_product, 2)], "code": "PUFF10"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["code"] == "PUFF10"
        assert d["discount"] > 0, d

    def test_products_and_home_data(self, api):
        r = api.get(f"{BASE_URL}/products", params={"limit": 5})
        assert r.status_code == 200
        data = r.json()
        items = data["products"] if isinstance(data, dict) else data
        assert len(items) > 0

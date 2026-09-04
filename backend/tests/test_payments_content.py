"""Iteration 4: payment methods (Zelle / Test Card / disabled providers), admin payment status,
home content (hero slides + promo tiles) CRUD."""
import json
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

CREDS = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
ADMIN_EMAIL = "admin@puff2door.com"
ADMIN_PASSWORD = "Puff2Door-Admin1"
CUST_EMAIL = "qa.reset.1788317514@example.com"
CUST_PASSWORD = "Brand New99"
PRODUCT_ID = 14
PRODUCT_SLUG = "geek-bar-pulse-2-25k-grape-hubba-14"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(client):
    r = client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token(client):
    r = client.post(f"{API}/auth/login", json={"email": CUST_EMAIL, "password": CUST_PASSWORD})
    if r.status_code != 200:
        pytest.fail(f"Customer login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def product(client):
    r = client.get(f"{API}/products/{PRODUCT_SLUG}")
    assert r.status_code == 200, r.text
    return r.json()


def cart_item(product, qty=1, price=None):
    return {
        "productId": product["id"],
        "slug": product["slug"],
        "name": product["name"],
        "price": price if price is not None else product.get("salePrice") or product["price"],
        "qty": qty,
        "image": product.get("image", ""),
    }


SHIPPING = {
    "firstName": "TEST",
    "lastName": "Payments",
    "email": "test_payments@example.com",
    "phone": "5551234567",
    "address": "1 Test St",
    "city": "Orlando",
    "state": "FL",
    "zip": "32801",
}


def order_payload(product, method, **extra):
    body = {
        "items": [cart_item(product)],
        "shipping": dict(SHIPPING),
        "subtotal": 1.0,
        "shippingCost": 0.0,
        "total": 1.0,
        "paymentMethod": method,
    }
    body.update(extra)
    return body


def stock_of(client, slug):
    return client.get(f"{API}/products/{slug}").json()["stock"]


# ---- payments config ----
class TestPaymentsConfig:
    def test_config_flags(self, client):
        r = client.get(f"{API}/payments/config")
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["zelle"]["enabled"] is True
        assert c["zelle"]["email"] == "puff2door@gmail.com"
        assert c["testCard"]["enabled"] is True  # ALLOW_TEST_CARD=true in preview
        assert c["cashApp"]["enabled"] == c["square"]["enabled"]
        assert (c["square"]["applicationId"] is None) == (not c["square"]["enabled"])
        assert (c["paypal"]["clientId"] is None) == (not c["paypal"]["enabled"])
        if c["square"]["enabled"] or c["paypal"]["enabled"]:
            assert c["testCard"]["visible"] is False


# ---- disabled providers ----
class TestDisabledMethods:
    @pytest.mark.parametrize("method", ["square", "paypal", "cash_app"])
    def test_disabled_method_rejected(self, client, product, method):
        cfg = client.get(f"{API}/payments/config").json()
        enabled = cfg["paypal"]["enabled"] if method == "paypal" else cfg["square"]["enabled"]
        r = client.post(f"{API}/orders", json=order_payload(product, method, paymentToken="cnon:fake", paypalOrderId="X"))
        if enabled:
            assert r.status_code == 402, r.text  # provider configured: bogus token/order is rejected by provider check
        else:
            assert r.status_code == 400, r.text
            assert "not available" in r.json()["detail"].lower()

    def test_unknown_method_rejected(self, client, product):
        r = client.post(f"{API}/orders", json=order_payload(product, "bitcoin"))
        assert r.status_code == 400, r.text
        assert "not available" in r.json()["detail"].lower()

    def test_paypal_create_order(self, client, product):
        cfg = client.get(f"{API}/payments/config").json()
        r = client.post(f"{API}/payments/paypal/create-order", json={"items": [cart_item(product)], "zip": "32801"})
        if cfg["paypal"]["enabled"]:
            assert r.status_code == 200, r.text
            assert r.json()["id"] and r.json()["total"] > 0
        else:
            assert r.status_code == 503, r.text
            assert "not configured" in r.json()["detail"].lower()

    def test_empty_cart_rejected(self, client):
        r = client.post(f"{API}/orders", json={"items": [], "shipping": dict(SHIPPING), "subtotal": 0, "shippingCost": 0, "total": 0, "paymentMethod": "test_card"})
        assert r.status_code == 400, r.text


# ---- Zelle order lifecycle ----
class TestZelleOrder:
    def test_zelle_order_and_admin_mark_paid(self, client, product, admin_token):
        before = stock_of(client, PRODUCT_SLUG)
        r = client.post(f"{API}/orders", json=order_payload(product, "zelle"))
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["paymentStatus"] == "awaiting_payment"
        assert o["paymentMethod"] == "zelle"
        assert o["paymentBrand"] == "Zelle"
        z = o["zelle"]
        assert z["recipient"] == "puff2door@gmail.com"
        assert z["name"]
        assert abs(z["amount"] - o["total"]) < 0.001
        assert z["memo"] == o["orderNumber"]
        assert o["status"] == "placed"
        done = [s for s in o["timeline"] if s.get("done")]
        assert len(done) == 1, o["timeline"]
        assert "_id" not in o

        # stock decremented
        assert stock_of(client, PRODUCT_SLUG) == before - 1

        # GET returns same shape
        g = client.get(f"{API}/orders/{o['id']}")
        assert g.status_code == 200
        gd = g.json()
        assert gd["paymentStatus"] == "awaiting_payment"
        assert gd["zelle"]["memo"] == o["orderNumber"]
        assert gd["status"] == "placed"

        # invalid payment status
        h = {"Authorization": f"Bearer {admin_token}"}
        bad = client.put(f"{API}/admin/orders/{o['id']}/payment", json={"paymentStatus": "nope"}, headers=h)
        assert bad.status_code == 400, bad.text

        # non-admin forbidden
        na = client.put(f"{API}/admin/orders/{o['id']}/payment", json={"paymentStatus": "paid"})
        assert na.status_code in (401, 403), na.text

        # admin marks paid
        p = client.put(f"{API}/admin/orders/{o['id']}/payment", json={"paymentStatus": "paid"}, headers=h)
        assert p.status_code == 200, p.text
        pd = p.json()
        assert pd["paymentStatus"] == "paid"
        assert pd["status"] == "confirmed"
        assert pd["zelle"] is None

        # persisted
        gd2 = client.get(f"{API}/orders/{o['id']}").json()
        assert gd2["paymentStatus"] == "paid"
        assert gd2["status"] == "confirmed"

        # status update still works after payment
        st = client.put(f"{API}/admin/orders/{o['id']}/status", json={"status": "out_for_delivery"}, headers=h)
        assert st.status_code == 200, st.text
        assert st.json()["status"] == "out_for_delivery"
        nast = client.put(f"{API}/admin/orders/{o['id']}/status", json={"status": "out_for_delivery"})
        assert nast.status_code in (401, 403)

    def test_customer_zelle_order_listed(self, client, product, customer_token):
        h = {"Authorization": f"Bearer {customer_token}"}
        r = client.post(f"{API}/orders", json=order_payload(product, "zelle"), headers=h)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]
        lst = client.get(f"{API}/orders", headers=h)
        assert lst.status_code == 200
        assert any(x["id"] == oid and x["paymentStatus"] == "awaiting_payment" for x in lst.json()["orders"])


# ---- Test card + server-side pricing ----
class TestCardAndPricing:
    def test_test_card_order_server_pricing(self, client, product):
        payload = order_payload(product, "test_card", paymentLast4="4242 4242 4242 4242")
        payload["subtotal"] = 0.01
        payload["total"] = 0.01
        payload["shippingCost"] = 0
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["paymentStatus"] == "paid"
        assert o["paymentBrand"] == "Test Card"
        assert o["paymentLast4"] == "4242"
        expected_sub = round(payload["items"][0]["price"], 2)
        assert abs(o["subtotal"] - expected_sub) < 0.011, o
        rules = client.get(f"{API}/settings").json()["pricing"]
        expected_ship = 0 if expected_sub >= rules["freeDeliveryMin"] else rules["deliveryFee"]
        assert abs(o["shippingCost"] - expected_ship) < 0.001
        assert abs(o["tax"] - round(expected_sub * 0.065, 2)) < 0.011
        assert abs(o["total"] - round(expected_sub + expected_ship + o["tax"], 2)) < 0.011
        assert o["zelle"] is None

    def test_free_shipping_over_threshold(self, client, product):
        rules = client.get(f"{API}/settings").json()["pricing"]
        qty = int(rules["freeDeliveryMin"] // (product.get("salePrice") or product["price"])) + 1
        payload = order_payload(product, "test_card", paymentLast4="4242424242424242")
        payload["items"][0]["qty"] = qty
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["subtotal"] >= rules["freeDeliveryMin"]
        assert o["shippingCost"] == 0
        assert abs(o["total"] - (o["subtotal"] + o["tax"])) < 0.011

    def test_below_floor_price_corrected(self, client, product):
        payload = order_payload(product, "test_card", paymentLast4="4242424242424242")
        payload["items"][0]["price"] = 0.01
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["subtotal"] > 1, "client-supplied under-floor price was accepted"

    def test_over_stock_rejected(self, client, product):
        payload = order_payload(product, "test_card", paymentLast4="4242424242424242")
        payload["items"][0]["qty"] = 100000
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 409, r.text


# ---- Home content ----
class TestHomeContent:
    def test_get_home_content(self, client):
        r = client.get(f"{API}/content/home")
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["heroSlides"]) == 3
        assert len(d["promoBlocks"]) == 4
        assert "_id" not in d
        for s in d["heroSlides"]:
            assert s["title"] and s["cta"] and s["link"]

    def test_admin_update_and_restore(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        original = client.get(f"{API}/content/home").json()
        modified = json.loads(json.dumps(original))
        modified["heroSlides"][0]["title"] = "TEST_Hero Title QA"
        modified["promoBlocks"][0]["tag"] = "TEST_TAG"
        try:
            r = client.put(f"{API}/admin/content/home", json={"heroSlides": modified["heroSlides"], "promoBlocks": modified["promoBlocks"]}, headers=h)
            assert r.status_code == 200, r.text
            assert r.json()["heroSlides"][0]["title"] == "TEST_Hero Title QA"
            g = client.get(f"{API}/content/home").json()
            assert g["heroSlides"][0]["title"] == "TEST_Hero Title QA"
            assert g["promoBlocks"][0]["tag"] == "TEST_TAG"
        finally:
            back = client.put(f"{API}/admin/content/home", json={"heroSlides": original["heroSlides"], "promoBlocks": original["promoBlocks"]}, headers=h)
            assert back.status_code == 200
        seed = json.loads(Path("/app/backend/seed_content.json").read_text())
        final = client.get(f"{API}/content/home").json()
        assert final["heroSlides"][0]["title"] == seed["heroSlides"][0]["title"]
        assert final["promoBlocks"][0]["tag"] == seed["promoBlocks"][0]["tag"]

    def test_empty_hero_slides_422(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.put(f"{API}/admin/content/home", json={"heroSlides": [], "promoBlocks": []}, headers=h)
        assert r.status_code == 422, r.text

    def test_non_admin_put_403(self, client, customer_token):
        original = client.get(f"{API}/content/home").json()
        r = client.put(f"{API}/admin/content/home", json=original, headers={"Authorization": f"Bearer {customer_token}"})
        assert r.status_code == 403, r.text
        r2 = client.put(f"{API}/admin/content/home", json=original)
        assert r2.status_code in (401, 403), r2.text


# ---- 404 / unknown routes ----
def test_unknown_api_route_404(client):
    r = client.get(f"{API}/definitely-not-a-route")
    assert r.status_code == 404

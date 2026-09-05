"""Isolated loyalty-rewards tests: ledger, earn on paid only, redeem validation, reversal, admin adjust. Uses a fresh account + a high-stock product."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
be = dotenv_values("/app/backend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or fe["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
ADMIN_EMAIL = be["ADMIN_EMAILS"].split(",")[0].strip()
ADMIN_PASSWORD = be["ADMIN_PASSWORD"]
SHIP = {"firstName": "Loyal", "lastName": "Tester", "email": "loyal@example.com", "phone": "4070000000", "address": "1 Test St", "city": "Orlando", "state": "Florida", "zip": "32832"}


def auth(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer():
    email = f"TEST_loyal+{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Password123!", "firstName": "Loyal", "lastName": "Tester"})
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"], "id": r.json()["user"]["id"], "email": email}


@pytest.fixture(scope="module")
def product():
    prods = requests.get(f"{API}/products").json()["products"]
    p = max((x for x in prods if x["inStock"] and x["categorySlug"] != "disposable"), key=lambda x: x["stock"])
    assert p["stock"] >= 20
    return p


@pytest.fixture(scope="module", autouse=True)
def default_rules(admin):
    body = {"loyaltyEnabled": True, "pointsPerDollar": 1.0, "pointsPerReward": 100, "rewardValue": 5.0, "minRedeemPoints": 100, "maxRedeemPerOrder": 0, "minPurchaseForRedeem": 0.0}
    r = requests.put(f"{API}/admin/loyalty/settings", json=body, headers=auth(admin))
    assert r.status_code == 200, r.text
    yield
    requests.put(f"{API}/admin/loyalty/settings", json=body, headers=auth(admin))


def item(p, qty):
    return {"productId": p["id"], "name": p["name"], "price": p["salePrice"] or p["price"], "qty": qty, "slug": p["slug"]}


def place(p, qty, token=None, method="test_card", extra=None):
    body = {"items": [item(p, qty)], "shipping": SHIP, "paymentMethod": method, "paymentLast4": "4242" if method == "test_card" else "", **(extra or {})}
    return requests.post(f"{API}/orders", json=body, headers=auth(token) if token else {})


def me(token):
    r = requests.get(f"{API}/loyalty/me", headers=auth(token))
    assert r.status_code == 200, r.text
    return r.json()


def test_public_settings_expose_loyalty_rules():
    s = requests.get(f"{API}/settings").json()
    assert s["loyalty"]["enabled"] is True and s["loyalty"]["pointsPerReward"] == 100 and s["loyalty"]["rewardValue"] == 5.0
    assert s["pricing"]["taxRate"] == 0.065  # untouched


def test_loyalty_me_requires_auth():
    assert requests.get(f"{API}/loyalty/me").status_code == 401


def test_new_customer_has_zero_balance(customer):
    d = me(customer["token"])
    assert d["available"] == 0 and d["history"] == [] and d["redeemablePoints"] == 0


def test_guest_order_earns_nothing_and_cannot_redeem(product):
    r = place(product, 1)
    assert r.status_code == 200, r.text
    assert r.json()["pointsEarned"] == 0 and r.json()["userId"] is None
    r = place(product, 1, extra={"redeemPoints": 100})
    assert r.status_code == 401


def test_paid_order_earns_floor_of_merchandise_only(customer, product):
    qty = max(1, int(120 // (product["salePrice"] or product["price"])) + 1)
    r = place(product, qty, customer["token"])
    assert r.status_code == 200, r.text
    o = r.json()
    expected = int((o["subtotal"] - o["discount"]) // 1)
    assert o["pointsEarned"] == expected and expected > 0
    assert o["tax"] > 0  # tax charged but not counted
    d = me(customer["token"])
    assert d["available"] == expected
    assert d["history"][0]["type"] == "earn" and d["history"][0]["points"] == expected and d["history"][0]["orderNumber"] == o["orderNumber"]
    customer["order1"] = o


def test_zelle_order_earns_only_when_marked_paid(customer, product, admin):
    before = me(customer["token"])["available"]
    r = place(product, 1, customer["token"], method="zelle")
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["paymentStatus"] == "awaiting_payment" and o["pointsEarned"] == 0
    assert me(customer["token"])["available"] == before
    r = requests.put(f"{API}/admin/orders/{o['id']}/payment", json={"paymentStatus": "paid"}, headers=auth(admin))
    assert r.status_code == 200, r.text
    earned = r.json()["pointsEarned"]
    assert earned == int(o["subtotal"] // 1) and earned > 0
    assert me(customer["token"])["available"] == before + earned
    # idempotent: marking paid again never double-awards
    requests.put(f"{API}/admin/orders/{o['id']}/payment", json={"paymentStatus": "paid"}, headers=auth(admin))
    requests.put(f"{API}/admin/orders/{o['id']}/status", json={"status": "delivered"}, headers=auth(admin))
    assert me(customer["token"])["available"] == before + earned
    customer["zelle_order"] = o


def test_redeem_validation(customer, product):
    bal = me(customer["token"])["available"]
    assert bal >= 100
    r = place(product, 1, customer["token"], extra={"redeemPoints": 150})
    assert r.status_code == 400 and "blocks of 100" in r.json()["detail"]
    r = place(product, 1, customer["token"], extra={"redeemPoints": ((bal // 100) + 1) * 100})
    assert r.status_code == 400 and "available" in r.json()["detail"]
    price = product["salePrice"] or product["price"]
    if price < 10:
        r = place(product, 1, customer["token"], extra={"redeemPoints": 200 if bal >= 200 else 100})
        if price < 5:
            assert r.status_code == 400 and "exceed" in r.json()["detail"]


def test_redeem_applies_discount_and_earns_on_remainder(customer, product):
    before = me(customer["token"])
    price = product["salePrice"] or product["price"]
    qty = max(2, int(30 // price) + 1)
    r = place(product, qty, customer["token"], extra={"redeemPoints": 100})
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["rewardPoints"] == 100 and o["rewardDiscount"] == 5.0
    merch = round(o["subtotal"] - o["discount"] - 5.0, 2)
    assert o["tax"] == round(merch * 0.065, 2)
    assert o["total"] == round(merch + o["shippingCost"] + o["tax"], 2)
    assert o["pointsEarned"] == int(merch // 1)
    after = me(customer["token"])
    assert after["available"] == before["available"] - 100 + o["pointsEarned"]
    types = [h["type"] for h in after["history"][:2]]
    assert set(types) == {"redeem", "earn"}
    customer["redeem_order"] = o


def test_cancel_reverses_earned_and_returns_redeemed(customer, admin):
    o = customer["redeem_order"]
    before = me(customer["token"])["available"]
    r = requests.put(f"{API}/admin/orders/{o['id']}/status", json={"status": "cancelled"}, headers=auth(admin))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled" and r.json()["pointsReversed"] == o["pointsEarned"]
    after = me(customer["token"])
    assert after["available"] == before - o["pointsEarned"] + 100
    # second cancel is a no-op
    requests.put(f"{API}/admin/orders/{o['id']}/status", json={"status": "cancelled"}, headers=auth(admin))
    assert me(customer["token"])["available"] == after["available"]
    kinds = {h["type"] for h in after["history"] if h["orderId"] == o["id"]}
    assert kinds == {"earn", "redeem", "reverse", "redeem_return"}


def test_partial_refund_reverses_proportionally_once(customer, admin):
    o = customer["order1"]
    before = me(customer["token"])["available"]
    r = requests.post(f"{API}/admin/orders/{o['id']}/refund", json={"amount": 10.0, "reason": "damaged item"}, headers=auth(admin))
    assert r.status_code == 200, r.text
    assert r.json()["pointsReversed"] == 10 and r.json()["refundedAmount"] == 10.0 and r.json()["paymentStatus"] == "paid"
    assert me(customer["token"])["available"] == before - 10
    r = requests.post(f"{API}/admin/orders/{o['id']}/refund", json={"amount": 100000, "reason": "rest"}, headers=auth(admin))
    assert r.status_code == 200, r.text
    assert r.json()["paymentStatus"] == "refunded" and r.json()["pointsReversed"] == o["pointsEarned"] - 10
    assert me(customer["token"])["available"] == before - o["pointsEarned"]
    r = requests.post(f"{API}/admin/orders/{o['id']}/refund", json={"amount": 5, "reason": "again"}, headers=auth(admin))
    assert r.status_code == 400


def test_admin_adjust_requires_reason_and_records_audit(customer, admin):
    before = me(customer["token"])["available"]
    r = requests.post(f"{API}/admin/loyalty/customers/{customer['id']}/adjust", json={"points": 50, "reason": ""}, headers=auth(admin))
    assert r.status_code == 422
    r = requests.post(f"{API}/admin/loyalty/customers/{customer['id']}/adjust", json={"points": 0, "reason": "nothing"}, headers=auth(admin))
    assert r.status_code == 422
    r = requests.post(f"{API}/admin/loyalty/customers/{customer['id']}/adjust", json={"points": -(before + 1000), "reason": "too much"}, headers=auth(admin))
    assert r.status_code == 400
    r = requests.post(f"{API}/admin/loyalty/customers/{customer['id']}/adjust", json={"points": 250, "reason": "Goodwill credit"}, headers=auth(admin))
    assert r.status_code == 200, r.text
    assert r.json()["available"] == before + 250
    tx = r.json()["transaction"]
    assert tx["type"] == "adjust" and tx["reason"] == "Goodwill credit" and tx["adminEmail"] == ADMIN_EMAIL
    d = requests.get(f"{API}/admin/loyalty/customers/{customer['id']}", headers=auth(admin)).json()
    assert d["available"] == before + 250 and d["customer"]["email"] == customer["email"].lower()
    lst = requests.get(f"{API}/admin/loyalty/customers", params={"q": customer["email"]}, headers=auth(admin)).json()["customers"]
    assert any(c["id"] == customer["id"] and c["available"] == before + 250 for c in lst)


def test_admin_endpoints_forbidden_for_customers(customer):
    for url in (f"{API}/admin/loyalty/settings", f"{API}/admin/loyalty/customers"):
        assert requests.get(url, headers=auth(customer["token"])).status_code == 403


def test_disabled_program_blocks_redeem_and_earning(customer, product, admin):
    r = requests.put(f"{API}/admin/loyalty/settings", json={"loyaltyEnabled": False, "pointsPerDollar": 1.0, "pointsPerReward": 100, "rewardValue": 5.0, "minRedeemPoints": 100, "maxRedeemPerOrder": 0, "minPurchaseForRedeem": 0.0}, headers=auth(admin))
    assert r.status_code == 200 and r.json()["loyaltyEnabled"] is False
    assert requests.get(f"{API}/settings").json()["loyalty"]["enabled"] is False
    r = place(product, 1, customer["token"], extra={"redeemPoints": 100})
    assert r.status_code == 400
    before = me(customer["token"])["available"]
    r = place(product, 1, customer["token"])
    assert r.status_code == 200 and r.json()["pointsEarned"] == 0
    assert me(customer["token"])["available"] == before


def test_store_settings_save_does_not_reset_loyalty(admin):
    requests.put(f"{API}/admin/loyalty/settings", json={"loyaltyEnabled": True, "pointsPerDollar": 2.0, "pointsPerReward": 100, "rewardValue": 5.0, "minRedeemPoints": 100, "maxRedeemPerOrder": 0, "minPurchaseForRedeem": 0.0}, headers=auth(admin))
    s = requests.get(f"{API}/admin/settings", headers=auth(admin)).json()
    r = requests.put(f"{API}/admin/settings", json={"taxRate": s["taxRate"], "deliveryFee": s["deliveryFee"], "freeDeliveryMin": s["freeDeliveryMin"], "deliveryZip": s["deliveryZip"], "deliveryRadiusMiles": s["deliveryRadiusMiles"]}, headers=auth(admin))
    assert r.status_code == 200
    assert requests.get(f"{API}/admin/loyalty/settings", headers=auth(admin)).json()["pointsPerDollar"] == 2.0


def test_catalog_untouched():
    assert len(requests.get(f"{API}/products").json()["products"]) == 67

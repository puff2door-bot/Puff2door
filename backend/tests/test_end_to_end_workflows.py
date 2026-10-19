"""End-to-end workflow audit for the isolated Puff2door preview backend.

Run against a disposable database only. The suite creates accounts, orders,
support conversations, promotions, and compliance records.
"""

import os
import uuid

import pytest
import requests


BASE = os.environ.get("PUFF2DOOR_AUDIT_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = os.environ.get("PUFF2DOOR_AUDIT_ADMIN_EMAIL", "admin@puff2door.example.com")
ADMIN_PASSWORD = os.environ.get("PUFF2DOOR_AUDIT_ADMIN_PASSWORD", "AuditAdmin-123!")


def ok(response, *statuses):
    expected = statuses or (200,)
    assert response.status_code in expected, f"{response.request.method} {response.url}: {response.status_code} {response.text[:500]}"
    return response.json() if response.content else None


@pytest.fixture(scope="module")
def state():
    suffix = uuid.uuid4().hex[:10]
    admin_login = ok(requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}))
    return {
        "suffix": suffix,
        "admin": {"Authorization": f"Bearer {admin_login['token']}"},
        "email": f"audit-{suffix}@example.com",
        "password": "AuditCustomer-123!",
    }


def test_public_catalog_delivery_and_provider_health(state):
    health_response = requests.get(f"{API}/")
    assert ok(health_response)["message"] == "Puff2Door API"
    assert health_response.headers["X-Content-Type-Options"] == "nosniff"
    assert health_response.headers["X-Frame-Options"] == "DENY"
    assert health_response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "object-src 'none'" in health_response.headers["Content-Security-Policy"]

    allowed_origin = "http://127.0.0.1:4197"
    allowed = requests.options(
        f"{API}/products",
        headers={"Origin": allowed_origin, "Access-Control-Request-Method": "GET"},
    )
    assert allowed.status_code == 200
    assert allowed.headers.get("Access-Control-Allow-Origin") == allowed_origin
    denied = requests.options(
        f"{API}/products",
        headers={"Origin": "https://attacker.example", "Access-Control-Request-Method": "GET"},
    )
    assert denied.headers.get("Access-Control-Allow-Origin") is None
    products = ok(requests.get(f"{API}/products"))["products"]
    categories = ok(requests.get(f"{API}/categories"))["categories"]
    brands = ok(requests.get(f"{API}/brands"))["brands"]
    assert products and categories and brands
    assert all(p["stock"] >= 0 and p["inStock"] == (p["stock"] > 0) for p in products)
    assert all(p["minimumAge"] >= 21 for p in products)

    delivery = ok(requests.get(f"{API}/delivery/window"))
    assert delivery["availableWindows"] and delivery["capacityPerWindow"] > 0
    assert all(w["remaining"] >= 0 for w in delivery["availableWindows"])
    assert ok(requests.get(f"{API}/delivery/check", params={"zip": "32832"}))["eligible"] is True

    providers = ok(requests.get(f"{API}/auth/providers"))
    payments = ok(requests.get(f"{API}/payments/config"))
    assert "google" in providers
    assert {"square", "cashApp", "paypal", "applePay", "zelle", "testCard"} <= set(payments)
    state["product"] = max((p for p in products if p["inStock"]), key=lambda p: p["stock"])
    state["window"] = next(w for w in delivery["availableWindows"] if w["available"])


def test_account_password_cart_wishlist_and_loyalty(state):
    browser = requests.Session()
    registration_response = browser.post(f"{API}/auth/register", json={
        "email": state["email"], "password": state["password"], "firstName": "Audit", "lastName": "Customer"
    })
    registration = ok(registration_response)
    cookie_header = registration_response.headers.get("Set-Cookie", "")
    assert "session_token=" in cookie_header and "HttpOnly" in cookie_header and "SameSite=lax" in cookie_header
    assert ok(browser.get(f"{API}/auth/me"))["user"]["email"] == state["email"]
    assert registration["user"]["email"] == state["email"]
    state["user_id"] = registration["user"]["id"]
    state["customer"] = {"Authorization": f"Bearer {registration['token']}"}
    assert ok(requests.get(f"{API}/auth/me", headers=state["customer"]))["user"]["id"] == state["user_id"]

    wishlist_item = {"productId": state["product"]["id"], "slug": state["product"]["slug"], "notify": False}
    assert ok(requests.put(f"{API}/wishlist", headers=state["customer"], json={"items": [wishlist_item]}))["items"] == [wishlist_item]
    assert len(ok(requests.get(f"{API}/wishlist", headers=state["customer"]))["items"]) == 1
    cart_item = {"productId": state["product"]["id"], "slug": state["product"]["slug"], "qty": 1, "name": state["product"]["name"], "price": state["product"]["salePrice"] or state["product"]["price"]}
    assert len(ok(requests.put(f"{API}/cart", headers=state["customer"], json={"items": [cart_item]}))["items"]) == 1
    assert len(ok(requests.get(f"{API}/cart", headers=state["customer"]))["items"]) == 1
    loyalty = ok(requests.get(f"{API}/loyalty/me", headers=state["customer"]))
    assert loyalty["available"] >= registration.get("signupBonusPoints", 0)

    forgot = ok(requests.post(f"{API}/auth/forgot-password", json={"email": state["email"]}))
    assert forgot["ok"] is True and forgot.get("resetToken")
    new_password = "AuditCustomer-456!"
    reset = ok(requests.post(f"{API}/auth/reset-password", json={"token": forgot["resetToken"], "password": new_password}))
    assert reset["ok"] is True
    assert requests.post(f"{API}/auth/login", json={"email": state["email"], "password": state["password"]}).status_code == 401
    login = ok(requests.post(f"{API}/auth/login", json={"email": state["email"], "password": new_password, "rememberMe": True}))
    state["customer"] = {"Authorization": f"Bearer {login['token']}"}
    assert requests.get(f"{API}/admin/stats", headers=state["customer"]).status_code == 403
    assert requests.get(f"{API}/admin/stats").status_code == 401

    assert ok(requests.post(f"{API}/auth/logout", headers=state["customer"]))["ok"] is True
    assert requests.get(f"{API}/auth/me", headers=state["customer"]).status_code == 401
    login = ok(requests.post(f"{API}/auth/login", json={"email": state["email"], "password": new_password, "rememberMe": True}))
    state["customer"] = {"Authorization": f"Bearer {login['token']}"}


def test_support_newsletter_stock_alert_and_chat(state):
    assert ok(requests.post(f"{API}/contact", json={
        "name": "Audit Customer", "email": state["email"], "subject": "Workflow audit", "message": "Please verify the support workflow."
    }))["ok"] is True
    assert ok(requests.post(f"{API}/newsletter", json={"email": state["email"]}))["ok"] is True
    assert ok(requests.post(f"{API}/stock-alerts", headers=state["customer"], json={
        "productId": state["product"]["id"], "productSlug": state["product"]["slug"], "name": state["product"]["name"], "email": state["email"]
    }))["ok"] is True

    status = ok(requests.get(f"{API}/chat/status"))
    assert status["enabled"] is True
    chat = ok(requests.post(f"{API}/chat/start", headers=state["customer"], json={
        "name": "Audit Customer", "contact": state["email"], "message": "Testing customer support."
    }))
    state["chat_id"] = chat["conversation"]["id"]
    state["chat_token"] = chat["token"]
    inbox = ok(requests.get(f"{API}/admin/chat/conversations", headers=state["admin"], params={"status": "open"}))
    assert any(c["id"] == state["chat_id"] for c in inbox["conversations"])
    ok(requests.post(f"{API}/admin/chat/conversations/{state['chat_id']}/reply", headers=state["admin"], json={"message": "Support reply received."}))
    thread = ok(requests.get(f"{API}/chat/conversation", headers={"X-Chat-Token": state["chat_token"]}))
    assert any(m["text"] == "Support reply received." for m in thread["messages"])
    resolved = ok(requests.put(f"{API}/admin/chat/conversations/{state['chat_id']}/status", headers=state["admin"], json={"status": "resolved"}))
    assert resolved["status"] == "resolved"


def test_checkout_payment_inventory_tracking_and_order_support(state):
    product = state["product"]
    before_stock = product["stock"]
    item = {"productId": product["id"], "name": product["name"], "price": product["salePrice"] or product["price"], "qty": 1, "slug": product["slug"]}
    shipping = {"firstName": "Audit", "lastName": "Customer", "email": state["email"], "phone": "4075550101", "address": "481 N State Rd 434", "city": "Altamonte Springs", "state": "Florida", "zip": "32832"}
    base = {"items": [item], "shipping": shipping, "paymentMethod": "test_card", "paymentLast4": "4242", "deliveryWindowId": state["window"]["id"], "ageAttestationAccepted": True}

    underage = requests.post(f"{API}/orders", headers=state["customer"], json={**base, "dateOfBirth": "2010-01-01"})
    assert underage.status_code == 400 and "21" in underage.text
    invalid_quantity = requests.post(f"{API}/orders", headers=state["customer"], json={**base, "items": [{**item, "qty": -1}], "dateOfBirth": "1990-01-01"})
    assert invalid_quantity.status_code == 422
    unavailable = requests.post(f"{API}/orders", headers=state["customer"], json={**base, "dateOfBirth": "1990-01-01", "paymentMethod": "paypal"})
    assert unavailable.status_code == 400 and "not available" in unavailable.text

    promo = ok(requests.post(f"{API}/admin/promos", headers=state["admin"], json={"code": f"AUDIT{state['suffix']}", "type": "percent", "value": 10, "minSubtotal": 0, "active": True}))
    validated = ok(requests.post(f"{API}/promo/validate", json={"code": promo["code"], "items": [item]}))
    assert validated["discount"] > 0
    order = ok(requests.post(f"{API}/orders", headers=state["customer"], json={**base, "dateOfBirth": "1990-01-01", "promoCode": promo["code"], "tip": 2.5}))
    state["order"] = order
    assert order["paymentStatus"] == "paid" and order["paymentBrand"] == "Test Card"
    assert order["tip"] == 2.5 and order["discount"] > 0 and order["ageVerified"] is True
    assert requests.get(f"{API}/orders/track/{order['orderNumber']}", params={"email": "wrong@example.com"}).status_code == 404
    tracked = ok(requests.get(f"{API}/orders/track/{order['orderNumber']}", params={"email": state["email"]}))
    assert tracked["id"] == order["id"] and tracked["deliveryWindow"]["id"] == state["window"]["id"]
    assert "shipping" not in tracked and "paymentRef" not in tracked
    assert requests.get(f"{API}/orders/{order['id']}").status_code == 403
    detail = ok(requests.get(f"{API}/orders/{order['id']}", headers={"X-Order-Access": tracked["orderAccessToken"]}))
    assert detail["shipping"]["email"] == state["email"]
    assert len(ok(requests.get(f"{API}/orders", headers=state["customer"]))["orders"]) >= 1
    after = ok(requests.get(f"{API}/products/{product['slug']}"))
    assert after["stock"] == before_stock - 1

    unauthorized_issue = requests.post(f"{API}/orders/{order['id']}/issues", json={
        "email": state["email"], "kind": "other", "message": "Missing signed order access"
    })
    assert unauthorized_issue.status_code == 403
    signed_issue = ok(requests.post(f"{API}/orders/{order['id']}/issues", headers={"X-Order-Access": tracked["orderAccessToken"]}, json={
        "email": state["email"], "kind": "other", "message": "Signed guest support request"
    }))
    assert signed_issue["issues"][-1]["status"] == "open"

    issue_order = ok(requests.post(f"{API}/orders/{order['id']}/issues", headers=state["customer"], json={
        "email": state["email"], "kind": "driver_late", "message": "Audit support request"
    }))
    assert issue_order["issues"][-1]["status"] == "open"
    issue = issue_order["issues"][-1]
    resolved = ok(requests.put(f"{API}/admin/orders/{order['id']}/issues/{issue['id']}", headers=state["admin"], json={"status": "resolved", "resolution": "Audit resolved"}))
    assert resolved["issues"][-1]["status"] == "resolved"


def test_dispatch_id_compliance_tracking_analytics_and_email_logs(state):
    order = state["order"]
    order_id = order["id"]
    dispatched = ok(requests.put(f"{API}/admin/orders/{order_id}/dispatch", headers=state["admin"], json={
        "driverName": "Audit Driver", "driverPhoneLast4": "0101", "etaMinutes": 35, "dispatchNotes": "Audit route"
    }))
    assert dispatched["dispatch"]["driverName"] == "Audit Driver"
    out = ok(requests.put(f"{API}/admin/orders/{order_id}/status", headers=state["admin"], json={"status": "out_for_delivery"}))
    assert out["status"] == "out_for_delivery"
    out = ok(requests.put(f"{API}/admin/orders/{order_id}/delivery-details", headers=state["admin"], json={"deliveryPhotoUrl": "https://example.com/door.jpg", "driverTextSent": True}))
    assert out["deliveryPhotoUrl"].endswith("door.jpg") and out["driverTextSent"] is True
    blocked = requests.put(f"{API}/admin/orders/{order_id}/status", headers=state["admin"], json={"status": "delivered"})
    assert blocked.status_code == 409
    checked = ok(requests.put(f"{API}/admin/orders/{order_id}/id-check", headers=state["admin"], json={
        "result": "passed", "idType": "Driver license", "photoIdValid": True, "age21Confirmed": True,
        "nameMatchesOrder": True, "expirationValid": True, "checkedBy": "Audit Driver"
    }))
    assert checked["idCheck"]["status"] == "passed" and checked["idCheck"]["fullIdImageStored"] is False
    delivered = ok(requests.put(f"{API}/admin/orders/{order_id}/status", headers=state["admin"], json={"status": "delivered"}))
    assert delivered["status"] == "delivered"

    ops = ok(requests.get(f"{API}/admin/operations", headers=state["admin"], params={"date": delivered["deliveryDate"]}))
    assert any(o["id"] == order_id for o in ops["orders"])
    compliance = ok(requests.get(f"{API}/admin/compliance", headers=state["admin"]))
    assert compliance["privacy"]["storesFullIdImages"] is False
    assert any(e["orderId"] == order_id and e["event"] == "door_id_check" for e in compliance["events"])
    export = requests.get(f"{API}/admin/compliance/export.csv", headers=state["admin"])
    assert export.status_code == 200 and "full_id_image_stored" in export.text and order["orderNumber"] in export.text
    analytics = ok(requests.get(f"{API}/admin/analytics", headers=state["admin"], params={"days": 30}))
    assert analytics["summary"]["orders"] >= 1 and analytics["summary"]["paidOrders"] >= 1
    stats = ok(requests.get(f"{API}/admin/stats", headers=state["admin"]))
    assert stats["totalOrders"] >= 1 and stats["activeProducts"] > 0
    emails = ok(requests.get(f"{API}/admin/emails", headers=state["admin"]))
    assert any(e["kind"] in {"order_confirmation", "order_status", "password_reset"} for e in emails["emails"])


def test_admin_selected_zip_settings_and_inventory_views(state):
    settings = ok(requests.get(f"{API}/admin/settings", headers=state["admin"]))
    selected = ["32832", "32714"]
    updated = ok(requests.put(f"{API}/admin/settings", headers=state["admin"], json={**settings, "allowedZipCodes": selected}))
    assert updated["allowedZipCodes"] == selected
    assert ok(requests.get(f"{API}/delivery/check", params={"zip": "32714"}))["eligible"] is True
    denied = ok(requests.get(f"{API}/delivery/check", params={"zip": "33101"}))
    assert denied["eligible"] is False
    alerts = ok(requests.get(f"{API}/admin/stock-alerts", headers=state["admin"]))
    assert any(a["email"] == state["email"] for a in alerts["alerts"])
    orders = ok(requests.get(f"{API}/admin/orders", headers=state["admin"]))
    assert any(o["id"] == state["order"]["id"] for o in orders["orders"])


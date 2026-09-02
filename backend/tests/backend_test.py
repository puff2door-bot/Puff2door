"""Puff2Door backend API tests (auth incl. Google session, wishlist, stock alerts, cart, reviews, orders)."""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"

GOOGLE_SESSION_TOKEN = "test_session_google_1"
GOOGLE_EMAIL = "google.tester@example.com"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def jwt_account(client):
    email = f"TEST_qa.user+{uuid.uuid4().hex[:8]}@example.com"
    r = client.post(f"{API}/auth/register", json={
        "email": email, "password": "Password123!", "firstName": "Qa", "lastName": "User"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and data["token"]
    assert data["user"]["email"] == email.lower()
    return {"email": email, "password": "Password123!", "token": data["token"], "id": data["user"]["id"]}


def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ----------------------------- Health -----------------------------
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json()["message"] == "Puff2Door API"


# ----------------------------- Auth -----------------------------
class TestAuth:
    def test_me_with_google_session_token(self, client):
        r = client.get(f"{API}/auth/me", headers=auth(GOOGLE_SESSION_TOKEN))
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["email"] == GOOGLE_EMAIL
        assert u["id"] == "test-user-google-1"
        assert u["provider"] == "google"
        assert "_id" not in u and "password" not in u

    def test_me_with_jwt(self, client, jwt_account):
        r = client.get(f"{API}/auth/me", headers=auth(jwt_account["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["user"]["email"] == jwt_account["email"].lower()

    def test_login_with_registered_account(self, client, jwt_account):
        r = client.post(f"{API}/auth/login", json={
            "email": jwt_account["email"], "password": jwt_account["password"]})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["id"] == jwt_account["id"]

    def test_login_bad_password(self, client, jwt_account):
        r = client.post(f"{API}/auth/login", json={"email": jwt_account["email"], "password": "wrong"})
        assert r.status_code == 401

    def test_duplicate_register(self, client, jwt_account):
        # use a strong password so we hit the duplicate-email check, not the strength validator
        r = client.post(f"{API}/auth/register", json={"email": jwt_account["email"], "password": "Password123"})
        assert r.status_code == 400, r.text
        assert "already exists" in r.json()["detail"]

    def test_me_unauthenticated(self, client):
        r = client.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_bad_token(self, client):
        r = client.get(f"{API}/auth/me", headers=auth("garbage-token"))
        assert r.status_code == 401

    def test_google_session_bogus(self, client):
        r = client.post(f"{API}/auth/google/session", json={"session_id": "bogus"})
        assert r.status_code == 401, r.text
        assert r.json()["detail"] == "Invalid or expired Google session"


# ----------------------------- Wishlist -----------------------------
class TestWishlist:
    def test_wishlist_unauthenticated(self, client):
        assert client.get(f"{API}/wishlist").status_code == 401
        assert client.put(f"{API}/wishlist", json={"items": []}).status_code == 401

    def test_wishlist_put_get_session_token(self, client):
        items = [{"productId": 14, "slug": "x", "notify": False}]
        r = client.put(f"{API}/wishlist", headers=auth(GOOGLE_SESSION_TOKEN), json={"items": items})
        assert r.status_code == 200, r.text
        assert r.json()["items"] == items
        g = client.get(f"{API}/wishlist", headers=auth(GOOGLE_SESSION_TOKEN))
        assert g.status_code == 200
        assert g.json()["items"] == items

    def test_wishlist_jwt_isolated(self, client, jwt_account):
        g = client.get(f"{API}/wishlist", headers=auth(jwt_account["token"]))
        assert g.status_code == 200
        assert g.json()["items"] == []
        items = [{"productId": 16, "slug": "raz", "notify": True}]
        client.put(f"{API}/wishlist", headers=auth(jwt_account["token"]), json={"items": items})
        assert client.get(f"{API}/wishlist", headers=auth(jwt_account["token"])).json()["items"] == items
        # other user's list unaffected
        assert client.get(f"{API}/wishlist", headers=auth(GOOGLE_SESSION_TOKEN)).json()["items"][0]["productId"] == 14

    def test_wishlist_clear(self, client, jwt_account):
        client.put(f"{API}/wishlist", headers=auth(jwt_account["token"]), json={"items": []})
        assert client.get(f"{API}/wishlist", headers=auth(jwt_account["token"])).json()["items"] == []


# ----------------------------- Stock alerts -----------------------------
class TestStockAlerts:
    def test_create_alert_no_auth_lowercases_email(self, client):
        payload = {"productId": 16, "productSlug": "raz", "name": "RAZ", "email": "Guest@Example.com"}
        r = client.post(f"{API}/stock-alerts", json=payload)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True, "email": "guest@example.com"}

    def test_idempotent(self, client):
        payload = {"productId": 16, "productSlug": "raz", "name": "RAZ", "email": "guest@example.com"}
        client.post(f"{API}/stock-alerts", json=payload)
        r = client.post(f"{API}/stock-alerts", json=payload)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_invalid_email(self, client):
        r = client.post(f"{API}/stock-alerts", json={"productId": 16, "email": "not-an-email"})
        assert r.status_code == 422

    def test_missing_product_id(self, client):
        r = client.post(f"{API}/stock-alerts", json={"email": "a@b.com"})
        assert r.status_code == 422

    def test_alert_with_auth(self, client, jwt_account):
        r = client.post(f"{API}/stock-alerts", headers=auth(jwt_account["token"]),
                        json={"productId": 24, "productSlug": "foger", "name": "FOGER", "email": jwt_account["email"]})
        assert r.status_code == 200
        assert r.json()["email"] == jwt_account["email"].lower()


# ----------------------------- Cart -----------------------------
class TestCart:
    def test_cart_unauthenticated(self, client):
        assert client.get(f"{API}/cart").status_code == 401

    def test_cart_put_get(self, client, jwt_account):
        items = [{"productId": 14, "name": "Geek Bar", "price": 19.99, "qty": 2,
                  "slug": "geek-bar-14", "category": "Disposable", "categorySlug": "disposable", "image": ""}]
        r = client.put(f"{API}/cart", headers=auth(jwt_account["token"]), json={"items": items})
        assert r.status_code == 200, r.text
        g = client.get(f"{API}/cart", headers=auth(jwt_account["token"]))
        assert g.status_code == 200
        got = g.json()["items"]
        assert len(got) == 1 and got[0]["productId"] == 14 and got[0]["qty"] == 2 and got[0]["price"] == 19.99


# ----------------------------- Reviews -----------------------------
class TestReviews:
    def test_get_reviews(self, client):
        r = client.get(f"{API}/reviews/puff2door-preview")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["reviews"], list) and isinstance(d["count"], int)

    def test_post_review_and_persist(self, client):
        slug = "puff2door-preview"
        before = client.get(f"{API}/reviews/{slug}").json()["count"]
        name = f"TEST_Reviewer {uuid.uuid4().hex[:6]}"
        r = client.post(f"{API}/reviews", json={"productSlug": slug, "name": name, "rating": 5, "comment": "Great"})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == name and r.json()["rating"] == 5
        after = client.get(f"{API}/reviews/{slug}").json()
        assert after["count"] == before + 1
        assert any(x["name"] == name for x in after["reviews"])

    def test_invalid_rating(self, client):
        r = client.post(f"{API}/reviews", json={"productSlug": "x", "name": "n", "rating": 9})
        assert r.status_code == 422


# ----------------------------- Orders -----------------------------
class TestOrders:
    order = {}

    def test_create_order_guest(self, client):
        payload = {
            "items": [{"productId": 14, "name": "Geek Bar", "price": 19.99, "qty": 1, "slug": "geek-bar-14"}],
            "shipping": {"firstName": "TEST", "lastName": "Buyer", "email": "test@example.com",
                         "phone": "5551234567", "address": "1 Main St", "city": "Reno", "state": "NV", "zip": "89501"},
            "subtotal": 19.99, "shippingCost": 0, "discount": 0, "total": 19.99, "paymentLast4": "4242",
        }
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["orderNumber"].startswith("P2D-")
        # Server recomputes pricing: client-sent $19.99 is floored to the real product price (+ shipping under $75)
        assert d["items"][0]["price"] >= 19.99
        assert d["total"] == round(d["subtotal"] + d["shippingCost"] + d["tax"], 2)
        assert d["tax"] == round(d["subtotal"] * 0.065, 2)
        assert d["status"] == "placed"
        assert len(d["timeline"]) == 4
        assert "_id" not in d
        TestOrders.order = d

    def test_get_order_by_id(self, client):
        d = TestOrders.order
        r = client.get(f"{API}/orders/{d['id']}")
        assert r.status_code == 200
        assert r.json()["orderNumber"] == d["orderNumber"]

    def test_track_order(self, client):
        d = TestOrders.order
        r = client.get(f"{API}/orders/track/{d['orderNumber'].lower()}")
        assert r.status_code == 200, r.text
        assert r.json()["id"] == d["id"]

    def test_track_unknown(self, client):
        assert client.get(f"{API}/orders/track/P2D-00000000").status_code == 404

    def test_order_for_user_clears_cart_and_lists(self, client, jwt_account):
        h = auth(jwt_account["token"])
        client.put(f"{API}/cart", headers=h, json={"items": [
            {"productId": 1, "name": "x", "price": 5, "qty": 1}]})
        payload = {
            "items": [{"productId": 1, "name": "x", "price": 5, "qty": 1}],
            "shipping": {"firstName": "TEST", "email": jwt_account["email"]},
            "subtotal": 5, "total": 5,
        }
        r = client.post(f"{API}/orders", headers=h, json=payload)
        assert r.status_code == 200, r.text
        assert client.get(f"{API}/cart", headers=h).json()["items"] == []
        lst = client.get(f"{API}/orders", headers=h)
        assert lst.status_code == 200
        assert any(o["id"] == r.json()["id"] for o in lst.json()["orders"])

    def test_orders_list_unauth(self, client):
        assert client.get(f"{API}/orders").status_code == 401


# ----------------------------- Logout (uses a throwaway session) -----------------------------
class TestLogout:
    def test_logout_invalidates_session(self, client):
        import subprocess
        tok = f"test_session_logout_{int(time.time())}"
        js = (
            "db=db.getSiblingDB('test_database');"
            f"db.user_sessions.insertOne({{userId:'test-user-google-1',session_token:'{tok}',"
            "expires_at:new Date(Date.now()+7*24*60*60*1000),createdAt:new Date()});"
        )
        subprocess.run(["mongosh", "--quiet", "--eval", js], check=True, capture_output=True)
        assert client.get(f"{API}/auth/me", headers=auth(tok)).status_code == 200
        r = client.post(f"{API}/auth/logout", headers=auth(tok))
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        assert client.get(f"{API}/auth/me", headers=auth(tok)).status_code == 401
        # seeded google session must still be valid
        assert client.get(f"{API}/auth/me", headers=auth(GOOGLE_SESSION_TOKEN)).status_code == 200

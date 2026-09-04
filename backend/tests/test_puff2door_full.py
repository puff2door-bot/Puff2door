"""Comprehensive backend tests for Puff2Door: products, auth (password rules, remember-me,
forgot/reset, lockout), google session, wishlist, stock alerts, inventory, admin panel."""
import os
import time
import subprocess

import jwt
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"

ADMIN_EMAIL = "admin@puff2door.com"
ADMIN_PW = "Puff2Door-Admin1"
GOOGLE_TOKEN = "test_session_google_1"

TS = str(int(time.time()))


def mongosh(js):
    return subprocess.run(["mongosh", "--quiet", "--eval", js], capture_output=True, text=True).stdout


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code} {r.text[:300]}")
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def customer(s):
    email = f"TEST_qa_{TS}_{os.getpid()}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Password123", "firstName": "QA"})
    assert r.status_code == 200, r.text
    return {"email": email, "password": "Password123", "token": r.json()["token"], "id": r.json()["user"]["id"]}


# ---------------- Products ----------------
class TestProducts:
    def test_list_products(self, s):
        r = s.get(f"{API}/products")
        assert r.status_code == 200
        prods = r.json()["products"]
        assert len(prods) >= 60, f"only {len(prods)} products"
        p = prods[0]
        for k in ["id", "slug", "name", "price", "salePrice", "stock", "inStock", "brandName", "flavors", "puffs"]:
            assert k in p, f"missing {k}"
        assert all(x.get("active", True) for x in prods)

    def test_get_product_by_slug(self, s):
        slug = s.get(f"{API}/products").json()["products"][0]["slug"]
        r = s.get(f"{API}/products/{slug}")
        assert r.status_code == 200
        assert r.json()["slug"] == slug

    def test_unknown_slug_404(self, s):
        assert s.get(f"{API}/products/no-such-product-xyz").status_code == 404


# ---------------- Password rules / remember me ----------------
class TestPasswordRules:
    @pytest.mark.parametrize("pw", ["short", "abcdefgh", "12345678"])
    def test_weak_rejected(self, s, pw):
        r = s.post(f"{API}/auth/register", json={"email": f"TEST_weak_{TS}_{pw}@example.com", "password": pw})
        assert r.status_code == 422, f"{pw} -> {r.status_code}"

    def test_strong_accepted(self, customer):
        assert customer["token"]

    def test_duplicate_email_400(self, s, customer):
        r = s.post(f"{API}/auth/register", json={"email": customer["email"], "password": "Password123"})
        assert r.status_code == 400

    def test_remember_me_exp(self, s, customer):
        r1 = s.post(f"{API}/auth/login", json={"email": customer["email"], "password": customer["password"]})
        r2 = s.post(f"{API}/auth/login", json={"email": customer["email"], "password": customer["password"], "rememberMe": True})
        assert r1.status_code == 200 and r2.status_code == 200
        d1 = jwt.decode(r1.json()["token"], options={"verify_signature": False})
        d2 = jwt.decode(r2.json()["token"], options={"verify_signature": False})
        days1 = (d1["exp"] - d1["iat"]) / 86400
        days2 = (d2["exp"] - d2["iat"]) / 86400
        assert 0.9 < days1 < 1.1, days1
        assert 29 < days2 < 31, days2

    def test_password_hash_format(self):
        out = mongosh(f"db=db.getSiblingDB('{os.environ.get('DB_NAME','test_database')}');print(db.users.findOne({{email:'{ADMIN_EMAIL}'}}).password.substring(0,12))")
        assert out.strip(), "could not read hash"
        # documenting scheme in use
        assert out.startswith("$"), out


# ---------------- Forgot / reset ----------------
class TestReset:
    def test_full_reset_flow(self, s):
        email = f"TEST_reset_{TS}@example.com"
        assert s.post(f"{API}/auth/register", json={"email": email, "password": "Password123"}).status_code == 200
        r = s.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r.status_code == 200
        token = r.json().get("resetToken")
        assert token, r.text
        # unknown email -> generic no token
        r2 = s.post(f"{API}/auth/forgot-password", json={"email": f"nobody_{TS}@example.com"})
        assert r2.status_code == 200 and "resetToken" not in r2.json()
        # reset
        r3 = s.post(f"{API}/auth/reset-password", json={"token": token, "password": "NewPass456"})
        assert r3.status_code == 200
        assert r3.json()["user"]["email"] == email.lower() and r3.json()["token"]
        # reuse -> 400
        assert s.post(f"{API}/auth/reset-password", json={"token": token, "password": "NewPass789"}).status_code == 400
        # new pw works, old fails
        assert s.post(f"{API}/auth/login", json={"email": email, "password": "NewPass456"}).status_code == 200
        assert s.post(f"{API}/auth/login", json={"email": email, "password": "Password123"}).status_code == 401


# ---------------- Brute force ----------------
class TestLockout:
    def test_lockout(self, s):
        email = f"TEST_lock_{TS}@example.com"
        assert s.post(f"{API}/auth/register", json={"email": email, "password": "Password123"}).status_code == 200
        codes = []
        for _ in range(5):
            codes.append(s.post(f"{API}/auth/login", json={"email": email, "password": "Wrong999x"}).status_code)
        assert codes == [401] * 5, codes
        r = s.post(f"{API}/auth/login", json={"email": email, "password": "Wrong999x"})
        assert r.status_code == 429, r.status_code
        assert "Too many failed attempts" in r.text
        # even correct password is blocked while locked
        r2 = s.post(f"{API}/auth/login", json={"email": email, "password": "Password123"})
        assert r2.status_code == 429
        mongosh(f"db=db.getSiblingDB('{os.environ.get('DB_NAME','test_database')}');db.login_attempts.deleteMany({{}})")
        assert s.post(f"{API}/auth/login", json={"email": email, "password": "Password123"}).status_code == 200


# ---------------- Google session ----------------
class TestGoogle:
    def test_bogus_session(self, s):
        r = s.post(f"{API}/auth/google/session", json={"session_id": "bogus-session-id-xyz"})
        assert r.status_code == 401, r.status_code

    def test_seeded_session(self, s):
        h = {"Authorization": f"Bearer {GOOGLE_TOKEN}"}
        r = s.get(f"{API}/auth/me", headers=h)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["email"] == "google.tester@example.com" and u["role"] == "customer"
        assert s.get(f"{API}/wishlist", headers=h).status_code == 200
        pr = s.put(f"{API}/wishlist", headers=h, json={"items": [{"productId": 14, "slug": "x", "notify": False}]})
        assert pr.status_code == 200 and pr.json()["items"][0]["productId"] == 14
        assert s.post(f"{API}/auth/logout", headers=h).status_code == 200
        assert s.get(f"{API}/auth/me", headers=h).status_code == 401
        # re-seed
        mongosh(
            "db=db.getSiblingDB('%s');db.user_sessions.insertOne({userId:'test-user-google-1',session_token:'%s',expires_at:new Date(Date.now()+7*24*3600*1000),createdAt:new Date()});"
            % (os.environ.get('DB_NAME', 'test_database'), GOOGLE_TOKEN)
        )
        assert s.get(f"{API}/auth/me", headers=h).status_code == 200


# ---------------- Wishlist / stock alerts auth ----------------
class TestWishlistAlerts:
    def test_wishlist_requires_auth(self, s):
        assert s.get(f"{API}/wishlist").status_code == 401
        assert s.put(f"{API}/wishlist", json={"items": []}).status_code == 401

    def test_stock_alert_guest(self, s):
        r = s.post(f"{API}/stock-alerts", json={"productId": 24, "productSlug": "x", "name": "N", "email": f"TEST_Guest_{TS}@Example.COM"})
        assert r.status_code == 200
        assert r.json()["email"] == f"test_guest_{TS}@example.com"
        # upsert idempotent
        assert s.post(f"{API}/stock-alerts", json={"productId": 24, "productSlug": "x", "name": "N", "email": f"TEST_Guest_{TS}@example.com"}).status_code == 200


# ---------------- Inventory / orders ----------------
def make_order_payload(prod, qty):
    return {
        "items": [{"productId": prod["id"], "name": prod["name"], "price": prod["price"], "slug": prod["slug"], "qty": qty}],
        "shipping": {"firstName": "T", "lastName": "T", "email": "t@t.com", "phone": "1", "address": "a", "city": "c", "state": "FL", "zip": "32801"},
        "subtotal": prod["price"] * qty, "shippingCost": 0, "discount": 0, "total": prod["price"] * qty,
        "paymentLast4": "4242",
    }


class TestInventory:
    def test_insufficient_stock_409(self, s):
        prods = [p for p in s.get(f"{API}/products").json()["products"] if p["stock"] > 0]
        p = prods[0]
        r = s.post(f"{API}/orders", json=make_order_payload(p, p["stock"] + 50))
        assert r.status_code == 409, r.status_code
        assert "Only" in r.text or "sold out" in r.text

    def test_sold_out_409(self, s):
        prods = [p for p in s.get(f"{API}/products").json()["products"] if p["stock"] == 0]
        if not prods:
            pytest.skip("no sold-out product")
        r = s.post(f"{API}/orders", json=make_order_payload(prods[0], 1))
        assert r.status_code == 409 and "sold out" in r.text

    def test_unknown_product_409(self, s):
        fake = {"id": 999999, "name": "Ghost", "price": 10.0, "slug": "ghost"}
        assert s.post(f"{API}/orders", json=make_order_payload(fake, 1)).status_code == 409

    def test_valid_order_decrements_stock(self, s):
        p = [x for x in s.get(f"{API}/products").json()["products"] if x["stock"] > 3][0]
        before = s.get(f"{API}/products/{p['slug']}").json()["stock"]
        r = s.post(f"{API}/orders", json=make_order_payload(p, 2))
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["orderNumber"].startswith("P2D-") and o["status"] == "placed"
        after = s.get(f"{API}/products/{p['slug']}").json()["stock"]
        assert after == before - 2, (before, after)


# ---------------- Admin ----------------
class TestAdmin:
    created_ids = []

    def test_non_admin_403(self, s, customer):
        h = {"Authorization": f"Bearer {customer['token']}"}
        for ep in ["/admin/stats", "/admin/products", "/admin/orders", "/admin/stock-alerts"]:
            assert s.get(f"{API}{ep}", headers=h).status_code == 403, ep

    def test_no_auth_401(self, s):
        assert s.get(f"{API}/admin/stats").status_code == 401

    def test_stats(self, s, admin_h):
        r = s.get(f"{API}/admin/stats", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        for k in ["totalOrders", "todayOrders", "revenue", "activeProducts", "lowStock", "pendingAlerts", "customers"]:
            assert k in d
        assert d["activeProducts"] > 0

    def test_lists(self, s, admin_h):
        assert len(s.get(f"{API}/admin/products", headers=admin_h).json()["products"]) > 0
        assert "orders" in s.get(f"{API}/admin/orders", headers=admin_h).json()
        assert "alerts" in s.get(f"{API}/admin/stock-alerts", headers=admin_h).json()

    def test_product_crud_and_restock_notify(self, s, admin_h):
        payload = {
            "name": f"TEST_Admin Product {TS}", "category": "Disposable Vape", "categorySlug": "disposable",
            "price": 19.99, "salePrice": None, "image": "", "brand": "test", "brandName": "TEST",
            "flavors": ["Mango"], "puffs": 15000, "stock": 0, "active": True, "description": "test",
        }
        r = s.post(f"{API}/admin/products", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        p = r.json()
        pid = p["id"]
        TestAdmin.created_ids.append(pid)
        assert p["slug"].startswith("test-admin-product") and p["stock"] == 0 and p["inStock"] is False

        # stock alert for it then restock -> notified
        s.post(f"{API}/stock-alerts", json={"productId": pid, "productSlug": p["slug"], "name": p["name"], "email": f"TEST_restock_{TS}@example.com"})
        upd = {**payload, "price": 24.99, "salePrice": 18.99, "stock": 7}
        r2 = s.put(f"{API}/admin/products/{pid}", headers=admin_h, json=upd)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["price"] == 24.99 and d2["salePrice"] == 18.99 and d2["stock"] == 7
        assert d2["restockNotified"] >= 1, d2["restockNotified"]
        # persisted publicly
        pub = s.get(f"{API}/products/{p['slug']}")
        assert pub.status_code == 200 and pub.json()["price"] == 24.99 and pub.json()["stock"] == 7
        # alert marked notified
        alerts = s.get(f"{API}/admin/stock-alerts", headers=admin_h).json()["alerts"]
        mine = [a for a in alerts if a["productId"] == pid]
        assert mine and mine[0]["notified"] is True

        # update missing product -> 404
        assert s.put(f"{API}/admin/products/999999", headers=admin_h, json=upd).status_code == 404

        # delete hides
        assert s.delete(f"{API}/admin/products/{pid}", headers=admin_h).status_code == 200
        assert s.get(f"{API}/products/{p['slug']}").status_code == 404
        assert pid not in [x["id"] for x in s.get(f"{API}/products").json()["products"]]
        assert s.delete(f"{API}/admin/products/999999", headers=admin_h).status_code == 404

    def test_order_status_override(self, s, admin_h):
        p = [x for x in s.get(f"{API}/products").json()["products"] if x["stock"] > 1][0]
        order = s.post(f"{API}/orders", json=make_order_payload(p, 1)).json()
        oid = order["id"]
        r = s.put(f"{API}/admin/orders/{oid}/status", headers=admin_h, json={"status": "delivered"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "delivered" and all(t["done"] for t in d["timeline"])
        pub = s.get(f"{API}/orders/{oid}").json()
        assert pub["status"] == "delivered"
        # mid status
        r3 = s.put(f"{API}/admin/orders/{oid}/status", headers=admin_h, json={"status": "confirmed"})
        tl = r3.json()["timeline"]
        assert r3.json()["status"] == "confirmed"
        assert [t["done"] for t in tl] == [True, True, False, False]
        assert s.put(f"{API}/admin/orders/{oid}/status", headers=admin_h, json={"status": "bogus"}).status_code == 400
        assert s.put(f"{API}/admin/orders/{'x'*20}/status", headers=admin_h, json={"status": "delivered"}).status_code == 404

    def test_upload(self, s, admin_token):
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0000003010100"
            "18dd8db00000000049454e44ae426082"
        )
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{API}/admin/upload", headers=h, files={"file": ("t.png", png, "image/png")})
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        d = r.json()
        assert d["url"].startswith("/api/files/")
        g = requests.get(BASE_URL + d["url"])
        assert g.status_code == 200
        assert g.headers["content-type"].startswith("image/")
        # bad ext
        rb = requests.post(f"{API}/admin/upload", headers=h, files={"file": ("t.txt", b"hello", "text/plain")})
        assert rb.status_code == 400

    def test_files_unknown_404(self, s):
        assert s.get(f"{API}/files/nope/none.png").status_code == 404


# ---------------- Regression ----------------
class TestRegression:
    def test_cart_persist(self, s, customer):
        h = {"Authorization": f"Bearer {customer['token']}", "Content-Type": "application/json"}
        items = [{"productId": 1, "name": "X", "price": 10.0, "qty": 2, "slug": "x"}]
        assert s.put(f"{API}/cart", headers=h, json={"items": items}).status_code == 200
        got = s.get(f"{API}/cart", headers=h).json()["items"]
        assert got[0]["qty"] == 2

    def test_reviews(self, s):
        slug = s.get(f"{API}/products").json()["products"][0]["slug"]
        r = s.post(f"{API}/reviews", json={"productSlug": slug, "name": "TEST_QA", "rating": 5, "comment": "great"})
        assert r.status_code == 200 and r.json()["rating"] == 5
        g = s.get(f"{API}/reviews/{slug}").json()
        assert g["count"] >= 1 and any(x["name"] == "TEST_QA" for x in g["reviews"])

    def test_order_tracking(self, s):
        p = [x for x in s.get(f"{API}/products").json()["products"] if x["stock"] > 1][0]
        o = s.post(f"{API}/orders", json=make_order_payload(p, 1)).json()
        t = s.get(f"{API}/orders/track/{o['orderNumber'].lower()}")
        assert t.status_code == 200 and t.json()["id"] == o["id"]
        assert s.get(f"{API}/orders/track/P2D-00000000").status_code == 404

    def test_my_orders(self, s, customer):
        h = {"Authorization": f"Bearer {customer['token']}", "Content-Type": "application/json"}
        assert "orders" in s.get(f"{API}/orders", headers=h).json()

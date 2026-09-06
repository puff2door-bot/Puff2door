import asyncio
import os
import sys

import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def client():
    transport = httpx.ASGITransport(app=server.app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


CART = {"items": [{"productId": 14, "name": "x", "price": 26.5, "qty": 1}], "shipping": {"firstName": "A", "lastName": "B", "zip": "32801"}}


def test_square_mocked_success_and_decline(client, monkeypatch):
    monkeypatch.setattr(server, "SQUARE_ENABLED", True)
    calls = {}

    async def fake_square(source_id, amount_cents, idem_key, reference):
        calls["amount"] = amount_cents
        if source_id == "decline":
            raise server.HTTPException(status_code=402, detail="Payment failed: CARD_DECLINED")
        return {"id": "sq_pay_1", "status": "COMPLETED", "card_details": {"card": {"last_4": "1111", "card_brand": "VISA"}}}

    monkeypatch.setattr(server, "square_create_payment", fake_square)

    async def go():
        before = (await client.get("/api/products/geek-bar-pulse-2-25k-grape-hubba-14")).json()["stock"]
        r = await client.post("/api/orders", json={**CART, "paymentMethod": "square", "paymentToken": "cnon:ok"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paymentStatus"] == "paid" and d["paymentBrand"] == "VISA" and d["paymentLast4"] == "1111" and d["paymentRef"] == "sq_pay_1"
        assert calls["amount"] == int(round(d["total"] * 100))
        r2 = await client.post("/api/orders", json={**CART, "paymentMethod": "square", "paymentToken": "decline"})
        assert r2.status_code == 402 and "CARD_DECLINED" in r2.text
        after = (await client.get("/api/products/geek-bar-pulse-2-25k-grape-hubba-14")).json()["stock"]
        assert after == before - 1  # declined order released its stock

    run(go())


def test_paypal_mocked_flow(client, monkeypatch):
    monkeypatch.setattr(server, "PAYPAL_ENABLED", True)
    captures = []

    async def fake_paypal(method, path, body=None):
        if path == "/v2/checkout/orders":
            return {"id": f"PP-ORDER-{len(captures) + 100}", "status": "CREATED"}
        if path.endswith("/capture"):
            captures.append(path)
            if "PP-FAIL" in path:
                raise server.HTTPException(status_code=402, detail="PayPal: PayPal declined the selected payment method. Please choose another in PayPal.")
            return {"status": "COMPLETED", "payer": {"email_address": "buyer@example.com"},
                    "purchase_units": [{"payments": {"captures": [{"id": "CAP-" + path.split("/")[-2]}]}}]}
        raise AssertionError(path)

    monkeypatch.setattr(server, "paypal_request", fake_paypal)

    async def go():
        await server.db.paypal_orders.delete_many({"paypalOrderId": {"$regex": "^PP-"}})
        slug = "geek-bar-pulse-2-25k-grape-hubba-14"
        before = (await client.get(f"/api/products/{slug}")).json()["stock"]
        # 1. normal checkout
        r = await client.post("/api/payments/paypal/create-order", json={"items": CART["items"], "zip": "32801"})
        assert r.status_code == 200 and r.json()["id"] == "PP-ORDER-100"
        r2 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "PP-ORDER-100"})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["paymentStatus"] == "paid" and d["paymentBrand"] == "PayPal" and d["paymentRef"] == "CAP-PP-ORDER-100"
        # 4. duplicate submission → same order returned, NO second capture, no extra stock taken
        r3 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "PP-ORDER-100"})
        assert r3.status_code == 200 and r3.json()["id"] == d["id"] and r3.json()["orderNumber"] == d["orderNumber"]
        assert len(captures) == 1
        assert (await client.get(f"/api/products/{slug}")).json()["stock"] == before - 1
        # unknown / never-created PayPal order
        r4 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "UNKNOWN"})
        assert r4.status_code == 402
        # 3. failed capture → 402, stock released, PayPal record unlocked and not captured
        await server.db.paypal_orders.insert_one({"paypalOrderId": "PP-FAIL-1", "captured": False, "total": d["total"], "createdAt": server.now_utc()})
        r5 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "PP-FAIL-1"})
        assert r5.status_code == 402 and "declined" in r5.json()["detail"]
        pp = await server.db.paypal_orders.find_one({"paypalOrderId": "PP-FAIL-1"})
        assert pp["captured"] is False and pp["capturing"] is False
        assert (await client.get(f"/api/products/{slug}")).json()["stock"] == before - 1
        # concurrent duplicate: a record already being captured is rejected with 409 and never re-captured
        await server.db.paypal_orders.insert_one({"paypalOrderId": "PP-BUSY-1", "captured": False, "capturing": True, "total": d["total"], "createdAt": server.now_utc()})
        r6 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "PP-BUSY-1"})
        assert r6.status_code == 409 and "already being processed" in r6.json()["detail"]
        assert len(captures) == 2
        # amount mismatch (cart changed after PayPal window opened) → 402, no capture
        await server.db.paypal_orders.insert_one({"paypalOrderId": "PP-MISMATCH", "captured": False, "total": d["total"] + 10, "createdAt": server.now_utc()})
        r7 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "PP-MISMATCH"})
        assert r7.status_code == 402 and "does not match" in r7.json()["detail"]
        assert len(captures) == 2
        # 2. cancel: created but never approved → nothing captured, no order
        r8 = await client.post("/api/payments/paypal/create-order", json={"items": CART["items"], "zip": "32801"})
        pp = await server.db.paypal_orders.find_one({"paypalOrderId": r8.json()["id"]})
        assert pp["captured"] is False and not pp.get("orderId")
        # sold-out cart item → create-order 409 with a readable reason (the bug the customer saw as 'status code 409')
        r9 = await client.post("/api/payments/paypal/create-order", json={"items": [{"productId": 14, "name": "x", "price": 26.5, "qty": 999}], "zip": "32801"})
        assert r9.status_code == 409 and "left" in r9.json()["detail"]
        await server.db.paypal_orders.delete_many({"paypalOrderId": {"$regex": "^PP-(FAIL|BUSY|MISMATCH)"}})

    run(go())


def test_paypal_with_loyalty_discount_totals_match(client, monkeypatch):
    """PayPal amount created with a rewards discount must equal the amount verified at capture (no 402 mismatch), and points move once."""
    import uuid as _uuid
    monkeypatch.setattr(server, "PAYPAL_ENABLED", True)
    created = {}

    async def fake_paypal(method, path, body=None):
        if path == "/v2/checkout/orders":
            created["amount"] = body["purchase_units"][0]["amount"]["value"]
            return {"id": "PP-LOYAL-1", "status": "CREATED"}
        return {"status": "COMPLETED", "payer": {"email_address": "b@example.com"}, "purchase_units": [{"payments": {"captures": [{"id": "CAP-L"}]}}]}

    monkeypatch.setattr(server, "paypal_request", fake_paypal)

    async def go():
        email = f"TEST_pp+{_uuid.uuid4().hex[:6]}@example.com"
        r = await client.post("/api/auth/register", json={"email": email, "password": "Password123!", "firstName": "P"})
        tok, uid = r.json()["token"], r.json()["user"]["id"]
        await server.db.loyalty_transactions.insert_one({"id": str(_uuid.uuid4()), "userId": uid, "type": "adjust", "points": 200, "key": f"test:{uid}", "description": "seed", "createdAt": server.now_utc()})
        h = {"Authorization": f"Bearer {tok}"}
        items = [{"productId": 14, "name": "x", "price": 26.5, "qty": 2}]
        r = await client.post("/api/payments/paypal/create-order", json={"items": items, "zip": "32801", "redeemPoints": 100}, headers=h)
        assert r.status_code == 200, r.text
        r2 = await client.post("/api/orders", json={"items": items, "shipping": CART["shipping"], "paymentMethod": "paypal", "paypalOrderId": "PP-LOYAL-1", "redeemPoints": 100}, headers=h)
        assert r2.status_code == 200, r2.text
        o = r2.json()
        assert o["rewardDiscount"] == 5.0 and float(created["amount"]) == o["total"]
        bal = (await client.get("/api/loyalty/me", headers=h)).json()
        assert bal["available"] == 250 - 100 + o["pointsEarned"]
        r3 = await client.post("/api/orders", json={"items": items, "shipping": CART["shipping"], "paymentMethod": "paypal", "paypalOrderId": "PP-LOYAL-1", "redeemPoints": 100}, headers=h)
        assert r3.status_code == 200 and r3.json()["id"] == o["id"]
        assert (await client.get("/api/loyalty/me", headers=h)).json()["available"] == bal["available"]
        await server.db.paypal_orders.delete_many({"paypalOrderId": "PP-LOYAL-1"})

    run(go())

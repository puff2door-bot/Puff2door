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

    async def fake_paypal(method, path, body=None):
        if path == "/v2/checkout/orders":
            return {"id": "PP-ORDER-1", "status": "CREATED"}
        if path.endswith("/capture"):
            return {"status": "COMPLETED", "payer": {"email_address": "buyer@example.com"},
                    "purchase_units": [{"payments": {"captures": [{"id": "CAP-1"}]}}]}
        raise AssertionError(path)

    monkeypatch.setattr(server, "paypal_request", fake_paypal)

    async def go():
        r = await client.post("/api/payments/paypal/create-order", json={"items": CART["items"], "zip": "32801"})
        assert r.status_code == 200 and r.json()["id"] == "PP-ORDER-1"
        r2 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "PP-ORDER-1"})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["paymentStatus"] == "paid" and d["paymentBrand"] == "PayPal" and d["paymentRef"] == "CAP-1"
        r3 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "PP-ORDER-1"})
        assert r3.status_code == 402  # already captured
        r4 = await client.post("/api/orders", json={**CART, "paymentMethod": "paypal", "paypalOrderId": "UNKNOWN"})
        assert r4.status_code == 402

    run(go())

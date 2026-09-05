"""Spot checks for same-day countdown order enforcement (frontend-support testing)."""
import os
from datetime import datetime, timedelta

import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")


def _order_body(expect_same_day=None):
    prod = requests.get(f"{BASE_URL}/api/products?limit=1", timeout=30).json()["products"][0]
    body = {
        "items": [{
            "productId": prod["id"], "name": prod["name"], "price": prod["price"],
            "slug": prod.get("slug", ""), "qty": 1,
        }],
        "shipping": {
            "firstName": "TEST", "lastName": "Countdown", "email": "TEST_countdown@example.com",
            "phone": "4075550000", "address": "1 Test St", "city": "Orlando", "state": "FL", "zip": "32832",
        },
        "subtotal": prod["price"], "shippingCost": 15, "total": prod["price"] + 15,
        "paymentMethod": "test_card", "paymentLast4": "4242",
    }
    if expect_same_day is not None:
        body["expectSameDay"] = expect_same_day
    return body


def test_window_closed_rejects_expect_same_day():
    win = requests.get(f"{BASE_URL}/api/delivery/window", timeout=30).json()
    assert win["sameDayOpen"] is False, "precondition: cutoff must be in the past for this test"
    r = requests.post(f"{BASE_URL}/api/orders", json=_order_body(True), timeout=60)
    assert r.status_code == 409, r.text
    assert "closed" in r.json().get("detail", "").lower()


def test_order_without_expect_same_day_schedules_tomorrow():
    win = requests.get(f"{BASE_URL}/api/delivery/window", timeout=30).json()
    r = requests.post(f"{BASE_URL}/api/orders", json=_order_body(), timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("sameDay") is False, data
    server_today = datetime.fromisoformat(win["serverTime"]).date()
    assert data.get("deliveryDate") == (server_today + timedelta(days=1)).isoformat(), data
    # persistence check
    oid = data["id"]
    g = requests.get(f"{BASE_URL}/api/orders/{oid}", timeout=30)
    assert g.status_code == 200
    got = g.json()
    assert got["deliveryDate"] == data["deliveryDate"]
    assert "_id" not in got
    print("ORDER_ID", oid)

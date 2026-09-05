"""Same-day delivery countdown: /api/delivery/window, admin cutoff settings, server-side cutoff enforcement at checkout."""
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
be = dotenv_values("/app/backend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or fe["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
TZ = ZoneInfo("America/New_York")
SHIP = {"firstName": "Cut", "lastName": "Off", "email": "cutoff@example.com", "phone": "4070000000", "address": "1 Test St", "city": "Orlando", "state": "Florida", "zip": "32832"}


def auth(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": be["ADMIN_EMAILS"].split(",")[0].strip(), "password": be["ADMIN_PASSWORD"]})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def base_settings(admin):
    s = requests.get(f"{API}/admin/settings", headers=auth(admin)).json()
    body = {k: s[k] for k in ("taxRate", "deliveryFee", "freeDeliveryMin", "deliveryZip", "deliveryRadiusMiles")}
    yield body
    requests.put(f"{API}/admin/settings", json={**body, "sameDayEnabled": True, "deliveryCutoff": "20:00", "deliveryDays": [0, 1, 2, 3, 4, 5, 6]}, headers=auth(admin))


def put_settings(admin, base, **kw):
    r = requests.put(f"{API}/admin/settings", json={**base, **kw}, headers=auth(admin))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def product():
    prods = requests.get(f"{API}/products").json()["products"]
    return max((x for x in prods if x["inStock"]), key=lambda x: x["stock"])


def order(product, expect=None):
    body = {"items": [{"productId": product["id"], "name": product["name"], "price": product["salePrice"] or product["price"], "qty": 1, "slug": product["slug"]}], "shipping": SHIP, "paymentMethod": "test_card", "paymentLast4": "4242"}
    if expect is not None:
        body["expectSameDay"] = expect
    return requests.post(f"{API}/orders", json=body)


def test_window_defaults(admin, base_settings):
    put_settings(admin, base_settings, sameDayEnabled=True, deliveryCutoff="20:00", deliveryDays=[0, 1, 2, 3, 4, 5, 6])
    w = requests.get(f"{API}/delivery/window").json()
    assert w["enabled"] is True and w["timezone"] == "America/New_York" and w["cutoff"] == "20:00" and w["cutoffLabel"] == "8:00 PM"
    now = datetime.now(TZ)
    if now.hour < 20:
        assert w["sameDayOpen"] is True and w["secondsRemaining"] > 0 and w["message"].startswith("Order within") and w["nextDeliveryLabel"] == "Today"
    else:
        assert w["sameDayOpen"] is False and w["nextDeliveryLabel"] == "Tomorrow"


def test_cutoff_validation(admin, base_settings):
    r = requests.put(f"{API}/admin/settings", json={**base_settings, "deliveryCutoff": "25:00"}, headers=auth(admin))
    assert r.status_code == 422


def test_after_cutoff_blocks_same_day_order_but_allows_next_day(admin, base_settings, product):
    now = datetime.now(TZ)
    past = (now - timedelta(minutes=2)).strftime("%H:%M")
    if past > now.strftime("%H:%M"):  # just after midnight: yesterday's clock, skip
        pytest.skip("too close to midnight")
    put_settings(admin, base_settings, deliveryCutoff=past)
    w = requests.get(f"{API}/delivery/window").json()
    assert w["sameDayOpen"] is False and w["secondsRemaining"] == 0
    assert w["message"] == "Today's delivery window has closed. Order now for the next available delivery day."
    assert w["nextDeliveryDate"] == (now.date() + timedelta(days=1)).isoformat()
    r = order(product, expect=True)
    assert r.status_code == 409 and "closed" in r.json()["detail"]
    r = order(product)
    assert r.status_code == 200, r.text
    assert r.json()["sameDay"] is False and r.json()["deliveryDate"] == w["nextDeliveryDate"]


def test_closed_day_shows_next_open_day(admin, base_settings):
    today = datetime.now(TZ).weekday()
    days = [d for d in range(7) if d != today]
    w = put_settings(admin, base_settings, deliveryCutoff="23:59", deliveryDays=days)
    assert w["deliveryDays"] == days
    w = requests.get(f"{API}/delivery/window").json()
    assert w["todayOpen"] is False and w["sameDayOpen"] is False
    assert w["nextDeliveryLabel"] == "Tomorrow" and "No local delivery today" in w["message"]


def test_disabled_program(admin, base_settings, product):
    put_settings(admin, base_settings, sameDayEnabled=False)
    w = requests.get(f"{API}/delivery/window").json()
    assert w["enabled"] is False and w["sameDayOpen"] is False and w["message"] == ""
    r = order(product)  # ordering still works when the countdown is off
    assert r.status_code == 200 and r.json()["sameDay"] is False


def test_before_cutoff_same_day_accepted(admin, base_settings, product):
    put_settings(admin, base_settings, sameDayEnabled=True, deliveryCutoff="23:59", deliveryDays=[0, 1, 2, 3, 4, 5, 6])
    w = requests.get(f"{API}/delivery/window").json()
    assert w["sameDayOpen"] is True
    r = order(product, expect=True)
    assert r.status_code == 200, r.text
    assert r.json()["sameDay"] is True and r.json()["deliveryDate"] == datetime.now(TZ).date().isoformat()


def test_untouched_areas():
    assert len(requests.get(f"{API}/products").json()["products"]) == 67
    assert requests.get(f"{API}/delivery/check", params={"zip": "32832"}).json()["eligible"] is True
    assert requests.get(f"{API}/settings").json()["loyalty"]["enabled"] is True

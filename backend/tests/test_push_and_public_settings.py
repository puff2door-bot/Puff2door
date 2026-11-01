import asyncio
import os
import sys

import pytest
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


def run(coro):
    return asyncio.run(coro)


def test_delivery_public_rules_include_same_day_state():
    settings = {**server.DEFAULT_SETTINGS, "sameDayEnabled": False, "allowedZipCodes": ["32714"]}
    result = server.delivery_rules(settings)
    assert result["sameDayEnabled"] is False
    assert result["mode"] == "selected_zips"


@pytest.mark.parametrize("url", [
    "https://g.page/r/example/review",
    "https://maps.app.goo.gl/example",
    "https://search.google.com/local/writereview?placeid=example",
])
def test_google_review_setting_accepts_google_links(url):
    model = server.StoreSettingsInput(**{**server.DEFAULT_SETTINGS, "googleReviewUrl": url})
    assert model.googleReviewUrl == url


def test_google_review_setting_rejects_non_google_link():
    with pytest.raises(ValueError):
        server.StoreSettingsInput(**{**server.DEFAULT_SETTINGS, "googleReviewUrl": "https://example.com/fake-reviews"})


def test_push_subscription_requires_https():
    with pytest.raises(ValueError):
        server.PushSubscriptionInput(endpoint="http://push.example.test/subscription", keys={"p256dh": "key", "auth": "auth"})


def test_order_push_sends_to_each_device(monkeypatch):
    async def exercise():
        client = AsyncMongoMockClient()
        monkeypatch.setattr(server, "db", client["push_test"])
        monkeypatch.setattr(server, "WEB_PUSH_ENABLED", True)
        sent = []

        def fake_webpush(**kwargs):
            sent.append(kwargs)

        monkeypatch.setattr(server, "webpush", fake_webpush)
        await server.db.push_subscriptions.insert_many([
            {"endpointHash": "one", "endpoint": "https://push.example.test/one", "keys": {"p256dh": "a", "auth": "b"}, "userId": "u1"},
            {"endpointHash": "two", "endpoint": "https://push.example.test/two", "keys": {"p256dh": "c", "auth": "d"}, "userId": "u1"},
        ])
        await server.send_order_push({"id": "o1", "orderNumber": "P2D-1", "userId": "u1"}, "out_for_delivery")
        assert len(sent) == 2
        assert all("Your driver is on the way" in call["data"] for call in sent)
        assert await server.db.push_subscriptions.count_documents({"lastSentAt": {"$exists": True}}) == 2

    run(exercise())

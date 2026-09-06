"""Live chat: customer start/poll/send with secret token, admin inbox/reply/resolve/reopen, settings, privacy."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
be = dotenv_values("/app/backend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or fe["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"


def auth(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": be["ADMIN_EMAILS"].split(",")[0].strip(), "password": be["ADMIN_PASSWORD"]})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module", autouse=True)
def defaults(admin):
    body = {"chatEnabled": True, "chatOnline": True, "chatWelcome": "Hi! Welcome to Puff2door. How can we help you today?", "chatOffline": "We're currently offline. Leave us a message and we'll get back to you."}
    requests.put(f"{API}/admin/chat/settings", json=body, headers=auth(admin))
    yield
    requests.put(f"{API}/admin/chat/settings", json=body, headers=auth(admin))


@pytest.fixture(scope="module")
def convo():
    return {}


def test_public_status_has_no_private_data():
    s = requests.get(f"{API}/chat/status").json()
    assert s["enabled"] is True and s["online"] is True and "welcome" in s and "offlineMessage" in s
    assert set(s.keys()) == {"enabled", "online", "welcome", "offlineMessage"}


def test_start_requires_valid_contact():
    r = requests.post(f"{API}/chat/start", json={"name": "A", "contact": "nope", "message": "hi"})
    assert r.status_code == 422
    r = requests.post(f"{API}/chat/start", json={"name": "A", "contact": "bad@", "message": "hi"})
    assert r.status_code == 422


def test_customer_starts_chat_and_gets_welcome(convo):
    email = f"test_chat+{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/chat/start", json={"name": "Chat Tester", "contact": email, "message": "Do you have Geek Bar in stock?"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["token"]) >= 32 and d["online"] is True
    assert [m["sender"] for m in d["messages"]] == ["admin", "customer"]
    assert d["messages"][0]["text"].startswith("Hi! Welcome")
    assert d["conversation"]["status"] == "open" and d["conversation"]["contact"] == email
    convo.update({"token": d["token"], "id": d["conversation"]["id"], "email": email})


def test_conversation_is_private(convo):
    assert requests.get(f"{API}/chat/conversation").status_code == 401
    assert requests.get(f"{API}/chat/conversation", headers={"X-Chat-Token": "x" * 40}).status_code == 404
    assert requests.get(f"{API}/admin/chat/conversations").status_code == 401
    assert requests.get(f"{API}/admin/chat/conversations/{convo['id']}").status_code == 401
    r = requests.get(f"{API}/chat/conversation", headers={"X-Chat-Token": convo["token"]})
    assert r.status_code == 200 and r.json()["conversation"]["id"] == convo["id"]


def test_admin_sees_unread_and_replies(admin, convo):
    lst = requests.get(f"{API}/admin/chat/conversations", params={"status": "open"}, headers=auth(admin)).json()
    c = next(x for x in lst["conversations"] if x["id"] == convo["id"])
    assert c["unreadAdmin"] == 1 and c["name"] == "Chat Tester" and c["contact"] == convo["email"] and lst["unreadTotal"] >= 1
    d = requests.get(f"{API}/admin/chat/conversations/{convo['id']}", headers=auth(admin)).json()
    assert d["conversation"]["unreadAdmin"] == 0 and len(d["messages"]) == 2
    r = requests.post(f"{API}/admin/chat/conversations/{convo['id']}/reply", json={"message": "Yes! Geek Bar Pulse is in stock."}, headers=auth(admin))
    assert r.status_code == 200 and r.json()["sender"] == "admin"
    u = requests.get(f"{API}/chat/unread", headers={"X-Chat-Token": convo["token"]}).json()
    assert u["unread"] == 1
    cust = requests.get(f"{API}/chat/conversation", headers={"X-Chat-Token": convo["token"]}).json()
    assert cust["messages"][-1]["text"] == "Yes! Geek Bar Pulse is in stock." and cust["messages"][-1]["sender"] == "admin"
    assert requests.get(f"{API}/chat/unread", headers={"X-Chat-Token": convo["token"]}).json()["unread"] == 0
    last = cust["messages"][-1]["createdAt"]
    inc = requests.get(f"{API}/chat/conversation", params={"after": last}, headers={"X-Chat-Token": convo["token"]}).json()
    assert inc["messages"] == []


def test_customer_sends_and_admin_resolves_reopens(admin, convo):
    r = requests.post(f"{API}/chat/message", json={"message": "Great, ordering now."}, headers={"X-Chat-Token": convo["token"]})
    assert r.status_code == 200
    assert requests.post(f"{API}/chat/message", json={"message": "x"}).status_code == 401
    r = requests.put(f"{API}/admin/chat/conversations/{convo['id']}/status", json={"status": "resolved"}, headers=auth(admin))
    assert r.status_code == 200 and r.json()["status"] == "resolved" and r.json()["unreadAdmin"] == 0
    ids = [c["id"] for c in requests.get(f"{API}/admin/chat/conversations", params={"status": "resolved"}, headers=auth(admin)).json()["conversations"]]
    assert convo["id"] in ids
    ids = [c["id"] for c in requests.get(f"{API}/admin/chat/conversations", params={"status": "open"}, headers=auth(admin)).json()["conversations"]]
    assert convo["id"] not in ids
    # customer message reopens automatically
    requests.post(f"{API}/chat/message", json={"message": "One more question"}, headers={"X-Chat-Token": convo["token"]})
    d = requests.get(f"{API}/admin/chat/conversations/{convo['id']}", headers=auth(admin)).json()
    assert d["conversation"]["status"] == "open"
    # manual resolve + reopen
    requests.put(f"{API}/admin/chat/conversations/{convo['id']}/status", json={"status": "resolved"}, headers=auth(admin))
    r = requests.put(f"{API}/admin/chat/conversations/{convo['id']}/status", json={"status": "open"}, headers=auth(admin))
    assert r.json()["status"] == "open"
    assert requests.put(f"{API}/admin/chat/conversations/{convo['id']}/status", json={"status": "bogus"}, headers=auth(admin)).status_code == 422


def test_previous_conversations_linked_by_contact(admin, convo):
    r = requests.post(f"{API}/chat/start", json={"name": "Chat Tester", "contact": convo["email"], "message": "Second visit"})
    assert r.status_code == 200
    d = requests.get(f"{API}/admin/chat/conversations/{r.json()['conversation']['id']}", headers=auth(admin)).json()
    assert any(p["id"] == convo["id"] for p in d["previous"])
    s = requests.get(f"{API}/admin/chat/conversations", params={"status": "all", "q": convo["email"]}, headers=auth(admin)).json()
    assert len(s["conversations"]) >= 2


def test_offline_mode_and_disable(admin):
    body = {"chatEnabled": True, "chatOnline": False, "chatWelcome": "Welcome!", "chatOffline": "We're currently offline. Leave us a message and we'll get back to you."}
    r = requests.put(f"{API}/admin/chat/settings", json=body, headers=auth(admin))
    assert r.status_code == 200 and r.json()["chatOnline"] is False
    assert requests.get(f"{API}/chat/status").json()["online"] is False
    r = requests.post(f"{API}/chat/start", json={"name": "Night Owl", "contact": "4075551234", "message": "Are you open tomorrow?"})
    assert r.status_code == 200
    d = r.json()
    assert d["online"] is False and d["conversation"]["offline"] is True
    assert [m["sender"] for m in d["messages"]] == ["customer"]  # no welcome bubble when offline
    assert d["offlineMessage"].startswith("We're currently offline")
    body["chatEnabled"] = False
    requests.put(f"{API}/admin/chat/settings", json=body, headers=auth(admin))
    assert requests.get(f"{API}/chat/status").json()["enabled"] is False
    assert requests.post(f"{API}/chat/start", json={"name": "X", "contact": "x@example.com", "message": "hi"}).status_code == 403
    assert requests.post(f"{API}/chat/message", json={"message": "hi"}, headers={"X-Chat-Token": d["token"]}).status_code == 403


def test_store_and_loyalty_settings_untouched(admin):
    s = requests.get(f"{API}/settings").json()
    assert s["pricing"]["taxRate"] == 0.065 and s["loyalty"]["enabled"] is True
    assert len(requests.get(f"{API}/products").json()["products"]) == 67

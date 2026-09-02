"""Password strength, remember-me JWT expiry, forgot/reset password and brute-force lockout tests."""
import os
import uuid

import jwt
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
API = base_url.rstrip("/") + "/api"

MONGO_URL = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def new_email():
    return f"TEST_pw.{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def account(client, mongo):
    email = new_email()
    r = client.post(f"{API}/auth/register", json={"email": email, "password": "Password123", "firstName": "Pw"})
    assert r.status_code == 200, r.text
    yield {"email": email, "password": "Password123", "id": r.json()["user"]["id"]}
    mongo.users.delete_many({"email": email.lower()})
    mongo.login_attempts.delete_many({"identifier": email.lower()})
    mongo.password_reset_tokens.delete_many({"userId": r.json()["user"]["id"]})


# ----------------------------- Password strength -----------------------------
class TestPasswordStrength:
    @pytest.mark.parametrize("pw", ["short", "abcdefgh", "12345678"])
    def test_weak_password_rejected(self, client, pw):
        r = client.post(f"{API}/auth/register", json={"email": new_email(), "password": pw})
        assert r.status_code == 422, r.text
        body = r.text.lower()
        assert "password" in body and ("8 characters" in body or "letter and one number" in body)

    def test_strong_password_accepted(self, client, mongo):
        email = new_email()
        r = client.post(f"{API}/auth/register", json={"email": email, "password": "Password123"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["token"], str) and data["token"]
        assert data["user"]["email"] == email.lower()
        assert data["user"]["provider"] == "password"
        # token works on /auth/me
        me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {data['token']}"})
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email.lower()
        mongo.users.delete_many({"email": email.lower()})


# ----------------------------- Remember me -----------------------------
class TestRememberMe:
    def _span_days(self, token):
        payload = jwt.decode(token, options={"verify_signature": False})
        return (payload["exp"] - payload["iat"]) / 86400.0

    def test_remember_me_true_30_days(self, client, account):
        r = client.post(f"{API}/auth/login", json={
            "email": account["email"], "password": account["password"], "rememberMe": True})
        assert r.status_code == 200, r.text
        days = self._span_days(r.json()["token"])
        assert 29.5 < days < 30.5, days

    def test_remember_me_false_1_day(self, client, account):
        r = client.post(f"{API}/auth/login", json={
            "email": account["email"], "password": account["password"], "rememberMe": False})
        assert r.status_code == 200, r.text
        assert 0.9 < self._span_days(r.json()["token"]) < 1.1

    def test_remember_me_omitted_1_day(self, client, account):
        r = client.post(f"{API}/auth/login", json={
            "email": account["email"], "password": account["password"]})
        assert r.status_code == 200, r.text
        assert 0.9 < self._span_days(r.json()["token"]) < 1.1


# ----------------------------- Forgot / reset password -----------------------------
class TestForgotReset:
    def test_forgot_unknown_email_no_token(self, client):
        r = client.post(f"{API}/auth/forgot-password", json={"email": new_email()})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "resetToken" not in data

    def test_full_reset_flow(self, client, mongo):
        email = new_email()
        assert client.post(f"{API}/auth/register", json={"email": email, "password": "Password123"}).status_code == 200

        r = client.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert isinstance(data.get("resetToken"), str) and len(data["resetToken"]) > 10
        assert data["expiresInMinutes"] == 60
        token = data["resetToken"]

        # weak new password rejected
        weak = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "abc"})
        assert weak.status_code == 422, weak.text

        # strong reset works
        ok = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "Brand New99"})
        assert ok.status_code == 200, ok.text
        body = ok.json()
        assert body["ok"] is True
        assert isinstance(body["token"], str) and body["token"]
        assert body["user"]["email"] == email.lower()

        # login with new password
        li = client.post(f"{API}/auth/login", json={"email": email, "password": "Brand New99"})
        assert li.status_code == 200, li.text
        # old password no longer valid
        old = client.post(f"{API}/auth/login", json={"email": email, "password": "Password123"})
        assert old.status_code == 401

        # token reuse blocked
        reuse = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "Another123"})
        assert reuse.status_code == 400, reuse.text
        assert "invalid" in reuse.json()["detail"].lower() or "used" in reuse.json()["detail"].lower()

        mongo.users.delete_many({"email": email.lower()})
        mongo.login_attempts.delete_many({"identifier": email.lower()})

    def test_reset_with_bogus_token(self, client):
        r = client.post(f"{API}/auth/reset-password", json={"token": "nope-" + uuid.uuid4().hex, "password": "Password123"})
        assert r.status_code == 400, r.text


# ----------------------------- Brute force lockout -----------------------------
class TestLockout:
    def test_lockout_after_five_failures(self, client, mongo):
        email = new_email()
        assert client.post(f"{API}/auth/register", json={"email": email, "password": "Password123"}).status_code == 200
        mongo.login_attempts.delete_many({"identifier": email.lower()})
        try:
            for i in range(5):
                r = client.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass1"})
                assert r.status_code == 401, f"attempt {i+1}: {r.status_code} {r.text}"
            sixth = client.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass1"})
            assert sixth.status_code == 429, sixth.text
            assert "Too many failed attempts" in sixth.json()["detail"]
            # even the correct password is locked out
            correct = client.post(f"{API}/auth/login", json={"email": email, "password": "Password123"})
            assert correct.status_code == 429, correct.text
        finally:
            mongo.login_attempts.delete_many({"identifier": email.lower()})
            mongo.users.delete_many({"email": email.lower()})

    def test_successful_login_resets_counter(self, client, mongo, account):
        ident = account["email"].lower()
        mongo.login_attempts.delete_many({"identifier": ident})
        for _ in range(3):
            assert client.post(f"{API}/auth/login", json={"email": account["email"], "password": "Bad12345"}).status_code == 401
        assert client.post(f"{API}/auth/login", json={
            "email": account["email"], "password": account["password"]}).status_code == 200
        assert mongo.login_attempts.count_documents({"identifier": ident}) == 0

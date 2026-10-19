import asyncio
import os
import sys

import pytest
from mongomock_motor import AsyncMongoMockClient
from starlette.requests import Request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402

TEST_LOOP = asyncio.get_event_loop_policy().get_event_loop()


def run(coro):
    return TEST_LOOP.run_until_complete(coro)


server.client = AsyncMongoMockClient()
server.db = server.client["puff2door_auth_security_tests"]


def local_request():
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": ("127.0.0.1", 12345)})


def test_order_email_link_keeps_signed_credential_out_of_query_logs(monkeypatch):
    monkeypatch.setattr(server.emails, "_public_url", "https://puff2door.com")
    monkeypatch.setenv("JWT_SECRET", server.JWT_SECRET)
    link = server.emails.order_link({"id": "order-security-test"})
    assert "?access_token=" not in link
    assert "#access_token=" in link


def test_failed_email_never_exposes_reset_token_in_production(monkeypatch):
    async def email_failed(*_args, **_kwargs):
        return "failed"

    async def go():
        email = "reset-security@example.com"
        await server.db.users.delete_many({"email": email})
        await server.db.password_reset_tokens.delete_many({})
        await server.db.users.insert_one({
            "id": "reset-security-user",
            "email": email,
            "password": "unused",
            "firstName": "Reset",
        })
        monkeypatch.setattr(server.emails, "send_password_reset", email_failed)
        monkeypatch.setattr(server, "ALLOW_PASSWORD_RESET_TOKEN_RESPONSE", False)

        result = await server.forgot_password(server.ForgotPasswordInput(email=email), local_request())

        assert result["ok"] is True
        assert result["emailSent"] is False
        assert "resetToken" not in result
        assert await server.db.password_reset_tokens.count_documents({"userId": "reset-security-user"}) == 1

    run(go())


def test_local_qa_reset_token_requires_explicit_flag(monkeypatch):
    async def email_disabled(*_args, **_kwargs):
        return "disabled"

    async def go():
        email = "reset-local-qa@example.com"
        await server.db.users.delete_many({"email": email})
        await server.db.password_reset_tokens.delete_many({})
        await server.db.users.insert_one({
            "id": "reset-local-qa-user",
            "email": email,
            "password": "unused",
            "firstName": "Reset",
        })
        monkeypatch.setattr(server.emails, "send_password_reset", email_disabled)
        monkeypatch.setattr(server, "ALLOW_PASSWORD_RESET_TOKEN_RESPONSE", True)

        result = await server.forgot_password(server.ForgotPasswordInput(email=email), local_request())

        assert result["emailSent"] is False
        assert result["resetToken"]

    run(go())


@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "http://127.0.0.1/image.jpg",
    "http://10.0.0.1/image.jpg",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/image.jpg",
    "https://user:password@example.com/image.jpg",
    "https://8.8.8.8:8443/image.jpg",
])
def test_image_import_rejects_local_private_or_credentialed_urls(url):
    with pytest.raises(ValueError):
        run(server._assert_safe_external_url(url))

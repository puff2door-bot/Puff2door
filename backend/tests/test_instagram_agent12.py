import asyncio
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

from instagram import (
    InstagramError,
    InstagramIntegration,
    next_post_at,
    normalize_username,
    render_social_image,
    safe_caption,
    SAFE_TOPICS,
)


class FakeCollection:
    def __init__(self):
        self.rows = []

    async def insert_one(self, row):
        self.rows.append(dict(row))

    def find(self, query=None, projection=None):
        class Cursor:
            async def to_list(self, _limit):
                return []

        return Cursor()

    async def delete_one(self, query):
        for index, row in enumerate(self.rows):
            if all(row.get(key) == value for key, value in query.items()):
                self.rows.pop(index)
                break

    async def find_one(self, query=None, projection=None, sort=None):
        query = query or {}
        matches = [row for row in self.rows if all(row.get(key) == value for key, value in query.items())]
        if sort:
            key, direction = sort[0]
            matches.sort(key=lambda row: row.get(key), reverse=direction < 0)
        return dict(matches[0]) if matches else None

    async def update_one(self, query, update, upsert=False):
        row = await self.find_one(query)
        if row is None:
            row = dict(query)
            self.rows.append(row)
        row.update(update.get("$set", {}))
        for index, existing in enumerate(self.rows):
            if all(existing.get(key) == value for key, value in query.items()):
                self.rows[index] = row
                break

    async def find_one_and_delete(self, query):
        for index, row in enumerate(self.rows):
            matched = True
            for key, expected in query.items():
                actual = row.get(key)
                if isinstance(expected, dict) and "$gt" in expected:
                    matched = matched and actual is not None and actual > expected["$gt"]
                else:
                    matched = matched and actual == expected
            if matched:
                return self.rows.pop(index)
        return None


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.content = b"json"
        self.is_error = status_code >= 400

    def json(self):
        return self.payload


class FakeHttpClient:
    def __init__(self, pages, business_accounts=None):
        self.pages = pages
        self.business_accounts = business_accounts or []
        self.requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, **kwargs):
        self.requests.append((url, kwargs))
        if url.endswith("/me/accounts"):
            return FakeResponse({"data": self.pages})
        if url.endswith("/instagram_accounts"):
            return FakeResponse({"data": self.business_accounts})
        if url.endswith("/owned_instagram_accounts"):
            return FakeResponse({"data": self.business_accounts})
        return FakeResponse({})


class FakeInstagramLoginClient:
    def __init__(self):
        self.requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        self.requests.append(("POST", url, kwargs))
        if url.endswith("/oauth/access_token"):
            return FakeResponse({"access_token": "short-token", "user_id": "scoped-1"})
        return FakeResponse({}, 404)

    async def get(self, url, **kwargs):
        self.requests.append(("GET", url, kwargs))
        if url.endswith("/access_token"):
            return FakeResponse({"access_token": "long-token", "expires_in": 5_000_000})
        if url.endswith("/me"):
            return FakeResponse({
                "user_id": "ig-professional-1",
                "username": "hdsmokeshop.altamonte",
                "name": "HD Smoke Shop",
            })
        return FakeResponse({}, 404)


class FakeUnifiedLoginClient:
    def __init__(self, assigned_accounts=None, business_accounts=None):
        self.requests = []
        self.assigned_accounts = assigned_accounts if assigned_accounts is not None else [
            {"id": "ig-unified-1", "username": "hdsmokeshop.altamonte", "name": "HD Smoke Shop"}
        ]
        self.business_accounts = business_accounts or []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        self.requests.append(("POST", url, kwargs))
        if url.endswith("/oauth/access_token"):
            return FakeResponse({"access_token": "system-user-token"})
        return FakeResponse({}, 404)

    async def get(self, url, **kwargs):
        self.requests.append(("GET", url, kwargs))
        if url.endswith("/me"):
            return FakeResponse({"client_business_id": "business-client-1", "id": "system-user-1"})
        if url.endswith("/me/assigned_instagram_accounts"):
            return FakeResponse({"data": self.assigned_accounts})
        if url.endswith("/instagram_accounts") or url.endswith("/owned_instagram_accounts"):
            return FakeResponse({"data": self.business_accounts})
        if url.endswith("/ig-unified-1"):
            return FakeResponse({
                "id": "ig-unified-1", "username": "hdsmokeshop.altamonte", "name": "HD Smoke Shop"
            })
        return FakeResponse({}, 404)

class FakeDB:
    def __init__(self):
        self.instagram_oauth_states = FakeCollection()
        self.social_media = FakeCollection()
        self.social_drafts = FakeCollection()
        self.social_audit_logs = FakeCollection()
        self.integrations = FakeCollection()


def integration(db=None, auth_mode="facebook"):
    return InstagramIntegration(
        db or FakeDB(),
        app_id="1145283828055613",
        app_secret="server-only-secret",
        config_id="4461075690813851",
        business_id="1931265227835163",
        redirect_uri="https://puff2door.com/api/instagram/oauth/callback",
        public_url="https://puff2door.com",
        encryption_secret="separate-test-encryption-key-that-is-long-enough",
        expected_username="@hdsmokeshop.altamonte",
        graph_version="v27.0",
        auth_mode=auth_mode,
    )


def test_username_and_caption_policy():
    assert normalize_username(" @HDSmokeShop.Altamonte ") == "hdsmokeshop.altamonte"
    caption = safe_caption(SAFE_TOPICS[0])
    assert "Adults 21+ only" in caption
    assert "discount" not in caption.lower()
    assert "buy now" not in caption.lower()


def test_rendered_social_image_is_square_png():
    data = render_social_image(SAFE_TOPICS[1], 1)
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(data) > 20_000


def test_daily_rotation_never_repeats_consecutive_theme_or_topic():
    db = FakeDB()
    agent = integration(db)

    async def go():
        async def no_feature_products(_categories, _seed, _count=4):
            return [], []

        agent._feature_products = no_feature_products
        first = await agent.generate_draft("2026-11-05")
        second = await agent.generate_draft("2026-11-06")
        assert first["themeName"] != second["themeName"]
        assert first["themeIndex"] != second["themeIndex"]
        assert first["topic"] != second["topic"]
        assert first["imageUrl"] != second["imageUrl"]
        assert len(db.social_media.rows) == 2

    asyncio.run(go())


def test_authorization_url_uses_configuration_without_leaking_secret():
    db = FakeDB()
    agent = integration(db)

    async def go():
        url = await agent.create_authorization_url("admin-1")
        parsed = urlsplit(url)
        query = parse_qs(parsed.query)
        assert parsed.netloc == "www.facebook.com"
        assert query["client_id"] == ["1145283828055613"]
        assert query["config_id"] == ["4461075690813851"]
        assert query["response_type"] == ["code"]
        assert "server-only-secret" not in url
        assert len(db.instagram_oauth_states.rows) == 1
        assert "state" not in db.instagram_oauth_states.rows[0]

    asyncio.run(go())


def test_instagram_login_authorization_url_uses_current_business_scopes():
    db = FakeDB()
    agent = integration(db, auth_mode="instagram")

    async def go():
        url = await agent.create_authorization_url("admin-1")
        parsed = urlsplit(url)
        query = parse_qs(parsed.query)
        assert parsed.netloc == "www.instagram.com"
        assert parsed.path == "/oauth/authorize"
        assert query["scope"] == ["instagram_business_basic,instagram_business_content_publish"]
        assert query["enable_fb_login"] == ["false"]
        assert "config_id" not in query
        assert "server-only-secret" not in url

    asyncio.run(go())


def test_instagram_login_exchange_verifies_account_and_uses_post_for_secret():
    db = FakeDB()
    agent = integration(db, auth_mode="instagram")
    client = FakeInstagramLoginClient()
    agent.http_client_factory = lambda **kwargs: client

    async def go():
        url = await agent.create_authorization_url("admin-1")
        state = parse_qs(urlsplit(url).query)["state"][0]
        doc = await agent.exchange_code("authorization-code", state)
        assert doc["username"] == "hdsmokeshop.altamonte"
        assert doc["instagramUserId"] == "ig-professional-1"
        assert doc["authMode"] == "instagram"
        assert doc["autoPublishEnabled"] is False
        token_request = client.requests[0]
        assert token_request[0] == "POST"
        assert token_request[1] == "https://api.instagram.com/oauth/access_token"
        assert "client_secret" not in token_request[1]
        assert token_request[2]["data"]["client_secret"] == "server-only-secret"
        profile_request = next(row for row in client.requests if row[1].endswith("/me"))
        assert profile_request[2]["headers"]["Authorization"] == "Bearer long-token"
        assert all("short-token" not in row[1] and "long-token" not in row[1] for row in client.requests)

    asyncio.run(go())


def test_unified_login_uses_meta_configuration_url():
    db = FakeDB()
    agent = integration(db, auth_mode="unified")

    async def go():
        url = await agent.create_authorization_url("admin-1")
        parsed = urlsplit(url)
        query = parse_qs(parsed.query)
        assert parsed.netloc == "www.facebook.com"
        assert parsed.path == "/dialog/oauth"
        assert query["config_id"] == ["4461075690813851"]
        assert query["display"] == ["popup"]
        assert query["prompt"] == ["login"]
        assert query["override_default_response_type"] == ["true"]
        assert "server-only-secret" not in url

    asyncio.run(go())


def test_unified_login_reads_assigned_instagram_accounts():
    db = FakeDB()
    agent = integration(db, auth_mode="unified")
    client = FakeUnifiedLoginClient()
    agent.http_client_factory = lambda **kwargs: client

    async def go():
        url = await agent.create_authorization_url("admin-1")
        state = parse_qs(urlsplit(url).query)["state"][0]
        doc = await agent.exchange_code("authorization-code", state)
        assert doc["username"] == "hdsmokeshop.altamonte"
        assert doc["instagramUserId"] == "ig-unified-1"
        assert doc["clientBusinessId"] == "business-client-1"
        assert doc["authMode"] == "unified"
        assigned = next(row for row in client.requests if row[1].endswith("/me/assigned_instagram_accounts"))
        assert assigned[2]["headers"]["Authorization"] == "Bearer system-user-token"
        assert all("system-user-token" not in row[1] for row in client.requests)

    asyncio.run(go())


def test_unified_login_falls_back_to_portfolio_owned_account():
    db = FakeDB()
    agent = integration(db, auth_mode="unified")
    client = FakeUnifiedLoginClient(
        assigned_accounts=[],
        business_accounts=[
            {"id": "ig-unified-1", "username": "hdsmokeshop.altamonte", "name": "HD Smoke Shop"}
        ],
    )
    agent.http_client_factory = lambda **kwargs: client

    async def go():
        url = await agent.create_authorization_url("admin-1")
        state = parse_qs(urlsplit(url).query)["state"][0]
        doc = await agent.exchange_code("authorization-code", state)
        assert doc["username"] == "hdsmokeshop.altamonte"
        assert doc["instagramUserId"] == "ig-unified-1"
        assert any(row[1].endswith("/business-client-1/instagram_accounts") for row in client.requests)
        assert all("system-user-token" not in row[1] for row in client.requests)

    asyncio.run(go())


def test_unified_login_hydrates_portfolio_account_without_username():
    db = FakeDB()
    agent = integration(db, auth_mode="unified")
    client = FakeUnifiedLoginClient(
        assigned_accounts=[],
        business_accounts=[{"id": "ig-unified-1"}],
    )
    agent.http_client_factory = lambda **kwargs: client

    async def go():
        url = await agent.create_authorization_url("admin-1")
        state = parse_qs(urlsplit(url).query)["state"][0]
        doc = await agent.exchange_code("authorization-code", state)
        assert doc["username"] == "hdsmokeshop.altamonte"
        assert any(row[1].endswith("/ig-unified-1") for row in client.requests)

    asyncio.run(go())


def test_tokens_encrypt_and_decrypt():
    agent = integration()
    encrypted = agent.encrypt("sensitive-access-token")
    assert "sensitive-access-token" not in encrypted
    assert agent.decrypt(encrypted) == "sensitive-access-token"


def test_next_post_uses_eastern_schedule():
    now = datetime(2026, 11, 5, 13, 0, tzinfo=timezone.utc)  # 8:00 AM EST
    due = next_post_at(now, 9, 0, "America/New_York")
    assert due == datetime(2026, 11, 5, 14, 0, tzinfo=timezone.utc)


def test_profile_verification_accepts_only_expected_account():
    expected_page = {
        "id": "page-1", "name": "HD Smoke Shop", "access_token": "page-token",
        "instagram_business_account": {"id": "ig-1", "username": "hdsmokeshop.altamonte"},
    }
    agent = integration()
    agent.http_client_factory = lambda **kwargs: FakeHttpClient([expected_page])

    async def go():
        profile = await agent._get_profile("system-token")
        assert profile["instagram"]["id"] == "ig-1"
        assert profile["pageToken"] == "page-token"

    asyncio.run(go())


def test_profile_verification_rejects_wrong_instagram_account():
    wrong_page = {
        "id": "page-2", "name": "Personal Page", "access_token": "wrong-token",
        "instagram_business_account": {"id": "ig-2", "username": "someone.else"},
    }
    agent = integration()
    agent.http_client_factory = lambda **kwargs: FakeHttpClient([wrong_page])

    async def go():
        try:
            await agent._get_profile("system-token")
        except InstagramError as exc:
            assert "Expected @hdsmokeshop.altamonte" in str(exc)
        else:
            raise AssertionError("The wrong Instagram account was accepted")

    asyncio.run(go())


def test_profile_verification_supports_instagram_only_asset_grant():
    account = {"id": "ig-3", "username": "hdsmokeshop.altamonte", "name": "HD Smoke Shop"}
    agent = integration()
    client = FakeHttpClient([], [account])
    agent.http_client_factory = lambda **kwargs: client

    async def go():
        profile = await agent._get_profile("system-token")
        assert profile["instagram"]["id"] == "ig-3"
        assert profile["pageToken"] == "system-token"
        assert any(url.endswith("/instagram_accounts") for url, _ in client.requests)
        assert all("access_token" not in kwargs.get("params", {}) for _, kwargs in client.requests)
        assert all(kwargs.get("headers", {}).get("Authorization") == "Bearer system-token" for _, kwargs in client.requests)

    asyncio.run(go())

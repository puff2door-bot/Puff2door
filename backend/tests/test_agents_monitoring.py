import asyncio
from datetime import datetime, timedelta, timezone

from agents import AGENTS, Ctx, agent_reputation, agent_social, agent_support


class FakeCursor:
    def __init__(self, rows):
        self.rows = [dict(row) for row in rows]

    def sort(self, key, direction):
        self.rows.sort(key=lambda row: row.get(key) or datetime.min.replace(tzinfo=timezone.utc), reverse=direction < 0)
        return self

    async def to_list(self, _limit):
        return self.rows


class FakeCollection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def find(self, _query=None, _projection=None):
        return FakeCursor(self.rows)

    async def find_one(self, query=None, _projection=None):
        query = query or {}
        return next((dict(row) for row in self.rows if all(row.get(key) == value for key, value in query.items())), None)

    async def count_documents(self, _query=None):
        return len(self.rows)


class FakeDB:
    def __init__(self):
        self.chat_conversations = FakeCollection()
        self.chat_messages = FakeCollection()
        self.automation_settings = FakeCollection()
        self.integrations = FakeCollection()
        self.google_reviews = FakeCollection()
        self.google_review_replies = FakeCollection()


def context(db, instagram_status=None):
    async def settings():
        return {"googleReviewUrl": "https://example.com/reviews"}

    async def clover_status():
        return {}

    async def social_status():
        return instagram_status or {}

    return Ctx(db, "https://puff2door.com", settings, clover_status, social_status)


def test_agent_catalog_has_exactly_eleven_unique_numbered_agents():
    assert len(AGENTS) == 11
    assert [agent["number"] for agent in AGENTS] == list(range(1, 12))
    assert len({agent["id"] for agent in AGENTS}) == 11


def test_support_agent_flags_customer_message_waiting_over_15_minutes():
    db = FakeDB()
    now = datetime.now(timezone.utc)
    db.chat_conversations.rows = [{
        "id": "chat-1", "name": "Customer", "lastSender": "customer",
        "lastMessage": "Hello", "lastMessageAt": now - timedelta(minutes=20),
    }]
    db.chat_messages.rows = [{"sender": "customer", "createdAt": now - timedelta(minutes=20)}]
    db.automation_settings.rows = [{"key": "automations", "paused": {"chat_reply": False}}]

    result = asyncio.run(agent_support(context(db)))

    assert result["status"] == "alert"
    assert result["data"]["unanswered"] == 1
    assert any("UNANSWERED" in item for item in result["items"])


def test_reputation_agent_reports_recent_low_rating_that_received_a_reply():
    db = FakeDB()
    db.integrations.rows = [{
        "key": "google_reviews", "encryptedRefreshToken": "secret", "locationName": "locations/1",
        "averageRating": 4.8, "totalReviewCount": 2, "lastCheckedAt": datetime.now(timezone.utc),
    }]
    db.google_reviews.rows = [
        {"reviewId": "r1", "stars": 5, "name": "A", "createTime": datetime.now(timezone.utc)},
        {"reviewId": "r2", "stars": 3, "name": "B", "comment": "Needs work", "createTime": datetime.now(timezone.utc)},
    ]
    db.google_review_replies.rows = [{
        "reviewId": "r2", "stars": 3, "reviewer": "B", "comment": "Needs work",
        "reply": "Please call us.", "at": datetime.now(timezone.utc),
    }]

    result = asyncio.run(agent_reputation(context(db)))

    assert result["data"]["recordedReplies"] == 1
    assert result["status"] == "ok"
    assert any("3★" in item for item in result["items"])


def test_social_agent_surfaces_last_scheduler_error():
    status = {
        "connected": True, "username": "hdsmokeshop.altamonte", "autoPublishEnabled": True,
        "scheduleHour": 11, "scheduleMinute": 0, "tokenNeverExpires": True,
        "lastPublishError": "Meta rejected the image", "lastPublishErrorAt": datetime.now(timezone.utc),
    }

    result = asyncio.run(agent_social(context(FakeDB(), status)))

    assert result["status"] == "alert"
    assert any("Meta rejected the image" in item for item in result["items"])

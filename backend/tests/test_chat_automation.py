import asyncio
from datetime import datetime, timezone

from automations import chat_answer, chat_reply


class EmptyProducts:
    def find(self, *_args, **_kwargs):
        return self

    async def to_list(self, _limit):
        return []


class MessageCollection:
    def __init__(self, customer_text):
        self.customer = {
            "id": "customer-message",
            "conversationId": "conversation",
            "sender": "customer",
            "text": customer_text,
            "createdAt": datetime.now(timezone.utc),
        }
        self.inserted = []

    async def find_one(self, query):
        if query.get("id") == self.customer["id"]:
            return self.customer
        return None

    async def count_documents(self, _query):
        return 1

    async def insert_one(self, row):
        self.inserted.append(row)


class ConversationCollection:
    async def update_one(self, *_args, **_kwargs):
        return None


class AutomationSettings:
    async def find_one(self, _query):
        return {}


class AutomationLog:
    async def insert_one(self, _row):
        return None


class FakeDB:
    def __init__(self, customer_text):
        self.products = EmptyProducts()
        self.chat_messages = MessageCollection(customer_text)
        self.chat_conversations = ConversationCollection()
        self.automation_settings = AutomationSettings()
        self.automation_log = AutomationLog()


def test_greeting_gets_an_immediate_helpful_answer():
    answer = asyncio.run(chat_answer(FakeDB("Hello"), "Hello"))
    assert answer.startswith("Hi!")
    assert "How can we help" in answer


def test_unrecognized_followup_still_gets_an_acknowledgment():
    db = FakeDB("Can someone please help me with this?")
    asyncio.run(chat_reply(db, "conversation", "customer-message", 0))

    assert len(db.chat_messages.inserted) == 1
    reply = db.chat_messages.inserted[0]
    assert reply["sender"] == "admin"
    assert reply["auto"] is True
    assert reply["text"].startswith("Thanks for your message!")

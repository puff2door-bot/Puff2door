"""Automatic replies to Google reviews through the free Google Business Profile API.

Setup (one time): a Google Cloud project with the Business Profile APIs enabled and
approved by Google, an OAuth client (GOOGLE_BP_CLIENT_ID / GOOGLE_BP_CLIENT_SECRET),
then Admin → Agents → Connect Google. The refresh token is stored encrypted.

Replies are written from templates (no AI service, no cost), picked by star rating
and what the review mentions. They never mention products, prices or effects.
1–3 star reviews get a calm reply that invites the customer to call, and the owner
gets an email with the review text right away.
"""
from __future__ import annotations

import base64
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/business.manage"
ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
INFO_URL = "https://mybusinessbusinessinformation.googleapis.com/v1"
REVIEWS_URL = "https://mybusiness.googleapis.com/v4"
STARS = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}
PHONE = "(407) 625-6826"
MAX_REPLIES_PER_RUN = 10


class GoogleError(Exception):
    pass


# ---------------- reply writer ----------------
OPENERS_GOOD = [
    "Thank you so much, {name}!",
    "Thanks a lot for the great review, {name}!",
    "We really appreciate this, {name}!",
    "{name}, thank you for taking the time to leave a review!",
    "Thanks for the kind words, {name}!",
]
MIDDLES = [
    (r"\b(staff|service|friendly|helpful|nice|knowledgeable|team|guy|girl|owner|cashier|employee)\b",
     ["Our team works hard to make every visit easy, and it's great to hear it shows.",
      "We'll pass this on to the team. They'll be happy to hear it."]),
    (r"\b(deliver|delivery|fast|quick|door|on time)\b",
     ["Glad the delivery went smoothly!", "Happy to hear the delivery was quick and easy."]),
    (r"\b(selection|variety|options|everything|stocked|choices)\b",
     ["We keep adding new items, so there's always something new on the shelf.",
      "Glad you found what you were looking for."]),
    (r"\b(price|prices|deal|deals|affordable|cheap|reasonable)\b",
     ["We try hard to keep our prices fair for our neighbors.", "Glad you found a good deal."]),
    (r"\b(clean|organized|vibe|atmosphere|store looks)\b",
     ["Thanks for noticing; we take pride in keeping the store clean and organized."]),
]
DEFAULT_MIDDLE = ["We're glad you had a good experience at HD Smoke Shop.",
                  "It means a lot to a small local shop like ours.",
                  "We're happy to have you as a customer."]
CLOSERS_GOOD = ["See you next time!", "Hope to see you again soon on SR 434!", "Thanks for supporting a local shop!",
                "See you soon!"]
REPLY_OK = [
    "Thanks for the feedback, {name}. We're always working to improve, and we'd love to hear what would make your next visit better. Feel free to call us at {phone}.",
    "Thank you for the review, {name}. If there's anything we could have done better, please let us know at {phone}. We'd like every visit to be a 5-star one.",
]
REPLY_BAD = [
    "{name}, we're sorry to hear about your experience. That's not what we want for any customer. Please call us at {phone} so we can understand what happened and make it right.",
    "Thank you for letting us know, {name}, and we apologize. We'd really like to hear more and fix this. Please give us a call at {phone}.",
    "We're sorry, {name}. We take this seriously and would like to talk with you directly. Please reach us at {phone} and ask for the manager.",
]


def _pick(options: list, seed: str, salt: str = "") -> str:
    n = int(hashlib.sha256((seed + salt).encode()).hexdigest(), 16)
    return options[n % len(options)]


def first_name(display: str) -> str:
    name = re.sub(r"[^A-Za-zÀ-ÿ' -]", "", str(display or "")).strip().split(" ")[0] if display else ""
    return name[:20].title() if name and name.lower() not in ("a", "google", "user") else "there"


def write_reply(review_id: str, stars: int, display_name: str, comment: str) -> str:
    name = first_name(display_name)
    text = str(comment or "").lower()
    if stars <= 2:
        return _pick(REPLY_BAD, review_id).format(name=name, phone=PHONE)
    if stars == 3:
        return _pick(REPLY_OK, review_id).format(name=name, phone=PHONE)
    opener = _pick(OPENERS_GOOD, review_id, "o").format(name=name)
    if name == "there":
        opener = opener.replace(", there", "").replace("there, thank", "Thank")
    middle = next((_pick(lines, review_id, "m") for pattern, lines in MIDDLES if re.search(pattern, text)), _pick(DEFAULT_MIDDLE, review_id, "m"))
    return f"{opener} {middle} {_pick(CLOSERS_GOOD, review_id, 'c')}"


# ---------------- API client ----------------
class GoogleReviews:
    def __init__(self, db, client_id: str, client_secret: str, redirect_uri: str, secret: str, http_client_factory=None):
        self.db = db
        self.client_id = (client_id or "").strip()
        self.client_secret = (client_secret or "").strip()
        self.redirect_uri = (redirect_uri or "").strip()
        self.http = http_client_factory or (lambda **kw: httpx.AsyncClient(**kw))
        self.cipher = Fernet(base64.urlsafe_b64encode(hashlib.sha256(("google-bp:" + secret).encode()).digest()))

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    async def config(self) -> dict:
        return await self.db.integrations.find_one({"key": "google_reviews"}) or {}

    async def status(self) -> dict:
        c = await self.config()
        last = await self.db.google_review_replies.find_one({}, {"_id": 0}, sort=[("at", -1)])
        return {"configured": self.configured, "connected": bool(c.get("encryptedRefreshToken") and c.get("locationName")),
                "locationTitle": c.get("locationTitle", ""), "connectedAt": c.get("connectedAt"), "lastError": c.get("lastError", ""),
                "lastCheckedAt": c.get("lastCheckedAt"), "repliedCount": await self.db.google_review_replies.count_documents({}),
                "lastReply": last or {}}

    async def auth_url(self, admin_id: str) -> str:
        if not self.configured:
            raise GoogleError("Google sign-in isn't set up on the server yet (GOOGLE_BP_CLIENT_ID / GOOGLE_BP_CLIENT_SECRET).")
        state = secrets.token_urlsafe(24)
        await self.db.oauth_states.insert_one({"kind": "google_reviews", "state": state, "adminId": admin_id,
                                               "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=15)})
        return AUTH_URL + "?" + urlencode({"client_id": self.client_id, "redirect_uri": self.redirect_uri, "response_type": "code",
                                           "scope": SCOPE, "access_type": "offline", "prompt": "consent", "state": state})

    async def _token(self, data: dict) -> dict:
        async with self.http(timeout=30) as client:
            r = await client.post(TOKEN_URL, data={**data, "client_id": self.client_id, "client_secret": self.client_secret})
        payload = r.json() if r.content else {}
        if r.is_error or not payload.get("access_token"):
            raise GoogleError(payload.get("error_description") or payload.get("error") or "Google did not accept the sign-in.")
        return payload

    async def _access(self) -> str:
        c = await self.config()
        if not c.get("encryptedRefreshToken"):
            raise GoogleError("Google is not connected.")
        refresh = self.cipher.decrypt(c["encryptedRefreshToken"].encode()).decode()
        return (await self._token({"grant_type": "refresh_token", "refresh_token": refresh}))["access_token"]

    async def _get(self, token: str, url: str, params: Optional[dict] = None) -> dict:
        async with self.http(timeout=30) as client:
            r = await client.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
        payload = r.json() if r.content else {}
        if r.is_error:
            raise GoogleError(((payload.get("error") or {}).get("message")) or f"Google returned {r.status_code}.")
        return payload

    async def callback(self, code: str, state: str) -> dict:
        row = await self.db.oauth_states.find_one_and_delete({"kind": "google_reviews", "state": state,
                                                             "expiresAt": {"$gt": datetime.now(timezone.utc)}})
        if not row:
            raise GoogleError("The Google sign-in link expired. Start again from the Agents page.")
        tokens = await self._token({"grant_type": "authorization_code", "code": code, "redirect_uri": self.redirect_uri})
        if not tokens.get("refresh_token"):
            raise GoogleError("Google didn't return offline access. Remove the app at myaccount.google.com/permissions and connect again.")
        access = tokens["access_token"]
        accounts = (await self._get(access, ACCOUNTS_URL)).get("accounts") or []
        location, account = None, None
        for acc in accounts:
            locs = (await self._get(access, f"{INFO_URL}/{acc['name']}/locations", {"readMask": "name,title", "pageSize": 100})).get("locations") or []
            pick = next((l for l in locs if "hd smoke" in str(l.get("title", "")).lower()), locs[0] if locs else None)
            if pick:
                location, account = pick, acc
                break
        if not location:
            raise GoogleError("No Google Business Profile location was found for this Google account.")
        doc = {"key": "google_reviews", "encryptedRefreshToken": self.cipher.encrypt(tokens["refresh_token"].encode()).decode(),
               "accountName": account["name"], "locationName": location["name"], "locationTitle": location.get("title", ""),
               "connectedAt": datetime.now(timezone.utc), "lastError": ""}
        await self.db.integrations.update_one({"key": "google_reviews"}, {"$set": doc}, upsert=True)
        return doc

    async def disconnect(self) -> None:
        await self.db.integrations.delete_one({"key": "google_reviews"})

    async def reply_new(self, notify=None) -> list[dict]:
        c = await self.config()
        if not c.get("locationName"):
            return []
        token = await self._access()
        loc_id = c["locationName"].split("/")[-1]
        base = f"{REVIEWS_URL}/{c['accountName']}/locations/{loc_id}/reviews"
        payload = await self._get(token, base, {"pageSize": 50, "orderBy": "updateTime desc"})
        done = []
        for rv in payload.get("reviews") or []:
            if len(done) >= MAX_REPLIES_PER_RUN:
                break
            if rv.get("reviewReply") or await self.db.google_review_replies.find_one({"reviewId": rv["reviewId"]}, {"_id": 1}):
                continue
            stars = STARS.get(rv.get("starRating"), 0)
            if not stars:
                continue
            name = (rv.get("reviewer") or {}).get("displayName") or ""
            text = write_reply(rv["reviewId"], stars, name, rv.get("comment") or "")
            async with self.http(timeout=30) as client:
                r = await client.put(f"{base}/{rv['reviewId']}/reply", json={"comment": text}, headers={"Authorization": f"Bearer {token}"})
            if r.is_error:
                raise GoogleError(f"Google did not accept a reply ({r.status_code}).")
            row = {"reviewId": rv["reviewId"], "stars": stars, "reviewer": name, "comment": (rv.get("comment") or "")[:2000],
                   "reply": text, "at": datetime.now(timezone.utc)}
            await self.db.google_review_replies.insert_one(dict(row))
            done.append(row)
            if notify and stars <= 3:
                await notify(row)
        await self.db.integrations.update_one({"key": "google_reviews"}, {"$set": {"lastCheckedAt": datetime.now(timezone.utc), "lastError": ""}})
        return done


async def reply_new(h) -> None:
    """Automation entry point (called every 2 hours by automations.tick)."""
    import automations
    import emails
    gr = h.google_factory()

    async def notify(row):
        body = (f'<p style="font-size:15px;"><b>{row["stars"]}★ from {escape(row["reviewer"] or "a customer")}</b></p>'
                f'<p style="font-size:15px;line-height:1.6;color:#374151;">“{escape(row["comment"] or "(no text)")}”</p>'
                f'<p style="font-size:14px;color:#6b7280;">We replied: “{escape(row["reply"])}”</p>'
                f'<p style="font-size:14px;color:#6b7280;">If you want to change the reply, edit it in Google Business Profile.</p>')
        await emails._send([emails.NOTIFY_EMAIL], f"New {row['stars']}★ Google review", emails.layout("New Google review", body), "auto_google_review")

    try:
        rows = await gr.reply_new(notify)
    except Exception as exc:
        await h.db.integrations.update_one({"key": "google_reviews"}, {"$set": {"lastError": str(exc)[:300]}})
        raise
    for row in rows:
        await automations.log(h.db, "google_reviews", f"Replied to a {row['stars']}★ Google review from {first_name(row['reviewer'])}.")

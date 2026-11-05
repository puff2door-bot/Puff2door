"""Instagram publishing integration for Agent 12.

The integration supports Meta's Instagram Login flow and the legacy Facebook
Login for Business flow. Credentials are encrypted before storage, every state
token is single-use, and the daily job is disabled until an administrator
explicitly enables it for the verified account.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import logging
import re
import secrets
import textwrap
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode, urlsplit
from zoneinfo import ZoneInfo

import httpx
from cryptography.fernet import Fernet, InvalidToken
from PIL import Image, ImageDraw, ImageFont


GRAPH_HOST = "https://graph.facebook.com"
LOGIN_HOST = "https://www.facebook.com"
INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com"
INSTAGRAM_LOGIN_HOST = "https://www.instagram.com"
INSTAGRAM_TOKEN_HOST = "https://api.instagram.com"
DEFAULT_TIMEZONE = "America/New_York"
ALLOWED_GRAPH_VERSIONS = {f"v{major}.0" for major in range(20, 40)}

# httpx emits complete request URLs at INFO. Some Meta token endpoints require
# credentials in their query string, so keep these libraries above INFO even if
# the application later configures the root logger at INFO.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
SAFE_TOPICS = (
    ("Local & Independent", "Proudly serving Altamonte Springs every day.", "Community-first service, seven days a week."),
    ("Open Daily", "Friendly help from 10 AM to 10 PM.", "Plan your visit when it works for you."),
    ("Know Before You Go", "Adults 21+ only. Valid photo ID required.", "A quick ID check keeps every visit responsible."),
    ("Altamonte Springs", "Your neighborhood shop on SR 434.", "Local service with a clean, welcoming experience."),
    ("Questions Welcome", "Our team is here to help in store.", "Stop by for friendly, straightforward guidance."),
    ("Pickup Made Simple", "Prepare online, then collect at the store.", "Availability and age verification apply."),
    ("Local Delivery", "Convenient local service in eligible areas.", "Adults 21+; ID is checked at delivery."),
    ("Store Spotlight", "Clean shelves. Helpful people. Local service.", "A better neighborhood shop experience."),
    ("Responsible Service", "Age checks are part of every eligible order.", "Adults 21+ only. Please have valid ID ready."),
    ("Weekend Ready", "We are open every day, including weekends.", "Visit HD Smoke Shop from 10 AM to 10 PM."),
    ("Shop Local", "Supporting a neighborhood business matters.", "Thank you, Altamonte Springs."),
    ("Daily Reminder", "Open today from 10 AM to 10 PM.", "Find us on SR 434 in Altamonte Springs."),
    ("Customer Care", "Clear answers and friendly in-store service.", "We are here to make every visit simple."),
    ("Community Note", "Serving Altamonte Springs with care.", "Adults 21+ only. Valid ID required."),
)
THEMES = (
    ((11, 42, 31), (35, 131, 87), (186, 255, 218)),
    ((27, 26, 54), (88, 70, 170), (228, 222, 255)),
    ((42, 27, 11), (188, 98, 34), (255, 228, 188)),
    ((13, 39, 58), (23, 119, 168), (199, 237, 255)),
    ((47, 20, 34), (169, 55, 94), (255, 210, 227)),
    ((20, 42, 43), (37, 132, 135), (202, 251, 252)),
    ((38, 35, 23), (146, 119, 45), (255, 242, 188)),
)
THEME_NAMES = (
    "Emerald Glow", "Neon Violet", "Warm Local", "Electric Blue",
    "Bold Magenta", "Modern Teal", "Premium Gold",
)


class InstagramError(RuntimeError):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_username(value: str) -> str:
    return str(value or "").strip().lstrip("@").lower()


def valid_https_url(value: str) -> bool:
    try:
        parsed = urlsplit(str(value or ""))
    except ValueError:
        return False
    return parsed.scheme == "https" and bool(parsed.netloc) and not parsed.username and not parsed.password


def safe_caption(topic: tuple[str, str, str]) -> str:
    title, message, detail = topic
    caption = (
        f"{title}\n\n{message}\n{detail}\n\n"
        "HD Smoke Shop · Altamonte Springs, FL\n"
        "Open daily, 10 AM–10 PM\n\n"
        "Adults 21+ only. Valid government-issued photo ID required. "
        "No health claims. Availability and local rules apply.\n\n"
        "#AltamonteSprings #ShopLocal #HDSmokeShop"
    )
    banned = ("discount", "sale", "free", "cure", "treat", "safe alternative", "buy now", "limited time")
    lowered = caption.lower()
    if any(term in lowered for term in banned):
        raise InstagramError("The generated caption failed the regulated-content policy check.")
    return caption[:2200]


def _font(size: int, bold: bool = False):
    candidates = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_social_image(topic: tuple[str, str, str], theme_index: int) -> bytes:
    """Render a deterministic, upload-ready square PNG without a paid image API."""
    background, accent, pale = THEMES[theme_index % len(THEMES)]
    image = Image.new("RGB", (1080, 1080), background)
    draw = ImageDraw.Draw(image, "RGBA")
    style = theme_index % len(THEMES)
    if style == 0:  # soft glow
        draw.ellipse((720, -150, 1220, 350), fill=(*accent, 180))
        draw.ellipse((-180, 760, 320, 1260), fill=(*accent, 125))
    elif style == 1:  # neon beams
        for offset in range(-160, 1180, 180):
            draw.line((offset, 1080, offset + 430, 0), fill=(*accent, 105), width=18)
        draw.ellipse((760, 40, 980, 260), outline=(*pale, 210), width=10)
    elif style == 2:  # warm rising sun
        draw.ellipse((650, -110, 1170, 410), fill=(*accent, 190))
        for radius in (270, 340, 410):
            draw.arc((770 - radius, 160 - radius, 770 + radius, 160 + radius), 15, 165, fill=(*pale, 80), width=5)
    elif style == 3:  # electric grid
        for x in range(40, 1080, 105):
            draw.line((x, 0, x, 1080), fill=(*accent, 42), width=2)
        for y in range(30, 1080, 105):
            draw.line((0, y, 1080, y), fill=(*accent, 42), width=2)
        draw.rounded_rectangle((730, -60, 1110, 315), radius=90, fill=(*accent, 155))
    elif style == 4:  # bold editorial blocks
        draw.polygon([(610, 0), (1080, 0), (1080, 470), (860, 360)], fill=(*accent, 190))
        draw.rounded_rectangle((-90, 770, 500, 1150), radius=120, fill=(*accent, 110))
    elif style == 5:  # modern concentric rings
        for radius, alpha in ((420, 50), (330, 70), (240, 95), (150, 125)):
            draw.ellipse((880 - radius, 120 - radius, 880 + radius, 120 + radius), outline=(*accent, alpha), width=16)
    else:  # premium gold facets
        draw.polygon([(650, 0), (1080, 0), (1080, 420)], fill=(*accent, 160))
        draw.polygon([(0, 760), (0, 1080), (430, 1080)], fill=(*accent, 100))
        draw.line((600, 90, 1000, 490), fill=(*pale, 120), width=6)
    draw.rounded_rectangle((72, 72, 1008, 1008), radius=44, outline=(*pale, 70), width=3)
    draw.rounded_rectangle((84, 84, 268, 158), radius=30, fill=(*pale, 235))
    draw.text((116, 103), "HD  ·  DAILY", font=_font(24, True), fill=background)

    title, message, detail = topic
    draw.text((92, 252), title.upper(), font=_font(68, True), fill=pale)
    y = 382
    for line in textwrap.wrap(message, width=25):
        draw.text((92, y), line, font=_font(56, True), fill=(255, 255, 255))
        y += 70
    y += 24
    for line in textwrap.wrap(detail, width=42):
        draw.text((94, y), line, font=_font(34), fill=(*pale, 235))
        y += 48

    draw.line((94, 866, 986, 866), fill=(*pale, 95), width=3)
    draw.text((94, 902), "ALTAMONTE SPRINGS  ·  OPEN DAILY 10–10", font=_font(25, True), fill=pale)
    draw.text((94, 950), "ADULTS 21+  ·  VALID ID REQUIRED", font=_font(22, True), fill=(*pale, 210))
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def next_post_at(now: datetime, hour: int = 9, minute: int = 0, timezone_name: str = DEFAULT_TIMEZONE) -> datetime:
    zone = ZoneInfo(timezone_name)
    local_now = now.astimezone(zone)
    candidate = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= local_now:
        candidate += timedelta(days=1)
    return candidate.astimezone(timezone.utc)


class InstagramIntegration:
    def __init__(
        self,
        db,
        *,
        app_id: str,
        app_secret: str,
        config_id: str,
        business_id: str,
        redirect_uri: str,
        public_url: str,
        encryption_secret: str,
        expected_username: str,
        graph_version: str = "v27.0",
        auth_mode: str = "facebook",
        http_client_factory=None,
    ):
        self.db = db
        self.app_id = str(app_id or "").strip()
        self.app_secret = str(app_secret or "").strip()
        self.config_id = str(config_id or "").strip()
        self.business_id = str(business_id or "").strip()
        self.redirect_uri = str(redirect_uri or "").strip()
        self.public_url = str(public_url or "").strip().rstrip("/")
        self.expected_username = normalize_username(expected_username)
        self.graph_version = graph_version if graph_version in ALLOWED_GRAPH_VERSIONS else "v27.0"
        self.auth_mode = "instagram" if str(auth_mode or "").strip().lower() == "instagram" else "facebook"
        self.http_client_factory = http_client_factory or (lambda **kwargs: httpx.AsyncClient(**kwargs))
        secret = str(encryption_secret or "")
        self.cipher = None
        if len(secret.encode("utf-8")) >= 32:
            key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
            self.cipher = Fernet(key)

    @property
    def configured(self) -> bool:
        common = bool(
            self.app_id and self.app_secret and self.cipher
            and valid_https_url(self.redirect_uri) and valid_https_url(self.public_url)
            and self.expected_username
        )
        if self.auth_mode == "instagram":
            return common
        return bool(common and self.config_id and self.business_id)

    def encrypt(self, value: str) -> str:
        if not self.cipher:
            raise InstagramError("Instagram token encryption is not configured.")
        return self.cipher.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, value: str) -> str:
        if not self.cipher:
            raise InstagramError("Instagram token encryption is not configured.")
        try:
            return self.cipher.decrypt(str(value or "").encode("ascii")).decode("utf-8")
        except (InvalidToken, ValueError, TypeError) as exc:
            raise InstagramError("Stored Instagram authorization is unreadable. Reconnect Instagram.") from exc

    async def config(self) -> dict:
        return await self.db.integrations.find_one({"key": "instagram"}) or {}

    async def log(self, action: str, status: str, **details) -> None:
        safe = {}
        for key, value in details.items():
            if re.search(r"token|secret|authorization|password", str(key), re.I):
                continue
            safe[key] = str(value)[:500] if isinstance(value, str) else value
        await self.db.social_audit_logs.insert_one({
            "id": secrets.token_hex(12), "action": action, "status": status,
            "createdAt": utcnow(), **safe,
        })

    async def create_authorization_url(self, admin_id: str) -> str:
        if not self.configured:
            raise InstagramError("Instagram server secrets are not configured yet.")
        state = secrets.token_urlsafe(32)
        await self.db.instagram_oauth_states.insert_one({
            "stateHash": hashlib.sha256(state.encode()).hexdigest(),
            "adminId": admin_id,
            "createdAt": utcnow(),
            "expiresAt": utcnow() + timedelta(minutes=15),
        })
        if self.auth_mode == "instagram":
            query = urlencode({
                "client_id": self.app_id,
                "redirect_uri": self.redirect_uri,
                "state": state,
                "response_type": "code",
                "scope": "instagram_business_basic,instagram_business_content_publish",
                "enable_fb_login": "false",
            })
            return f"{INSTAGRAM_LOGIN_HOST}/oauth/authorize?{query}"
        query = urlencode({
            "client_id": self.app_id,
            "redirect_uri": self.redirect_uri,
            "state": state,
            "response_type": "code",
            "config_id": self.config_id,
        })
        return f"{LOGIN_HOST}/{self.graph_version}/dialog/oauth?{query}"

    async def _json(self, response: httpx.Response, fallback: str) -> dict:
        try:
            payload = response.json() if response.content else {}
        except ValueError:
            payload = {}
        if response.is_error or payload.get("error"):
            error = payload.get("error") or {}
            message = error.get("message") if isinstance(error, dict) else str(error)
            raise InstagramError(str(message or fallback))
        return payload if isinstance(payload, dict) else {}

    async def _get_profile(self, token: str) -> dict:
        fields = "id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url}"
        graph_headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "HD-Agent-12/1.0",
        }
        async with self.http_client_factory(timeout=30) as client:
            response = await client.get(
                f"{GRAPH_HOST}/{self.graph_version}/me/accounts",
                params={"fields": fields, "limit": 100},
                headers=graph_headers,
            )
            payload = await self._json(response, "Meta did not return the managed Pages.")
            pages = payload.get("data") or []
            candidates = []
            for page in pages:
                ig = page.get("instagram_business_account") or {}
                page_token = str(page.get("access_token") or "")
                if ig.get("id") and page_token:
                    if not ig.get("username"):
                        detail_response = await client.get(
                            f"{GRAPH_HOST}/{self.graph_version}/{ig['id']}",
                            params={"fields": "id,username,name,profile_picture_url"},
                            headers={
                                "Accept": "application/json",
                                "Authorization": f"Bearer {page_token}",
                                "User-Agent": "HD-Agent-12/1.0",
                            },
                        )
                        ig.update(await self._json(detail_response, "Meta could not verify the Instagram profile."))
                    candidates.append((page, ig, page_token))
            if not candidates:
                # A least-privilege Business Login configuration can grant the
                # Instagram asset without granting the linked Page asset. The
                # /instagram_accounts edge returns accounts this business can
                # access, including an account explicitly selected in Business
                # Login. /owned_instagram_accounts is a compatibility fallback
                # for older configurations that grant the ownership edge.
                business_errors = []
                for edge in ("instagram_accounts", "owned_instagram_accounts"):
                    business_response = await client.get(
                        f"{GRAPH_HOST}/{self.graph_version}/{self.business_id}/{edge}",
                        params={"fields": "id,username,name,profile_picture_url", "limit": 100},
                        headers=graph_headers,
                    )
                    try:
                        business_payload = await self._json(
                            business_response, "Meta did not return the business Instagram accounts."
                        )
                    except InstagramError as exc:
                        business_errors.append(str(exc))
                        continue
                    for ig in business_payload.get("data") or []:
                        if ig.get("id"):
                            candidates.append(({"id": "", "name": "HD Smoke Shop"}, ig, token))
                    if candidates:
                        break
                if not candidates and business_errors:
                    raise InstagramError(business_errors[0])
        for page, ig, page_token in candidates:
            if normalize_username(ig.get("username")) == self.expected_username:
                return {"page": page, "instagram": ig, "pageToken": page_token}
        found = ", ".join(sorted({normalize_username(ig.get("username")) for _, ig, _ in candidates if ig.get("username")}))
        suffix = f" Meta returned: {found}." if found else " No linked professional Instagram account was returned."
        raise InstagramError(f"Expected @{self.expected_username}, but it was not authorized.{suffix}")

    async def _get_instagram_login_profile(self, token: str) -> dict:
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "HD-Agent-12/1.0",
        }
        async with self.http_client_factory(timeout=30) as client:
            response = await client.get(
                f"{INSTAGRAM_GRAPH_HOST}/{self.graph_version}/me",
                params={"fields": "user_id,username,name,profile_picture_url,account_type"},
                headers=headers,
            )
            payload = await self._json(response, "Instagram did not return the authorized profile.")
        row = payload
        if isinstance(payload.get("data"), list) and payload["data"]:
            row = payload["data"][0]
        username = normalize_username(row.get("username"))
        if username != self.expected_username:
            found = f"@{username}" if username else "an unknown account"
            raise InstagramError(f"Expected @{self.expected_username}, but Instagram authorized {found}.")
        user_id = str(row.get("user_id") or row.get("id") or "")
        if not user_id:
            raise InstagramError("Instagram returned an incomplete professional-account profile.")
        return {
            "page": {"id": "", "name": "Instagram Login"},
            "instagram": {**row, "id": user_id, "username": username},
            "pageToken": token,
        }

    async def exchange_code(self, code: str, state: str) -> dict:
        state_hash = hashlib.sha256(str(state or "").encode()).hexdigest()
        saved = await self.db.instagram_oauth_states.find_one_and_delete({
            "stateHash": state_hash, "expiresAt": {"$gt": utcnow()},
        })
        if not saved:
            raise InstagramError("The Instagram connection link expired. Start again from the admin panel.")
        if not self.configured:
            raise InstagramError("Instagram server settings are incomplete.")
        headers = {"Accept": "application/json", "User-Agent": "HD-Agent-12/1.0"}
        if self.auth_mode == "instagram":
            async with self.http_client_factory(timeout=30) as client:
                response = await client.post(
                    f"{INSTAGRAM_TOKEN_HOST}/oauth/access_token",
                    data={
                        "client_id": self.app_id,
                        "client_secret": self.app_secret,
                        "grant_type": "authorization_code",
                        "redirect_uri": self.redirect_uri,
                        "code": code,
                    },
                    headers=headers,
                )
                payload = await self._json(response, "Instagram did not accept the authorization code.")
                token_row = payload
                if isinstance(payload.get("data"), list) and payload["data"]:
                    token_row = payload["data"][0]
                short_token = str(token_row.get("access_token") or "")
                if not short_token:
                    raise InstagramError("Instagram returned an incomplete authorization response.")
                long_response = await client.get(
                    f"{INSTAGRAM_GRAPH_HOST}/access_token",
                    params={
                        "grant_type": "ig_exchange_token",
                        "client_secret": self.app_secret,
                        "access_token": short_token,
                    },
                    headers=headers,
                )
                long_payload = await self._json(long_response, "Instagram could not create a long-lived token.")
            user_token = str(long_payload.get("access_token") or "")
            if not user_token:
                raise InstagramError("Instagram returned an incomplete long-lived token response.")
            profile = await self._get_instagram_login_profile(user_token)
        else:
            async with self.http_client_factory(timeout=30) as client:
                response = await client.post(
                    f"{GRAPH_HOST}/{self.graph_version}/oauth/access_token",
                    data={
                        "client_id": self.app_id,
                        "client_secret": self.app_secret,
                        "redirect_uri": self.redirect_uri,
                        "code": code,
                    },
                    headers=headers,
                )
                payload = await self._json(response, "Meta did not accept the authorization code.")
            user_token = str(payload.get("access_token") or "")
            if not user_token:
                raise InstagramError("Meta returned an incomplete authorization response.")
            profile = await self._get_profile(user_token)
        ig = profile["instagram"]
        page = profile["page"]
        now = utcnow()
        doc = {
            "key": "instagram",
            "username": normalize_username(ig.get("username")),
            "instagramUserId": str(ig.get("id") or ""),
            "pageId": str(page.get("id") or ""),
            "pageName": str(page.get("name") or "")[:200],
            "encryptedSystemUserToken": self.encrypt(user_token),
            "encryptedPageToken": self.encrypt(profile["pageToken"]),
            "authMode": self.auth_mode,
            "verified": True,
            "connectedAt": now,
            "connectedBy": saved.get("adminId"),
            "autoPublishEnabled": False,
            "scheduleHour": 9,
            "scheduleMinute": 0,
            "timezone": DEFAULT_TIMEZONE,
            "updatedAt": now,
        }
        await self.db.integrations.update_one({"key": "instagram"}, {"$set": doc}, upsert=True)
        await self.log("connect", "success", username=doc["username"], instagramUserId=doc["instagramUserId"])
        return doc

    async def generate_draft(self, for_date: Optional[str] = None, source: str = "admin") -> dict:
        zone = ZoneInfo(DEFAULT_TIMEZONE)
        date_key = for_date or utcnow().astimezone(zone).date().isoformat()
        # Calendar-based rotation guarantees that consecutive days never reuse
        # the same topic or visual theme, while still cycling indefinitely.
        ordinal = date.fromisoformat(date_key).toordinal()
        topic_index = ordinal % len(SAFE_TOPICS)
        theme_index = ordinal % len(THEMES)
        topic = SAFE_TOPICS[topic_index]
        image = render_social_image(topic, theme_index)
        media_id = secrets.token_hex(16)
        image_url = f"{self.public_url}/api/social/media/{media_id}.png"
        draft_id = secrets.token_hex(12)
        now = utcnow()
        await self.db.social_media.insert_one({
            "id": media_id, "bytes": image, "contentType": "image/png", "createdAt": now,
        })
        draft = {
            "id": draft_id, "dateKey": date_key, "platform": "instagram",
            "topic": topic[0], "caption": safe_caption(topic), "imageUrl": image_url,
            "themeIndex": theme_index, "themeName": THEME_NAMES[theme_index],
            "status": "draft", "source": source,
            "createdAt": now, "updatedAt": now,
        }
        await self.db.social_drafts.insert_one(draft)
        await self.log("draft", "success", draftId=draft_id, dateKey=date_key, source=source)
        return draft

    async def publish_draft(self, draft_id: str, source: str = "admin") -> dict:
        config = await self.config()
        if not config.get("verified") or normalize_username(config.get("username")) != self.expected_username:
            raise InstagramError(f"Verify @{self.expected_username} before publishing.")
        draft = await self.db.social_drafts.find_one({"id": draft_id})
        if not draft:
            raise InstagramError("Social draft not found.")
        if draft.get("status") == "published":
            return draft
        if not valid_https_url(draft.get("imageUrl", "")):
            raise InstagramError("The social image must have a public HTTPS URL.")
        page_token = self.decrypt(config.get("encryptedPageToken", ""))
        ig_id = str(config.get("instagramUserId") or "")
        graph_host = INSTAGRAM_GRAPH_HOST if config.get("authMode") == "instagram" else GRAPH_HOST
        graph_headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {page_token}",
            "User-Agent": "HD-Agent-12/1.0",
        }
        async with self.http_client_factory(timeout=45) as client:
            create_response = await client.post(
                f"{graph_host}/{self.graph_version}/{ig_id}/media",
                data={"image_url": draft["imageUrl"], "caption": draft["caption"]},
                headers=graph_headers,
            )
            created = await self._json(create_response, "Meta could not create the Instagram media container.")
            creation_id = str(created.get("id") or "")
            if not creation_id:
                raise InstagramError("Meta did not return a media container ID.")
            ready = False
            for attempt in range(12):
                status_response = await client.get(
                    f"{graph_host}/{self.graph_version}/{creation_id}",
                    params={"fields": "status_code,status"},
                    headers=graph_headers,
                )
                container_status = await self._json(
                    status_response, "Meta could not check the Instagram media container."
                )
                status_code = str(container_status.get("status_code") or "").upper()
                if status_code in {"FINISHED", "PUBLISHED"}:
                    ready = True
                    break
                if status_code in {"ERROR", "EXPIRED"}:
                    raise InstagramError("Meta could not process the Instagram image.")
                if attempt < 11:
                    await asyncio.sleep(2)
            if not ready:
                raise InstagramError("The Instagram image was not ready before the publishing timeout.")
            publish_response = await client.post(
                f"{graph_host}/{self.graph_version}/{ig_id}/media_publish",
                data={"creation_id": creation_id},
                headers=graph_headers,
            )
            published = await self._json(publish_response, "Meta could not publish the Instagram post.")
            media_id = str(published.get("id") or "")
            permalink = ""
            if media_id:
                detail_response = await client.get(
                    f"{graph_host}/{self.graph_version}/{media_id}",
                    params={"fields": "id,permalink,timestamp"},
                    headers=graph_headers,
                )
                detail = await self._json(detail_response, "Meta could not return the published post details.")
                permalink = str(detail.get("permalink") or "")
        now = utcnow()
        updates = {
            "status": "published", "publishedAt": now, "publishedMediaId": media_id,
            "permalink": permalink, "publishSource": source, "updatedAt": now,
        }
        await self.db.social_drafts.update_one({"id": draft_id}, {"$set": updates})
        await self.db.integrations.update_one({"key": "instagram"}, {"$set": {
            "lastPostAt": now, "lastPostId": media_id, "lastPostPermalink": permalink, "updatedAt": now,
        }})
        await self.log("publish", "success", draftId=draft_id, mediaId=media_id, source=source, username=config.get("username"))
        return {**draft, **updates}

    async def run_daily(self, now: Optional[datetime] = None) -> dict:
        now = now or utcnow()
        config = await self.config()
        if not config.get("autoPublishEnabled"):
            return {"status": "disabled", "published": False}
        if not config.get("verified") or normalize_username(config.get("username")) != self.expected_username:
            raise InstagramError("The configured Instagram username is not verified.")
        timezone_name = str(config.get("timezone") or DEFAULT_TIMEZONE)
        zone = ZoneInfo(timezone_name)
        local_now = now.astimezone(zone)
        hour = int(config.get("scheduleHour", 9))
        minute = int(config.get("scheduleMinute", 0))
        if (local_now.hour, local_now.minute) < (hour, minute):
            return {"status": "not_due", "published": False}
        date_key = local_now.date().isoformat()
        existing = await self.db.social_drafts.find_one({"dateKey": date_key, "status": "published"})
        if existing:
            return {"status": "already_published", "published": False, "draftId": existing.get("id")}
        draft = await self.db.social_drafts.find_one({"dateKey": date_key, "platform": "instagram", "status": "draft"})
        if not draft:
            draft = await self.generate_draft(date_key, source="agent12")
        result = await self.publish_draft(draft["id"], source="agent12")
        return {"status": "published", "published": True, "draftId": result["id"], "permalink": result.get("permalink", "")}

    async def status(self) -> dict:
        config = await self.config()
        latest = await self.db.social_drafts.find_one({}, {"_id": 0, "caption": 0}, sort=[("createdAt", -1)])
        return {
            "configured": self.configured,
            "connected": bool(config.get("verified") and config.get("encryptedPageToken")),
            "verified": bool(config.get("verified")),
            "username": config.get("username", ""),
            "expectedUsername": self.expected_username,
            "autoPublishEnabled": bool(config.get("autoPublishEnabled")),
            "scheduleHour": int(config.get("scheduleHour", 9)),
            "scheduleMinute": int(config.get("scheduleMinute", 0)),
            "timezone": config.get("timezone", DEFAULT_TIMEZONE),
            "nextPostAt": next_post_at(
                utcnow(), int(config.get("scheduleHour", 9)), int(config.get("scheduleMinute", 0)),
                config.get("timezone", DEFAULT_TIMEZONE),
            ),
            "connectedAt": config.get("connectedAt"),
            "lastPostAt": config.get("lastPostAt"),
            "lastPostPermalink": config.get("lastPostPermalink", ""),
            "latestDraft": latest or {},
        }

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import httpx
import asyncio
import emails
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from gridfs.errors import NoFile
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional
import uuid
import random
import re
import json
import math
import mimetypes
import secrets
import hashlib
import csv
import io
import ipaddress
import socket
import zipcodes
from urllib.parse import urljoin, urlsplit
from datetime import datetime, timedelta, timezone, date, time as dtime
from zoneinfo import ZoneInfo
import jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
file_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="uploads")

JWT_SECRET = os.environ['JWT_SECRET']
if len(JWT_SECRET.encode("utf-8")) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 bytes")
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 1
JWT_REMEMBER_DAYS = 30
RESET_TOKEN_MINUTES = 60
ALLOW_PASSWORD_RESET_TOKEN_RESPONSE = os.environ.get("ALLOW_PASSWORD_RESET_TOKEN_RESPONSE", "").strip().lower() == "true"
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_utc():
    return datetime.now(timezone.utc)


def validate_password_strength(pw: str) -> str:
    if len(pw) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.isalpha() for c in pw) or not any(c.isdigit() for c in pw):
        raise ValueError("Password must include at least one letter and one number")
    return pw


# ----------------------------- Models -----------------------------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(max_length=256)
    firstName: str = Field(default="", max_length=80)
    lastName: str = Field(default="", max_length=80)
    address: str = Field(default="", max_length=200)
    state: str = Field(default="", max_length=40)
    city: str = Field(default="", max_length=100)
    zip: str = Field(default="", max_length=10)
    phone: str = Field(default="", max_length=30)

    @field_validator("password")
    @classmethod
    def _strong(cls, v):
        return validate_password_strength(v)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(max_length=256)
    rememberMe: bool = False


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ContactInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    subject: str = Field(min_length=2, max_length=160)
    message: str = Field(min_length=5, max_length=5000)


class NewsletterInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(max_length=256)

    @field_validator("password")
    @classmethod
    def _strong(cls, v):
        return validate_password_strength(v)


class CartItem(BaseModel):
    productId: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(ge=0, le=1000000)
    image: str = Field(default="", max_length=2048)
    category: str = Field(default="", max_length=100)
    categorySlug: str = Field(default="", max_length=120)
    slug: str = Field(default="", max_length=200)
    qty: int = Field(default=1, ge=1, le=99)


class CartInput(BaseModel):
    items: List[CartItem] = Field(default_factory=list, max_length=100)


class ReviewInput(BaseModel):
    productSlug: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=80)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class ShippingInfo(BaseModel):
    firstName: str = Field(min_length=1, max_length=80)
    lastName: str = Field(min_length=1, max_length=80)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=30)
    address: str = Field(min_length=3, max_length=200)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=40)
    zip: str = Field(pattern=r"^\d{5}(?:-\d{4})?$")


class OrderInput(BaseModel):
    items: List[CartItem] = Field(min_length=1, max_length=100)
    shipping: ShippingInfo
    subtotal: float = 0
    shippingCost: float = 0
    discount: float = 0
    total: float = 0
    paymentLast4: str = ""
    paymentMethod: str = "test_card"
    paymentToken: str = ""
    paypalOrderId: str = ""
    promoCode: str = ""
    redeemPoints: int = 0
    tip: float = Field(default=0, ge=0, le=500)
    expectSameDay: Optional[bool] = None
    dateOfBirth: str = ""
    deliveryWindowId: str = ""
    ageAttestationAccepted: bool = False


class PayPalCreateInput(BaseModel):
    items: List[CartItem] = Field(min_length=1, max_length=100)
    promoCode: str = ""
    zip: str = ""
    state: str = ""
    redeemPoints: int = 0
    tip: float = Field(default=0, ge=0, le=500)
    dateOfBirth: str = ""
    deliveryWindowId: str = ""
    ageAttestationAccepted: bool = False


class PaymentStatusInput(BaseModel):
    paymentStatus: str


class OrderIssueInput(BaseModel):
    email: EmailStr
    kind: str
    message: str = Field(default="", max_length=1000)

    @field_validator("kind")
    @classmethod
    def valid_issue_kind(cls, v):
        allowed = {"driver_late", "wrong_item", "missing_item", "payment_problem", "other"}
        if v not in allowed:
            raise ValueError("Choose a valid problem type")
        return v


class IssueResolutionInput(BaseModel):
    status: str
    resolution: str = ""

    @field_validator("status")
    @classmethod
    def valid_issue_status(cls, v):
        if v not in {"open", "working", "resolved"}:
            raise ValueError("Choose a valid status")
        return v


# ---- Payment providers config ----
SQUARE_APP_ID = os.environ.get("SQUARE_APPLICATION_ID", "").strip()
SQUARE_TOKEN = os.environ.get("SQUARE_ACCESS_TOKEN", "").strip()
SQUARE_LOCATION = os.environ.get("SQUARE_LOCATION_ID", "").strip()
SQUARE_ENV = os.environ.get("SQUARE_ENV", "sandbox").strip().lower()
SQUARE_ENABLED = bool(SQUARE_APP_ID and SQUARE_TOKEN and SQUARE_LOCATION and SQUARE_ENV in {"sandbox", "production"})
SQUARE_BASE = "https://connect.squareup.com" if SQUARE_ENV == "production" else "https://connect.squareupsandbox.com"
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "").strip()
PAYPAL_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET", "").strip()
PAYPAL_ENV = os.environ.get("PAYPAL_ENV", "sandbox").strip().lower()
PAYPAL_ENABLED = bool(PAYPAL_CLIENT_ID and PAYPAL_SECRET)
APPLE_PAY_ENABLED = PAYPAL_ENABLED and os.environ.get("APPLE_PAY_ENABLED", "false").strip().lower() == "true"
PAYPAL_BASE = "https://api-m.paypal.com" if PAYPAL_ENV in ("production", "live") else "https://api-m.sandbox.paypal.com"
ZELLE_EMAIL = os.environ.get("ZELLE_EMAIL", "").strip()
ZELLE_NAME = os.environ.get("ZELLE_NAME", "").strip()
ZELLE_ENABLED = bool(ZELLE_EMAIL)
REAL_CARD_PROVIDER = SQUARE_ENABLED or PAYPAL_ENABLED
# ALLOW_TEST_CARD=true keeps the simulated card usable for QA even when a real provider exists (hidden in UI). Leave unset in production.
TEST_CARD_ENABLED = os.environ.get("ALLOW_TEST_CARD", "").strip().lower() == "true"
PAYMENT_METHODS = {"test_card", "square", "cash_app", "paypal", "apple_pay", "zelle"}
DEFAULT_SETTINGS = {"taxRate": 0.065, "deliveryFee": 15.0, "freeDeliveryMin": 99.0, "deliveryZip": "32832", "deliveryRadiusMiles": 20.0, "allowedZipCodes": [],
                    "loyaltyEnabled": True, "pointsPerDollar": 1.0, "pointsPerReward": 100, "rewardValue": 5.0, "minRedeemPoints": 100, "maxRedeemPerOrder": 0, "minPurchaseForRedeem": 0.0, "signupBonusPoints": 50,
                    "sameDayEnabled": True, "deliveryCutoff": "20:00", "deliveryStart": "11:00", "deliveryEnd": "21:00", "deliveryDays": [0, 1, 2, 3, 4, 5, 6], "homepageLayout": "classic",
                    "deliverySlotCapacity": 8, "deliveryDriverCount": 1, "ordersPerDriverPerWindow": 8, "defaultEtaMinutes": 45}
STORE_TZ = ZoneInfo("America/New_York")
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DELIVERY_SLOTS = [("12:00", "14:00"), ("16:00", "18:00"), ("18:00", "20:00")]
_settings_cache: dict = {}


def zip_lookup(zip_code: str) -> Optional[dict]:
    z = re.sub(r"\D", "", zip_code or "")[:5]
    if len(z) != 5:
        return None
    hits = zipcodes.matching(z)
    if not hits or not hits[0].get("lat"):
        return None
    h = hits[0]
    return {"zip": z, "city": h.get("city", ""), "state": h.get("state", ""), "lat": float(h["lat"]), "lng": float(h["long"])}


def miles_between(a: dict, b: dict) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a["lat"], a["lng"], b["lat"], b["lng"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def delivery_zone_check(zip_code: str, settings: dict) -> dict:
    center_zip, radius = settings["deliveryZip"], float(settings["deliveryRadiusMiles"])
    allowed = settings.get("allowedZipCodes") or []
    base = {"zip": re.sub(r"\D", "", zip_code or "")[:5], "centerZip": center_zip, "radiusMiles": radius, "allowedZipCodes": allowed, "mode": "selected_zips" if allowed else "radius", "eligible": False, "distanceMiles": None, "city": "", "state": ""}
    target = zip_lookup(zip_code)
    if not target:
        return {**base, "message": "Please enter a valid 5-digit US ZIP code."}
    if allowed:
        ok = target["zip"] in allowed
        msg = f"Great news! We deliver to {target['city']}, {target['state']} {target['zip']}." if ok else f"Sorry, delivery is not currently available to ZIP {target['zip']}."
        return {**base, "city": target["city"], "state": target["state"], "eligible": ok, "message": msg}
    center = zip_lookup(center_zip)
    if not center:
        return {**base, "city": target["city"], "state": target["state"], "message": "Delivery area is not configured. Please contact us."}
    dist = round(miles_between(center, target), 1)
    ok = dist <= radius
    msg = f"Great news! We deliver to {target['city']}, {target['state']} {target['zip']} ({dist:g} mi away)." if ok else f"Sorry, we only deliver within {radius:g} miles of {center_zip}. {target['city']}, {target['state']} {target['zip']} is about {dist:g} miles away."
    return {**base, "city": target["city"], "state": target["state"], "eligible": ok, "distanceMiles": dist, "message": msg}


def require_delivery_zone(zip_code: str, settings: dict):
    res = delivery_zone_check(zip_code, settings)
    if not res["eligible"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res


def parse_cutoff(value: str) -> dtime:
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", (value or "").strip())
    if not m or not (0 <= int(m.group(1)) <= 23 and 0 <= int(m.group(2)) <= 59):
        raise ValueError("Cutoff must be HH:MM (24h)")
    return dtime(int(m.group(1)), int(m.group(2)))


def fmt_clock(t: dtime) -> str:
    h = t.hour % 12 or 12
    return f"{h}:{t.minute:02d} {'PM' if t.hour >= 12 else 'AM'}"


def day_label(d: date, today: date) -> str:
    if d == today:
        return "Today"
    if d == today + timedelta(days=1):
        return "Tomorrow"
    return d.strftime("%a, %b ") + str(d.day)


def validate_age_21(date_of_birth: str, today: Optional[date] = None) -> date:
    try:
        born = date.fromisoformat((date_of_birth or "").strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Enter a valid date of birth.")
    today = today or datetime.now(STORE_TZ).date()
    if born > today:
        raise HTTPException(status_code=400, detail="Enter a valid date of birth.")
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    if age < 21:
        raise HTTPException(status_code=400, detail="You must be 21 or older to place an order.")
    return born


STATE_ALIASES = {
    "alabama": "al", "alaska": "ak", "arizona": "az", "arkansas": "ar", "california": "ca",
    "colorado": "co", "connecticut": "ct", "delaware": "de", "florida": "fl", "georgia": "ga",
    "hawaii": "hi", "idaho": "id", "illinois": "il", "indiana": "in", "iowa": "ia", "kansas": "ks",
    "kentucky": "ky", "louisiana": "la", "maine": "me", "maryland": "md", "massachusetts": "ma",
    "michigan": "mi", "minnesota": "mn", "mississippi": "ms", "missouri": "mo", "montana": "mt",
    "nebraska": "ne", "nevada": "nv", "newhampshire": "nh", "newjersey": "nj", "newmexico": "nm",
    "newyork": "ny", "northcarolina": "nc", "northdakota": "nd", "ohio": "oh", "oklahoma": "ok",
    "oregon": "or", "pennsylvania": "pa", "rhodeisland": "ri", "southcarolina": "sc",
    "southdakota": "sd", "tennessee": "tn", "texas": "tx", "utah": "ut", "vermont": "vt",
    "virginia": "va", "washington": "wa", "westvirginia": "wv", "wisconsin": "wi", "wyoming": "wy",
}


def _state_key(value: str) -> str:
    key = re.sub(r"[^a-z]", "", (value or "").lower())
    return STATE_ALIASES.get(key, key)


async def validate_product_restrictions(items: List[CartItem], state: str, age_attestation: bool) -> dict:
    """Validate catalog restrictions and return the exact rule snapshot stored with the order."""
    ids = list({int(item.productId) for item in items})
    products = await db.products.find({"id": {"$in": ids}}).to_list(len(ids) or 1)
    by_id = {int(p["id"]): p for p in products}
    state_key = _state_key(state)
    restricted_items = []
    requires_id = False
    minimum_age = 0
    for item in items:
        product = by_id.get(int(item.productId))
        if not product:
            continue
        allowed = {_state_key(v) for v in product.get("allowedStates", []) if v}
        blocked = {_state_key(v) for v in product.get("blockedStates", []) if v}
        if state_key in blocked or (allowed and state_key not in allowed):
            raise HTTPException(status_code=400, detail=f"{product.get('name', item.name)} cannot be delivered to {state or 'this state'}.")
        item_age = int(product.get("minimumAge", 21))
        item_requires_id = bool(product.get("requiresIdAtDelivery", True))
        if item_age > 0 or item_requires_id:
            restricted_items.append({
                "productId": product["id"],
                "name": product.get("name", item.name),
                "category": product.get("complianceCategory", "regulated"),
                "minimumAge": item_age,
                "requiresIdAtDelivery": item_requires_id,
                "localDeliveryOnly": bool(product.get("localDeliveryOnly", True)),
            })
        minimum_age = max(minimum_age, item_age)
        requires_id = requires_id or item_requires_id
    if restricted_items and not age_attestation:
        raise HTTPException(status_code=400, detail="Confirm the 21+ age and ID-at-delivery notice before paying.")
    return {
        "restrictedItems": restricted_items,
        "minimumAge": minimum_age or 21,
        "requiresIdAtDelivery": requires_id,
        "ageAttestationAccepted": bool(age_attestation),
    }


def configured_window_capacity(settings: dict) -> int:
    slot_limit = max(1, int(settings.get("deliverySlotCapacity", 8)))
    driver_limit = max(1, int(settings.get("deliveryDriverCount", 1))) * max(1, int(settings.get("ordersPerDriverPerWindow", 8)))
    return min(slot_limit, driver_limit)


async def window_capacity(window_id: str, settings: dict, exclude_order_id: Optional[str] = None) -> dict:
    query = {
        "deliveryWindow.id": window_id,
        "manualStatus": {"$nin": ["cancelled", "returned"]},
        "paymentStatus": {"$ne": "refunded"},
    }
    if exclude_order_id:
        query["id"] = {"$ne": exclude_order_id}
    booked = await db.orders.count_documents(query)
    capacity = configured_window_capacity(settings)
    return {"capacity": capacity, "booked": booked, "remaining": max(0, capacity - booked), "available": booked < capacity, "full": booked >= capacity}


async def delivery_window_with_capacity(settings: dict, now: Optional[datetime] = None) -> dict:
    result = delivery_window(settings, now)
    windows = result.get("availableWindows", [])
    capacities = await asyncio.gather(*(window_capacity(w["id"], settings) for w in windows)) if windows else []
    result["availableWindows"] = [{**window, **capacity} for window, capacity in zip(windows, capacities)]
    result["capacityPerWindow"] = configured_window_capacity(settings)
    return result


async def require_delivery_capacity(window_id: str, settings: dict):
    capacity = await window_capacity(window_id, settings)
    if not capacity["available"]:
        raise HTTPException(status_code=409, detail="That delivery window just filled up. Choose another available time.")
    return capacity


def available_delivery_windows(settings: dict, now: Optional[datetime] = None) -> List[dict]:
    now = (now or now_utc()).astimezone(STORE_TZ)
    same_day_enabled = bool(settings.get("sameDayEnabled", True))
    days = sorted({int(d) for d in settings.get("deliveryDays", DEFAULT_SETTINGS["deliveryDays"]) if 0 <= int(d) <= 6})
    cutoff = parse_cutoff(settings.get("deliveryCutoff", DEFAULT_SETTINGS["deliveryCutoff"]))
    delivery_start = parse_cutoff(settings.get("deliveryStart", DEFAULT_SETTINGS["deliveryStart"]))
    delivery_end = parse_cutoff(settings.get("deliveryEnd", DEFAULT_SETTINGS["deliveryEnd"]))
    windows = []
    for offset in range(0, 15):
        d = now.date() + timedelta(days=offset)
        if d.weekday() not in days:
            continue
        if offset == 0 and (not same_day_enabled or now >= datetime.combine(d, cutoff, tzinfo=STORE_TZ)):
            continue
        for start_value, end_value in DELIVERY_SLOTS:
            start_t, end_t = parse_cutoff(start_value), parse_cutoff(end_value)
            if start_t < delivery_start or end_t > delivery_end:
                continue
            start_dt = datetime.combine(d, start_t, tzinfo=STORE_TZ)
            if offset == 0 and start_dt <= now + timedelta(minutes=30):
                continue
            label_day = day_label(d, now.date())
            window_id = f"{d.isoformat()}|{start_value}|{end_value}"
            windows.append({
                "id": window_id,
                "date": d.isoformat(),
                "start": start_value,
                "end": end_value,
                "label": f"{label_day} {fmt_clock(start_t)}–{fmt_clock(end_t)}",
                "sameDay": offset == 0,
            })
        if len({w["date"] for w in windows}) >= 2:
            break
    return windows


def require_delivery_window(window_id: str, settings: dict, now: Optional[datetime] = None) -> dict:
    if not window_id:
        raise HTTPException(status_code=400, detail="Choose a delivery window.")
    match = next((w for w in available_delivery_windows(settings, now) if w["id"] == window_id), None)
    if not match:
        raise HTTPException(status_code=409, detail="That delivery window is no longer available. Choose another time and try again.")
    return match


def delivery_window(settings: dict, now: Optional[datetime] = None) -> dict:
    """Same-day cutoff logic in the store's timezone (Orlando). Server time is the only source of truth."""
    now = (now or now_utc()).astimezone(STORE_TZ)
    cutoff = parse_cutoff(settings.get("deliveryCutoff", DEFAULT_SETTINGS["deliveryCutoff"]))
    days = sorted({int(d) for d in settings.get("deliveryDays", DEFAULT_SETTINGS["deliveryDays"]) if 0 <= int(d) <= 6})
    enabled = bool(settings.get("sameDayEnabled", True))
    today = now.date()
    cutoff_dt = datetime.combine(today, cutoff, tzinfo=STORE_TZ)
    today_open = today.weekday() in days
    same_day = enabled and today_open and now < cutoff_dt
    next_day = None
    if days:
        start = today if (today_open and now < cutoff_dt) else today + timedelta(days=1)
        for i in range(0, 8):
            d = start + timedelta(days=i)
            if d.weekday() in days:
                next_day = d
                break
    windows = available_delivery_windows(settings, now)
    same_day = same_day and any(w["sameDay"] for w in windows)
    if windows:
        next_day = date.fromisoformat(windows[0]["date"])
    seconds = int((cutoff_dt - now).total_seconds()) if same_day else 0
    if not enabled:
        message = ""
    elif same_day:
        h, m = divmod(max(seconds, 0) // 60, 60)
        message = f"Order within {f'{h}h ' if h else ''}{m}m for today's local delivery"
    elif next_day is None:
        message = "Local delivery is currently paused. Please check back soon."
    elif today_open:
        message = "Today's delivery window has closed. Order now for the next available delivery day."
    else:
        message = f"No local delivery today. Order now for the next available delivery day ({day_label(next_day, today)})."
    return {
        "enabled": enabled, "timezone": str(STORE_TZ), "serverTime": now.isoformat(), "cutoff": cutoff.strftime("%H:%M"), "cutoffLabel": fmt_clock(cutoff),
        "deliveryStart": settings.get("deliveryStart", DEFAULT_SETTINGS["deliveryStart"]), "deliveryStartLabel": fmt_clock(parse_cutoff(settings.get("deliveryStart", DEFAULT_SETTINGS["deliveryStart"]))),
        "deliveryEnd": settings.get("deliveryEnd", DEFAULT_SETTINGS["deliveryEnd"]), "deliveryEndLabel": fmt_clock(parse_cutoff(settings.get("deliveryEnd", DEFAULT_SETTINGS["deliveryEnd"]))),
        "deliveryDays": days, "todayOpen": today_open, "sameDayOpen": same_day, "secondsRemaining": max(seconds, 0),
        "nextDeliveryDate": windows[0]["date"] if windows else (next_day.isoformat() if next_day else None), "nextDeliveryLabel": day_label(next_day, today) if next_day else None, "message": message,
        "availableWindows": windows,
    }


class StoreSettingsInput(BaseModel):
    taxRate: float = Field(ge=0, le=0.5)
    deliveryFee: float = Field(ge=0)
    freeDeliveryMin: float = Field(ge=0)
    deliveryZip: str = "32832"
    deliveryRadiusMiles: float = Field(default=20.0, gt=0, le=500)
    allowedZipCodes: List[str] = Field(default=[])
    sameDayEnabled: bool = True
    deliveryCutoff: str = "20:00"
    deliveryStart: str = "11:00"
    deliveryEnd: str = "21:00"
    deliveryDays: List[int] = Field(default=[0, 1, 2, 3, 4, 5, 6])
    homepageLayout: str = "classic"
    deliverySlotCapacity: int = Field(default=8, ge=1, le=250)
    deliveryDriverCount: int = Field(default=1, ge=1, le=50)
    ordersPerDriverPerWindow: int = Field(default=8, ge=1, le=100)
    defaultEtaMinutes: int = Field(default=45, ge=5, le=480)

    @field_validator("homepageLayout")
    @classmethod
    def _homepage_layout(cls, v):
        if v not in {"classic", "showcase", "minimal"}:
            raise ValueError("Choose a valid homepage layout")
        return v

    @field_validator("deliveryCutoff")
    @classmethod
    def _cutoff(cls, v):
        return parse_cutoff(v).strftime("%H:%M")

    @field_validator("deliveryStart", "deliveryEnd")
    @classmethod
    def _delivery_hours(cls, v):
        return parse_cutoff(v).strftime("%H:%M")

    @field_validator("deliveryDays")
    @classmethod
    def _days(cls, v):
        return sorted({int(d) for d in v if 0 <= int(d) <= 6})

    @field_validator("deliveryZip")
    @classmethod
    def _zip(cls, v):
        if not zip_lookup(v):
            raise ValueError("Delivery ZIP must be a valid US ZIP code")
        return re.sub(r"\D", "", v)[:5]

    @field_validator("allowedZipCodes")
    @classmethod
    def _allowed_zips(cls, values):
        cleaned = []
        for value in values:
            z = re.sub(r"\D", "", str(value or ""))[:5]
            if not zip_lookup(z):
                raise ValueError(f"{value} is not a valid US ZIP code")
            if z not in cleaned:
                cleaned.append(z)
        if len(cleaned) > 250:
            raise ValueError("You can select up to 250 delivery ZIP codes")
        return cleaned


class LoyaltySettingsInput(BaseModel):
    loyaltyEnabled: bool = True
    pointsPerDollar: float = Field(default=1.0, ge=0, le=100)
    pointsPerReward: int = Field(default=100, ge=1)
    rewardValue: float = Field(default=5.0, ge=0)
    minRedeemPoints: int = Field(default=100, ge=0)
    maxRedeemPerOrder: int = Field(default=0, ge=0)
    minPurchaseForRedeem: float = Field(default=0.0, ge=0)
    signupBonusPoints: int = Field(default=50, ge=0, le=100000)


class LoyaltyAdjustInput(BaseModel):
    points: int
    reason: str = Field(min_length=3, max_length=300)

    @field_validator("points")
    @classmethod
    def _nonzero(cls, v):
        if v == 0:
            raise ValueError("Points must not be zero")
        return v


class PromoInput(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    type: str = "percent"  # percent | fixed
    value: float = Field(gt=0)
    minSubtotal: float = Field(default=0, ge=0)
    maxUses: Optional[int] = Field(default=None, ge=1)
    expiresAt: Optional[datetime] = None
    active: bool = True

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v not in ("percent", "fixed"):
            raise ValueError("type must be percent or fixed")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v):
        v = re.sub(r"[^A-Za-z0-9_-]", "", v).upper()
        if len(v) < 2:
            raise ValueError("Code must be letters/numbers")
        return v


class PromoValidateInput(BaseModel):
    code: str
    items: List[CartItem] = []


async def get_settings() -> dict:
    global _settings_cache
    if not _settings_cache:
        doc = await db.site_settings.find_one({"key": "store"}, {"_id": 0, "key": 0, "updatedAt": 0, "updatedBy": 0})
        _settings_cache = {**DEFAULT_SETTINGS, **(doc or {})}
    return _settings_cache


def pricing_rules(settings: dict) -> dict:
    rate = settings["taxRate"]
    return {"taxRate": rate, "taxLabel": f"Sales tax ({rate * 100:g}%)", "deliveryFee": settings["deliveryFee"], "freeDeliveryMin": settings["freeDeliveryMin"]}


def delivery_rules(settings: dict) -> dict:
    allowed = settings.get("allowedZipCodes") or []
    return {"zip": settings["deliveryZip"], "radiusMiles": float(settings["deliveryRadiusMiles"]), "allowedZipCodes": allowed, "mode": "selected_zips" if allowed else "radius"}


def promo_public(p: dict) -> dict:
    return {
        "id": p["id"], "code": p["code"], "type": p["type"], "value": p["value"], "minSubtotal": p.get("minSubtotal", 0),
        "maxUses": p.get("maxUses"), "uses": p.get("uses", 0), "active": p.get("active", True),
        "expiresAt": p["expiresAt"].isoformat() if isinstance(p.get("expiresAt"), datetime) else p.get("expiresAt"),
        "createdAt": p["createdAt"].isoformat() if isinstance(p.get("createdAt"), datetime) else p.get("createdAt"),
    }


def r2(x: float) -> float:
    """Half-up cents rounding (matches the storefront's Math.round), avoiding Python's banker's rounding."""
    return math.floor(x * 100 + 0.5 + 1e-9) / 100


def promo_discount(promo: dict, subtotal: float) -> float:
    if promo["type"] == "percent":
        return r2(subtotal * min(promo["value"], 100) / 100)
    return r2(min(promo["value"], subtotal))


async def resolve_promo(code: str, subtotal: float) -> dict:
    """Returns the promo doc or raises 400 with a customer-facing reason."""
    promo = await db.promo_codes.find_one({"code": code.strip().upper()})
    if not promo or not promo.get("active", True):
        raise HTTPException(status_code=400, detail="That promo code isn't valid")
    exp = promo.get("expiresAt")
    if exp:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            raise HTTPException(status_code=400, detail="That promo code has expired")
    if promo.get("maxUses") and promo.get("uses", 0) >= promo["maxUses"]:
        raise HTTPException(status_code=400, detail="That promo code has reached its usage limit")
    if subtotal < promo.get("minSubtotal", 0):
        raise HTTPException(status_code=400, detail=f"Add ${promo['minSubtotal'] - subtotal:.2f} more to use {promo['code']} (min ${promo['minSubtotal']:.2f})")
    return promo


def compute_totals(subtotal: float, settings: dict, discount: float = 0.0) -> dict:
    subtotal = round(subtotal, 2)
    discount = round(min(discount, subtotal), 2)
    shipping_cost = 0.0 if subtotal >= settings["freeDeliveryMin"] or subtotal == 0 else settings["deliveryFee"]
    tax = r2((subtotal - discount) * settings["taxRate"])
    return {"subtotal": subtotal, "discount": discount, "shippingCost": shipping_cost, "tax": tax, "taxRate": settings["taxRate"], "total": r2(subtotal - discount + shipping_cost + tax)}


# ---- Loyalty rewards: ledger-based (loyalty_transactions), all math server-side ----
def loyalty_rules(settings: dict) -> dict:
    return {k: settings.get(k, DEFAULT_SETTINGS[k]) for k in ("loyaltyEnabled", "pointsPerDollar", "pointsPerReward", "rewardValue", "minRedeemPoints", "maxRedeemPerOrder", "minPurchaseForRedeem", "signupBonusPoints")}


def loyalty_public_rules(settings: dict) -> dict:
    r = loyalty_rules(settings)
    return {"enabled": bool(r["loyaltyEnabled"]), "pointsPerDollar": r["pointsPerDollar"], "pointsPerReward": r["pointsPerReward"], "rewardValue": r["rewardValue"], "minRedeemPoints": r["minRedeemPoints"], "maxRedeemPerOrder": r["maxRedeemPerOrder"], "minPurchaseForRedeem": r["minPurchaseForRedeem"], "signupBonusPoints": r["signupBonusPoints"]}


def points_value(points: int, rules: dict) -> float:
    return r2(points / rules["pointsPerReward"] * rules["rewardValue"])


def loyalty_tx_out(t: dict) -> dict:
    c = t.get("createdAt")
    return {"id": t["id"], "type": t["type"], "points": int(t["points"]), "rewardValue": t.get("rewardValue", 0), "description": t.get("description", ""), "reason": t.get("reason", ""),
            "orderId": t.get("orderId"), "orderNumber": t.get("orderNumber"), "adminId": t.get("adminId"), "adminEmail": t.get("adminEmail"), "createdAt": c.isoformat() if isinstance(c, datetime) else c}


async def loyalty_balance(user_id: str) -> dict:
    """Ledger is the source of truth: every row carries signed points (earn +, redeem -, reverse -, redeem_return +, adjust ±)."""
    earned = redeemed = reversed_ = adjusted = available = 0
    async for t in db.loyalty_transactions.find({"userId": user_id}, {"type": 1, "points": 1}):
        pts = int(t["points"])
        available += pts
        if t["type"] == "earn":
            earned += pts
        elif t["type"] == "redeem":
            redeemed += -pts
        elif t["type"] in ("reverse", "redeem_return"):
            reversed_ += pts
        else:
            adjusted += pts
    return {"available": max(available, 0), "lifetimeEarned": earned, "redeemed": redeemed, "reversed": reversed_, "adjusted": adjusted}


async def loyalty_add(user_id: str, kind: str, points: int, key: str, description: str, order: Optional[dict] = None, reward_value: float = 0.0, admin: Optional[dict] = None, reason: str = "") -> Optional[dict]:
    """Idempotent ledger insert (unique key). Returns the row, or None if the key already exists."""
    if points == 0:
        return None
    doc = {"id": str(uuid.uuid4()), "userId": user_id, "orderId": order["id"] if order else None, "orderNumber": order.get("orderNumber") if order else None, "type": kind, "points": int(points), "rewardValue": round(reward_value, 2), "description": description, "reason": reason,
           "adminId": admin["id"] if admin else None, "adminEmail": admin.get("email") if admin else None, "key": key, "createdAt": now_utc()}
    try:
        await db.loyalty_transactions.insert_one(doc)
        return doc
    except Exception:
        return None


async def loyalty_signup_bonus(user: dict) -> int:
    """Welcome points for a brand-new account (idempotent via key signup:<userId>)."""
    rules = loyalty_rules(await get_settings())
    pts = int(rules["signupBonusPoints"])
    if not rules["loyaltyEnabled"] or pts <= 0:
        return 0
    row = await loyalty_add(user["id"], "bonus", pts, f"signup:{user['id']}", "Welcome bonus — thanks for joining Puff2door Rewards")
    return pts if row else 0


async def loyalty_email_info(o: dict) -> Optional[dict]:
    """Points earned + fresh balance for the paid-order emails (None for guests / nothing earned)."""
    if not o.get("userId") or not o.get("pointsEarned"):
        return None
    rules = loyalty_rules(await get_settings())
    bal = await loyalty_balance(o["userId"])
    return {"earned": int(o["pointsEarned"]), "balance": bal["available"], "value": points_value(bal["available"], rules), "pointsPerReward": rules["pointsPerReward"], "rewardValue": rules["rewardValue"]}


async def loyalty_award_for_order(o: dict):
    """Earn points once an order is paid. Idempotent via key earn:<orderId>. Tax, delivery, promo and reward discounts never earn."""
    settings = await get_settings()
    rules = loyalty_rules(settings)
    if not rules["loyaltyEnabled"] or not o.get("userId") or o.get("paymentStatus") != "paid" or o.get("manualStatus") == "cancelled":
        return
    points = int(math.floor(round(o.get("subtotal", 0) - o.get("discount", 0) - o.get("rewardDiscount", 0), 2) * rules["pointsPerDollar"]))
    if points <= 0:
        return
    if await loyalty_add(o["userId"], "earn", points, f"earn:{o['id']}", f"Order #{o['orderNumber']}", o):
        o["pointsEarned"] = points
        await db.orders.update_one({"id": o["id"]}, {"$set": {"pointsEarned": points}})


async def loyalty_reverse_for_order(o: dict, refund_amount: Optional[float] = None, admin: Optional[dict] = None):
    """Full (refund_amount None) or partial refund/cancel: reverse earned points proportionally; return redeemed points on full reversal."""
    if not o.get("userId"):
        return 0
    earned = await db.loyalty_transactions.find_one({"key": f"earn:{o['id']}"})
    reversed_total = 0
    async for t in db.loyalty_transactions.find({"orderId": o["id"], "type": "reverse"}):
        reversed_total += -int(t["points"])
    earned_pts = int(earned["points"]) if earned else 0
    remaining = max(earned_pts - reversed_total, 0)
    settings = await get_settings()
    rate = loyalty_rules(settings)["pointsPerDollar"]
    if refund_amount is None:
        to_reverse = remaining
        label = "Order cancelled/refunded"
    else:
        to_reverse = min(remaining, int(math.floor(round(refund_amount, 2) * rate)))
        label = f"Partial refund ${refund_amount:.2f}"
    n = (await db.loyalty_transactions.count_documents({"orderId": o["id"], "type": "reverse"})) + 1
    if to_reverse > 0:
        if await loyalty_add(o["userId"], "reverse", -to_reverse, f"reverse:{o['id']}:{n}", f"{label} — Order #{o['orderNumber']}", o, admin=admin):
            await db.orders.update_one({"id": o["id"]}, {"$inc": {"pointsReversed": to_reverse}})
    if refund_amount is None and o.get("rewardPoints"):
        await loyalty_add(o["userId"], "redeem_return", int(o["rewardPoints"]), f"redeem-return:{o['id']}", f"Redeemed points returned — Order #{o['orderNumber']}", o, reward_value=o.get("rewardDiscount", 0), admin=admin)
    return to_reverse


async def loyalty_validate_redeem(user: Optional[dict], redeem_points: int, merch_after_promo: float, settings: dict) -> float:
    """Server-side validation of a redemption request; returns the dollar discount."""
    if not redeem_points:
        return 0.0
    rules = loyalty_rules(settings)
    if not rules["loyaltyEnabled"]:
        raise HTTPException(status_code=400, detail="Puff2door Rewards is not available right now")
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to your Puff2door account to redeem rewards")
    if redeem_points < 0 or redeem_points % rules["pointsPerReward"] != 0:
        raise HTTPException(status_code=400, detail=f"Rewards are redeemed in blocks of {rules['pointsPerReward']} points")
    if redeem_points < rules["minRedeemPoints"]:
        raise HTTPException(status_code=400, detail=f"Minimum redemption is {rules['minRedeemPoints']} points")
    if rules["maxRedeemPerOrder"] and redeem_points > rules["maxRedeemPerOrder"]:
        raise HTTPException(status_code=400, detail=f"You can redeem at most {rules['maxRedeemPerOrder']} points per order")
    if merch_after_promo < rules["minPurchaseForRedeem"]:
        raise HTTPException(status_code=400, detail=f"A minimum purchase of ${rules['minPurchaseForRedeem']:.2f} is required to redeem rewards")
    bal = await loyalty_balance(user["id"])
    if redeem_points > bal["available"]:
        raise HTTPException(status_code=400, detail=f"You only have {bal['available']} points available")
    value = points_value(redeem_points, rules)
    if value > merch_after_promo + 0.005:
        raise HTTPException(status_code=400, detail="Reward value cannot exceed the merchandise total")
    return value


def payments_config() -> dict:
    return {
        "square": {"enabled": SQUARE_ENABLED, "applicationId": SQUARE_APP_ID if SQUARE_ENABLED else None, "locationId": SQUARE_LOCATION if SQUARE_ENABLED else None, "env": SQUARE_ENV},
        "cashApp": {"enabled": SQUARE_ENABLED},
        "paypal": {"enabled": PAYPAL_ENABLED, "clientId": PAYPAL_CLIENT_ID if PAYPAL_ENABLED else None, "env": PAYPAL_ENV},
        "applePay": {"enabled": APPLE_PAY_ENABLED, "clientId": PAYPAL_CLIENT_ID if APPLE_PAY_ENABLED else None, "env": PAYPAL_ENV},
        "zelle": {"enabled": ZELLE_ENABLED, "email": ZELLE_EMAIL, "name": ZELLE_NAME},
        "testCard": {"enabled": TEST_CARD_ENABLED, "visible": TEST_CARD_ENABLED and not REAL_CARD_PROVIDER},
    }


def zelle_instructions(order_number: str, total: float) -> dict:
    return {"recipient": ZELLE_EMAIL, "name": ZELLE_NAME, "amount": total, "memo": order_number}


async def square_create_payment(source_id: str, amount_cents: int, idem_key: str, reference: str) -> dict:
    payload = {
        "source_id": source_id,
        "idempotency_key": idem_key,
        "amount_money": {"amount": amount_cents, "currency": "USD"},
        "location_id": SQUARE_LOCATION,
        "autocomplete": True,
        "reference_id": reference,
        "customer_details": {"customer_initiated": True, "seller_keyed_in": False},
    }
    headers = {"Authorization": f"Bearer {SQUARE_TOKEN}", "Content-Type": "application/json", "Square-Version": "2025-10-16"}
    async with httpx.AsyncClient(timeout=25) as http:
        r = await http.post(f"{SQUARE_BASE}/v2/payments", json=payload, headers=headers)
    data = r.json()
    if r.is_error:
        msg = "; ".join(e.get("detail") or e.get("code", "") for e in data.get("errors", [])) or "Card was declined"
        raise HTTPException(status_code=402, detail=f"Payment failed: {msg}")
    return data.get("payment", {})


async def paypal_token() -> str:
    async with httpx.AsyncClient(timeout=25) as http:
        r = await http.post(f"{PAYPAL_BASE}/v1/oauth2/token", data={"grant_type": "client_credentials"}, auth=(PAYPAL_CLIENT_ID, PAYPAL_SECRET))
    if r.is_error:
        raise HTTPException(status_code=502, detail="PayPal is unavailable right now")
    return r.json()["access_token"]


async def paypal_request(method: str, path: str, body: Optional[dict] = None) -> dict:
    token = await paypal_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=25) as http:
        r = await http.request(method, f"{PAYPAL_BASE}{path}", json=body, headers=headers)
    data = r.json() if r.content else {}
    if r.is_error:
        issue = (data.get("details") or [{}])[0].get("issue", "")
        friendly = {
            "ORDER_NOT_APPROVED": "The PayPal payment wasn't approved. Please try again.",
            "ORDER_ALREADY_CAPTURED": "This PayPal payment was already used.",
            "INSTRUMENT_DECLINED": "PayPal declined the selected payment method. Please choose another in PayPal.",
            "PAYER_ACTION_REQUIRED": "PayPal needs you to finish approving the payment.",
        }
        msg = friendly.get(issue) or data.get("message") or (data.get("details") or [{}])[0].get("description") or "PayPal error"
        raise HTTPException(status_code=402, detail=f"PayPal: {msg}")
    return data


async def price_cart(items: List[CartItem], promo_code: str = "", redeem_points: int = 0, user: Optional[dict] = None, tip: float = 0):
    problems, priced = [], []
    for it in items:
        prod = await db.products.find_one({"id": it.productId})
        if not prod or not prod.get("active", True):
            problems.append(f"{it.name} is no longer available")
            continue
        if int(prod.get("stock", 0)) < it.qty:
            left = int(prod.get("stock", 0))
            name = prod.get("name") or it.name
            problems.append(f"Only {left} left of {name}" if left else f"{name} is sold out")
            continue
        base = prod["price"]
        sale = prod.get("salePrice")
        price = min(base, sale) if sale and sale > 0 else base
        if prod.get("categorySlug") == "disposable":
            deal = round(base * 0.8, 2)
            if it.price <= deal + 0.005:
                price = min(price, deal)
        priced.append({**it.model_dump(), "name": prod["name"], "price": round(price, 2), "image": prod.get("image", ""), "slug": prod["slug"]})
    if problems:
        raise HTTPException(status_code=409, detail="; ".join(problems))
    settings = await get_settings()
    subtotal = round(sum(i["price"] * i["qty"] for i in priced), 2)
    promo = await resolve_promo(promo_code, subtotal) if promo_code.strip() else None
    pdisc = round(min(promo_discount(promo, subtotal) if promo else 0.0, subtotal), 2)
    reward = await loyalty_validate_redeem(user, int(redeem_points or 0), round(subtotal - pdisc, 2), settings)
    totals = compute_totals(subtotal, settings, pdisc + reward)
    totals["discount"] = pdisc
    totals["rewardDiscount"] = reward
    totals["rewardPoints"] = int(redeem_points or 0) if reward else 0
    totals["promoCode"] = promo["code"] if promo else ""
    totals["tip"] = r2(tip)
    totals["total"] = r2(totals["total"] + totals["tip"])
    return priced, totals


class GoogleTokenInput(BaseModel):
    access_token: str


class WishlistItem(BaseModel):
    productId: int
    slug: str = ""
    notify: bool = False


class WishlistInput(BaseModel):
    items: List[WishlistItem] = []


class StockAlertInput(BaseModel):
    productId: int
    productSlug: str = ""
    name: str = ""
    email: EmailStr


class ProductInput(BaseModel):
    name: str
    category: str
    categorySlug: str
    price: float = Field(ge=0)
    salePrice: Optional[float] = None
    image: str = ""
    image2: str = ""
    brand: str = ""
    brandName: str = ""
    flavors: List[str] = []
    puffs: Optional[int] = None
    stock: int = Field(default=0, ge=0)
    active: bool = True
    description: str = ""
    complianceCategory: str = "regulated"
    minimumAge: int = Field(default=21, ge=0, le=99)
    requiresIdAtDelivery: bool = True
    localDeliveryOnly: bool = True
    allowedStates: List[str] = []
    blockedStates: List[str] = []

    @field_validator("complianceCategory")
    @classmethod
    def _compliance_category(cls, value):
        allowed = {"regulated", "nicotine", "hemp", "kratom", "accessory", "general"}
        if value not in allowed:
            raise ValueError("Choose a valid compliance category")
        return value

    @field_validator("allowedStates", "blockedStates")
    @classmethod
    def _state_lists(cls, values):
        return list(dict.fromkeys(str(v).strip()[:40] for v in values if str(v).strip()))


class OrderStatusInput(BaseModel):
    status: str


class DeliveryDetailsInput(BaseModel):
    deliveryPhotoUrl: str = ""
    driverTextSent: bool = False

    @field_validator("deliveryPhotoUrl")
    @classmethod
    def _photo_url(cls, v):
        v = v.strip()
        if v and not re.match(r"^https?://", v, re.I):
            raise ValueError("Delivery photo must use an http or https URL")
        return v


class DispatchInput(BaseModel):
    driverName: str = Field(default="", max_length=100)
    driverPhoneLast4: str = ""
    etaMinutes: Optional[int] = Field(default=None, ge=5, le=360)
    dispatchNotes: str = Field(default="", max_length=1000)

    @field_validator("driverPhoneLast4")
    @classmethod
    def _driver_phone_last4(cls, value):
        return re.sub(r"\D", "", value or "")[-4:]


class IdCheckInput(BaseModel):
    result: str
    idType: str = ""
    photoIdValid: bool = False
    age21Confirmed: bool = False
    nameMatchesOrder: bool = False
    expirationValid: bool = False
    failureReason: str = Field(default="", max_length=500)
    checkedBy: str = Field(default="", max_length=100)

    @field_validator("result")
    @classmethod
    def _id_result(cls, value):
        if value not in {"passed", "failed"}:
            raise ValueError("ID result must be passed or failed")
        return value


class ReturnDispositionInput(BaseModel):
    disposition: str
    notes: str = Field(default="", max_length=1000)

    @field_validator("disposition")
    @classmethod
    def _return_disposition(cls, value):
        if value not in {"restocked", "discarded"}:
            raise ValueError("Choose restocked or discarded")
        return value


class HeroSlide(BaseModel):
    id: int
    image: str = ""
    tag: str = ""
    title: str
    subtitle: str = ""
    cta: str = "Shop Now"
    link: str = "/shop"


class PromoBlock(BaseModel):
    id: int
    productId: Optional[int] = None
    tag: str = ""
    label: str = ""
    image: str = ""
    link: str = ""


class HomeContentInput(BaseModel):
    heroSlides: List[HeroSlide] = Field(min_length=1)
    promoBlocks: List[PromoBlock] = []


ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]
APP_NAME = "puff2door"
MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    await file_bucket.upload_from_stream(path, data, metadata={"content_type": content_type})
    return {"path": path, "size": len(data)}


async def get_object(path: str):
    try:
        stream = await file_bucket.open_download_stream_by_name(path)
    except NoFile:
        raise HTTPException(status_code=404, detail="File not found")
    data = await stream.read()
    metadata = getattr(stream, "metadata", None) or {}
    return data, metadata.get("content_type", "application/octet-stream")


def is_admin(user: Optional[dict]) -> bool:
    return bool(user) and (user.get("role") == "admin" or user.get("email", "").lower() in ADMIN_EMAILS)


def slugify(name: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))[:60]


def brand_slug(p: dict) -> str:
    return p.get("brand") or slugify(p.get("brandName") or (p.get("name") or "").split(" ")[0])


def product_out(p: dict) -> dict:
    stock = int(p.get("stock", 0))
    return {
        "id": p["id"],
        "slug": p["slug"],
        "name": p["name"],
        "category": p.get("category", ""),
        "categorySlug": p.get("categorySlug", ""),
        "price": p["price"],
        "salePrice": p.get("salePrice"),
        "image": p.get("image", ""),
        "image2": p.get("image2") or p.get("image", ""),
        "brand": brand_slug(p),
        "brandName": p.get("brandName", ""),
        "flavors": p.get("flavors", []),
        "puffs": p.get("puffs"),
        "rating": p.get("rating", 4.5),
        "stock": stock,
        "inStock": stock > 0,
        "active": p.get("active", True),
        "description": p.get("description", ""),
        "complianceCategory": p.get("complianceCategory", "regulated"),
        "minimumAge": int(p.get("minimumAge", 21)),
        "requiresIdAtDelivery": bool(p.get("requiresIdAtDelivery", True)),
        "localDeliveryOnly": bool(p.get("localDeliveryOnly", True)),
        "allowedStates": p.get("allowedStates", []),
        "blockedStates": p.get("blockedStates", []),
    }


# ----------------------------- Auth helpers -----------------------------
def create_token(user_id: str, remember: bool = False) -> str:
    days = JWT_REMEMBER_DAYS if remember else JWT_EXP_DAYS
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(days=days),
        "iat": now_utc(),
        "jti": secrets.token_urlsafe(18),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def secure_request(request: Request) -> bool:
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    return request.url.scheme == "https" or forwarded == "https"


def set_session_cookie(response: Response, request: Request, token: str, max_age: Optional[int] = None) -> None:
    if max_age is None:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            max_age = max(0, int(float(payload["exp"]) - now_utc().timestamp()))
        except (jwt.PyJWTError, KeyError, TypeError, ValueError):
            max_age = JWT_EXP_DAYS * 86400
    response.set_cookie(
        "session_token",
        token,
        max_age=max_age,
        httponly=True,
        secure=secure_request(request),
        samesite="lax",
        path="/",
    )


def create_order_access_token(order_id: str) -> str:
    payload = {
        "sub": order_id,
        "scope": "order_access",
        "exp": now_utc() + timedelta(days=90),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def valid_order_access_token(token: str, order_id: str) -> bool:
    if not token:
        return False
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("scope") == "order_access" and secrets.compare_digest(str(payload.get("sub", "")), order_id)
    except jwt.PyJWTError:
        return False


async def check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec or rec.get("count", 0) < MAX_LOGIN_ATTEMPTS:
        return
    last = rec["lastAttempt"]
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    remaining = (last + timedelta(minutes=LOCKOUT_MINUTES)) - now_utc()
    if remaining.total_seconds() > 0:
        mins = max(1, int(remaining.total_seconds() // 60) + 1)
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {mins} minute{'s' if mins != 1 else ''}.")
    await db.login_attempts.delete_one({"identifier": identifier})


def request_ip(request: Request) -> str:
    candidates = [
        request.headers.get("cf-connecting-ip", "").strip(),
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip(),
        request.client.host if request.client else "",
    ]
    for candidate in candidates:
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            continue
    return "unknown"


async def enforce_rate_limit(request: Request, scope: str, limit: int, window_seconds: int):
    bucket = int(now_utc().timestamp()) // window_seconds
    raw_key = f"{scope}:{request_ip(request)}:{bucket}"
    key = hashlib.sha256(raw_key.encode()).hexdigest()
    await db.rate_limits.update_one(
        {"key": key},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now_utc() + timedelta(seconds=window_seconds * 2)}},
        upsert=True,
    )
    rec = await db.rate_limits.find_one({"key": key})
    if rec and rec.get("count", 0) > limit:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a few minutes and try again.")


async def record_failed_login(identifier: str):
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$inc": {"count": 1}, "$set": {"lastAttempt": now_utc()}},
        upsert=True,
    )


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "firstName": u.get("firstName", ""),
        "lastName": u.get("lastName", ""),
        "address": u.get("address", ""),
        "state": u.get("state", ""),
        "city": u.get("city", ""),
        "zip": u.get("zip", ""),
        "phone": u.get("phone", ""),
        "picture": u.get("picture", ""),
        "provider": u.get("provider", "password"),
        "role": "admin" if is_admin(u) else "customer",
    }


def extract_token(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or ""
    if auth.startswith("Bearer "):
        return auth.split(" ", 1)[1]
    return request.cookies.get("session_token") or None


async def user_from_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("jti") and await db.revoked_tokens.find_one({"jti": payload["jti"]}):
            return None
        user = await db.users.find_one({"id": payload.get("sub")})
        changed = (user or {}).get("passwordChangedAt")
        if isinstance(changed, str):
            changed = datetime.fromisoformat(changed)
        if isinstance(changed, datetime) and changed.tzinfo is None:
            changed = changed.replace(tzinfo=timezone.utc)
        if isinstance(changed, datetime) and int(payload.get("iat", 0)) < int(changed.timestamp()):
            return None
        return user
    except jwt.PyJWTError:
        pass
    sess = await db.user_sessions.find_one({"session_token": token})
    if not sess:
        return None
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        return None
    return await db.users.find_one({"id": sess["userId"]})


async def get_current_user(request: Request):
    token = extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


async def get_optional_user(request: Request):
    token = extract_token(request)
    if not token:
        return None
    try:
        return await user_from_token(token)
    except Exception:
        return None


# ----------------------------- Tracking logic -----------------------------
TRACK_STAGES = [
    ("placed", "Order Placed", 0),
    ("confirmed", "Preparing", 0),
    ("out_for_delivery", "Out for Delivery", 0),
    ("delivered", "Delivered", 0),
]


STAGE_KEYS = [s[0] for s in TRACK_STAGES]


def build_tracking(created_at: datetime, manual_status: Optional[str] = None, status_history: Optional[dict] = None, status_updated_at: Optional[datetime] = None):
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    status_history = status_history or {}
    timeline = []
    current = "placed"
    manual_idx = STAGE_KEYS.index(manual_status) if manual_status in STAGE_KEYS else None
    for idx, (key, label, offset) in enumerate(TRACK_STAGES):
        done = idx <= manual_idx if manual_idx is not None else idx == 0
        if done:
            current = key
        at = status_history.get(key)
        if key == "placed" and not at:
            at = created_at
        if manual_idx is not None and idx == manual_idx and not at and status_updated_at:
            at = status_updated_at
        if isinstance(at, str):
            try:
                at = datetime.fromisoformat(at)
            except ValueError:
                at = None
        if isinstance(at, datetime) and at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        timeline.append({
            "key": key,
            "label": label,
            "at": at.isoformat() if done and isinstance(at, datetime) else None,
            "done": done,
        })
    return current, timeline


def order_response(o: dict) -> dict:
    created = o["createdAt"]
    if isinstance(created, str):
        try:
            created_dt = datetime.fromisoformat(created)
        except Exception:
            created_dt = now_utc()
    else:
        created_dt = created
    awaiting = o.get("paymentStatus") == "awaiting_payment"
    manual_status = o.get("manualStatus")
    exception_labels = {
        "id_check_failed": "Delivery could not be completed",
        "returning_to_store": "Returning to store",
        "returned": "Returned to store",
    }
    cancelled = manual_status == "cancelled"
    if cancelled:
        cancelled_at = o.get("statusUpdatedAt")
        if isinstance(cancelled_at, datetime) and cancelled_at.tzinfo is None:
            cancelled_at = cancelled_at.replace(tzinfo=timezone.utc)
        status = "cancelled"
        timeline = [
            {"key": "placed", "label": "Order Placed", "at": created_dt.isoformat(), "done": True},
            {"key": "cancelled", "label": "Cancelled", "at": cancelled_at.isoformat() if isinstance(cancelled_at, datetime) else None, "done": True},
        ]
    elif manual_status in exception_labels:
        changed_at = o.get("statusUpdatedAt")
        if isinstance(changed_at, datetime) and changed_at.tzinfo is None:
            changed_at = changed_at.replace(tzinfo=timezone.utc)
        status = manual_status
        timeline = [
            {"key": "placed", "label": "Order Placed", "at": created_dt.isoformat(), "done": True},
            {"key": manual_status, "label": exception_labels[manual_status], "at": changed_at.isoformat() if isinstance(changed_at, datetime) else changed_at, "done": True},
        ]
    elif awaiting:
        status, timeline = build_tracking(created_dt, "placed", o.get("statusHistory"), None)
    else:
        status, timeline = build_tracking(created_dt, o.get("manualStatus"), o.get("statusHistory"), o.get("statusUpdatedAt"))
    return {
        "id": o["id"],
        "orderNumber": o["orderNumber"],
        "userId": o.get("userId"),
        "items": o["items"],
        "shipping": o["shipping"],
        "deliveryDate": o.get("deliveryDate"),
        "sameDay": o.get("sameDay"),
        "deliveryWindow": o.get("deliveryWindow"),
        "arrivalLabel": (o.get("deliveryWindow") or {}).get("label", ""),
        "ageVerified": bool(o.get("ageVerifiedAt")),
        "requiresIdAtDelivery": bool(o.get("requiresIdAtDelivery", True)),
        "idCheck": o.get("idCheck", {"status": "pending"}),
        "driverName": o.get("dispatch", {}).get("driverName", ""),
        "etaAt": o.get("dispatch", {}).get("etaAt").isoformat() if isinstance(o.get("dispatch", {}).get("etaAt"), datetime) else o.get("dispatch", {}).get("etaAt"),
        "dispatch": {
            **o.get("dispatch", {}),
            "assignedAt": o.get("dispatch", {}).get("assignedAt").isoformat() if isinstance(o.get("dispatch", {}).get("assignedAt"), datetime) else o.get("dispatch", {}).get("assignedAt"),
            "etaAt": o.get("dispatch", {}).get("etaAt").isoformat() if isinstance(o.get("dispatch", {}).get("etaAt"), datetime) else o.get("dispatch", {}).get("etaAt"),
        },
        "returnProcedure": o.get("returnProcedure", {}),
        "complianceSnapshot": o.get("complianceSnapshot", {}),
        "deliveryPhotoUrl": o.get("deliveryPhotoUrl", ""),
        "driverTextSent": bool(o.get("driverTextSentAt")),
        "issues": [{**i, "createdAt": i["createdAt"].isoformat() if isinstance(i.get("createdAt"), datetime) else i.get("createdAt"), "updatedAt": i["updatedAt"].isoformat() if isinstance(i.get("updatedAt"), datetime) else i.get("updatedAt")} for i in o.get("issues", [])],
        "subtotal": o["subtotal"],
        "shippingCost": o.get("shippingCost", 0),
        "tax": o.get("tax", 0),
        "taxRate": o.get("taxRate", 0),
        "discount": o.get("discount", 0),
        "promoCode": o.get("promoCode", ""),
        "tip": o.get("tip", 0),
        "total": o["total"],
        "rewardDiscount": o.get("rewardDiscount", 0.0),
        "rewardPoints": o.get("rewardPoints", 0),
        "pointsEarned": o.get("pointsEarned", 0),
        "pointsReversed": o.get("pointsReversed", 0),
        "refundedAmount": o.get("refundedAmount", 0.0),
        "refunds": [{**r, "createdAt": r["createdAt"].isoformat() if isinstance(r.get("createdAt"), datetime) else r.get("createdAt")} for r in o.get("refunds", [])],
        "paymentLast4": o.get("paymentLast4", ""),
        "paymentMethod": o.get("paymentMethod", "test_card"),
        "paymentStatus": o.get("paymentStatus", "paid"),
        "paymentBrand": o.get("paymentBrand", ""),
        "paymentRef": o.get("paymentRef", ""),
        "zelle": zelle_instructions(o["orderNumber"], o["total"]) if awaiting and o.get("paymentMethod") == "zelle" else None,
        "createdAt": created_dt.isoformat() if not isinstance(created, str) else created,
        "status": status,
        "manualStatus": o.get("manualStatus"),
        "timeline": timeline,
    }


def public_tracking_response(o: dict) -> dict:
    """Return delivery progress without exposing address, phone, payment or compliance records."""
    full = order_response(o)
    allowed = {
        "id", "orderNumber", "deliveryDate", "sameDay", "deliveryWindow", "arrivalLabel",
        "requiresIdAtDelivery", "driverName", "etaAt", "deliveryPhotoUrl", "driverTextSent",
        "createdAt", "status", "manualStatus", "timeline", "paymentStatus",
    }
    return {key: value for key, value in full.items() if key in allowed}


# ----------------------------- Routes -----------------------------
@api_router.get("/")
async def root():
    return {"message": "Puff2Door API"}


@api_router.post("/auth/register")
async def register(inp: RegisterInput, request: Request, response: Response):
    await enforce_rate_limit(request, "register", 10, 3600)
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = {
        "id": str(uuid.uuid4()),
        "email": inp.email.lower(),
        "password": pwd_ctx.hash(inp.password),
        "firstName": inp.firstName,
        "lastName": inp.lastName,
        "address": inp.address,
        "state": inp.state,
        "city": inp.city,
        "zip": inp.zip,
        "phone": inp.phone,
        "createdAt": now_utc(),
    }
    await db.users.insert_one(user)
    bonus = await loyalty_signup_bonus(user)
    token = create_token(user["id"])
    set_session_cookie(response, request, token, JWT_EXP_DAYS * 86400)
    return {"token": token, "user": public_user(user), "signupBonusPoints": bonus}


@api_router.post("/auth/login")
async def login(inp: LoginInput, request: Request, response: Response):
    await enforce_rate_limit(request, "login", 30, 900)
    email = inp.email.lower()
    identifier = email
    await check_lockout(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password") or not pwd_ctx.verify(inp.password, user["password"]):
        await record_failed_login(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    token = create_token(user["id"], remember=inp.rememberMe)
    set_session_cookie(response, request, token, (JWT_REMEMBER_DAYS if inp.rememberMe else JWT_EXP_DAYS) * 86400)
    return {"token": token, "user": public_user(user)}


@api_router.post("/auth/forgot-password")
async def forgot_password(inp: ForgotPasswordInput, request: Request):
    await enforce_rate_limit(request, "forgot-password", 10, 900)
    email = inp.email.lower()
    user = await db.users.find_one({"email": email})
    generic = {"ok": True, "message": "If an account exists for that email, a reset link has been generated."}
    if not user:
        return generic
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token": token,
        "userId": user["id"],
        "expires_at": now_utc() + timedelta(minutes=RESET_TOKEN_MINUTES),
        "used": False,
        "createdAt": now_utc(),
    })
    sent = await emails.send_password_reset(email, user.get("firstName", ""), token, RESET_TOKEN_MINUTES)
    if sent == "sent":
        return {**generic, "emailSent": True, "expiresInMinutes": RESET_TOKEN_MINUTES}
    if ALLOW_PASSWORD_RESET_TOKEN_RESPONSE:
        logger.info("Password reset link for %s: /my-account?reset_token=%s", email, token)
        # Explicit local/QA escape hatch. Never enable this in production.
        return {**generic, "emailSent": False, "resetToken": token, "expiresInMinutes": RESET_TOKEN_MINUTES}
    logger.warning("Password reset email could not be delivered for %s", email)
    return {**generic, "emailSent": False, "expiresInMinutes": RESET_TOKEN_MINUTES}


@api_router.post("/auth/reset-password")
async def reset_password(inp: ResetPasswordInput, request: Request, response: Response):
    await enforce_rate_limit(request, "reset-password", 10, 900)
    rec = await db.password_reset_tokens.find_one({"token": inp.token})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has already been used")
    expires_at = rec["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=400, detail="This reset link has expired")
    await db.users.update_one({"id": rec["userId"]}, {"$set": {"password": pwd_ctx.hash(inp.password), "passwordChangedAt": now_utc()}})
    await db.password_reset_tokens.update_one({"token": inp.token}, {"$set": {"used": True, "usedAt": now_utc()}})
    user = await db.users.find_one({"id": rec["userId"]})
    await db.login_attempts.delete_one({"identifier": user["email"]})
    token = create_token(user["id"])
    set_session_cookie(response, request, token, JWT_EXP_DAYS * 86400)
    return {"ok": True, "token": token, "user": public_user(user)}


@api_router.get("/auth/me")
async def me(request: Request, response: Response, user: dict = Depends(get_current_user)):
    if not request.cookies.get("session_token"):
        token = extract_token(request)
        if token:
            set_session_cookie(response, request, token)
    return {"user": public_user(user)}


GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()


async def upsert_google_user(data: dict):
    email = (data.get("email") or "").lower()
    if not email or data.get("email_verified") is False:
        raise HTTPException(status_code=401, detail="Google account has no verified email")
    name = (data.get("name") or "").strip()
    first, _, last = name.partition(" ")
    user = await db.users.find_one({"email": email})
    bonus = 0
    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "firstName": first,
            "lastName": last,
            "picture": data.get("picture", ""),
            "provider": "google",
            "createdAt": now_utc(),
        }
        await db.users.insert_one(user)
        bonus = await loyalty_signup_bonus(user)
    else:
        updates = {"picture": data.get("picture", "")}
        if not user.get("firstName"):
            updates["firstName"] = first
            updates["lastName"] = last
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        user.update(updates)
    return user, bonus


@api_router.get("/auth/providers")
async def auth_providers():
    return {"google": {"enabled": bool(GOOGLE_CLIENT_ID), "clientId": GOOGLE_CLIENT_ID or None}}


@api_router.post("/auth/google/token")
async def google_token(inp: GoogleTokenInput, request: Request, response: Response):
    await enforce_rate_limit(request, "google-login", 20, 900)
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    async with httpx.AsyncClient(timeout=15) as http:
        token_check = await http.get("https://oauth2.googleapis.com/tokeninfo", params={"access_token": inp.access_token})
        if token_check.status_code != 200 or token_check.json().get("aud") != GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=401, detail="Invalid Google access token")
        profile = await http.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {inp.access_token}"})
    if profile.status_code != 200:
        raise HTTPException(status_code=401, detail="Could not read Google profile")
    user, bonus = await upsert_google_user(profile.json())
    token = create_token(user["id"], remember=True)
    set_session_cookie(response, request, token, JWT_REMEMBER_DAYS * 86400)
    return {"token": token, "user": public_user(user), "signupBonusPoints": bonus}


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = extract_token(request)
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            if payload.get("jti"):
                expires = datetime.fromtimestamp(float(payload["exp"]), timezone.utc)
                await db.revoked_tokens.update_one({"jti": payload["jti"]}, {"$set": {"expires_at": expires}}, upsert=True)
        except jwt.PyJWTError:
            pass
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", secure=secure_request(request), samesite="lax")
    return {"ok": True}


@api_router.post("/contact")
async def contact(inp: ContactInput, request: Request):
    await enforce_rate_limit(request, "contact", 10, 3600)
    record = {
        "id": str(uuid.uuid4()),
        "name": inp.name.strip(),
        "email": inp.email.lower(),
        "subject": inp.subject.strip(),
        "message": inp.message.strip(),
        "createdAt": now_utc(),
        "status": "new",
    }
    await db.contact_messages.insert_one(record)
    asyncio.create_task(emails.notify_admin_contact(record))
    return {"ok": True, "message": "Thanks — your message was received. We'll get back to you shortly."}


@api_router.post("/newsletter")
async def newsletter(inp: NewsletterInput, request: Request):
    await enforce_rate_limit(request, "newsletter", 10, 3600)
    email = inp.email.lower()
    await db.newsletter_subscribers.update_one(
        {"email": email},
        {"$set": {"email": email, "active": True, "updatedAt": now_utc()}, "$setOnInsert": {"id": str(uuid.uuid4()), "createdAt": now_utc()}},
        upsert=True,
    )
    return {"ok": True, "message": "You're subscribed for Puff2Door updates."}


# ---- Wishlist ----
@api_router.get("/wishlist")
async def get_wishlist(user: dict = Depends(get_current_user)):
    wl = await db.wishlists.find_one({"userId": user["id"]})
    return {"items": wl["items"] if wl else []}


@api_router.put("/wishlist")
async def put_wishlist(inp: WishlistInput, user: dict = Depends(get_current_user)):
    items = [i.dict() for i in inp.items]
    await db.wishlists.update_one(
        {"userId": user["id"]},
        {"$set": {"userId": user["id"], "items": items, "updatedAt": now_utc()}},
        upsert=True,
    )
    return {"items": items}


@api_router.post("/stock-alerts")
async def create_stock_alert(inp: StockAlertInput, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    await enforce_rate_limit(request, "stock-alert", 20, 3600)
    email = inp.email.lower()
    await db.stock_alerts.update_one(
        {"productId": inp.productId, "email": email},
        {"$set": {
            "productId": inp.productId,
            "productSlug": inp.productSlug,
            "name": inp.name,
            "email": email,
            "userId": user["id"] if user else None,
            "notified": False,
            "createdAt": now_utc(),
        }},
        upsert=True,
    )
    return {"ok": True, "email": email}


# ---- Cart ----
@api_router.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"userId": user["id"]})
    return {"items": cart["items"] if cart else []}


@api_router.put("/cart")
async def put_cart(inp: CartInput, user: dict = Depends(get_current_user)):
    items = [i.dict() for i in inp.items]
    await db.carts.update_one(
        {"userId": user["id"]},
        {"$set": {"userId": user["id"], "items": items, "updatedAt": now_utc()}},
        upsert=True,
    )
    return {"items": items}


# ---- Reviews ----
@api_router.get("/reviews/{product_slug}")
async def get_reviews(product_slug: str):
    reviews = await db.reviews.find({"productSlug": product_slug}).sort("createdAt", -1).to_list(500)
    out = []
    for r in reviews:
        out.append({
            "id": r["id"],
            "name": r["name"],
            "rating": r["rating"],
            "comment": r.get("comment", ""),
            "createdAt": r["createdAt"].isoformat() if not isinstance(r["createdAt"], str) else r["createdAt"],
        })
    count = len(out)
    average = round(sum(r["rating"] for r in out) / count, 1) if count else 0
    return {"reviews": out, "average": average, "count": count}


@api_router.post("/reviews")
async def create_review(inp: ReviewInput, request: Request):
    await enforce_rate_limit(request, "review", 5, 3600)
    if not await db.products.find_one({"slug": inp.productSlug, "active": True}):
        raise HTTPException(status_code=404, detail="Product not found")
    review = {
        "id": str(uuid.uuid4()),
        "productSlug": inp.productSlug,
        "name": inp.name.strip() or "Anonymous",
        "rating": inp.rating,
        "comment": inp.comment.strip(),
        "createdAt": now_utc(),
    }
    await db.reviews.insert_one(review)
    return {
        "id": review["id"],
        "name": review["name"],
        "rating": review["rating"],
        "comment": review["comment"],
        "createdAt": review["createdAt"].isoformat(),
    }


# ---- Orders ----
@api_router.get("/payments/config")
async def get_payments_config():
    return payments_config()


@api_router.post("/payments/paypal/create-order")
async def paypal_create_order(inp: PayPalCreateInput, user: Optional[dict] = Depends(get_optional_user)):
    if not PAYPAL_ENABLED:
        raise HTTPException(status_code=503, detail="PayPal is not configured")
    if not inp.items:
        raise HTTPException(status_code=400, detail="Your cart is empty")
    settings = await get_settings()
    require_delivery_zone(inp.zip, settings)
    validate_age_21(inp.dateOfBirth)
    require_delivery_window(inp.deliveryWindowId, settings)
    await require_delivery_capacity(inp.deliveryWindowId, settings)
    await validate_product_restrictions(inp.items, inp.state, inp.ageAttestationAccepted)
    _, totals = await price_cart(inp.items, inp.promoCode, inp.redeemPoints, user, inp.tip)
    total = totals["total"]
    data = await paypal_request("POST", "/v2/checkout/orders", {
        "intent": "CAPTURE",
        "purchase_units": [{"amount": {"currency_code": "USD", "value": f"{total:.2f}"}, "description": "Puff2Door order"}],
    })
    await db.paypal_orders.update_one({"paypalOrderId": data["id"]}, {"$set": {"total": total, "createdAt": now_utc(), "captured": False}}, upsert=True)
    return {"id": data["id"], "total": total}


async def reserve_stock(priced_items: List[dict]):
    reserved = []
    for it in priced_items:
        res = await db.products.update_one({"id": it["productId"], "stock": {"$gte": it["qty"]}}, {"$inc": {"stock": -it["qty"]}})
        if res.modified_count == 0:
            await release_stock(reserved)
            raise HTTPException(status_code=409, detail=f"{it['name']} just sold out")
        reserved.append(it)


async def release_stock(items: List[dict]):
    for r in items:
        await db.products.update_one({"id": r["productId"]}, {"$inc": {"stock": r["qty"]}})


@api_router.post("/orders")
async def create_order(inp: OrderInput, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    await enforce_rate_limit(request, "checkout", 20, 3600)
    if not inp.items:
        raise HTTPException(status_code=400, detail="Your cart is empty")
    method = inp.paymentMethod
    enabled = {"test_card": TEST_CARD_ENABLED, "square": SQUARE_ENABLED, "cash_app": SQUARE_ENABLED, "paypal": PAYPAL_ENABLED, "apple_pay": APPLE_PAY_ENABLED, "zelle": ZELLE_ENABLED}
    if method not in PAYMENT_METHODS or not enabled[method]:
        raise HTTPException(status_code=400, detail="That payment method is not available")
    settings = await get_settings()
    zone = require_delivery_zone(inp.shipping.zip, settings)
    validate_age_21(inp.dateOfBirth)
    chosen_window = require_delivery_window(inp.deliveryWindowId, settings)
    await require_delivery_capacity(inp.deliveryWindowId, settings)
    compliance_snapshot = await validate_product_restrictions(inp.items, inp.shipping.state, inp.ageAttestationAccepted)
    window = await delivery_window_with_capacity(settings)
    if inp.expectSameDay and not chosen_window["sameDay"]:
        raise HTTPException(status_code=409, detail=window["message"] or "Same-day delivery is not available right now. Choose the next available delivery window.")
    pending = None
    if method in ("paypal", "apple_pay"):
        if not inp.paypalOrderId:
            raise HTTPException(status_code=400, detail="Missing PayPal order")
        pending = await db.paypal_orders.find_one({"paypalOrderId": inp.paypalOrderId})
        if not pending:
            raise HTTPException(status_code=402, detail="PayPal order not found. Please try again.")
        if pending.get("captured"):
            existing = await db.orders.find_one({"id": pending.get("orderId", "")}) if pending.get("orderId") else None
            if existing:
                return order_response(existing)  # duplicate submission of an already-captured payment → same order, no second charge
            raise HTTPException(status_code=402, detail="This PayPal payment was already used.")
        if pending.get("capturing"):
            raise HTTPException(status_code=409, detail="This PayPal payment is already being processed. Please wait a moment.")
    priced_items, totals = await price_cart(inp.items, inp.promoCode, inp.redeemPoints, user, inp.tip)
    subtotal, shipping_cost, total = totals["subtotal"], totals["shippingCost"], totals["total"]
    if pending and abs(pending["total"] - total) > 0.01:
        raise HTTPException(status_code=402, detail="PayPal order does not match your cart. Please try again.")
    await reserve_stock(priced_items)
    order_id = str(uuid.uuid4())
    order_number = "P2D-" + "".join(random.choices("0123456789", k=8))
    payment = {"paymentMethod": method, "paymentStatus": "paid", "paymentRef": "", "paymentLast4": inp.paymentLast4, "paymentBrand": ""}
    paypal_locked = False
    try:
        if method in ("square", "cash_app"):
            if not inp.paymentToken:
                raise HTTPException(status_code=400, detail="Missing payment token")
            pay = await square_create_payment(inp.paymentToken, int(round(total * 100)), order_id, order_number)
            if pay.get("status") not in ("COMPLETED", "APPROVED"):
                raise HTTPException(status_code=402, detail=f"Payment {pay.get('status', 'failed').lower()}")
            card = pay.get("card_details", {}).get("card", {})
            payment.update({"paymentRef": pay.get("id", ""), "paymentLast4": card.get("last_4", ""), "paymentBrand": card.get("card_brand", "Cash App" if method == "cash_app" else "")})
        elif method in ("paypal", "apple_pay"):
            lock = await db.paypal_orders.update_one({"paypalOrderId": inp.paypalOrderId, "captured": False, "capturing": {"$ne": True}}, {"$set": {"capturing": True, "capturingAt": now_utc(), "orderId": order_id}})
            if lock.modified_count == 0:
                raise HTTPException(status_code=409, detail="This PayPal payment is already being processed. Please wait a moment.")
            paypal_locked = True
            cap = await paypal_request("POST", f"/v2/checkout/orders/{inp.paypalOrderId}/capture")
            if cap.get("status") != "COMPLETED":
                raise HTTPException(status_code=402, detail=f"PayPal payment {cap.get('status', 'failed').lower()}")
            capture_id = cap["purchase_units"][0]["payments"]["captures"][0]["id"]
            await db.paypal_orders.update_one({"paypalOrderId": inp.paypalOrderId}, {"$set": {"captured": True, "capturing": False, "capturedAt": now_utc(), "captureId": capture_id, "orderId": order_id}})
            payment.update({"paymentRef": capture_id, "paymentBrand": "Apple Pay" if method == "apple_pay" else "PayPal", "paymentLast4": (cap.get("payer", {}).get("email_address") or "")})
        elif method == "zelle":
            payment.update({"paymentStatus": "awaiting_payment", "paymentBrand": "Zelle"})
        elif method == "test_card":
            digits = re.sub(r"\D", "", inp.paymentLast4)
            payment.update({"paymentLast4": digits[-4:], "paymentBrand": "Test Card"})
    except HTTPException as e:
        await release_stock(priced_items)
        if paypal_locked:
            await db.paypal_orders.update_one({"paypalOrderId": inp.paypalOrderId, "captured": False}, {"$set": {"capturing": False, "lastError": str(e.detail)[:300]}})
        raise
    except Exception as e:
        await release_stock(priced_items)
        if paypal_locked:
            await db.paypal_orders.update_one({"paypalOrderId": inp.paypalOrderId, "captured": False}, {"$set": {"capturing": False, "lastError": str(e)[:300]}})
        logger.error("Payment error: %s", e)
        raise HTTPException(status_code=502, detail="Payment provider error. You were not charged.")
    order = {
        "id": order_id,
        "orderNumber": order_number,
        "userId": user["id"] if user else None,
        "items": priced_items,
        "shipping": inp.shipping.model_dump(),
        "deliveryDistanceMiles": zone["distanceMiles"],
        "deliveryDate": chosen_window["date"],
        "sameDay": bool(chosen_window["sameDay"]),
        "deliveryWindow": chosen_window,
        "ageVerifiedAt": now_utc(),
        "ageVerification": {
            "result": "passed",
            "method": "checkout_dob_and_attestation",
            "minimumAge": max(21, int(compliance_snapshot.get("minimumAge", 21))),
            "verifiedAt": now_utc(),
            "fullDobStored": False,
        },
        "complianceSnapshot": compliance_snapshot,
        "requiresIdAtDelivery": bool(compliance_snapshot.get("requiresIdAtDelivery")),
        "idCheck": {"status": "pending" if compliance_snapshot.get("requiresIdAtDelivery") else "not_required"},
        "subtotal": subtotal,
        "shippingCost": shipping_cost,
        "tax": totals["tax"],
        "taxRate": totals["taxRate"],
        "discount": totals["discount"],
        "promoCode": totals["promoCode"],
        "rewardDiscount": totals["rewardDiscount"],
        "rewardPoints": totals["rewardPoints"],
        "tip": totals["tip"],
        "total": total,
        **payment,
        "createdAt": now_utc(),
        "statusHistory": {"placed": now_utc()},
    }
    await db.orders.insert_one(order)
    await db.compliance_events.insert_one({
        "id": str(uuid.uuid4()), "orderId": order_id, "orderNumber": order_number,
        "event": "checkout_age_verified", "result": "passed", "minimumAge": compliance_snapshot.get("minimumAge", 21),
        "method": "dob_and_attestation", "fullDobStored": False, "createdAt": now_utc(),
        "actorId": user["id"] if user else None,
    })
    if user and compliance_snapshot.get("restrictedItems"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"ageVerifiedAt": now_utc(), "ageVerificationMethod": "checkout_dob_and_attestation"}})
    if totals["rewardPoints"] and user:
        await loyalty_add(user["id"], "redeem", -totals["rewardPoints"], f"redeem:{order_id}", f"${totals['rewardDiscount']:.2f} reward redeemed — Order #{order_number}", order, reward_value=totals["rewardDiscount"])
    await loyalty_award_for_order(order)
    if totals["promoCode"]:
        await db.promo_codes.update_one({"code": totals["promoCode"]}, {"$inc": {"uses": 1}})
    if user:
        await db.carts.update_one({"userId": user["id"]}, {"$set": {"items": []}}, upsert=True)
    resp = {**order_response(order), "orderAccessToken": create_order_access_token(order_id)}
    asyncio.create_task(emails.send_order_confirmation(order, resp.get("zelle"), await loyalty_email_info(order)))
    return resp


@api_router.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"userId": user["id"]}).sort("createdAt", -1).to_list(200)
    return {"orders": [order_response(o) for o in orders]}


@api_router.get("/orders/track/{order_number}")
async def track_order(order_number: str, email: EmailStr, request: Request):
    await enforce_rate_limit(request, "track-order", 30, 600)
    o = await db.orders.find_one({"orderNumber": order_number.strip().upper()})
    order_email = str((o or {}).get("shipping", {}).get("email", "")).strip().lower()
    if not o or not order_email or not secrets.compare_digest(str(email).strip().lower(), order_email):
        raise HTTPException(status_code=404, detail="Order not found")
    return {**public_tracking_response(o), "orderAccessToken": create_order_access_token(o["id"])}


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    token = request.headers.get("x-order-access", "") or request.query_params.get("access_token", "")
    owns_order = bool(user) and (is_admin(user) or user.get("id") == o.get("userId"))
    if not owns_order and not valid_order_access_token(token, order_id):
        raise HTTPException(status_code=403, detail="Order access is not authorized")
    return order_response(o)


@api_router.post("/orders/{order_id}/issues")
async def create_order_issue(order_id: str, inp: OrderIssueInput, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    await enforce_rate_limit(request, "order-issue", 10, 3600)
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    token = request.headers.get("x-order-access", "") or request.query_params.get("access_token", "")
    owns_order = bool(user) and (is_admin(user) or user.get("id") == order.get("userId"))
    if not owns_order and not valid_order_access_token(token, order_id):
        raise HTTPException(status_code=403, detail="Order access is not authorized")
    issue = {"id": str(uuid.uuid4()), "kind": inp.kind, "message": inp.message.strip()[:1000], "status": "open", "resolution": "", "createdAt": now_utc(), "updatedAt": now_utc()}
    await db.orders.update_one({"id": order_id}, {"$push": {"issues": issue}})
    updated = await db.orders.find_one({"id": order_id})
    return order_response(updated)


# ---- Products (public) ----
@api_router.get("/products")
async def list_products():
    prods = await db.products.find({"active": True}).sort("id", 1).to_list(2000)
    return {"products": [product_out(p) for p in prods]}


# ---- Brands: centralized source of truth (id, name, displayName, slug, logo, active) ----
class BrandInput(BaseModel):
    name: str = ""
    displayName: str = ""
    logo: str = ""
    active: bool = True


class BrandLogoInput(BaseModel):
    image: str = ""
    name: str = ""


_brand_cache: dict = {"map": None}


def brand_out(b: dict, count: int = 0) -> dict:
    return {"id": b.get("id", b["slug"]), "slug": b["slug"], "name": b.get("name") or b["slug"].upper(), "displayName": b.get("displayName") or b.get("name") or b["slug"].upper(), "logo": b.get("logo") or b.get("image") or "", "active": b.get("active", True), "productCount": count}


async def get_brand_map() -> dict:
    if _brand_cache["map"] is None:
        rows = await db.brands.find({}, {"_id": 0}).to_list(2000)
        _brand_cache["map"] = {r["slug"]: r for r in rows}
    return _brand_cache["map"]


def invalidate_brands():
    _brand_cache["map"] = None


async def brand_counts() -> dict:
    counts: dict = {}
    async for p in db.products.find({"active": True}, {"brand": 1, "brandName": 1, "name": 1}):
        sl = brand_slug(p)
        counts[sl] = counts.get(sl, 0) + 1
    return counts


async def seed_brands():
    """Idempotent: import every brand referenced by products into the brands collection, preserving slug/name/logo."""
    if await db.brands.count_documents({}) == 0:
        seed_path = ROOT_DIR / "seed_brands.json"
        if seed_path.exists():
            rows = json.loads(seed_path.read_text())
            for row in rows:
                row.pop("productCount", None)
                row["createdAt"] = now_utc()
                row["updatedAt"] = now_utc()
            if rows:
                await db.brands.insert_many(rows)
    existing = {b["slug"]: b for b in await db.brands.find({}).to_list(2000)}
    names: dict = {}
    async for p in db.products.find({"active": True}, {"brand": 1, "brandName": 1, "name": 1}):
        sl = brand_slug(p)
        if sl and sl not in names:
            names[sl] = (p.get("brandName") or sl.replace("-", " ")).upper()
    async for p in db.products.find({"$or": [{"brand": ""}, {"brand": {"$exists": False}}]}, {"brand": 1, "brandName": 1, "name": 1}):
        await db.products.update_one({"_id": p["_id"]}, {"$set": {"brand": brand_slug(p)}})
    created = 0
    for sl, nm in names.items():
        b = existing.get(sl)
        if not b:
            await db.brands.insert_one({"id": str(uuid.uuid4()), "slug": sl, "name": nm, "displayName": nm, "logo": "", "active": True, "createdAt": now_utc(), "updatedAt": now_utc()})
            created += 1
        else:
            fix = {}
            if not b.get("id"):
                fix["id"] = str(uuid.uuid4())
            if not b.get("name"):
                fix["name"] = nm
            if not b.get("displayName"):
                fix["displayName"] = b.get("name") or nm
            if "logo" not in b and b.get("image"):
                fix["logo"] = b["image"]
            if "active" not in b:
                fix["active"] = True
            if fix:
                await db.brands.update_one({"slug": sl}, {"$set": fix})
    await db.brands.create_index("slug", unique=True)
    invalidate_brands()
    if created:
        logger.info("Brands: imported %s brand(s) from products", created)


@api_router.get("/brands")
async def list_brands():
    rows, counts = await get_brand_map(), await brand_counts()
    return {"brands": [brand_out(b, counts.get(b["slug"], 0)) for b in rows.values() if b.get("active", True)]}


# ---- Categories: centralized source of truth (id, slug, name, order, active) ----
DEFAULT_CATEGORIES = [("disposable", "DISPOSABLE VAPES"), ("delta", "DELTA DISPOSABLES"), ("delta-cartridges", "DELTA CARTRIDGES"), ("delta-edibles", "DELTA EDIBLES"), ("delta-smokeables", "DELTA SMOKEABLES"), ("vape-accessories", "VAPE ACCESSORIES"), ("hemp-wraps", "HEMP WRAPS"), ("paper-cones", "PAPER & CONES"), ("kratom", "KRATOM"), ("glass-pipes", "GLASS PIPES"), ("lighter", "LIGHTER"), ("air-freshner", "AIR FRESHNER"), ("hookah-accessories", "HOOKAH ACCESSORIES"), ("miscellaneous", "MISCELLANEOUS")]


class CategoryInput(BaseModel):
    name: str = ""
    active: bool = True


class ReorderInput(BaseModel):
    slugs: List[str]


_category_cache: dict = {"list": None}


def category_out(c: dict, count: int = 0) -> dict:
    return {"id": c.get("id", c["slug"]), "slug": c["slug"], "name": c.get("name") or c["slug"].upper(), "order": c.get("order", 999), "active": c.get("active", True), "productCount": count}


async def get_categories() -> list:
    if _category_cache["list"] is None:
        _category_cache["list"] = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(500)
    return _category_cache["list"]


def invalidate_categories():
    _category_cache["list"] = None


async def category_counts() -> dict:
    counts: dict = {}
    async for p in db.products.find({"active": True}, {"categorySlug": 1}):
        counts[p.get("categorySlug", "")] = counts.get(p.get("categorySlug", ""), 0) + 1
    return counts


async def seed_categories():
    """Idempotent: default list + any category referenced by products, preserving slugs/names."""
    if await db.categories.count_documents({}) == 0:
        seed_path = ROOT_DIR / "seed_categories.json"
        if seed_path.exists():
            rows = json.loads(seed_path.read_text())
            for row in rows:
                row.pop("productCount", None)
                row["createdAt"] = now_utc()
                row["updatedAt"] = now_utc()
            if rows:
                await db.categories.insert_many(rows)
    existing = {c["slug"] for c in await db.categories.find({}, {"slug": 1}).to_list(500)}
    wanted = list(DEFAULT_CATEGORIES)
    async for p in db.products.find({"active": True}, {"categorySlug": 1, "category": 1}):
        if p.get("categorySlug") and p["categorySlug"] not in {w[0] for w in wanted}:
            wanted.append((p["categorySlug"], (p.get("category") or p["categorySlug"]).upper()))
    for i, (slug, name) in enumerate(wanted):
        if slug not in existing:
            await db.categories.insert_one({"id": str(uuid.uuid4()), "slug": slug, "name": name, "order": i, "active": True, "createdAt": now_utc(), "updatedAt": now_utc()})
    await db.categories.create_index("slug", unique=True)
    invalidate_categories()


@api_router.get("/categories")
async def list_categories():
    cats, counts = await get_categories(), await category_counts()
    return {"categories": [category_out(c, counts.get(c["slug"], 0)) for c in cats if c.get("active", True)]}




@api_router.get("/products/{slug}")
async def get_product(slug: str):
    p = await db.products.find_one({"slug": slug, "active": True})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_out(p)


@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data, content_type = await get_object(path)
    except Exception as e:
        logger.warning("Object store unavailable for %s: %s", path, e)
        raise HTTPException(status_code=502, detail="Image storage is temporarily unavailable")
    return Response(content=data, media_type=record.get("content_type", content_type), headers={"Cache-Control": "public, max-age=86400"})


# ---- Settings & promo codes ----
@api_router.get("/settings")
async def public_settings():
    settings = await get_settings()
    return {"pricing": pricing_rules(settings), "delivery": delivery_rules(settings), "loyalty": loyalty_public_rules(settings), "presentation": {"homepageLayout": settings.get("homepageLayout", "classic")}}


# ---- Loyalty rewards (customer) ----
async def loyalty_summary(user_id: str, settings: dict) -> dict:
    rules = loyalty_rules(settings)
    bal = await loyalty_balance(user_id)
    per = rules["pointsPerReward"]
    redeemable = (bal["available"] // per) * per if per else 0
    if rules["maxRedeemPerOrder"]:
        redeemable = min(redeemable, (rules["maxRedeemPerOrder"] // per) * per)
    if redeemable < rules["minRedeemPoints"]:
        redeemable = 0
    return {**bal, "availableValue": points_value(bal["available"], rules), "redeemablePoints": redeemable, "redeemableValue": points_value(redeemable, rules),
            "pointsToNextReward": per - (bal["available"] % per) if per else 0, "rules": loyalty_public_rules(settings)}


@api_router.get("/loyalty/me")
async def loyalty_me(user: dict = Depends(get_current_user)):
    settings = await get_settings()
    summary = await loyalty_summary(user["id"], settings)
    rows = await db.loyalty_transactions.find({"userId": user["id"]}).sort("createdAt", -1).to_list(500)
    return {**summary, "history": [loyalty_tx_out(t) for t in rows]}


# ---- SEO: sitemap ----
SITE_URL = os.environ.get("SITE_URL", "").strip().rstrip("/") or "https://puff2door.com"
SITEMAP_STATIC = ["/", "/shop", "/brands", "/delivery-area", "/about", "/contact"]
SITEMAP_FILE = ROOT_DIR.parent / "frontend" / "public" / "sitemap.xml"


def _xml_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")


async def build_sitemap() -> str:
    """URL-only sitemap (loc + lastmod), canonical https://puff2door.com URLs only, no image/external data."""
    prods = await db.products.find({"active": True}, {"slug": 1, "categorySlug": 1, "brand": 1, "brandName": 1, "name": 1, "updatedAt": 1}).sort("id", 1).to_list(5000)
    today = now_utc().date().isoformat()
    entries = []
    seen = set()

    def add(path, lastmod=today):
        loc = SITE_URL + path
        if loc in seen:
            return
        seen.add(loc)
        entries.append(f"  <url>\n    <loc>{_xml_escape(loc)}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>")

    for path in SITEMAP_STATIC:
        add(path)
    for cat in sorted({p.get("categorySlug") for p in prods if p.get("categorySlug")}):
        add(f"/product-category/{cat}")
    for brand in sorted({brand_slug(p) for p in prods if brand_slug(p)}):
        add(f"/brand/{brand}")
    for p in prods:
        upd = p.get("updatedAt")
        add(f"/shop/{p['slug']}", upd.date().isoformat() if isinstance(upd, datetime) else today)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "\n".join(entries) + "\n</urlset>\n")


async def refresh_static_sitemap():
    """Best-effort: keep frontend/public/sitemap.xml in sync so each deploy ships a current static sitemap."""
    try:
        xml = await build_sitemap()
        if SITEMAP_FILE.parent.exists() and (not SITEMAP_FILE.exists() or SITEMAP_FILE.read_text() != xml):
            SITEMAP_FILE.write_text(xml)
    except Exception as e:
        logger.warning("Sitemap refresh failed: %s", e)


@api_router.get("/sitemap.xml")
async def sitemap_xml():
    return Response(content=await build_sitemap(), media_type="application/xml; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@api_router.get("/delivery/check")
async def delivery_check(zip: str = ""):
    return delivery_zone_check(zip, await get_settings())


@api_router.get("/delivery/window")
async def delivery_window_public():
    return await delivery_window_with_capacity(await get_settings())


_area_cache: dict = {}


@api_router.get("/delivery/area")
async def delivery_area():
    """Configured ZIP whitelist, or all ZIP codes inside the configured radius."""
    settings = await get_settings()
    allowed = tuple(settings.get("allowedZipCodes") or [])
    key = (settings["deliveryZip"], float(settings["deliveryRadiusMiles"]), allowed)
    if key in _area_cache:
        return _area_cache[key]
    center = zip_lookup(settings["deliveryZip"])
    cities: dict = {}
    if allowed:
        for code in allowed:
            z = zip_lookup(code)
            if z:
                cities.setdefault(z["city"].title(), []).append({"zip": z["zip"], "distanceMiles": round(miles_between(center, z), 1) if center else None})
    elif center:
        for z in zipcodes.filter_by_state(center["state"]):
            if z.get("zip_code_type") != "STANDARD" or not z.get("lat") or z.get("active") is False:
                continue
            d = miles_between(center, {"lat": float(z["lat"]), "lng": float(z["long"])})
            if d <= key[1]:
                cities.setdefault(z["city"].title(), []).append({"zip": z["zip_code"], "distanceMiles": round(d, 1)})
    areas = [{"city": c, "state": center["state"] if center else "", "zips": sorted(v, key=lambda x: x["zip"])} for c, v in cities.items()]
    areas.sort(key=lambda a: (-len(a["zips"]), a["city"]))
    result = {"centerZip": key[0], "centerCity": center["city"].title() if center else "", "centerLat": center["lat"] if center else None, "centerLng": center["lng"] if center else None, "radiusMiles": key[1], "mode": "selected_zips" if allowed else "radius", "zipCount": sum(len(a["zips"]) for a in areas), "areas": areas}
    _area_cache.clear()
    _area_cache[key] = result
    return result


@api_router.post("/promo/validate")
async def validate_promo(inp: PromoValidateInput):
    subtotal = 0.0
    for it in inp.items:
        prod = await db.products.find_one({"id": it.productId})
        if not prod:
            continue
        sale = prod.get("salePrice")
        base = min(prod["price"], sale) if sale and sale > 0 else prod["price"]
        unit = min(it.price, base) if it.price > 0 else base
        subtotal += unit * it.qty
    subtotal = round(subtotal, 2)
    promo = await resolve_promo(inp.code, subtotal)
    return {"code": promo["code"], "type": promo["type"], "value": promo["value"], "minSubtotal": promo.get("minSubtotal", 0), "discount": promo_discount(promo, subtotal)}


# ---- Admin ----
async def get_admin_user(user: dict = Depends(get_current_user)):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@api_router.put("/admin/orders/{order_id}/issues/{issue_id}")
async def resolve_order_issue(order_id: str, issue_id: str, inp: IssueResolutionInput, admin: dict = Depends(get_admin_user)):
    result = await db.orders.update_one({"id": order_id, "issues.id": issue_id}, {"$set": {"issues.$.status": inp.status, "issues.$.resolution": inp.resolution.strip()[:1000], "issues.$.updatedAt": now_utc(), "issues.$.updatedBy": admin["id"]}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Order problem not found")
    return order_response(await db.orders.find_one({"id": order_id}))


@api_router.get("/admin/brands")
async def admin_list_brands(admin: dict = Depends(get_admin_user)):
    rows, counts = await get_brand_map(), await brand_counts()
    out = [brand_out(b, counts.get(b["slug"], 0)) for b in rows.values()]
    out.sort(key=lambda x: x["displayName"].lower())
    return {"brands": out}


@api_router.post("/admin/brands")
async def admin_create_brand(inp: BrandInput, admin: dict = Depends(get_admin_user)):
    name = inp.name.strip() or inp.displayName.strip()
    slug = slugify(name)
    if not slug:
        raise HTTPException(status_code=400, detail="Brand name is required")
    if slug in await get_brand_map():
        raise HTTPException(status_code=409, detail=f"A brand with URL /brand/{slug} already exists")
    doc = {"id": str(uuid.uuid4()), "slug": slug, "name": name, "displayName": inp.displayName.strip() or name, "logo": inp.logo.strip(), "active": inp.active, "createdAt": now_utc(), "updatedAt": now_utc(), "updatedBy": admin["id"]}
    await db.brands.insert_one(doc)
    invalidate_brands()
    return brand_out(doc)


@api_router.put("/admin/brands/{slug}")
async def admin_update_brand(slug: str, inp: BrandInput, admin: dict = Depends(get_admin_user)):
    """Edits name/displayName/logo/active. The URL slug is intentionally never changed (SEO-safe)."""
    b = (await get_brand_map()).get(slugify(slug))
    if not b:
        raise HTTPException(status_code=404, detail="Brand not found")
    name = inp.name.strip() or b.get("name") or slug.upper()
    upd = {"name": name, "displayName": inp.displayName.strip() or name, "logo": inp.logo.strip(), "active": inp.active, "updatedAt": now_utc(), "updatedBy": admin["id"]}
    await db.brands.update_one({"slug": b["slug"]}, {"$set": upd, "$unset": {"image": ""}})
    await db.products.update_many({"brand": b["slug"]}, {"$set": {"brandName": upd["displayName"]}})
    invalidate_brands()
    counts = await brand_counts()
    return brand_out({**b, **upd}, counts.get(b["slug"], 0))


@api_router.post("/admin/brands/{slug}/import")
async def admin_import_brand_logo(slug: str, inp: BrandLogoInput, admin: dict = Depends(get_admin_user)):
    """Copy an external logo URL into Puff2door storage; returns the stored URL (does not save unless brand exists)."""
    if not inp.image.startswith("http"):
        raise HTTPException(status_code=400, detail="Provide an http(s) image URL")
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            url = await _fetch_and_store(client, inp.image, admin["id"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not import image: {str(e)[:120]}")
    b = (await get_brand_map()).get(slugify(slug))
    if b:
        await db.brands.update_one({"slug": b["slug"]}, {"$set": {"logo": url, "updatedAt": now_utc()}, "$unset": {"image": ""}})
        invalidate_brands()
    return {"slug": slugify(slug), "logo": url}


@api_router.delete("/admin/brands/{slug}")
async def admin_delete_brand(slug: str, admin: dict = Depends(get_admin_user)):
    sl = slugify(slug)
    counts = await brand_counts()
    if counts.get(sl):
        raise HTTPException(status_code=400, detail=f"This brand is used by {counts[sl]} product(s). Reassign them first or deactivate the brand instead.")
    await db.brands.delete_one({"slug": sl})
    invalidate_brands()
    return {"ok": True}


@api_router.get("/admin/categories")
async def admin_list_categories(admin: dict = Depends(get_admin_user)):
    cats, counts = await get_categories(), await category_counts()
    return {"categories": [category_out(c, counts.get(c["slug"], 0)) for c in cats]}


@api_router.post("/admin/categories")
async def admin_create_category(inp: CategoryInput, admin: dict = Depends(get_admin_user)):
    name = inp.name.strip()
    slug = slugify(name)
    if not slug:
        raise HTTPException(status_code=400, detail="Category name is required")
    if any(c["slug"] == slug for c in await get_categories()):
        raise HTTPException(status_code=409, detail=f"A category with URL /product-category/{slug} already exists")
    order = max([c.get("order", 0) for c in await get_categories()] + [-1]) + 1
    doc = {"id": str(uuid.uuid4()), "slug": slug, "name": name, "order": order, "active": inp.active, "createdAt": now_utc(), "updatedAt": now_utc(), "updatedBy": admin["id"]}
    await db.categories.insert_one(doc)
    invalidate_categories()
    return category_out(doc)


@api_router.put("/admin/categories/reorder")
async def admin_reorder_categories(inp: ReorderInput, admin: dict = Depends(get_admin_user)):
    known = [c["slug"] for c in await get_categories()]
    if sorted(inp.slugs) != sorted(known):
        raise HTTPException(status_code=400, detail="Reorder must include every category slug exactly once")
    for i, slug in enumerate(inp.slugs):
        await db.categories.update_one({"slug": slug}, {"$set": {"order": i, "updatedAt": now_utc()}})
    invalidate_categories()
    return {"ok": True}


@api_router.put("/admin/categories/{slug}")
async def admin_update_category(slug: str, inp: CategoryInput, admin: dict = Depends(get_admin_user)):
    """Renames / activates a category. The URL slug never changes (SEO-safe)."""
    cat = next((c for c in await get_categories() if c["slug"] == slugify(slug)), None)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    name = inp.name.strip() or cat["name"]
    await db.categories.update_one({"slug": cat["slug"]}, {"$set": {"name": name, "active": inp.active, "updatedAt": now_utc(), "updatedBy": admin["id"]}})
    await db.products.update_many({"categorySlug": cat["slug"]}, {"$set": {"category": name}})
    invalidate_categories()
    counts = await category_counts()
    asyncio.create_task(refresh_static_sitemap())
    return category_out({**cat, "name": name, "active": inp.active}, counts.get(cat["slug"], 0))


@api_router.delete("/admin/categories/{slug}")
async def admin_delete_category(slug: str, admin: dict = Depends(get_admin_user)):
    sl = slugify(slug)
    counts = await category_counts()
    if counts.get(sl):
        raise HTTPException(status_code=400, detail=f"This category has {counts[sl]} product(s). Move them first or deactivate the category instead.")
    await db.categories.delete_one({"slug": sl})
    invalidate_categories()
    return {"ok": True}


# ---- Home content (hero slider / promo tiles) ----
async def get_home_content() -> dict:
    doc = await db.site_content.find_one({"key": "home"}, {"_id": 0})
    if not doc:
        seed_path = ROOT_DIR / "seed_content.json"
        data = json.loads(seed_path.read_text()) if seed_path.exists() else {"heroSlides": [], "promoBlocks": []}
        doc = {"key": "home", **data, "updatedAt": now_utc()}
        await db.site_content.insert_one(dict(doc))
        doc.pop("_id", None)
    doc.pop("updatedAt", None)
    return doc


@api_router.get("/content/home")
async def content_home():
    return await get_home_content()


@api_router.put("/admin/content/home")
async def admin_update_home(inp: HomeContentInput, admin: dict = Depends(get_admin_user)):
    data = {"heroSlides": [s.dict() for s in inp.heroSlides], "promoBlocks": [b.dict() for b in inp.promoBlocks]}
    await db.site_content.update_one({"key": "home"}, {"$set": {**data, "updatedAt": now_utc(), "updatedBy": admin["id"]}}, upsert=True)
    return {"key": "home", **data}



async def next_product_id() -> int:
    last = await db.products.find_one(sort=[("id", -1)])
    return (last["id"] + 1) if last else 1


@api_router.get("/admin/products")
async def admin_list_products(admin: dict = Depends(get_admin_user)):
    prods = await db.products.find({}).sort("id", 1).to_list(5000)
    return {"products": [product_out(p) for p in prods]}


async def resolve_brand_name(inp: ProductInput) -> str:
    """Brand slug from Brand Management wins; falls back to typed brandName (auto-registering it as a brand)."""
    bm = await get_brand_map()
    if inp.brand and slugify(inp.brand) in bm:
        b = bm[slugify(inp.brand)]
        inp.brand = b["slug"]
        return b.get("displayName") or b.get("name") or inp.brand.upper()
    name = (inp.brandName or inp.name.split(" ")[0]).strip()
    sl = slugify(name)
    inp.brand = sl
    if sl and sl not in bm:
        await db.brands.insert_one({"id": str(uuid.uuid4()), "slug": sl, "name": name.upper(), "displayName": name.upper(), "logo": "", "active": True, "createdAt": now_utc(), "updatedAt": now_utc()})
        invalidate_brands()
        return name.upper()
    return bm[sl].get("displayName") or name.upper() if sl else name


async def resolve_category_name(inp: ProductInput) -> str:
    cat = next((c for c in await get_categories() if c["slug"] == inp.categorySlug), None)
    return cat["name"] if cat else inp.category


@api_router.post("/admin/products")
async def admin_create_product(inp: ProductInput, admin: dict = Depends(get_admin_user)):
    pid = await next_product_id()
    doc = inp.dict()
    doc.update({
        "id": pid,
        "slug": f"{slugify(inp.name)}-{pid}",
        "image2": inp.image2 or inp.image,
        "brandName": await resolve_brand_name(inp),
        "category": await resolve_category_name(inp),
        "rating": 4.5,
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    })
    await db.products.insert_one(doc)
    asyncio.create_task(refresh_static_sitemap())
    return product_out(doc)


@api_router.put("/admin/products/{product_id}")
async def admin_update_product(product_id: int, inp: ProductInput, admin: dict = Depends(get_admin_user)):
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    doc = inp.dict()
    doc["image2"] = inp.image2 or inp.image
    doc["brandName"] = await resolve_brand_name(inp)
    doc["category"] = await resolve_category_name(inp)
    doc["updatedAt"] = now_utc()
    await db.products.update_one({"id": product_id}, {"$set": doc})
    restocked = int(existing.get("stock", 0)) == 0 and inp.stock > 0
    notified = 0
    updated = await db.products.find_one({"id": product_id})
    if restocked:
        pending = await db.stock_alerts.find({"productId": product_id, "notified": False}).to_list(1000)
        for a in pending:
            asyncio.create_task(emails.send_restock_alert(a["email"], updated))
        res = await db.stock_alerts.update_many(
            {"productId": product_id, "notified": False},
            {"$set": {"notified": True, "notifiedAt": now_utc()}},
        )
        notified = res.modified_count
        logger.info("Restock: notified %s subscriber(s) for product %s", notified, product_id)
    asyncio.create_task(refresh_static_sitemap())
    return {**product_out(updated), "restockNotified": notified}


@api_router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: int, admin: dict = Depends(get_admin_user)):
    res = await db.products.update_one({"id": product_id}, {"$set": {"active": False, "updatedAt": now_utc()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Product not found")
    asyncio.create_task(refresh_static_sitemap())
    return {"ok": True}


async def store_image(data: bytes, ext: str, filename: str, uploaded_by: str) -> str:
    path = f"{APP_NAME}/products/{uuid.uuid4()}.{ext}"
    result = await put_object(path, data, MIME_TYPES[ext])
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "original_filename": filename,
        "content_type": MIME_TYPES[ext],
        "size": result.get("size", len(data)),
        "uploadedBy": uploaded_by,
        "is_deleted": False,
        "created_at": now_utc(),
    })
    return f"/api/files/{result['path']}"


@api_router.post("/admin/upload")
async def admin_upload(file: UploadFile = File(...), admin: dict = Depends(get_admin_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin").lower()
    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only jpg, png, webp or gif images are allowed")
    data = await file.read()
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 6MB")
    try:
        url = await store_image(data, ext, file.filename, admin["id"])
    except Exception as e:
        logger.error("Upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Image storage is unavailable right now")
    return {"path": url.replace("/api/files/", "", 1), "url": url}


# ---- Image migration: copy hot-linked product photos into Puff2door storage ----
_migration: dict = {"running": False, "total": 0, "done": 0, "migrated": 0, "skipped": 0, "failed": [], "startedAt": None, "finishedAt": None}


def _to_webp(data: bytes) -> bytes:
    from PIL import Image
    from io import BytesIO
    im = Image.open(BytesIO(data))
    if getattr(im, "is_animated", False):
        raise ValueError("animated")
    im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
    if max(im.size) > 1200:
        im.thumbnail((1200, 1200))
    out = BytesIO()
    im.save(out, "WEBP", quality=82, method=6)
    return out.getvalue()


async def _fetch_and_store(client: httpx.AsyncClient, url: str, admin_id: str) -> str:
    current_url = url
    for _ in range(6):
        await _assert_safe_external_url(current_url)
        r = await client.get(current_url, headers={"User-Agent": "Mozilla/5.0 (Puff2Door image importer)", "Referer": SITE_URL + "/"})
        if r.is_redirect:
            location = r.headers.get("location")
            if not location:
                raise ValueError("image redirect is missing a destination")
            current_url = urljoin(current_url, location)
            continue
        break
    else:
        raise ValueError("too many image redirects")
    r.raise_for_status()
    if not r.headers.get("content-type", "").startswith("image/"):
        raise ValueError(f"not an image ({r.headers.get('content-type')})")
    if len(r.content) > 8 * 1024 * 1024:
        raise ValueError("image larger than 8MB")
    try:
        data, ext = _to_webp(r.content), "webp"
    except Exception:
        ext = url.rsplit(".", 1)[-1].split("?")[0].lower()
        if ext not in MIME_TYPES:
            raise
        data = r.content
    return await store_image(data, ext, url.rsplit("/", 1)[-1], admin_id)


async def _assert_safe_external_url(url: str) -> None:
    """Prevent the admin image importer from reaching local/private services."""
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("only public http(s) image URLs are allowed")
    if parsed.port not in {None, 80, 443}:
        raise ValueError("image URL must use port 80 or 443")
    try:
        addresses = [ipaddress.ip_address(parsed.hostname)]
    except ValueError:
        try:
            records = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: socket.getaddrinfo(
                    parsed.hostname,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                    type=socket.SOCK_STREAM,
                ),
            )
        except socket.gaierror as exc:
            raise ValueError("image host could not be resolved") from exc
        addresses = [ipaddress.ip_address(record[4][0]) for record in records]
    if not addresses or any(not address.is_global for address in addresses):
        raise ValueError("private or local image hosts are not allowed")


def _is_external(u: str) -> bool:
    return bool(u) and u.startswith("http") and not u.startswith(SITE_URL) and "/api/files/" not in u


async def run_image_migration(admin_id: str):
    prods = await db.products.find({"active": True}).sort("id", 1).to_list(5000)
    jobs = [(p, f) for p in prods for f in ("image", "image2") if _is_external(p.get(f, "")) and p.get(f) != (p.get("image") if f == "image2" else None)]
    _migration.update({"running": True, "total": len(jobs), "done": 0, "migrated": 0, "skipped": 0, "failed": [], "startedAt": now_utc().isoformat(), "finishedAt": None})
    cache: dict = {}
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            for p, field in jobs:
                url = p[field]
                try:
                    local = p.get(f"{field}Local")
                    if not local:
                        if url not in cache:
                            cache[url] = await _fetch_and_store(client, url, admin_id)
                        local = cache[url]
                    await db.products.update_one({"id": p["id"]}, {"$set": {field: local, f"{field}Original": url, f"{field}Local": local, "updatedAt": now_utc()}})
                    _migration["migrated"] += 1
                except Exception as e:
                    _migration["failed"].append({"id": p["id"], "name": p["name"], "field": field, "url": url, "error": str(e)[:160]})
                _migration["done"] += 1
        # products whose image2 duplicated image: mirror the new URL
        async for p in db.products.find({"active": True}):
            if p.get("image2") and p.get("image2") == p.get("imageOriginal") and p.get("image"):
                await db.products.update_one({"id": p["id"]}, {"$set": {"image2": p["image"], "image2Original": p["image2"]}})
    finally:
        _migration.update({"running": False, "finishedAt": now_utc().isoformat()})
        asyncio.create_task(refresh_static_sitemap())


@api_router.post("/admin/products/migrate-images")
async def admin_migrate_images(admin: dict = Depends(get_admin_user)):
    if _migration["running"]:
        raise HTTPException(status_code=409, detail="Migration already running")
    asyncio.create_task(run_image_migration(admin["id"]))
    return {"started": True}


@api_router.get("/admin/products/migrate-images/status")
async def admin_migrate_images_status(admin: dict = Depends(get_admin_user)):
    prods = await db.products.find({"active": True}, {"image": 1, "image2": 1, "imageOriginal": 1}).to_list(5000)
    external = sum(1 for p in prods for f in ("image", "image2") if _is_external(p.get(f, "")))
    migrated_products = sum(1 for p in prods if p.get("imageOriginal") and not _is_external(p.get("image", "")))
    return {**_migration, "externalRemaining": external, "products": len(prods), "migratedProducts": migrated_products}


@api_router.post("/admin/products/migrate-images/revert")
async def admin_migrate_images_revert(admin: dict = Depends(get_admin_user)):
    n = 0
    async for p in db.products.find({"imageOriginal": {"$exists": True}}):
        upd = {"image": p["imageOriginal"], "imageLocal": p.get("image", "")}
        if p.get("image2Original"):
            upd["image2"] = p["image2Original"]
            upd["image2Local"] = p.get("image2", "")
        await db.products.update_one({"id": p["id"]}, {"$set": upd, "$unset": {"imageOriginal": "", "image2Original": ""}})
        n += 1
    return {"reverted": n}


@api_router.get("/admin/orders")
async def admin_list_orders(admin: dict = Depends(get_admin_user)):
    orders = await db.orders.find({}).sort("createdAt", -1).to_list(1000)
    return {"orders": [order_response(o) for o in orders]}


def _as_datetime(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value.replace(tzinfo=value.tzinfo or timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc)
        except ValueError:
            return None
    return None


async def build_compliance_alerts() -> List[dict]:
    alerts = []
    orders = await db.orders.find({"paymentStatus": {"$ne": "refunded"}, "manualStatus": {"$nin": ["cancelled", "returned"]}}).sort("createdAt", -1).to_list(2000)
    for order in orders:
        status = order_response(order)["status"]
        if not order.get("ageVerifiedAt"):
            alerts.append({"id": f"age-{order['id']}", "severity": "critical", "kind": "missing_age_check", "orderId": order["id"], "orderNumber": order["orderNumber"], "message": "Checkout age verification record is missing."})
        if status == "out_for_delivery" and not (order.get("dispatch") or {}).get("driverName"):
            alerts.append({"id": f"driver-{order['id']}", "severity": "warning", "kind": "missing_driver", "orderId": order["id"], "orderNumber": order["orderNumber"], "message": "Order is out for delivery without a driver assignment."})
        if status == "delivered" and order.get("requiresIdAtDelivery", True) and (order.get("idCheck") or {}).get("status") != "passed":
            alerts.append({"id": f"id-{order['id']}", "severity": "critical", "kind": "missing_door_id_check", "orderId": order["id"], "orderNumber": order["orderNumber"], "message": "Delivered order is missing a successful door ID check."})
        if status == "returned" and order.get("paymentStatus") == "paid":
            alerts.append({"id": f"payment-{order['id']}", "severity": "warning", "kind": "failed_id_payment_review", "orderId": order["id"], "orderNumber": order["orderNumber"], "message": "Failed-ID return is complete; review the payment and refund decision in Orders."})
    products = await db.products.find({"active": True}, {"id": 1, "name": 1, "complianceCategory": 1, "minimumAge": 1, "requiresIdAtDelivery": 1}).to_list(5000)
    for product in products:
        missing = [field for field in ("complianceCategory", "minimumAge", "requiresIdAtDelivery") if field not in product]
        if missing:
            alerts.append({"id": f"product-{product['id']}", "severity": "warning", "kind": "product_rules_missing", "productId": product["id"], "message": f"{product.get('name', 'Product')} uses legacy defaults; review its compliance settings."})
    return alerts


@api_router.get("/admin/operations")
async def admin_operations(date: str = "", admin: dict = Depends(get_admin_user)):
    settings = await get_settings()
    try:
        selected = datetime.strptime(date, "%Y-%m-%d").date() if date else datetime.now(STORE_TZ).date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    rows = await db.orders.find({"deliveryDate": selected.isoformat()}).sort("deliveryWindow.start", 1).to_list(1000)
    window_data = await delivery_window_with_capacity(settings)
    windows = [w for w in window_data.get("availableWindows", []) if w.get("date") == selected.isoformat()]
    if not windows:
        ids = sorted({(o.get("deliveryWindow") or {}).get("id") for o in rows if (o.get("deliveryWindow") or {}).get("id")})
        for wid in ids:
            base = next(((o.get("deliveryWindow") or {}) for o in rows if (o.get("deliveryWindow") or {}).get("id") == wid), {"id": wid})
            windows.append({**base, **await window_capacity(wid, settings)})
    active = [o for o in rows if o.get("manualStatus") not in {"cancelled", "returned"}]
    return {
        "date": selected.isoformat(),
        "defaultEtaMinutes": int(settings.get("defaultEtaMinutes", 45)),
        "orders": [order_response(o) for o in rows],
        "windows": windows,
        "summary": {
            "total": len(rows),
            "active": len(active),
            "unassigned": sum(1 for o in active if not (o.get("dispatch") or {}).get("driverName")),
            "outForDelivery": sum(1 for o in rows if o.get("manualStatus") == "out_for_delivery"),
            "delivered": sum(1 for o in rows if o.get("manualStatus") == "delivered"),
            "failedId": sum(1 for o in rows if (o.get("idCheck") or {}).get("status") == "failed"),
        },
    }


@api_router.get("/admin/compliance")
async def admin_compliance(admin: dict = Depends(get_admin_user)):
    events = await db.compliance_events.find({}, {"_id": 0}).sort("createdAt", -1).to_list(500)
    for event in events:
        if isinstance(event.get("createdAt"), datetime):
            event["createdAt"] = event["createdAt"].isoformat()
    alerts = await build_compliance_alerts()
    return {
        "alerts": alerts,
        "events": events,
        "summary": {
            "openAlerts": len(alerts),
            "criticalAlerts": sum(1 for a in alerts if a["severity"] == "critical"),
            "passedIdChecks": await db.compliance_events.count_documents({"event": "door_id_check", "result": "passed"}),
            "failedIdChecks": await db.compliance_events.count_documents({"event": "door_id_check", "result": "failed"}),
            "storedIdImages": 0,
        },
        "privacy": {"storesFullIdImages": False, "policy": "Only the check result, ID type, checklist, driver name, and timestamp are retained."},
    }


@api_router.get("/admin/compliance/export.csv")
async def admin_compliance_export(admin: dict = Depends(get_admin_user)):
    events = await db.compliance_events.find({}).sort("createdAt", -1).to_list(10000)
    output = io.StringIO()
    writer = csv.writer(output)
    def safe(value):
        text = str(value or "")
        return "'" + text if text[:1] in {"=", "+", "-", "@"} else text
    writer.writerow(["timestamp", "order_number", "event", "result", "id_type", "checked_by", "failure_reason", "full_id_image_stored"])
    for event in events:
        created = event.get("createdAt")
        writer.writerow([
            created.isoformat() if isinstance(created, datetime) else created or "",
            safe(event.get("orderNumber", "")), safe(event.get("event", "")), safe(event.get("result", "")),
            safe(event.get("idType", "")), safe(event.get("checkedBy", "")), safe(event.get("failureReason", "")),
            "yes" if event.get("fullIdImageStored") else "no",
        ])
    return Response(content=output.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="puff2door-compliance-{datetime.now(STORE_TZ).date().isoformat()}.csv"'})


@api_router.get("/admin/analytics")
async def admin_analytics(days: int = 30, admin: dict = Depends(get_admin_user)):
    days = max(1, min(int(days), 365))
    now = now_utc()
    start = now - timedelta(days=days)
    orders = await db.orders.find({"createdAt": {"$gte": start}}).sort("createdAt", 1).to_list(10000)
    paid = [o for o in orders if o.get("paymentStatus", "paid") == "paid" and o.get("manualStatus") != "cancelled"]
    net_revenue = round(sum(float(o.get("total", 0)) - float(o.get("refundedAmount", 0)) for o in paid), 2)
    daily, payments, zips, statuses, products = {}, {}, {}, {}, {}
    delivered_minutes, on_time, delivered_count = [], 0, 0
    for order in orders:
        created = _as_datetime(order.get("createdAt"))
        day = created.astimezone(STORE_TZ).date().isoformat() if created else "unknown"
        row = daily.setdefault(day, {"date": day, "orders": 0, "revenue": 0.0})
        row["orders"] += 1
        if order in paid:
            row["revenue"] += float(order.get("total", 0)) - float(order.get("refundedAmount", 0))
        payments[order.get("paymentMethod", "unknown")] = payments.get(order.get("paymentMethod", "unknown"), 0) + 1
        zip_code = (order.get("shipping") or {}).get("zip", "Unknown")
        zips[zip_code] = zips.get(zip_code, 0) + 1
        status = order_response(order)["status"]
        statuses[status] = statuses.get(status, 0) + 1
        for item in order.get("items", []):
            key = str(item.get("productId") or item.get("name"))
            prod = products.setdefault(key, {"name": item.get("name", "Product"), "qty": 0, "revenue": 0.0})
            qty = int(item.get("qty", 1)); prod["qty"] += qty; prod["revenue"] += float(item.get("price", 0)) * qty
        delivered_at = _as_datetime((order.get("statusHistory") or {}).get("delivered"))
        if delivered_at and created:
            delivered_count += 1
            delivered_minutes.append(max(0, (delivered_at - created).total_seconds() / 60))
            win = order.get("deliveryWindow") or {}
            try:
                end_at = datetime.combine(date.fromisoformat(win["date"]), parse_cutoff(win["end"]), tzinfo=STORE_TZ)
                if delivered_at.astimezone(STORE_TZ) <= end_at:
                    on_time += 1
            except (KeyError, ValueError):
                pass
    unique_customers = {o.get("userId") or (o.get("shipping") or {}).get("email", "").lower() for o in paid}
    unique_customers.discard(""); unique_customers.discard(None)
    counts = {}
    for order in paid:
        customer = order.get("userId") or (order.get("shipping") or {}).get("email", "").lower()
        if customer: counts[customer] = counts.get(customer, 0) + 1
    return {
        "days": days,
        "summary": {
            "orders": len(orders), "paidOrders": len(paid), "netRevenue": net_revenue,
            "averageOrderValue": round(net_revenue / len(paid), 2) if paid else 0,
            "customers": len(unique_customers),
            "repeatRate": round(sum(1 for n in counts.values() if n > 1) / len(counts) * 100, 1) if counts else 0,
            "onTimeRate": round(on_time / delivered_count * 100, 1) if delivered_count else 0,
            "averageFulfillmentMinutes": round(sum(delivered_minutes) / len(delivered_minutes)) if delivered_minutes else 0,
            "failedIdChecks": sum(1 for o in orders if (o.get("idCheck") or {}).get("status") == "failed"),
            "tips": round(sum(float(o.get("tip", 0)) for o in paid), 2),
        },
        "daily": [{**v, "revenue": round(v["revenue"], 2)} for _, v in sorted(daily.items())],
        "paymentMethods": [{"name": k, "orders": v} for k, v in sorted(payments.items(), key=lambda item: item[1], reverse=True)],
        "statuses": [{"name": k, "orders": v} for k, v in sorted(statuses.items(), key=lambda item: item[1], reverse=True)],
        "topZips": [{"zip": k, "orders": v} for k, v in sorted(zips.items(), key=lambda item: item[1], reverse=True)[:10]],
        "topProducts": sorted(products.values(), key=lambda p: p["qty"], reverse=True)[:10],
    }


@api_router.put("/admin/orders/{order_id}/status")
async def admin_update_order_status(order_id: str, inp: OrderStatusInput, admin: dict = Depends(get_admin_user)):
    if inp.status not in STAGE_KEYS and inp.status not in {"cancelled", "id_check_failed", "returning_to_store", "returned"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    if inp.status == "delivered" and o.get("requiresIdAtDelivery", True) and (o.get("idCheck") or {}).get("status") != "passed":
        raise HTTPException(status_code=409, detail="Record a successful 21+ ID check before marking this order delivered.")
    changed_at = now_utc()
    updates = {"manualStatus": inp.status, "statusUpdatedAt": changed_at, "statusUpdatedBy": admin["id"]}
    if inp.status == "cancelled" and not o.get("stockReleased"):
        await release_stock(o["items"])
        updates["stockReleased"] = True
    if inp.status in STAGE_KEYS:
        updates[f"statusHistory.{inp.status}"] = changed_at
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    updated = await db.orders.find_one({"id": order_id})
    if inp.status == "cancelled":
        await loyalty_reverse_for_order(updated, None, admin)
    elif inp.status == "delivered":
        await loyalty_award_for_order(updated)
    if inp.status in STAGE_KEYS:
        asyncio.create_task(emails.send_status_update(updated, inp.status))
    return order_response(await db.orders.find_one({"id": order_id}))


@api_router.put("/admin/orders/{order_id}/dispatch")
async def admin_update_dispatch(order_id: str, inp: DispatchInput, admin: dict = Depends(get_admin_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    now = now_utc()
    eta_minutes = inp.etaMinutes
    dispatch = {
        "driverName": inp.driverName.strip(),
        "driverPhoneLast4": inp.driverPhoneLast4,
        "dispatchNotes": inp.dispatchNotes.strip(),
        "assignedAt": (order.get("dispatch") or {}).get("assignedAt") or now,
        "updatedAt": now,
        "updatedBy": admin["id"],
    }
    if eta_minutes is not None:
        dispatch["etaMinutes"] = eta_minutes
        dispatch["etaAt"] = now + timedelta(minutes=eta_minutes)
    await db.orders.update_one({"id": order_id}, {"$set": {"dispatch": dispatch}})
    return order_response(await db.orders.find_one({"id": order_id}))


@api_router.put("/admin/orders/{order_id}/id-check")
async def admin_record_id_check(order_id: str, inp: IdCheckInput, admin: dict = Depends(get_admin_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if inp.result == "passed":
        if not inp.idType.strip() or not all([inp.photoIdValid, inp.age21Confirmed, inp.nameMatchesOrder, inp.expirationValid]):
            raise HTTPException(status_code=400, detail="Confirm the photo, age, name, and expiration checks before passing the ID.")
    elif not inp.failureReason.strip():
        raise HTTPException(status_code=400, detail="Select or enter a failed-ID reason.")
    checked_at = now_utc()
    record = {
        "status": inp.result,
        "idType": inp.idType.strip(),
        "photoIdValid": inp.photoIdValid,
        "age21Confirmed": inp.age21Confirmed,
        "nameMatchesOrder": inp.nameMatchesOrder,
        "expirationValid": inp.expirationValid,
        "failureReason": inp.failureReason.strip(),
        "checkedBy": inp.checkedBy.strip() or (order.get("dispatch") or {}).get("driverName", "") or "Driver",
        "checkedAt": checked_at,
        "fullIdImageStored": False,
        "updatedBy": admin["id"],
    }
    updates = {"idCheck": record, "statusUpdatedAt": checked_at, "statusUpdatedBy": admin["id"]}
    if inp.result == "failed":
        updates.update({
            "manualStatus": "returning_to_store",
            "returnProcedure": {"status": "returning", "startedAt": checked_at, "reason": inp.failureReason.strip(), "inventoryDisposition": "pending", "paymentDisposition": "pending_admin_review"},
        })
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    await db.compliance_events.insert_one({
        "id": str(uuid.uuid4()), "orderId": order_id, "orderNumber": order["orderNumber"],
        "event": "door_id_check", "result": inp.result, "idType": inp.idType.strip(),
        "checks": {"photoIdValid": inp.photoIdValid, "age21Confirmed": inp.age21Confirmed, "nameMatchesOrder": inp.nameMatchesOrder, "expirationValid": inp.expirationValid},
        "failureReason": inp.failureReason.strip(), "checkedBy": record["checkedBy"],
        "fullIdImageStored": False, "createdAt": checked_at, "actorId": admin["id"],
    })
    return order_response(await db.orders.find_one({"id": order_id}))


@api_router.put("/admin/orders/{order_id}/return")
async def admin_complete_failed_id_return(order_id: str, inp: ReturnDispositionInput, admin: dict = Depends(get_admin_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if (order.get("idCheck") or {}).get("status") != "failed":
        raise HTTPException(status_code=409, detail="A failed ID check must be recorded before completing this return.")
    if (order.get("returnProcedure") or {}).get("completedAt"):
        return order_response(order)
    if inp.disposition == "restocked" and not order.get("stockReleased"):
        await release_stock(order["items"])
    now = now_utc()
    procedure = {
        **(order.get("returnProcedure") or {}), "status": "completed", "completedAt": now,
        "inventoryDisposition": inp.disposition, "notes": inp.notes.strip(), "completedBy": admin["id"],
    }
    await db.orders.update_one({"id": order_id}, {"$set": {
        "manualStatus": "returned", "statusUpdatedAt": now, "statusUpdatedBy": admin["id"],
        "returnProcedure": procedure, "stockReleased": inp.disposition == "restocked" or bool(order.get("stockReleased")),
    }})
    await db.compliance_events.insert_one({
        "id": str(uuid.uuid4()), "orderId": order_id, "orderNumber": order["orderNumber"],
        "event": "failed_id_return_completed", "result": inp.disposition, "notes": inp.notes.strip(),
        "createdAt": now, "actorId": admin["id"],
    })
    return order_response(await db.orders.find_one({"id": order_id}))


@api_router.put("/admin/orders/{order_id}/delivery-details")
async def admin_update_delivery_details(order_id: str, inp: DeliveryDetailsInput, admin: dict = Depends(get_admin_user)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    updates = {
        "deliveryPhotoUrl": inp.deliveryPhotoUrl,
        "driverTextSentAt": now_utc() if inp.driverTextSent else None,
        "deliveryDetailsUpdatedBy": admin["id"],
    }
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    return order_response(await db.orders.find_one({"id": order_id}))


@api_router.put("/admin/orders/{order_id}/payment")
async def admin_update_order_payment(order_id: str, inp: PaymentStatusInput, admin: dict = Depends(get_admin_user)):
    if inp.paymentStatus not in ("paid", "awaiting_payment", "refunded"):
        raise HTTPException(status_code=400, detail="Invalid payment status")
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    updates = {"paymentStatus": inp.paymentStatus, "paymentUpdatedAt": now_utc(), "paymentUpdatedBy": admin["id"]}
    if inp.paymentStatus == "paid" and o.get("paymentStatus") != "paid":
        updates["paidAt"] = now_utc()
        updates["manualStatus"] = "confirmed"
        updates["statusUpdatedAt"] = now_utc()
        updates["statusHistory.confirmed"] = updates["statusUpdatedAt"]
    if inp.paymentStatus == "refunded":
        if not o.get("stockReleased"):
            await release_stock(o["items"])
            updates["stockReleased"] = True
        updates["refundedAmount"] = round(o.get("subtotal", 0) - o.get("discount", 0) - o.get("rewardDiscount", 0), 2)
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    updated = await db.orders.find_one({"id": order_id})
    if "paidAt" in updates:
        await loyalty_award_for_order(updated)
        asyncio.create_task(emails.send_payment_received(updated, await loyalty_email_info(updated)))
    if inp.paymentStatus == "refunded":
        await loyalty_reverse_for_order(updated, None, admin)
    return order_response(await db.orders.find_one({"id": order_id}))


class RefundInput(BaseModel):
    amount: float = Field(gt=0)
    reason: str = ""


@api_router.post("/admin/orders/{order_id}/refund")
async def admin_partial_refund(order_id: str, inp: RefundInput, admin: dict = Depends(get_admin_user)):
    """Records a merchandise refund (partial or full) and reverses the matching loyalty points once."""
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.get("paymentStatus") != "paid":
        raise HTTPException(status_code=400, detail="Only paid orders can be refunded")
    max_refund = round(o.get("subtotal", 0) - o.get("discount", 0) - o.get("rewardDiscount", 0) - o.get("refundedAmount", 0), 2)
    amount = round(min(inp.amount, max_refund), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Nothing left to refund on this order")
    full = amount >= max_refund - 0.005
    sets = {"paymentStatus": "refunded"} if full else {}
    if full and not o.get("stockReleased"):
        await release_stock(o["items"])
        sets["stockReleased"] = True
    upd = {"$inc": {"refundedAmount": amount}, "$push": {"refunds": {"amount": amount, "reason": inp.reason, "adminId": admin["id"], "createdAt": now_utc()}}}
    if sets:
        upd["$set"] = sets
    await db.orders.update_one({"id": order_id}, upd)
    reversed_pts = await loyalty_reverse_for_order(o, None if full else amount, admin)
    return {**order_response(await db.orders.find_one({"id": order_id})), "pointsReversed": reversed_pts}


# ---- Admin: loyalty rewards ----
@api_router.get("/admin/loyalty/settings")
async def admin_loyalty_settings(admin: dict = Depends(get_admin_user)):
    return loyalty_rules(await get_settings())


@api_router.put("/admin/loyalty/settings")
async def admin_put_loyalty_settings(inp: LoyaltySettingsInput, admin: dict = Depends(get_admin_user)):
    global _settings_cache
    await db.site_settings.update_one({"key": "store"}, {"$set": {**inp.model_dump(), "updatedAt": now_utc(), "updatedBy": admin["id"]}}, upsert=True)
    _settings_cache = {}
    return loyalty_rules(await get_settings())


@api_router.get("/admin/loyalty/customers")
async def admin_loyalty_customers(q: str = "", admin: dict = Depends(get_admin_user)):
    """Customers with a loyalty balance (or matching a search), newest activity first."""
    settings = await get_settings()
    rules = loyalty_rules(settings)
    query = {}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query = {"$or": [{"email": rx}, {"firstName": rx}, {"lastName": rx}]}
    users = await db.users.find(query, {"_id": 0, "id": 1, "email": 1, "firstName": 1, "lastName": 1, "createdAt": 1}).to_list(2000)
    totals: dict = {}
    async for t in db.loyalty_transactions.find({}, {"userId": 1, "points": 1, "type": 1, "createdAt": 1}):
        row = totals.setdefault(t["userId"], {"available": 0, "lifetimeEarned": 0, "lastActivity": None})
        row["available"] += int(t["points"])
        if t["type"] == "earn":
            row["lifetimeEarned"] += int(t["points"])
        if row["lastActivity"] is None or t["createdAt"] > row["lastActivity"]:
            row["lastActivity"] = t["createdAt"]
    out = []
    for u in users:
        s = totals.get(u["id"], {"available": 0, "lifetimeEarned": 0, "lastActivity": None})
        if not q.strip() and u["id"] not in totals:
            continue
        avail = max(s["available"], 0)
        out.append({"id": u["id"], "email": u["email"], "name": f"{u.get('firstName', '')} {u.get('lastName', '')}".strip(), "available": avail, "availableValue": points_value(avail, rules), "lifetimeEarned": s["lifetimeEarned"],
                    "lastActivity": s["lastActivity"].isoformat() if isinstance(s["lastActivity"], datetime) else None})
    out.sort(key=lambda x: (x["lastActivity"] or "", x["available"]), reverse=True)
    return {"customers": out[:200], "rules": loyalty_public_rules(settings)}


@api_router.get("/admin/loyalty/customers/{user_id}")
async def admin_loyalty_customer(user_id: str, admin: dict = Depends(get_admin_user)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(status_code=404, detail="Customer not found")
    settings = await get_settings()
    summary = await loyalty_summary(user_id, settings)
    rows = await db.loyalty_transactions.find({"userId": user_id}).sort("createdAt", -1).to_list(1000)
    return {"customer": {"id": u["id"], "email": u["email"], "name": f"{u.get('firstName', '')} {u.get('lastName', '')}".strip()}, **summary, "history": [loyalty_tx_out(t) for t in rows]}


@api_router.post("/admin/loyalty/customers/{user_id}/adjust")
async def admin_loyalty_adjust(user_id: str, inp: LoyaltyAdjustInput, admin: dict = Depends(get_admin_user)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(status_code=404, detail="Customer not found")
    bal = await loyalty_balance(user_id)
    if inp.points < 0 and -inp.points > bal["available"]:
        raise HTTPException(status_code=400, detail=f"Customer only has {bal['available']} points available")
    row = await loyalty_add(user_id, "adjust", inp.points, f"adjust:{uuid.uuid4()}", f"Manual adjustment by {admin.get('email', 'admin')}", None, admin=admin, reason=inp.reason.strip())
    settings = await get_settings()
    return {**(await loyalty_summary(user_id, settings)), "transaction": loyalty_tx_out(row)}


@api_router.get("/admin/settings")
async def admin_get_settings(admin: dict = Depends(get_admin_user)):
    return await get_settings()


@api_router.put("/admin/settings")
async def admin_put_settings(inp: StoreSettingsInput, admin: dict = Depends(get_admin_user)):
    global _settings_cache
    data = inp.model_dump()
    await db.site_settings.update_one({"key": "store"}, {"$set": {**data, "updatedAt": now_utc(), "updatedBy": admin["id"]}}, upsert=True)
    _settings_cache = {}
    return await get_settings()


@api_router.get("/admin/promos")
async def admin_list_promos(admin: dict = Depends(get_admin_user)):
    promos = await db.promo_codes.find({}).sort("createdAt", -1).to_list(500)
    return {"promos": [promo_public(p) for p in promos]}


@api_router.post("/admin/promos")
async def admin_create_promo(inp: PromoInput, admin: dict = Depends(get_admin_user)):
    if await db.promo_codes.find_one({"code": inp.code}):
        raise HTTPException(status_code=409, detail="A promo with that code already exists")
    doc = {**inp.model_dump(), "id": str(uuid.uuid4()), "uses": 0, "createdAt": now_utc()}
    await db.promo_codes.insert_one(doc)
    return promo_public(doc)


@api_router.put("/admin/promos/{promo_id}")
async def admin_update_promo(promo_id: str, inp: PromoInput, admin: dict = Depends(get_admin_user)):
    existing = await db.promo_codes.find_one({"id": promo_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Promo not found")
    clash = await db.promo_codes.find_one({"code": inp.code, "id": {"$ne": promo_id}})
    if clash:
        raise HTTPException(status_code=409, detail="A promo with that code already exists")
    await db.promo_codes.update_one({"id": promo_id}, {"$set": {**inp.model_dump(), "updatedAt": now_utc()}})
    return promo_public(await db.promo_codes.find_one({"id": promo_id}))


@api_router.delete("/admin/promos/{promo_id}")
async def admin_delete_promo(promo_id: str, admin: dict = Depends(get_admin_user)):
    res = await db.promo_codes.delete_one({"id": promo_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Promo not found")
    return {"ok": True}


@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_admin_user)):
    orders = await db.orders.find({}, {"total": 1, "createdAt": 1, "manualStatus": 1, "items": 1, "userId": 1}).to_list(5000)
    revenue = round(sum(o.get("total", 0) for o in orders), 2)
    today = now_utc().date()
    today_orders = 0
    for o in orders:
        c = o.get("createdAt")
        if isinstance(c, str):
            c = datetime.fromisoformat(c)
        if c and c.date() == today:
            today_orders += 1
    products = await db.products.find({"active": True}, {"stock": 1, "name": 1, "id": 1, "slug": 1}).to_list(5000)
    low_stock = [{"id": p["id"], "name": p["name"], "stock": int(p.get("stock", 0))} for p in products if int(p.get("stock", 0)) <= 5]
    pending_alerts = await db.stock_alerts.count_documents({"notified": False})
    customer_orders = {}
    product_sales = {}
    for order in orders:
        if order.get("userId"):
            customer_orders[order["userId"]] = customer_orders.get(order["userId"], 0) + 1
        for item in order.get("items", []):
            key = str(item.get("productId") or item.get("id") or item.get("name"))
            row = product_sales.setdefault(key, {"name": item.get("name", "Product"), "qty": 0, "revenue": 0})
            row["qty"] += int(item.get("qty", 1))
            row["revenue"] += float(item.get("price", 0)) * int(item.get("qty", 1))
    identified = len(customer_orders)
    repeat = sum(1 for count in customer_orders.values() if count > 1)
    return {
        "totalOrders": len(orders),
        "todayOrders": today_orders,
        "revenue": revenue,
        "activeProducts": len(products),
        "lowStock": sorted(low_stock, key=lambda x: x["stock"]),
        "pendingAlerts": pending_alerts,
        "customers": await db.users.count_documents({}),
        "repeatPurchaseRate": round((repeat / identified * 100) if identified else 0, 1),
        "repeatCustomers": repeat,
        "bestSellers": sorted(product_sales.values(), key=lambda x: x["qty"], reverse=True)[:5],
    }


@api_router.get("/admin/emails")
async def admin_email_log(admin: dict = Depends(get_admin_user)):
    logs = await db.email_log.find({}, {"_id": 0}).sort("createdAt", -1).to_list(200)
    for l in logs:
        if isinstance(l.get("createdAt"), datetime):
            l["createdAt"] = l["createdAt"].isoformat()
    return {"emails": logs, "enabled": emails.EMAIL_ENABLED, "from": emails.EMAIL_FROM}


@api_router.get("/admin/stock-alerts")
async def admin_stock_alerts(admin: dict = Depends(get_admin_user)):
    alerts = await db.stock_alerts.find({}, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    for a in alerts:
        for k in ("createdAt", "notifiedAt"):
            if isinstance(a.get(k), datetime):
                a[k] = a[k].isoformat()
    return {"alerts": alerts}


# =====================================================================
# Live chat (customer ↔ admin). Conversations are readable only with the
# browser's secret token (or as admin). No public listing.
# =====================================================================
CHAT_DEFAULTS = {"chatEnabled": True, "chatOnline": True,
                 "chatWelcome": "Hi! Welcome to Puff2door. How can we help you today?",
                 "chatOffline": "We're currently offline. Leave us a message and we'll get back to you."}


def chat_settings(settings: dict) -> dict:
    return {k: settings.get(k, v) for k, v in CHAT_DEFAULTS.items()}


class ChatSettingsInput(BaseModel):
    chatEnabled: bool = True
    chatOnline: bool = True
    chatWelcome: str = Field(default=CHAT_DEFAULTS["chatWelcome"], max_length=500)
    chatOffline: str = Field(default=CHAT_DEFAULTS["chatOffline"], max_length=500)


class ChatStartInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    contact: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=1, max_length=2000)

    @field_validator("contact")
    @classmethod
    def _contact(cls, v):
        v = v.strip()
        digits = re.sub(r"\D", "", v)
        if "@" in v:
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
                raise ValueError("Enter a valid email address")
            return v.lower()
        if len(digits) < 10:
            raise ValueError("Enter a valid email or 10-digit phone number")
        return v


class ChatMessageInput(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


def chat_token_header(request: Request) -> str:
    return (request.headers.get("X-Chat-Token") or "").strip()


def chat_msg_out(m: dict) -> dict:
    c = m.get("createdAt")
    return {"id": m["id"], "sender": m["sender"], "text": m["text"], "createdAt": c.isoformat() if isinstance(c, datetime) else c}


def chat_conv_out(c: dict, admin: bool = False) -> dict:
    out = {"id": c["id"], "name": c.get("name", ""), "contact": c.get("contact", ""), "status": c.get("status", "open"),
           "createdAt": c["createdAt"].isoformat() if isinstance(c.get("createdAt"), datetime) else c.get("createdAt"),
           "lastMessageAt": c["lastMessageAt"].isoformat() if isinstance(c.get("lastMessageAt"), datetime) else c.get("lastMessageAt"),
           "lastMessage": c.get("lastMessage", ""), "lastSender": c.get("lastSender", ""), "offline": bool(c.get("offline"))}
    if admin:
        out.update({"userId": c.get("userId"), "unreadAdmin": int(c.get("unreadAdmin", 0)), "resolvedAt": c["resolvedAt"].isoformat() if isinstance(c.get("resolvedAt"), datetime) else c.get("resolvedAt"), "page": c.get("page", "")})
    else:
        out["unreadCustomer"] = int(c.get("unreadCustomer", 0))
    return out


async def chat_conv_for_token(request: Request) -> dict:
    token = chat_token_header(request)
    if not token or len(token) < 20:
        raise HTTPException(status_code=401, detail="Chat session missing")
    c = await db.chat_conversations.find_one({"token": token})
    if not c:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


async def chat_add_message(conv: dict, sender: str, text: str) -> dict:
    m = {"id": str(uuid.uuid4()), "conversationId": conv["id"], "sender": sender, "text": text.strip(), "createdAt": now_utc()}
    await db.chat_messages.insert_one(m)
    inc = {"unreadAdmin": 1} if sender == "customer" else {"unreadCustomer": 1}
    sets = {"lastMessageAt": m["createdAt"], "lastMessage": m["text"][:200], "lastSender": sender}
    if sender == "customer" and conv.get("status") == "resolved":
        sets["status"] = "open"
        sets["reopenedAt"] = m["createdAt"]
    await db.chat_conversations.update_one({"id": conv["id"]}, {"$set": sets, "$inc": inc})
    return m


@api_router.get("/chat/status")
async def chat_status():
    s = chat_settings(await get_settings())
    return {"enabled": s["chatEnabled"], "online": s["chatOnline"], "welcome": s["chatWelcome"], "offlineMessage": s["chatOffline"]}


@api_router.post("/chat/start")
async def chat_start(inp: ChatStartInput, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    await enforce_rate_limit(request, "chat-start", 10, 3600)
    s = chat_settings(await get_settings())
    if not s["chatEnabled"]:
        raise HTTPException(status_code=403, detail="Live chat is currently unavailable")
    token = secrets.token_urlsafe(32)
    conv = {"id": str(uuid.uuid4()), "token": token, "name": inp.name.strip(), "contact": inp.contact, "userId": user["id"] if user else None,
            "status": "open", "offline": not s["chatOnline"], "unreadAdmin": 0, "unreadCustomer": 0, "createdAt": now_utc(), "lastMessageAt": now_utc(),
            "page": (request.headers.get("referer") or "")[:200]}
    await db.chat_conversations.insert_one(conv)
    if s["chatWelcome"] and s["chatOnline"]:
        await db.chat_messages.insert_one({"id": str(uuid.uuid4()), "conversationId": conv["id"], "sender": "admin", "text": s["chatWelcome"], "createdAt": now_utc(), "system": True})
    m = await chat_add_message(conv, "customer", inp.message)
    asyncio.create_task(emails.notify_admin_chat(conv, m["text"], not s["chatOnline"]))
    fresh = await db.chat_conversations.find_one({"id": conv["id"]})
    msgs = await db.chat_messages.find({"conversationId": conv["id"]}).sort("createdAt", 1).to_list(500)
    return {"token": token, "conversation": chat_conv_out(fresh), "messages": [chat_msg_out(x) for x in msgs], "online": s["chatOnline"], "offlineMessage": s["chatOffline"]}


@api_router.get("/chat/conversation")
async def chat_get(request: Request, after: str = ""):
    conv = await chat_conv_for_token(request)
    q = {"conversationId": conv["id"]}
    if after:
        try:
            q["createdAt"] = {"$gt": datetime.fromisoformat(after)}
        except ValueError:
            pass
    msgs = await db.chat_messages.find(q).sort("createdAt", 1).to_list(500)
    if conv.get("unreadCustomer"):
        await db.chat_conversations.update_one({"id": conv["id"]}, {"$set": {"unreadCustomer": 0}})
        conv["unreadCustomer"] = 0
    s = chat_settings(await get_settings())
    return {"conversation": chat_conv_out(conv), "messages": [chat_msg_out(x) for x in msgs], "online": s["chatOnline"], "enabled": s["chatEnabled"], "offlineMessage": s["chatOffline"]}


@api_router.get("/chat/unread")
async def chat_unread(request: Request):
    conv = await chat_conv_for_token(request)
    return {"unread": int(conv.get("unreadCustomer", 0)), "status": conv.get("status", "open")}


@api_router.post("/chat/message")
async def chat_send(inp: ChatMessageInput, request: Request):
    await enforce_rate_limit(request, "chat-message", 60, 3600)
    conv = await chat_conv_for_token(request)
    s = chat_settings(await get_settings())
    if not s["chatEnabled"]:
        raise HTTPException(status_code=403, detail="Live chat is currently unavailable")
    m = await chat_add_message(conv, "customer", inp.message)
    if not s["chatOnline"]:
        asyncio.create_task(emails.notify_admin_chat(conv, m["text"], True))
    return chat_msg_out(m)


# ---- Admin: live chat ----
@api_router.get("/admin/chat/settings")
async def admin_chat_settings(admin: dict = Depends(get_admin_user)):
    return chat_settings(await get_settings())


@api_router.put("/admin/chat/settings")
async def admin_put_chat_settings(inp: ChatSettingsInput, admin: dict = Depends(get_admin_user)):
    global _settings_cache
    await db.site_settings.update_one({"key": "store"}, {"$set": {**inp.model_dump(), "updatedAt": now_utc(), "updatedBy": admin["id"]}}, upsert=True)
    _settings_cache = {}
    return chat_settings(await get_settings())


@api_router.get("/admin/chat/conversations")
async def admin_chat_list(status: str = "open", q: str = "", admin: dict = Depends(get_admin_user)):
    query: dict = {}
    if status in ("open", "resolved"):
        query["status"] = status
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"name": rx}, {"contact": rx}, {"lastMessage": rx}]
    rows = await db.chat_conversations.find(query).sort("lastMessageAt", -1).to_list(300)
    unread_total = 0
    async for c in db.chat_conversations.find({"status": "open", "unreadAdmin": {"$gt": 0}}, {"unreadAdmin": 1}):
        unread_total += int(c["unreadAdmin"])
    open_count = await db.chat_conversations.count_documents({"status": "open"})
    return {"conversations": [chat_conv_out(c, admin=True) for c in rows], "unreadTotal": unread_total, "openCount": open_count, "settings": chat_settings(await get_settings())}


@api_router.get("/admin/chat/conversations/{conv_id}")
async def admin_chat_get(conv_id: str, after: str = "", admin: dict = Depends(get_admin_user)):
    conv = await db.chat_conversations.find_one({"id": conv_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    q = {"conversationId": conv_id}
    if after:
        try:
            q["createdAt"] = {"$gt": datetime.fromisoformat(after)}
        except ValueError:
            pass
    msgs = await db.chat_messages.find(q).sort("createdAt", 1).to_list(1000)
    if conv.get("unreadAdmin"):
        await db.chat_conversations.update_one({"id": conv_id}, {"$set": {"unreadAdmin": 0}})
        conv["unreadAdmin"] = 0
    others = await db.chat_conversations.find({"id": {"$ne": conv_id}, "$or": [{"contact": conv.get("contact")}] + ([{"userId": conv["userId"]}] if conv.get("userId") else [])}).sort("lastMessageAt", -1).to_list(50)
    return {"conversation": chat_conv_out(conv, admin=True), "messages": [chat_msg_out(x) for x in msgs], "previous": [chat_conv_out(c, admin=True) for c in others]}


@api_router.post("/admin/chat/conversations/{conv_id}/reply")
async def admin_chat_reply(conv_id: str, inp: ChatMessageInput, admin: dict = Depends(get_admin_user)):
    conv = await db.chat_conversations.find_one({"id": conv_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    m = await chat_add_message(conv, "admin", inp.message)
    await db.chat_conversations.update_one({"id": conv_id}, {"$set": {"lastAdminId": admin["id"], "unreadAdmin": 0}})
    return chat_msg_out(m)


class ChatStatusInput(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        if v not in ("open", "resolved"):
            raise ValueError("status must be open or resolved")
        return v


@api_router.put("/admin/chat/conversations/{conv_id}/status")
async def admin_chat_status(conv_id: str, inp: ChatStatusInput, admin: dict = Depends(get_admin_user)):
    sets = {"status": inp.status, "statusUpdatedBy": admin["id"]}
    sets["resolvedAt" if inp.status == "resolved" else "reopenedAt"] = now_utc()
    if inp.status == "resolved":
        sets["unreadAdmin"] = 0
    res = await db.chat_conversations.update_one({"id": conv_id}, {"$set": sets})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return chat_conv_out(await db.chat_conversations.find_one({"id": conv_id}), admin=True)



app.include_router(api_router)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://www.paypal.com https://www.sandbox.paypal.com"
    if request.url.path.startswith(("/api/auth", "/api/admin", "/api/orders")):
        response.headers["Cache-Control"] = "no-store"
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").split(",")[0].strip() == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def configured_cors_origins() -> list[str]:
    origins = {"https://puff2door.com", "https://www.puff2door.com"}
    for raw in (os.environ.get("SITE_URL", ""), os.environ.get("PUBLIC_URL", ""), os.environ.get("CORS_ORIGINS", "")):
        for value in raw.split(","):
            value = value.strip().rstrip("/")
            if re.match(r"^https?://[^/]+$", value, re.I):
                origins.add(value)
    return sorted(origins)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=configured_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Chat-Token", "X-Order-Access"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def create_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id")
    await db.user_sessions.create_index("session_token")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.products.create_index("id", unique=True)
    await db.products.create_index("slug")
    await db.files.create_index("storage_path")
    await db.loyalty_transactions.create_index("key", unique=True)
    await db.loyalty_transactions.create_index([("userId", 1), ("createdAt", -1)])
    await db.loyalty_transactions.create_index("orderId")
    await db.chat_conversations.create_index("token", unique=True)
    await db.chat_conversations.create_index([("status", 1), ("lastMessageAt", -1)])
    await db.chat_messages.create_index([("conversationId", 1), ("createdAt", 1)])
    await db.orders.create_index("orderNumber", unique=True)
    await db.rate_limits.create_index("key", unique=True)
    await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    await db.revoked_tokens.create_index("jti", unique=True)
    await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)


@app.on_event("startup")
async def configure_emails():
    emails.configure(db, os.environ.get("PUBLIC_URL", ""))
    logger.info("Email %s (from %s)", "enabled" if emails.EMAIL_ENABLED else "disabled", emails.EMAIL_FROM or "-")


@app.on_event("startup")
async def seed_data():
    if await db.products.count_documents({}) == 0:
        seed_path = ROOT_DIR / "seed_products.json"
        if seed_path.exists():
            items = json.loads(seed_path.read_text())
            for it in items:
                it["createdAt"] = now_utc()
                it["updatedAt"] = now_utc()
            await db.products.insert_many(items)
            logger.info("Seeded %s products", len(items))
    if await db.site_settings.count_documents({"key": "store"}) == 0:
        seed_path = ROOT_DIR / "seed_settings.json"
        if seed_path.exists():
            settings = json.loads(seed_path.read_text())
            await db.site_settings.insert_one({"key": "store", **settings, "updatedAt": now_utc()})
    if await db.promo_codes.count_documents({}) == 0:
        await db.promo_codes.insert_one({"id": str(uuid.uuid4()), "code": "PUFF10", "type": "percent", "value": 10, "minSubtotal": 0, "maxUses": None, "expiresAt": None, "active": True, "uses": 0, "createdAt": now_utc()})
    await db.promo_codes.create_index("code", unique=True)
    admin_pw = os.environ.get("ADMIN_PASSWORD")
    if ADMIN_EMAILS and admin_pw:
        try:
            validate_password_strength(admin_pw)
        except ValueError as exc:
            raise RuntimeError(f"ADMIN_PASSWORD is not strong enough: {exc}") from exc
        for email in ADMIN_EMAILS:
            existing = await db.users.find_one({"email": email})
            if not existing:
                await db.users.insert_one({
                    "id": str(uuid.uuid4()), "email": email, "password": pwd_ctx.hash(admin_pw),
                    "firstName": "Admin", "lastName": "", "role": "admin", "provider": "password", "createdAt": now_utc(),
                })
            elif not existing.get("password"):
                await db.users.update_one({"email": email}, {"$set": {"password": pwd_ctx.hash(admin_pw), "role": "admin"}})
    if ADMIN_EMAILS:
        await db.users.update_many({"email": {"$in": ADMIN_EMAILS}}, {"$set": {"role": "admin"}})
    await seed_brands()
    await seed_categories()
    await refresh_static_sitemap()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# In portable deployments the React production build is served by this same
# FastAPI process. API routes are registered first, so this fallback only
# handles browser assets and client-side routes such as /shop and /admin.
FRONTEND_BUILD_DIR = ROOT_DIR.parent / "frontend" / "build"
if FRONTEND_BUILD_DIR.exists():
    # Some minimal Linux images do not register WebP, causing product images
    # to be served as text/plain. Register it explicitly for browser-safe MIME
    # headers when the portable build serves localized catalog assets.
    mimetypes.add_type("image/webp", ".webp")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        candidate = (FRONTEND_BUILD_DIR / full_path).resolve()
        try:
            candidate.relative_to(FRONTEND_BUILD_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found")
        if candidate.is_file():
            if full_path == ".well-known/apple-developer-merchantid-domain-association":
                return FileResponse(candidate, media_type="application/octet-stream", headers={"Cache-Control": "public, max-age=3600"})
            return FileResponse(candidate)
        return FileResponse(FRONTEND_BUILD_DIR / "index.html")

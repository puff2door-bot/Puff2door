from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from dotenv import load_dotenv
import httpx
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional
import uuid
import random
import re
import json
import secrets
from datetime import datetime, timedelta, timezone
import jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 1
JWT_REMEMBER_DAYS = 30
RESET_TOKEN_MINUTES = 60
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
    password: str
    firstName: str = ""
    lastName: str = ""
    address: str = ""
    state: str = ""
    city: str = ""
    zip: str = ""
    phone: str = ""

    @field_validator("password")
    @classmethod
    def _strong(cls, v):
        return validate_password_strength(v)


class LoginInput(BaseModel):
    email: EmailStr
    password: str
    rememberMe: bool = False


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def _strong(cls, v):
        return validate_password_strength(v)


class CartItem(BaseModel):
    productId: int
    name: str
    price: float
    image: str = ""
    category: str = ""
    categorySlug: str = ""
    slug: str = ""
    qty: int = 1


class CartInput(BaseModel):
    items: List[CartItem] = []


class ReviewInput(BaseModel):
    productSlug: str
    name: str
    rating: int = Field(ge=1, le=5)
    comment: str = ""


class ShippingInfo(BaseModel):
    firstName: str = ""
    lastName: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    zip: str = ""


class OrderInput(BaseModel):
    items: List[CartItem]
    shipping: ShippingInfo
    subtotal: float
    shippingCost: float = 0
    discount: float = 0
    total: float
    paymentLast4: str = ""


class GoogleSessionInput(BaseModel):
    session_id: str


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


class OrderStatusInput(BaseModel):
    status: str


ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "puff2door"
MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}
storage_key = None


async def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY})
    r.raise_for_status()
    storage_key = r.json()["storage_key"]
    return storage_key


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = await init_storage()
    async with httpx.AsyncClient(timeout=120) as http:
        r = await http.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
        if r.status_code == 404:
            key = await init_storage(force=True)
            r = await http.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
    r.raise_for_status()
    return r.json()


async def get_object(path: str):
    key = await init_storage()
    async with httpx.AsyncClient(timeout=60) as http:
        r = await http.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="File not found")
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


def is_admin(user: Optional[dict]) -> bool:
    return bool(user) and (user.get("role") == "admin" or user.get("email", "").lower() in ADMIN_EMAILS)


def slugify(name: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))[:60]


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
        "brand": p.get("brand", ""),
        "brandName": p.get("brandName", ""),
        "flavors": p.get("flavors", []),
        "puffs": p.get("puffs"),
        "rating": p.get("rating", 4.5),
        "stock": stock,
        "inStock": stock > 0,
        "active": p.get("active", True),
        "description": p.get("description", ""),
    }


# ----------------------------- Auth helpers -----------------------------
def create_token(user_id: str, remember: bool = False) -> str:
    days = JWT_REMEMBER_DAYS if remember else JWT_EXP_DAYS
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(days=days),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


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
    cookie_tok = request.cookies.get("session_token")
    if cookie_tok:
        return cookie_tok
    auth = request.headers.get("authorization") or ""
    if auth.startswith("Bearer "):
        return auth.split(" ", 1)[1]
    return None


async def user_from_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return await db.users.find_one({"id": payload.get("sub")})
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
    ("confirmed", "Order Confirmed", 30),
    ("out_for_delivery", "Out for Delivery", 90),
    ("delivered", "Delivered", 180),
]


STAGE_KEYS = [s[0] for s in TRACK_STAGES]


def build_tracking(created_at: datetime, manual_status: Optional[str] = None, status_updated_at: Optional[datetime] = None):
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    elapsed = (now_utc() - created_at).total_seconds()
    timeline = []
    current = "placed"
    manual_idx = STAGE_KEYS.index(manual_status) if manual_status in STAGE_KEYS else None
    for idx, (key, label, offset) in enumerate(TRACK_STAGES):
        done = idx <= manual_idx if manual_idx is not None else elapsed >= offset
        if done:
            current = key
        at = created_at + timedelta(seconds=offset)
        if manual_idx is not None and idx == manual_idx and status_updated_at:
            at = status_updated_at if status_updated_at.tzinfo else status_updated_at.replace(tzinfo=timezone.utc)
        timeline.append({
            "key": key,
            "label": label,
            "at": at.isoformat() if done else None,
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
    status, timeline = build_tracking(created_dt, o.get("manualStatus"), o.get("statusUpdatedAt"))
    return {
        "id": o["id"],
        "orderNumber": o["orderNumber"],
        "userId": o.get("userId"),
        "items": o["items"],
        "shipping": o["shipping"],
        "subtotal": o["subtotal"],
        "shippingCost": o.get("shippingCost", 0),
        "discount": o.get("discount", 0),
        "total": o["total"],
        "paymentLast4": o.get("paymentLast4", ""),
        "createdAt": created_dt.isoformat() if not isinstance(created, str) else created,
        "status": status,
        "manualStatus": o.get("manualStatus"),
        "timeline": timeline,
    }


# ----------------------------- Routes -----------------------------
@api_router.get("/")
async def root():
    return {"message": "Puff2Door API"}


@api_router.post("/auth/register")
async def register(inp: RegisterInput):
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
    token = create_token(user["id"])
    return {"token": token, "user": public_user(user)}


@api_router.post("/auth/login")
async def login(inp: LoginInput):
    email = inp.email.lower()
    identifier = email
    await check_lockout(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password") or not pwd_ctx.verify(inp.password, user["password"]):
        await record_failed_login(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    token = create_token(user["id"], remember=inp.rememberMe)
    return {"token": token, "user": public_user(user)}


@api_router.post("/auth/forgot-password")
async def forgot_password(inp: ForgotPasswordInput):
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
    logger.info("Password reset link for %s: /my-account?reset_token=%s", email, token)
    # No email provider connected: the reset token is returned so the UI can show the link in-app.
    return {**generic, "resetToken": token, "expiresInMinutes": RESET_TOKEN_MINUTES}


@api_router.post("/auth/reset-password")
async def reset_password(inp: ResetPasswordInput):
    rec = await db.password_reset_tokens.find_one({"token": inp.token})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has already been used")
    expires_at = rec["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=400, detail="This reset link has expired")
    await db.users.update_one({"id": rec["userId"]}, {"$set": {"password": pwd_ctx.hash(inp.password)}})
    await db.password_reset_tokens.update_one({"token": inp.token}, {"$set": {"used": True, "usedAt": now_utc()}})
    user = await db.users.find_one({"id": rec["userId"]})
    await db.login_attempts.delete_one({"identifier": user["email"]})
    return {"ok": True, "token": create_token(user["id"]), "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": public_user(user)}


EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7


@api_router.post("/auth/google/session")
async def google_session(inp: GoogleSessionInput, response: Response):
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": inp.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google account has no email")
    name = (data.get("name") or "").strip()
    first, _, last = name.partition(" ")
    user = await db.users.find_one({"email": email})
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
    else:
        updates = {"picture": data.get("picture", "")}
        if not user.get("firstName"):
            updates["firstName"] = first
            updates["lastName"] = last
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        user.update(updates)
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "userId": user["id"],
        "session_token": session_token,
        "expires_at": now_utc() + timedelta(days=SESSION_DAYS),
        "createdAt": now_utc(),
    })
    response.set_cookie(
        "session_token", session_token, httponly=True, secure=True, samesite="none",
        path="/", max_age=SESSION_DAYS * 24 * 3600,
    )
    return {"token": session_token, "user": public_user(user)}


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = extract_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", secure=True, samesite="none")
    return {"ok": True}


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
async def create_stock_alert(inp: StockAlertInput, user: Optional[dict] = Depends(get_optional_user)):
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
async def create_review(inp: ReviewInput):
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
@api_router.post("/orders")
async def create_order(inp: OrderInput, user: Optional[dict] = Depends(get_optional_user)):
    if not inp.items:
        raise HTTPException(status_code=400, detail="Your cart is empty")
    # Validate availability and server-side pricing
    problems = []
    priced_items = []
    for it in inp.items:
        prod = await db.products.find_one({"id": it.productId})
        if not prod or not prod.get("active", True):
            problems.append(f"{it.name} is no longer available")
            continue
        if int(prod.get("stock", 0)) < it.qty:
            left = int(prod.get("stock", 0))
            problems.append(f"Only {left} left of {it.name}" if left else f"{it.name} is sold out")
            continue
        base = prod["price"]
        sale = prod.get("salePrice")
        floor = min(base, sale) if sale else base
        if prod.get("categorySlug") == "disposable":
            floor = min(floor, round(base * 0.8, 2))
        price = it.price if it.price >= floor - 0.005 else floor
        priced_items.append({**it.dict(), "name": prod["name"], "price": round(price, 2), "image": prod.get("image", ""), "slug": prod["slug"]})
    if problems:
        raise HTTPException(status_code=409, detail="; ".join(problems))
    # Atomic stock reservation with rollback
    reserved = []
    for it in priced_items:
        res = await db.products.update_one({"id": it["productId"], "stock": {"$gte": it["qty"]}}, {"$inc": {"stock": -it["qty"]}})
        if res.modified_count == 0:
            for r in reserved:
                await db.products.update_one({"id": r["productId"]}, {"$inc": {"stock": r["qty"]}})
            raise HTTPException(status_code=409, detail=f"{it['name']} just sold out")
        reserved.append(it)
    subtotal = round(sum(i["price"] * i["qty"] for i in priced_items), 2)
    shipping_cost = 0 if subtotal >= 75 else 7.99
    total = round(subtotal + shipping_cost, 2)
    order_number = "P2D-" + "".join(random.choices("0123456789", k=8))
    order = {
        "id": str(uuid.uuid4()),
        "orderNumber": order_number,
        "userId": user["id"] if user else None,
        "items": priced_items,
        "shipping": inp.shipping.dict(),
        "subtotal": subtotal,
        "shippingCost": shipping_cost,
        "discount": 0,
        "total": total,
        "paymentLast4": inp.paymentLast4,
        "createdAt": now_utc(),
    }
    await db.orders.insert_one(order)
    if user:
        await db.carts.update_one({"userId": user["id"]}, {"$set": {"items": []}}, upsert=True)
    return order_response(order)


@api_router.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"userId": user["id"]}).sort("createdAt", -1).to_list(200)
    return {"orders": [order_response(o) for o in orders]}


@api_router.get("/orders/track/{order_number}")
async def track_order(order_number: str):
    o = await db.orders.find_one({"orderNumber": order_number.strip().upper()})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_response(o)


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_response(o)


# ---- Products (public) ----
@api_router.get("/products")
async def list_products():
    prods = await db.products.find({"active": True}).sort("id", 1).to_list(2000)
    return {"products": [product_out(p) for p in prods]}


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
    data, content_type = await get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type), headers={"Cache-Control": "public, max-age=86400"})


# ---- Admin ----
async def get_admin_user(user: dict = Depends(get_current_user)):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def next_product_id() -> int:
    last = await db.products.find_one(sort=[("id", -1)])
    return (last["id"] + 1) if last else 1


@api_router.get("/admin/products")
async def admin_list_products(admin: dict = Depends(get_admin_user)):
    prods = await db.products.find({}).sort("id", 1).to_list(5000)
    return {"products": [product_out(p) for p in prods]}


@api_router.post("/admin/products")
async def admin_create_product(inp: ProductInput, admin: dict = Depends(get_admin_user)):
    pid = await next_product_id()
    doc = inp.dict()
    doc.update({
        "id": pid,
        "slug": f"{slugify(inp.name)}-{pid}",
        "image2": inp.image2 or inp.image,
        "brandName": inp.brandName or inp.name.split(" ")[0],
        "rating": 4.5,
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    })
    await db.products.insert_one(doc)
    return product_out(doc)


@api_router.put("/admin/products/{product_id}")
async def admin_update_product(product_id: int, inp: ProductInput, admin: dict = Depends(get_admin_user)):
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    doc = inp.dict()
    doc["image2"] = inp.image2 or inp.image
    doc["brandName"] = inp.brandName or inp.name.split(" ")[0]
    doc["updatedAt"] = now_utc()
    await db.products.update_one({"id": product_id}, {"$set": doc})
    restocked = int(existing.get("stock", 0)) == 0 and inp.stock > 0
    notified = 0
    if restocked:
        # MOCKED email: no provider connected, alerts are marked as notified and logged.
        res = await db.stock_alerts.update_many(
            {"productId": product_id, "notified": False},
            {"$set": {"notified": True, "notifiedAt": now_utc()}},
        )
        notified = res.modified_count
        logger.info("Restock: notified %s subscriber(s) for product %s", notified, product_id)
    updated = await db.products.find_one({"id": product_id})
    return {**product_out(updated), "restockNotified": notified}


@api_router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: int, admin: dict = Depends(get_admin_user)):
    res = await db.products.update_one({"id": product_id}, {"$set": {"active": False, "updatedAt": now_utc()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


@api_router.post("/admin/upload")
async def admin_upload(file: UploadFile = File(...), admin: dict = Depends(get_admin_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin").lower()
    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only jpg, png, webp or gif images are allowed")
    data = await file.read()
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 6MB")
    path = f"{APP_NAME}/products/{uuid.uuid4()}.{ext}"
    try:
        result = await put_object(path, data, MIME_TYPES[ext])
    except Exception as e:
        logger.error("Upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Image storage is unavailable right now")
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": MIME_TYPES[ext],
        "size": result.get("size", len(data)),
        "uploadedBy": admin["id"],
        "is_deleted": False,
        "created_at": now_utc(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}


@api_router.get("/admin/orders")
async def admin_list_orders(admin: dict = Depends(get_admin_user)):
    orders = await db.orders.find({}).sort("createdAt", -1).to_list(1000)
    return {"orders": [order_response(o) for o in orders]}


@api_router.put("/admin/orders/{order_id}/status")
async def admin_update_order_status(order_id: str, inp: OrderStatusInput, admin: dict = Depends(get_admin_user)):
    if inp.status not in STAGE_KEYS:
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"manualStatus": inp.status, "statusUpdatedAt": now_utc(), "statusUpdatedBy": admin["id"]}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_response(await db.orders.find_one({"id": order_id}))


@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_admin_user)):
    orders = await db.orders.find({}, {"total": 1, "createdAt": 1, "manualStatus": 1, "items": 1}).to_list(5000)
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
    return {
        "totalOrders": len(orders),
        "todayOrders": today_orders,
        "revenue": revenue,
        "activeProducts": len(products),
        "lowStock": sorted(low_stock, key=lambda x: x["stock"]),
        "pendingAlerts": pending_alerts,
        "customers": await db.users.count_documents({}),
    }


@api_router.get("/admin/stock-alerts")
async def admin_stock_alerts(admin: dict = Depends(get_admin_user)):
    alerts = await db.stock_alerts.find({}, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    for a in alerts:
        for k in ("createdAt", "notifiedAt"):
            if isinstance(a.get(k), datetime):
                a[k] = a[k].isoformat()
    return {"alerts": alerts}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
    admin_pw = os.environ.get("ADMIN_PASSWORD")
    if ADMIN_EMAILS and admin_pw:
        email = ADMIN_EMAILS[0]
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "email": email, "password": pwd_ctx.hash(admin_pw),
                "firstName": "Admin", "lastName": "", "role": "admin", "provider": "password", "createdAt": now_utc(),
            })
        elif not existing.get("password") or not pwd_ctx.verify(admin_pw, existing["password"]):
            await db.users.update_one({"email": email}, {"$set": {"password": pwd_ctx.hash(admin_pw), "role": "admin"}})
    if ADMIN_EMAILS:
        await db.users.update_many({"email": {"$in": ADMIN_EMAILS}}, {"$set": {"role": "admin"}})
    try:
        await init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error("Storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

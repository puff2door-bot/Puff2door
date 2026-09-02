from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
import random
from datetime import datetime, timedelta, timezone
import jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'puff2door-secret-key-change-me')
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 7

pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_utc():
    return datetime.now(timezone.utc)


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


class LoginInput(BaseModel):
    email: EmailStr
    password: str


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


# ----------------------------- Auth helpers -----------------------------
def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(days=JWT_EXP_DAYS),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


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
    }


async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload.get("sub")})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_optional_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        token = authorization.split(" ", 1)[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return await db.users.find_one({"id": payload.get("sub")})
    except Exception:
        return None


# ----------------------------- Tracking logic -----------------------------
TRACK_STAGES = [
    ("placed", "Order Placed", 0),
    ("confirmed", "Order Confirmed", 30),
    ("out_for_delivery", "Out for Delivery", 90),
    ("delivered", "Delivered", 180),
]


def build_tracking(created_at: datetime):
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    elapsed = (now_utc() - created_at).total_seconds()
    timeline = []
    current = "placed"
    for key, label, offset in TRACK_STAGES:
        done = elapsed >= offset
        if done:
            current = key
        timeline.append({
            "key": key,
            "label": label,
            "at": (created_at + timedelta(seconds=offset)).isoformat(),
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
    status, timeline = build_tracking(created_dt)
    return {
        "id": o["id"],
        "orderNumber": o["orderNumber"],
        "items": o["items"],
        "shipping": o["shipping"],
        "subtotal": o["subtotal"],
        "shippingCost": o.get("shippingCost", 0),
        "discount": o.get("discount", 0),
        "total": o["total"],
        "paymentLast4": o.get("paymentLast4", ""),
        "createdAt": created_dt.isoformat() if not isinstance(created, str) else created,
        "status": status,
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
    user = await db.users.find_one({"email": inp.email.lower()})
    if not user or not pwd_ctx.verify(inp.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"])
    return {"token": token, "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": public_user(user)}


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
    order_number = "P2D-" + "".join(random.choices("0123456789", k=8))
    order = {
        "id": str(uuid.uuid4()),
        "orderNumber": order_number,
        "userId": user["id"] if user else None,
        "items": [i.dict() for i in inp.items],
        "shipping": inp.shipping.dict(),
        "subtotal": inp.subtotal,
        "shippingCost": inp.shippingCost,
        "discount": inp.discount,
        "total": inp.total,
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

"""Things the agents now do on their own (free, no paid services).

Every action is written to `automation_log` so the owner can see what was done, and
each automation can be paused from the Agents page (`automation_settings`).

  instagram_renew   keep the Instagram connection from expiring
  clover_retry      retry Clover stock/product updates that failed
  age_fix           put THC, kratom and nicotine products back to 21+ with ID at delivery
  descriptions      write and publish claim-free descriptions for products that have none
  stuck_orders      push + email the owner when a website order is stuck
  review_request    one email asking for a Google review a day after an order is completed
  cart_reminder     one reminder email for a signed-in cart left for 24 hours
  chat_reply        answer common Live Chat questions when nobody replies within 3 minutes
  weekly_reorder    Monday email: what to reorder, grouped by brand
  google_reviews    reply to new Google reviews (see google_reviews.py)
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import re
import uuid
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Any, Awaitable, Callable, Optional
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
STORE_PHONE = "(407) 625-6826"

AUTOMATIONS = [
    ("instagram_renew", "Renew the Instagram connection before it expires"),
    ("clover_retry", "Retry Clover updates that failed"),
    ("age_fix", "Keep THC, kratom and nicotine products at 21+ with ID at delivery"),
    ("descriptions", "Write and publish descriptions for new products"),
    ("stuck_orders", "Phone + email alert when a website order is stuck"),
    ("review_request", "Ask customers for a Google review a day after their order"),
    ("cart_reminder", "Remind signed-in customers about a cart left for 24 hours"),
    ("chat_reply", "Answer Live Chat questions instantly (stays quiet while you are chatting)"),
    ("weekly_reorder", "Monday reorder list by brand (email)"),
    ("google_reviews", "Reply to new Google reviews"),
]
AUTOMATION_IDS = {a for a, _ in AUTOMATIONS}
MARKETING_EMAILS_PER_DAY = 40  # leaves room under the free email plan for order emails
AGE_CATEGORIES = {"delta", "delta-cartridges", "delta-edibles", "delta-smokeables", "kratom",
                  "disposable", "e-liquids", "cigars", "hemp-wraps"}


class Hooks:
    """What the automations may use. Built by server.py."""

    def __init__(self, db, public_url: str, secret: str, get_settings: Callable[[], Awaitable[dict]],
                 clover_factory: Callable[[], Any], instagram_factory: Callable[[], Any],
                 push_admins: Callable[[dict], Awaitable[None]], after_products_changed: Callable[[], Awaitable[None]],
                 claim_words: re.Pattern, google_factory: Optional[Callable[[], Any]] = None):
        self.db = db
        self.public_url = public_url.rstrip("/")
        self.secret = secret
        self.get_settings = get_settings
        self.clover_factory = clover_factory
        self.instagram_factory = instagram_factory
        self.push_admins = push_admins
        self.after_products_changed = after_products_changed
        self.claim_words = claim_words
        self.google_factory = google_factory


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            v = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


async def log(db, kind: str, text: str, **detail) -> None:
    await db.automation_log.insert_one({"kind": kind, "text": text[:500], "detail": detail, "at": _now()})


async def enabled(db, kind: str) -> bool:
    doc = await db.automation_settings.find_one({"key": "automations"}) or {}
    return (doc.get("paused") or {}).get(kind) is not True


async def settings_view(db) -> list[dict]:
    doc = await db.automation_settings.find_one({"key": "automations"}) or {}
    paused = doc.get("paused") or {}
    return [{"id": k, "label": label, "on": paused.get(k) is not True} for k, label in AUTOMATIONS]


async def set_enabled(db, kind: str, on: bool) -> None:
    await db.automation_settings.update_one({"key": "automations"}, {"$set": {f"paused.{kind}": not on}}, upsert=True)


async def _due(db, key: str, every: timedelta) -> bool:
    st = await db.agent_state.find_one({"key": f"auto:{key}"}) or {}
    last = _aware(st.get("lastRunAt"))
    return not last or _now() - last >= every


async def _mark(db, key: str) -> None:
    await db.agent_state.update_one({"key": f"auto:{key}"}, {"$set": {"key": f"auto:{key}", "lastRunAt": _now()}}, upsert=True)


# ---------------- email opt-out (for review requests and cart reminders) ----------------
def unsubscribe_token(secret: str, email: str) -> str:
    return hmac.new(secret.encode(), email.lower().strip().encode(), hashlib.sha256).hexdigest()[:32]


def unsubscribe_link(h: Hooks, email: str) -> str:
    from urllib.parse import quote
    return f"{h.public_url}/api/email/unsubscribe?e={quote(email.lower().strip())}&t={unsubscribe_token(h.secret, email)}"


async def opted_out(db, email: str) -> bool:
    return bool(await db.email_optouts.find_one({"email": email.lower().strip()}, {"_id": 1}))


async def _marketing_budget_left(db) -> int:
    start = datetime.now(ET).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    sent = await db.email_log.count_documents({"kind": {"$in": ["review_request", "cart_reminder"]}, "createdAt": {"$gte": start}})
    return max(0, MARKETING_EMAILS_PER_DAY - sent)


def _footer(h: Hooks, email: str) -> str:
    return (f'<p style="font-size:12px;color:#9ca3af;margin-top:28px;">You got this because you ordered or shopped at puff2door.com. '
            f'<a href="{escape(unsubscribe_link(h, email))}" style="color:#9ca3af;">Don\'t send me these emails</a>.</p>')


# ---------------- 1. Instagram ----------------
async def instagram_renew(h: Hooks) -> None:
    try:
        result = await h.instagram_factory().renew_token()
    except Exception as exc:
        await log(h.db, "instagram_renew", f"Could not renew the Instagram connection: {exc}", ok=False)
        return
    if result.get("status") == "renewed":
        exp = _aware(result.get("expiresAt"))
        await log(h.db, "instagram_renew", f"Renewed the Instagram connection (good until {exp.astimezone(ET):%b %d})." if exp else "Renewed the Instagram connection.")


# ---------------- 2. Clover retries ----------------
async def clover_retry(h: Hooks) -> None:
    # Order stock changes are already retried by every Clover sync; this covers product updates.
    clover = h.clover_factory()
    stuck = await h.db.products.find({"cloverSyncError": {"$exists": True, "$ne": ""}, "cloverAutoRetries": {"$not": {"$gte": 5}}},
                                     {"_id": 0, "id": 1, "name": 1}).to_list(20)
    for p in stuck:
        try:
            result = await clover.sync_product_details(p["id"], source="auto_retry")
            ok = result.get("status") == "success"
        except Exception:
            ok = False
        if ok:
            await h.db.products.update_one({"id": p["id"]}, {"$unset": {"cloverAutoRetries": "", "cloverSyncError": ""}})
            await log(h.db, "clover_retry", f"Clover update for “{p['name']}” went through on retry.")
        else:
            await h.db.products.update_one({"id": p["id"]}, {"$inc": {"cloverAutoRetries": 1}})


# ---------------- 3. Age / ID ----------------
async def age_fix(h: Hooks) -> None:
    rows = await h.db.products.find(
        {"categorySlug": {"$in": list(AGE_CATEGORIES)},
         "$or": [{"minimumAge": {"$lt": 21}}, {"requiresIdAtDelivery": False}]},
        {"_id": 0, "id": 1, "name": 1, "minimumAge": 1, "requiresIdAtDelivery": 1},
    ).to_list(500)
    for p in rows:
        await h.db.products.update_one({"id": p["id"]}, {"$set": {"minimumAge": 21, "requiresIdAtDelivery": True, "updatedAt": _now()}})
        await log(h.db, "age_fix", f"Set “{p['name']}” back to 21+ with ID at delivery.", productId=p["id"])


# ---------------- 4. Descriptions ----------------
async def descriptions(h: Hooks) -> None:
    import descriptions as desc
    await desc.generate(h.db, h.claim_words)
    pending = await h.db.description_drafts.find({"status": "pending"}).to_list(1000)
    done = 0
    for d in pending:
        text = str(d.get("text") or "").strip()
        product = await h.db.products.find_one({"id": d["productId"]}, {"_id": 0, "description": 1, "name": 1})
        if not product or h.claim_words.search(text) or h.claim_words.search(product.get("name") or ""):
            await h.db.description_drafts.update_one({"_id": d["_id"]}, {"$set": {"status": "skipped", "decidedAt": _now(), "decidedBy": "auto"}})
            continue
        if len(str(product.get("description") or "").strip()) >= 40:  # someone wrote one meanwhile
            await h.db.description_drafts.update_one({"_id": d["_id"]}, {"$set": {"status": "skipped", "decidedAt": _now(), "decidedBy": "auto"}})
            continue
        await h.db.products.update_one({"id": d["productId"]}, {"$set": {"description": text, "updatedAt": _now()}})
        await h.db.description_drafts.update_one({"_id": d["_id"]}, {"$set": {"status": "approved", "decidedAt": _now(), "decidedBy": "auto"}})
        done += 1
    if done:
        await log(h.db, "descriptions", f"Published descriptions for {done} product(s).")
        await h.after_products_changed()


# ---------------- 5. Stuck orders ----------------
async def stuck_orders(h: Hooks) -> None:
    import emails
    recent = await h.db.orders.find(
        {"createdAt": {"$gte": _now() - timedelta(days=3)}},
        {"_id": 0, "id": 1, "orderNumber": 1, "createdAt": 1, "manualStatus": 1, "paymentStatus": 1, "fulfillment": 1,
         "statusHistory": 1, "stuckAlertFor": 1, "total": 1},
    ).to_list(500)
    for o in recent:
        status_now = o.get("manualStatus") or "placed"
        if status_now in ("delivered", "cancelled", "returned") or o.get("paymentStatus") in ("awaiting_payment", "refunded"):
            continue
        since = _aware((o.get("statusHistory") or {}).get(status_now)) or _aware(o.get("createdAt"))
        if not since:
            continue
        hours = (_now() - since).total_seconds() / 3600
        pickup = o.get("fulfillment") == "pickup"
        limit = 24 if (pickup and status_now == "out_for_delivery") else 2
        if hours < limit or o.get("stuckAlertFor") == status_now:
            continue
        label = {"placed": "hasn't been started", "confirmed": "is still being prepared",
                 "out_for_delivery": "is waiting at the counter for pickup" if pickup else "is still out for delivery"}.get(status_now, status_now)
        text = f"Order {o.get('orderNumber')} {label} after {int(hours)} h."
        await h.push_admins({"title": "Order needs attention", "body": text, "url": "/admin/orders"})
        await emails._send([emails.NOTIFY_EMAIL], f"Order needs attention: {o.get('orderNumber')}",
                           emails.layout("Order needs attention", f'<p style="font-size:15px;line-height:1.6;">{escape(text)}</p>'
                                         f'<p>{emails.button("Open orders", h.public_url + "/admin/orders")}</p>'),
                           "auto_stuck_order", {"orderId": o.get("id")})
        await h.db.orders.update_one({"id": o["id"]}, {"$set": {"stuckAlertFor": status_now}})
        await log(h.db, "stuck_orders", text, orderId=o.get("id"))


# ---------------- 6. Review request ----------------
async def review_request(h: Hooks) -> None:
    import emails
    url = (await h.get_settings()).get("googleReviewUrl") or ""
    if not url.startswith("https://"):
        return
    budget = await _marketing_budget_left(h.db)
    if not budget:
        return
    now = _now()
    rows = await h.db.orders.find(
        {"manualStatus": "delivered", "reviewRequestSentAt": {"$exists": False}, "createdAt": {"$gte": now - timedelta(days=10)}},
        {"_id": 0, "id": 1, "orderNumber": 1, "shipping": 1, "statusHistory": 1, "fulfillment": 1},
    ).to_list(200)
    for o in rows:
        if budget <= 0:
            break
        done_at = _aware((o.get("statusHistory") or {}).get("delivered"))
        if not done_at or not (timedelta(hours=20) <= now - done_at <= timedelta(days=4)):
            continue
        email = str((o.get("shipping") or {}).get("email") or "").lower().strip()
        await h.db.orders.update_one({"id": o["id"]}, {"$set": {"reviewRequestSentAt": now}})
        if not email or await opted_out(h.db, email):
            continue
        if await h.db.orders.find_one({"shipping.email": {"$regex": f"^{re.escape(email)}$", "$options": "i"},
                                       "reviewRequestSentAt": {"$gte": now - timedelta(days=60)}, "id": {"$ne": o["id"]}}, {"_id": 1}):
            continue  # asked recently
        first = escape((o.get("shipping") or {}).get("firstName") or "there")
        how = "pickup" if o.get("fulfillment") == "pickup" else "delivery"
        body = (f'<p style="font-size:15px;line-height:1.6;color:#374151;">Hi {first}, thanks again for your {how} order from HD Smoke Shop.</p>'
                f'<p style="font-size:15px;line-height:1.6;color:#374151;">If you have a minute, a quick Google review helps a small local shop a lot. '
                f'If anything wasn\'t right, just reply to this email or call {STORE_PHONE} and we\'ll fix it.</p>'
                f'<p style="margin:24px 0 0;">{emails.button("Leave a Google review", url)}</p>' + _footer(h, email))
        await emails._send([email], "How was your HD Smoke Shop order?", emails.layout("How did we do?", body, "A quick review helps a lot"),
                           "review_request", {"orderId": o["id"]})
        budget -= 1
        await log(h.db, "review_request", f"Asked for a Google review after order {o.get('orderNumber')}.", orderId=o["id"])


# ---------------- 7. Forgotten cart ----------------
async def cart_reminder(h: Hooks) -> None:
    import emails
    budget = await _marketing_budget_left(h.db)
    if not budget:
        return
    now = _now()
    carts = await h.db.carts.find({"items.0": {"$exists": True}, "updatedAt": {"$gte": now - timedelta(hours=72), "$lte": now - timedelta(hours=24)}},
                                  {"_id": 0}).to_list(300)
    for cart in carts:
        if budget <= 0:
            break
        updated = _aware(cart.get("updatedAt"))
        if cart.get("reminderFor") and _aware(cart["reminderFor"]) == updated:
            continue
        await h.db.carts.update_one({"userId": cart["userId"]}, {"$set": {"reminderFor": cart.get("updatedAt")}})
        user = await h.db.users.find_one({"id": cart["userId"]}, {"_id": 0, "email": 1, "firstName": 1, "role": 1})
        email = str((user or {}).get("email") or "").lower().strip()
        if not email or (user or {}).get("role") == "admin" or await opted_out(h.db, email):
            continue
        if await h.db.orders.find_one({"userId": cart["userId"], "createdAt": {"$gte": updated}}, {"_id": 1}):
            continue
        if await h.db.email_log.find_one({"kind": "cart_reminder", "to": email, "createdAt": {"$gte": now - timedelta(days=7)}}, {"_id": 1}):
            continue
        ids = [i.get("productId") for i in cart["items"]]
        live = {p["id"]: p async for p in h.db.products.find({"id": {"$in": ids}, "active": {"$ne": False}, "stock": {"$gt": 0}},
                                                            {"_id": 0, "id": 1, "name": 1, "slug": 1})}
        items = [i for i in cart["items"] if i.get("productId") in live]
        if not items:
            continue
        rows = "".join(f'<li style="margin:4px 0;">{escape(live[i["productId"]]["name"])} × {int(i.get("qty") or 1)}</li>' for i in items[:8])
        first = escape((user or {}).get("firstName") or "there")
        body = (f'<p style="font-size:15px;line-height:1.6;color:#374151;">Hi {first}, you left a few things in your cart. They\'re still in stock right now:</p>'
                f'<ul style="font-size:15px;color:#374151;padding-left:20px;">{rows}</ul>'
                f'<p style="margin:24px 0 0;">{emails.button("Finish your order", h.public_url + "/cart")}</p>'
                '<p style="font-size:13px;color:#6b7280;margin-top:16px;">21+ only. Bring a valid photo ID for pickup or delivery.</p>' + _footer(h, email))
        await emails._send([email], "You left something in your cart", emails.layout("Still thinking it over?", body, "Your cart is saved"),
                           "cart_reminder", {"userId": cart["userId"]})
        budget -= 1
        await log(h.db, "cart_reminder", f"Sent a cart reminder ({len(items)} item(s)).", userId=cart["userId"])


# ---------------- 8. Live Chat ----------------
TOPICS = [
    ("hours", r"\b(hours?|open|close|closing|opening|what time|today)\b",
     "We're open every day from 10 AM to 10 PM at 481 N State Rd 434, Suite 1050, Altamonte Springs."),
    ("id", r"\b(id|age|21|under ?age|license|passport)\b",
     "You must be 21 or older. Please bring a valid, unexpired government photo ID. We check it in store and at delivery."),
    ("delivery", r"\b(deliver|delivery|zip|ship|shipping|bring it|drop off)\b",
     "We deliver locally around Altamonte Springs (ZIP 32714 and nearby). Enter your address at checkout to see if you're in range. ID is checked at the door."),
    ("track", r"\b(track|tracking|where is my order|order status|my order)\b",
     "You can track your order any time at puff2door.com/track with your order number and email."),
    ("pay", r"\b(pay|payment|card|cash|zelle|apple pay|credit|debit)\b",
     "You can pay online at checkout. For delivery, have your ID ready; the name must match the order."),
    ("pickup", r"\b(pick ?up|pickup|come get|in store)\b",
     "Order online and choose pickup. We'll email you when it's ready. Bring a 21+ photo ID that matches the name on the order."),
]
STOP = set("do you have got any is are the a an of for in on and or i me my we to it this that can get u ur sell carry still left stock "
           "available price how much please pls hi hello hey yo".split())


async def _product_answer(db, text: str) -> str:
    words = [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 1]
    if not words:
        return ""
    pattern = "".join(f"(?=.*\\b{re.escape(w)})" for w in words[:5])
    rows = await db.products.find({"active": {"$ne": False}, "name": {"$regex": pattern, "$options": "i"}},
                                  {"_id": 0, "name": 1, "stock": 1, "price": 1, "salePrice": 1, "slug": 1}).to_list(10)
    if not rows and len(words) > 1:
        pattern = "".join(f"(?=.*\\b{re.escape(w)})" for w in words[:2])
        rows = await db.products.find({"active": {"$ne": False}, "name": {"$regex": pattern, "$options": "i"}},
                                      {"_id": 0, "name": 1, "stock": 1, "price": 1, "salePrice": 1, "slug": 1}).to_list(10)
    if not rows:
        return ""
    have = [r for r in rows if int(r.get("stock") or 0) > 0]
    if not have:
        return f"“{rows[0]['name'].strip()}” is out of stock right now. Tap “Notify me” on its page at puff2door.com/shop/{rows[0]['slug']} and we'll email you when it's back."
    lines = [f"{r['name'].strip()}: ${float(r.get('salePrice') or r.get('price') or 0):.2f} (puff2door.com/shop/{r['slug']})" for r in have[:3]]
    return "Yes, in stock right now: " + "; ".join(lines) + ". Stock changes daily, so call " + STORE_PHONE + " to hold one."


async def chat_answer(db, text: str) -> str:
    t = text.lower()
    parts = [answer for _key, pattern, answer in TOPICS if re.search(pattern, t)]
    if re.search(r"\b(have|got|carry|sell|stock|available|any)\b", t) or not parts:
        product = await _product_answer(db, text)
        if product:
            parts.insert(0, product)
    return " ".join(parts[:2])


async def chat_reply(db, conversation_id: str, customer_message_id: str, delay_seconds: int = 180) -> None:
    """Called right after a customer message. Answers instantly unless the owner is already chatting with this customer."""
    if not await enabled(db, "chat_reply"):
        return
    if delay_seconds:
        await asyncio.sleep(delay_seconds)
    msg = await db.chat_messages.find_one({"id": customer_message_id})
    if not msg:
        return
    later = await db.chat_messages.find_one({"conversationId": conversation_id, "createdAt": {"$gt": msg["createdAt"]}})
    if later:  # the owner (or the customer again) already moved the conversation on
        return
    owner = await db.chat_messages.find_one({"conversationId": conversation_id, "sender": "admin", "auto": {"$ne": True},
                                             "system": {"$ne": True}, "createdAt": {"$gte": _now() - timedelta(minutes=15)}})
    if owner:  # the owner is talking with this customer right now
        return
    answer = await chat_answer(db, msg.get("text") or "")
    auto_count = await db.chat_messages.count_documents({"conversationId": conversation_id, "auto": True})
    if not answer:
        if auto_count:
            return
        answer = f"Thanks for your message! Someone from the store will reply here shortly. If it's urgent, call {STORE_PHONE}."
    elif auto_count >= 10:
        return
    now = _now()
    await db.chat_messages.insert_one({"id": str(uuid.uuid4()), "conversationId": conversation_id, "sender": "admin",
                                       "text": answer, "createdAt": now, "auto": True})
    await db.chat_conversations.update_one({"id": conversation_id}, {"$set": {"lastMessageAt": now, "lastMessage": answer[:200],
                                                                              "lastSender": "admin"}, "$inc": {"unreadCustomer": 1}})
    await log(db, "chat_reply", f"Answered a Live Chat question automatically: “{(msg.get('text') or '')[:80]}”", conversationId=conversation_id)


# ---------------- 9. Weekly reorder ----------------
async def weekly_reorder(h: Hooks) -> None:
    import emails
    latest = await h.db.agent_runs.find_one({"agent": "inventory"}, {"_id": 0}, sort=[("ranAt", -1)])
    rows = ((latest or {}).get("data") or {}).get("reorderList") or []
    if not rows:
        return
    groups: dict = {}
    for r in rows:
        groups.setdefault(r.get("brand") or "Other", []).append(r)
    html = ""
    for brand in sorted(groups, key=lambda b: (b == "Other", b)):
        lines = "".join(f'<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">{escape(r["name"])}</td>'
                        f'<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;"><b>{r["qty"]}</b></td>'
                        f'<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;color:#6b7280;">{r["stock"]} left · ~{r["perWeek"]:g}/wk</td></tr>'
                        for r in groups[brand])
        html += (f'<h3 style="margin:20px 0 6px;font-size:16px;">{escape(brand)}</h3>'
                 f'<table width="100%" style="border-collapse:collapse;font-size:14px;">{lines}</table>')
    body = ('<p style="font-size:14px;color:#374151;">Quantities cover about 2 weeks of sales (store + website). Nothing has been ordered.</p>' + html)
    await emails._send([emails.NOTIFY_EMAIL], f"Reorder list · {datetime.now(ET):%b %d}", emails.layout("This week's reorder list", body),
                       "auto_weekly_reorder")
    await log(h.db, "weekly_reorder", f"Emailed the reorder list ({len(rows)} items, {len(groups)} brands).")


# ---------------- scheduler ----------------
async def tick(h: Hooks, logger=None) -> None:
    local = _now().astimezone(ET)
    jobs = [
        ("stuck_orders", timedelta(minutes=15), stuck_orders),
        ("clover_retry", timedelta(minutes=60), clover_retry),
        ("age_fix", timedelta(minutes=60), age_fix),
        ("review_request", timedelta(minutes=60), review_request),
        ("cart_reminder", timedelta(minutes=60), cart_reminder),
        ("descriptions", timedelta(hours=6), descriptions),
        ("instagram_renew", timedelta(hours=24), instagram_renew),
    ]
    if h.google_factory:
        import google_reviews
        jobs.append(("google_reviews", timedelta(hours=2), lambda hooks: google_reviews.reply_new(hooks)))
    for key, every, fn in jobs:
        if not await enabled(h.db, key) or not await _due(h.db, key, every):
            continue
        if key in ("review_request", "cart_reminder") and not (9 <= local.hour < 20):
            continue  # customer emails only during the day
        try:
            await fn(h)
        except Exception as exc:
            if logger:
                logger.warning("Automation %s failed: %s", key, exc)
        await _mark(h.db, key)
    if local.weekday() == 0 and local.hour >= 9 and await enabled(h.db, "weekly_reorder"):
        st = await h.db.agent_state.find_one({"key": "auto:weekly_reorder"}) or {}
        if st.get("date") != local.date().isoformat():
            try:
                await weekly_reorder(h)
            except Exception as exc:
                if logger:
                    logger.warning("Weekly reorder email failed: %s", exc)
            await h.db.agent_state.update_one({"key": "auto:weekly_reorder"}, {"$set": {"key": "auto:weekly_reorder", "date": local.date().isoformat()}}, upsert=True)


async def loop(h: Hooks, logger) -> None:
    await asyncio.sleep(150)
    while True:
        try:
            await tick(h, logger)
        except Exception as exc:
            logger.error("Automation tick failed: %s", exc)
        await asyncio.sleep(300)


async def done_since(db, since: datetime) -> list[str]:
    rows = await db.automation_log.find({"at": {"$gte": since}, "detail.ok": {"$ne": False}}, {"_id": 0, "kind": 1, "text": 1}).to_list(500)
    counts: dict = {}
    for r in rows:
        counts.setdefault(r["kind"], []).append(r["text"])
    out = []
    labels = dict(AUTOMATIONS)
    for kind, texts in counts.items():
        out.append(texts[0] if len(texts) == 1 else f"{labels.get(kind, kind)}: done {len(texts)} times (e.g. {texts[0]})")
    return out

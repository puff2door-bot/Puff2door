"""Owner alerts: the 9 AM morning summary (phone + email) and low-stock alerts for items that actually sell.

Runs inside the web server's background loop. Each alert type has an on/off switch in Store Settings.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from html import escape
from zoneinfo import ZoneInfo

logger = logging.getLogger("owner_alerts")
ET = ZoneInfo("America/New_York")


def _money(n) -> str:
    return f"${float(n or 0):,.0f}"


async def admin_targets(db, admin_emails: list) -> tuple[list, list]:
    """(user ids for phone alerts, email addresses) of everyone with admin access."""
    users = await db.users.find({"$or": [{"role": "admin"}, {"email": {"$in": admin_emails}}]}, {"_id": 0, "id": 1, "email": 1}).to_list(20)
    return [u["id"] for u in users if u.get("id")], sorted({u["email"] for u in users if u.get("email")})


async def build_summary(db, overview, visitor_count) -> dict:
    now_et = datetime.now(ET)
    today = now_et.date()
    yday = today - timedelta(days=1)
    y_start = datetime.combine(yday, datetime.min.time(), ET).astimezone(timezone.utc)
    y_end = y_start + timedelta(days=1)
    sales = await db.sales_days.find_one({"date": yday.isoformat()}, {"_id": 0}) or {}
    web = await db.orders.find({"createdAt": {"$gte": y_start, "$lt": y_end}, "paymentStatus": "paid"},
                               {"_id": 0, "total": 1}).to_list(500)
    deliveries = await db.orders.count_documents({"deliveryWindow.date": today.isoformat(),
                                                  "manualStatus": {"$nin": ["cancelled", "returned"]}})
    reviews = await db.google_review_replies.count_documents({"at": {"$gte": y_start}})
    chats = await db.chat_conversations.count_documents({"lastSender": "customer", "status": {"$ne": "resolved"}})
    dash = await overview(db)
    low = [c for c in (dash.get("reorder") or []) if c.get("perWeek", 0) >= 1][:4]
    return {
        "day": now_et.strftime("%A, %b %-d"),
        "storeSales": float(sales.get("storeRevenue") or 0), "storeOrders": int(sales.get("storeOrders") or 0),
        "webSales": sum(float(o.get("total") or 0) for o in web), "webOrders": len(web),
        "deliveriesToday": deliveries, "visitors": await visitor_count(y_start, y_end),
        "reviews": reviews, "chats": chats,
        "low": [{"name": c["name"], "stock": c["stock"]} for c in low],
        "attention": [a["text"] for a in (dash.get("attention") or [])][:4],
    }


def summary_push(s: dict) -> dict:
    parts = [f"Yesterday: {_money(s['storeSales'])} in store + {_money(s['webSales'])} online ({s['webOrders']} orders)"]
    if s["deliveriesToday"]:
        parts.append(f"{s['deliveriesToday']} deliveries today")
    if s["low"]:
        parts.append(f"{len(s['low'])} item{'' if len(s['low']) == 1 else 's'} running low")
    if s["reviews"]:
        parts.append(f"{s['reviews']} new review{'' if s['reviews'] == 1 else 's'}")
    return {"title": f"HD Smoke Shop · Good morning", "body": ". ".join(parts) + ".", "url": "/my-account", "tag": "p2d-morning", "renotify": True}


def summary_html(s: dict, layout) -> str:
    li = lambda label, value: f"<tr><td style='padding:6px 0;color:#525252;width:38%'>{label}</td><td style='padding:6px 0;font-weight:700'>{value}</td></tr>"
    rows = [
        li("Store sales (Clover)", f"{_money(s['storeSales'])} · {s['storeOrders']} sales"),
        li("Website", f"{_money(s['webSales'])} · {s['webOrders']} orders"),
        li("Deliveries today", str(s["deliveriesToday"])),
        li("Visitors", str(s["visitors"])),
        li("New Google reviews", str(s["reviews"])),
    ]
    if s["chats"]:
        rows.append(li("Chats waiting", str(s["chats"])))
    low = "".join(f"<li>{escape(x['name'])}: <b>{x['stock']} left</b></li>" for x in s["low"]) or "<li>Nothing running low.</li>"
    att = "".join(f"<li>{escape(t)}</li>" for t in s["attention"])
    body = (f"<p style='margin:0 0 12px'>Here's how HD Smoke Shop did yesterday.</p><table style='width:100%;font-size:14px'>{''.join(rows)}</table>"
            f"<h3 style='margin:18px 0 6px;font-size:15px'>Running low</h3><ul style='margin:0;padding-left:18px;font-size:14px'>{low}</ul>"
            + (f"<h3 style='margin:18px 0 6px;font-size:15px'>Needs you</h3><ul style='margin:0;padding-left:18px;font-size:14px'>{att}</ul>" if att else "")
            + "<p style='margin:18px 0 0'><a href='https://puff2door.com/my-account' style='color:#047857;font-weight:700'>Open your owner home →</a></p>")
    return layout(f"Good morning: {s['day']}", body, "Yesterday's sales, orders and what needs you today")


async def low_stock_candidates(db, overview, threshold: int) -> list:
    dash = await overview(db)
    cards = (dash.get("reorder") or []) + (dash.get("soldOut") or [])
    seen, out = set(), []
    for c in cards:
        if c.get("id") in seen:
            continue
        seen.add(c.get("id"))
        if float(c.get("perWeek") or 0) >= 2 and int(c.get("stock") or 0) <= threshold:
            out.append(c)
    return out


async def run_loop(db, get_settings, overview, visitor_count, send_push_to_user, send_email, layout, admin_emails):
    """Checks once a minute. Summary: once a day from 9:00 AM ET. Low stock: every 15 min, 9 AM–10 PM ET."""
    last_low_check = 0.0
    while True:
        try:
            settings = await get_settings()
            now_et = datetime.now(ET)
            ids, emails = await admin_targets(db, admin_emails)
            # Morning summary
            if settings.get("morningSummaryEnabled", True) and now_et.hour >= 9 and now_et.hour < 12:
                key = f"summary:{now_et.date().isoformat()}"
                if await db.owner_alert_log.find_one({"key": key}) is None:
                    await db.owner_alert_log.insert_one({"key": key, "at": datetime.now(timezone.utc)})
                    s = await build_summary(db, overview, visitor_count)
                    for uid in ids:
                        await send_push_to_user(uid, summary_push(s))
                    if emails:
                        await send_email(emails, f"Good morning: HD Smoke Shop, {s['day']}", summary_html(s, layout), "morning_summary")
            # Low stock
            mono = asyncio.get_event_loop().time()
            if settings.get("lowStockAlertsEnabled", True) and 9 <= now_et.hour < 22 and mono - last_low_check >= 900:
                last_low_check = mono
                threshold = int(settings.get("lowStockThreshold", 3) or 3)
                items = await low_stock_candidates(db, overview, threshold)
                low_ids = {c["id"] for c in items}
                # an item that has been restocked can alert again later
                await db.low_stock_alerts.delete_many({"productId": {"$nin": list(low_ids)}})
                for c in items:
                    if await db.low_stock_alerts.find_one({"productId": c["id"]}):
                        continue
                    await db.low_stock_alerts.insert_one({"productId": c["id"], "at": datetime.now(timezone.utc), "stock": c["stock"]})
                    msg = (f"{c['name']} is sold out" if int(c["stock"]) <= 0 else f"{c['name']} is down to {c['stock']}") + f" (sells about {round(float(c['perWeek']))}/week)."
                    for uid in ids:
                        await send_push_to_user(uid, {"title": "Low stock · HD Smoke Shop", "body": msg, "url": "/admin", "tag": f"p2d-low-{c['id']}"})
        except Exception as exc:  # alerts must never take the site down
            logger.warning("owner alerts loop: %s", exc)
        await asyncio.sleep(60)

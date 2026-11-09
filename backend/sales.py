"""Read-only sales history for the agents.

Pulls paid orders from Clover (the register) and the website's own orders, and keeps
small daily totals in MongoDB:
  sales_days      {date, storeOrders, storeRevenue, webOrders, webRevenue}
  sales_item_days {date, itemId (Clover id), productId, name, qty, revenue, channel}
Nothing here writes to Clover or changes products/orders.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
HISTORY_DAYS = 90
PAID_STATES = {"PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"}


def _day_bounds_ms(day: date) -> tuple[int, int]:
    start = datetime.combine(day, time.min, ET)
    end = start + timedelta(days=1)
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


RICH_EXPAND = "lineItems,payments,payments.tender,payments.cardTransaction,employee,refunds,discounts"


async def _store_orders_for_day(clover, merchant_id: str, day: date) -> list[dict]:
    """Paid-order details for one day. Falls back to line items only if the Clover app
    isn't allowed to read payments or employees."""
    start, end = _day_bounds_ms(day)
    flt = {"filter": [f"createdTime>={start}", f"createdTime<{end}"]}
    try:
        return await clover._paged(f"/v3/merchants/{merchant_id}/orders", {**flt, "expand": RICH_EXPAND})
    except Exception:
        return await clover._paged(f"/v3/merchants/{merchant_id}/orders", {**flt, "expand": "lineItems"})


def _cents(v) -> float:
    return round((v or 0) / 100, 2) if isinstance(v, (int, float)) else 0.0


def order_summary(o: dict, day_key: str) -> dict:
    """Small receipt record kept for the Store sales page and receipt search."""
    payments = [p for p in ((o.get("payments") or {}).get("elements") or []) if p.get("result", "SUCCESS") == "SUCCESS"]
    refunds = (o.get("refunds") or {}).get("elements") or []
    lines = [l for l in ((o.get("lineItems") or {}).get("elements") or []) if not l.get("refunded") and not l.get("exchanged")]
    first = payments[0] if payments else {}
    card = first.get("cardTransaction") or {}
    tender = (first.get("tender") or {}).get("label") or ""
    created = datetime.fromtimestamp((o.get("createdTime") or 0) / 1000, timezone.utc)
    employee = (o.get("employee") or {}).get("name") or ""
    state = str(o.get("paymentState") or "").upper()
    return {
        "id": o.get("id"), "date": day_key, "createdAt": created,
        "hour": created.astimezone(ET).hour,
        "total": _cents(o.get("total")),
        "tax": round(sum(_cents(p.get("taxAmount")) for p in payments), 2) or max(0.0, round(
            _cents(o.get("total")) - sum(_cents(l.get("price")) * _line_qty(l) for l in lines)
            + sum(abs(_cents(d.get("amount"))) for d in ((o.get("discounts") or {}).get("elements") or [])), 2)),
        "tip": round(sum(_cents(p.get("tipAmount")) for p in payments), 2),
        "discount": round(sum(abs(_cents(d.get("amount"))) for d in ((o.get("discounts") or {}).get("elements") or [])), 2),
        "refunded": round(sum(_cents(r.get("amount")) for r in refunds), 2),
        "paymentState": state,
        "paymentType": tender or ("Card" if card else ""),
        "cardType": card.get("cardType") or "",
        "last4": card.get("last4") or "",
        "employee": employee,
        "employeeId": str((o.get("employee") or {}).get("id") or ""),
        "itemCount": round(sum(_line_qty(l) for l in lines), 1),
        "items": [{"name": (l.get("name") or "").strip(), "qty": _line_qty(l), "price": _cents(l.get("price")),
                   "itemId": str((l.get("item") or {}).get("id") or "")} for l in lines[:40]],
        "v": 3,
        "search": " ".join([(l.get("name") or "") for l in lines] + [card.get("last4") or "", employee, f"{_cents(o.get('total')):.2f}"]).lower(),
    }


def _line_qty(line: dict) -> float:
    unit = line.get("unitQty")
    return round(unit / 1000, 3) if isinstance(unit, (int, float)) and unit else 1.0


async def sync_day(db, clover, merchant_id: str, day: date, product_by_clover: dict) -> dict:
    """Recompute one day's totals from Clover + website orders (idempotent)."""
    orders = await _store_orders_for_day(clover, merchant_id, day)
    store_orders, store_revenue = 0, 0.0
    items: dict = defaultdict(lambda: {"qty": 0.0, "revenue": 0.0, "name": ""})
    receipts = []
    for o in orders:
        state = str(o.get("paymentState") or "").upper()
        paid = state in PAID_STATES or o.get("state") == "locked"
        if str(o.get("note") or "").startswith("Website order"):
            continue
        if paid or state == "REFUNDED":
            receipts.append(order_summary(o, day.isoformat()))
        if not paid:
            continue
        store_orders += 1
        store_revenue += (o.get("total") or 0) / 100
        for line in ((o.get("lineItems") or {}).get("elements") or []):
            if line.get("refunded") or line.get("exchanged"):
                continue
            item_id = str((line.get("item") or {}).get("id") or "")
            key = item_id or f"name:{line.get('name', '')}"
            qty = _line_qty(line)
            items[key]["qty"] += qty
            items[key]["revenue"] += (line.get("price") or 0) / 100 * qty
            items[key]["name"] = line.get("name") or items[key]["name"]

    start = datetime.combine(day, time.min, ET).astimezone(timezone.utc)
    web = await db.orders.find(
        {"createdAt": {"$gte": start, "$lt": start + timedelta(days=1)}},
        {"_id": 0, "total": 1, "status": 1, "manualStatus": 1, "paymentStatus": 1, "items": 1},
    ).to_list(2000)
    bad = ("cancelled", "canceled", "expired", "refunded", "failed", "returned", "awaiting_payment")
    web = [w for w in web if not any(str(w.get(k) or "").lower() in bad for k in ("status", "manualStatus", "paymentStatus"))]
    web_revenue = round(sum(float(w.get("total") or 0) for w in web), 2)
    web_items: dict = defaultdict(lambda: {"qty": 0.0, "revenue": 0.0, "name": ""})
    for w in web:
        for it in w.get("items") or []:
            pid = it.get("productId")
            if pid is None:
                continue
            row = web_items[pid]
            row["qty"] += float(it.get("qty") or it.get("quantity") or 1)
            row["revenue"] += float(it.get("price") or 0) * float(it.get("qty") or it.get("quantity") or 1)
            row["name"] = it.get("name") or row["name"]

    key = day.isoformat()
    await db.sales_item_days.delete_many({"date": key})
    docs = []
    for item_id, v in items.items():
        product = product_by_clover.get(item_id) or {}
        docs.append({"date": key, "channel": "store", "itemId": item_id, "productId": product.get("id"),
                     "name": product.get("name") or v["name"], "qty": round(v["qty"], 3), "revenue": round(v["revenue"], 2)})
    for pid, v in web_items.items():
        docs.append({"date": key, "channel": "web", "itemId": "", "productId": pid,
                     "name": v["name"], "qty": round(v["qty"], 3), "revenue": round(v["revenue"], 2)})
    if docs:
        await db.sales_item_days.insert_many(docs)
    await db.store_orders.delete_many({"date": key})
    if receipts:
        await db.store_orders.insert_many(receipts)
    summary = {"date": key, "storeOrders": store_orders, "storeRevenue": round(store_revenue, 2),
               "webOrders": len(web), "webRevenue": web_revenue, "syncedAt": datetime.now(timezone.utc)}
    await db.sales_days.update_one({"date": key}, {"$set": summary}, upsert=True)
    return summary


async def sync_sales(db, clover, days: Optional[int] = None, logger=None) -> dict:
    """Backfill up to HISTORY_DAYS on first run, then refresh the last 2 days each time."""
    merchant_id = clover._merchant_id(await clover.config() or {})
    if not merchant_id:
        return {"synced": 0, "reason": "clover_not_connected"}
    today = datetime.now(ET).date()
    day_rows = await db.sales_days.find({}, {"date": 1, "storeOrders": 1}).to_list(400)
    have = {d["date"] for d in day_rows}
    have_days = {d["date"]: d.get("storeOrders") for d in day_rows}
    window = days or HISTORY_DAYS
    todo = [today - timedelta(days=i) for i in range(window)]
    have_receipts = set(await db.store_orders.distinct("date", {"v": 3}))  # v2 = with tax worked out
    todo = [d for d in todo if d >= today - timedelta(days=1) or d.isoformat() not in have
            or (d.isoformat() not in have_receipts and (have_days.get(d.isoformat()) or 0) > 0)]
    products = await db.products.find({"cloverItemId": {"$nin": [None, ""]}}, {"_id": 0, "id": 1, "name": 1, "cloverItemId": 1}).to_list(5000)
    by_clover = {str(p["cloverItemId"]): p for p in products}
    done, errors = 0, 0
    for day in sorted(todo):
        try:
            await sync_day(db, clover, merchant_id, day, by_clover)
            done += 1
        except Exception as exc:  # keep going; a single bad day must not stop the rest
            errors += 1
            if logger:
                logger.warning("Sales sync failed for %s: %s", day, exc)
    old = (today - timedelta(days=HISTORY_DAYS + 5)).isoformat()
    await db.sales_item_days.delete_many({"date": {"$lt": old}})
    await db.sales_days.delete_many({"date": {"$lt": old}})
    await db.store_orders.delete_many({"date": {"$lt": old}})
    return {"synced": done, "errors": errors}


# ---------------- analysis used by the agents ----------------
async def item_velocity(db, days: int = 28) -> dict:
    """productId -> {qty (units in window), perWeek, lastSold (date str)} across store + web."""
    since = (datetime.now(ET).date() - timedelta(days=days)).isoformat()
    out: dict = {}
    async for r in db.sales_item_days.find({"date": {"$gte": since}, "productId": {"$ne": None}}, {"_id": 0}):
        row = out.setdefault(r["productId"], {"qty": 0.0, "lastSold": ""})
        row["qty"] += float(r.get("qty") or 0)
        row["lastSold"] = max(row["lastSold"], r["date"])
    for row in out.values():
        row["perWeek"] = round(row["qty"] / (days / 7), 2)
    return out


async def last_sold(db) -> dict:
    out: dict = {}
    async for r in db.sales_item_days.find({"productId": {"$ne": None}}, {"_id": 0, "productId": 1, "date": 1}):
        out[r["productId"]] = max(out.get(r["productId"], ""), r["date"])
    return out


async def history_start(db) -> Optional[str]:
    first = await db.sales_days.find_one({}, {"_id": 0, "date": 1}, sort=[("date", 1)])
    return first["date"] if first else None


def reorder_suggestion(stock: int, per_week: float, cover_weeks: float = 2.0) -> int:
    return max(0, math.ceil(per_week * cover_weeks) - int(stock))


async def day_summary(db, day: date) -> Optional[dict]:
    return await db.sales_days.find_one({"date": day.isoformat()}, {"_id": 0})


async def top_sellers(db, day_from: date, day_to: date, limit: int = 5) -> list[dict]:
    totals: dict = {}
    async for r in db.sales_item_days.find({"date": {"$gte": day_from.isoformat(), "$lte": day_to.isoformat()}}, {"_id": 0}):
        key = r.get("productId") or r.get("name")
        row = totals.setdefault(key, {"name": r.get("name") or str(key), "qty": 0.0, "revenue": 0.0})
        row["qty"] += float(r.get("qty") or 0)
        row["revenue"] += float(r.get("revenue") or 0)
    return sorted(totals.values(), key=lambda x: (-x["qty"], -x["revenue"]))[:limit]

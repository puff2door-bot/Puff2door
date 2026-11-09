"""Admin dashboard overview: one read-only call that gathers everything the owner needs today."""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sales import ET, history_start, item_velocity, last_sold, reorder_suggestion

STOCK_FIELDS = {"_id": 0, "id": 1, "name": 1, "slug": 1, "image": 1, "stock": 1, "price": 1, "salePrice": 1,
                "brandName": 1, "category": 1, "categorySlug": 1, "createdAt": 1, "barcode": 1, "cloverItemId": 1}


def _aware(v):
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return None


def _card(p: dict, vel: dict, last: dict) -> dict:
    v = vel.get(p["id"]) or {}
    per_week = float(v.get("perWeek") or 0)
    stock = int(p.get("stock") or 0)
    days_left = round(stock / (per_week / 7), 1) if per_week > 0 else None
    return {"id": p["id"], "name": p["name"].strip(), "slug": p.get("slug"), "image": p.get("image") or "",
            "brand": (p.get("brandName") or "").strip().title() or "No brand", "category": p.get("category") or "",
            "stock": stock, "price": float(p.get("salePrice") or p.get("price") or 0), "perWeek": per_week,
            "sold28": round(float(v.get("qty") or 0), 1), "lastSold": last.get(p["id"], ""), "daysLeft": days_left,
            "suggest": reorder_suggestion(stock, per_week) if per_week else 0, "noBarcode": not (p.get("barcode") or "").strip()}


async def overview(db) -> dict:
    now = datetime.now(timezone.utc)
    today = datetime.now(ET).date()
    products = await db.products.find({"active": {"$ne": False}}, STOCK_FIELDS).to_list(5000)
    vel = await item_velocity(db, 28)
    last = await last_sold(db)
    start = await history_start(db)
    history_days = (today - datetime.fromisoformat(start).date()).days if start else 0

    cards = [_card(p, vel, last) for p in products]
    by_id = {c["id"]: c for c in cards}
    reorder = sorted([c for c in cards if c["perWeek"] >= 0.5 and c["stock"] > 0 and (c["daysLeft"] or 0) <= 10],
                     key=lambda c: (-c["perWeek"], c["daysLeft"] or 0))
    sold_out = [c for c in cards if c["stock"] <= 0]
    sold_out.sort(key=lambda c: c["lastSold"] or "", reverse=True)  # most recently sold first …
    sold_out.sort(key=lambda c: -c["perWeek"])                        # … within fastest sellers first
    slow = []
    if history_days >= 60:
        cutoff = (today - timedelta(days=60)).isoformat()
        for p in products:
            c = by_id[p["id"]]
            created = _aware(p.get("createdAt"))
            if c["stock"] > 0 and (not c["lastSold"] or c["lastSold"] < cutoff) and (not created or created < now - timedelta(days=60)):
                slow.append(c)
        slow.sort(key=lambda c: -(c["stock"] * c["price"]))
    # shopping list: sellers that need ordering, grouped by brand
    brands: dict = defaultdict(list)
    for c in reorder + [c for c in sold_out if c["perWeek"] > 0]:
        brands[c["brand"]].append({"name": c["name"], "qty": max(c["suggest"], 1), "stock": c["stock"]})
    shopping = [{"brand": b, "items": items, "units": sum(i["qty"] for i in items)} for b, items in
                sorted(brands.items(), key=lambda kv: -sum(i["qty"] for i in kv[1]))]

    # sales: last 14 days and today vs same day last week
    days = await db.sales_days.find({"date": {"$gte": (today - timedelta(days=13)).isoformat()}}, {"_id": 0}).sort("date", 1).to_list(20)
    by_day = {d["date"]: d for d in days}
    t, lw = by_day.get(today.isoformat()) or {}, await db.sales_days.find_one({"date": (today - timedelta(days=7)).isoformat()}, {"_id": 0}) or {}
    chart = [{"date": (today - timedelta(days=i)).isoformat(),
              "store": float((by_day.get((today - timedelta(days=i)).isoformat()) or {}).get("storeRevenue") or 0),
              "web": float((by_day.get((today - timedelta(days=i)).isoformat()) or {}).get("webRevenue") or 0)} for i in range(13, -1, -1)]

    # top sellers this week (store + web), with photos
    week: dict = defaultdict(lambda: {"qty": 0.0, "revenue": 0.0, "name": ""})
    async for r in db.sales_item_days.find({"date": {"$gte": (today - timedelta(days=6)).isoformat()}}, {"_id": 0}):
        key = r.get("productId") or ("name:" + (r.get("name") or ""))
        week[key]["qty"] += float(r.get("qty") or 0)
        week[key]["revenue"] += float(r.get("revenue") or 0)
        week[key]["name"] = r.get("name") or week[key]["name"]
    top = []
    for key, v in sorted(week.items(), key=lambda kv: -kv[1]["qty"]):
        if str(key).startswith("name:"):
            continue  # "Custom Item" and unmatched lines have no product to show
        c = by_id.get(key)
        if c:
            top.append({**c, "weekQty": round(v["qty"], 1), "weekRevenue": round(v["revenue"], 2)})
        if len(top) >= 8:
            break

    # needs attention
    attention = []
    open_orders = await db.orders.find({"manualStatus": {"$nin": ["delivered", "cancelled", "returned"]},
                                        "paymentStatus": {"$nin": ["awaiting_payment", "refunded"]},
                                        "createdAt": {"$gte": now - timedelta(days=3)}},
                                       {"_id": 0, "id": 1, "orderNumber": 1, "createdAt": 1, "manualStatus": 1}).to_list(100)
    waiting = len(open_orders)
    stuck = [o for o in open_orders if _aware(o.get("createdAt")) and now - _aware(o["createdAt"]) > timedelta(hours=2)]
    if stuck:
        attention.append({"kind": "orders", "level": "alert", "text": f"{len(stuck)} website order(s) waiting over 2 hours", "link": "/admin/orders"})
    chats = await db.chat_conversations.count_documents({"lastSender": "customer", "status": {"$ne": "resolved"}})
    if chats:
        attention.append({"kind": "chat", "level": "warn", "text": f"{chats} Live Chat conversation(s) waiting for a reply", "link": "/admin/chat"})
    barcode_sellers = [c for c in cards if c["noBarcode"] and c["perWeek"] >= 1]
    if barcode_sellers:
        attention.append({"kind": "barcode", "level": "warn", "text": f"{len(barcode_sellers)} best seller(s) have no barcode: "
                          + ", ".join(c["name"] for c in sorted(barcode_sellers, key=lambda c: -c["perWeek"])[:2]), "link": "/admin/missing-barcodes"})
    bad = await db.google_review_replies.count_documents({"stars": {"$lte": 3}, "at": {"$gte": now - timedelta(days=7)}})
    if bad:
        attention.append({"kind": "review", "level": "alert", "text": f"{bad} unhappy Google review(s) this week", "link": "/admin/agents"})
    expiring = []
    async for d in db.documents.find({"expiryDate": {"$nin": [None, ""]}}, {"_id": 0, "title": 1, "expiryDate": 1}):
        left = (datetime.fromisoformat(d["expiryDate"]).date() - today).days
        if left <= 30:
            expiring.append({**d, "days": left})
    for d in sorted(expiring, key=lambda x: x["days"])[:3]:
        attention.append({"kind": "document", "level": "alert" if d["days"] < 0 else "warn",
                          "text": f"{d['title']} " + ("expired" if d["days"] < 0 else f"expires in {d['days']} days"), "link": "/admin/documents"})
    no_amount = await db.expenses.count_documents({"amount": None, "notReceipt": {"$ne": True}})
    if no_amount:
        attention.append({"kind": "expense", "level": "info", "text": f"{no_amount} business receipt(s) need an amount", "link": "/admin/expenses"})

    # restock alerts: customers waiting, grouped by product
    alerts: dict = defaultdict(int)
    async for a in db.stock_alerts.find({"notified": False}, {"_id": 0, "productId": 1}):
        alerts[a.get("productId")] += 1
    restock = sorted([{**by_id[pid], "waiting": n} for pid, n in alerts.items() if pid in by_id], key=lambda x: -x["waiting"])[:8]

    return {
        "today": {"storeSales": float(t.get("storeRevenue") or 0), "storeOrders": int(t.get("storeOrders") or 0),
                  "lastWeekSales": float(lw.get("storeRevenue") or 0), "webOrdersWaiting": waiting,
                  "toReorder": len(reorder), "soldOutSellers": sum(1 for c in sold_out if c["perWeek"] > 0),
                  "docsExpiring": len(expiring), "date": today.isoformat()},
        "reorder": reorder[:40], "soldOut": sold_out[:60], "slow": slow[:40], "slowReady": history_days >= 60,
        "shopping": shopping, "chart": chart, "top": top, "attention": attention, "restock": restock,
        "counts": {"reorder": len(reorder), "soldOut": len(sold_out), "slow": len(slow), "products": len(products)},
    }

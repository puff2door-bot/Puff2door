"""Store (Clover) sales reports and receipts for the admin panel. Read-only.

Uses the receipt summaries that sales.sync_sales keeps in `store_orders` (last 90 days)
and the per-item totals in `sales_item_days`. Opening one receipt reads that order live
from Clover so it always matches the register.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sales import ET, RICH_EXPAND, _cents, _line_qty

CUSTOM = re.compile(r"^\s*custom item\s*$", re.I)


def _iso(v):
    """MongoDB hands datetimes back without a timezone; they are UTC. Send them with 'Z'."""
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat().replace("+00:00", "Z")
    return v


def _range(days: int, start: Optional[str], end: Optional[str]) -> tuple[str, str]:
    today = datetime.now(ET).date()
    if start and end:
        return start, end
    return (today - timedelta(days=max(1, min(days, 90)) - 1)).isoformat(), today.isoformat()


async def report(db, days: int = 30, start: Optional[str] = None, end: Optional[str] = None) -> dict:
    d_from, d_to = _range(days, start, end)
    rows = await db.store_orders.find({"date": {"$gte": d_from, "$lte": d_to}}, {"_id": 0, "items": 0, "search": 0}).to_list(20000)
    paid = [r for r in rows if r.get("paymentState") != "REFUNDED"]
    gross = round(sum(r["total"] for r in paid), 2)
    refunds = round(sum(r.get("refunded") or 0 for r in rows), 2)
    daily = {}
    for d in await db.sales_days.find({"date": {"$gte": d_from, "$lte": d_to}}, {"_id": 0}).sort("date", 1).to_list(400):
        daily[d["date"]] = {"date": d["date"], "storeOrders": d.get("storeOrders", 0), "storeRevenue": d.get("storeRevenue", 0),
                            "webOrders": d.get("webOrders", 0), "webRevenue": d.get("webRevenue", 0)}
    hours = [{"hour": h, "orders": 0, "revenue": 0.0} for h in range(24)]
    pay, emp = defaultdict(lambda: {"orders": 0, "revenue": 0.0}), defaultdict(lambda: {"orders": 0, "revenue": 0.0})
    for r in paid:
        h = hours[int(r.get("hour") or 0)]
        h["orders"] += 1
        h["revenue"] = round(h["revenue"] + r["total"], 2)
        key = (r.get("paymentType") or "Other").title()
        pay[key]["orders"] += 1
        pay[key]["revenue"] = round(pay[key]["revenue"] + r["total"], 2)
        e = r.get("employee") or "Unknown"
        emp[e]["orders"] += 1
        emp[e]["revenue"] = round(emp[e]["revenue"] + r["total"], 2)

    # items, categories, brands from the per-item daily totals (store channel)
    products = {p["id"]: p async for p in db.products.find({}, {"_id": 0, "id": 1, "categorySlug": 1, "category": 1, "brandName": 1})}
    items, cats, brands = {}, defaultdict(float), defaultdict(float)
    custom_qty, custom_rev, item_rev = 0.0, 0.0, 0.0
    async for r in db.sales_item_days.find({"date": {"$gte": d_from, "$lte": d_to}, "channel": "store"}, {"_id": 0}):
        rev, qty = float(r.get("revenue") or 0), float(r.get("qty") or 0)
        item_rev += rev
        if CUSTOM.match(r.get("name") or "") or str(r.get("itemId") or "").startswith("name:"):
            custom_qty += qty
            custom_rev += rev
            if CUSTOM.match(r.get("name") or ""):
                continue
        key = r.get("productId") or r.get("itemId") or r.get("name")
        row = items.setdefault(key, {"name": (r.get("name") or "").strip(), "qty": 0.0, "revenue": 0.0})
        row["qty"] += qty
        row["revenue"] += rev
        p = products.get(r.get("productId")) or {}
        cats[p.get("category") or "Not on website"] += rev
        brands[(p.get("brandName") or "No brand").title()] += rev
    top = sorted(items.values(), key=lambda x: -x["revenue"])[:20]
    for t in top:
        t["qty"], t["revenue"] = round(t["qty"], 1), round(t["revenue"], 2)
    n = len(paid)
    return {
        "from": d_from, "to": d_to,
        "summary": {"orders": n, "gross": gross, "average": round(gross / n, 2) if n else 0,
                    "tax": round(sum(r.get("tax") or 0 for r in paid), 2), "tips": round(sum(r.get("tip") or 0 for r in paid), 2),
                    "discounts": round(sum(r.get("discount") or 0 for r in paid), 2), "refunds": refunds,
                    "net": round(gross - refunds, 2), "items": round(sum(r.get("itemCount") or 0 for r in paid), 1),
                    "customItemRevenue": round(custom_rev, 2), "customItemQty": round(custom_qty, 1),
                    "customItemShare": round(custom_rev / item_rev * 100, 1) if item_rev else 0},
        "daily": list(daily.values()),
        "hours": hours,
        "paymentTypes": sorted(({"name": k, **v} for k, v in pay.items()), key=lambda x: -x["revenue"]),
        "employees": sorted(({"name": k, **v} for k, v in emp.items()), key=lambda x: -x["revenue"]),
        "topItems": top,
        "categories": sorted(({"name": k, "revenue": round(v, 2)} for k, v in cats.items()), key=lambda x: -x["revenue"])[:12],
        "brands": sorted(({"name": k, "revenue": round(v, 2)} for k, v in brands.items()), key=lambda x: -x["revenue"])[:12],
        "detailsAvailable": any(r.get("paymentType") for r in rows),
        "historyStart": (await db.store_orders.find_one({}, {"date": 1}, sort=[("date", 1)]) or {}).get("date"),
    }


async def receipts(db, start: Optional[str], end: Optional[str], q: str = "", page: int = 1, per_page: int = 50) -> dict:
    d_from, d_to = _range(7, start, end)
    flt: dict = {"date": {"$gte": d_from, "$lte": d_to}}
    q = (q or "").strip().lower()
    if q:
        amount = re.fullmatch(r"\$?(\d+(?:\.\d{1,2})?)", q)
        if amount:
            flt["total"] = round(float(amount.group(1)), 2)
        else:
            flt["search"] = {"$regex": re.escape(q)}
    total = await db.store_orders.count_documents(flt)
    rows = await db.store_orders.find(flt, {"_id": 0, "search": 0}).sort("createdAt", -1).skip((max(page, 1) - 1) * per_page).limit(per_page).to_list(per_page)
    for r in rows:
        r["createdAt"] = _iso(r.get("createdAt"))
    return {"from": d_from, "to": d_to, "total": total, "page": page, "perPage": per_page, "receipts": rows}


async def receipt(db, clover, order_id: str) -> dict:
    """One receipt, read live from Clover (falls back to the saved summary)."""
    saved = await db.store_orders.find_one({"id": order_id}, {"_id": 0, "search": 0})
    try:
        merchant_id = clover._merchant_id(await clover.config() or {})
        try:
            o = await clover.request("GET", f"/v3/merchants/{merchant_id}/orders/{order_id}", params={"expand": RICH_EXPAND})
        except Exception:
            o = await clover.request("GET", f"/v3/merchants/{merchant_id}/orders/{order_id}", params={"expand": "lineItems"})
    except Exception:
        if not saved:
            raise
        return {**saved, "createdAt": _iso(saved.get("createdAt")), "live": False,
                "lines": [{"name": i["name"], "qty": i["qty"], "price": i["price"], "total": round(i["price"] * i["qty"], 2), "refunded": False}
                          for i in saved.get("items") or []],
                "discounts": [], "refunds": [],
                "payments": [{"type": saved.get("paymentType") or "Payment", "amount": saved.get("total"), "cardType": saved.get("cardType"),
                              "last4": saved.get("last4")}]}
    lines = (o.get("lineItems") or {}).get("elements") or []
    payments = [p for p in ((o.get("payments") or {}).get("elements") or [])]
    created = datetime.fromtimestamp((o.get("createdTime") or 0) / 1000, timezone.utc)
    line_total = sum(_cents(l.get("price")) * _line_qty(l) for l in lines if not l.get("refunded"))
    disc_total = sum(abs(_cents(d.get("amount"))) for d in ((o.get("discounts") or {}).get("elements") or []))
    pay_tax = round(sum(_cents(p.get("taxAmount")) for p in payments), 2)
    return {
        "id": o.get("id"), "createdAt": _iso(created), "live": True,
        "employee": (o.get("employee") or {}).get("name") or (saved or {}).get("employee", ""),
        "paymentState": str(o.get("paymentState") or ""),
        "lines": [{"name": (l.get("name") or "").strip(), "qty": _line_qty(l), "price": _cents(l.get("price")),
                   "total": round(_cents(l.get("price")) * _line_qty(l), 2), "refunded": bool(l.get("refunded")),
                   "note": l.get("note") or ""} for l in lines],
        "discounts": [{"name": d.get("name") or "Discount", "amount": abs(_cents(d.get("amount")))}
                      for d in ((o.get("discounts") or {}).get("elements") or [])],
        "payments": [{"type": (p.get("tender") or {}).get("label") or "Payment", "amount": _cents(p.get("amount")),
                      "tip": _cents(p.get("tipAmount")), "tax": _cents(p.get("taxAmount")),
                      "cardType": (p.get("cardTransaction") or {}).get("cardType") or "",
                      "last4": (p.get("cardTransaction") or {}).get("last4") or "", "result": p.get("result") or ""} for p in payments],
        "refunds": [{"amount": _cents(r.get("amount")), "at": datetime.fromtimestamp((r.get("createdTime") or 0) / 1000, timezone.utc)}
                    for r in ((o.get("refunds") or {}).get("elements") or [])],
        "total": _cents(o.get("total")),
        "tax": pay_tax or max(0.0, round(_cents(o.get("total")) - line_total + disc_total, 2)),
        "tip": round(sum(_cents(p.get("tipAmount")) for p in payments), 2),
    }

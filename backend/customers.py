"""Store customers from Clover: who buys, how often, how much and what. Read-only.

Clover customer records (name, phones, emails, marketing consent) are cached hourly in
`clover_customers`. Visits and spend come from the receipt summaries in `store_orders`
(each Clover sale carries the customer attached at the register). Website orders are
matched to the same person by phone or email.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import mean
from typing import Optional

from sales import ET

DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]


def _aware(v):
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return None


def _digits(p: str) -> str:
    d = re.sub(r"\D", "", p or "")
    return d[-10:] if len(d) >= 10 else d


def _hour(h: int) -> str:
    return f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}"


async def refresh_customers(db, clover, force: bool = False) -> int:
    state = await db.agent_state.find_one({"key": "clover_customers_sync"}) or {}
    last = _aware(state.get("at"))
    if not force and last and datetime.now(timezone.utc) - last < timedelta(hours=1):
        return -1
    merchant_id = clover._merchant_id(await clover.config() or {})
    rows = await clover._paged(f"/v3/merchants/{merchant_id}/customers", {"expand": "emailAddresses,phoneNumbers"})
    for c in rows:
        doc = {"id": c["id"], "firstName": (c.get("firstName") or "").strip(), "lastName": (c.get("lastName") or "").strip(),
               "phones": [p.get("phoneNumber") for p in ((c.get("phoneNumbers") or {}).get("elements") or []) if p.get("phoneNumber")],
               "emails": [e.get("emailAddress", "").lower() for e in ((c.get("emailAddresses") or {}).get("elements") or []) if e.get("emailAddress")],
               "marketingAllowed": bool(c.get("marketingAllowed")),
               "since": datetime.fromtimestamp((c.get("customerSince") or 0) / 1000, timezone.utc) if c.get("customerSince") else None}
        await db.clover_customers.update_one({"id": c["id"]}, {"$set": doc}, upsert=True)
    await db.agent_state.update_one({"key": "clover_customers_sync"}, {"$set": {"key": "clover_customers_sync", "at": datetime.now(timezone.utc), "count": len(rows)}}, upsert=True)
    return len(rows)


def _label(c: dict) -> str:
    name = f"{c.get('firstName', '')} {c.get('lastName', '')}".strip()
    if name:
        return name.title() if name.isupper() or name.islower() else name
    if c.get("phones"):
        d = _digits(c["phones"][0])
        return f"Customer ···{d[-4:]}" if d else "Customer"
    return "Customer " + c.get("id", "")[-4:]


async def _build(db) -> tuple[dict, dict, dict]:
    customers = {c["id"]: c async for c in db.clover_customers.find({}, {"_id": 0})}
    products = {str(p["cloverItemId"]): p async for p in db.products.find({"cloverItemId": {"$nin": [None, ""]}},
                                                                           {"_id": 0, "cloverItemId": 1, "brandName": 1, "category": 1, "id": 1, "image": 1})}
    visits: dict = defaultdict(list)
    async for o in db.store_orders.find({"customerId": {"$nin": [None, ""]}, "paymentState": {"$ne": "REFUNDED"}}, {"_id": 0, "search": 0}):
        visits[o["customerId"]].append(o)
    return customers, products, visits


def _profile(cid: str, c: dict, orders: list, products: dict, today: date, employees: dict) -> dict:
    orders = sorted(orders, key=lambda o: o["createdAt"])
    local = [(_aware(o["createdAt"]).astimezone(ET), o) for o in orders]
    days = sorted({d.date() for d, _ in local})
    gaps = [(b - a).days for a, b in zip(days, days[1:])]
    spend = round(sum(o["total"] for o in orders), 2)
    items, brands, cats = Counter(), Counter(), Counter()
    for _, o in local:
        for it in o.get("items") or []:
            items[it["name"]] += it.get("qty") or 1
            p = products.get(it.get("itemId") or "") or {}
            if p.get("brandName"):
                brands[p["brandName"].strip().title()] += it.get("qty") or 1
            if p.get("category"):
                cats[p["category"].strip().title()] += it.get("qty") or 1
    last = days[-1] if days else None
    since = (today - last).days if last else None
    avg_gap = round(mean(gaps), 1) if gaps else None
    hours = Counter(d.hour for d, _ in local)
    weekdays = Counter(d.weekday() for d, _ in local)
    emp = Counter(o.get("employeeId") for _, o in local if o.get("employeeId"))
    month_start = today.replace(day=1)
    return {
        "id": cid, "name": _label(c) if c else "Customer " + cid[-4:], "phone": (c.get("phones") or [""])[0] if c else "",
        "email": (c.get("emails") or [""])[0] if c else "", "marketingAllowed": bool(c and c.get("marketingAllowed")),
        "visits": len(days), "orders": len(orders), "spend": spend, "average": round(spend / len(orders), 2) if orders else 0,
        "firstVisit": days[0].isoformat() if days else None, "lastVisit": last.isoformat() if last else None, "daysSinceLast": since,
        "everyDays": avg_gap, "monthSpend": round(sum(o["total"] for d, o in local if d.date() >= month_start), 2),
        "monthVisits": len({d.date() for d, _ in local if d.date() >= month_start}),
        "visits30": len({d.date() for d, _ in local if (today - d.date()).days < 30}),
        "topItems": [{"name": n, "qty": round(q, 1)} for n, q in items.most_common(5)],
        "topBrand": brands.most_common(1)[0][0] if brands else "", "topCategory": cats.most_common(1)[0][0] if cats else "",
        "usualTime": _hour(hours.most_common(1)[0][0]) if hours else "", "usualDay": DAYS[weekdays.most_common(1)[0][0]] if weekdays else "",
        "servedBy": (employees.get(emp.most_common(1)[0][0]) or {}).get("name", "") if emp else "",
        "receiptIds": [o["id"] for o in orders][-50:],
    }


def _tags(p: dict, vip_cut: float, today: date) -> list[str]:
    tags = []
    if p["spend"] >= vip_cut and p["visits"] >= 2:
        tags.append("VIP")
    if p["visits30"] >= 4:
        tags.append("Regular")
    if p["firstVisit"] and (today - date.fromisoformat(p["firstVisit"])).days < 7:
        tags.append("New")
    if p["everyDays"] and p["visits"] >= 3 and p["daysSinceLast"] is not None and p["daysSinceLast"] >= max(7, 2.5 * p["everyDays"]):
        tags.append("Overdue")
    if p["daysSinceLast"] is not None and p["daysSinceLast"] >= 90:
        tags.append("Lost")
    return tags


async def report(db, employees: dict) -> dict:
    today = datetime.now(ET).date()
    customers, products, visits = await _build(db)
    profiles = [_profile(cid, customers.get(cid) or {}, orders, products, today, employees) for cid, orders in visits.items()]
    spends = sorted((p["spend"] for p in profiles), reverse=True)
    vip_cut = spends[max(0, len(spends) // 10 - 1)] if len(spends) >= 10 else (spends[0] if spends else 0)
    for p in profiles:
        p["tags"] = _tags(p, vip_cut, today)
        p.pop("receiptIds", None)
    profiles.sort(key=lambda p: -p["spend"])
    total = round(sum(p["spend"] for p in profiles), 2)
    top20 = profiles[: max(1, len(profiles) // 5)]
    store_total = 0.0
    linked_orders = sum(p["orders"] for p in profiles)
    all_orders = 0
    async for o in db.store_orders.find({"paymentState": {"$ne": "REFUNDED"}}, {"_id": 0, "total": 1}):
        store_total += o["total"]
        all_orders += 1
    return {
        "customers": profiles,
        "summary": {"count": len(profiles), "inClover": len(customers), "spend": total,
                    "linkedShare": round(linked_orders / all_orders * 100, 1) if all_orders else 0,
                    "top20Share": round(sum(p["spend"] for p in top20) / total * 100, 1) if total else 0,
                    "vip": sum(1 for p in profiles if "VIP" in p["tags"]), "regular": sum(1 for p in profiles if "Regular" in p["tags"]),
                    "overdue": sum(1 for p in profiles if "Overdue" in p["tags"]), "new": sum(1 for p in profiles if "New" in p["tags"]),
                    "marketing": sum(1 for c in customers.values() if c.get("marketingAllowed")),
                    "historyStart": (await db.store_orders.find_one({"customerId": {"$nin": [None, ""]}}, {"date": 1}, sort=[("date", 1)]) or {}).get("date")},
        "vipItems": _vip_items(profiles),
    }


def _vip_items(profiles: list) -> list:
    c = Counter()
    for p in profiles:
        if "VIP" in p.get("tags", []):
            for it in p["topItems"]:
                c[it["name"]] += it["qty"]
    return [{"name": n, "qty": round(q, 1)} for n, q in c.most_common(8)]


async def detail(db, customer_id: str, employees: dict) -> Optional[dict]:
    today = datetime.now(ET).date()
    c = await db.clover_customers.find_one({"id": customer_id}, {"_id": 0}) or {}
    orders = await db.store_orders.find({"customerId": customer_id, "paymentState": {"$ne": "REFUNDED"}}, {"_id": 0, "search": 0}).to_list(2000)
    if not orders and not c:
        return None
    products = {str(p["cloverItemId"]): p async for p in db.products.find({"cloverItemId": {"$nin": [None, ""]}},
                                                                           {"_id": 0, "cloverItemId": 1, "brandName": 1, "category": 1})}
    p = _profile(customer_id, c, orders, products, today, employees)
    p["tags"] = _tags(p, float("inf"), today)
    months: dict = defaultdict(float)
    for o in orders:
        months[_aware(o["createdAt"]).astimezone(ET).strftime("%Y-%m")] += o["total"]
    p["months"] = [{"month": m, "spend": round(v, 2)} for m, v in sorted(months.items())]
    p["receipts"] = [{"id": o["id"], "createdAt": _aware(o["createdAt"]).isoformat().replace("+00:00", "Z"), "total": o["total"],
                      "items": [i["name"] for i in o.get("items") or []][:6]} for o in sorted(orders, key=lambda o: o["createdAt"], reverse=True)[:60]]
    # website orders from the same phone or email
    phones = {_digits(x) for x in c.get("phones") or [] if _digits(x)}
    emails = set(c.get("emails") or [])
    web = []
    if phones or emails:
        async for w in db.orders.find({"$or": [{"shipping.email": {"$in": list(emails)}}, {"shipping.phone": {"$exists": True}}]},
                                      {"_id": 0, "orderNumber": 1, "total": 1, "createdAt": 1, "shipping.phone": 1, "shipping.email": 1}).limit(2000):
            sh = w.get("shipping") or {}
            if (sh.get("email") or "").lower() in emails or _digits(sh.get("phone") or "") in phones:
                web.append({"orderNumber": w.get("orderNumber"), "total": float(w.get("total") or 0),
                            "createdAt": (_aware(w.get("createdAt")) or datetime.now(timezone.utc)).isoformat().replace("+00:00", "Z")})
    p["webOrders"] = web
    return p


async def regulars_card(db, employees: dict) -> dict:
    """Small summary for the Dashboard."""
    rep = await report(db, employees)
    cs = rep["customers"]
    month = sorted([c for c in cs if c["monthSpend"] > 0], key=lambda c: -c["monthSpend"])[:5]
    overdue = sorted([c for c in cs if "Overdue" in c["tags"]], key=lambda c: -c["spend"])[:5]
    new = [c for c in cs if "New" in c["tags"]][:5]
    slim = lambda c: {k: c[k] for k in ("id", "name", "spend", "monthSpend", "visits", "lastVisit", "daysSinceLast", "everyDays", "topItems", "tags")}
    return {"topMonth": [slim(c) for c in month], "overdue": [slim(c) for c in overdue], "new": [slim(c) for c in new],
            "count": rep["summary"]["count"]}

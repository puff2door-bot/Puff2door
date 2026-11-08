"""HD AgentOS: real, read-only store checks that run on a schedule and email the owner.

Every agent only READS data and reports. None of them changes products, prices, orders,
Clover, payments or listings. Results are saved in `agent_runs` so the admin page can
show the latest outcome, and alerts / the morning briefing go to NOTIFY_EMAIL.
Everything here is free: plain Python checks plus the site's existing email service.
"""
from __future__ import annotations

import asyncio
import re
import time
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import Any, Awaitable, Callable, Optional
from zoneinfo import ZoneInfo

import httpx

ET = ZoneInfo("America/New_York")
THC_CATEGORIES = {"delta", "delta-cartridges", "delta-edibles", "delta-smokeables", "kratom"}
CLAIM_WORDS = re.compile(
    r"\b(cure[sd]?|treat(s|ment)?|pain[\s-]*relief|relieves?|anxiety|insomnia|medical|medicinal|heal(s|ing)?|"
    r"fda[\s-]*approved|prevents?|therapeutic|health benefits?|safer than|harmless)\b", re.I)
LOW_STOCK = 1  # many items are stocked in ones and twos, so "low" means the last one

AGENTS = [
    {"id": "operations", "number": 1, "name": "Operations", "schedule": "Every hour",
     "description": "Watches the Clover sync and emails you if it fails or products stop matching."},
    {"id": "marketing", "number": 2, "name": "Marketing & SEO", "schedule": "Mondays",
     "description": "Finds products missing descriptions or photos, empty categories and sitemap problems."},
    {"id": "briefing", "number": 3, "name": "Owner briefing", "schedule": "Daily, 8 AM",
     "description": "Morning email: yesterday's website orders, low stock and anything that needs you."},
    {"id": "watchdog", "number": 4, "name": "Website watchdog", "schedule": "Every 15 minutes",
     "description": "Checks the homepage, shop, checkout data and sitemap; emails you if anything is down."},
    {"id": "reputation", "number": 5, "name": "Review & reputation", "schedule": "Mondays",
     "description": "Weekly reminder with links to your Google and Yelp reviews, plus reply templates."},
    {"id": "compliance", "number": 6, "name": "Compliance guardian", "schedule": "Daily",
     "description": "Flags health-claim wording and THC/kratom items missing the 21+ or ID setting."},
    {"id": "inventory", "number": 7, "name": "Inventory & reorder", "schedule": "Daily",
     "description": "Smart reorder from real sales: what to reorder and how many, plus slow movers to stop buying. Never orders anything."},
    {"id": "photos", "number": 8, "name": "Product photo agent", "schedule": "Daily",
     "description": "Lists in-stock products with no real photo, most stock first."},
    {"id": "support", "number": 9, "name": "Customer support", "schedule": "Templates",
     "description": "Saved answers for Live Chat: hours, ID rules, delivery area, pickup, payment."},
    {"id": "delivery", "number": 11, "name": "Delivery readiness", "schedule": "Daily",
     "description": "Checks delivery ZIPs, hours, tax, email and the delivery window are set up."},
    {"id": "social", "number": 12, "name": "Daily social studio", "schedule": "Daily, 11 AM",
     "description": "Posts a new Instagram image every day; warns before the connection expires."},
]
AGENT_IDS = {a["id"] for a in AGENTS}


class Ctx:
    """What the agents may read. Built by server.py."""

    def __init__(self, db, public_url: str, get_settings: Callable[[], Awaitable[dict]],
                 clover_status: Callable[[], Awaitable[dict]], instagram_status: Callable[[], Awaitable[dict]],
                 clover_factory: Optional[Callable[[], Any]] = None):
        self.db = db
        self.public_url = public_url.rstrip("/")
        self.get_settings = get_settings
        self.clover_status = clover_status
        self.instagram_status = instagram_status
        self.clover_factory = clover_factory


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _result(agent: str, status: str, headline: str, items: Optional[list] = None, data: Optional[dict] = None) -> dict:
    return {"agent": agent, "status": status, "headline": headline, "items": (items or [])[:60],
            "data": data or {}, "ranAt": _now()}


def issue_key(text: str) -> str:
    """Stable key for an item line so the owner can ignore it; numbers are dropped so
    '3 left' and '2 left' are the same issue."""
    return re.sub(r"[^a-z]+", " ", str(text).lower()).strip()[:160]


async def apply_ignores(db, result: dict) -> dict:
    ignored = {r["key"] async for r in db.agent_ignores.find({"agent": result["agent"]}, {"_id": 0, "key": 1})}
    if not ignored:
        return result
    kept = [i for i in result.get("items", []) if issue_key(i) not in ignored]
    hidden = len(result.get("items", [])) - len(kept)
    result = dict(result, items=kept, ignoredCount=hidden)
    if not kept and result.get("status") == "warn":
        result["status"] = "ok"
    return result


async def _products(ctx: Ctx) -> list[dict]:
    return await ctx.db.products.find({}, {"_id": 0, "id": 1, "name": 1, "brand": 1, "brandName": 1, "categorySlug": 1,
                                           "category": 1, "stock": 1, "active": 1, "image": 1, "description": 1,
                                           "minimumAge": 1, "requiresIdAtDelivery": 1, "cloverItemId": 1,
                                           "slug": 1, "barcode": 1, "sku": 1, "price": 1, "cloverCategory": 1,
                                           "createdAt": 1}).to_list(5000)


def _placeholder_images(products: list[dict]) -> set:
    counts: dict = {}
    for p in products:
        if p.get("image"):
            counts[p["image"]] = counts.get(p["image"], 0) + 1
    return {img for img, n in counts.items() if n > 2}


# ---------------- individual agents ----------------
async def agent_operations(ctx: Ctx) -> dict:
    st = await ctx.clover_status()
    issues, status = [], "ok"
    last = _as_utc(st.get("lastSyncAt"))
    age_min = int((_now() - last).total_seconds() // 60) if last else None
    if not st.get("connected"):
        status = "alert"; issues.append("Clover is not connected to the website.")
    if st.get("lastSyncStatus") not in (None, "", "success"):
        status = "alert"; issues.append(f"Last Clover sync failed: {st.get('lastSyncError') or st.get('lastSyncStatus')}")
    if age_min is not None and age_min > 120:
        status = "alert" if status == "alert" or age_min > 360 else "warn"
        issues.append(f"Clover has not synced for {age_min // 60} h {age_min % 60} min.")
    if int(st.get("productsNeedingRetry") or 0):
        status = "warn" if status == "ok" else status
        issues.append(f"{st['productsNeedingRetry']} products are waiting to retry a Clover update.")
    unmatched = st.get("unmatchedItems") or []
    if unmatched:
        status = "warn" if status == "ok" else status
        issues.append(f"{len(unmatched)} Clover items are not linked to a website product.")
    sync_ok = status == "ok"
    products = await _products(ctx)
    unlinked = [p for p in products if not p.get("cloverItemId")]
    if unlinked:
        status = "warn" if status == "ok" else status
        issues.append(f"{len(unlinked)} website products are not in Clover: " + ", ".join(p["name"] for p in unlinked[:8]))
    active = [p for p in products if p.get("active") is not False]
    no_code = [p for p in active if not str(p.get("barcode") or "").strip() and not str(p.get("sku") or "").strip()]
    if no_code:
        status = "warn" if status == "ok" else status
        issues.append(f"{len(no_code)} products have no barcode or SKU in Clover (they can't be scanned): "
                      + ", ".join(p["name"] for p in no_code[:8]))
    codes: dict = {}
    for p in active:
        for code in {str(p.get("barcode") or "").strip(), str(p.get("sku") or "").strip()} - {""}:
            codes.setdefault(code, set()).add(p["name"].strip())
    dup_codes = {c: n for c, n in codes.items() if len(n) > 1}
    if dup_codes:
        status = "warn" if status == "ok" else status
        for code, names in list(dup_codes.items())[:8]:
            issues.append(f"Barcode {code} is on more than one item: " + " / ".join(sorted(names)))
    # Price changes since the last check (Clover is the source of truth for prices).
    snap = await ctx.db.agent_state.find_one({"key": "price_snapshot"}, {"_id": 0}) or {}
    previous = snap.get("prices") or {}
    current = {str(p["id"]): float(p.get("price") or 0) for p in active}
    changes = [p for p in active if str(p["id"]) in previous and abs(previous[str(p["id"])] - current[str(p["id"])]) >= 0.01]
    for p in changes[:15]:
        issues.append(f"Price changed: {p['name']} ${previous[str(p['id'])]:.2f} → ${current[str(p['id'])]:.2f}")
    await ctx.db.agent_state.update_one({"key": "price_snapshot"}, {"$set": {"key": "price_snapshot", "prices": current, "at": _now()}}, upsert=True)
    summary = st.get("lastSyncSummary") or {}
    data_fixes = len(issues) if sync_ok else 0
    headline = ("Clover sync healthy" if sync_ok else "Clover sync needs attention") + \
        (f" · product data to tidy up ({data_fixes})" if data_fixes else "") + \
        (f" · last sync {age_min} min ago" if age_min is not None else "") + \
        (f" · {summary.get('remoteItems')} Clover items" if summary.get("remoteItems") else "")
    return _result("operations", status, headline, issues, {"lastSyncMinutesAgo": age_min})


async def agent_marketing(ctx: Ctx) -> dict:
    products = [p for p in await _products(ctx) if p.get("active") is not False and int(p.get("stock") or 0) > 0]
    placeholders = _placeholder_images(products)
    no_desc = [p for p in products if len(str(p.get("description") or "").strip()) < 40]
    no_photo = [p for p in products if not p.get("image") or p["image"] in placeholders]
    names: dict = {}
    for p in products:
        names.setdefault(p["name"].strip().lower(), []).append(p)
    dupes = [v for v in names.values() if len(v) > 1]
    cats = await ctx.db.categories.find({"active": {"$ne": False}}, {"_id": 0, "slug": 1, "name": 1}).to_list(200)
    in_cat = {p.get("categorySlug") for p in products}
    empty_cats = [c["name"] for c in cats if c["slug"] not in in_cat]
    items, sitemap_urls = [], None
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            r = await client.get(f"{ctx.public_url}/sitemap.xml")
            sitemap_urls = r.text.count("<loc>") if r.status_code == 200 else None
    except Exception:
        sitemap_urls = None
    if sitemap_urls is None:
        items.append("The sitemap could not be read (Google uses it to find your pages).")
    if no_desc:
        items.append(f"{len(no_desc)} in-stock products have no real description (hurts Google ranking). "
                     "Examples: " + ", ".join(p["name"] for p in no_desc[:6]))
    if no_photo:
        items.append(f"{len(no_photo)} in-stock products show no real photo.")
    if dupes:
        items.append(f"{len(dupes)} product names appear twice: " + ", ".join(v[0]["name"] for v in dupes[:6]))
    if empty_cats:
        items.append("Categories with nothing in stock (customers see an empty page): " + ", ".join(empty_cats))
    status = "ok" if not items else ("alert" if sitemap_urls is None else "warn")
    headline = f"{len(products)} in-stock products · sitemap {sitemap_urls if sitemap_urls is not None else 'unreadable'} pages · {len(items)} fixes suggested"
    return _result("marketing", status, headline, items, {"noDescription": len(no_desc), "noPhoto": len(no_photo)})


SLOW_MS = 5000


async def _check(client: httpx.AsyncClient, url: str, must_contain: str = "") -> tuple[bool, str, int]:
    started = time.monotonic()
    try:
        r = await client.get(url)
        ms = int((time.monotonic() - started) * 1000)
        ok = r.status_code == 200 and (not must_contain or must_contain in r.text)
        return ok, f"{r.status_code} in {ms / 1000:.1f} s" + ("" if ok or r.status_code != 200 else " (unexpected content)"), ms
    except Exception as exc:
        return False, f"no response ({type(exc).__name__})", int((time.monotonic() - started) * 1000)


async def agent_watchdog(ctx: Ctx) -> dict:
    checks = [
        ("Homepage", f"{ctx.public_url}/", "HD Smoke Shop"),
        ("Shop page", f"{ctx.public_url}/shop", ""),
        ("Product data", f"{ctx.public_url}/api/products?limit=1", "products"),
        ("Delivery window (checkout)", f"{ctx.public_url}/api/delivery/window", ""),
        ("Sitemap", f"{ctx.public_url}/sitemap.xml", "<urlset"),
        ("robots.txt", f"{ctx.public_url}/robots.txt", "Sitemap"),
    ]
    items, failures, slow = [], [], []
    async with httpx.AsyncClient(timeout=25, follow_redirects=True, headers={"User-Agent": "HD-Watchdog/1.0"}) as client:
        for label, url, needle in checks:
            ok, detail, ms = await _check(client, url, needle)
            tag = "DOWN" if not ok else ("SLOW" if ms > SLOW_MS else "OK")
            items.append(f"{tag} · {label}: {detail}")
            if not ok:
                failures.append(label)
            elif ms > SLOW_MS:
                slow.append(label)
    status = "ok" if not failures and not slow else ("alert" if len(failures) > 1 or "Homepage" in failures or "Product data" in failures else "warn")
    if failures:
        headline = "Problem: " + ", ".join(failures)
    elif slow:
        headline = "Site is up but slow: " + ", ".join(slow) + " (customers may leave)"
    else:
        headline = "All website checks passed"
    return _result("watchdog", status, headline, items, {"failures": failures, "slow": slow})


async def agent_reputation(ctx: Ctx) -> dict:
    settings = await ctx.get_settings()
    links = [
        f"Google reviews: {settings.get('googleReviewUrl') or 'https://www.google.com/maps/search/HD+Smoke+Shop+Altamonte+Springs'}",
        "Yelp reviews: https://biz.yelp.com/home/hLkli3XnmbGWSP-Ft8j5TQ/",
        "Reply to every review within a few days; use the templates on the Agents page.",
        "Ask happy customers at the counter to leave a Google review (the printed review cards help).",
    ]
    return _result("reputation", "ok", "Weekly review check reminder", links)


async def agent_compliance(ctx: Ctx) -> dict:
    products = [p for p in await _products(ctx) if p.get("active") is not False]
    items = []
    for p in products:
        text = f"{p.get('name', '')} {p.get('description', '')}"
        m = CLAIM_WORDS.search(text)
        if m:
            items.append(f"Health-claim wording “{m.group(0)}” in: {p['name']}")
    for p in products:
        if p.get("categorySlug") in THC_CATEGORIES:
            problems = []
            if int(p.get("minimumAge") or 21) < 21:
                problems.append("age under 21")
            if p.get("requiresIdAtDelivery") is False:
                problems.append("ID at delivery turned off")
            if problems:
                items.append(f"{p['name']}: " + ", ".join(problems))
    strong = re.compile(r"\b(thc-?p|thc-?a|hhc-?p|thc-?o|d-?10|delta[\s-]*10)\b", re.I)
    for p in products:
        m = strong.search(p.get("name", ""))
        if m:
            items.append(f"Contains “{m.group(0)}” (check it is legal to sell in Florida and keep off Instagram): {p['name']}")
    young = [p for p in products if p.get("minimumAge") is not None and int(p["minimumAge"]) < 21 and p.get("categorySlug") not in THC_CATEGORIES]
    if young:
        items.append(f"{len(young)} products are set below age 21: " + ", ".join(p["name"] for p in young[:6]))
    status = "ok" if not items else "warn"
    headline = f"{len(products)} products checked · " + ("no problems found" if not items else f"{len(items)} to review")
    return _result("compliance", status, headline, items)


async def agent_inventory(ctx: Ctx) -> dict:
    import sales
    products = [p for p in await _products(ctx) if p.get("active") is not False]
    velocity = await sales.item_velocity(ctx.db, 28)
    last = await sales.last_sold(ctx.db)
    start = await sales.history_start(ctx.db)
    today = datetime.now(ET).date()
    urgent, dead, skip = [], [], []
    for p in products:
        stock = int(p.get("stock") or 0)
        v = velocity.get(p["id"]) or {}
        per_week = float(v.get("perWeek") or 0)
        if per_week >= 0.5:
            days_left = stock / (per_week / 7)
            if days_left <= 10:
                qty = sales.reorder_suggestion(stock, per_week)
                if qty > 0:
                    urgent.append((days_left, p, per_week, qty))
        sold = last.get(p["id"])
        created = _as_utc(p.get("createdAt"))
        on_shelf_days = (_now() - created).days if created else 0
        if start and (today - date.fromisoformat(start)).days >= 60 and on_shelf_days >= 60:
            if stock > 0 and (not sold or (today - date.fromisoformat(sold)).days >= 60):
                dead.append(p)
            if stock <= 0 and (not sold or (today - date.fromisoformat(sold)).days >= 60):
                skip.append(p)
    urgent.sort(key=lambda r: (-r[2], r[0]))  # fastest sellers first
    items = []
    for days_left, p, per_week, qty in urgent[:30]:
        d = max(1, int(days_left))
        when = "OUT now" if int(p.get("stock") or 0) <= 0 else f"runs out in about {d} day{'s' if d != 1 else ''}"
        items.append(f"REORDER {qty} · {p['name'].strip()} — sells ~{per_week:g}/week, {int(p.get('stock') or 0)} left, {when}")
    if dead:
        dead.sort(key=lambda p: -int(p.get("stock") or 0))
        items.append(f"SLOW · {len(dead)} items haven't sold in 60+ days (don't reorder; consider a counter display): "
                     + ", ".join(f"{p['name'].strip()} ({int(p.get('stock') or 0)})" for p in dead[:12]))
    if skip:
        items.append(f"SKIP · {len(skip)} out-of-stock items haven't sold in 60+ days, so no need to restock: "
                     + ", ".join(p["name"].strip() for p in skip[:10]))
    status = "warn" if urgent else "ok"
    headline = f"{len(urgent)} best sellers to reorder now · {len(dead)} slow movers"
    return _result("inventory", status, headline, items, {"reorder": len(urgent), "slow": len(dead)})


async def agent_photos(ctx: Ctx) -> dict:
    products = await _products(ctx)
    placeholders = _placeholder_images(products)
    missing = [p for p in products if p.get("active") is not False and int(p.get("stock") or 0) > 0
               and (not p.get("image") or p["image"] in placeholders)]
    missing.sort(key=lambda p: -int(p.get("stock") or 0))
    items = [f"{p['name']} ({int(p.get('stock') or 0)} in stock)" for p in missing[:40]]
    if len(missing) > 40:
        items.append(f"…and {len(missing) - 40} more. Use Admin → Missing Photos to snap them.")
    status = "ok" if not missing else "warn"
    return _result("photos", status, f"{len(missing)} in-stock products need a photo", items, {"missing": len(missing)})


async def agent_support(ctx: Ctx) -> dict:
    return _result("support", "ok", "Reply templates ready on the Agents page")


async def agent_delivery(ctx: Ctx) -> dict:
    from emails import EMAIL_ENABLED, NOTIFY_EMAIL
    s = await ctx.get_settings()
    items = []
    if not (s.get("allowedZipCodes") or s.get("deliveryZip")):
        items.append("No delivery ZIP codes are set.")
    if not s.get("deliveryDays"):
        items.append("No delivery days are selected.")
    if str(s.get("deliveryStart", "")) >= str(s.get("deliveryEnd", "")):
        items.append(f"Delivery hours look wrong: {s.get('deliveryStart')}–{s.get('deliveryEnd')}.")
    if not float(s.get("taxRate") or 0):
        items.append("Sales tax rate is 0%.")
    if not EMAIL_ENABLED:
        items.append("Order emails are turned off (email service not configured).")
    if not NOTIFY_EMAIL:
        items.append("No owner email is set for alerts (NOTIFY_EMAIL).")
    recent = await ctx.db.orders.find(
        {"createdAt": {"$gte": _now() - timedelta(days=3)}},
        {"_id": 0, "orderNumber": 1, "createdAt": 1, "manualStatus": 1, "paymentStatus": 1, "fulfillment": 1, "statusHistory": 1},
    ).to_list(500)
    for o in recent:
        status_now = o.get("manualStatus") or "placed"
        if status_now in ("delivered", "cancelled", "returned") or o.get("paymentStatus") in ("awaiting_payment", "refunded"):
            continue
        history = o.get("statusHistory") or {}
        since = _as_utc(history.get(status_now)) or _as_utc(o.get("createdAt"))
        if not since:
            continue
        hours = (_now() - since).total_seconds() / 3600
        pickup = o.get("fulfillment") == "pickup"
        limit = 24 if (pickup and status_now == "out_for_delivery") else 2
        if hours >= limit:
            label = {"placed": "not started", "confirmed": "still being prepared",
                     "out_for_delivery": "waiting at the counter for pickup" if pickup else "out for delivery"}.get(status_now, status_now)
            items.append(f"Order {o.get('orderNumber')} {label} for {int(hours)} h")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{ctx.public_url}/api/delivery/window")
            if r.status_code != 200:
                items.append(f"Delivery window check returned {r.status_code}.")
    except Exception:
        items.append("Delivery window could not be checked.")
    status = "ok" if not items else "warn"
    headline = ("Delivery and checkout settings look right" if not items else f"{len(items)} delivery settings to check") + \
        f" · {len(s.get('allowedZipCodes') or [])} ZIPs · {s.get('deliveryStart')}–{s.get('deliveryEnd')}"
    return _result("delivery", status, headline, items)


async def agent_social(ctx: Ctx) -> dict:
    st = await ctx.instagram_status()
    items, status = [], "ok"
    if not st.get("connected"):
        return _result("social", "alert", "Instagram is not connected. Open Agents → Connect Instagram.")
    if not st.get("autoPublishEnabled"):
        status = "warn"; items.append("Daily posting is paused.")
    connected = _as_utc(st.get("connectedAt"))
    if connected:
        days = (_now() - connected).days
        if days >= 53:
            status = "alert" if days >= 59 else "warn"
            items.append(f"Instagram connection is {days} days old and Meta expires it around day 60. "
                         "Click Connect Instagram on the Agents page to renew (30 seconds).")
    last = _as_utc(st.get("lastPostAt"))
    local = _now().astimezone(ET)
    if st.get("autoPublishEnabled") and last and (local - last.astimezone(ET)).days >= 2:
        status = "warn" if status == "ok" else status
        items.append("No Instagram post in the last 2 days. The site may have been asleep at post time.")
    when = f"{int(st.get('scheduleHour', 11)) % 12 or 12}:{int(st.get('scheduleMinute', 0)):02d} {'AM' if int(st.get('scheduleHour', 11)) < 12 else 'PM'}"
    headline = f"@{st.get('username')} · daily post at {when}" + (f" · last post {last.astimezone(ET):%b %d}" if last else "")
    if st.get("lastPostPermalink"):
        items.append(f"Latest post: {st['lastPostPermalink']}")
    return _result("social", status, headline, items)


async def agent_briefing(ctx: Ctx) -> dict:
    import sales
    local = _now().astimezone(ET)
    yday = (local - timedelta(days=1)).date()
    last_week = yday - timedelta(days=7)
    y = await sales.day_summary(ctx.db, yday) or {}
    lw = await sales.day_summary(ctx.db, last_week) or {}
    total = float(y.get("storeRevenue") or 0) + float(y.get("webRevenue") or 0)
    prev = float(lw.get("storeRevenue") or 0) + float(lw.get("webRevenue") or 0)
    change = f" ({'+' if total >= prev else ''}{(total - prev) / prev * 100:.0f}% vs last {yday:%A})" if prev else ""
    items = [
        f"Sales yesterday ({yday:%a %b %d}): ${total:,.2f}{change}",
        f"In store: {int(y.get('storeOrders') or 0)} orders · ${float(y.get('storeRevenue') or 0):,.2f}   |   Website: {int(y.get('webOrders') or 0)} orders · ${float(y.get('webRevenue') or 0):,.2f}",
    ]
    top = await sales.top_sellers(ctx.db, yday, yday, 6)
    named = [t for t in top if t["name"].lower() != "custom item"][:5]
    if named:
        items.append("Top sellers: " + ", ".join(f"{t['name'].strip()} ({t['qty']:g})" for t in named))
    custom = next((t for t in top if t["name"].lower() == "custom item"), None)
    if custom and total:
        share = custom["revenue"] / total * 100
        if share >= 10:
            items.append(f"{share:.0f}% of sales were rung up as “Custom Item”. Scanning products instead keeps stock and the reorder list accurate.")
    latest = await latest_results(ctx.db)
    for a in AGENTS:
        r = latest.get(a["id"])
        if a["id"] == "briefing" or not r:
            continue
        mark = {"ok": "✓", "warn": "!", "alert": "‼"}.get(r.get("status"), "·")
        items.append(f"{mark} {a['name']}: {r.get('headline', '')}")
    attention = [a["name"] for a in AGENTS if (latest.get(a["id"]) or {}).get("status") in ("warn", "alert") and a["id"] != "briefing"]
    status = "alert" if any((latest.get(a) or {}).get("status") == "alert" for a in AGENT_IDS) else ("warn" if attention else "ok")
    headline = f"${total:,.0f} in sales yesterday{change} · " + ("everything looks good" if not attention else "needs you: " + ", ".join(attention))
    return _result("briefing", status, headline, items, {"revenue": total})


async def agent_weekly(ctx: Ctx) -> dict:
    """Friday summary: the last 7 days vs the 7 before."""
    import sales
    today = _now().astimezone(ET).date()
    days = await ctx.db.sales_days.find({"date": {"$gte": (today - timedelta(days=14)).isoformat(), "$lt": today.isoformat()}}, {"_id": 0}).to_list(30)
    cut = (today - timedelta(days=7)).isoformat()
    this = [d for d in days if d["date"] >= cut]
    before = [d for d in days if d["date"] < cut]
    rev = lambda rows: sum(float(d.get("storeRevenue") or 0) + float(d.get("webRevenue") or 0) for d in rows)
    orders = lambda rows: sum(int(d.get("storeOrders") or 0) + int(d.get("webOrders") or 0) for d in rows)
    t, b = rev(this), rev(before)
    change = f" ({'+' if t >= b else ''}{(t - b) / b * 100:.0f}% vs the week before)" if b else ""
    best = max(this, key=lambda d: float(d.get("storeRevenue") or 0) + float(d.get("webRevenue") or 0), default=None)
    items = [f"Sales: ${t:,.2f} from {orders(this)} orders{change}"]
    if best:
        items.append(f"Best day: {date.fromisoformat(best['date']):%A} (${float(best.get('storeRevenue') or 0) + float(best.get('webRevenue') or 0):,.2f})")
    top = [x for x in await sales.top_sellers(ctx.db, today - timedelta(days=7), today - timedelta(days=1), 12) if x["name"].lower() != "custom item"][:8]
    if top:
        items.append("Top sellers: " + ", ".join(f"{x['name'].strip()} ({x['qty']:g})" for x in top))
    fixed = await ctx.db.agent_state.find({"key": {"$regex": "^alert:"}, "alerting": False}, {"_id": 0}).to_list(50)
    latest = await latest_results(ctx.db)
    open_items = [f"{a['name']}: {latest[a['id']]['headline']}" for a in AGENTS if a["id"] in latest and latest[a["id"]].get("status") != "ok" and a["id"] not in ("briefing",)]
    if open_items:
        items.append("Still open: " + " | ".join(open_items))
    return _result("weekly", "ok", f"Week ending {today - timedelta(days=1):%b %d}: ${t:,.0f} in sales{change}", items, {"revenue": t})


RUNNERS: dict[str, Callable[[Ctx], Awaitable[dict]]] = {
    "operations": agent_operations, "marketing": agent_marketing, "briefing": agent_briefing,
    "watchdog": agent_watchdog, "reputation": agent_reputation, "compliance": agent_compliance,
    "inventory": agent_inventory, "photos": agent_photos, "support": agent_support,
    "delivery": agent_delivery, "social": agent_social, "weekly": agent_weekly,
}


# ---------------- storage ----------------
async def save_result(db, result: dict) -> None:
    await db.agent_runs.insert_one(dict(result))
    keep = await db.agent_runs.find({"agent": result["agent"]}, {"_id": 1}).sort("ranAt", -1).skip(30).to_list(500)
    if keep:
        await db.agent_runs.delete_many({"_id": {"$in": [k["_id"] for k in keep]}})


async def latest_results(db) -> dict:
    out = {}
    for agent_id in AGENT_IDS:
        row = await db.agent_runs.find_one({"agent": agent_id}, {"_id": 0}, sort=[("ranAt", -1)])
        if row:
            out[agent_id] = row
    return out


async def run_agent(ctx: Ctx, agent_id: str, save: bool = True) -> dict:
    if agent_id not in RUNNERS:
        raise KeyError(agent_id)
    try:
        result = await RUNNERS[agent_id](ctx)
    except Exception as exc:  # an agent crashing is itself worth reporting
        result = _result(agent_id, "alert", f"The check could not run ({type(exc).__name__}).", [str(exc)[:300]])
    result = await apply_ignores(ctx.db, result)
    if save:
        await save_result(ctx.db, result)
    return result


# ---------------- emails ----------------
def _email_html(title: str, results: list[dict], intro: str = "") -> str:
    from emails import layout
    color = {"ok": "#047857", "warn": "#b45309", "alert": "#b91c1c"}
    label = {"ok": "All good", "warn": "Take a look", "alert": "Needs you now"}
    names = {a["id"]: a["name"] for a in AGENTS} | {"weekly": "Weekly summary"}
    blocks = [f"<p style='margin:0 0 14px;color:#404040'>{escape(intro)}</p>"] if intro else []
    for r in results:
        st = r.get("status", "ok")
        rows = "".join(f"<li style='margin:4px 0'>{escape(str(i))}</li>" for i in r.get("items", [])[:25])
        blocks.append(
            f"<div style='border:1px solid #e5e5e5;border-left:4px solid {color[st]};border-radius:10px;padding:12px 14px;margin:0 0 12px'>"
            f"<div style='font-size:12px;font-weight:700;color:{color[st]};text-transform:uppercase;letter-spacing:.06em'>{label[st]}</div>"
            f"<div style='font-weight:700;font-size:15px;margin:2px 0 4px'>{escape(names.get(r['agent'], r['agent']))}</div>"
            f"<div style='color:#404040;font-size:14px'>{escape(r.get('headline', ''))}</div>"
            + (f"<ul style='padding-left:18px;margin:8px 0 0;color:#525252;font-size:13px'>{rows}</ul>" if rows else "")
            + "</div>")
    blocks.append("<p style='color:#737373;font-size:12px;margin-top:16px'>Sent by HD AgentOS. These checks only read your data; "
                  "nothing was changed. Open Admin → Agents to see details.</p>")
    return layout(title, "".join(blocks), title)


async def send_email(title: str, results: list[dict], kind: str, intro: str = "") -> None:
    import emails
    await emails._send([emails.NOTIFY_EMAIL], title, _email_html(title, results, intro), kind)


# ---------------- scheduler ----------------
async def _state(db, key: str) -> dict:
    return await db.agent_state.find_one({"key": key}, {"_id": 0}) or {"key": key}


async def _set_state(db, key: str, **values) -> None:
    await db.agent_state.update_one({"key": key}, {"$set": {"key": key, **values}}, upsert=True)


async def _due(db, key: str, every: timedelta) -> bool:
    last = _as_utc((await _state(db, key)).get("lastRunAt"))
    return not last or _now() - last >= every


async def _alert_on_change(ctx: Ctx, result: dict) -> None:
    """One email when a watched agent goes bad (a reminder at most once a day while it lasts) and one when it is fixed."""
    key = f"alert:{result['agent']}"
    st = await _state(ctx.db, key)
    bad = result["status"] == "alert"
    last_alert = _as_utc(st.get("lastAlertAt"))
    if bad and (not st.get("alerting") or not last_alert or _now() - last_alert > timedelta(hours=24)):
        await send_email(f"Alert: {result['headline']}", [result], f"agent_alert_{result['agent']}")
        await _set_state(ctx.db, key, alerting=True, lastAlertAt=_now())
    elif not bad and st.get("alerting"):
        await send_email(f"Resolved: {result['headline']}", [result], f"agent_resolved_{result['agent']}")
        await _set_state(ctx.db, key, alerting=False)


async def scheduler_tick(ctx: Ctx) -> None:
    db = ctx.db
    local = _now().astimezone(ET)
    if await _due(db, "watchdog", timedelta(minutes=14)):
        r = await run_agent(ctx, "watchdog")
        await _set_state(db, "watchdog", lastRunAt=_now())
        await _alert_on_change(ctx, r)
    if await _due(db, "operations", timedelta(minutes=55)):
        r = await run_agent(ctx, "operations")
        await _set_state(db, "operations", lastRunAt=_now())
        await _alert_on_change(ctx, r)
    if await _due(db, "sales", timedelta(minutes=55)):
        try:
            import sales
            if ctx.clover_factory:
                await sales.sync_sales(db, ctx.clover_factory(), days=3)
        except Exception:
            pass
        await _set_state(db, "sales", lastRunAt=_now())
    today = local.date().isoformat()
    daily = await _state(db, "daily")
    if (local.hour, local.minute) >= (7, 30) and daily.get("date") != today:
        for agent_id in ("inventory", "compliance", "photos", "delivery", "social"):
            await run_agent(ctx, agent_id)
        if local.weekday() == 0:  # Mondays
            for agent_id in ("marketing", "reputation"):
                await run_agent(ctx, agent_id)
        await _set_state(db, "daily", date=today)
    brief = await _state(db, "briefing")
    if (local.hour, local.minute) >= (8, 0) and brief.get("date") != today and (await _state(db, "daily")).get("date") == today:
        r = await run_agent(ctx, "briefing")
        latest = await latest_results(db)
        detail = [latest[a] for a in ("inventory", "photos", "compliance", "delivery", "operations", "watchdog", "social")
                  if a in latest and latest[a].get("status") != "ok"]
        if local.weekday() == 0:
            detail += [latest[a] for a in ("marketing", "reputation") if a in latest]
        await send_email(f"HD Smoke Shop morning briefing · {local:%a %b %d}", [r] + detail, "agent_briefing")
        await _set_state(db, "briefing", date=today)
    weekly = await _state(db, "weekly")
    if local.weekday() == 4 and (local.hour, local.minute) >= (17, 0) and weekly.get("date") != today:
        r = await run_agent(ctx, "weekly")
        await send_email(f"HD Smoke Shop weekly summary · week ending {local:%b %d}", [r], "agent_weekly")
        await _set_state(db, "weekly", date=today)


async def scheduler_loop(ctx: Ctx, logger) -> None:
    await asyncio.sleep(120)
    while True:
        try:
            await scheduler_tick(ctx)
        except Exception as exc:
            logger.error("Agent scheduler tick failed: %s", exc)
        await asyncio.sleep(300)

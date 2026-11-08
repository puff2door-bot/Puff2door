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
from datetime import datetime, timedelta, timezone
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
     "description": "Reorder list: out-of-stock items and items down to their last one, grouped by brand. Never orders anything."},
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
                 clover_status: Callable[[], Awaitable[dict]], instagram_status: Callable[[], Awaitable[dict]]):
        self.db = db
        self.public_url = public_url.rstrip("/")
        self.get_settings = get_settings
        self.clover_status = clover_status
        self.instagram_status = instagram_status


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


async def _products(ctx: Ctx) -> list[dict]:
    return await ctx.db.products.find({}, {"_id": 0, "id": 1, "name": 1, "brand": 1, "brandName": 1, "categorySlug": 1,
                                           "category": 1, "stock": 1, "active": 1, "image": 1, "description": 1,
                                           "minimumAge": 1, "requiresIdAtDelivery": 1, "cloverItemId": 1,
                                           "slug": 1}).to_list(5000)


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
    products = await _products(ctx)
    unlinked = [p for p in products if not p.get("cloverItemId")]
    if unlinked:
        status = "warn" if status == "ok" else status
        issues.append(f"{len(unlinked)} website products are not in Clover: " + ", ".join(p["name"] for p in unlinked[:8]))
    summary = st.get("lastSyncSummary") or {}
    headline = ("Clover sync healthy" if status == "ok" else "Clover sync needs attention") + \
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


async def _check(client: httpx.AsyncClient, url: str, must_contain: str = "") -> tuple[bool, str]:
    started = time.monotonic()
    try:
        r = await client.get(url)
        ms = int((time.monotonic() - started) * 1000)
        ok = r.status_code == 200 and (not must_contain or must_contain in r.text)
        return ok, f"{r.status_code} in {ms} ms" + ("" if ok or r.status_code != 200 else " (unexpected content)")
    except Exception as exc:
        return False, f"no response ({type(exc).__name__})"


async def agent_watchdog(ctx: Ctx) -> dict:
    checks = [
        ("Homepage", f"{ctx.public_url}/", "HD Smoke Shop"),
        ("Shop page", f"{ctx.public_url}/shop", ""),
        ("Product data", f"{ctx.public_url}/api/products?limit=1", "products"),
        ("Delivery window (checkout)", f"{ctx.public_url}/api/delivery/window", ""),
        ("Sitemap", f"{ctx.public_url}/sitemap.xml", "<urlset"),
        ("robots.txt", f"{ctx.public_url}/robots.txt", "Sitemap"),
    ]
    items, failures = [], []
    async with httpx.AsyncClient(timeout=25, follow_redirects=True, headers={"User-Agent": "HD-Watchdog/1.0"}) as client:
        for label, url, needle in checks:
            ok, detail = await _check(client, url, needle)
            items.append(f"{'OK' if ok else 'DOWN'} · {label}: {detail}")
            if not ok:
                failures.append(label)
    status = "ok" if not failures else ("alert" if len(failures) > 1 or "Homepage" in failures or "Product data" in failures else "warn")
    headline = "All website checks passed" if not failures else "Problem: " + ", ".join(failures)
    return _result("watchdog", status, headline, items, {"failures": failures})


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
    young = [p for p in products if p.get("minimumAge") is not None and int(p["minimumAge"]) < 21 and p.get("categorySlug") not in THC_CATEGORIES]
    if young:
        items.append(f"{len(young)} products are set below age 21: " + ", ".join(p["name"] for p in young[:6]))
    status = "ok" if not items else "warn"
    headline = f"{len(products)} products checked · " + ("no problems found" if not items else f"{len(items)} to review")
    return _result("compliance", status, headline, items)


async def agent_inventory(ctx: Ctx) -> dict:
    products = [p for p in await _products(ctx) if p.get("active") is not False]
    low = [p for p in products if 0 < int(p.get("stock") or 0) <= LOW_STOCK]
    out = [p for p in products if int(p.get("stock") or 0) <= 0]

    def by_brand(rows: list, label: str) -> list:
        groups: dict = {}
        for p in sorted(rows, key=lambda x: (str(x.get("brandName") or "zz"), x["name"])):
            groups.setdefault((p.get("brandName") or "No brand").title(), []).append(p["name"].strip())
        return [f"{label} · {brand} ({len(names)}): " + "; ".join(names) for brand, names in groups.items()]

    items = by_brand(out, "OUT") + by_brand(low, "LAST ONE")
    status = "ok" if not low and not out else "warn"
    headline = f"{len(out)} out of stock · {len(low)} down to the last one"
    return _result("inventory", status, headline, items, {"low": len(low), "out": len(out)})


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
    local = _now().astimezone(ET)
    start = (local - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    orders = await ctx.db.orders.find(
        {"createdAt": {"$gte": start.astimezone(timezone.utc), "$lt": end.astimezone(timezone.utc)}},
        {"_id": 0, "orderNumber": 1, "total": 1, "status": 1, "fulfillment": 1},
    ).to_list(1000)
    good = [o for o in orders if str(o.get("status", "")).lower() not in ("cancelled", "canceled", "expired")]
    revenue = round(sum(float(o.get("total") or 0) for o in good), 2)
    items = [f"Website orders yesterday ({start:%a %b %d}): {len(good)} · ${revenue:,.2f}"]
    latest = await latest_results(ctx.db)
    for a in AGENTS:
        r = latest.get(a["id"])
        if a["id"] == "briefing" or not r:
            continue
        mark = {"ok": "✓", "warn": "!", "alert": "‼"}.get(r.get("status"), "·")
        items.append(f"{mark} {a['name']}: {r.get('headline', '')}")
    attention = [a["name"] for a in AGENTS if (latest.get(a["id"]) or {}).get("status") in ("warn", "alert") and a["id"] != "briefing"]
    status = "alert" if any((latest.get(a) or {}).get("status") == "alert" for a in AGENT_IDS) else ("warn" if attention else "ok")
    headline = f"{len(good)} website orders yesterday · " + ("everything looks good" if not attention else "needs you: " + ", ".join(attention))
    return _result("briefing", status, headline, items, {"orders": len(good), "revenue": revenue})


RUNNERS: dict[str, Callable[[Ctx], Awaitable[dict]]] = {
    "operations": agent_operations, "marketing": agent_marketing, "briefing": agent_briefing,
    "watchdog": agent_watchdog, "reputation": agent_reputation, "compliance": agent_compliance,
    "inventory": agent_inventory, "photos": agent_photos, "support": agent_support,
    "delivery": agent_delivery, "social": agent_social,
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
    if save:
        await save_result(ctx.db, result)
    return result


# ---------------- emails ----------------
def _email_html(title: str, results: list[dict], intro: str = "") -> str:
    from emails import layout
    color = {"ok": "#047857", "warn": "#b45309", "alert": "#b91c1c"}
    label = {"ok": "All good", "warn": "Take a look", "alert": "Needs you now"}
    names = {a["id"]: a["name"] for a in AGENTS}
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
    """Email the owner when a watched agent goes bad, at most once every 6 hours, and once when it recovers."""
    key = f"alert:{result['agent']}"
    st = await _state(ctx.db, key)
    bad = result["status"] == "alert"
    last_alert = _as_utc(st.get("lastAlertAt"))
    if bad and (not st.get("alerting") or not last_alert or _now() - last_alert > timedelta(hours=6)):
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


async def scheduler_loop(ctx: Ctx, logger) -> None:
    await asyncio.sleep(120)
    while True:
        try:
            await scheduler_tick(ctx)
        except Exception as exc:
            logger.error("Agent scheduler tick failed: %s", exc)
        await asyncio.sleep(300)

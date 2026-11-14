"""Visitor areas for Admin > Visitors.

Records one small event per page view (and per add-to-cart) with the visitor's approximate area only:
city, region, country and, when Cloudflare provides it, ZIP. No names, no IP addresses, no cookies.
Admins and staff are never counted (the storefront also stops sending once a device has logged into Admin).
Events are deleted automatically after 90 days.

Location comes from Cloudflare's visitor-location headers when present; otherwise from the free
DB-IP City Lite database (CC BY 4.0, attribution shown in Admin), downloaded once at startup.
"""
from __future__ import annotations

import asyncio
import gzip
import ipaddress
import logging
import os
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx

logger = logging.getLogger("visitors")
ET = ZoneInfo("America/New_York")
RETENTION_SECONDS = 90 * 24 * 3600
DBIP_PATH = os.environ.get("DBIP_CITY_PATH", "/tmp/dbip-city-lite.mmdb")
BOT_RE = re.compile(r"bot|crawl|spider|slurp|lighthouse|headless|pagespeed|preview|facebookexternalhit|curl|wget|python|monitor|uptime", re.I)
MOBILE_RE = re.compile(r"iphone|android.+mobile|windows phone|mobile safari", re.I)
TABLET_RE = re.compile(r"ipad|tablet|android(?!.*mobile)", re.I)

_reader = None
_reader_lock = asyncio.Lock()


# ---------- location ----------
async def ensure_geo_db() -> None:
    """Download DB-IP City Lite (this month, else last month) once; quietly skip if it can't be fetched."""
    global _reader
    async with _reader_lock:
        if _reader is not None:
            return
        try:
            import maxminddb  # noqa: WPS433 (optional dependency)
        except Exception:  # pragma: no cover
            logger.warning("maxminddb not installed; visitor areas will rely on Cloudflare headers only")
            return
        if not os.path.exists(DBIP_PATH):
            now = datetime.now(timezone.utc)
            months = [now.strftime("%Y-%m"), (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")]
            for month in months:
                url = f"https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz"
                try:
                    tmp = DBIP_PATH + ".part"
                    async with httpx.AsyncClient(timeout=180, follow_redirects=True) as client:
                        async with client.stream("GET", url) as resp:
                            if resp.status_code != 200:
                                continue
                            with open(tmp + ".gz", "wb") as fh:
                                async for chunk in resp.aiter_bytes(1 << 20):
                                    fh.write(chunk)
                    await asyncio.to_thread(_gunzip, tmp + ".gz", tmp)
                    os.replace(tmp, DBIP_PATH)
                    logger.info("Downloaded DB-IP City Lite %s", month)
                    break
                except Exception as exc:  # network trouble: try the other month, then give up
                    logger.warning("DB-IP download failed for %s: %s", month, exc)
        if os.path.exists(DBIP_PATH):
            try:
                _reader = maxminddb.open_database(DBIP_PATH)
            except Exception as exc:
                logger.warning("DB-IP open failed: %s", exc)


def _gunzip(src: str, dst: str) -> None:
    with gzip.open(src, "rb") as fin, open(dst, "wb") as fout:
        while True:
            block = fin.read(1 << 20)
            if not block:
                break
            fout.write(block)
    os.remove(src)


def _name(node) -> str:
    if not isinstance(node, dict):
        return ""
    names = node.get("names") or {}
    return names.get("en") or ""


def locate(headers, ip: str) -> dict:
    """Approximate area for one request. Never returns or stores the IP itself."""
    city = (headers.get("cf-ipcity") or "").strip()
    if city:
        return {"city": city, "region": (headers.get("cf-region") or "").strip(),
                "country": (headers.get("cf-ipcountry") or "").strip().upper(),
                "zip": re.sub(r"\D", "", headers.get("cf-postal-code") or "")[:5], "geo": "cf"}
    out = {"city": "", "region": "", "country": (headers.get("cf-ipcountry") or "").strip().upper(), "zip": "", "geo": ""}
    if _reader is not None and ip:
        try:
            if ipaddress.ip_address(ip).is_private:
                return out
            rec = _reader.get(ip) or {}
            out.update({"city": _name(rec.get("city")),
                        "region": _name((rec.get("subdivisions") or [{}])[0]),
                        "country": ((rec.get("country") or {}).get("iso_code") or out["country"]).upper(),
                        "geo": "dbip"})
        except Exception:
            pass
    return out


# ---------- classification ----------
def device_of(ua: str) -> str:
    if TABLET_RE.search(ua or ""):
        return "tablet"
    if MOBILE_RE.search(ua or ""):
        return "phone"
    return "desktop"


def is_bot(ua: str) -> bool:
    return not ua or bool(BOT_RE.search(ua))


def source_of(ref: str, utm: str, own_host: str = "puff2door.com") -> str:
    utm = (utm or "").lower()
    if utm:
        if "gbp" in utm or "maps" in utm or "google_business" in utm:
            return "Google Maps"
        if "insta" in utm or utm == "ig":
            return "Instagram"
        if "google" in utm:
            return "Google search"
        return utm[:30].capitalize()
    host = (urlparse(ref).hostname or "").lower() if ref else ""
    if not host or host.endswith(own_host):
        return "Typed / bookmark"
    if "google." in host:
        return "Google Maps" if "/maps" in (ref or "") else "Google search"
    if "instagram" in host:
        return "Instagram"
    if "facebook" in host or host.startswith("fb."):
        return "Facebook"
    if "bing." in host or "duckduckgo" in host or "yahoo." in host:
        return "Other search"
    if "yelp." in host:
        return "Yelp"
    return "Other"


def clean_path(path: str) -> str:
    path = (path or "/").split("?")[0].split("#")[0][:200]
    return path if path.startswith("/") else "/" + path


# ---------- report ----------
def range_start(rng: str) -> datetime:
    now_et = datetime.now(ET)
    midnight = now_et.replace(hour=0, minute=0, second=0, microsecond=0)
    days = {"today": 0, "7d": 6, "30d": 29}.get(rng, 0)
    return (midnight - timedelta(days=days)).astimezone(timezone.utc)


def area_label(v: dict) -> str:
    country, region, city = v.get("country") or "", v.get("region") or "", v.get("city") or ""
    if country and country != "US":
        return "Outside the US"
    if region and region not in ("Florida", "FL"):
        return "Outside Florida"
    return city or "Unknown area"


def step_label(path: str, product_names: dict) -> str:
    if path == "/":
        return "Home"
    if path.startswith("/shop/"):
        return product_names.get(path[6:], "Product")
    if path.startswith("/product-category/"):
        return path.split("/")[2].replace("-", " ").title()
    if path.startswith("/brand/"):
        return path.split("/")[2].replace("-", " ").title()
    if path.startswith("/order/"):
        return "Order placed"
    named = {"/shop": "Shop", "/cart": "Cart", "/checkout": "Checkout", "/delivery-area": "Delivery area",
             "/delivery/lake-nona": "Lake Nona delivery", "/contact": "Contact & directions", "/live-shelf": "Live Shelf",
             "/track": "Track order", "/my-account": "Account", "/wishlist": "Wishlist", "/brands": "Brands", "/faq": "FAQ", "/about": "About"}
    return named.get(path, path)


async def report(db, rng: str, deliver_zips: set, deliver_cities: set) -> dict:
    start = range_start(rng)
    now = datetime.now(timezone.utc)
    rows = await db.visits.find({"at": {"$gte": start}}, {"_id": 0}).sort("at", 1).to_list(60000)
    sessions: dict = {}
    for v in rows:
        s = sessions.setdefault(v["sid"], {"first": v["at"], "last": v["at"], "area": area_label(v), "zip": v.get("zip") or "",
                                            "src": v.get("src") or "Typed / bookmark", "device": v.get("device") or "desktop",
                                            "paths": [], "cart": False, "checkout": False, "ordered": False, "geo": v.get("geo") or ""})
        s["last"] = v["at"]
        if v.get("zip") and not s["zip"]:
            s["zip"] = v["zip"]
        path = v.get("path") or "/"
        if v.get("event") == "cart":
            s["cart"] = True
        elif not s["paths"] or s["paths"][-1] != path:
            s["paths"].append(path)
        if path.startswith("/checkout"):
            s["checkout"] = True
        if path.startswith("/order/"):
            s["ordered"] = True

    def deliverable(s):
        return (s["zip"] and s["zip"] in deliver_zips) or s["area"] in deliver_cities

    areas = Counter()
    area_zips: dict = {}
    area_ok: dict = {}
    for s in sessions.values():
        areas[s["area"]] += 1
        if s["zip"]:
            area_zips.setdefault(s["area"], set()).add(s["zip"])
        area_ok[s["area"]] = area_ok.get(s["area"], False) or bool(deliverable(s))

    slugs = set()
    views = Counter()
    carts = Counter()
    for v in rows:
        p = v.get("path") or ""
        if v.get("event") == "cart" and v.get("product"):
            carts[v["product"]] += 1
            slugs.add(v["product"])
        elif p.startswith("/shop/") and v.get("event") != "cart":
            views[p[6:]] += 1
            slugs.add(p[6:])
    names = {}
    if slugs:
        async for prod in db.products.find({"slug": {"$in": list(slugs)}}, {"_id": 0, "slug": 1, "name": 1}):
            names[prod["slug"]] = prod.get("name") or prod["slug"]

    latest = sorted(sessions.values(), key=lambda s: s["last"], reverse=True)[:30]
    total = len(sessions)
    in_area = sum(1 for s in sessions.values() if deliverable(s))
    return {
        "range": rng,
        "visitors": total,
        "liveNow": sum(1 for s in sessions.values() if s["last"] >= now - timedelta(minutes=5)),
        "deliveryAreaShare": round(100 * in_area / total) if total else 0,
        "reachedCheckout": sum(1 for s in sessions.values() if s["checkout"]),
        "ordered": sum(1 for s in sessions.values() if s["ordered"]),
        "areas": [{"area": a, "count": n, "zips": sorted(area_zips.get(a, [])), "deliverable": area_ok.get(a, False)} for a, n in areas.most_common(12)],
        "sources": [{"source": k, "count": n} for k, n in Counter(s["src"] for s in sessions.values()).most_common(8)],
        "devices": [{"device": k, "count": n} for k, n in Counter(s["device"] for s in sessions.values()).most_common()],
        "latest": [{
            "at": s["last"].isoformat(), "area": s["area"], "zip": s["zip"], "source": s["src"], "device": s["device"],
            "steps": [step_label(p, names) for p in s["paths"][:6]],
            "result": "Ordered" if s["ordered"] else "Checkout" if s["checkout"] else "In cart" if s["cart"] else "Browsed",
        } for s in latest],
        "topProducts": [{"slug": k, "name": names.get(k, k), "views": n, "cartAdds": carts.get(k, 0)} for k, n in views.most_common(8)],
        "geoSources": dict(Counter(s["geo"] or "none" for s in sessions.values())),
        "dbipReady": _reader is not None,
    }

"""Price, name, and SKU decisions for two-way Clover sync.

Clover prices are cents on the wire and dollars on the website. The later edit
wins. A tie, or a price jump over 50% or down to $0, is not applied on its own.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional


def parse_time(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)) and value:
        seconds = float(value) / 1000 if float(value) > 10_000_000_000 else float(value)
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    return None


def catalog_winner(clover_modified: Any, website_updated: Any) -> str:
    clover_time = parse_time(clover_modified)
    website_time = parse_time(website_updated)
    if clover_time and website_time:
        if clover_time > website_time:
            return "clover"
        if website_time > clover_time:
            return "website"
        return "tie"
    if clover_time:
        return "clover"
    if website_time:
        return "website"
    return "tie"


def price_cents(dollars: Any) -> int:
    return max(0, int(round(float(dollars or 0) * 100)))


def price_guard(old_dollars: Any, new_dollars: Any, confirmed: bool) -> str:
    """Empty string means the Clover price write is allowed."""
    if confirmed:
        return ""
    new_value = float(new_dollars or 0)
    old_value = float(old_dollars or 0)
    if new_value <= 0:
        return "Clover price would become $0. Confirm this price before it is sent."
    if old_value > 0 and abs(new_value - old_value) / old_value > 0.5:
        return "Clover price would change by more than 50%. Confirm this price before it is sent."
    return ""


def field_changes(product: dict, item: dict, *, sync_prices: bool, sync_names: bool) -> list[dict]:
    winner = catalog_winner(item.get("modifiedTime"), product.get("updatedAt"))
    pairs = [
        ("name", str(product.get("name") or ""), str(item.get("name") or ""), sync_names),
        ("sku", str(product.get("sku") or ""), str(item.get("sku") or ""), sync_names),
        ("price", round(float(product.get("price") or 0), 2), round(float(item.get("price") or 0), 2), sync_prices),
    ]
    rows = []
    for field, local, remote, enabled in pairs:
        same = abs(local - remote) < 0.001 if field == "price" else local.strip() == remote.strip()
        if same:
            continue
        if field != "price" and not str(remote).strip() and not str(local).strip():
            continue
        if winner == "clover":
            direction = "clover_to_website"
            old, new = local, remote
        elif winner == "website":
            direction = "website_to_clover"
            old, new = remote, local
        else:
            direction = "conflict"
            old, new = local, remote
        blocked = ""
        if direction == "website_to_clover" and field == "price":
            blocked = price_guard(remote, local, False)
        rows.append({
            "field": field,
            "direction": direction,
            "productId": product.get("id"),
            "name": product.get("name") or item.get("name") or "",
            "cloverItemId": item.get("id"),
            "from": old,
            "to": new,
            "winner": winner,
            "conflict": direction == "conflict" or bool(blocked),
            "blocked": blocked,
            "enabled": enabled,
            "apply": bool(enabled) and direction != "conflict" and not blocked,
        })
    return rows


def normalized_name(value: Any) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())

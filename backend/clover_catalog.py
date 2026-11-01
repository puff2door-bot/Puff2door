"""Price, name, and SKU decisions for two-way Clover sync.

Clover prices are cents on the wire and dollars on the website. The later edit
wins. A tie, or a price jump over 50% or down to $0, is not applied on its own.
"""
from __future__ import annotations

import re
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


_DROP_TOKENS = {"PUFF", "PUFFS", "DISPOSABLE", "PACK", "PACKS", "COUNT", "EDITION", "CT"}
_SIZE_TOKEN = re.compile(r"^\d[\d,]*(?:\.\d+)?(?:G|MG|ML|OZ|CT|PK|K)?$")


def _alias_pairs(aliases: Optional[list[dict]]) -> list[tuple[str, str]]:
    pairs = []
    for row in aliases or []:
        canonical = re.sub(r"[^A-Za-z0-9]+", " ", str(row.get("name") or row.get("brandSlug") or "")).upper().strip()
        for alias in row.get("aliases") or []:
            text = re.sub(r"[^A-Za-z0-9]+", " ", str(alias)).upper().strip()
            if text and canonical and text != canonical:
                pairs.append((text, canonical))
    pairs.sort(key=lambda pair: len(pair[0]), reverse=True)
    return pairs


def name_key(value: Any, aliases: Optional[list[dict]] = None) -> str:
    """Compare names without case, punctuation, or size/count tokens."""
    text = re.sub(r"[^A-Za-z0-9]+", " ", str(value or "")).upper()
    for alias, canonical in _alias_pairs(aliases):
        text = re.sub(rf"\b{re.escape(alias)}\b", canonical, text)
    tokens = [token for token in text.split() if token not in _DROP_TOKENS and not _SIZE_TOKEN.match(token)]
    return " ".join(tokens)


def _identifier(value: Any) -> str:
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def propose_links(products: list[dict], items: list[dict], aliases: Optional[list[dict]] = None) -> tuple[list[dict], list[dict]]:
    """High-confidence pairs can be saved. Other unique suggestions stay for an admin to confirm."""
    taken_products = {product.get("id") for product in products if product.get("cloverItemId")}
    taken_items = {str(product.get("cloverItemId")) for product in products if product.get("cloverItemId")}
    free_products = [product for product in products if product.get("id") not in taken_products]
    free_items = [item for item in items if str(item.get("id")) not in taken_items]
    auto: list[dict] = []
    used_products = set()
    used_items = set()

    def add_auto(product, item, reason):
        if product.get("id") in used_products or item.get("id") in used_items:
            return
        used_products.add(product.get("id"))
        used_items.add(item.get("id"))
        auto.append({
            "productId": product.get("id"),
            "productName": product.get("name") or "",
            "cloverItemId": item.get("id"),
            "cloverName": item.get("name") or "",
            "confidence": "high",
            "reason": reason,
        })

    for field, reason in (("sku", "sku"), ("barcode", "barcode")):
        groups: dict[str, list[tuple[dict, dict]]] = {}
        for product in free_products:
            key = _identifier(product.get(field))
            if not key:
                continue
            for item in free_items:
                item_keys = {_identifier(item.get("sku")), _identifier(item.get("barcode"))}
                if key in item_keys:
                    groups.setdefault(key, []).append((product, item))
        for pairs in groups.values():
            products_in = {pair[0].get("id") for pair in pairs}
            items_in = {pair[1].get("id") for pair in pairs}
            if len(products_in) == 1 and len(items_in) == 1:
                add_auto(pairs[0][0], pairs[0][1], reason)

    name_groups: dict[str, dict] = {}
    for product in free_products:
        if product.get("id") in used_products:
            continue
        key = name_key(product.get("name"), aliases)
        if len(key) < 8:
            continue
        name_groups.setdefault(key, {"products": [], "items": []})["products"].append(product)
    for item in free_items:
        if item.get("id") in used_items:
            continue
        key = name_key(item.get("name"), aliases)
        if key in name_groups:
            name_groups[key]["items"].append(item)
    for key, group in name_groups.items():
        if len(group["products"]) == 1 and len(group["items"]) == 1:
            add_auto(group["products"][0], group["items"][0], "name")

    candidates = []
    for item in free_items:
        if item.get("id") in used_items:
            continue
        item_tokens = set(name_key(item.get("name"), aliases).split())
        if len(item_tokens) < 2:
            continue
        best = None
        best_score = 0.0
        second = 0.0
        for product in free_products:
            if product.get("id") in used_products:
                continue
            product_tokens = set(name_key(product.get("name"), aliases).split())
            if not product_tokens:
                continue
            overlap = len(item_tokens & product_tokens)
            score = overlap / len(item_tokens | product_tokens)
            if score > best_score:
                second = best_score
                best_score = score
                best = product
            elif score > second:
                second = score
        if best and best_score >= 0.72 and best_score - second >= 0.12:
            candidates.append({
                "productId": best.get("id"),
                "productName": best.get("name") or "",
                "cloverItemId": item.get("id"),
                "cloverName": item.get("name") or "",
                "confidence": "review",
                "reason": "partial-name",
                "score": round(best_score, 2),
            })
    return auto, candidates[:200]

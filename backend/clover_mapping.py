"""Map Clover item categories and names onto existing website categories and brands.

Website category display names come from the categories collection. This module
stores slugs only. It never creates a public category or brand.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

# The 11 Clover categories that exist in the shop. Tobacco has no single
# website category, so it is not seeded. A row is kept only when the slug exists.
DEFAULT_CATEGORY_NAMES = (
    ("Nicotine Vapes", "disposable"),
    ("THC-P Vapes", "delta"),
    ("Gummies", "delta-edibles"),
    ("Flower", "delta-smokeables"),
    ("Pre-Rolls", "delta-smokeables"),
    ("Rolling Papers", "paper-cones"),
    ("Glass", "glass-pipes"),
    ("Lighters", "lighter"),
    ("Kratom", "kratom"),
    ("Ash Trays", "miscellaneous"),
)

GENERIC_BRANDS = {"PIPE", "TOP", "PINK", "PLASTIC", "HOT", "CRAZY", "ROYAL"}


def seed_category_mappings(category_slugs: Iterable[str]) -> list[dict]:
    allowed = {str(slug) for slug in category_slugs if slug}
    rows = []
    seen = set()
    for clover_name, slug in DEFAULT_CATEGORY_NAMES:
        if slug not in allowed:
            continue
        key = clover_name.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        rows.append({"cloverName": clover_name, "categorySlug": slug})
    rows.append({"cloverName": "Tobacco", "categorySlug": "", "keywordSplit": True})
    return rows


def _labels(value) -> list[str]:
    if isinstance(value, dict):
        value = value.get("elements") or value.get("items") or []
    if not isinstance(value, list):
        return []
    names = []
    for row in value:
        if isinstance(row, dict):
            name = str(row.get("name") or "").strip()
        elif isinstance(row, str):
            name = row.strip()
        else:
            name = ""
        if name:
            names.append(name)
    return names


def clover_category_names(item: dict) -> list[str]:
    """Names from an item payload. Tags are not categories."""
    return resolve_category_names(item)


def resolve_category_names(item: dict, by_id: Optional[dict] = None, by_item: Optional[dict] = None) -> list[str]:
    """Read Clover category names from expand=categories, or from ids joined to /categories."""
    by_id = by_id or {}
    by_item = by_item or {}
    raw = item.get("categories")
    elements = []
    if isinstance(raw, dict):
        elements = raw.get("elements") or raw.get("items") or []
    elif isinstance(raw, list):
        elements = raw
    names = []
    for row in elements if isinstance(elements, list) else []:
        if isinstance(row, str):
            names.append(row.strip())
            continue
        if not isinstance(row, dict):
            continue
        nested = row.get("category") if isinstance(row.get("category"), dict) else {}
        name = str(row.get("name") or nested.get("name") or "").strip()
        if not name:
            name = str(by_id.get(str(row.get("id") or nested.get("id") or "")) or "").strip()
        if name:
            names.append(name)
    for name in by_item.get(str(item.get("id") or ""), []):
        if name:
            names.append(str(name).strip())
    seen = set()
    unique = []
    for name in names:
        key = name.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(name)
    return unique


def _tokens(value: str) -> list[str]:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).split()


def _has_token(tokens: list[str], word: str) -> bool:
    return word in tokens


def _has_phrase(tokens: list[str], phrase: str) -> bool:
    parts = phrase.split()
    if not parts:
        return False
    for index in range(len(tokens) - len(parts) + 1):
        if tokens[index:index + len(parts)] == parts:
            return True
    return False


def _uncategorized_slug(item_name: str, allowed: set[str]) -> str:
    tokens = _tokens(item_name)
    if not tokens:
        return ""
    # A disposable in the name wins over pod, pods, or refill.
    if "disposable" in tokens and "disposable" in allowed:
        return "disposable"
    pod_hit = any(token in {"pod", "pods", "refill"} for token in tokens) or _has_phrase(tokens, "cartridge pod")
    if pod_hit and "e-liquids" in allowed:
        return "e-liquids"
    rules = (
        (("shisha", "hookah"), "hookah-accessories"),
        (("cigar", "swisher", "backwoods", "dutch"), "cigars"),
        (("kratom",), "kratom"),
        (("gummy", "gummies"), "delta-edibles"),
        (("cartridge", "cart"), "delta-cartridges"),
        (("flower", "preroll"), "delta-smokeables"),
        (("lighter",), "lighter"),
        (("bong", "bubbler"), "glass-pipes"),
    )
    for words, slug in rules:
        if slug not in allowed:
            continue
        if any(_has_token(tokens, word) or _has_phrase(tokens, word) for word in words):
            return slug
    if _has_phrase(tokens, "al fakher") and "hookah-accessories" in allowed:
        return "hookah-accessories"
    if _has_phrase(tokens, "king palm") or _has_token(tokens, "blunt") or _has_token(tokens, "wrap"):
        if "hemp-wraps" in allowed:
            return "hemp-wraps"
    if _has_phrase(tokens, "pre roll") and "delta-smokeables" in allowed:
        return "delta-smokeables"
    return ""


def _category_override(label: str, item_name: str, mapped_slug: str, allowed: set[str]) -> tuple[str, str]:
    """Owner exceptions for three Clover categories. Returns slug, source."""
    key = label.strip().lower()
    tokens = _tokens(item_name)
    if key == "thc-p vapes":
        if any(token in {"cart", "cartridge"} for token in tokens) and "delta-cartridges" in allowed:
            return "delta-cartridges", "rule"
        return mapped_slug, "mapping" if mapped_slug else ""
    if key == "rolling papers":
        if (_has_token(tokens, "wrap") or _has_token(tokens, "blunt") or _has_phrase(tokens, "king palm")) and "hemp-wraps" in allowed:
            return "hemp-wraps", "rule"
        return mapped_slug, "mapping" if mapped_slug else ""
    if key == "tobacco":
        if any(token in {"cigar", "swisher", "backwoods", "game", "dutch"} for token in tokens) or _has_phrase(tokens, "black mild"):
            return ("cigars", "rule") if "cigars" in allowed else ("", "")
        if _has_token(tokens, "wrap") and "hemp-wraps" in allowed:
            return "hemp-wraps", "rule"
        if (any(token in {"shisha", "hookah"} for token in tokens) or _has_phrase(tokens, "al fakher")) and "hookah-accessories" in allowed:
            return "hookah-accessories", "rule"
        return "", ""
    return mapped_slug, "mapping" if mapped_slug else ""


def _brand_tokens(value: str) -> list[str]:
    return re.sub(r"[^A-Z0-9]+", " ", (value or "").upper()).split()


def match_brand(item_name: str, brands: list[dict], aliases: Optional[list[dict]] = None) -> Optional[dict]:
    """Longest whole-word match. Generic brands match only as the leading word."""
    tokens = _brand_tokens(item_name)
    if not tokens:
        return None
    alias_by_slug: dict[str, list[str]] = {}
    for row in aliases or []:
        slug = str(row.get("brandSlug") or "")
        alias_by_slug.setdefault(slug, []).extend(str(alias) for alias in (row.get("aliases") or []) if str(alias).strip())
    best = None
    best_len = 0
    for brand in brands:
        labels = [str(brand.get("displayName") or brand.get("name") or "")]
        labels.extend(alias_by_slug.get(str(brand.get("slug") or ""), []))
        for label_text in labels:
            parts = _brand_tokens(label_text)
            if not parts:
                continue
            label = " ".join(parts)
            generic = label in GENERIC_BRANDS or (len(parts) == 1 and parts[0] in GENERIC_BRANDS)
            if generic:
                if tokens[:len(parts)] != parts:
                    continue
                if parts == ["HOT"] and len(tokens) > 1 and tokens[1] == "PINK":
                    continue
                if parts == ["PINK"] and tokens[0] == "HOT":
                    continue
            else:
                found = any(tokens[index:index + len(parts)] == parts for index in range(len(tokens) - len(parts) + 1))
                collapsed = "".join(parts)
                if not found and len(collapsed) >= 4 and any(token == collapsed for token in tokens):
                    found = True
                if not found:
                    continue
            if len(label) > best_len:
                best = brand
                best_len = len(label)
    return best


def brand_report(brands: list[dict]) -> dict:
    odd = []
    grouped: dict[str, list[dict]] = {}
    for brand in brands:
        parts = _brand_tokens(str(brand.get("displayName") or brand.get("name") or ""))
        label = " ".join(parts)
        if not label:
            continue
        if label in GENERIC_BRANDS or (len(parts) == 1 and parts[0] in GENERIC_BRANDS):
            odd.append({
                "slug": brand.get("slug") or "",
                "name": brand.get("displayName") or brand.get("name") or "",
                "reason": "Generic or odd brand. It matches only as the first word, never inside a flavor such as Hot Pink.",
            })
        grouped.setdefault("".join(parts), []).append(brand)
    duplicates = []
    for rows in grouped.values():
        if len(rows) > 1:
            duplicates.append([{"slug": row.get("slug") or "", "name": row.get("displayName") or row.get("name") or ""} for row in rows])
    names = [( "".join(_brand_tokens(str(row.get("displayName") or row.get("name") or ""))), row) for row in brands]
    for index, (left, row) in enumerate(names):
        if len(left) < 4:
            continue
        for right, other in names[index + 1:]:
            if not right or right == left:
                continue
            if left in right or right in left:
                duplicates.append([
                    {"slug": row.get("slug") or "", "name": row.get("displayName") or row.get("name") or ""},
                    {"slug": other.get("slug") or "", "name": other.get("displayName") or other.get("name") or ""},
                ])
    return {"oddBrands": odd, "possibleDuplicates": duplicates}


def classify_item(item: dict, mappings: list[dict], categories: list[dict], brands: list[dict], aliases: Optional[list[dict]] = None) -> dict:
    by_slug = {str(row.get("slug")): row for row in categories if row.get("slug")}
    allowed = set(by_slug)
    by_name = {}
    for row in mappings or []:
        clover_name = str(row.get("cloverName") or "").strip()
        slug = str(row.get("categorySlug") or "").strip()
        if clover_name and slug in allowed:
            by_name[clover_name.lower()] = slug
    labels = clover_category_names(item)
    slug = ""
    source = ""
    conflict = False
    item_name = str(item.get("name") or "")
    chosen = []
    if labels:
        # A mapped Clover category wins. Keywords only refine that category
        # (THC-P cart, rolling-paper wraps, tobacco split). They never replace it.
        for label in labels:
            mapped = by_name.get(label.lower(), "")
            overridden, override_source = _category_override(label, item_name, mapped, allowed)
            if label.strip().lower() == "tobacco" or overridden or mapped:
                chosen.append((overridden or mapped, override_source or ("mapping" if mapped else "")))
        slugs = {value for value, _origin in chosen if value}
        if len(slugs) > 1:
            conflict = True
        elif len(slugs) == 1:
            slug = next(iter(slugs))
            source = next(origin for value, origin in chosen if value == slug) or "mapping"
    else:
        slug = _uncategorized_slug(item_name, allowed)
        if slug:
            source = "keyword"
    category_name = ""
    if conflict:
        slug = ""
        source = ""
    elif slug and slug in by_slug:
        category_name = by_slug[slug].get("name") or slug
    else:
        slug = ""
        source = ""
    brand = match_brand(item_name, brands, aliases)
    brand_slug = (brand or {}).get("slug") or ""
    brand_name = (brand or {}).get("displayName") or (brand or {}).get("name") or ""
    if source in {"mapping", "rule"}:
        confidence = "high"
    elif source == "keyword":
        confidence = "keyword"
    else:
        confidence = "none"
    return {
        "cloverCategories": labels,
        "mappedCategorySlug": slug,
        "mappedCategoryName": category_name,
        "mappedBrandSlug": brand_slug,
        "mappedBrandName": brand_name,
        "confidence": confidence,
        "conflict": conflict,
        "needsReview": conflict or not bool(slug),
    }

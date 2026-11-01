"""Map Clover item categories and names onto existing website categories and brands.

This never creates a public category. Unknown slugs are ignored.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

# Clover category labels the shop is likely to use, paired with a website slug.
# A row is seeded only when that slug already exists.
DEFAULT_CATEGORY_NAMES = (
    ("Disposable Vapes", "disposable"),
    ("Disposables", "disposable"),
    ("Vapes", "disposable"),
    ("Delta Disposables", "delta"),
    ("Delta Cartridges", "delta-cartridges"),
    ("Cartridges", "delta-cartridges"),
    ("Delta Edibles", "delta-edibles"),
    ("Edibles", "delta-edibles"),
    ("Delta Smokeables", "delta-smokeables"),
    ("Vape Accessories", "vape-accessories"),
    ("Hemp Wraps", "hemp-wraps"),
    ("Wraps", "hemp-wraps"),
    ("E-Liquid", "e-liquids"),
    ("Papers", "paper-cones"),
    ("Paper & Cones", "paper-cones"),
    ("Kratom", "kratom"),
    ("CBD", "cbd"),
    ("Glass Pipes", "glass-pipes"),
    ("Glass", "glass-pipes"),
    ("Lighters", "lighter"),
    ("Air Freshener", "air-freshner"),
    ("Hookah", "hookah-accessories"),
    ("Shisha", "hookah-accessories"),
    ("Cigars", "cigars"),
    ("Munchies", "munchies"),
    ("Accessories", "vape-accessories"),
    ("Miscellaneous", "miscellaneous"),
)

# Longer or more specific phrases are listed before broad ones.
KEYWORD_RULES = (
    (("shisha", "hookah"), "hookah-accessories"),
    (("cigar",), "cigars"),
    (("glass", "bong", "bubbler"), "glass-pipes"),
    (("hemp wrap", "wraps"), "hemp-wraps"),
    (("rolling paper", "paper", "cone"), "paper-cones"),
    (("kratom",), "kratom"),
    (("cbd",), "cbd"),
    (("e-liquid", "eliquid", "e liquid", "nic salt"), "e-liquids"),
    (("gummy", "gummies", "edible"), "delta-edibles"),
    (("cartridge",), "delta-cartridges"),
    (("flower", "pre-roll", "preroll", "thca"), "delta-smokeables"),
    (("accessor",), "vape-accessories"),
    (("delta",), "delta"),
    (("disposable",), "disposable"),
    (("vape",), "disposable"),
    (("lighter", "torch"), "lighter"),
    (("air fresh",), "air-freshner"),
    (("snack", "munchie", "chip"), "munchies"),
)


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
    names = _labels(item.get("categories")) + _labels(item.get("tags"))
    seen = set()
    unique = []
    for name in names:
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(name)
    return unique


def _keyword_slug(item_name: str, allowed: set[str]) -> str:
    haystack = f" {re.sub(r'[^a-z0-9]+', ' ', (item_name or '').lower()).strip()} "
    for words, slug in KEYWORD_RULES:
        if slug not in allowed:
            continue
        for word in words:
            phrase = f" {re.sub(r'[^a-z0-9]+', ' ', word.lower()).strip()} "
            if phrase.strip() and phrase in haystack:
                return slug
    return ""


def match_brand(item_name: str, brands: list[dict]) -> Optional[dict]:
    """Longest whole-word or prefix match against known brand names."""
    name = " ".join((item_name or "").upper().split())
    if not name:
        return None
    padded = f" {name} "
    best = None
    best_len = 0
    for brand in brands:
        label = " ".join(str(brand.get("displayName") or brand.get("name") or "").upper().split())
        if len(label) < 2:
            continue
        if padded == f" {label} " or padded.startswith(f" {label} ") or f" {label} " in padded:
            if len(label) > best_len:
                best = brand
                best_len = len(label)
    return best


def classify_item(item: dict, mappings: list[dict], categories: list[dict], brands: list[dict]) -> dict:
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
    for label in labels:
        found = by_name.get(label.lower())
        if found:
            slug = found
            source = "mapping"
            break
    if not slug:
        slug = _keyword_slug(str(item.get("name") or ""), allowed)
        if slug:
            source = "keyword"
    category_name = ""
    if slug and slug in by_slug:
        category_name = by_slug[slug].get("name") or slug
    else:
        slug = ""
        source = ""
    brand = match_brand(str(item.get("name") or ""), brands)
    brand_slug = (brand or {}).get("slug") or ""
    brand_name = (brand or {}).get("displayName") or (brand or {}).get("name") or ""
    if source == "mapping":
        confidence = "high"
    elif source == "keyword":
        confidence = "low"
    else:
        confidence = "none"
    return {
        "cloverCategories": labels,
        "mappedCategorySlug": slug,
        "mappedCategoryName": category_name,
        "mappedBrandSlug": brand_slug,
        "mappedBrandName": brand_name,
        "confidence": confidence,
        "needsReview": confidence != "high",
    }

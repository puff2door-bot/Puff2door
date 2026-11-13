"""Shared catalog text cleanup and stable URL helpers.

These rules are intentionally conservative: they correct known spelling mistakes
without rewriting brand names or legitimate flavor spellings such as "Raz".
"""

from __future__ import annotations

import re


KNOWN_WORD_CORRECTIONS = {
    "freshner": "freshener",
    "banna": "banana",
    "tequlia": "tequila",
    "bkue": "blue",
    "choclate": "chocolate",
    "desiel": "diesel",
    "hrbrid": "hybrid",
    "strawbery": "strawberry",
    "watermellon": "watermelon",
    "pinapple": "pineapple",
    "rasberry": "raspberry",
    "bluberry": "blueberry",
    "pomogranate": "pomegranate",
    "cherr": "cherry",
}

CATEGORY_SLUG_ALIASES = {"air-freshner": "air-freshener"}


def _match_case(source: str, replacement: str) -> str:
    if source.isupper():
        return replacement.upper()
    if source[:1].isupper():
        return replacement.title() if " " in replacement else replacement.capitalize()
    return replacement


def normalize_catalog_text(value: str) -> str:
    text = str(value or "")
    text = re.sub(r"(?i)\bwhite\s*grape\b", lambda match: _match_case(match.group(0), "white grape"), text)
    for misspelling, correction in KNOWN_WORD_CORRECTIONS.items():
        text = re.sub(
            rf"(?i)\b{re.escape(misspelling)}\b",
            lambda match, fixed=correction: _match_case(match.group(0), fixed),
            text,
        )
    return re.sub(r"\s+", " ", text).strip()


def slugify_catalog(value: str, max_length: int = 140) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", normalize_catalog_text(value).lower().replace("&", " and ")).strip("-")
    if len(slug) <= max_length:
        return slug or "item"
    shortened = slug[:max_length].rstrip("-")
    if "-" in shortened:
        shortened = shortened.rsplit("-", 1)[0]
    return shortened or "item"


def canonical_product_slug(name: str, product_id: int) -> str:
    suffix = f"-{int(product_id)}"
    return f"{slugify_catalog(name, max_length=max(20, 140 - len(suffix)))}{suffix}"


def canonical_category_slug(value: str) -> str:
    slug = str(value or "").strip().lower()
    return CATEGORY_SLUG_ALIASES.get(slug, slug)

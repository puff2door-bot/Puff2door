"""Researched product details: description, flavor tags and puff count.

Two parts:

1. Review queue (`detail_drafts`). Researched details are staged here in batches and
   nothing on the website changes until the owner approves a batch on the
   "Product Details" admin page. The auto-publish automation never touches this queue.

2. Product library (`product_details/library.json`). Facts researched once per product
   line (puffs, ml, nicotine, battery, sizes, what's in the box). When a new product
   arrives from Clover, `library_draft()` matches it to a line and writes a full
   description from those verified facts plus the flavor in the product's name.
   This is how the description agent "learns": every line researched for a batch is
   added to the library, so future flavors of the same line get the same detail.

Wording rules match the rest of the site: no health or effect claims, no prices,
nicotine warning on nicotine products, and the 21+ notice.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

CLOSING = "Available at HD Smoke Shop in Altamonte Springs for in-store shopping or local delivery. Adults 21+ only; valid photo ID required."
NIC_WARNING = "WARNING: This product contains nicotine. Nicotine is an addictive chemical."
ZERO_NIC = re.compile(r"\b(no\s*nic|zero\s*nic(otine)?|nic(otine)?\s*free|0\s*%)", re.I)
LIBRARY_FILE = Path(__file__).parent / "product_details" / "library.json"

# Flavor families customers filter by. Order matters: longer names first so
# "Blue Razz" wins over "Blue", "Watermelon" over "Melon", "Pineapple" over "Apple".
FAMILIES = [
    ("Blue Razz", r"blue\s*ra(?:z|zz|spberry)"), ("Watermelon", r"water\s*melon|(?<=straw)melon"), ("Pineapple", r"pine\s*apple"),
    ("Dragon Fruit", r"dragon\s*fruit|pitaya"), ("Passion Fruit", r"passion\s*fruit|maracuja"), ("Cotton Candy", r"cotton\s*candy"), ("Bubblegum", r"bubble\s*gum"),
    ("Strawberry", r"straw\s*berry|strawberries|\bstraw\b|\bstrazz|\bstraws\b|\bstraw(?=melon)|\bstr(?=apple)"), ("Blueberry", r"blue\s*berry|blueberries"), ("Raspberry", r"rasp\s*berry"),
    ("Blackberry", r"black\s*berry"), ("Cranberry", r"cran\s*berry"), ("Grapefruit", r"grape\s*fruit"), ("Mixed Berry", r"mixed\s*berr|triple\s*berr|berry\s*blast|wild\s*berr|\bberries\b"),
    ("Grape", r"\bgrape"), ("Apple", r"\bapple|(?<=str)apple"), ("Mango", r"\bmango"), ("Peach", r"\bpeach"), ("Cherry", r"\bcherr"), ("Kiwi", r"\bkiwi"),
    ("Banana", r"\bbanana"), ("Lemon", r"\blemon"), ("Lime", r"\blime\b"), ("Citrus", r"citrus"), ("Orange", r"\borange|tangerine|mandarin|\btang\b"), ("Coconut", r"coconut"),
    ("Melon", r"\bmelon|honeydew|cantaloupe"), ("Guava", r"\bguava"), ("Lychee", r"lychee|litchi"), ("Pomegranate", r"pomegranate"), ("Papaya", r"papaya"),
    ("Tropical", r"tropic|hawaiian|island|paradise"), ("Peach", r"nectarine"), ("Pear", r"\bpear\b"), ("Plum", r"\bplum\b"),
    ("Mint", r"\bmint|menthol|spearmint|peppermint|wintergreen"), ("Ice", r"\bice[ds]?\b|\bicy\b|frozen|\bcool\b|polar|chill|freez"),
    ("Cola", r"\bcola\b|\bcoke\b"), ("Energy Drink", r"energy|red\s*bull"), ("Coffee", r"coffee|espresso|cappuccino|latte|mocha"),
    ("Vanilla", r"vanilla"), ("Chocolate", r"chocolate|cocoa"), ("Candy", r"candy|gumm|gumny|\bgami\b|sour\s*patch|skittle|taffy|jelly|rancher"),
    ("Dessert", r"cake|custard|cookie|donut|cream|cheesecake|pudding|pie\b|tiramisu|cereal|milk"), ("Honey", r"\bhoney\b"), ("Sour", r"\bsour\b"),
    ("Mixed Berry", r"\bberry\b"), ("Tobacco", r"\btobacco\b|\bvirginia\b|\bcuban\b|\bclassic\s*tob"), ("Unflavored", r"unflavou?red|\bnatural\b|\boriginal\b"),
]
_FAMILY_RX = [(fam, re.compile(rx, re.I)) for fam, rx in FAMILIES]


def flavor_tags(flavor_text: str) -> list:
    """Filter tags for a flavor name, e.g. "Strawberry Kiwi Ice" -> ["Strawberry", "Kiwi", "Ice"]."""
    text = str(flavor_text or "")
    found = []
    for fam, rx in _FAMILY_RX:
        m = rx.search(text)
        if m and fam not in [f for _, f in found]:
            found.append((m.start(), fam))
            text = text[: m.start()] + " " * (m.end() - m.start()) + text[m.end():]  # don't double-count
    return [f for _, f in sorted(found)][:6]  # in the order the flavor name says them


# ---------------- Strength / size ----------------
SIZE_RX = re.compile(r"(\d+(?:\.\d+)?)\s*(mg|g|gm|gms|gram|grams|ml)\b", re.I)
# Categories where the strength/size filter matters (edibles: mg, flower/pre-rolls: g, hemp vapes: g).
SIZED = {"delta", "delta-edibles", "delta-smokeables", "delta-cartridges", "kratom"}


def normalize_size(text: str) -> str:
    m = SIZE_RX.search(str(text or ""))
    if not m:
        return ""
    n = m.group(1).rstrip("0").rstrip(".") if "." in m.group(1) else m.group(1)
    unit = m.group(2).lower()
    unit = "g" if unit.startswith("g") else unit
    return f"{n} {unit}"


def size_from_name(name: str, category: str) -> str:
    """Total strength/size from the product name, for hemp and kratom products only."""
    if category not in SIZED:
        return ""
    return normalize_size(name)


# ---------------- Library ----------------

def load_library() -> list:
    try:
        return json.loads(LIBRARY_FILE.read_text())
    except Exception:
        return []


def _match(entry: dict, product: dict) -> bool:
    m = entry.get("match") or {}
    name = str(product.get("name") or "")
    brand = str(product.get("brandName") or "")
    if m.get("name") and not re.search(m["name"], name, re.I):
        return False
    if m.get("notName") and re.search(m["notName"], name, re.I):
        return False
    if m.get("brand") and not re.search(m["brand"], f"{brand} {name}", re.I):
        return False
    if m.get("category") and (product.get("categorySlug") or "") not in m["category"]:
        return False
    return True


def _flavor_from_name(entry: dict, name: str) -> str:
    text = name
    for rx in entry.get("strip") or []:
        text = re.sub(rx, " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip(" -–·,&+()")
    return text.title() if text.isupper() or text.islower() else text


def library_draft(product: dict, library: Optional[list] = None) -> Optional[dict]:
    """Full description + flavor tags + puffs from the researched library, or None."""
    if ZERO_NIC.search(str(product.get("name") or "")):
        return None  # zero-nicotine versions differ from the line's specs; write those by hand
    for entry in library if library is not None else load_library():
        if not _match(entry, product):
            continue
        flavor = _flavor_from_name(entry, str(product.get("name") or ""))
        text = entry["template"].replace("{flavor}", flavor or entry.get("noFlavor", "the flavor shown"))
        parts = [text]
        if entry.get("nicotine"):
            parts.append(NIC_WARNING)
        parts.append(CLOSING)
        return {"description": " ".join(parts), "flavors": flavor_tags(flavor) if entry.get("flavored", True) else [],
                "puffs": entry.get("puffs"), "line": entry.get("line", "")}
    return None


# ---------------- Review queue ----------------

def finish(text: str, nicotine: bool = False) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if nicotine and NIC_WARNING.lower() not in text.lower():
        text += " " + NIC_WARNING
    if "21+" not in text:
        text += " " + CLOSING
    return text


async def stage(db, batch: str, items: list, claim_words: re.Pattern) -> dict:
    staged, rejected = 0, []
    for it in items:
        pid = int(it["id"])
        product = await db.products.find_one({"id": pid}, {"_id": 0, "id": 1, "name": 1, "description": 1, "flavors": 1, "puffs": 1, "categorySlug": 1})
        if not product:
            rejected.append({"id": pid, "reason": "no such product"})
            continue
        text = finish(it.get("description") or "", bool(it.get("nicotine")))
        if claim_words.search(text):
            rejected.append({"id": pid, "reason": "health-claim wording"})
            continue
        flavors = [" ".join(str(f).split())[:30] for f in (it.get("flavors") or []) if str(f).strip()][:20]
        puffs = int(it["puffs"]) if it.get("puffs") else None
        size = normalize_size(it.get("size") or "")
        await db.detail_drafts.update_one({"productId": pid, "status": "review"}, {"$set": {
            "productId": pid, "batch": batch[:60], "name": product["name"], "category": product.get("categorySlug", ""),
            "description": text, "flavors": flavors, "puffs": puffs, "size": size, "flag": str(it.get("flag") or "")[:300],
            "sources": [str(s)[:200] for s in (it.get("sources") or [])][:6],
            "before": {"description": product.get("description") or "", "flavors": product.get("flavors") or [], "puffs": product.get("puffs"), "size": product.get("size") or ""},
            "status": "review", "createdAt": datetime.now(timezone.utc)}}, upsert=True)
        staged += 1
    return {"staged": staged, "rejected": rejected}


async def queue(db) -> dict:
    rows = await db.detail_drafts.find({"status": "review"}, {"_id": 0}).sort([("batch", 1), ("productId", 1)]).to_list(2000)
    batches: dict = {}
    for r in rows:
        r["createdAt"] = r["createdAt"].isoformat() if isinstance(r.get("createdAt"), datetime) else r.get("createdAt")
        batches.setdefault(r["batch"], []).append(r)
    done = await db.detail_drafts.count_documents({"status": "approved"})
    return {"batches": [{"name": k, "items": v} for k, v in batches.items()], "approved": done}


async def approve(db, product_ids: list, edits: dict, claim_words: re.Pattern, who: str) -> int:
    done = 0
    for pid in product_ids:
        d = await db.detail_drafts.find_one({"productId": int(pid), "status": "review"})
        if not d:
            continue
        text = str(edits.get(str(pid)) or d["description"]).strip()[:3000]
        if claim_words.search(text):
            raise ValueError(f"“{d['name']}”: remove health-claim wording before approving.")
        update = {"description": text, "flavors": d.get("flavors") or [], "updatedAt": datetime.now(timezone.utc)}
        if d.get("puffs"):
            update["puffs"] = d["puffs"]
        if d.get("size"):
            update["size"] = d["size"]
        await db.products.update_one({"id": d["productId"]}, {"$set": update})
        await db.detail_drafts.update_one({"_id": d["_id"]}, {"$set": {"status": "approved", "description": text,
                                                                       "decidedAt": datetime.now(timezone.utc), "decidedBy": who}})
        done += 1
    return done


async def skip(db, product_ids: list) -> int:
    res = await db.detail_drafts.update_many({"productId": {"$in": [int(p) for p in product_ids]}, "status": "review"},
                                             {"$set": {"status": "skipped", "decidedAt": datetime.now(timezone.utc)}})
    return res.modified_count

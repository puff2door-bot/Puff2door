"""Draft product descriptions from the product's own facts (no AI service, no cost).

Drafts wait in `description_drafts` until the owner approves them. Wording rules:
no health or effect claims, no prices, always 21+ and ID. Every draft is checked
against the same claim-word list the Compliance agent uses before it is saved.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

STORE = "HD Smoke Shop in Altamonte Springs"
CLOSING = f"Available at {STORE} for in-store shopping or local delivery. Adults 21+ only; valid photo ID required."

PUFFS = re.compile(r"\b(\d{1,3}(?:[.,]\d)?)\s*k\b|\b(\d{3,6})\s*puffs?\b|\b(?:ultra|extra|infinity|bar)\s+(\d{3,5})\b", re.I)
MG = re.compile(r"\b(\d{2,5})\s*mg\b", re.I)
GRAMS = re.compile(r"\b(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams)\b", re.I)
ML = re.compile(r"\b(\d+(?:\.\d+)?)\s*ml\b", re.I)
STRAIN = re.compile(r"\b(indica|sativa|hybrid)\b", re.I)
PACK = re.compile(r"\b(\d+)\s*(?:pk|pack|ct)\b", re.I)
NOISE = re.compile(r"\b(disposable|vape|pod|pods|kit|puffs?|ultra|extra|infinity|pulse ?x?|mega|nic|no nic|vue|classic|crystal|true wraps?|\d{3,5}|\d+(?:\.\d+)?\s*(?:k|mg|g|gm|gms|ml|pk|ct))\b", re.I)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip(" -–·,")


def _flavor(name: str, brand: str) -> str:
    text = name
    for word in filter(None, re.split(r"\s+", brand or "")):
        text = re.sub(rf"\b{re.escape(word)}\b", " ", text, flags=re.I)
    text = NOISE.sub(" ", text)
    text = STRAIN.sub(" ", text)
    text = re.sub(r"[-–]+", " ", text)
    return _clean(text).title()


def _puffs(name: str) -> str:
    m = PUFFS.search(name)
    if not m:
        return ""
    if m.group(1):
        return f"{m.group(1).replace(',', '.')}K"
    n = int(m.group(2) or m.group(3))
    return f"{n // 1000}K" if n >= 1000 and n % 1000 == 0 else f"{n:,}"


def draft_for(product: dict) -> str:
    name = _clean(product.get("name"))
    brand = re.sub(r"\bThc\b", "THC", _clean(product.get("brandName") or "").title())
    cat = product.get("categorySlug") or ""
    flavor = _flavor(name, brand)
    by = f" from {brand}" if brand else ""
    puffs = _puffs(name)
    strain = (STRAIN.search(name).group(1).title() if STRAIN.search(name) else "")
    if cat == "disposable":
        parts = [f"{name} is a disposable vape{by}" + (f" rated for up to {puffs} puffs" if puffs else "") + "."]
        if flavor:
            parts.append(f"Flavor: {flavor}.")
        parts.append("Comes ready to use, with no refilling or setup.")
    elif cat == "e-liquids":
        kind = "starter kit" if re.search(r"\bkit\b", name, re.I) else "replacement pod"
        parts = [f"{name} is a {kind}{by}" + (f" rated for up to {puffs} puffs" if puffs else "") + "."]
        if flavor:
            parts.append(f"Flavor: {flavor}.")
        parts.append("Ask at the counter which devices and pods work together." if kind == "replacement pod" else "Includes the device and a pod to get started.")
    elif cat in ("cigars", "hemp-wraps"):
        pack = PACK.search(name)
        parts = [f"{name}{by}" + (f", {pack.group(1)}-pack" if pack else "") + "."]
        if flavor:
            parts.append(f"Flavor: {flavor}.")
        parts.append("Stored on our shelf for freshness.")
    elif cat == "paper-cones":
        parts = [f"{name}{by}: rolling papers, cones and accessories for everyday rolling."]
    elif cat == "glass-pipes":
        parts = [f"{name}{by}. Glass piece sold for legal tobacco and hemp use."]
        parts.append("Each piece is checked at the counter; designs and colors can vary.")
    elif cat == "hookah":
        parts = [f"{name}{by} for your hookah setup."]
        parts.append("Ask our team about matching bowls, hoses, coals and shisha.")
    elif cat == "lighter":
        parts = [f"{name}{by}. Lighters, torches and butane for everyday use."]
    elif cat in ("delta", "delta-cartridges", "delta-smokeables", "delta-edibles"):
        size = (GRAMS.search(name) or ML.search(name) or MG.search(name))
        kind = {"delta": "hemp-derived disposable", "delta-cartridges": "hemp-derived cartridge",
                "delta-smokeables": "hemp-derived pre-roll or flower", "delta-edibles": "hemp-derived edible"}[cat]
        parts = [f"{name} is a {kind}{by}" + (f" ({size.group(0)})" if size else "") + "."]
        if strain:
            parts.append(f"Labeled {strain}.")
        parts.append("Read the package label for contents and serving information before use.")
    elif cat == "kratom":
        parts = [f"{name}{by}. Read the package label for contents and serving information before use."]
    elif cat == "air-freshner":
        parts = [f"{name}{by}. Keep your car, room or shop smelling fresh."]
    else:
        parts = [f"{name}{by}."]
    return _clean(" ".join(parts + [CLOSING]))


async def generate(db, claim_words: re.Pattern, limit: int = 1000) -> dict:
    pending = {d["productId"] async for d in db.description_drafts.find({"status": "pending"}, {"productId": 1})}
    rows = await db.products.find({"active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "brandName": 1,
                                                               "categorySlug": 1, "description": 1, "stock": 1}).to_list(5000)
    made, skipped = 0, 0
    for p in sorted(rows, key=lambda r: -int(r.get("stock") or 0)):
        if len(str(p.get("description") or "").strip()) >= 40 or p["id"] in pending:
            continue
        text = draft_for(p)
        if claim_words.search(text):
            skipped += 1
            continue
        await db.description_drafts.insert_one({"productId": p["id"], "name": p["name"], "category": p.get("categorySlug"),
                                                "text": text, "status": "pending", "createdAt": datetime.now(timezone.utc)})
        made += 1
        if made >= limit:
            break
    return {"created": made, "skipped": skipped}

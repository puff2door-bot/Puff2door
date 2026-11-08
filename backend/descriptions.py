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
NOISE = re.compile(r"\b(disposable|vape|pod|pods|kit|puffs?|ultra|extra|infinity|pulse(?: ?x| 2)?|pro|mega|nic|no nic|vue|classic|crystal|true wraps?|cigars?|nera|kratom|addicts|hookah tobacco|\d{3,5}|\d+(?:\.\d+)?\s*(?:k|mg|g|gm|gms|ml|pk|ct))\b", re.I)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip(" -–·,&+")


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


NIC_WARNING = "WARNING: This product contains nicotine. Nicotine is an addictive chemical."
ZERO_NIC = re.compile(r"\b(no nic|zero nic|nic free|0\s*%|0\s*mg)\b", re.I)
SIZE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:mm|in|inch|oz|ml|g|gm|gms|mg)\b", re.I)


def _nice_size(text: str) -> str:
    text = re.sub(r"\s+", "", text).lower()
    text = re.sub(r"(gms?|gm)$", "g", text)
    text = re.sub(r"inch$|in$", " in", text)
    return text.replace("ml", " ml").replace("mg", " mg").replace("oz", " oz").replace("mm", " mm").strip()


def _sizes(name: str) -> list:
    return [_nice_size(m.group(0)) for m in SIZE.finditer(name)]


def draft_for(product: dict):
    """A short factual description, or None when the name says too little to describe safely.

    Every sentence states only what the product name, brand or category already says,
    plus required notices (21+, ID, nicotine warning). No effects, no quality promises."""
    name = _clean(product.get("name"))
    raw_brand = _clean(product.get("brandName") or "")
    brand = raw_brand.upper() if len(raw_brand) <= 3 else re.sub(r"\bThc\b", "THC", raw_brand.title())
    cat = product.get("categorySlug") or ""
    flavor = _flavor(name, brand)
    by = f" by {brand}" if brand else ""
    puffs = _puffs(name)
    sm = STRAIN.search(name)
    strain = sm.group(1).title() if sm else ""
    sizes = _sizes(name)
    nic_free = bool(ZERO_NIC.search(name))
    lower = name.lower()
    parts: list = []
    warn = False
    if cat == "disposable":
        parts.append(f"Disposable vape{by}" + (f" in {flavor}" if flavor else "") + ".")
        if puffs:
            parts.append(f"Rated for up to {puffs} puffs (manufacturer's rating; actual use varies).")
        parts.append("Comes pre-filled, so there is nothing to refill.")
        warn = not nic_free
        if nic_free:
            parts.append("Nicotine-free version.")
    elif cat == "e-liquids":
        if re.search(r"\bkit\b", lower):
            parts.append(f"Starter kit{by}: the device plus a pre-filled pod" + (f" in {flavor}" if flavor else "") + ".")
        else:
            parts.append(f"Replacement pod{by}" + (f" in {flavor}" if flavor else "") + f". Fits the matching {brand or 'brand'} device.")
        if puffs:
            parts.append(f"Rated for up to {puffs} puffs (manufacturer's rating; actual use varies).")
        warn = not nic_free
    elif cat in ("cigars", "hemp-wraps"):
        pack = PACK.search(name)
        kind = "Hemp wraps" if cat == "hemp-wraps" or "hemp" in lower else ("Tobacco leaf" if re.search(r"leaf|grabba", lower) else "Cigars")
        parts.append(f"{kind}{by}" + (f" ({flavor})" if flavor and kind != "Tobacco leaf" else "") + (f", {pack.group(1)}-pack" if pack else "") + ".")
    elif cat == "paper-cones":
        pack = PACK.search(name)
        kind = ("Pre-rolled cones" if "cone" in lower else "Rolling machine" if "roller" in lower
                else "Filter tips" if re.search(r"\btips\b", lower) and "+" not in lower else "Rolling papers")
        size = next((x for x in ("king size", "1 1/4", "slim", "110mm", "79mm", "70mm") if x in lower), "")
        size_txt = f", {size}" if size in ("king size", "110mm", "79mm", "70mm") else f", {size} size" if size else ""
        extra = " with tips" if "+ tips" in lower else ""
        parts.append(f"{kind}{by}{size_txt}{extra}" + (f", {pack.group(1)}-pack" if pack else "") + ".")
    elif cat == "glass-pipes":
        kind = next((k for w, k in (("downstem", "Glass downstem"), ("banger", "Quartz banger accessory"), ("quartz", "Quartz accessory"),
                                    ("dab rig", "Glass dab rig"), ("one", "One-hitter pipe"), ("water pipe", "Glass water pipe"), ("beaker", "Beaker water pipe"),
                                    ("bong", "Glass water pipe"), ("pipe", "Glass pipe")) if w in lower), "Glass piece")
        parts.append(f"{kind}{by}" + (f", {' / '.join(sizes)}" if sizes else "") + ". For use with legal tobacco and hemp products.")
    elif cat == "hookah":
        if "tobacco" in lower:
            parts.append(f"Hookah tobacco (shisha){by}" + (f" in {flavor.replace('Hookah Tobacco', '').strip()}" if flavor else "") + ".")
        elif "coal" in lower:
            parts.append(f"Hookah coals{by}.")
        else:
            parts.append(f"Hookah{by}. Colors and designs may vary from the photo.")
    elif cat == "lighter":
        kind = "Lighter fluid refill" if "refill" in lower else "Butane" if "butane" in lower else "Torch lighter" if "torch" in lower else "Lighter accessory" if "leash" in lower else "Lighter"
        parts.append(f"{kind}{by}" + (f", {sizes[0]}" if sizes and kind in ("Lighter fluid refill", "Butane") else "") + ".")
    elif cat in ("delta", "delta-cartridges", "delta-smokeables", "delta-edibles"):
        if cat == "delta-smokeables":
            pr = re.search(r"(\d+)\s*pre[- ]?rolls?", lower)
            kind = (f"{pr.group(1)} hemp-derived pre-rolls" if pr else "Hemp-derived pre-roll") if re.search(r"pre[- ]?roll", lower) else "Hemp-derived flower"
        elif cat == "delta-cartridges":
            kind = "Hemp-derived vape cartridge"
        elif cat == "delta-edibles":
            kind = ("Hemp-derived drink" if re.search(r"seltzer|water|drink|soda", lower)
                    else "Hemp-derived gummies" if re.search(r"gumm|bitez|zlush|gmy", lower) else "Hemp-derived edible")
        else:
            kind = "Hemp-derived disposable vape"
        amount = next((x for x in sizes if not x.endswith("mm") and not x.endswith("in")), "")
        parts.append(f"{kind}{by}" + (f", {amount}" if amount else "") + (f", labeled {strain}" if strain else "") + ".")
        parts.append("Check the package label for cannabinoid content and serving size.")
    elif cat == "kratom":
        kind = "Kratom drink" if re.search(r"seltzer|drink|shot|rapture|ohho", lower) else "Kratom product"
        parts.append(f"{kind}{by}" + (f" in {flavor}" if flavor else "") + ". Check the package label for contents and serving size.")
    elif cat == "air-freshner":
        kind = "Odor-eliminating candle" if "candle" in lower else "Incense sticks" if "incense" in lower else "Air freshener"
        scent = re.sub(r"(?i)skunk|odor eliminator|candle|incense stick box|incense sticks?|hand dipped", " ", name)
        scent = _clean(scent)
        parts.append(f"{kind}{by}" + (f", scent: {scent}" if scent and kind != "Air freshener" else "") + ".")
    elif cat == "miscellaneous" and re.search(r"nicotine (pouch|gum)", lower):
        kind = "Nicotine gum" if "gum" in lower else "Nicotine pouches"
        flav = _clean(re.sub(r"(?i)nicotine (pouch|gum)|\d+\s*mg|xqs|zyn|slapple|keko durra", " ", name))
        parts.append(f"{kind}{by}" + (f" in {flav}" if flav else "") + (f", {next(x for x in sizes if x.endswith('mg'))} strength" if any(x.endswith("mg") for x in sizes) else "") + ".")
        warn = True
    elif cat in ("smoke-accessories",):
        kind = ("Ashtray" if re.search(r"ash ?tray", lower) else "Rolling tray" if "tray" in lower else "Grinder" if "grinder" in lower else "Storage jar" if "jar" in lower
                else "Small bags" if "bag" in lower else "Charger" if "charger" in lower
                else "Screens / filters" if "filter" in lower or "screen" in lower else "")
        if not kind:
            return None
        parts.append(f"{kind}{by}. Designs may vary from the photo.")
    else:
        return None  # not enough in the name to describe it without guessing
    if warn:
        parts.append(NIC_WARNING)
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
        if not text or claim_words.search(text) or claim_words.search(p.get("name") or ""):
            skipped += 1
            continue
        await db.description_drafts.insert_one({"productId": p["id"], "name": p["name"], "category": p.get("categorySlug"),
                                                "text": text, "status": "pending", "createdAt": datetime.now(timezone.utc)})
        made += 1
        if made >= limit:
            break
    return {"created": made, "skipped": skipped}

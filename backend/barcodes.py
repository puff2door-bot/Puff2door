"""Clover items with no barcode, and the tools to fix them from the admin panel.

Reads Clover live (the register's own data), joins the website product and recent
sales, and writes a barcode to exactly one Clover item at a time ("code" field, the
one the register scanner matches). Every write is checked for duplicates across all
Clover items and website products first, recorded in `barcode_changes`, and can be
undone. Items the owner marks "doesn't need one" are kept in `barcode_ignores`.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
CODE_RE = re.compile(r"^[0-9A-Za-z-]{4,32}$")
STORE_PREFIX = "20"  # GS1 in-store range: never printed on a manufacturer's box


class BarcodeError(Exception):
    def __init__(self, message: str, status: int = 400, **extra):
        super().__init__(message)
        self.status = status
        self.extra = extra


def clean_code(value) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def check_digit(body: str) -> int:
    total = sum(int(n) * (3 if i % 2 == 0 else 1) for i, n in enumerate(reversed(body)))
    return (10 - total % 10) % 10


def checksum_ok(code: str):
    """True/False for UPC-A, EAN-13 and EAN-8; None when the code is another format."""
    if not code.isdigit() or len(code) not in (8, 12, 13):
        return None
    return check_digit(code[:-1]) == int(code[-1])


def _key(code: str) -> str:
    # The register ignores case; a leading-zero UPC-A and its EAN-13 form are the same box.
    c = code.upper()
    return c[1:] if len(c) == 13 and c.startswith("0") and c.isdigit() else c


async def _merchant(clover) -> str:
    merchant_id = clover._merchant_id(await clover.config() or {})
    if not merchant_id:
        raise BarcodeError("Clover is not connected.", 409)
    return merchant_id


async def _sold_28_days(db) -> tuple[dict, dict]:
    since = (datetime.now(ET).date() - timedelta(days=28)).isoformat()
    by_item: dict = defaultdict(float)
    by_product: dict = defaultdict(float)
    async for r in db.sales_item_days.find({"date": {"$gte": since}}, {"_id": 0, "itemId": 1, "productId": 1, "qty": 1, "channel": 1}):
        qty = float(r.get("qty") or 0)
        if r.get("channel") == "store" and r.get("itemId") and not str(r["itemId"]).startswith("name:"):
            by_item[str(r["itemId"])] += qty
        elif r.get("productId") is not None:
            by_product[r["productId"]] += qty
    return by_item, by_product


async def missing_report(db, clover) -> dict:
    inventory = await clover.fetch_inventory()
    products = await db.products.find(
        {"cloverItemId": {"$nin": [None, ""]}},
        {"_id": 0, "id": 1, "name": 1, "cloverItemId": 1, "category": 1, "categorySlug": 1, "brandName": 1, "active": 1, "image": 1},
    ).to_list(5000)
    by_clover = {str(p["cloverItemId"]): p for p in products}
    ignored = {d["cloverItemId"]: d async for d in db.barcode_ignores.find({}, {"_id": 0})}
    by_item, by_product = await _sold_28_days(db)
    fixed_ids = set()
    since = datetime.now(timezone.utc) - timedelta(days=30)
    async for c in db.barcode_changes.find({"at": {"$gte": since}, "undone": {"$ne": True}}, {"_id": 0, "cloverItemId": 1}):
        fixed_ids.add(c["cloverItemId"])

    used: dict = {}
    rows, fixed = [], []
    for item in inventory:
        for code in (item.get("barcode"), item.get("sku")):
            code = clean_code(code)
            if code:
                used.setdefault(_key(code), item.get("name") or "another item")
        product = by_clover.get(item["id"]) or {}
        cats = [c.get("name") for c in ((item.get("categories") or {}).get("elements") or []) if c.get("name")]
        sold = by_item.get(item["id"], 0.0) + (by_product.get(product.get("id"), 0.0) if product else 0.0)
        row = {
            "cloverItemId": item["id"],
            "name": item.get("name") or "",
            "category": cats[0] if cats else (product.get("category") or ""),
            "brand": product.get("brandName") or "",
            "stock": item.get("stock") or 0,
            "price": item.get("price") or 0,
            "sku": clean_code(item.get("sku")),
            "barcode": clean_code(item.get("barcode")),
            "hidden": bool(item.get("hidden")),
            "productId": product.get("id"),
            "onWebsite": bool(product) and product.get("active") is not False,
            "sold28": round(sold, 1),
            "ignored": item["id"] in ignored,
        }
        if not row["barcode"]:
            rows.append(row)
        elif item["id"] in fixed_ids:
            fixed.append(row)
    rows.sort(key=lambda r: (-r["sold28"], -r["stock"], r["name"].lower()))
    todo = [r for r in rows if not r["ignored"]]
    return {
        "items": rows,
        "fixed": fixed,
        "usedCodes": used,
        "summary": {
            "cloverItems": len(inventory),
            "missing": len(todo),
            "inStock": sum(1 for r in todo if r["stock"] > 0),
            "ignored": len(rows) - len(todo),
            "fixedLast30Days": len(fixed),
            "soldWithoutBarcode28": round(sum(r["sold28"] for r in todo), 1),
        },
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


def _variants(code: str) -> set:
    out = {_key(code)}
    if code.isdigit() and len(code) == 12:
        out.add(_key("0" + code))
    return out


async def _conflict(db, clover, merchant_id: str, code: str, item_id: str):
    """Name of another Clover item or website product that already uses this code (as barcode or SKU)."""
    wanted = _variants(code)
    for row in await clover._paged(f"/v3/merchants/{merchant_id}/items"):
        if str(row.get("id")) == item_id or row.get("deleted") is True:
            continue
        for field in ("code", "sku"):
            value = clean_code(row.get(field))
            if value and _variants(value) & wanted:
                return row.get("name") or "another Clover item"
    raw = {code, code.upper(), code.lower(), "0" + code, code[1:]}
    product = await db.products.find_one(
        {"cloverItemId": {"$ne": item_id}, "$or": [{"barcode": {"$in": list(raw)}}, {"sku": {"$in": list(raw)}}]},
        {"_id": 0, "name": 1},
    )
    return product.get("name") if product else None


async def save_code(db, clover, item_id: str, code: str, admin_email: str = "", allow_bad_checksum: bool = False) -> dict:
    code = clean_code(code)
    item_id = str(item_id or "").strip()
    if not item_id:
        raise BarcodeError("Missing Clover item.")
    if not CODE_RE.match(code):
        raise BarcodeError("Barcodes are letters, numbers and dashes only (4–32 characters).")
    if checksum_ok(code) is False and not allow_bad_checksum:
        raise BarcodeError("That doesn't look like a valid UPC/EAN (the check digit is off). Scan it again, or save anyway.", 422, needsConfirm=True)
    merchant_id = await _merchant(clover)
    if clover.dry_run:
        raise BarcodeError("Clover is in test mode (dry run), so nothing was saved.", 409)
    item = await clover.request("GET", f"/v3/merchants/{merchant_id}/items/{item_id}")
    if not item or item.get("deleted") is True:
        raise BarcodeError("This item no longer exists in Clover. Refresh the list.", 404)
    previous = clean_code(item.get("code"))
    if previous == code:
        return {"saved": True, "code": code, "unchanged": True}
    if previous:
        raise BarcodeError(f"This item already has barcode {previous} in Clover (added somewhere else). Refresh the list.", 409)
    other = await _conflict(db, clover, merchant_id, code, item_id)
    if other:
        raise BarcodeError(f"Already used by “{other}”. One barcode can only belong to one item.", 409, conflict=other)
    await clover.request("POST", f"/v3/merchants/{merchant_id}/items/{item_id}", json_body={"code": code})
    check = await clover.request("GET", f"/v3/merchants/{merchant_id}/items/{item_id}")
    if clean_code((check or {}).get("code")) != code:
        raise BarcodeError("Clover did not keep the barcode. Nothing was changed; please try again.", 502)
    web = await db.products.update_many({"cloverItemId": item_id}, {"$set": {"barcode": code, "updatedAt": datetime.now(timezone.utc)}})
    await db.barcode_changes.insert_one({"cloverItemId": item_id, "name": item.get("name"), "previous": previous, "code": code,
                                         "by": admin_email, "at": datetime.now(timezone.utc), "websiteUpdated": web.modified_count})
    await db.barcode_ignores.delete_many({"cloverItemId": item_id})
    await clover.log("barcode_set", "success", cloverItemId=item_id, detail=code)
    return {"saved": True, "code": code, "websiteUpdated": web.modified_count}


async def undo_code(db, clover, item_id: str, admin_email: str = "") -> dict:
    change = await db.barcode_changes.find_one({"cloverItemId": item_id, "undone": {"$ne": True}}, sort=[("at", -1)])
    if not change:
        raise BarcodeError("Nothing to undo for this item.", 404)
    merchant_id = await _merchant(clover)
    if clover.dry_run:
        raise BarcodeError("Clover is in test mode (dry run), so nothing was changed.", 409)
    item = await clover.request("GET", f"/v3/merchants/{merchant_id}/items/{item_id}")
    if clean_code((item or {}).get("code")) != change["code"]:
        raise BarcodeError("The barcode was changed again in Clover since then, so it was left as is.", 409)
    await clover.request("POST", f"/v3/merchants/{merchant_id}/items/{item_id}", json_body={"code": change.get("previous") or ""})
    await db.products.update_many({"cloverItemId": item_id, "barcode": change["code"]}, {"$set": {"barcode": change.get("previous") or ""}})
    await db.barcode_changes.update_one({"_id": change["_id"]}, {"$set": {"undone": True, "undoneAt": datetime.now(timezone.utc), "undoneBy": admin_email}})
    await clover.log("barcode_undo", "success", cloverItemId=item_id, detail=change["code"])
    return {"undone": True}


async def set_ignored(db, item_id: str, ignored: bool, name: str = "", admin_email: str = "") -> dict:
    if ignored:
        await db.barcode_ignores.update_one({"cloverItemId": item_id},
                                            {"$set": {"cloverItemId": item_id, "name": name, "by": admin_email, "at": datetime.now(timezone.utc)}},
                                            upsert=True)
    else:
        await db.barcode_ignores.delete_many({"cloverItemId": item_id})
    return {"ignored": ignored}


async def new_store_code(db, clover) -> str:
    """Next unused in-store EAN-13 (20 + 10 digits + check digit). Not saved until the owner presses Save."""
    merchant_id = await _merchant(clover)
    for _ in range(20):
        state = await db.agent_state.find_one_and_update({"key": "store_barcode_seq"}, {"$inc": {"value": 1}},
                                                         upsert=True, return_document=True)
        seq = int((state or {}).get("value") or 1)
        body = STORE_PREFIX + str(seq).zfill(10)
        code = body + str(check_digit(body))
        if not await _conflict(db, clover, merchant_id, code, ""):
            return code
    raise BarcodeError("Could not make a new store barcode. Try again.", 500)

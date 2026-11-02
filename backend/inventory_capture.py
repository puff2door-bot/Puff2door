"""Store photos: inventory reference photos and records.

When a saved photo's SKU or barcode matches exactly one website product, the
white-background photo is also published as that product's picture. These routes
never create catalog products, change prices, or call Clover.
"""
import asyncio
import csv
import io
import logging
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pymongo.errors import DuplicateKeyError

from inventory_photo_processing import CANVAS_SIZE, ProcessingUnavailable, prepare_inventory_photo

logger = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 12 * 1024 * 1024
BARCODE_INDEX = "inventory_barcode_unique"
_MONEY = re.compile(r"^\d{1,8}(\.\d{1,2})?$")
_QUANTITY = re.compile(r"^\d{1,7}$")


def _now():
    return datetime.now(timezone.utc)


def _iso(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return value


def public_record(row):
    """Admin-facing record. Photo storage ids stay on the server."""
    barcode = row.get("barcode")
    if not isinstance(barcode, str) or not barcode:
        barcode = row.get("identifier") if isinstance(row.get("identifier"), str) else ""
    return {
        "id": row.get("id"),
        "barcode": barcode,
        "identifier": barcode,
        "label": row.get("label") or "",
        "name": row.get("name") or "",
        "description": row.get("description") or "",
        "details": row.get("details") or "",
        "category": row.get("category") or "",
        "categorySlug": row.get("categorySlug") or "",
        "categoryId": row.get("categoryId") or "",
        "categoryMatch": row.get("categoryMatch") or ("matched" if row.get("categorySlug") else ("unmatched" if row.get("category") else "empty")),
        "brandSlug": row.get("brandSlug") or "",
        "brandId": row.get("brandId") or "",
        "brandName": row.get("brandName") or "",
        "brandMatch": row.get("brandMatch") or ("matched" if row.get("brandSlug") else ("unmatched" if row.get("brandName") else "empty")),
        "cost": row.get("cost"),
        "retailPrice": row.get("retailPrice"),
        "quantity": int(row.get("quantity") or 0),
        "notes": row.get("notes") or "",
        "width": row.get("width") or CANVAS_SIZE,
        "height": row.get("height") or CANVAS_SIZE,
        "createdAt": _iso(row.get("createdAt")),
        "updatedAt": _iso(row.get("updatedAt")),
        "createdBy": row.get("createdBy"),
        "purpose": "internal_inventory",
        "publishedProductId": row.get("publishedProductId"),
        "publishedProductName": row.get("publishedProductName") or "",
        "publishNote": row.get("publishNote") or "",
    }


def clean_barcode(value):
    if isinstance(value, bool) or not isinstance(value, str):
        raise HTTPException(status_code=422, detail="Enter the SKU or barcode as text so leading zeros are kept.")
    text = value.strip()
    if not text or len(text) > 200:
        raise HTTPException(status_code=422, detail="Enter a SKU or barcode, up to 200 characters.")
    return text


def clean_text(value, limit, field):
    if value is None:
        return ""
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail=f"{field} must be text.")
    text = value.strip()
    if len(text) > limit:
        raise HTTPException(status_code=422, detail=f"{field} must be {limit} characters or fewer.")
    return text


def clean_money(value, field):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, str):
        raise HTTPException(status_code=422, detail=f"Enter {field} as text, such as 12.50.")
    text = value.strip()
    if not text:
        return None
    if not _MONEY.fullmatch(text):
        raise HTTPException(status_code=422, detail=f"Enter {field} in dollars, such as 12.50.")
    try:
        return f"{Decimal(text):.2f}"
    except InvalidOperation as exc:
        raise HTTPException(status_code=422, detail=f"Enter {field} in dollars, such as 12.50.") from exc


def clean_quantity(value):
    if value is None or value == "":
        return 0
    if isinstance(value, bool) or isinstance(value, float) or not isinstance(value, (str, int)):
        raise HTTPException(status_code=422, detail="Enter quantity as a whole number.")
    text = str(value).strip()
    if not _QUANTITY.fullmatch(text):
        raise HTTPException(status_code=422, detail="Enter quantity as a whole number.")
    return int(text)


def duplicate_detail(existing):
    barcode = existing.get("barcode") if isinstance(existing.get("barcode"), str) else existing.get("identifier") or ""
    return {
        "message": f"SKU/barcode {barcode} is already saved. Edit the existing record instead of creating another.",
        "existingId": existing.get("id"),
        "barcode": str(barcode),
    }


def raise_duplicate(existing):
    raise HTTPException(status_code=409, detail=duplicate_detail(existing))


async def ensure_inventory_indexes(db):
    """Backfill string barcodes, then enforce one private record per SKU/barcode."""
    rows = await db.inventory_captures.find({}, {"_id": 1, "id": 1, "barcode": 1, "identifier": 1}).to_list(10000)
    for row in rows:
        barcode = row.get("barcode")
        if isinstance(barcode, str) and barcode.strip():
            cleaned = barcode.strip()
            if cleaned != barcode or row.get("identifier") != cleaned:
                await db.inventory_captures.update_one({"_id": row["_id"]}, {"$set": {"barcode": cleaned, "identifier": cleaned}})
            continue
        fallback = row.get("identifier")
        if not isinstance(fallback, str) or not fallback.strip():
            fallback = str(row.get("id") or row.get("_id") or "")
        fallback = fallback.strip()
        if fallback:
            await db.inventory_captures.update_one({"_id": row["_id"]}, {"$set": {"barcode": fallback, "identifier": fallback}})
    try:
        await db.inventory_captures.create_index("barcode", unique=True, name=BARCODE_INDEX)
    except Exception as exc:
        logger.warning("Private inventory barcode unique index was not created. Edit duplicate SKUs, then restart. %s", exc)
    try:
        await db.inventory_captures.create_index("id", unique=True, name="inventory_capture_id_unique")
    except Exception as exc:
        logger.warning("Private inventory id index was not created: %s", exc)


def create_inventory_capture_router(db, bucket, get_admin, prepare_photo, publish=None, unpublish=None, delete_product=None):
    router = APIRouter(prefix="/inventory-captures", dependencies=[Depends(get_admin)])

    async def _publish(capture_id, admin_id):
        """Put this record's photo on its website product. Never fails the save."""
        if publish is None:
            return
        row = await db.inventory_captures.find_one({"id": capture_id})
        if not row or not row.get("blobId"):
            return
        try:
            stream = await bucket.open_download_stream(row["blobId"])
            result = await publish(row, await stream.read(), admin_id) or {}
        except Exception as exc:
            logger.warning("Store photo %s could not be published: %s", capture_id, exc)
            result = {"note": "The photo is saved, but it could not be added to the website right now."}
        await db.inventory_captures.update_one({"id": capture_id}, {"$set": {
            "publishedProductId": result.get("productId"),
            "publishedProductName": result.get("productName") or "",
            "publishNote": result.get("note") or "",
        }})
    processing_gate = asyncio.Semaphore(1)
    # Persistence always runs the full white-background pipeline. prepare_photo
    # remains in the signature so the existing server registration keeps working.
    _ = prepare_photo

    async def _read_photo(file: UploadFile):
        raw = await file.read(MAX_PHOTO_BYTES + 1)
        if len(raw) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="Choose a photo under 12 MB.")
        if processing_gate.locked():
            raise HTTPException(status_code=429, detail="Another photo is processing. Please retry in a moment.")
        try:
            async with processing_gate:
                prepared, low_resolution = await asyncio.to_thread(prepare_inventory_photo, raw)
        except ProcessingUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return prepared, low_resolution

    async def _existing_barcode(barcode, ignore_id=None):
        existing = await db.inventory_captures.find_one({"barcode": barcode})
        if existing and existing.get("id") != ignore_id:
            return existing
        legacy = await db.inventory_captures.find_one({"identifier": barcode, "barcode": {"$exists": False}})
        if legacy and legacy.get("id") != ignore_id:
            return legacy
        return None

    async def _catalog():
        categories = await db.categories.find({}, {"_id": 0, "id": 1, "slug": 1, "name": 1}).to_list(500)
        brands = await db.brands.find({}, {"_id": 0, "id": 1, "slug": 1, "name": 1, "displayName": 1}).to_list(2000)
        return categories, brands

    def _match_named(text, rows, name_keys):
        raw = clean_text(text, 120, "Catalog value")
        if not raw:
            return None
        lowered = raw.lower()
        for row in rows:
            slug = str(row.get("slug") or "")
            if lowered == slug.lower():
                return row
            for key in name_keys:
                if lowered == str(row.get(key) or "").strip().lower():
                    return row
        return None

    def _category_fields(raw, categories, required=False):
        if raw is None or str(raw).strip() == "":
            if required:
                raise HTTPException(status_code=422, detail="Pick an existing website category.")
            return {"category": "", "categorySlug": "", "categoryId": "", "categoryMatch": "empty"}
        match = _match_named(str(raw), categories, ("name",))
        if not match:
            raise HTTPException(status_code=422, detail="Pick an existing website category. Free-text categories are not saved.")
        return {
            "category": match.get("name") or match.get("slug") or "",
            "categorySlug": match.get("slug") or "",
            "categoryId": match.get("id") or match.get("slug") or "",
            "categoryMatch": "matched",
        }

    def _brand_fields(raw, brands):
        if raw is None or str(raw).strip() == "":
            return {"brandName": "", "brandSlug": "", "brandId": "", "brandMatch": "empty"}
        match = _match_named(str(raw), brands, ("displayName", "name"))
        if not match:
            raise HTTPException(status_code=422, detail="Pick an existing website brand, or choose None.")
        return {
            "brandName": match.get("displayName") or match.get("name") or "",
            "brandSlug": match.get("slug") or "",
            "brandId": match.get("id") or match.get("slug") or "",
            "brandMatch": "matched",
        }

    def _present_record(row, categories, brands):
        record = public_record(row)
        if not record["categorySlug"] and record["category"]:
            match = None
            lowered = record["category"].strip().lower()
            for category in categories:
                if lowered in {str(category.get("slug") or "").lower(), str(category.get("name") or "").strip().lower()}:
                    match = category
                    break
            if match:
                record["category"] = match.get("name") or match.get("slug") or ""
                record["categorySlug"] = match.get("slug") or ""
                record["categoryId"] = match.get("id") or record["categorySlug"]
                record["categoryMatch"] = "matched"
            else:
                record["categoryMatch"] = "unmatched"
        if not record["brandSlug"] and record["brandName"]:
            lowered = record["brandName"].strip().lower()
            match = next((brand for brand in brands if lowered in {
                str(brand.get("slug") or "").lower(),
                str(brand.get("name") or "").strip().lower(),
                str(brand.get("displayName") or "").strip().lower(),
            }), None)
            if match:
                record["brandName"] = match.get("displayName") or match.get("name") or ""
                record["brandSlug"] = match.get("slug") or ""
                record["brandId"] = match.get("id") or record["brandSlug"]
                record["brandMatch"] = "matched"
            else:
                record["brandMatch"] = "unmatched"
        return record

    def _fields_from_values(barcode, label, name, description, details, category_fields, brand_fields, cost, retail_price, quantity, notes):
        return {
            "barcode": barcode,
            "identifier": barcode,
            "label": clean_text(label, 200, "Label"),
            "name": clean_text(name, 200, "Name"),
            "description": clean_text(description, 4000, "Description"),
            "details": clean_text(details, 4000, "Details"),
            **category_fields,
            **brand_fields,
            "cost": clean_money(cost, "cost"),
            "retailPrice": clean_money(retail_price, "retail price"),
            "quantity": clean_quantity(quantity),
            "notes": clean_text(notes, 4000, "Notes"),
            "purpose": "internal_inventory",
        }

    @router.post("/prepare")
    async def prepare(file: UploadFile = File(...), admin=Depends(get_admin)):
        prepared, low_resolution = await _read_photo(file)
        return Response(prepared, media_type="image/webp", headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Photo-Low-Resolution": str(low_resolution).lower(),
        })

    @router.get("/export.csv")
    async def export_csv(admin=Depends(get_admin)):
        rows = await db.inventory_captures.find({}).sort("createdAt", -1).to_list(5000)
        buffer = io.StringIO()
        writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\n")
        writer.writerow(["barcode", "name", "description", "details", "category", "categorySlug", "brand", "brandSlug", "label", "cost", "retailPrice", "quantity", "notes", "createdAt", "updatedAt"])
        categories, brands = await _catalog()
        for row in rows:
            item = _present_record(row, categories, brands)
            writer.writerow([
                item["barcode"], item["name"], item["description"], item["details"], item["category"], item["categorySlug"],
                item["brandName"], item["brandSlug"],
                item["label"], item["cost"] or "", item["retailPrice"] or "", item["quantity"], item["notes"],
                item["createdAt"] or "", item["updatedAt"] or "",
            ])
        body = buffer.getvalue().encode("utf-8")
        return Response(body, media_type="text/csv; charset=utf-8", headers={
            "Content-Disposition": 'attachment; filename="private-inventory.csv"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        })

    @router.get("")
    async def list_captures(admin=Depends(get_admin)):
        rows = await db.inventory_captures.find({}).sort("createdAt", -1).to_list(200)
        categories, brands = await _catalog()
        return {"captures": [_present_record(row, categories, brands) for row in rows]}

    @router.post("")
    async def capture(
        file: UploadFile = File(...),
        identifier: str = Form(""),
        barcode: str = Form(""),
        label: str = Form(""),
        name: str = Form(""),
        description: str = Form(""),
        details: str = Form(""),
        category: str = Form(""),
        categorySlug: str = Form(""),
        brand: str = Form(""),
        brandSlug: str = Form(""),
        cost: str = Form(""),
        retailPrice: str = Form(""),
        quantity: str = Form("0"),
        notes: str = Form(""),
        admin=Depends(get_admin),
    ):
        code = clean_barcode(barcode or identifier)
        categories, brands = await _catalog()
        fields = _fields_from_values(
            code, label, name, description, details,
            _category_fields(categorySlug or category, categories),
            _brand_fields(brandSlug or brand, brands),
            cost, retailPrice, quantity, notes,
        )
        existing = await _existing_barcode(code)
        if existing:
            raise_duplicate(existing)
        prepared, _low_resolution = await _read_photo(file)
        capture_id = str(uuid.uuid4())
        blob = await bucket.upload_from_stream(f"{capture_id}.webp", prepared, metadata={"content_type": "image/webp"})
        record = {
            **fields,
            "id": capture_id,
            "blobId": blob,
            "width": CANVAS_SIZE,
            "height": CANVAS_SIZE,
            "createdAt": _now(),
            "updatedAt": _now(),
            "createdBy": admin["id"],
            "updatedBy": admin["id"],
        }
        try:
            await db.inventory_captures.insert_one(record)
        except DuplicateKeyError:
            await bucket.delete(blob)
            existing = await _existing_barcode(code)
            if existing:
                raise_duplicate(existing)
            raise HTTPException(status_code=409, detail=duplicate_detail({"id": None, "barcode": code}))
        except Exception:
            await bucket.delete(blob)
            raise
        await _publish(capture_id, admin["id"])
        record = await db.inventory_captures.find_one({"id": capture_id}) or record
        categories, brands = await _catalog()
        return _present_record(record, categories, brands)

    @router.post("/publish-all")
    async def publish_all(admin=Depends(get_admin)):
        """Re-check every saved store photo and put it on its website product."""
        published = 0
        for row in await db.inventory_captures.find({}, {"id": 1}).to_list(5000):
            await _publish(row["id"], admin["id"])
            if (await db.inventory_captures.find_one({"id": row["id"]}, {"publishedProductId": 1}) or {}).get("publishedProductId"):
                published += 1
        return {"published": published}

    @router.get("/{capture_id}")
    async def get_capture(capture_id: str, admin=Depends(get_admin)):
        row = await db.inventory_captures.find_one({"id": capture_id})
        if not row:
            raise HTTPException(status_code=404, detail="Inventory record not found")
        categories, brands = await _catalog()
        return _present_record(row, categories, brands)

    @router.put("/{capture_id}")
    async def update_capture(capture_id: str, request: Request, admin=Depends(get_admin)):
        row = await db.inventory_captures.find_one({"id": capture_id})
        if not row:
            raise HTTPException(status_code=404, detail="Inventory record not found")
        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Record changes must be sent as JSON.") from exc
        if not isinstance(payload, dict):
            raise HTTPException(status_code=422, detail="Record changes must be sent as JSON.")
        categories, brands = await _catalog()
        current = _present_record(row, categories, brands)
        if "barcode" in payload or "identifier" in payload:
            raw_code = payload["barcode"] if "barcode" in payload else payload["identifier"]
            if "barcode" in payload and "identifier" in payload and payload["barcode"] != payload["identifier"]:
                raise HTTPException(status_code=422, detail="Send one SKU or barcode value.")
            code = clean_barcode(raw_code)
        else:
            code = current["barcode"]
        if "categorySlug" in payload or "category" in payload:
            category_raw = payload.get("categorySlug") if "categorySlug" in payload else payload.get("category")
            category_fields = _category_fields(category_raw, categories)
        elif current["categoryMatch"] == "unmatched":
            category_fields = {"category": current["category"], "categorySlug": "", "categoryId": "", "categoryMatch": "unmatched"}
        else:
            category_fields = {"category": current["category"], "categorySlug": current["categorySlug"], "categoryId": current["categoryId"], "categoryMatch": current["categoryMatch"]}
        if "brandSlug" in payload or "brand" in payload:
            brand_raw = payload.get("brandSlug") if "brandSlug" in payload else payload.get("brand")
            brand_fields = _brand_fields(brand_raw, brands)
        elif current["brandMatch"] == "unmatched":
            brand_fields = {"brandName": current["brandName"], "brandSlug": "", "brandId": "", "brandMatch": "unmatched"}
        else:
            brand_fields = {"brandName": current["brandName"], "brandSlug": current["brandSlug"], "brandId": current["brandId"], "brandMatch": current["brandMatch"]}
        fields = _fields_from_values(
            code,
            payload["label"] if "label" in payload else current["label"],
            payload["name"] if "name" in payload else current["name"],
            payload["description"] if "description" in payload else current["description"],
            payload["details"] if "details" in payload else current["details"],
            category_fields,
            brand_fields,
            payload["cost"] if "cost" in payload else (current["cost"] or ""),
            payload["retailPrice"] if "retailPrice" in payload else (current["retailPrice"] or ""),
            payload["quantity"] if "quantity" in payload else current["quantity"],
            payload["notes"] if "notes" in payload else current["notes"],
        )
        existing = await _existing_barcode(code, ignore_id=capture_id)
        if existing:
            raise_duplicate(existing)
        fields["updatedAt"] = _now()
        fields["updatedBy"] = admin["id"]
        try:
            await db.inventory_captures.update_one({"id": capture_id}, {"$set": fields})
        except DuplicateKeyError:
            existing = await _existing_barcode(code, ignore_id=capture_id)
            if existing:
                raise_duplicate(existing)
            raise HTTPException(status_code=409, detail=duplicate_detail({"id": None, "barcode": code}))
        if code != current["barcode"] or not row.get("publishedProductId"):
            await _publish(capture_id, admin["id"])
        updated = await db.inventory_captures.find_one({"id": capture_id})
        return _present_record(updated, categories, brands)

    @router.post("/{capture_id}/photo")
    async def replace_photo(capture_id: str, file: UploadFile = File(...), admin=Depends(get_admin)):
        row = await db.inventory_captures.find_one({"id": capture_id})
        if not row:
            raise HTTPException(status_code=404, detail="Inventory record not found")
        prepared, _low_resolution = await _read_photo(file)
        blob = await bucket.upload_from_stream(f"{capture_id}-{uuid.uuid4().hex}.webp", prepared, metadata={"content_type": "image/webp"})
        try:
            await db.inventory_captures.update_one({"id": capture_id}, {"$set": {
                "blobId": blob,
                "width": CANVAS_SIZE,
                "height": CANVAS_SIZE,
                "updatedAt": _now(),
                "updatedBy": admin["id"],
            }})
        except Exception:
            await bucket.delete(blob)
            raise
        previous = row.get("blobId")
        if previous and previous != blob:
            try:
                await bucket.delete(previous)
            except Exception:
                logger.warning("Could not remove the previous private inventory photo for %s", capture_id)
        await _publish(capture_id, admin["id"])
        updated = await db.inventory_captures.find_one({"id": capture_id})
        categories, brands = await _catalog()
        return _present_record(updated, categories, brands)

    @router.delete("/{capture_id}")
    async def delete_capture(capture_id: str, deleteProduct: int = 0, admin=Depends(get_admin)):
        """Delete a store photo record and its photo. The website product gets its previous picture back.
        With deleteProduct=<that product's id>, the product is deleted from the website and Clover too."""
        row = await db.inventory_captures.find_one({"id": capture_id})
        if not row:
            raise HTTPException(status_code=404, detail="Inventory record not found")
        restored = None
        removed = None
        if deleteProduct:
            if delete_product is None:
                raise HTTPException(status_code=400, detail="Deleting the product is not available.")
            # Raises (and keeps the record) if the product can't be removed everywhere.
            removed = await delete_product(row, int(deleteProduct), admin["id"])
        elif unpublish is not None:
            try:
                restored = await unpublish(row)
            except Exception as exc:
                logger.warning("Website picture for store photo %s could not be restored: %s", capture_id, exc)
        await db.inventory_captures.delete_one({"id": capture_id})
        if row.get("blobId"):
            try:
                await bucket.delete(row["blobId"])
            except Exception:
                logger.warning("Could not remove the stored photo for %s", capture_id)
        return {"deleted": True, "id": capture_id, "productRestored": (restored or {}).get("productName") or "",
                "productDeleted": (removed or {}).get("productName") or "", "cloverDeleted": bool((removed or {}).get("cloverDeleted"))}

    @router.get("/{capture_id}/photo")
    async def photo(capture_id: str, admin=Depends(get_admin)):
        row = await db.inventory_captures.find_one({"id": capture_id})
        if not row:
            raise HTTPException(status_code=404, detail="Inventory photo not found")
        stream = await bucket.open_download_stream(row["blobId"])
        return Response(await stream.read(), media_type="image/webp", headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        })

    return router

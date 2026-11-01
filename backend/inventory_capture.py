"""Private inventory reference photos and records.

These routes never create catalog products, change store prices, or call Clover.
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


def create_inventory_capture_router(db, bucket, get_admin, prepare_photo):
    router = APIRouter(prefix="/inventory-captures", dependencies=[Depends(get_admin)])
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

    def _fields_from_values(barcode, label, name, description, details, category, cost, retail_price, quantity, notes):
        return {
            "barcode": barcode,
            "identifier": barcode,
            "label": clean_text(label, 200, "Label"),
            "name": clean_text(name, 200, "Name"),
            "description": clean_text(description, 4000, "Description"),
            "details": clean_text(details, 4000, "Details"),
            "category": clean_text(category, 120, "Category"),
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
        writer.writerow(["barcode", "name", "description", "details", "category", "label", "cost", "retailPrice", "quantity", "notes", "createdAt", "updatedAt"])
        for row in rows:
            item = public_record(row)
            writer.writerow([
                item["barcode"], item["name"], item["description"], item["details"], item["category"],
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
        return {"captures": [public_record(row) for row in rows]}

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
        cost: str = Form(""),
        retailPrice: str = Form(""),
        quantity: str = Form("0"),
        notes: str = Form(""),
        admin=Depends(get_admin),
    ):
        code = clean_barcode(barcode or identifier)
        fields = _fields_from_values(code, label, name, description, details, category, cost, retailPrice, quantity, notes)
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
        return public_record(record)

    @router.get("/{capture_id}")
    async def get_capture(capture_id: str, admin=Depends(get_admin)):
        row = await db.inventory_captures.find_one({"id": capture_id})
        if not row:
            raise HTTPException(status_code=404, detail="Inventory record not found")
        return public_record(row)

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
        current = public_record(row)
        if "barcode" in payload or "identifier" in payload:
            raw_code = payload["barcode"] if "barcode" in payload else payload["identifier"]
            if "barcode" in payload and "identifier" in payload and payload["barcode"] != payload["identifier"]:
                raise HTTPException(status_code=422, detail="Send one SKU or barcode value.")
            code = clean_barcode(raw_code)
        else:
            code = current["barcode"]
        fields = _fields_from_values(
            code,
            payload["label"] if "label" in payload else current["label"],
            payload["name"] if "name" in payload else current["name"],
            payload["description"] if "description" in payload else current["description"],
            payload["details"] if "details" in payload else current["details"],
            payload["category"] if "category" in payload else current["category"],
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
        updated = await db.inventory_captures.find_one({"id": capture_id})
        return public_record(updated)

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
        updated = await db.inventory_captures.find_one({"id": capture_id})
        return public_record(updated)

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

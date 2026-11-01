"""Private inventory reference photos; never writes catalog or Clover records."""
import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from inventory_photo_processing import prepare_inventory_photo, ProcessingUnavailable


def create_inventory_capture_router(db, bucket, get_admin, prepare_photo):
    router = APIRouter(prefix="/inventory-captures")
    processing_gate = asyncio.Semaphore(1)

    @router.post("/prepare")
    async def prepare(file: UploadFile = File(...), admin=Depends(get_admin)):
        raw = await file.read(12 * 1024 * 1024 + 1)
        if len(raw) > 12 * 1024 * 1024:
            raise HTTPException(413, "Choose a photo under 12 MB.")
        if processing_gate.locked():
            raise HTTPException(429, "Another photo is processing. Please retry in a moment.")
        try:
            async with processing_gate:
                output, low_resolution = await asyncio.to_thread(prepare_inventory_photo, raw, prepare_photo)
        except ProcessingUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return Response(output, media_type="image/webp", headers={
            "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
            "X-Photo-Low-Resolution": str(low_resolution).lower(),
        })

    @router.get("")
    async def list_captures(admin=Depends(get_admin)):
        rows = await db.inventory_captures.find({}).sort("createdAt", -1).to_list(200)
        return {"captures": [{k: v for k, v in row.items() if k not in {"_id", "blobId"}} for row in rows]}

    @router.post("")
    async def capture(file: UploadFile = File(...), identifier: str = Form(...),
                      label: str = Form(""), admin=Depends(get_admin)):
        identifier, label = identifier.strip(), label.strip()
        if not identifier or len(identifier) > 200 or len(label) > 200:
            raise HTTPException(422, "Enter a SKU or barcode, up to 200 characters.")
        raw = await file.read(12 * 1024 * 1024 + 1)
        if len(raw) > 12 * 1024 * 1024:
            raise HTTPException(413, "Choose a photo under 12 MB.")
        try:
            prepared, _, side = await asyncio.to_thread(prepare_photo, raw)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        capture_id = str(uuid.uuid4())
        blob = await bucket.upload_from_stream(capture_id, prepared, metadata={"content_type": "image/webp"})
        record = {"id": capture_id, "identifier": identifier, "label": label,
                  "blobId": blob, "width": side, "createdAt": datetime.now(timezone.utc),
                  "createdBy": admin["id"], "purpose": "internal_inventory"}
        try:
            await db.inventory_captures.insert_one(record)
        except Exception:
            await bucket.delete(blob)
            raise
        return {k: v for k, v in record.items() if k not in {"_id", "blobId"}}

    @router.get("/{capture_id}/photo")
    async def photo(capture_id: str, admin=Depends(get_admin)):
        row = await db.inventory_captures.find_one({"id": capture_id})
        if not row:
            raise HTTPException(404, "Inventory photo not found")
        stream = await bucket.open_download_stream(row["blobId"])
        return Response(await stream.read(), media_type="image/webp", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    return router

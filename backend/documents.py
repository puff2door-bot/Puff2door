"""Licenses & important documents (admin only).

Files live in their own private GridFS bucket ("private_docs"), never in the public
"uploads" bucket, and are only served to a signed-in admin. Document types are owner
editable (add / rename / reorder / delete). Expiry dates drive reminder emails.
"""
from __future__ import annotations

import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId

DEFAULT_TYPES = [
    ("Business Tax Receipt (City / County)", True),
    ("Tobacco & Nicotine Retail License", True),
    ("Sales Tax Certificate (DR-11)", False),
    ("Food / Hemp Permit (FDACS)", True),
    ("Certificate of Insurance", True),
    ("Store Lease", True),
    ("LLC / Sunbiz Records", True),
    ("EIN Letter (IRS)", False),
    ("Fire & Building Inspection", True),
    ("Other", False),
]
ALLOWED = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic",
           "image/heif": ".heif"}
MAX_BYTES = 15 * 1024 * 1024
REMIND_DAYS = (0, 7, 30, 60)  # smallest point first


class DocError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _now():
    return datetime.now(timezone.utc)


def _id() -> str:
    return secrets.token_hex(6)


def _date(v) -> Optional[str]:
    if not v:
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v)):
        raise DocError("Dates must look like 2026-12-31.")
    date.fromisoformat(str(v))
    return str(v)


def status_of(expiry: Optional[str], today: Optional[date] = None) -> dict:
    if not expiry:
        return {"state": "none", "days": None}
    today = today or datetime.now(timezone.utc).date()
    days = (date.fromisoformat(expiry) - today).days
    state = "expired" if days < 0 else "soon" if days <= 30 else "ok"
    return {"state": state, "days": days}


async def ensure_types(db) -> None:
    if await db.doc_types.count_documents({}) == 0:
        await db.doc_types.insert_many([{"id": _id(), "name": n, "hasExpiry": e, "order": i, "createdAt": _now()}
                                        for i, (n, e) in enumerate(DEFAULT_TYPES)])


async def overview(db) -> dict:
    await ensure_types(db)
    types = await db.doc_types.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    docs = await db.documents.find({}, {"_id": 0}).sort([("expiryDate", 1), ("title", 1)]).to_list(2000)
    counts: dict = {}
    for d in docs:
        d["status"] = status_of(d.get("expiryDate"))
        counts[d.get("typeId")] = counts.get(d.get("typeId"), 0) + 1
    for t in types:
        t["count"] = counts.get(t["id"], 0)
    return {"types": types, "documents": docs,
            "summary": {"total": len(docs), "expired": sum(1 for d in docs if d["status"]["state"] == "expired"),
                        "soon": sum(1 for d in docs if d["status"]["state"] == "soon")}}


# ---- types ----
async def add_type(db, name: str, has_expiry: bool) -> dict:
    name = re.sub(r"\s+", " ", name or "").strip()[:80]
    if not name:
        raise DocError("Give the document type a name.")
    if await db.doc_types.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
        raise DocError("A type with that name already exists.")
    last = await db.doc_types.find_one({}, sort=[("order", -1)]) or {}
    row = {"id": _id(), "name": name, "hasExpiry": bool(has_expiry), "order": int(last.get("order", -1)) + 1, "createdAt": _now()}
    await db.doc_types.insert_one(dict(row))
    return row


async def update_type(db, type_id: str, name: Optional[str], has_expiry: Optional[bool], order: Optional[int]) -> dict:
    sets: dict = {}
    if name is not None:
        name = re.sub(r"\s+", " ", name).strip()[:80]
        if not name:
            raise DocError("The name can't be empty.")
        clash = await db.doc_types.find_one({"id": {"$ne": type_id}, "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        if clash:
            raise DocError("A type with that name already exists.")
        sets["name"] = name
    if has_expiry is not None:
        sets["hasExpiry"] = bool(has_expiry)
    if order is not None:
        sets["order"] = int(order)
    res = await db.doc_types.update_one({"id": type_id}, {"$set": sets})
    if not res.matched_count:
        raise DocError("Type not found.", 404)
    return {"ok": True}


async def delete_type(db, type_id: str, move_to: Optional[str]) -> dict:
    used = await db.documents.count_documents({"typeId": type_id})
    if used:
        if not move_to or not await db.doc_types.find_one({"id": move_to}) or move_to == type_id:
            raise DocError(f"{used} document(s) use this type. Pick another type to move them to first.", 409)
        await db.documents.update_many({"typeId": type_id}, {"$set": {"typeId": move_to}})
    await db.doc_types.delete_one({"id": type_id})
    return {"moved": used}


# ---- documents ----
FIELDS = ("title", "typeId", "number", "issuedBy", "issueDate", "expiryDate", "notes", "remind")


async def save_document(db, data: dict, doc_id: Optional[str] = None, admin_email: str = "") -> dict:
    row = {k: data.get(k) for k in FIELDS if k in data}
    if "title" in row:
        row["title"] = re.sub(r"\s+", " ", str(row["title"] or "")).strip()[:120]
        if not row["title"]:
            raise DocError("Give the document a name.")
    if "typeId" in row and not await db.doc_types.find_one({"id": row["typeId"]}):
        raise DocError("Pick a document type.")
    for k in ("issueDate", "expiryDate"):
        if k in row:
            row[k] = _date(row[k])
    for k in ("number", "issuedBy"):
        if k in row:
            row[k] = str(row[k] or "").strip()[:120]
    if "notes" in row:
        row["notes"] = str(row["notes"] or "")[:1000]
    if "remind" in row:
        row["remind"] = row["remind"] is not False
    row["updatedAt"] = _now()
    if doc_id:
        if "expiryDate" in row:
            row["remindersSent"] = []
        res = await db.documents.update_one({"id": doc_id}, {"$set": row})
        if not res.matched_count:
            raise DocError("Document not found.", 404)
        return await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not row.get("title") or not row.get("typeId"):
        raise DocError("A name and a type are required.")
    row.update({"id": _id(), "files": [], "createdAt": _now(), "createdBy": admin_email, "remindersSent": [],
                "remind": row.get("remind", True)})
    await db.documents.insert_one(dict(row))
    row.pop("_id", None)
    return row


async def delete_document(db, bucket, doc_id: str) -> dict:
    doc = await db.documents.find_one({"id": doc_id})
    if not doc:
        raise DocError("Document not found.", 404)
    for f in doc.get("files") or []:
        try:
            await bucket.delete(ObjectId(f["fileId"]))
        except Exception:
            pass
    await db.documents.delete_one({"id": doc_id})
    return {"deleted": True}


async def add_file(db, bucket, doc_id: str, filename: str, content_type: str, data: bytes) -> dict:
    if not await db.documents.find_one({"id": doc_id}, {"_id": 1}):
        raise DocError("Document not found.", 404)
    ctype = (content_type or "").lower()
    if ctype not in ALLOWED:
        raise DocError("Upload a PDF or a photo (JPG, PNG, WEBP or HEIC).")
    if len(data) > MAX_BYTES:
        raise DocError("That file is over 15 MB. Try a smaller scan or photo.")
    if not data:
        raise DocError("That file is empty.")
    name = re.sub(r"[^A-Za-z0-9._ ()-]", "_", filename or f"document{ALLOWED[ctype]}")[:100]
    file_id = await bucket.upload_from_stream(name, data, metadata={"content_type": ctype, "docId": doc_id})
    entry = {"fileId": str(file_id), "name": name, "size": len(data), "contentType": ctype, "uploadedAt": _now()}
    await db.documents.update_one({"id": doc_id}, {"$push": {"files": entry}, "$set": {"updatedAt": _now()}})
    return entry


async def remove_file(db, bucket, doc_id: str, file_id: str) -> dict:
    res = await db.documents.update_one({"id": doc_id}, {"$pull": {"files": {"fileId": file_id}}})
    if not res.modified_count:
        raise DocError("File not found.", 404)
    try:
        await bucket.delete(ObjectId(file_id))
    except Exception:
        pass
    return {"ok": True}


async def read_file(db, bucket, doc_id: str, file_id: str) -> tuple[bytes, str, str]:
    doc = await db.documents.find_one({"id": doc_id, "files.fileId": file_id}, {"files": 1})
    if not doc:
        raise DocError("File not found.", 404)
    f = next(x for x in doc["files"] if x["fileId"] == file_id)
    stream = await bucket.open_download_stream(ObjectId(file_id))
    return await stream.read(), f["name"], f["contentType"]


# ---- reminders (called daily by automations) ----
async def due_reminders(db) -> list[dict]:
    """Documents that crossed a reminder point (60/30/7 days, expired) and haven't been reminded for it."""
    out = []
    today = datetime.now(timezone.utc).date()
    async for d in db.documents.find({"expiryDate": {"$nin": [None, ""]}, "remind": {"$ne": False}}, {"_id": 0}):
        days = status_of(d["expiryDate"], today)["days"]
        point = next((p for p in REMIND_DAYS if days <= p), None)
        if point is None or point in (d.get("remindersSent") or []):
            continue
        await db.documents.update_one({"id": d["id"]}, {"$addToSet": {"remindersSent": point}})
        out.append({**d, "days": days})
    return out

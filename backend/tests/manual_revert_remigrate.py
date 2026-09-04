"""One-off script: backup product image fields, test revert -> re-migrate, restore on failure."""
import asyncio
import json
import time

import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

fe = dotenv_values("/app/frontend/.env")
BASE = fe["REACT_APP_BACKEND_URL"].rstrip("/")
be = dotenv_values("/app/backend/.env")
BACKUP = "/tmp/img_backup.json"


async def backup():
    c = AsyncIOMotorClient(be["MONGO_URL"])
    db = c[be["DB_NAME"]]
    docs = await db.products.find({}, {"_id": 0, "id": 1, "image": 1, "image2": 1, "imageOriginal": 1, "image2Original": 1}).to_list(500)
    json.dump(docs, open(BACKUP, "w"))
    print("backed up", len(docs), "products")


async def restore():
    c = AsyncIOMotorClient(be["MONGO_URL"])
    db = c[be["DB_NAME"]]
    docs = json.load(open(BACKUP))
    for d in docs:
        setf = {k: v for k, v in d.items() if k != "id"}
        unset = {k: "" for k in ("imageOriginal", "image2Original") if k not in d}
        await db.products.update_one({"id": d["id"]}, {"$set": setf, **({"$unset": unset} if unset else {})})
    print("restored", len(docs), "products")


def main():
    asyncio.run(backup())
    s = requests.Session()
    tok = s.post(f"{BASE}/api/auth/login", json={"email": "admin@puff2door.com", "password": "Puff2Door-Admin1"}).json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})

    r = s.post(f"{BASE}/api/admin/products/migrate-images/revert")
    print("revert:", r.status_code, r.text[:120])
    st = s.get(f"{BASE}/api/admin/products/migrate-images/status").json()
    print("after revert externalRemaining:", st["externalRemaining"])
    assert st["externalRemaining"] > 0, "revert did not restore external links"

    r = s.post(f"{BASE}/api/admin/products/migrate-images")
    print("migrate start:", r.status_code, r.text[:80])
    dup = s.post(f"{BASE}/api/admin/products/migrate-images")
    print("second start while running (expect 409):", dup.status_code)
    ok = False
    for _ in range(60):
        time.sleep(5)
        st = s.get(f"{BASE}/api/admin/products/migrate-images/status").json()
        print(f"  running={st['running']} {st['done']}/{st['total']} migrated={st['migrated']} failed={len(st['failed'])} ext={st['externalRemaining']}")
        if not st["running"]:
            ok = st["externalRemaining"] == 0 and not st["failed"]
            break
    print("FINAL status:", {k: st[k] for k in ("running", "total", "done", "migrated", "externalRemaining")}, "failed:", st["failed"][:3])
    if not ok:
        print("RE-MIGRATION INCOMPLETE -> restoring backup")
        asyncio.run(restore())
    else:
        print("re-migration OK, catalog fully local")


if __name__ == "__main__":
    main()

"""Clover inventory integration for HD Smoke Shop.

The website keeps its current catalog and uses Clover as the source of truth for
stock quantities. Tokens are encrypted before they are stored in MongoDB.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from pymongo.errors import DuplicateKeyError


LOGGER = logging.getLogger(__name__)
USER_AGENT = "HD Smoke Shop/1.0 (inventory-sync; https://puff2door.com)"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_identifier(value: Any) -> str:
    return str(value or "").strip()


def exact_barcode(value: Any) -> str:
    """Keep SKU/barcode text exactly, including leading zeros. Numbers are rejected."""
    if isinstance(value, str):
        return value.strip()
    return ""


def redact_text(value: str) -> str:
    return re.sub(r"(?i)bearer\s+\S+", "bearer [redacted]", value)


def _match_identifier(value: Any) -> str:
    return "".join(ch for ch in _clean_identifier(value).upper() if ch.isalnum())


def _elements(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [value for value in payload if isinstance(value, dict)]
    if not isinstance(payload, dict):
        return []
    values = payload.get("elements")
    if isinstance(values, list):
        return [value for value in values if isinstance(value, dict)]
    values = payload.get("items")
    if isinstance(values, list):
        return [value for value in values if isinstance(value, dict)]
    return []


def _stock_item_id(stock: dict) -> str:
    item = stock.get("item")
    if isinstance(item, dict) and item.get("id"):
        return str(item["id"])
    return _clean_identifier(stock.get("itemId") or stock.get("id"))


def _stock_quantity(stock: dict) -> int:
    raw = stock.get("quantity", stock.get("stockCount", 0))
    try:
        return max(0, int(float(raw or 0)))
    except (TypeError, ValueError):
        return 0


class CloverError(RuntimeError):
    pass


class CloverIntegration:
    def __init__(
        self,
        db,
        *,
        client_id: str,
        client_secret: str,
        jwt_secret: str,
        environment: str = "production",
        redirect_uri: str,
        site_url: str,
        webhook_auth_code: str = "",
        http_client_factory=None,
        sync_enabled: bool = False,
        dry_run: bool = False,
    ):
        self.db = db
        self.client_id = client_id.strip()
        self.client_secret = client_secret.strip()
        self.environment = "sandbox" if environment.strip().lower() == "sandbox" else "production"
        self.redirect_uri = redirect_uri.strip()
        self.site_url = site_url.rstrip("/")
        self.webhook_auth_code = webhook_auth_code.strip()
        # Automatic catalog pulls and online-order stock updates stay off until
        # the server flag is turned on. The API merchant id is never hardcoded.
        self.sync_enabled = bool(sync_enabled)
        self.dry_run = bool(dry_run)
        key = base64.urlsafe_b64encode(hashlib.sha256(jwt_secret.encode("utf-8")).digest())
        self.cipher = Fernet(key)
        self.http_client_factory = http_client_factory or (lambda **kwargs: httpx.AsyncClient(**kwargs))

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    @property
    def api_base(self) -> str:
        return "https://apisandbox.dev.clover.com" if self.environment == "sandbox" else "https://api.clover.com"

    @property
    def authorize_base(self) -> str:
        return "https://sandbox.dev.clover.com" if self.environment == "sandbox" else "https://www.clover.com"

    @property
    def webhook_url(self) -> str:
        # The callback must reach the API service, which may be hosted separately
        # from the static storefront.
        callback_base = self.redirect_uri.split("/api/clover/oauth/callback", 1)[0].rstrip("/")
        return f"{callback_base}/api/clover/webhook"

    def encrypt(self, value: str) -> str:
        return self.cipher.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, value: str) -> str:
        try:
            return self.cipher.decrypt(value.encode("ascii")).decode("utf-8")
        except (InvalidToken, ValueError, TypeError) as exc:
            raise CloverError("Stored Clover authorization is no longer readable. Reconnect Clover.") from exc

    async def config(self) -> Optional[dict]:
        return await self.db.integrations.find_one({"key": "clover"})

    async def log(self, action: str, status: str, **details):
        safe = {}
        for key, value in details.items():
            if re.search(r"token|secret|authorization|password", str(key), re.I):
                continue
            if isinstance(value, str):
                value = redact_text(value)
            safe[key] = value
        await self.db.clover_sync_logs.insert_one({
            "id": hashlib.sha256(f"{utcnow().isoformat()}:{action}".encode()).hexdigest()[:24],
            "action": action,
            "status": status,
            "createdAt": utcnow(),
            **safe,
        })

    async def create_authorization_url(self, admin_id: str) -> str:
        if not self.configured:
            raise CloverError("Add the Clover App ID and App Secret to the secure server settings first.")
        raw_state = secrets.token_urlsafe(32)
        await self.db.clover_oauth_states.insert_one({
            "stateHash": hashlib.sha256(raw_state.encode()).hexdigest(),
            "adminId": admin_id,
            "createdAt": utcnow(),
            "expiresAt": utcnow() + timedelta(minutes=15),
        })
        query = urlencode({"client_id": self.client_id, "redirect_uri": self.redirect_uri, "state": raw_state})
        return f"{self.authorize_base}/oauth/v2/authorize?{query}"

    async def exchange_code(self, code: str, merchant_id: str, state: str) -> dict:
        state_hash = hashlib.sha256(state.encode()).hexdigest()
        saved_state = await self.db.clover_oauth_states.find_one_and_delete({
            "stateHash": state_hash,
            "expiresAt": {"$gt": utcnow()},
        })
        if not saved_state:
            raise CloverError("The Clover connection link expired. Start again from the admin panel.")
        if not self.configured:
            raise CloverError("Clover server settings are incomplete.")
        async with self.http_client_factory(timeout=25) as client:
            response = await client.post(
                f"{self.api_base}/oauth/v2/token",
                json={"client_id": self.client_id, "client_secret": self.client_secret, "code": code},
                headers={"Accept": "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT},
            )
        data = self._json_or_error(response, "Clover did not accept the authorization code")
        if not data.get("access_token") or not data.get("refresh_token"):
            raise CloverError("Clover did not return the required authorization tokens.")
        now = utcnow()
        doc = {
            "key": "clover",
            "environment": self.environment,
            # OAuth supplies the API merchant id. The number printed on a
            # Clover device is a different identifier and is not stored here.
            "merchantId": _clean_identifier(merchant_id),
            "encryptedAccessToken": self.encrypt(data["access_token"]),
            "encryptedRefreshToken": self.encrypt(data["refresh_token"]),
            "accessTokenExpiration": data.get("access_token_expiration"),
            "refreshTokenExpiration": data.get("refresh_token_expiration"),
            "connectedAt": now,
            "connectedBy": saved_state.get("adminId"),
            "updatedAt": now,
        }
        await self.db.integrations.update_one({"key": "clover"}, {"$set": doc}, upsert=True)
        try:
            merchant = await self.request("GET", f"/v3/merchants/{merchant_id}")
            merchant_name = merchant.get("name", "") if isinstance(merchant, dict) else ""
            if merchant_name:
                await self.db.integrations.update_one({"key": "clover"}, {"$set": {"merchantName": merchant_name}})
                doc["merchantName"] = merchant_name
        except CloverError as exc:
            LOGGER.warning("Clover connected but merchant details were unavailable: %s", exc)
        await self.log("connect", "success", merchantId=merchant_id)
        return doc

    @staticmethod
    def _json_or_error(response: httpx.Response, fallback: str) -> dict:
        try:
            data = response.json() if response.content else {}
        except ValueError:
            data = {}
        if response.is_error:
            message = data.get("message") or data.get("error_description") or data.get("error") or fallback
            raise CloverError(str(message))
        return data

    async def access_token(self, force_refresh: bool = False) -> tuple[str, dict]:
        doc = await self.config()
        if not doc or not doc.get("encryptedAccessToken"):
            raise CloverError("Clover is not connected.")
        expires = doc.get("accessTokenExpiration")
        should_refresh = force_refresh
        if expires:
            try:
                should_refresh = should_refresh or int(expires) <= int(utcnow().timestamp()) + 90
            except (TypeError, ValueError):
                should_refresh = True
        if not should_refresh:
            return self.decrypt(doc["encryptedAccessToken"]), doc
        refresh_token = self.decrypt(doc.get("encryptedRefreshToken", ""))
        async with self.http_client_factory(timeout=25) as client:
            response = await client.post(
                f"{self.api_base}/oauth/v2/refresh",
                json={"client_id": self.client_id, "refresh_token": refresh_token},
                headers={"Accept": "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT},
            )
        data = self._json_or_error(response, "Clover authorization could not be refreshed")
        if not data.get("access_token"):
            raise CloverError("Clover returned an incomplete refreshed authorization.")
        updates = {
            "encryptedAccessToken": self.encrypt(data["access_token"]),
            "accessTokenExpiration": data.get("access_token_expiration"),
            "updatedAt": utcnow(),
        }
        if data.get("refresh_token"):
            updates["encryptedRefreshToken"] = self.encrypt(data["refresh_token"])
            updates["refreshTokenExpiration"] = data.get("refresh_token_expiration")
        await self.db.integrations.update_one({"key": "clover"}, {"$set": updates})
        doc.update(updates)
        return data["access_token"], doc

    async def request(self, method: str, path: str, *, json_body: Optional[dict] = None, params: Optional[dict] = None, retry_auth: bool = True) -> dict:
        token, _ = await self.access_token()
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": USER_AGENT}
        async with self.http_client_factory(timeout=30) as client:
            response = await client.request(method, f"{self.api_base}{path}", headers=headers, json=json_body, params=params)
        if response.status_code == 401 and retry_auth:
            token, _ = await self.access_token(force_refresh=True)
            headers["Authorization"] = f"Bearer {token}"
            async with self.http_client_factory(timeout=30) as client:
                response = await client.request(method, f"{self.api_base}{path}", headers=headers, json=json_body, params=params)
        return self._json_or_error(response, "Clover inventory request failed")

    async def _paged(self, path: str) -> list[dict]:
        rows: list[dict] = []
        offset = 0
        while True:
            payload = await self.request("GET", path, params={"limit": 1000, "offset": offset})
            page = _elements(payload)
            rows.extend(page)
            if len(page) < 1000:
                break
            offset += len(page)
        return rows

    async def fetch_inventory(self) -> list[dict]:
        doc = await self.config()
        if not doc or not doc.get("merchantId"):
            raise CloverError("Clover is not connected.")
        merchant_id = doc["merchantId"]
        items = await self._paged(f"/v3/merchants/{merchant_id}/items")
        stocks = await self._paged(f"/v3/merchants/{merchant_id}/item_stocks")
        stock_by_id = {_stock_item_id(stock): _stock_quantity(stock) for stock in stocks if _stock_item_id(stock)}
        normalized = []
        for item in items:
            item_id = _clean_identifier(item.get("id"))
            if not item_id or item.get("deleted") is True:
                continue
            normalized.append({
                "id": item_id,
                "name": _clean_identifier(item.get("name")) or "Unnamed Clover item",
                "sku": _clean_identifier(item.get("sku")),
                "barcode": _clean_identifier(item.get("code")),
                "price": round(float(item.get("price") or 0) / 100, 2),
                "stock": stock_by_id.get(item_id, 0),
                "hidden": bool(item.get("hidden", False)),
            })
        return normalized

    async def sync_from_clover(self, source: str = "manual", include_prices: bool = False) -> dict:
        started = utcnow()
        try:
            remote = await self.fetch_inventory()
            local = await self.db.products.find({}).to_list(10000)
            remote_by_id = {item["id"]: item for item in remote}
            linked_ids = {str(p.get("cloverItemId")): p for p in local if p.get("cloverItemId")}

            local_sku: dict[str, list[dict]] = {}
            local_barcode: dict[str, list[dict]] = {}
            for product in local:
                if _match_identifier(product.get("sku")):
                    local_sku.setdefault(_match_identifier(product.get("sku")), []).append(product)
                if _match_identifier(product.get("barcode")):
                    local_barcode.setdefault(_match_identifier(product.get("barcode")), []).append(product)

            remote_sku_counts: dict[str, int] = {}
            remote_barcode_counts: dict[str, int] = {}
            for item in remote:
                if _match_identifier(item.get("sku")):
                    key = _match_identifier(item["sku"])
                    remote_sku_counts[key] = remote_sku_counts.get(key, 0) + 1
                if _match_identifier(item.get("barcode")):
                    key = _match_identifier(item["barcode"])
                    remote_barcode_counts[key] = remote_barcode_counts.get(key, 0) + 1

            matched_remote: set[str] = set()
            linked = auto_matched = updated = price_changes = 0
            restocked: list[int] = []
            for item in remote:
                product = linked_ids.get(item["id"])
                auto = False
                if not product:
                    sku_key = _match_identifier(item.get("sku"))
                    barcode_key = _match_identifier(item.get("barcode"))
                    if sku_key and remote_sku_counts.get(sku_key) == 1 and len(local_sku.get(sku_key, [])) == 1:
                        product = local_sku[sku_key][0]
                        auto = True
                    elif barcode_key and remote_barcode_counts.get(barcode_key) == 1 and len(local_barcode.get(barcode_key, [])) == 1:
                        product = local_barcode[barcode_key][0]
                        auto = True
                if not product:
                    continue
                matched_remote.add(item["id"])
                linked += 1
                auto_matched += int(auto)
                old_stock = int(product.get("stock", 0))
                changes = {
                    "cloverItemId": item["id"],
                    "cloverLastSyncedAt": utcnow(),
                    "stock": item["stock"],
                    "updatedAt": utcnow(),
                }
                if item.get("sku") and not product.get("sku"):
                    changes["sku"] = item["sku"]
                if item.get("barcode") and not product.get("barcode"):
                    changes["barcode"] = item["barcode"]
                if include_prices and float(product.get("price") or 0) != float(item["price"]):
                    changes["price"] = item["price"]
                    price_changes += 1
                await self.db.products.update_one({"id": product["id"]}, {"$set": changes, "$unset": {"cloverSyncError": ""}})
                updated += int(old_stock != item["stock"])
                if old_stock == 0 and item["stock"] > 0:
                    restocked.append(product["id"])

            unmatched = [item for item in remote if item["id"] not in matched_remote]
            summary = {
                "source": source,
                "remoteItems": len(remote),
                "linkedItems": linked,
                "autoMatchedItems": auto_matched,
                "stockChanges": updated,
                "priceChanges": price_changes,
                "unmatchedItems": len(unmatched),
                "restockedProductIds": restocked,
            }
            await self.db.integrations.update_one({"key": "clover"}, {
                "$set": {
                    "lastSyncAt": utcnow(),
                    "lastSyncStatus": "success",
                    "lastSyncSummary": summary,
                    "unmatchedItems": unmatched[:1000],
                    "updatedAt": utcnow(),
                },
                "$unset": {"lastSyncError": ""},
            })
            await self.log("inventory_pull", "success", durationMs=int((utcnow() - started).total_seconds() * 1000), summary=summary)
            return summary
        except Exception as exc:
            await self.db.integrations.update_one({"key": "clover"}, {"$set": {"lastSyncAt": utcnow(), "lastSyncStatus": "failed", "lastSyncError": redact_text(str(exc)), "updatedAt": utcnow()}}, upsert=True)
            await self.log("inventory_pull", "failed", error=redact_text(str(exc)))
            if isinstance(exc, CloverError):
                raise
            raise CloverError(f"Clover inventory sync failed: {exc}") from exc

    async def push_product_stock(self, product_id: int, source: str = "website") -> bool:
        product = await self.db.products.find_one({"id": product_id})
        if not product or not product.get("cloverItemId"):
            return False
        config = await self.config()
        if not config or not config.get("merchantId"):
            return False
        try:
            await self.request(
                "PUT",
                f"/v3/merchants/{config['merchantId']}/item_stocks/{product['cloverItemId']}",
                json_body={"quantity": int(product.get("stock", 0))},
            )
            await self.db.products.update_one(
                {"id": product_id},
                {"$set": {"cloverLastPushedAt": utcnow()}, "$unset": {"cloverSyncError": ""}},
            )
            await self.log("stock_push", "success", productId=product_id, cloverItemId=product["cloverItemId"], quantity=int(product.get("stock", 0)), source=source)
            return True
        except Exception as exc:
            await self.db.products.update_one({"id": product_id}, {"$set": {
                "cloverSyncError": f"Stock could not be sent to Clover: {str(exc) or 'unknown error'}",
                "updatedAt": utcnow(),
            }})
            await self.log("stock_push", "failed", productId=product_id, cloverItemId=product.get("cloverItemId"), source=source, error=str(exc))
            LOGGER.error("Could not update Clover stock for product %s: %s", product_id, exc)
            return False

    async def sync_product_details(self, product_id: int, source: str = "admin") -> dict:
        """Website item and price edits stay on the website. Clover is read-only for catalog data."""
        return {
            "status": "skipped",
            "action": "none",
            "reason": "Clover is the source of truth for item names and prices. This website edit was not sent to Clover.",
        }

    def _photo_plan(self, remote: list[dict], captures: list[dict]) -> dict:
        by_code: dict[str, list[str]] = {}
        for item in remote:
            for raw in (item.get("sku"), item.get("barcode")):
                code = exact_barcode(raw)
                if code:
                    by_code.setdefault(code, [])
                    if item["id"] not in by_code[code]:
                        by_code[code].append(item["id"])
        links = []
        unmatched = []
        for capture in captures:
            code = exact_barcode(capture.get("barcode")) or exact_barcode(capture.get("identifier"))
            if not code:
                continue
            hits = by_code.get(code, [])
            if len(hits) == 1:
                links.append({"captureId": capture.get("id"), "barcode": code, "cloverItemId": hits[0]})
            elif not hits:
                unmatched.append({"captureId": capture.get("id"), "barcode": code, "reason": "No Clover item has this SKU or barcode."})
            else:
                unmatched.append({"captureId": capture.get("id"), "barcode": code, "reason": "More than one Clover item has this SKU or barcode."})
        return {"photoLinks": links, "unmatchedPhotoBarcodes": unmatched}

    async def _catalog_plan(self, remote: list[dict]) -> dict:
        local = await self.db.products.find({}).to_list(10000)
        linked_ids = {str(product.get("cloverItemId")): product for product in local if product.get("cloverItemId")}
        local_sku: dict[str, list[dict]] = {}
        local_barcode: dict[str, list[dict]] = {}
        for product in local:
            if _match_identifier(product.get("sku")):
                local_sku.setdefault(_match_identifier(product.get("sku")), []).append(product)
            if _match_identifier(product.get("barcode")):
                local_barcode.setdefault(_match_identifier(product.get("barcode")), []).append(product)
        remote_sku_counts: dict[str, int] = {}
        remote_barcode_counts: dict[str, int] = {}
        for item in remote:
            if _match_identifier(item.get("sku")):
                key = _match_identifier(item["sku"])
                remote_sku_counts[key] = remote_sku_counts.get(key, 0) + 1
            if _match_identifier(item.get("barcode")):
                key = _match_identifier(item["barcode"])
                remote_barcode_counts[key] = remote_barcode_counts.get(key, 0) + 1
        stock_changes = []
        price_changes = []
        matched: set[str] = set()
        for item in remote:
            product = linked_ids.get(item["id"])
            if not product:
                sku_key = _match_identifier(item.get("sku"))
                barcode_key = _match_identifier(item.get("barcode"))
                if sku_key and remote_sku_counts.get(sku_key) == 1 and len(local_sku.get(sku_key, [])) == 1:
                    product = local_sku[sku_key][0]
                elif barcode_key and remote_barcode_counts.get(barcode_key) == 1 and len(local_barcode.get(barcode_key, [])) == 1:
                    product = local_barcode[barcode_key][0]
            if not product:
                continue
            matched.add(item["id"])
            if int(product.get("stock", 0)) != int(item["stock"]):
                stock_changes.append({"productId": product["id"], "cloverItemId": item["id"], "from": int(product.get("stock", 0)), "to": int(item["stock"])})
            if float(product.get("price") or 0) != float(item["price"]):
                price_changes.append({"productId": product["id"], "cloverItemId": item["id"], "from": product.get("price"), "to": item["price"]})
        captures = await self.db.inventory_captures.find({}).to_list(5000)
        photos = self._photo_plan(remote, captures)
        return {
            "applied": False,
            "dryRun": (not self.sync_enabled) or self.dry_run,
            "syncEnabled": self.sync_enabled,
            "remoteItems": len(remote),
            "stockChanges": stock_changes,
            "priceChanges": price_changes,
            "unmatchedItems": len(remote) - len(matched),
            **photos,
        }

    async def _remember_plan(self, plan: dict, status: str):
        await self.db.integrations.update_one({"key": "clover"}, {"$set": {
            "lastCatalogPlan": plan,
            "lastCatalogPlanAt": utcnow(),
            "lastSyncStatus": status,
            "updatedAt": utcnow(),
        }}, upsert=True)

    async def sync_catalog(self, source: str = "manual") -> dict:
        """Pull stock and prices from Clover. Writes only when sync is on and this is not a dry run."""
        remote = await self.fetch_inventory()
        plan = await self._catalog_plan(remote)
        plan["source"] = source
        if not self.sync_enabled or self.dry_run:
            plan["applied"] = False
            plan["dryRun"] = True
            await self._remember_plan(plan, "dry_run" if self.sync_enabled else "disabled")
            await self.log("inventory_pull", "skipped", source=source, dryRun=True, syncEnabled=self.sync_enabled)
            return plan
        summary = await self.sync_from_clover(source, include_prices=True)
        for link in plan["photoLinks"]:
            await self.db.inventory_captures.update_one({"id": link["captureId"]}, {"$set": {
                "cloverItemId": link["cloverItemId"],
                "cloverLinkedAt": utcnow(),
            }})
        summary.update({
            "applied": True,
            "dryRun": False,
            "syncEnabled": True,
            "photoLinks": plan["photoLinks"],
            "unmatchedPhotoBarcodes": plan["unmatchedPhotoBarcodes"],
        })
        await self.db.integrations.update_one({"key": "clover"}, {"$set": {"lastCatalogPlan": summary, "lastCatalogPlanAt": utcnow()}})
        return summary

    async def apply_order_stock(self, order_id: str, lines: list[dict]) -> dict:
        """Reduce Clover stock once per order line. Retries reuse the saved adjustment."""
        if not self.sync_enabled:
            return {"applied": False, "reason": "sync_disabled", "adjustments": []}
        config = await self.config() or {}
        merchant_id = _clean_identifier(config.get("merchantId"))
        planned = []
        for line in lines:
            product_id = line.get("productId")
            qty = int(line.get("qty") or 0)
            if not product_id or qty <= 0:
                continue
            product = await self.db.products.find_one({"id": product_id})
            clover_item_id = _clean_identifier((product or {}).get("cloverItemId"))
            barcode = exact_barcode((product or {}).get("barcode")) or exact_barcode((product or {}).get("sku"))
            planned.append({"productId": product_id, "qty": qty, "cloverItemId": clover_item_id, "barcode": barcode})
        if self.dry_run:
            return {"applied": False, "dryRun": True, "adjustments": planned}
        if not merchant_id:
            return {"applied": False, "reason": "not_connected", "adjustments": planned}
        await self.db.clover_stock_adjustments.create_index("key", unique=True)
        adjustments = []
        for line in planned:
            if not line["cloverItemId"]:
                await self.log("order_stock", "failed", orderId=order_id, productId=line["productId"], barcode=line["barcode"], error="No Clover item is linked to this product.")
                adjustments.append({**line, "status": "unmatched"})
                continue
            key = f"{order_id}:{line['cloverItemId']}"
            try:
                await self.db.clover_stock_adjustments.insert_one({
                    "key": key,
                    "orderId": order_id,
                    "productId": line["productId"],
                    "cloverItemId": line["cloverItemId"],
                    "barcode": line["barcode"],
                    "qty": line["qty"],
                    "status": "pending",
                    "createdAt": utcnow(),
                })
            except DuplicateKeyError:
                adjustments.append({**line, "status": "already_recorded"})
                continue
            try:
                current = await self.request("GET", f"/v3/merchants/{merchant_id}/item_stocks/{line['cloverItemId']}")
                new_qty = max(0, _stock_quantity(current if isinstance(current, dict) else {}) - line["qty"])
                await self.request(
                    "PUT",
                    f"/v3/merchants/{merchant_id}/item_stocks/{line['cloverItemId']}",
                    json_body={"quantity": new_qty},
                )
                await self.db.clover_stock_adjustments.update_one({"key": key}, {"$set": {"status": "success", "resultingQuantity": new_qty, "updatedAt": utcnow()}})
                await self.log("order_stock", "success", orderId=order_id, productId=line["productId"], cloverItemId=line["cloverItemId"], qty=line["qty"])
                adjustments.append({**line, "status": "success", "resultingQuantity": new_qty})
            except Exception as exc:
                message = redact_text(str(exc) or "Clover stock update failed")
                await self.db.clover_stock_adjustments.update_one({"key": key}, {"$set": {"status": "failed", "error": message, "updatedAt": utcnow()}})
                await self.log("order_stock", "failed", orderId=order_id, productId=line["productId"], cloverItemId=line["cloverItemId"], error=message)
                adjustments.append({**line, "status": "failed", "error": message})
        return {"applied": True, "adjustments": adjustments}

    async def link_product(self, product_id: int, clover_item_id: str) -> dict:
        product = await self.db.products.find_one({"id": product_id})
        if not product:
            raise CloverError("HD Smoke Shop product was not found.")
        config = await self.config()
        item = next((row for row in (config or {}).get("unmatchedItems", []) if row.get("id") == clover_item_id), None)
        if not item:
            inventory = await self.fetch_inventory()
            item = next((row for row in inventory if row.get("id") == clover_item_id), None)
        if not item:
            raise CloverError("Clover item was not found. Run a sync and try again.")
        existing = await self.db.products.find_one({"cloverItemId": clover_item_id, "id": {"$ne": product_id}})
        if existing:
            raise CloverError("That Clover item is already connected to another product.")
        changes = {
            "cloverItemId": clover_item_id,
            "stock": item["stock"],
            "cloverLastSyncedAt": utcnow(),
            "updatedAt": utcnow(),
        }
        if item.get("sku"):
            changes["sku"] = item["sku"]
        if item.get("barcode"):
            changes["barcode"] = item["barcode"]
        await self.db.products.update_one({"id": product_id}, {"$set": changes})
        await self.db.integrations.update_one({"key": "clover"}, {"$pull": {"unmatchedItems": {"id": clover_item_id}}})
        await self.log("link", "success", productId=product_id, cloverItemId=clover_item_id)
        return {**item, "productId": product_id}

    async def import_item(self, clover_item_id: str, product_defaults: dict) -> dict:
        config = await self.config()
        item = next((row for row in (config or {}).get("unmatchedItems", []) if row.get("id") == clover_item_id), None)
        if not item:
            inventory = await self.fetch_inventory()
            item = next((row for row in inventory if row.get("id") == clover_item_id), None)
        if not item:
            raise CloverError("Clover item was not found. Run a sync and try again.")
        existing = await self.db.products.find_one({"cloverItemId": clover_item_id})
        if existing:
            raise CloverError("That Clover item is already connected.")
        doc = {**product_defaults, **{
            "name": item["name"],
            "price": item["price"],
            "stock": item["stock"],
            "sku": item.get("sku", ""),
            "barcode": item.get("barcode", ""),
            "cloverItemId": item["id"],
            # Imports stay hidden until the owner reviews photos, category,
            # compliance rules and copy in the normal product editor.
            "active": False,
            "cloverLastSyncedAt": utcnow(),
            "createdAt": utcnow(),
            "updatedAt": utcnow(),
        }}
        await self.db.products.insert_one(doc)
        await self.db.integrations.update_one({"key": "clover"}, {"$pull": {"unmatchedItems": {"id": clover_item_id}}})
        await self.log("import", "success", productId=doc["id"], cloverItemId=item["id"])
        return doc

    async def disconnect(self):
        await self.db.integrations.update_one({"key": "clover"}, {"$unset": {
            "encryptedAccessToken": "", "encryptedRefreshToken": "", "accessTokenExpiration": "", "refreshTokenExpiration": "",
            "merchantId": "", "merchantName": "", "connectedAt": "", "lastSyncError": "",
        }, "$set": {"updatedAt": utcnow(), "lastSyncStatus": "disconnected"}}, upsert=True)
        await self.log("disconnect", "success")


"""Clover inventory integration for HD Smoke Shop.

The website keeps its current catalog and uses Clover as the source of truth for
stock quantities. Tokens are encrypted before they are stored in MongoDB.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken


LOGGER = logging.getLogger(__name__)
USER_AGENT = "HD Smoke Shop/1.0 (inventory-sync; https://puff2door.com)"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_identifier(value: Any) -> str:
    return str(value or "").strip()


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
    ):
        self.db = db
        self.client_id = client_id.strip()
        self.client_secret = client_secret.strip()
        self.environment = "sandbox" if environment.strip().lower() == "sandbox" else "production"
        self.redirect_uri = redirect_uri.strip()
        self.site_url = site_url.rstrip("/")
        self.webhook_auth_code = webhook_auth_code.strip()
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
        await self.db.clover_sync_logs.insert_one({
            "id": hashlib.sha256(f"{utcnow().isoformat()}:{action}".encode()).hexdigest()[:24],
            "action": action,
            "status": status,
            "createdAt": utcnow(),
            **details,
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
            "merchantId": merchant_id,
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

    async def sync_from_clover(self, source: str = "manual") -> dict:
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
            linked = auto_matched = updated = 0
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
            await self.db.integrations.update_one({"key": "clover"}, {"$set": {"lastSyncAt": utcnow(), "lastSyncStatus": "failed", "lastSyncError": str(exc), "updatedAt": utcnow()}}, upsert=True)
            await self.log("inventory_pull", "failed", error=str(exc))
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

    @staticmethod
    def _product_payload(product: dict) -> dict:
        base_price = float(product.get("price") or 0)
        sale_price = product.get("salePrice")
        effective_price = min(base_price, float(sale_price)) if sale_price is not None and float(sale_price) >= 0 else base_price
        payload = {
            "name": str(product.get("name") or "HD Smoke Shop item")[:255],
            "price": int(round(effective_price * 100)),
            "priceType": "FIXED",
            "available": bool(product.get("active", True)),
            "hidden": not bool(product.get("active", True)),
            "defaultTaxRates": True,
            "isAgeRestricted": int(product.get("minimumAge", 21) or 0) >= 21,
        }
        if _clean_identifier(product.get("sku")):
            payload["sku"] = _clean_identifier(product["sku"])
        if _clean_identifier(product.get("barcode")):
            payload["code"] = _clean_identifier(product["barcode"])
        return payload

    async def sync_product_details(self, product_id: int, source: str = "admin") -> dict:
        """Create or update a Clover item from a HD Smoke Shop admin product."""
        product = await self.db.products.find_one({"id": product_id})
        if not product:
            raise CloverError("HD Smoke Shop product was not found.")
        config = await self.config()
        if not config or not config.get("merchantId") or not config.get("encryptedAccessToken"):
            return {"status": "not_connected", "action": "none"}
        merchant_id = config["merchantId"]
        clover_item_id = _clean_identifier(product.get("cloverItemId"))
        action = "update" if clover_item_id else "create"
        try:
            if clover_item_id:
                item = await self.request(
                    "POST",
                    f"/v3/merchants/{merchant_id}/items/{clover_item_id}",
                    json_body=self._product_payload(product),
                )
            else:
                item = await self.request(
                    "POST",
                    f"/v3/merchants/{merchant_id}/items",
                    json_body=self._product_payload(product),
                )
                clover_item_id = _clean_identifier(item.get("id"))
                if not clover_item_id:
                    raise CloverError("Clover created the item without returning its item ID.")
                await self.db.products.update_one({"id": product_id}, {"$set": {
                    "cloverItemId": clover_item_id,
                    "cloverLastSyncedAt": utcnow(),
                    "updatedAt": utcnow(),
                }})
            stock_ok = await self.push_product_stock(product_id, source=source)
            if stock_ok:
                await self.db.products.update_one({"id": product_id}, {
                    "$set": {"cloverLastSyncedAt": utcnow(), "updatedAt": utcnow()},
                    "$unset": {"cloverSyncError": ""},
                })
            else:
                await self.db.products.update_one({"id": product_id}, {"$set": {
                    "cloverLastSyncedAt": utcnow(),
                    "cloverSyncError": "The product details reached Clover, but its stock quantity needs a retry.",
                    "updatedAt": utcnow(),
                }})
            result = {"status": "success" if stock_ok else "partial", "action": action, "cloverItemId": clover_item_id, "stockUpdated": stock_ok}
            if not stock_ok:
                result["error"] = "The product details reached Clover, but its stock quantity needs a retry."
            await self.log("product_" + action, result["status"], productId=product_id, cloverItemId=clover_item_id, source=source)
            return result
        except Exception as exc:
            message = str(exc) or "Clover product update failed"
            await self.db.products.update_one({"id": product_id}, {"$set": {"cloverSyncError": message, "updatedAt": utcnow()}})
            await self.log("product_" + action, "failed", productId=product_id, cloverItemId=clover_item_id, source=source, error=message)
            if isinstance(exc, CloverError):
                raise
            raise CloverError(message) from exc

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


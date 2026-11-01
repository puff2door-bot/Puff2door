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

from clover_mapping import classify_item, clover_category_names, seed_category_mappings
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


def order_should_sync_stock(order: dict) -> bool:
    """Clover stock changes when a website order is paid or confirmed."""
    if not isinstance(order, dict):
        return False
    if str(order.get("paymentStatus") or "") == "paid":
        return True
    if str(order.get("manualStatus") or "") == "confirmed":
        return True
    history = order.get("statusHistory") or {}
    return bool(isinstance(history, dict) and history.get("confirmed"))


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
        api_token: str = "",
        merchant_id: str = "",
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
        # Merchant API token mode. The token stays in memory for this process.
        self.api_token = (api_token or "").strip()
        self.merchant_id = (merchant_id or "").strip()
        key = base64.urlsafe_b64encode(hashlib.sha256(jwt_secret.encode("utf-8")).digest())
        self.cipher = Fernet(key)
        self.http_client_factory = http_client_factory or (lambda **kwargs: httpx.AsyncClient(**kwargs))

    @property
    def merchant_id_valid(self) -> bool:
        return bool(re.fullmatch(r"[A-Za-z0-9]{13}", self.merchant_id))

    @property
    def token_mode(self) -> bool:
        """True only when a dashboard API token and the 13-character API merchant id are both set."""
        return bool(self.api_token and self.merchant_id_valid)

    @property
    def configured(self) -> bool:
        if self.token_mode:
            return True
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    def _redact(self, value: str) -> str:
        text = redact_text(value)
        if self.api_token:
            text = text.replace(self.api_token, "[redacted]")
        if self.client_secret:
            text = text.replace(self.client_secret, "[redacted]")
        return text

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
                value = self._redact(value)
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
        if self.token_mode:
            token = self.api_token
            retry_auth = False
        else:
            token, _ = await self.access_token()
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": USER_AGENT}
        async with self.http_client_factory(timeout=30) as client:
            response = await client.request(method, f"{self.api_base}{path}", headers=headers, json=json_body, params=params)
        if response.status_code in (401, 403) and self.token_mode:
            raise CloverError("Clover token missing a permission or revoked")
        if response.status_code == 401 and retry_auth:
            token, _ = await self.access_token(force_refresh=True)
            headers["Authorization"] = f"Bearer {token}"
            async with self.http_client_factory(timeout=30) as client:
                response = await client.request(method, f"{self.api_base}{path}", headers=headers, json=json_body, params=params)
        return self._json_or_error(response, "Clover inventory request failed")

    async def test_connection(self) -> dict:
        """Confirm the dashboard token. Returns only the merchant name and item count."""
        if not self.token_mode:
            if self.api_token or self.merchant_id:
                raise CloverError("Set both CLOVER_API_TOKEN and the 13-character CLOVER_MERCHANT_ID from the Clover dashboard URL.")
            raise CloverError("API token mode is not configured.")
        merchant = await self.request("GET", f"/v3/merchants/{self.merchant_id}")
        items = await self._paged(f"/v3/merchants/{self.merchant_id}/items")
        name = merchant.get("name", "") if isinstance(merchant, dict) else ""
        return {"name": name, "itemCount": len(items)}

    async def _paged(self, path: str, extra: Optional[dict] = None) -> list[dict]:
        rows: list[dict] = []
        offset = 0
        while True:
            params = {"limit": 1000, "offset": offset}
            if extra:
                params.update(extra)
            payload = await self.request("GET", path, params=params)
            page = _elements(payload)
            rows.extend(page)
            if len(page) < 1000:
                break
            offset += len(page)
        return rows

    def _merchant_id(self, config: Optional[dict] = None) -> str:
        if self.token_mode:
            return self.merchant_id
        return _clean_identifier((config or {}).get("merchantId"))

    async def fetch_inventory(self) -> list[dict]:
        if self.token_mode:
            merchant_id = self.merchant_id
        else:
            doc = await self.config()
            if not doc or not doc.get("merchantId"):
                raise CloverError("Clover is not connected.")
            merchant_id = doc["merchantId"]
        items = await self._paged(f"/v3/merchants/{merchant_id}/items", {"expand": "categories,tags"})
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
                "categories": item.get("categories"),
                "tags": item.get("tags"),
            })
        return await self._annotate_items(normalized)

    async def _website_catalog(self) -> tuple[list[dict], list[dict]]:
        categories = await self.db.categories.find({}, {"_id": 0, "slug": 1, "name": 1}).to_list(500)
        brands = await self.db.brands.find({}, {"_id": 0, "slug": 1, "name": 1, "displayName": 1}).to_list(2000)
        if not brands:
            seen = set()
            brands = []
            async for product in self.db.products.find({}, {"brand": 1, "brandName": 1}):
                label = str(product.get("brandName") or "").strip()
                slug = str(product.get("brand") or "").strip()
                if not label or label.lower() in seen:
                    continue
                seen.add(label.lower())
                brands.append({"slug": slug or label.lower().replace(" ", "-"), "name": label, "displayName": label})
        return categories, brands

    async def category_mappings(self, categories: Optional[list[dict]] = None) -> list[dict]:
        if categories is None:
            categories, _brands = await self._website_catalog()
        allowed = {row.get("slug") for row in categories if row.get("slug")}
        config = await self.config() or {}
        saved = config.get("categoryMappings")
        if isinstance(saved, list) and saved:
            rows = []
            for row in saved:
                if not isinstance(row, dict):
                    continue
                name = str(row.get("cloverName") or "").strip()
                slug = str(row.get("categorySlug") or "").strip()
                if name and slug in allowed:
                    rows.append({"cloverName": name, "categorySlug": slug})
            return rows
        return seed_category_mappings(allowed)

    async def save_category_mappings(self, mappings: list[dict]) -> list[dict]:
        categories, _brands = await self._website_catalog()
        allowed = {row.get("slug") for row in categories if row.get("slug")}
        cleaned = []
        seen = set()
        for row in mappings:
            name = str(row.get("cloverName") or "").strip()
            slug = str(row.get("categorySlug") or "").strip()
            if not name or not slug:
                continue
            if slug not in allowed:
                raise CloverError(f"Website category {slug} does not exist. Create it in Categories before mapping it.")
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append({"cloverName": name, "categorySlug": slug})
        await self.db.integrations.update_one({"key": "clover"}, {"$set": {"categoryMappings": cleaned, "updatedAt": utcnow()}}, upsert=True)
        return cleaned

    async def _annotate_items(self, items: list[dict]) -> list[dict]:
        categories, brands = await self._website_catalog()
        mappings = await self.category_mappings(categories)
        for item in items:
            item.update(classify_item(item, mappings, categories, brands))
            item["cloverCategories"] = clover_category_names(item)
        return items

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
                reported_stock = int(item["stock"])
                effective_stock, stock_state = await self._resolve_pulled_stock(
                    item["id"], reported_stock, commit=True, website_stock=old_stock,
                )
                changes = {
                    "cloverItemId": item["id"],
                    "cloverLastSyncedAt": utcnow(),
                    "cloverStockSyncedAt": utcnow(),
                    "cloverReportedStock": reported_stock,
                    "stockSyncState": stock_state,
                    "stock": effective_stock,
                    "updatedAt": utcnow(),
                }
                if item.get("sku") and not product.get("sku"):
                    changes["sku"] = item["sku"]
                if item.get("barcode") and not product.get("barcode"):
                    changes["barcode"] = item["barcode"]
                if item.get("mappedCategorySlug") and not str(product.get("categorySlug") or "").strip():
                    changes["categorySlug"] = item["mappedCategorySlug"]
                    changes["category"] = item.get("mappedCategoryName") or item["mappedCategorySlug"]
                if item.get("mappedBrandSlug") and not str(product.get("brand") or "").strip() and not str(product.get("brandName") or "").strip():
                    changes["brand"] = item["mappedBrandSlug"]
                    changes["brandName"] = item.get("mappedBrandName") or item["mappedBrandSlug"]
                if include_prices and float(product.get("price") or 0) != float(item["price"]):
                    changes["price"] = item["price"]
                    price_changes += 1
                await self.db.products.update_one({"id": product["id"]}, {"$set": changes, "$unset": {"cloverSyncError": ""}})
                updated += int(old_stock != effective_stock)
                if old_stock == 0 and effective_stock > 0:
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
            message = self._redact(str(exc))
            await self.db.integrations.update_one({"key": "clover"}, {"$set": {"lastSyncAt": utcnow(), "lastSyncStatus": "failed", "lastSyncError": message, "updatedAt": utcnow()}}, upsert=True)
            await self.log("inventory_pull", "failed", error=message)
            if isinstance(exc, CloverError):
                raise
            raise CloverError(f"Clover inventory sync failed: {message}") from exc

    async def push_product_stock(self, product_id: int, source: str = "website") -> bool:
        product = await self.db.products.find_one({"id": product_id})
        if not product or not product.get("cloverItemId"):
            return False
        config = await self.config()
        merchant_id = self._merchant_id(config)
        if not merchant_id:
            return False
        try:
            await self.request(
                "PUT",
                f"/v3/merchants/{merchant_id}/item_stocks/{product['cloverItemId']}",
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
        stock_holds = []
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
            website_qty = int(product.get("stock", 0))
            reported_qty = int(item["stock"])
            effective_qty, stock_state = await self._resolve_pulled_stock(
                item["id"], reported_qty, commit=False, website_stock=website_qty,
            )
            if website_qty != effective_qty:
                stock_changes.append({
                    "direction": "clover_to_website",
                    "productId": product["id"],
                    "name": product.get("name") or item.get("name") or "",
                    "cloverItemId": item["id"],
                    "from": website_qty,
                    "to": effective_qty,
                    "cloverQty": reported_qty,
                    "state": stock_state,
                })
            elif stock_state == "pending" and website_qty != reported_qty:
                stock_holds.append({
                    "direction": "clover_to_website",
                    "productId": product["id"],
                    "name": product.get("name") or item.get("name") or "",
                    "cloverItemId": item["id"],
                    "websiteQty": website_qty,
                    "cloverQty": reported_qty,
                    "kept": effective_qty,
                    "state": "pending",
                })
            if float(product.get("price") or 0) != float(item["price"]):
                price_changes.append({"productId": product["id"], "cloverItemId": item["id"], "from": product.get("price"), "to": item["price"]})
        captures = await self.db.inventory_captures.find({}).to_list(5000)
        photos = self._photo_plan(remote, captures)
        outbound = await self._planned_clover_writes()
        return {
            "applied": False,
            "dryRun": (not self.sync_enabled) or self.dry_run,
            "syncEnabled": self.sync_enabled,
            "remoteItems": len(remote),
            "stockChanges": stock_changes,
            "stockHolds": stock_holds,
            "cloverStockChanges": outbound,
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
        plan["reviewItems"] = [{
            "id": item.get("id"),
            "name": item.get("name"),
            "cloverCategories": item.get("cloverCategories") or [],
            "mappedCategorySlug": item.get("mappedCategorySlug") or "",
            "mappedCategoryName": item.get("mappedCategoryName") or "",
            "mappedBrandSlug": item.get("mappedBrandSlug") or "",
            "mappedBrandName": item.get("mappedBrandName") or "",
            "confidence": item.get("confidence") or "none",
            "needsReview": bool(item.get("needsReview", True)),
        } for item in remote if item.get("needsReview")][:200]
        if not self.sync_enabled or self.dry_run:
            plan["applied"] = False
            plan["dryRun"] = True
            await self._remember_plan(plan, "dry_run" if self.sync_enabled else "disabled")
            await self.log("inventory_pull", "skipped", source=source, dryRun=True, syncEnabled=self.sync_enabled)
            return plan
        clover_stock_changes = await self.apply_pending_adjustments()
        summary = await self.sync_from_clover(source, include_prices=True)
        summary["cloverStockChanges"] = clover_stock_changes
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
            "reviewItems": plan["reviewItems"],
        })
        await self.db.integrations.update_one({"key": "clover"}, {"$set": {"lastCatalogPlan": summary, "lastCatalogPlanAt": utcnow()}})
        return summary

    async def _resolve_pulled_stock(self, clover_item_id: str, reported: int, commit: bool, website_stock: Optional[int] = None) -> tuple[int, str]:
        """Ignore a Clover read that still shows the quantity from before a website sale."""
        rows = await self.db.clover_stock_adjustments.find({
            "cloverItemId": clover_item_id,
            "reflected": {"$ne": True},
            "status": {"$in": ["success", "writing", "pending"]},
        }).sort("updatedAt", -1).to_list(20)
        actionable = [
            row for row in rows
            if row.get("status") in {"success", "writing"}
            and row.get("seenQuantity") is not None
            and row.get("resultingQuantity") is not None
        ]
        if not actionable:
            if rows and website_stock is not None:
                return int(website_stock), "pending"
            return int(reported), "matched"
        seen_values = {int(row["seenQuantity"]) for row in actionable}
        newest_result = int(actionable[0]["resultingQuantity"])
        if int(reported) in seen_values:
            return newest_result, "pending"
        if commit:
            await self.db.clover_stock_adjustments.update_many(
                {
                    "cloverItemId": clover_item_id,
                    "reflected": {"$ne": True},
                    "status": {"$in": ["success", "writing"]},
                },
                {"$set": {"reflected": True, "reflectedAt": utcnow(), "status": "success"}},
            )
        return int(reported), "matched"

    def _adjustment_key(self, direction: str, order_id: str, clover_item_id: str) -> str:
        return f"{direction}:{order_id}:{clover_item_id}"

    async def _ensure_planned(self, order_id: str, line: dict, direction: str) -> dict:
        key = self._adjustment_key(direction, order_id, line["cloverItemId"])
        existing = await self.db.clover_stock_adjustments.find_one({"key": key})
        if existing and existing.get("status") == "success":
            return {**line, "status": "already_recorded", "direction": direction, "resultingQuantity": existing.get("resultingQuantity")}
        if existing and existing.get("status") == "void":
            return {**line, "status": "voided", "direction": direction}
        if not existing:
            try:
                await self.db.clover_stock_adjustments.insert_one({
                    "key": key,
                    "orderId": order_id,
                    "productId": line["productId"],
                    "name": line.get("name") or "",
                    "cloverItemId": line["cloverItemId"],
                    "barcode": line.get("barcode") or "",
                    "qty": line["qty"],
                    "direction": direction,
                    "status": "planned",
                    "reflected": False,
                    "createdAt": utcnow(),
                    "updatedAt": utcnow(),
                })
            except DuplicateKeyError:
                existing = await self.db.clover_stock_adjustments.find_one({"key": key})
                if existing and existing.get("status") == "success":
                    return {**line, "status": "already_recorded", "direction": direction, "resultingQuantity": existing.get("resultingQuantity")}
        return {**line, "status": (existing or {}).get("status") or "planned", "direction": direction}

    async def _mutate_item_stock(self, order_id: str, line: dict, direction: str) -> dict:
        merchant_id = self._merchant_id(await self.config() or {})
        key = self._adjustment_key(direction, order_id, line["cloverItemId"])
        existing = await self.db.clover_stock_adjustments.find_one({"key": key})
        if existing and existing.get("status") == "success":
            return {**line, "status": "already_recorded", "direction": direction, "resultingQuantity": existing.get("resultingQuantity")}
        if existing and existing.get("status") == "void":
            return {**line, "status": "voided", "direction": direction}
        if not existing:
            try:
                await self.db.clover_stock_adjustments.insert_one({
                    "key": key,
                    "orderId": order_id,
                    "productId": line["productId"],
                    "name": line.get("name") or "",
                    "cloverItemId": line["cloverItemId"],
                    "barcode": line.get("barcode") or "",
                    "qty": line["qty"],
                    "direction": direction,
                    "status": "pending",
                    "reflected": False,
                    "createdAt": utcnow(),
                    "updatedAt": utcnow(),
                })
            except DuplicateKeyError:
                existing = await self.db.clover_stock_adjustments.find_one({"key": key})
                if existing and existing.get("status") == "success":
                    return {**line, "status": "already_recorded", "direction": direction, "resultingQuantity": existing.get("resultingQuantity")}
        stored_result = (existing or {}).get("resultingQuantity")
        stored_seen = (existing or {}).get("seenQuantity")
        try:
            current = await self.request("GET", f"/v3/merchants/{merchant_id}/item_stocks/{line['cloverItemId']}")
            seen_now = _stock_quantity(current if isinstance(current, dict) else {})
            if stored_result is not None and seen_now == int(stored_result):
                new_qty = int(stored_result)
                seen = int(stored_seen) if stored_seen is not None else seen_now
            else:
                delta = line["qty"] if direction == "restore" else -line["qty"]
                seen = seen_now
                new_qty = max(0, seen_now + delta)
                await self.db.clover_stock_adjustments.update_one({"key": key}, {"$set": {
                    "status": "writing", "seenQuantity": seen, "resultingQuantity": new_qty,
                    "reflected": False, "updatedAt": utcnow(), "error": "",
                }})
                await self.request(
                    "PUT",
                    f"/v3/merchants/{merchant_id}/item_stocks/{line['cloverItemId']}",
                    json_body={"quantity": new_qty},
                )
            await self.db.clover_stock_adjustments.update_one({"key": key}, {"$set": {
                "status": "success", "seenQuantity": seen, "resultingQuantity": new_qty,
                "reflected": False, "updatedAt": utcnow(), "error": "",
            }})
            await self.db.products.update_one({"cloverItemId": line["cloverItemId"]}, {"$set": {
                "cloverReportedStock": new_qty, "cloverStockSyncedAt": utcnow(), "stockSyncState": "pending",
            }})
            await self.log(
                "order_stock", "success", orderId=order_id, productId=line["productId"],
                cloverItemId=line["cloverItemId"], qty=line["qty"], direction=direction,
                seenQuantity=seen, resultingQuantity=new_qty,
            )
            return {**line, "status": "success", "direction": direction, "resultingQuantity": new_qty, "seenQuantity": seen}
        except Exception as exc:
            message = self._redact(str(exc) or "Clover stock update failed")
            await self.db.clover_stock_adjustments.update_one({"key": key}, {"$set": {"status": "failed", "error": message, "updatedAt": utcnow()}})
            await self.log("order_stock", "failed", orderId=order_id, productId=line["productId"], cloverItemId=line["cloverItemId"], error=message, direction=direction)
            return {**line, "status": "failed", "direction": direction, "error": message}

    async def _planned_lines(self, lines: list[dict]) -> list[dict]:
        planned = []
        for line in lines:
            product_id = line.get("productId")
            qty = int(line.get("qty") or 0)
            if not product_id or qty <= 0:
                continue
            product = await self.db.products.find_one({"id": product_id})
            planned.append({
                "productId": product_id,
                "qty": qty,
                "cloverItemId": _clean_identifier((product or {}).get("cloverItemId")),
                "barcode": exact_barcode((product or {}).get("barcode")) or exact_barcode((product or {}).get("sku")),
                "name": (product or {}).get("name") or line.get("name") or "",
            })
        return planned

    async def _planned_clover_writes(self) -> list[dict]:
        rows = await self.db.clover_stock_adjustments.find(
            {"status": {"$in": ["planned", "failed", "pending", "writing"]}},
            {"_id": 0},
        ).sort("updatedAt", -1).to_list(500)
        return [{
            "direction": "website_to_clover",
            "action": row.get("direction") or "decrement",
            "orderId": row.get("orderId"),
            "productId": row.get("productId"),
            "name": row.get("name") or "",
            "cloverItemId": row.get("cloverItemId"),
            "qty": row.get("qty"),
            "status": row.get("status"),
            "from": row.get("seenQuantity"),
            "to": row.get("resultingQuantity"),
            "error": row.get("error") or "",
        } for row in rows]

    async def apply_pending_adjustments(self) -> list[dict]:
        """Retry planned, failed, and in-flight Clover stock writes. Preview leaves them untouched."""
        if not self.sync_enabled or self.dry_run:
            return await self._planned_clover_writes()
        if not self._merchant_id(await self.config() or {}):
            return []
        await self.db.clover_stock_adjustments.create_index("key", unique=True)
        rows = await self.db.clover_stock_adjustments.find(
            {"status": {"$in": ["planned", "failed", "pending", "writing"]}},
        ).to_list(500)
        applied = []
        for row in rows:
            line = {
                "productId": row.get("productId"),
                "cloverItemId": row.get("cloverItemId"),
                "barcode": row.get("barcode") or "",
                "qty": int(row.get("qty") or 0),
                "name": row.get("name") or "",
            }
            if not row.get("orderId") or not line["cloverItemId"] or line["qty"] <= 0:
                continue
            applied.append(await self._mutate_item_stock(row["orderId"], line, row.get("direction") or "decrement"))
        return applied

    async def apply_order_stock(self, order_id: str, lines: list[dict]) -> dict:
        """Reduce Clover stock once per paid or confirmed order line. A retry reuses the same record."""
        planned = await self._planned_lines(lines)
        adjustments = []
        linked = []
        for line in planned:
            if not line["cloverItemId"]:
                await self.log("order_stock", "failed", orderId=order_id, productId=line["productId"], barcode=line["barcode"], error="No Clover item is linked to this product.")
                adjustments.append({**line, "status": "unmatched", "direction": "decrement"})
                continue
            linked.append(line)
        if not self.sync_enabled or self.dry_run:
            for line in linked:
                adjustments.append(await self._ensure_planned(order_id, line, "decrement"))
            return {
                "applied": False,
                "dryRun": True,
                "reason": "sync_disabled" if not self.sync_enabled else "dry_run",
                "adjustments": adjustments,
            }
        if not self._merchant_id(await self.config() or {}):
            return {"applied": False, "reason": "not_connected", "adjustments": adjustments + linked}
        await self.db.clover_stock_adjustments.create_index("key", unique=True)
        for line in linked:
            adjustments.append(await self._mutate_item_stock(order_id, line, "decrement"))
        return {"applied": True, "adjustments": adjustments}

    async def restore_order_stock(self, order_id: str, lines: list[dict]) -> dict:
        """Put Clover stock back once when a paid order is cancelled or fully refunded."""
        planned = await self._planned_lines(lines)
        adjustments = []
        actionable: list[tuple[dict, bool]] = []
        for line in planned:
            if not line["cloverItemId"]:
                adjustments.append({**line, "status": "unmatched", "direction": "restore"})
                continue
            decrement = await self.db.clover_stock_adjustments.find_one({
                "key": self._adjustment_key("decrement", order_id, line["cloverItemId"]),
            })
            if not decrement or decrement.get("status") == "void":
                adjustments.append({**line, "status": "nothing_to_restore", "direction": "restore"})
                continue
            sent = decrement.get("status") in {"success", "writing", "pending"} and decrement.get("seenQuantity") is not None
            if not sent:
                await self.db.clover_stock_adjustments.update_one({"key": decrement["key"]}, {"$set": {
                    "status": "void", "reflected": True, "updatedAt": utcnow(),
                }})
                adjustments.append({**line, "status": "voided", "direction": "restore"})
                continue
            actionable.append((line, decrement.get("status") != "success"))
        if not self.sync_enabled or self.dry_run:
            for line, _finish in actionable:
                adjustments.append(await self._ensure_planned(order_id, line, "restore"))
            return {
                "applied": False,
                "dryRun": True,
                "reason": "sync_disabled" if not self.sync_enabled else "dry_run",
                "adjustments": adjustments,
            }
        if not self._merchant_id(await self.config() or {}):
            return {"applied": False, "reason": "not_connected", "adjustments": adjustments}
        await self.db.clover_stock_adjustments.create_index("key", unique=True)
        for line, finish in actionable:
            if finish:
                done = await self._mutate_item_stock(order_id, line, "decrement")
                if done.get("status") not in {"success", "already_recorded"}:
                    adjustments.append({**line, "status": "failed", "direction": "restore", "error": done.get("error") or "Clover decrement did not finish"})
                    continue
            adjustments.append(await self._mutate_item_stock(order_id, line, "restore"))
        return {"applied": True, "adjustments": adjustments}

    async def stock_status_rows(self) -> dict:
        products = await self.db.products.find(
            {"cloverItemId": {"$exists": True, "$ne": ""}},
            {"_id": 0, "id": 1, "name": 1, "stock": 1, "cloverItemId": 1, "cloverReportedStock": 1, "cloverStockSyncedAt": 1, "cloverLastSyncedAt": 1, "stockSyncState": 1},
        ).sort("name", 1).to_list(5000)
        rows = []
        for product in products:
            website_qty = int(product.get("stock") or 0)
            reported = product.get("cloverReportedStock")
            clover_qty = None if reported is None else int(reported)
            mismatch = clover_qty is not None and website_qty != clover_qty
            rows.append({
                "productId": product.get("id"),
                "name": product.get("name") or "",
                "cloverItemId": product.get("cloverItemId"),
                "websiteQty": website_qty,
                "cloverQty": clover_qty,
                "updatedAt": product.get("cloverStockSyncedAt") or product.get("cloverLastSyncedAt"),
                "state": product.get("stockSyncState") or "unknown",
                "mismatch": mismatch,
            })
        log_rows = await self.db.clover_stock_adjustments.find({}, {"_id": 0}).sort("updatedAt", -1).to_list(50)
        return {
            "stockRows": rows,
            "stockMismatches": [row for row in rows if row["mismatch"]],
            "orderStockLog": log_rows,
        }

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
            # Imports stay hidden. Age rules come from the caller and are not changed here.
            "active": False,
            "cloverNeedsReview": bool(item.get("needsReview", True)),
            "cloverLastSyncedAt": utcnow(),
            "createdAt": utcnow(),
            "updatedAt": utcnow(),
        }}
        if item.get("mappedCategorySlug"):
            doc["categorySlug"] = item["mappedCategorySlug"]
            doc["category"] = item.get("mappedCategoryName") or item["mappedCategorySlug"]
        else:
            doc["categorySlug"] = ""
            doc["category"] = ""
        if item.get("mappedBrandSlug"):
            doc["brand"] = item["mappedBrandSlug"]
            doc["brandName"] = item.get("mappedBrandName") or item["mappedBrandSlug"]
        else:
            doc["brand"] = ""
            doc["brandName"] = ""
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


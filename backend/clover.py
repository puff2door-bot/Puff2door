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

from clover_catalog import field_changes, normalized_name, parse_time, price_cents, price_guard, propose_links
from clover_mapping import brand_report, classify_item, clover_category_names, resolve_category_names, seed_category_mappings
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from pymongo.errors import DuplicateKeyError



# Removed-in-Clover products are hidden automatically unless more than this many
# (or this share of linked products) disappear in one sync.
MISSING_HIDE_MIN = 25
# A website stock edit bigger than this (and more than 3x the old count) needs confirmation.
STOCK_EDIT_CONFIRM_MIN = 50
MISSING_HIDE_SHARE = 0.05


def _slug(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower().replace("&", " and ")).strip("-")
    return text[:80] or "item"


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
        sync_prices: bool = False,
        sync_names: bool = False,
        create_items: bool = False,
        category_writeback: bool = False,
        import_new_items: bool = False,
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
        self.sync_prices = bool(sync_prices)
        self.sync_names = bool(sync_names)
        self.create_items = bool(create_items)
        self.category_writeback = bool(category_writeback)
        self.import_new_items = bool(import_new_items)
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

    async def _category_directory(self, merchant_id: str) -> tuple[dict, dict]:
        """Join Clover category ids to names. Item expand often omits the name."""
        by_id: dict[str, str] = {}
        try:
            for row in await self._paged(f"/v3/merchants/{merchant_id}/categories"):
                if row.get("id") and row.get("name"):
                    by_id[str(row["id"])] = str(row["name"]).strip()
        except Exception:
            LOGGER.warning("Clover categories could not be loaded; using category names on each item")
        # Clover documents category_items as a POST-only association endpoint.
        # Item/category membership already comes from expand=categories above;
        # this directory supplies names when those expanded rows contain only ids.
        return by_id, {}

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
        by_id, by_item = await self._category_directory(merchant_id)
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
                "modifiedTime": item.get("modifiedTime"),
                "stock": stock_by_id.get(item_id, 0),
                "hidden": bool(item.get("hidden", False)),
                "categories": {"elements": [{"name": name} for name in resolve_category_names(item, by_id, by_item)]},
                "tags": item.get("tags"),
            })
        return await self._annotate_items(normalized)

    async def _website_catalog(self) -> tuple[list[dict], list[dict]]:
        categories = await self.db.categories.find({}, {"_id": 0, "slug": 1, "name": 1}).to_list(500)
        # Only active brands are matched: a brand hidden in Brand Management (for example a
        # fake one such as "ASH" or "WATER") must never be put back on products by a sync.
        brands = await self.db.brands.find({"active": {"$ne": False}}, {"_id": 0, "slug": 1, "name": 1, "displayName": 1}).to_list(2000)
        if not brands and not await self.db.brands.count_documents({}):
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
        saved = config.get("categoryMappings") if isinstance(config.get("categoryMappings"), list) else []
        defaults = seed_category_mappings(allowed)
        if config.get("categoryMappingsMigrated") and saved:
            return [row for row in saved if isinstance(row, dict) and (row.get("keywordSplit") or row.get("categorySlug") in allowed)]
        by_saved = {}
        for row in saved:
            if not isinstance(row, dict):
                continue
            name = str(row.get("cloverName") or "").strip()
            slug = str(row.get("categorySlug") or "").strip()
            if name and (row.get("keywordSplit") or slug in allowed):
                by_saved[name.lower()] = {"cloverName": name, "categorySlug": slug, "keywordSplit": bool(row.get("keywordSplit"))}
        merged = []
        seen = set()
        for row in defaults:
            key = row["cloverName"].lower()
            # Keep an owner choice for a name they already saved. Add every new default they do not have.
            merged.append(by_saved.get(key) or row)
            seen.add(key)
        for key, row in by_saved.items():
            if key not in seen:
                merged.append(row)
        await self.db.integrations.update_one(
            {"key": "clover"},
            {"$set": {"categoryMappings": merged, "categoryMappingsMigrated": True, "updatedAt": utcnow()}},
            upsert=True,
        )
        return merged

    async def save_category_mappings(self, mappings: list[dict]) -> list[dict]:
        categories, _brands = await self._website_catalog()
        allowed = {row.get("slug") for row in categories if row.get("slug")}
        cleaned = []
        seen = set()
        for row in mappings:
            name = str(row.get("cloverName") or "").strip()
            slug = str(row.get("categorySlug") or "").strip()
            if not name:
                continue
            if row.get("keywordSplit"):
                cleaned.append({"cloverName": name, "categorySlug": "", "keywordSplit": True})
                seen.add(name.lower())
                continue
            if not slug:
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
        aliases = await self.brand_aliases()
        for item in items:
            item.update(classify_item(item, mappings, categories, brands, aliases))
            item["cloverCategories"] = clover_category_names(item)
        return items

    async def sync_from_clover(self, source: str = "manual", include_prices: bool = False) -> dict:
        started = utcnow()
        try:
            remote = await self.fetch_inventory()
            local = await self.db.products.find({}).to_list(10000)
            remote_by_id = {item["id"]: item for item in remote}
            linked_ids = {str(p.get("cloverItemId")): p for p in local if p.get("cloverItemId")}

            matched_remote: set[str] = set()
            linked = auto_matched = updated = price_changes = 0
            restocked: list[int] = []
            outbound_fields: list[dict] = []
            aliases = await self.brand_aliases()
            for brand in (await self._website_catalog())[1]:
                aliases.append({"name": brand.get("displayName") or brand.get("name") or "", "aliases": []})
            auto_links, link_candidates = propose_links(local, remote, aliases)
            auto_by_item = {row["cloverItemId"]: row for row in auto_links}
            for item in remote:
                product = linked_ids.get(item["id"])
                auto = False
                if not product and item["id"] in auto_by_item:
                    chosen = next((row for row in local if row.get("id") == auto_by_item[item["id"]]["productId"]), None)
                    if chosen and not chosen.get("cloverItemId"):
                        product = chosen
                        chosen["cloverItemId"] = item["id"]
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
                }
                if item.get("modifiedTime"):
                    changes["cloverModifiedTime"] = item.get("modifiedTime")
                field_rows = field_changes(product, item, sync_prices=self.sync_prices, sync_names=self.sync_names)
                for row in field_rows:
                    if row["direction"] == "clover_to_website" and row["apply"]:
                        changes[row["field"]] = row["to"]
                        if row["field"] == "price":
                            price_changes += 1
                        await self.log("catalog_change", "success", field=row["field"], direction=row["direction"], productId=product["id"], cloverItemId=item["id"], oldValue=row["from"], newValue=row["to"])
                    elif row["direction"] == "website_to_clover" and row["apply"]:
                        outbound_fields.append(row)
                    elif row["conflict"]:
                        await self.log("catalog_change", "conflict", field=row["field"], direction=row["direction"], productId=product["id"], cloverItemId=item["id"], oldValue=row["from"], newValue=row["to"], error=row.get("blocked") or "")
                if any(row["field"] in changes for row in field_rows):
                    changes["updatedAt"] = parse_time(item.get("modifiedTime")) or utcnow()
                if item.get("mappedCategorySlug") and not str(product.get("categorySlug") or "").strip():
                    changes["categorySlug"] = item["mappedCategorySlug"]
                    changes["category"] = item.get("mappedCategoryName") or item["mappedCategorySlug"]
                if item.get("mappedBrandSlug") and not str(product.get("brand") or "").strip() and not str(product.get("brandName") or "").strip():
                    changes["brand"] = item["mappedBrandSlug"]
                    changes["brandName"] = item.get("mappedBrandName") or item["mappedBrandSlug"]
                changes["cloverPrice"] = item["price"]
                # Remember Clover's own category names so the admin can compare them with the website.
                changes["cloverCategory"] = ", ".join(item.get("cloverCategories") or [])
                await self.db.products.update_one({"id": product["id"]}, {"$set": changes, "$unset": {"cloverSyncError": ""}})
                updated += int(old_stock != effective_stock)
                if old_stock == 0 and effective_stock > 0:
                    restocked.append(product["id"])

            if self.sync_enabled and not self.dry_run:
                await self._push_field_changes(outbound_fields)
            remote_ids = {row["id"] for row in remote}
            linked_local = [product for product in local if product.get("cloverItemId")]
            missing_local = [product for product in linked_local if product["cloverItemId"] not in remote_ids]
            # Hide website products whose Clover item was removed, so they can't be ordered.
            # Skip when a large share looks missing at once: that is more likely a partial
            # Clover response than a real clean-up, so those are only flagged.
            # Only products still showing count toward the guard: ones already hidden after an
            # earlier Clover clean-up would otherwise trip it forever and block every later removal.
            active_linked = [product for product in linked_local if product.get("active", True)]
            missing_active = [product for product in missing_local if product.get("active", True)]
            can_hide = bool(remote) and len(missing_active) <= max(MISSING_HIDE_MIN, int(len(active_linked) * MISSING_HIDE_SHARE))
            hidden_missing = 0
            for product in local:
                if product.get("cloverItemId") and product["cloverItemId"] not in remote_ids:
                    changes = {"cloverMissing": True, "cloverDeletionFlag": "missing_in_clover"}
                    if can_hide and product.get("active", True):
                        changes.update({"active": False, "cloverAutoHidden": True})
                        hidden_missing += 1
                        await self.log("deletion_flag", "success", productId=product["id"], cloverItemId=product["cloverItemId"], flag="hidden_missing_in_clover")
                    await self.db.products.update_one({"id": product["id"]}, {"$set": changes})
                elif product.get("cloverMissing"):
                    changes = {"cloverMissing": False}
                    if product.get("cloverAutoHidden"):
                        changes["active"] = True
                    await self.db.products.update_one({"id": product["id"]}, {"$set": changes, "$unset": {"cloverDeletionFlag": "", "cloverAutoHidden": ""}})
            unmatched = [item for item in remote if item["id"] not in matched_remote]
            imported_items = 0
            if self.import_new_items and self.sync_enabled and not self.dry_run:
                imported_items = await self._auto_import_new_items(unmatched, link_candidates)
                if imported_items:
                    imported_ids = {row["cloverItemId"] for row in await self.db.products.find({"cloverItemId": {"$in": [item["id"] for item in unmatched]}}, {"cloverItemId": 1}).to_list(10000)}
                    unmatched = [item for item in unmatched if item["id"] not in imported_ids]
            summary = {
                "source": source,
                "remoteItems": len(remote),
                "linkedItems": linked,
                "autoMatchedItems": auto_matched,
                "stockChanges": updated,
                "priceChanges": price_changes,
                "unmatchedItems": len(unmatched),
                "skippedItems": len(unmatched),
                "linkCandidates": len(link_candidates),
                "importedItems": imported_items,
                "hiddenMissingItems": hidden_missing,
                "restockedProductIds": restocked,
            }
            await self.db.integrations.update_one({"key": "clover"}, {
                "$set": {
                    "lastSyncAt": utcnow(),
                    "lastSyncStatus": "success",
                    "lastSyncSummary": summary,
                    "unmatchedItems": unmatched[:200],
                    "linkCandidates": link_candidates,
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

    async def brand_aliases(self) -> list[dict]:
        config = await self.config() or {}
        saved = config.get("brandAliases") if isinstance(config.get("brandAliases"), list) else []
        return [row for row in saved if isinstance(row, dict)]

    async def save_brand_aliases(self, rows: list[dict]) -> list[dict]:
        _categories, brands = await self._website_catalog()
        allowed = {str(brand.get("slug")) for brand in brands if brand.get("slug")}
        cleaned = []
        for row in rows:
            slug = str(row.get("brandSlug") or "").strip()
            if slug not in allowed:
                continue
            aliases = []
            for alias in row.get("aliases") or []:
                text = str(alias).strip()
                if text and text not in aliases:
                    aliases.append(text)
            cleaned.append({"brandSlug": slug, "aliases": aliases})
        await self.db.integrations.update_one({"key": "clover"}, {"$set": {"brandAliases": cleaned, "updatedAt": utcnow()}}, upsert=True)
        return cleaned

    async def _push_field_changes(self, rows: list[dict]) -> None:
        if not rows:
            return
        merchant_id = self._merchant_id(await self.config() or {})
        if not merchant_id:
            return
        grouped: dict[str, dict] = {}
        undo = []
        for row in rows:
            body = grouped.setdefault(row["cloverItemId"], {})
            if row["field"] == "price":
                body["price"] = price_cents(row["to"])
            elif row["field"] == "name":
                body["name"] = row["to"]
            elif row["field"] == "sku":
                body["sku"] = row["to"]
            undo.append({"target": "clover", "cloverItemId": row["cloverItemId"], "previous": {row["field"]: row["from"]}})
        for clover_item_id, body in grouped.items():
            await self.request("POST", f"/v3/merchants/{merchant_id}/items/{clover_item_id}", json_body=body)
            await self.log("catalog_change", "success", direction="website_to_clover", cloverItemId=clover_item_id, newValue=body)
        if undo:
            await self._save_undo(undo, "field_push")

    def _deletion_flags(self, local: list[dict], remote: list[dict]) -> list[dict]:
        remote_ids = {item.get("id") for item in remote}
        flags = []
        for product in local:
            clover_id = product.get("cloverItemId")
            if not clover_id:
                continue
            if clover_id not in remote_ids:
                flags.append({"productId": product.get("id"), "name": product.get("name") or "", "cloverItemId": clover_id, "flag": "missing_in_clover"})
            elif product.get("active") is False:
                flags.append({"productId": product.get("id"), "name": product.get("name") or "", "cloverItemId": clover_id, "flag": "website_hidden"})
        return flags

    async def catalog_report(self, remote: list[dict]) -> dict:
        categories, brands = await self._website_catalog()
        category_counts: dict[str, int] = {}
        brand_counts: dict[str, int] = {}
        for item in remote:
            labels = item.get("cloverCategories") or clover_category_names(item)
            if not labels:
                category_counts["(no category)"] = category_counts.get("(no category)", 0) + 1
            for label in labels:
                if not item.get("mappedCategorySlug"):
                    category_counts[label] = category_counts.get(label, 0) + 1
            if not item.get("mappedBrandSlug"):
                token = str(item.get("name") or "").split(" ")[0].strip()
                if token:
                    brand_counts[token] = brand_counts.get(token, 0) + 1
        names = {}
        for category in categories:
            key = normalized_name(category.get("name"))
            if key:
                names.setdefault(key, []).append(category.get("name"))
        category_duplicates = [rows for rows in names.values() if len(rows) > 1]
        return {
            "unmatchedCategories": [{"name": name, "count": count} for name, count in sorted(category_counts.items(), key=lambda row: -row[1])],
            "unmatchedBrandNames": [{"name": name, "count": count} for name, count in sorted(brand_counts.items(), key=lambda row: -row[1])[:30]],
            "possibleCategoryDuplicates": category_duplicates,
            "possibleBrandDuplicates": brand_report(brands).get("possibleDuplicates") or [],
            "oddBrands": brand_report(brands).get("oddBrands") or [],
        }

    async def _save_undo(self, entries: list[dict], source: str) -> None:
        if not entries:
            return
        await self.db.integrations.update_one({"key": "clover"}, {"$set": {"lastUndo": {
            "id": secrets.token_hex(8),
            "createdAt": utcnow(),
            "source": source,
            "undone": False,
            "entries": entries,
        }}}, upsert=True)

    async def undo_last_batch(self) -> dict:
        batch = (await self.config() or {}).get("lastUndo") or {}
        if not batch or batch.get("undone"):
            raise CloverError("There is no Clover change batch to undo.")
        merchant_id = self._merchant_id(await self.config() or {})
        for entry in batch.get("entries") or []:
            previous = entry.get("previous") or {}
            if entry.get("target") == "website" and entry.get("productId") is not None:
                await self.db.products.update_one({"id": entry["productId"]}, {"$set": previous})
            elif entry.get("target") == "clover" and merchant_id and entry.get("cloverItemId"):
                body = {}
                if "price" in previous:
                    body["price"] = price_cents(previous["price"])
                if "name" in previous:
                    body["name"] = previous["name"]
                if "sku" in previous:
                    body["sku"] = previous["sku"]
                if body:
                    await self.request("POST", f"/v3/merchants/{merchant_id}/items/{entry['cloverItemId']}", json_body=body)
        batch["undone"] = True
        await self.db.integrations.update_one({"key": "clover"}, {"$set": {"lastUndo": batch}})
        await self.log("undo", "success", source=batch.get("source") or "")
        return {"undone": True, "id": batch.get("id")}

    async def sync_product_details(self, product_id: int, source: str = "admin", confirm_price: bool = False, create_in_clover: bool = False) -> dict:
        product = await self.db.products.find_one({"id": product_id})
        if not product:
            return {"status": "skipped", "action": "none", "reason": "Product was not found."}
        if source == "admin_product_hide":
            if product.get("cloverItemId"):
                await self.db.products.update_one({"id": product_id}, {"$set": {"cloverDeletionFlag": "website_hidden"}})
                await self.log("deletion_flag", "success", productId=product_id, cloverItemId=product.get("cloverItemId"), flag="website_hidden")
            return {"status": "flagged", "action": "none", "reason": "Hiding a website product does not delete the Clover item."}
        if not product.get("cloverItemId"):
            if create_in_clover:
                return await self.create_clover_item(product, confirm_price=confirm_price)
            return {"status": "skipped", "action": "none", "reason": "This product is not linked to Clover."}
        if not self.sync_prices and not self.sync_names:
            return {"status": "skipped", "action": "none", "reason": "Clover name and price sync are off."}
        if self.dry_run or not self.sync_enabled:
            return {"status": "planned", "action": "update", "reason": "Preview only. Nothing was sent to Clover."}
        merchant_id = self._merchant_id(await self.config() or {})
        if not merchant_id:
            return {"status": "not_connected", "action": "none"}
        body = {}
        blocked = ""
        if self.sync_names:
            body["name"] = product.get("name") or ""
            body["sku"] = product.get("sku") or ""
        if self.sync_prices:
            blocked = price_guard(product.get("cloverPrice") or product.get("price"), product.get("price"), confirm_price)
            # Guard compares against the last Clover dollar price when we have it.
            last_clover = product.get("cloverPrice")
            if last_clover is None:
                blocked = price_guard(product.get("price"), product.get("price"), True) if confirm_price else ""
                if float(product.get("price") or 0) <= 0 and not confirm_price:
                    blocked = price_guard(1, 0, False)
            else:
                blocked = price_guard(last_clover, product.get("price"), confirm_price)
            if not blocked:
                body["price"] = price_cents(product.get("price"))
        if blocked and "price" not in body and not self.sync_names:
            await self.log("catalog_change", "conflict", field="price", productId=product_id, error=blocked)
            return {"status": "needs_confirmation", "action": "update", "error": blocked}
        if not body:
            return {"status": "skipped", "action": "none", "reason": blocked or "Nothing to send."}
        await self.request("POST", f"/v3/merchants/{merchant_id}/items/{product['cloverItemId']}", json_body=body)
        await self._save_undo([{"target": "clover", "cloverItemId": product["cloverItemId"], "previous": {"name": product.get("name"), "sku": product.get("sku"), "price": product.get("price")}}], "admin_save")
        await self.log("catalog_change", "success", direction="website_to_clover", productId=product_id, newValue=body)
        result = {"status": "success", "action": "update"}
        if blocked:
            result["priceBlocked"] = blocked
            result["status"] = "partial"
        return result

    async def create_clover_item(self, product: dict, confirm_price: bool = False) -> dict:
        if not self.create_items:
            return {"status": "skipped", "action": "none", "reason": "CLOVER_CREATE_ITEMS is off."}
        if self.dry_run:
            return {"status": "planned", "action": "create", "reason": "Dry run. The Clover item was not created."}
        merchant_id = self._merchant_id(await self.config() or {})
        if not merchant_id:
            return {"status": "not_connected", "action": "none"}
        if float(product.get("price") or 0) <= 0 and not confirm_price:
            return {"status": "needs_confirmation", "action": "create", "error": price_guard(1, 0, False)}
        remote = await self.fetch_inventory()
        sku_key = _match_identifier(product.get("sku"))
        name_key = normalized_name(product.get("name"))
        for item in remote:
            sku_match = sku_key and _match_identifier(item.get("sku")) == sku_key
            name_match = name_key and normalized_name(item.get("name")) == name_key
            if sku_match or name_match:
                await self.db.products.update_one({"id": product["id"]}, {"$set": {"cloverItemId": item["id"], "cloverLastSyncedAt": utcnow()}})
                await self.log("link", "success", productId=product["id"], cloverItemId=item["id"], reason="existing item")
                return {"status": "success", "action": "linked_existing", "cloverItemId": item["id"]}
        created = await self.request("POST", f"/v3/merchants/{merchant_id}/items", json_body={
            "name": product.get("name") or "Website item",
            "price": price_cents(product.get("price")),
            "sku": product.get("sku") or "",
            "code": product.get("barcode") or "",
        })
        clover_id = str((created or {}).get("id") or "")
        if not clover_id:
            return {"status": "failed", "action": "create", "error": "Clover did not return an item id."}
        await self.db.products.update_one({"id": product["id"]}, {"$set": {"cloverItemId": clover_id, "cloverLastSyncedAt": utcnow()}})
        await self._attach_category_and_brand(merchant_id, clover_id, product, remote)
        await self.log("import", "success", productId=product["id"], cloverItemId=clover_id, direction="website_to_clover")
        return {"status": "success", "action": "create", "cloverItemId": clover_id}

    async def category_placeholders(self) -> dict:
        config = await self.config() or {}
        return dict(config.get("categoryPlaceholders") or {})

    async def save_category_placeholders(self, placeholders: dict) -> dict:
        categories, _brands = await self._website_catalog()
        allowed = {row.get("slug") for row in categories if row.get("slug")}
        cleaned = {}
        for slug, url in (placeholders or {}).items():
            slug, url = str(slug or "").strip(), str(url or "").strip()
            if slug in allowed and url.startswith("/api/files/"):
                cleaned[slug] = url
        await self.db.integrations.update_one({"key": "clover"}, {"$set": {"categoryPlaceholders": cleaned, "updatedAt": utcnow()}}, upsert=True)
        return cleaned

    async def _auto_import_new_items(self, unmatched: list[dict], link_candidates: list[dict], limit: int = 100) -> int:
        """Create website products for Clover items that are not on the website yet.

        Items that look like an existing website product (a link candidate) are left for an
        admin to confirm, so this never makes a second copy of a product. An item goes live
        only when its category is known and its price is above $0; everything else is created
        hidden for review. Nothing is written to Clover here.
        """
        candidate_ids = {str(row.get("cloverItemId")) for row in link_candidates or []}
        placeholders = await self.category_placeholders()
        created = 0
        for item in unmatched:
            if created >= limit:
                break
            clover_id = str(item.get("id") or "")
            if not clover_id or clover_id in candidate_ids or item.get("hidden"):
                continue
            if await self.db.products.find_one({"cloverItemId": clover_id}, {"_id": 1}):
                continue
            name = str(item.get("name") or "").strip() or "Clover item"
            price = float(item.get("price") or 0)
            category_slug = item.get("mappedCategorySlug") or ""
            live = bool(category_slug) and price > 0 and not item.get("needsReview")
            image = placeholders.get(category_slug, "")
            doc = {
                "name": name,
                "price": price,
                "salePrice": None,
                "stock": max(0, int(item.get("stock") or 0)),
                "sku": item.get("sku") or "",
                "barcode": item.get("barcode") or "",
                "category": item.get("mappedCategoryName") or "",
                "categorySlug": category_slug,
                "brand": item.get("mappedBrandSlug") or "",
                "brandName": item.get("mappedBrandName") or "",
                "image": image,
                "image2": image,
                "flavors": [],
                "puffs": None,
                "rating": 4.5,
                "description": "",
                "complianceCategory": "regulated",
                "minimumAge": 21,
                "requiresIdAtDelivery": True,
                "localDeliveryOnly": True,
                "allowedStates": ["FL"],
                "blockedStates": [],
                "cloverItemId": clover_id,
                "cloverPrice": price,
                "cloverNeedsReview": not live,
                "cloverAutoImported": True,
                "cloverLastSyncedAt": utcnow(),
                "active": live,
                "createdAt": utcnow(),
                "updatedAt": utcnow(),
            }
            for _attempt in range(5):
                last = await self.db.products.find_one(sort=[("id", -1)])
                next_id = int(last["id"]) + 1 if last and last.get("id") else 1
                try:
                    await self.db.products.insert_one({**doc, "id": next_id, "slug": f"{_slug(name)}-{next_id}"})
                except DuplicateKeyError:
                    if await self.db.products.find_one({"cloverItemId": clover_id}, {"_id": 1}):
                        break
                    continue
                created += 1
                await self.log("import", "success", productId=next_id, cloverItemId=clover_id, direction="clover_to_website", live=live)
                break
        return created

    async def import_mapped_items(self) -> dict:
        """Create hidden website products only for Clover items already mapped to an existing category and brand."""
        if not self.import_new_items:
            return {"applied": False, "reason": "import_disabled", "created": 0}
        remote = await self.fetch_inventory()
        existing_ids = {str(row.get("cloverItemId")) for row in await self.db.products.find({"cloverItemId": {"$exists": True, "$ne": ""}}, {"cloverItemId": 1}).to_list(10000)}
        last = await self.db.products.find_one(sort=[("id", -1)])
        next_id = int(last["id"]) + 1 if last and last.get("id") else 1
        created = 0
        for item in remote:
            if item["id"] in existing_ids or item.get("needsReview") or not item.get("mappedCategorySlug") or not item.get("mappedBrandSlug"):
                continue
            await self.db.products.insert_one({
                "id": next_id,
                "slug": f"clover-{next_id}",
                "name": item.get("name") or "Clover item",
                "price": item.get("price") or 0,
                "stock": item.get("stock") or 0,
                "sku": item.get("sku") or "",
                "barcode": item.get("barcode") or "",
                "category": item.get("mappedCategoryName") or "",
                "categorySlug": item.get("mappedCategorySlug") or "",
                "brand": item.get("mappedBrandSlug") or "",
                "brandName": item.get("mappedBrandName") or "",
                "cloverItemId": item["id"],
                "active": False,
                "minimumAge": 21,
                "createdAt": utcnow(),
                "updatedAt": utcnow(),
            })
            existing_ids.add(item["id"])
            next_id += 1
            created += 1
        return {"applied": True, "created": created}

    async def unlink_product(self, product_id: int) -> dict:
        await self.db.products.update_one({"id": product_id}, {"$unset": {"cloverItemId": "", "cloverMissing": "", "cloverDeletionFlag": ""}})
        return {"ok": True}

    async def _attach_category_and_brand(self, merchant_id: str, clover_id: str, product: dict, remote: list[dict]) -> None:
        category_name = str(product.get("category") or "").strip()
        if category_name:
            categories = await self._paged(f"/v3/merchants/{merchant_id}/categories")
            match = next((row for row in categories if normalized_name(row.get("name")) == normalized_name(category_name)), None)
            if match and match.get("id"):
                await self.request("POST", f"/v3/merchants/{merchant_id}/category_items", json_body={"category": {"id": match["id"]}, "item": {"id": clover_id}})
        brand_name = str(product.get("brandName") or "").strip()
        if not brand_name:
            return
        tags = await self._paged(f"/v3/merchants/{merchant_id}/tags")
        tag = next((row for row in tags if normalized_name(row.get("name")) == normalized_name(brand_name)), None)
        if not tag:
            tag = await self.request("POST", f"/v3/merchants/{merchant_id}/tags", json_body={"name": brand_name})
        if tag and tag.get("id"):
            await self.request("POST", f"/v3/merchants/{merchant_id}/tag_items", json_body={"tag": {"id": tag["id"]}, "item": {"id": clover_id}})

    async def category_writeback_plan(self) -> dict:
        remote = await self.fetch_inventory()
        categories = await self._paged(f"/v3/merchants/{self._merchant_id(await self.config() or {})}/categories") if self._merchant_id(await self.config() or {}) else []
        tags = await self._paged(f"/v3/merchants/{self._merchant_id(await self.config() or {})}/tags") if self._merchant_id(await self.config() or {}) else []
        by_category = {normalized_name(row.get("name")): row for row in categories if row.get("name")}
        by_tag = {normalized_name(row.get("name")): row for row in tags if row.get("name")}
        changes = []
        for product in await self.db.products.find({"cloverItemId": {"$exists": True, "$ne": ""}}).to_list(5000):
            category_name = str(product.get("category") or "").strip()
            if category_name:
                match = by_category.get(normalized_name(category_name))
                changes.append({
                    "productId": product.get("id"),
                    "name": product.get("name") or "",
                    "cloverItemId": product.get("cloverItemId"),
                    "action": "assign_category" if match else "skip_category",
                    "detail": (match or {}).get("name") or category_name,
                    "creates": False,
                })
            brand_name = str(product.get("brandName") or "").strip()
            if brand_name:
                tag = by_tag.get(normalized_name(brand_name))
                changes.append({
                    "productId": product.get("id"),
                    "name": product.get("name") or "",
                    "cloverItemId": product.get("cloverItemId"),
                    "action": "reuse_tag" if tag else "add_tag",
                    "detail": brand_name,
                    "creates": not bool(tag),
                })
        return {"changes": changes, "remoteItems": len(remote)}

    async def apply_category_writeback(self, confirm: bool = False) -> dict:
        plan = await self.category_writeback_plan()
        if not self.category_writeback:
            return {"applied": False, "reason": "writeback_disabled", "plan": plan}
        if self.dry_run or not confirm:
            return {"applied": False, "dryRun": True, "plan": plan}
        merchant_id = self._merchant_id(await self.config() or {})
        if not merchant_id:
            return {"applied": False, "reason": "not_connected", "plan": plan}
        for change in plan["changes"]:
            if change["action"] == "assign_category":
                categories = await self._paged(f"/v3/merchants/{merchant_id}/categories")
                match = next((row for row in categories if normalized_name(row.get("name")) == normalized_name(change["detail"])), None)
                if match and match.get("id"):
                    await self.request("POST", f"/v3/merchants/{merchant_id}/category_items", json_body={"category": {"id": match["id"]}, "item": {"id": change["cloverItemId"]}})
            elif change["action"] in {"reuse_tag", "add_tag"}:
                tags = await self._paged(f"/v3/merchants/{merchant_id}/tags")
                tag = next((row for row in tags if normalized_name(row.get("name")) == normalized_name(change["detail"])), None)
                if not tag:
                    tag = await self.request("POST", f"/v3/merchants/{merchant_id}/tags", json_body={"name": change["detail"]})
                if tag and tag.get("id"):
                    await self.request("POST", f"/v3/merchants/{merchant_id}/tag_items", json_body={"tag": {"id": tag["id"]}, "item": {"id": change["cloverItemId"]}})
            await self.log("category_writeback", "success", productId=change.get("productId"), cloverItemId=change.get("cloverItemId"), change=change.get("action"), detail=change.get("detail"))
        await self._save_undo([{"target": "note", "previous": {"writeback": "last batch"}}], "category_writeback")
        return {"applied": True, "plan": plan}

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
        field_plan_rows = []
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
                price_changes.append({"productId": product["id"], "cloverItemId": item["id"], "from": product.get("price"), "to": item["price"], "name": product.get("name") or item.get("name") or ""})
            field_plan_rows.extend(field_changes(product, item, sync_prices=self.sync_prices, sync_names=self.sync_names))
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
            "fieldChanges": field_plan_rows,
            "conflicts": [row for row in field_plan_rows if row.get("conflict")],
            "catalogReport": await self.catalog_report(remote),
            "deletionFlags": self._deletion_flags(local, remote),
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

    async def sync_catalog(self, source: str = "manual", preview: bool = False) -> dict:
        """Pull stock and prices from Clover. Writes only when sync is on and this is not a dry run."""
        remote = await self.fetch_inventory()
        plan = await self._catalog_plan(remote)
        plan["source"] = source
        preview_items = [{
            "id": item.get("id"),
            "name": item.get("name"),
            "cloverCategories": item.get("cloverCategories") or [],
            "mappedCategorySlug": item.get("mappedCategorySlug") or "",
            "mappedCategoryName": item.get("mappedCategoryName") or "",
            "mappedBrandSlug": item.get("mappedBrandSlug") or "",
            "mappedBrandName": item.get("mappedBrandName") or "",
            "confidence": item.get("confidence") or "none",
            "conflict": bool(item.get("conflict")),
            "needsReview": bool(item.get("needsReview")),
        } for item in remote]
        plan["previewItems"] = preview_items
        plan["previewTotal"] = len(preview_items)
        plan["reviewItems"] = [item for item in preview_items if item["needsReview"]]
        aliases = await self.brand_aliases()
        for brand in (await self._website_catalog())[1]:
            aliases.append({"name": brand.get("displayName") or brand.get("name") or "", "aliases": []})
        local = await self.db.products.find({}).to_list(10000)
        planned, candidates = propose_links(local, remote, aliases)
        plan["plannedLinks"] = planned
        plan["linkCandidates"] = candidates
        if preview or not self.sync_enabled or self.dry_run:
            plan["applied"] = False
            plan["dryRun"] = True
            await self._remember_plan(plan, "dry_run" if self.sync_enabled else "disabled")
            await self.log("inventory_pull", "skipped", source=source, dryRun=True, syncEnabled=self.sync_enabled)
            return plan
        clover_stock_changes = await self.apply_pending_adjustments()
        summary = await self.sync_from_clover(source, include_prices=True)
        summary["cloverStockChanges"] = clover_stock_changes
        for key in ("conflicts", "fieldChanges", "catalogReport", "deletionFlags", "previewItems", "previewTotal"):
            summary[key] = plan.get(key)
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

    async def delete_clover_item(self, clover_item_id: str, product_id: Optional[int] = None) -> dict:
        """Permanently delete one item from the Clover register. Only called after the owner
        confirmed deleting that product everywhere (Store Photos delete)."""
        clover_item_id = _clean_identifier(clover_item_id)
        if not clover_item_id:
            return {"status": "skipped"}
        if not self.sync_enabled or self.dry_run:
            raise CloverError("Clover sync is off, so the Clover item was not deleted.")
        merchant_id = self._merchant_id(await self.config() or {})
        if not merchant_id:
            raise CloverError("Clover is not connected.")
        await self.request("DELETE", f"/v3/merchants/{merchant_id}/items/{clover_item_id}")
        await self.log("item_delete", "success", productId=product_id, cloverItemId=clover_item_id)
        return {"status": "deleted", "cloverItemId": clover_item_id}

    async def push_stock_edit(self, product_id: int, old_stock: int, new_stock: int, confirm: bool = False) -> dict:
        """Send a stock number typed on the website to Clover as a change (+/-), not a
        replacement, so a register sale made meanwhile is kept. Large jumps need confirm."""
        product = await self.db.products.find_one({"id": product_id})
        clover_id = _clean_identifier((product or {}).get("cloverItemId"))
        if not product or not clover_id:
            return {"status": "skipped", "reason": "This product is not linked to Clover."}
        delta = int(new_stock) - int(old_stock)
        if delta == 0:
            return {"status": "skipped", "reason": "Stock did not change."}
        if not self.sync_enabled or self.dry_run:
            return {"status": "planned", "reason": "Clover sync is off. Nothing was sent."}
        if not self._merchant_id(await self.config() or {}):
            return {"status": "not_connected"}
        if abs(delta) > max(STOCK_EDIT_CONFIRM_MIN, int(old_stock) * 3) and not confirm:
            return {"status": "needs_confirmation", "delta": delta,
                    "error": f"Stock change of {delta:+d} is unusually large, so Clover was not changed. Tick the confirm box and save again, or fix the number. The next sync will reset the website to Clover's count."}
        await self.db.clover_stock_adjustments.create_index("key", unique=True)
        line = {
            "productId": product_id,
            "cloverItemId": clover_id,
            "barcode": exact_barcode(product.get("barcode")) or exact_barcode(product.get("sku")),
            "qty": abs(delta),
            "name": product.get("name") or "",
        }
        result = await self._mutate_item_stock(f"edit-{product_id}-{secrets.token_hex(6)}", line, "restore" if delta > 0 else "decrement")
        return {**result, "delta": delta}

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


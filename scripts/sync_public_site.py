#!/usr/bin/env python3
"""Snapshot Puff2Door's public catalog/content and its public image assets.

This intentionally reads public endpoints only. Customer, order, chat, loyalty
ledger, and admin records are private database data and are never requested.
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import re
import ssl
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
UPLOADS = PUBLIC / "uploads"
BASE_URL = "https://puff2door.com"
DEFAULT_CA = ssl.get_default_verify_paths().cafile
SYSTEM_CA = Path("/etc/ssl/cert.pem")
CA_FILE = DEFAULT_CA if DEFAULT_CA and Path(DEFAULT_CA).exists() else (str(SYSTEM_CA) if SYSTEM_CA.exists() else None)
SSL_CONTEXT = ssl.create_default_context(cafile=CA_FILE)


def fetch(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "Puff2Door source migration/1.0"})
    with urlopen(req, timeout=45, context=SSL_CONTEXT) as response:
        return response.read()


def fetch_json(endpoint: str):
    return json.loads(fetch(BASE_URL + endpoint))


def safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "asset"


def localize(url: str) -> str:
    if not url or url.startswith(("/img/", "/uploads/")):
        return url
    if url.startswith("/api/files/"):
        relative = url.removeprefix("/api/files/")
        destination = UPLOADS / relative
        source = BASE_URL + url
    elif url.startswith(("http://", "https://")):
        parsed = urlparse(url)
        filename = safe_name(Path(parsed.path).name)
        if "." not in filename:
            filename += mimetypes.guess_extension("image/jpeg") or ".jpg"
        digest = hashlib.sha256(url.encode()).hexdigest()[:12]
        relative = f"external/{digest}-{filename}"
        destination = UPLOADS / relative
        source = url
    else:
        return url
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        try:
            destination.write_bytes(fetch(source))
            print(f"downloaded {source} -> {destination.relative_to(ROOT)}")
        except Exception as exc:
            print(f"WARNING: could not download {source}: {exc}")
            return url
    return "/uploads/" + relative


def write_json(relative_path: str, value) -> None:
    target = ROOT / relative_path
    target.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {target.relative_to(ROOT)}")


def main() -> None:
    products = fetch_json("/api/products")["products"]
    for product in products:
        product.pop("inStock", None)
        product.pop("rating", None)
        product["image"] = localize(product.get("image", ""))
        product["image2"] = localize(product.get("image2", ""))
    write_json("backend/seed_products.json", products)

    categories = fetch_json("/api/categories")["categories"]
    for category in categories:
        category.pop("productCount", None)
    write_json("backend/seed_categories.json", categories)

    brands = fetch_json("/api/brands")["brands"]
    for brand in brands:
        brand.pop("productCount", None)
        brand["logo"] = localize(brand.get("logo", ""))
    write_json("backend/seed_brands.json", brands)

    content = fetch_json("/api/content/home")
    content.pop("key", None)
    content.pop("updatedBy", None)
    for slide in content.get("heroSlides", []):
        slide["image"] = localize(slide.get("image", ""))
    for block in content.get("promoBlocks", []):
        block["image"] = localize(block.get("image", ""))
    write_json("backend/seed_content.json", content)

    public_settings = fetch_json("/api/settings")
    pricing = public_settings["pricing"]
    delivery = public_settings["delivery"]
    loyalty = public_settings["loyalty"]
    settings = {
        "taxRate": pricing["taxRate"],
        "deliveryFee": pricing["deliveryFee"],
        "freeDeliveryMin": pricing["freeDeliveryMin"],
        "deliveryZip": delivery["zip"],
        "deliveryRadiusMiles": delivery["radiusMiles"],
        "loyaltyEnabled": loyalty["enabled"],
        "pointsPerDollar": loyalty["pointsPerDollar"],
        "pointsPerReward": loyalty["pointsPerReward"],
        "rewardValue": loyalty["rewardValue"],
        "minRedeemPoints": loyalty["minRedeemPoints"],
        "maxRedeemPerOrder": loyalty["maxRedeemPerOrder"],
        "minPurchaseForRedeem": loyalty["minPurchaseForRedeem"],
        "signupBonusPoints": loyalty["signupBonusPoints"],
    }
    try:
        chat = fetch_json("/api/chat/status")
        settings.update(
            chatEnabled=chat.get("enabled", True),
            chatOnline=chat.get("online", True),
            chatWelcome=chat.get("welcome", "Hi! How can we help?"),
            chatOffline=chat.get("offlineMessage", "Leave us a message and we'll get back to you."),
        )
    except Exception as exc:
        print(f"WARNING: could not read chat settings: {exc}")
    write_json("backend/seed_settings.json", settings)

    print(f"snapshot complete: {len(products)} products, {len(categories)} categories, {len(brands)} brands")


if __name__ == "__main__":
    main()

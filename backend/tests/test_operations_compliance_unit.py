import asyncio
import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _limit):
        return self.rows


class FakeProducts:
    def __init__(self, rows):
        self.rows = rows

    def find(self, *_args, **_kwargs):
        return FakeCursor(self.rows)


class FakeOrders:
    def __init__(self, booked):
        self.booked = booked

    async def count_documents(self, query):
        assert "deliveryWindow.id" in query
        return self.booked


def run(coro):
    return asyncio.run(coro)


def test_state_names_and_abbreviations_match():
    assert server._state_key("Florida") == "fl"
    assert server._state_key("FL") == "fl"
    assert server._state_key("New York") == "ny"


def test_product_restrictions_require_attestation_and_enforce_state(monkeypatch):
    product = {"id": 1, "name": "Restricted item", "allowedStates": ["FL"], "minimumAge": 21, "requiresIdAtDelivery": True, "complianceCategory": "nicotine"}
    monkeypatch.setattr(server, "db", SimpleNamespace(products=FakeProducts([product])))
    item = server.CartItem(productId=1, name="Restricted item", price=10, qty=1)
    with pytest.raises(server.HTTPException, match="Confirm the 21"):
        run(server.validate_product_restrictions([item], "Florida", False))
    snapshot = run(server.validate_product_restrictions([item], "Florida", True))
    assert snapshot["minimumAge"] == 21 and snapshot["requiresIdAtDelivery"] is True
    with pytest.raises(server.HTTPException, match="cannot be delivered"):
        run(server.validate_product_restrictions([item], "Georgia", True))


def test_capacity_uses_lower_operational_limit(monkeypatch):
    monkeypatch.setattr(server, "db", SimpleNamespace(orders=FakeOrders(3)))
    settings = {"deliverySlotCapacity": 12, "deliveryDriverCount": 2, "ordersPerDriverPerWindow": 4}
    result = run(server.window_capacity("2026-10-17-12:00", settings))
    assert result == {"capacity": 8, "booked": 3, "remaining": 5, "available": True, "full": False}


def test_order_response_exposes_audit_result_without_id_image():
    order = {
        "id": "o1", "orderNumber": "P2D-1", "items": [], "shipping": {}, "subtotal": 10, "total": 10,
        "createdAt": datetime.now(timezone.utc), "ageVerifiedAt": datetime.now(timezone.utc),
        "requiresIdAtDelivery": True,
        "idCheck": {"status": "passed", "idType": "Driver license", "fullIdImageStored": False, "checkedBy": "Driver"},
    }
    response = server.order_response(order)
    assert response["ageVerified"] is True
    assert response["idCheck"]["status"] == "passed"
    assert response["idCheck"]["fullIdImageStored"] is False
    assert "idImage" not in response and "dateOfBirth" not in response

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server


def rules(**overrides):
    result = {
        "mixSaveEnabled": True,
        "mixSaveDiscountType": "percent",
        "mixSaveDiscountValue": 10,
        "mixSaveMinQuantity": 2,
        "mixSaveMinSubtotal": 50,
        "mixSaveCategorySlugs": ["disposable", "delta-cartridges", "delta-smokeables"],
        "mixSaveProductIds": [],
    }
    result.update(overrides)
    return result


def line(product_id, category, price, qty=1, selected=1):
    return {
        "productId": product_id,
        "categorySlug": category,
        "price": price,
        "qty": qty,
        "mixSaveQty": selected,
    }


def test_cross_category_bundle_qualifies_and_calculates_discount():
    items = [line(1, "disposable", 30), line(2, "delta-cartridges", 25)]
    result = server.calculate_mix_save_discount(items, rules())

    assert result["qualified"] is True
    assert result["selectedQuantity"] == 2
    assert result["bundleSubtotal"] == 55
    assert result["discount"] == 5.5


def test_threshold_is_strictly_greater_than_fifty():
    items = [line(1, "disposable", 25), line(2, "delta-cartridges", 25)]
    result = server.calculate_mix_save_discount(items, rules())

    assert result["qualified"] is False
    assert result["discount"] == 0
    assert result["amountRemaining"] == 0.01


def test_ineligible_or_excess_selected_quantities_are_ignored():
    items = [
        line(1, "disposable", 30, qty=1, selected=8),
        line(2, "snacks", 100, qty=1, selected=1),
        line(3, "delta-cartridges", 25, qty=1, selected=1),
    ]
    result = server.calculate_mix_save_discount(items, rules())

    assert items[0]["mixSaveQty"] == 1
    assert items[1]["mixSaveQty"] == 0
    assert result["selectedQuantity"] == 2
    assert result["discount"] == 5.5


def test_promo_can_remove_bundle_qualification():
    items = [line(1, "disposable", 30), line(2, "delta-cartridges", 25)]
    result = server.calculate_mix_save_discount(items, rules(), promo_discount_amount=10, cart_subtotal=55)

    assert result["qualified"] is False
    assert result["qualifyingSubtotal"] == 45
    assert result["discount"] == 0


def test_flat_discount_never_exceeds_qualifying_subtotal():
    items = [line(1, "disposable", 30), line(2, "delta-cartridges", 25)]
    result = server.calculate_mix_save_discount(
        items,
        rules(mixSaveDiscountType="flat", mixSaveDiscountValue=500),
    )

    assert result["qualified"] is True
    assert result["discount"] == 55


def test_admin_settings_reject_invalid_animation_style():
    with pytest.raises(ValueError):
        server.StoreSettingsInput(mixSaveAnimationStyle="spin-wildly")

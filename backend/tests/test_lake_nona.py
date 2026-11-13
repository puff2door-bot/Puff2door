import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


def settings(**overrides):
    return {**server.DEFAULT_SETTINGS, "taxRate": 0.07, "allowedZipCodes": ["32714"], **overrides}


def test_lake_nona_delivery_follows_admin_switch():
    off, on = settings(lakeNonaEnabled=False), settings(lakeNonaEnabled=True)
    for zip_code in server.LAKE_NONA_ZIPS:
        assert server.delivery_zone_check(zip_code, off)["eligible"] is False
        assert server.delivery_zone_check(zip_code, on)["eligible"] is True
    assert server.delivery_zone_check("32714", off)["eligible"] is True
    assert server.delivery_zone_check("32801", on)["eligible"] is False


def test_delivery_tax_uses_zip_rate_and_pickup_uses_store_rate():
    s = settings()
    assert server.compute_totals(100, s, zip_code="32714")["tax"] == 7.0
    assert server.compute_totals(100, s, zip_code="32832")["tax"] == 6.5
    assert server.compute_totals(100, s, pickup=True, zip_code="32832")["tax"] == 7.0
    assert server.compute_totals(100, settings(zipTaxRates={}), zip_code="32832")["tax"] == 7.0


def test_public_rules_expose_switch_and_zip_rates():
    s = settings(lakeNonaEnabled=True)
    assert server.delivery_rules(s)["lakeNonaEnabled"] is True
    assert server.pricing_rules(s)["zipTaxRates"]["32832"] == 0.065

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import visitors  # noqa: E402


def test_sources_and_devices():
    assert visitors.source_of("https://www.google.com/", "") == "Google search"
    assert visitors.source_of("", "gbp") == "Google Maps"
    assert visitors.source_of("https://l.instagram.com/", "") == "Instagram"
    assert visitors.source_of("", "") == "Typed / bookmark"
    assert visitors.device_of("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari") == "phone"
    assert visitors.is_bot("Googlebot/2.1") and visitors.is_bot("")


def test_cloudflare_headers_win_and_ip_is_not_returned():
    out = visitors.locate({"cf-ipcity": "Orlando", "cf-region": "Florida", "cf-ipcountry": "US", "cf-postal-code": "32827"}, "8.8.8.8")
    assert out == {"city": "Orlando", "region": "Florida", "country": "US", "zip": "32827", "geo": "cf"}


def test_area_labels():
    assert visitors.area_label({"country": "CA"}) == "Outside the US"
    assert visitors.area_label({"country": "US", "region": "Georgia", "city": "Atlanta"}) == "Outside Florida"
    assert visitors.area_label({"country": "US", "region": "Florida", "city": "Longwood"}) == "Longwood"

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


def test_sal_is_on_by_default_with_lines_for_every_spot():
    rules = server.delivery_rules({**server.DEFAULT_SETTINGS})
    assert rules["salEnabled"] is True
    assert set(rules["salLines"]) == set(server.SAL_SPOTS)
    assert all(rules["salLines"][spot] for spot in server.SAL_SPOTS)


def test_admin_switch_turns_sal_off():
    rules = server.delivery_rules({**server.DEFAULT_SETTINGS, "salEnabled": False})
    assert rules["salEnabled"] is False


def test_sal_lines_are_cleaned_and_empty_spots_fall_back_to_defaults():
    cleaned = server.clean_sal_lines({"checkout": ["  Have your ID ready  ", "", "x" * 300], "banner": []})
    assert cleaned["checkout"][0] == "Have your ID ready"
    assert len(cleaned["checkout"][1]) == 140
    assert cleaned["banner"] == server.SAL_DEFAULT_LINES["banner"]
    assert set(cleaned) == set(server.SAL_SPOTS)


def test_sal_animations_and_outfit_default_on_and_auto():
    rules = server.delivery_rules({**server.DEFAULT_SETTINGS})
    assert rules["salAnimated"] is True
    assert rules["salOutfit"] == "auto"
    pub = server.sal_public({**server.DEFAULT_SETTINGS, "salAnimated": False, "salOutfit": "santa"})
    assert pub["animated"] is False and pub["outfit"] == "santa"


def test_unknown_outfit_falls_back_to_auto():
    assert server.sal_public({**server.DEFAULT_SETTINGS, "salOutfit": "pirate"})["outfit"] == "auto"

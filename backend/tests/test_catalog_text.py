from catalog_text import (
    canonical_category_slug,
    canonical_product_slug,
    normalize_catalog_text,
    slugify_catalog,
)


def test_known_catalog_spelling_is_corrected():
    assert normalize_catalog_text("WhiteGrape Banna Tequlia") == "White Grape Banana Tequila"
    assert normalize_catalog_text("WATERMELON CHERR") == "WATERMELON CHERRY"
    assert normalize_catalog_text("AIR FRESHNER") == "AIR FRESHENER"


def test_product_slug_uses_corrected_name_and_stable_id():
    assert canonical_product_slug("Lost Mary Watermellon Cherr", 137) == "lost-mary-watermelon-cherry-137"


def test_long_slugs_stop_at_a_word_boundary():
    slug = slugify_catalog("alpha " * 50, max_length=31)
    assert len(slug) <= 31
    assert not slug.endswith("alph")


def test_legacy_category_typo_maps_to_canonical_slug():
    assert canonical_category_slug("air-freshner") == "air-freshener"

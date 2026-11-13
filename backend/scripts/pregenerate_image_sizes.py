"""Pre-build the phone/tablet image sizes at deploy time, so the first visitors don't wait for resizing.

Writes into IMAGE_CACHE_DIR using the same file names server.resized_image_response() looks for.
Usage: python scripts/pregenerate_image_sizes.py /app/frontend/build
"""
import hashlib
import io
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

PRODUCT_WIDTHS = (320, 480, 640, 800, 1200)
BANNER_WIDTHS = (640, 800, 1200, 1600)
CACHE_DIR = Path(os.environ.get("IMAGE_CACHE_DIR", "/tmp/p2d-image-cache"))


def make(build_dir: Path, path: Path) -> int:
    rel = path.relative_to(build_dir).as_posix()
    webp = path.with_suffix(".webp")
    source = webp if webp.is_file() else path
    with Image.open(source) as im:
        im.load()
        banner = im.width > im.height * 1.3
        base = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA") else im.convert("RGB")
    made = 0
    for width in BANNER_WIDTHS if banner else PRODUCT_WIDTHS:
        out = CACHE_DIR / f"{hashlib.sha256(f'uploads:{rel}'.encode()).hexdigest()}-{width}.webp"
        if out.is_file():
            continue
        img = base.resize((width, max(1, round(base.height * width / base.width))), Image.LANCZOS) if base.width > width else base
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=80, method=4)
        out.write_bytes(buf.getvalue())
        made += 1
    return made


def main() -> None:
    build_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "/app/frontend/build").resolve()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    files = [p for p in (build_dir / "uploads").rglob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg")]
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
        total = sum(pool.map(lambda p: make(build_dir, p), files))
    print(f"Pre-built {total} image sizes for {len(files)} images in {CACHE_DIR}")


if __name__ == "__main__":
    main()

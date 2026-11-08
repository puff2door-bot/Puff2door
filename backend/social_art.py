"""Daily Instagram artwork for HD Smoke Shop, drawn with Pillow (no paid image API).

Every post is 1080x1350 (Instagram's 4:5 portrait). Product posts use the shop's own
product photos: the white studio background is cut away so the item sits directly on
the artwork. House rules baked in: no prices, no people, no smoking imagery, and every
image carries a 21+ badge.
"""
from __future__ import annotations

import io
import math
import random
from pathlib import Path
from typing import Iterable, Optional, Sequence

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H = 1080, 1350
FONT_DIR = Path(__file__).resolve().parent / "fonts"

# (background stops..., accent, ink-on-accent). Bright, saturated sets so posts pop in the feed.
PALETTES = (
    {"name": "Miami Sunset", "bg": ((255, 94, 98), (255, 153, 102), (255, 214, 102)), "accent": (35, 12, 51), "pop": (255, 255, 255)},
    {"name": "Electric Lime", "bg": ((10, 10, 10), (20, 30, 18), (12, 12, 12)), "accent": (196, 255, 44), "pop": (196, 255, 44)},
    {"name": "Grape Soda", "bg": ((76, 29, 149), (147, 51, 234), (236, 72, 153)), "accent": (253, 224, 71), "pop": (255, 255, 255)},
    {"name": "Ice Blue", "bg": ((14, 165, 233), (56, 189, 248), (186, 230, 253)), "accent": (12, 24, 64), "pop": (255, 255, 255)},
    {"name": "Hot Pink Pop", "bg": ((255, 0, 128), (255, 77, 166), (255, 153, 204)), "accent": (17, 17, 17), "pop": (255, 240, 0)},
    {"name": "Emerald Night", "bg": ((2, 44, 34), (6, 95, 70), (4, 120, 87)), "accent": (110, 231, 183), "pop": (255, 255, 255)},
    {"name": "Tangerine", "bg": ((255, 120, 0), (255, 165, 0), (255, 200, 60)), "accent": (40, 20, 0), "pop": (255, 255, 255)},
    {"name": "Midnight Neon", "bg": ((8, 8, 30), (20, 12, 60), (40, 10, 70)), "accent": (0, 240, 255), "pop": (255, 0, 200)},
    {"name": "Cherry Cola", "bg": ((120, 0, 20), (190, 18, 60), (244, 63, 94)), "accent": (255, 228, 230), "pop": (255, 255, 255)},
    {"name": "Mint Fresh", "bg": ((167, 243, 208), (110, 231, 183), (52, 211, 153)), "accent": (6, 45, 30), "pop": (6, 45, 30)},
)

LAYOUTS = ("poster", "grid", "neon", "magazine", "split", "polaroid", "stack")


# ---------- fonts ----------
def font(name: str, size: int):
    files = {
        "black": "InterDisplay-Black.otf",
        "black-italic": "InterDisplay-BlackItalic.otf",
        "bold": "InterDisplay-Bold.otf",
        "poppins": "Poppins-Bold.ttf",
        "poppins-medium": "Poppins-Medium.ttf",
    }
    for path in (FONT_DIR / files.get(name, files["bold"]), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")):
        try:
            return ImageFont.truetype(str(path), size=size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def text_size(draw: ImageDraw.ImageDraw, text: str, f) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=f)
    return box[2] - box[0], box[3] - box[1]


def fit_font(draw, text: str, name: str, max_w: int, start: int, minimum: int = 28):
    size = start
    while size > minimum:
        f = font(name, size)
        if text_size(draw, text, f)[0] <= max_w:
            return f
        size -= 4
    return font(name, minimum)


def wrap_lines(draw, text: str, f, max_w: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        trial = f"{line} {word}".strip()
        if text_size(draw, trial, f)[0] <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


# ---------- backgrounds and effects ----------
def gradient(colors: Sequence[tuple], angle: float = 35.0, size=(W, H)) -> Image.Image:
    """Multi-stop linear gradient at an angle."""
    w, h = size
    small = (max(2, w // 8), max(2, h // 8))
    grad = Image.new("RGB", small)
    px = grad.load()
    rad = math.radians(angle)
    dx, dy = math.cos(rad), math.sin(rad)
    span = abs(small[0] * dx) + abs(small[1] * dy)
    stops = len(colors) - 1
    for y in range(small[1]):
        for x in range(small[0]):
            t = ((x * dx + y * dy) + (small[1] * abs(dy) if dy < 0 else 0)) / span
            t = min(max(t, 0.0), 1.0) * stops
            i = min(int(t), stops - 1)
            f = t - i
            a, b = colors[i], colors[i + 1]
            px[x, y] = tuple(int(a[k] + (b[k] - a[k]) * f) for k in range(3))
    return grad.resize(size, Image.BICUBIC)


def add_grain(img: Image.Image, amount: int = 10, seed: int = 0) -> Image.Image:
    rng = random.Random(seed)
    noise = Image.effect_noise((W // 2, H // 2), 40).resize((W, H)).convert("L")
    noise = noise.point(lambda v: 128 + (v - 128) * amount // 40)
    layer = Image.merge("RGB", (noise, noise, noise))
    blended = ImageChops.overlay(img.convert("RGB"), layer)
    return Image.blend(img.convert("RGB"), blended, 0.35 + rng.random() * 0.1)


def glow(base: Image.Image, mask: Image.Image, color: tuple, radius: int = 22, strength: float = 1.0) -> None:
    """Paint a soft colored glow under a mask (in place)."""
    blurred = mask.filter(ImageFilter.GaussianBlur(radius))
    if strength != 1.0:
        blurred = blurred.point(lambda v: min(255, int(v * strength)))
    base.paste(Image.new("RGB", base.size, color), (0, 0), blurred)


def shadow_paste(base: Image.Image, item: Image.Image, xy: tuple[int, int], blur: int = 28, offset=(0, 26), opacity: int = 150) -> None:
    alpha = item.split()[-1]
    sh = Image.new("RGBA", item.size, (0, 0, 0, 0))
    sh.putalpha(alpha.point(lambda v: v * opacity // 255))
    pad = blur * 3
    canvas = Image.new("RGBA", (item.width + pad * 2, item.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(sh, (pad, pad), sh)
    canvas = canvas.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(canvas, (xy[0] - pad + offset[0], xy[1] - pad + offset[1]))
    base.alpha_composite(item, xy)


# ---------- product cut-outs ----------
def cutout(photo: Image.Image, max_side: int) -> Image.Image:
    """Remove the white studio background around a product photo and trim to the item."""
    rgb = photo.convert("RGB")
    rgb.thumbnail((900, 900), Image.LANCZOS)
    w, h = rgb.size
    flood = rgb.copy()
    marker = (1, 254, 3)
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)):
        r, g, b = flood.getpixel(seed)
        if min(r, g, b) > 215:
            ImageDraw.floodfill(flood, seed, marker, thresh=38)
    diff = ImageChops.difference(flood, Image.new("RGB", flood.size, marker)).convert("L")
    mask = diff.point(lambda v: 0 if v < 6 else 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = rgb.convert("RGBA")
    out.putalpha(mask)
    box = mask.point(lambda v: 255 if v > 40 else 0).getbbox()
    if box:
        out = out.crop(box)
    out.thumbnail((max_side, max_side), Image.LANCZOS)
    return out


def card(photo: Image.Image, w: int, h: int, radius: int = 34, fill=(255, 255, 255)) -> Image.Image:
    """Product photo on a rounded white card (used when a cut-out would look odd)."""
    rgb = photo.convert("RGB")
    c = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    c.paste(Image.new("RGBA", (w, h), (*fill, 255)), (0, 0), mask)
    inner = rgb.copy()
    inner.thumbnail((w - 36, h - 36), Image.LANCZOS)
    c.paste(inner, ((w - inner.width) // 2, (h - inner.height) // 2))
    c.putalpha(mask)
    return c


# ---------- shared pieces ----------
def footer(img: Image.Image, pal: dict, dark_text: Optional[bool] = None) -> None:
    d = ImageDraw.Draw(img)
    light_bg = sum(pal["bg"][-1]) > 520 if dark_text is None else dark_text
    ink = (17, 17, 17) if light_bg else (255, 255, 255)
    d.text((64, H - 112), "HD SMOKE SHOP", font=font("black", 40), fill=ink)
    d.text((64, H - 64), "ALTAMONTE SPRINGS  ·  OPEN DAILY 10AM–10PM", font=font("poppins-medium", 22), fill=ink)
    badge = font("black", 34)
    bw = text_size(d, "21+", badge)[0] + 56
    x0, y0 = W - 64 - bw, H - 116
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + 70), radius=35, fill=ink)
    d.text((x0 + 28, y0 + 13), "21+", font=badge, fill=(17, 17, 17) if not light_bg else (255, 255, 255))


def kicker(d: ImageDraw.ImageDraw, xy, text: str, fg, bg) -> int:
    f = font("poppins", 26)
    tw, th = text_size(d, text, f)
    x, y = xy
    d.rounded_rectangle((x, y, x + tw + 44, y + 54), radius=27, fill=bg)
    d.text((x + 22, y + 9), text, font=f, fill=fg)
    return y + 54


# ---------- layouts ----------
def layout_poster(title: str, sub: str, kick: str, products: list, pal: dict, seed: int) -> Image.Image:
    img = gradient(pal["bg"], 60 + seed % 40).convert("RGBA")
    d = ImageDraw.Draw(img)
    # giant outlined word behind the products
    word = title.split()[0].upper()
    f = fit_font(d, word, "black", W - 80, 300)
    tw, th = text_size(d, word, f)
    d.text(((W - tw) // 2, 420), word, font=f, fill=None, stroke_width=4, stroke_fill=(*pal["pop"], 150))
    d.text(((W - tw) // 2, 430 + th), word, font=f, fill=(*pal["accent"], 45))
    kicker(d, (64, 64), kick, (255, 255, 255) if sum(pal["accent"]) < 300 else (17, 17, 17), pal["accent"])
    tf = fit_font(d, title.upper(), "black", W - 128, 104)
    y = 150
    for line in wrap_lines(d, title.upper(), tf, W - 128)[:2]:
        d.text((64, y), line, font=tf, fill=pal["pop"])
        y += tf.size + 4
    d.text((66, y + 10), sub, font=font("poppins-medium", 30), fill=pal["pop"])
    cuts = [cutout(p, 500) for p in products[:3]]
    # (angle in degrees, centre x, bottom y, scale): two angled side items, a bigger centre item in front
    spots = [(7, 230, 1150, 0.78), (-7, 850, 1150, 0.78), (0, 540, 1190, 1.0)]
    for i, c in enumerate(cuts if len(cuts) == 3 else cuts):
        ang, cx, bottom, scale = spots[i] if len(cuts) == 3 else (0, 540, 1190, 1.0)
        c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
        c = c.rotate(ang, resample=Image.BICUBIC, expand=True)
        shadow_paste(img, c, (cx - c.width // 2, bottom - c.height))
    footer(img, pal)
    return img


def layout_grid(title: str, sub: str, kick: str, products: list, pal: dict, seed: int) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*pal["bg"][0], 255))
    img.alpha_composite(gradient(pal["bg"], 120).convert("RGBA"))
    d = ImageDraw.Draw(img)
    kicker(d, (64, 64), kick, (17, 17, 17), pal["pop"] if sum(pal["pop"]) > 400 else (255, 255, 255))
    tf = fit_font(d, title.upper(), "black-italic", W - 128, 96)
    d.text((64, 140), title.upper(), font=tf, fill=pal["pop"])
    d.text((66, 150 + tf.size), sub, font=font("poppins-medium", 28), fill=pal["pop"])
    tiles = products[:4]
    gw, gh, gap = 456, 410, 40
    x0, y0 = (W - (gw * 2 + gap)) // 2, 330
    rng = random.Random(seed)
    for i, p in enumerate(tiles):
        tile = Image.new("RGBA", (gw, gh), (0, 0, 0, 0))
        m = Image.new("L", (gw, gh), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, gw - 1, gh - 1), radius=38, fill=255)
        tint = tuple(min(255, v + 200) if sum(pal["bg"][1]) < 300 else 255 for v in pal["bg"][1])
        tile.paste(Image.new("RGBA", (gw, gh), (*tint, 255)), (0, 0), m)
        c = cutout(p, 360)
        tile.alpha_composite(c, ((gw - c.width) // 2, (gh - c.height) // 2))
        tile.putalpha(ImageChops.multiply(tile.split()[-1], m))
        ang = rng.uniform(-3.5, 3.5)
        tile = tile.rotate(ang, resample=Image.BICUBIC, expand=True)
        shadow_paste(img, tile, (x0 + (i % 2) * (gw + gap) - 10, y0 + (i // 2) * (gh + gap) - 10), blur=22, offset=(0, 18), opacity=110)
    footer(img, pal)
    return img


def layout_neon(title: str, sub: str, kick: str, products: list, pal: dict, seed: int) -> Image.Image:
    base = gradient(((6, 6, 18), (16, 10, 40), (6, 6, 18)), 90).convert("RGBA")
    d = ImageDraw.Draw(base)
    for x in range(0, W, 60):  # perspective floor grid
        d.line((W // 2 + (x - W // 2) * 0.25, 900, x, H), fill=(*pal["accent"], 40), width=2)
    for i in range(9):
        y = 900 + int((i / 8) ** 1.8 * (H - 900))
        d.line((0, y, W, y), fill=(*pal["accent"], 45), width=2)
    word = title.upper()
    f = fit_font(d, word, "black-italic", W - 120, 150)
    lines = wrap_lines(d, word, f, W - 120)[:2]
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    y = 120
    for line in lines:
        tw = text_size(md, line, f)[0]
        md.text(((W - tw) // 2, y), line, font=f, fill=255)
        y += f.size + 10
    glow(base, mask, pal["pop"], radius=28, strength=1.6)
    glow(base, mask, pal["accent"], radius=10, strength=1.2)
    base.paste(Image.new("RGB", (W, H), (255, 255, 255)), (0, 0), mask)
    sf = font("poppins-medium", 30)
    sw = text_size(d, sub, sf)[0]
    d.text(((W - sw) // 2, y + 18), sub, font=sf, fill=(*pal["accent"], 255))
    if products:
        hero = cutout(products[0], 640)
        ring = Image.new("L", (W, H), 0)
        ImageDraw.Draw(ring).ellipse((W // 2 - 330, 560, W // 2 + 330, 1220), outline=255, width=14)
        glow(base, ring, pal["accent"], radius=24, strength=1.5)
        base.paste(Image.new("RGB", (W, H), pal["accent"]), (0, 0), ring)
        shadow_paste(base, hero, ((W - hero.width) // 2, 890 - hero.height // 2), blur=30, offset=(0, 30), opacity=200)
    kicker(d, ((W - 380) // 2, 40), kick, (6, 6, 18), pal["accent"])
    footer(base, pal, dark_text=False)
    return base


def layout_magazine(title: str, sub: str, kick: str, products: list, pal: dict, seed: int) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*pal["bg"][1], 255))
    img.alpha_composite(gradient(pal["bg"], 100).convert("RGBA"))
    d = ImageDraw.Draw(img)
    ink = (17, 17, 17) if sum(pal["bg"][1]) > 450 else (255, 255, 255)
    mast = font("black", 250)
    d.text((44, 10), "HD", font=mast, fill=(*ink, 255))
    d.text((W - 360, 60), "THE SHELF\nISSUE", font=font("poppins", 40), fill=ink, spacing=4)
    if products:
        hero = cutout(products[0], 700)
        hero.thumbnail((470, 760), Image.LANCZOS)
        shadow_paste(img, hero, (W - 64 - hero.width, 1190 - hero.height), blur=34, offset=(0, 34), opacity=170)
    tf = font("black", 74)
    y = 360
    for line in wrap_lines(d, title.upper(), tf, 440)[:3]:
        d.text((64, y), line, font=tf, stroke_width=2, stroke_fill=ink if ink == (255, 255, 255) else (255, 255, 255), fill=pal["pop"] if ink == (255, 255, 255) else (17, 17, 17))
        y += tf.size + 2
    lf = font("poppins", 28)
    for i, line in enumerate(wrap_lines(d, sub, lf, 420)[:3]):
        d.text((66, y + 20 + i * 38), line, font=lf, fill=ink)
    kicker(d, (64, y + 160), kick, (17, 17, 17) if ink == (255, 255, 255) else (255, 255, 255), ink)
    footer(img, pal)
    return img


def layout_split(title: str, sub: str, kick: str, products: list, pal: dict, seed: int) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*pal["bg"][0], 255))
    d = ImageDraw.Draw(img)
    d.polygon([(0, 0), (W, 0), (W, 520), (0, 760)], fill=(*pal["bg"][2], 255))
    d.polygon([(0, 760), (W, 520), (W, 560), (0, 800)], fill=(*pal["accent"], 255))
    ink_top = (17, 17, 17) if sum(pal["bg"][2]) > 450 else (255, 255, 255)
    kicker(d, (64, 64), kick, (255, 255, 255) if ink_top == (17, 17, 17) else (17, 17, 17), ink_top)
    tf = fit_font(d, title.upper(), "black", W - 128, 130)
    y = 150
    for line in wrap_lines(d, title.upper(), tf, W - 128)[:2]:
        d.text((64, y), line, font=tf, fill=ink_top)
        y += tf.size
    d.text((66, y + 14), sub, font=font("poppins-medium", 30), fill=ink_top)
    cuts = [cutout(p, 440) for p in products[:3]]
    xs = [70, 380, 690][: len(cuts)]
    for x, c in zip(xs, cuts):
        shadow_paste(img, c, (x + (320 - c.width) // 2, 1150 - c.height - 20), blur=24, offset=(0, 22), opacity=160)
    footer(img, pal, dark_text=sum(pal["bg"][0]) > 450)
    return img


def layout_polaroid(title: str, sub: str, kick: str, products: list, pal: dict, seed: int) -> Image.Image:
    img = gradient(pal["bg"], 20 + seed % 60).convert("RGBA")
    d = ImageDraw.Draw(img)
    rng = random.Random(seed)
    spots = [(70, 330, -8), (560, 300, 7), (300, 700, -3)]
    for (x, y, ang), p in zip(spots, products[:3]):
        pw, ph = 420, 500
        frame = Image.new("RGBA", (pw, ph), (255, 255, 255, 255))
        inner = Image.new("RGB", (pw - 44, ph - 120), (245, 245, 245))
        c = cutout(p, 340)
        inner.paste(c, ((inner.width - c.width) // 2, (inner.height - c.height) // 2), c)
        frame.paste(inner, (22, 22))
        fd = ImageDraw.Draw(frame)
        label = (getattr(p, "info", {}) or {}).get("brand", "")
        if label:
            lf = fit_font(fd, label, "poppins", pw - 60, 34)
            lw = text_size(fd, label, lf)[0]
            fd.text(((pw - lw) // 2, ph - 82), label, font=lf, fill=(30, 30, 30))
        frame = frame.rotate(ang + rng.uniform(-1.5, 1.5), resample=Image.BICUBIC, expand=True)
        shadow_paste(img, frame, (x, y), blur=20, offset=(6, 18), opacity=120)
    kicker(d, (64, 64), kick, (255, 255, 255) if sum(pal["accent"]) < 300 else (17, 17, 17), pal["accent"])
    tf = fit_font(d, title.upper(), "black-italic", W - 128, 100)
    d.text((64, 140), title.upper(), font=tf, fill=pal["pop"], stroke_width=3, stroke_fill=pal["accent"])
    footer(img, pal)
    return img


def layout_stack(title: str, sub: str, kick: str, products: list, pal: dict, seed: int) -> Image.Image:
    """Typographic info post (no products): big stacked words with a colored band."""
    img = gradient(pal["bg"], 45 + seed % 90).convert("RGBA")
    d = ImageDraw.Draw(img)
    ink = (17, 17, 17) if sum(pal["bg"][1]) > 450 else (255, 255, 255)
    kicker(d, (64, 64), kick, (255, 255, 255) if ink == (17, 17, 17) else (17, 17, 17), ink)
    y = 170
    words = title.upper().split()[:4]
    cap = max(120, min(260, int(800 / max(1, len(words)) / 0.98)))
    for i, word in enumerate(words):
        f = fit_font(d, word, "black" if i % 2 == 0 else "black-italic", W - 128, cap)
        style = {"fill": ink} if i % 2 == 0 else {"fill": None, "stroke_width": 4, "stroke_fill": ink}
        d.text((60, y), word, font=f, **style)
        y += int(f.size * 0.98)
    band_y = min(y + 30, 1000)
    d.rectangle((0, band_y, W, band_y + 120), fill=pal["accent"])
    sf = fit_font(d, sub, "poppins", W - 128, 40)
    d.text((64, band_y + (120 - sf.size) // 2 - 4), sub, font=sf, fill=(255, 255, 255) if sum(pal["accent"]) < 300 else (17, 17, 17))
    footer(img, pal)
    return img


LAYOUT_FUNCS = {
    "poster": layout_poster, "grid": layout_grid, "neon": layout_neon, "magazine": layout_magazine,
    "split": layout_split, "polaroid": layout_polaroid, "stack": layout_stack,
}


def render_post(layout: str, palette_index: int, title: str, sub: str, kick: str,
                product_photos: Iterable[Image.Image] = (), seed: int = 0) -> bytes:
    pal = PALETTES[palette_index % len(PALETTES)]
    products = list(product_photos)
    if layout != "stack" and not products:
        layout = "stack"
    img = LAYOUT_FUNCS[layout](title, sub, kick, products, pal, seed)
    img = add_grain(img.convert("RGB"), amount=8, seed=seed)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=90, optimize=True, progressive=True)
    return out.getvalue()

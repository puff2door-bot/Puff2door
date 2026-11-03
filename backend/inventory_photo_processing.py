"""CPU segmentation for private inventory references (U2NETP via ONNX Runtime)."""
import io
import os
import threading
import warnings
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError

# Every saved reference uses one square. The item's long side always fills the
# same inner box, leaving an equal pure-white frame on every side.
CANVAS_SIZE = 1600
FRAME_PADDING = 40  # thin even margin so the item fills ~95% of the photo
CONTENT_MAX = CANVAS_SIZE - (FRAME_PADDING * 2)
WHITE = (255, 255, 255)
# Mask values at or below this are leftover background and are discarded.
ALPHA_CUTOFF = 20
LOAD_MAX = 2600
# Tilt correction: largest angle tried, and the smallest tilt worth fixing.
MAX_TILT = 15.0
MIN_TILT = 0.75

_session = None
_lock = threading.Lock()
MODEL_PATH = Path(os.environ.get('INVENTORY_PHOTO_MODEL', str(Path(__file__).parent / 'models' / 'u2netp.onnx')))


class ProcessingUnavailable(Exception):
    pass


def load_photo(raw):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise ValueError('Use JPEG, PNG or WebP. Convert HEIC photos to JPEG first.')
                if source.width * source.height > 24_000_000:
                    raise ValueError('Use a photo of 24 megapixels or smaller.')
                if getattr(source, 'is_animated', False):
                    raise ValueError('Choose a still photo.')
                # Decode at up to 3000px: the item is usually a fraction of the frame, and cropping
                # it from a 1600px photo then enlarging it made the saved picture soft.
                source.draft('RGB', (LOAD_MAX, LOAD_MAX))
                source.thumbnail((LOAD_MAX, LOAD_MAX), Image.Resampling.LANCZOS)
                ImageOps.exif_transpose(source, in_place=True)
                return source.convert('RGBA')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('This photo cannot be read safely. Choose another JPEG, PNG or WebP.') from exc


def validate_photo(raw):
    photo = load_photo(raw)
    side = max(photo.size)
    canvas = Image.new('RGB', (side, side), 'white')
    canvas.paste(photo, ((side-photo.width)//2, (side-photo.height)//2), photo)
    output = io.BytesIO(); canvas.save(output, 'WEBP', quality=95, method=4)
    return output.getvalue(), 'image/webp', side


def remove_background(image):
    global _session
    with _lock:
        try:
            import numpy as np
            import onnxruntime as ort
            if _session is None:
                options = ort.SessionOptions()
                options.intra_op_num_threads = 1
                options.inter_op_num_threads = 1
                options.enable_cpu_mem_arena = False
                _session = ort.InferenceSession(str(MODEL_PATH), sess_options=options, providers=['CPUExecutionProvider'])
            # U2NETP preprocessing follows the model's rembg reference implementation.
            pixels = np.asarray(image.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
            pixels /= max(float(pixels.max()), 1e-6)
            pixels = (pixels - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
            tensor = np.transpose(pixels, (2, 0, 1))[None].astype(np.float32)
            prediction = _session.run([_session.get_outputs()[0].name], {_session.get_inputs()[0].name: tensor})[0][0, 0]
            span = float(prediction.max() - prediction.min())
            if span <= 1e-6:
                raise ValueError('No clear item was detected. Retake the photo with even lighting.')
            mask = Image.fromarray(((prediction - prediction.min()) / span * 255).astype('uint8')).resize(image.size, Image.Resampling.LANCZOS)
            result = image.copy()
            # Respect any transparency already present in a supplied image.
            from PIL import ImageChops
            result.putalpha(ImageChops.multiply(mask, image.getchannel('A')))
            return result
        except ValueError:
            raise
        except Exception as exc:
            raise ProcessingUnavailable('Background removal is unavailable. Your photo has not been saved. Please try again later.') from exc


def _discard_background(cutout):
    """Drop faint mask residue so the original backdrop cannot show through."""
    image = cutout.convert('RGBA')
    alpha = image.getchannel('A').point(lambda value: 0 if value <= ALPHA_CUTOFF else value)
    image.putalpha(alpha)
    return image


def _scale_long_side(subject, target):
    long_side = max(subject.size)
    if long_side == target:
        return subject
    scaled = [max(1, round(value * target / long_side)) for value in subject.size]
    long_index = 0 if subject.width >= subject.height else 1
    scaled[long_index] = target
    scaled[1 - long_index] = min(target, scaled[1 - long_index])
    return subject.resize(tuple(scaled), Image.Resampling.LANCZOS)


def _paint_white_frame(canvas):
    """Keep the same pure #FFFFFF margin on every saved photo."""
    width, height = canvas.size
    horizontal = Image.new('RGB', (width, FRAME_PADDING), WHITE)
    vertical = Image.new('RGB', (FRAME_PADDING, height), WHITE)
    canvas.paste(horizontal, (0, 0))
    canvas.paste(horizontal, (0, height - FRAME_PADDING))
    canvas.paste(vertical, (0, 0))
    canvas.paste(vertical, (width - FRAME_PADDING, 0))


# A cut-out that keeps less than this share of the photo lost the item, not just the
# background. Then the whole photo is used instead of a blank white square.
MIN_SUBJECT_SHARE = 0.02


def _is_prepared(image):
    """True for a photo this module already produced: a 1600 square with a pure-white frame.
    The save step receives the approved preview, so it must not be cut out a second time."""
    if image.size != (CANVAS_SIZE, CANVAS_SIZE):
        return False
    rgb = image.convert('RGB')
    edge = FRAME_PADDING - 8
    for box in ((0, 0, CANVAS_SIZE, edge), (0, CANVAS_SIZE - edge, CANVAS_SIZE, CANVAS_SIZE),
                (0, 0, edge, CANVAS_SIZE), (CANVAS_SIZE - edge, 0, CANVAS_SIZE, CANVAS_SIZE)):
        low, _high = zip(*rgb.crop(box).getextrema())
        if min(low) < 250:
            return False
    return True


def _subject_bounds(cutout):
    """Tight box around the item itself. Faint halo and stray specks left by the cut-out
    used to stretch the box, which shrank the item and left wide white margins.
    Worked out on a small copy of the mask so it stays fast on the hosting plan."""
    alpha = cutout.getchannel('A')
    scale = min(1.0, 700.0 / max(alpha.size))
    if scale < 1.0:
        alpha = alpha.resize((max(1, round(alpha.width * scale)), max(1, round(alpha.height * scale))), Image.Resampling.BILINEAR)
    solid = alpha.point(lambda value: 255 if value >= 128 else 0)
    core = solid.filter(ImageFilter.MinFilter(5)).getbbox() or solid.getbbox()
    if core is None:
        return None
    pad = 3
    left, top, right, bottom = (max(0, core[0] - pad), max(0, core[1] - pad),
                                min(solid.width, core[2] + pad), min(solid.height, core[3] + pad))
    width, height = cutout.size
    return (max(0, int(left / scale)), max(0, int(top / scale)),
            min(width, int(round(right / scale))), min(height, int(round(bottom / scale))))


def _harden_edges(cutout):
    """The mask is predicted at 320px and enlarged, so its edges are a soft blur.
    Steepen it so the item has a crisp outline instead of a fuzzy halo."""
    alpha = cutout.getchannel('A').point(lambda v: 0 if v < 70 else 255 if v > 185 else int((v - 70) * 255 / 115))
    alpha = alpha.filter(ImageFilter.MedianFilter(3))
    result = cutout.copy()
    result.putalpha(alpha)
    return result


def _tilt_angle(cutout):
    """Angle that makes the item stand straight: the rotation giving the smallest upright box.
    Round items look the same at every angle, so nothing is changed for them."""
    alpha = cutout.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    scale = 800.0 / max(alpha.size)
    small = alpha.resize((max(1, round(alpha.width * scale)), max(1, round(alpha.height * scale))), Image.Resampling.NEAREST)

    def area(angle):
        box = small.rotate(angle, resample=Image.Resampling.NEAREST, expand=True).getbbox()
        return (box[2] - box[0]) * (box[3] - box[1]) if box else 0

    base = area(0)
    if not base:
        return 0.0
    best_angle, best_area = 0.0, base
    angle = -MAX_TILT
    while angle <= MAX_TILT + 1e-9:
        value = area(angle)
        if value < best_area:
            best_angle, best_area = angle, value
        angle += 0.5
    coarse = best_angle
    for step in range(-4, 5):
        fine = coarse + step * 0.1
        value = area(fine)
        if value < best_area:
            best_angle, best_area = fine, value
    if abs(best_angle) < MIN_TILT or best_area > base * 0.98:
        return 0.0
    return best_angle


def _levels(channel_hist, total):
    """Black and white points for one channel from its histogram (0.5% / 99.5% of the item's pixels)."""
    low_target, high_target = total * 0.005, total * 0.995
    running, low, high = 0, 0, 255
    for value, count in enumerate(channel_hist):
        running += count
        if running <= low_target:
            low = value
        if running < high_target:
            high = value + 1
    return low, min(255, high)


def _enhance(subject):
    """Make phone photos look like studio shots: true whites, brighter, livelier color, crisp text.

    Only the item's own pixels are measured, so the white frame never skews it. Every
    correction is capped, so an already clean product image is barely changed."""
    alpha = subject.getchannel('A')
    rgb = subject.convert('RGB')
    mask = alpha.point(lambda value: 255 if value > 128 else 0)
    hist = rgb.histogram(mask=mask)
    total = sum(hist[0:256])
    if total < 500:
        return _sharpen(subject)
    luts = []
    for band in range(3):
        low, high = _levels(hist[band * 256:(band + 1) * 256], total)
        # Phone shots of white boxes come out gray or yellow; pull each channel's
        # brightest real pixels up to white, but never by more than 30%.
        high = max(high, 196, low + 64)
        low = min(low, 28)
        scale = 255.0 / (high - low)
        luts.extend(max(0, min(255, round((v - low) * scale))) for v in range(256))
    rgb = rgb.point(luts)
    # Lift mid-tones a little when the item is still on the dark side.
    gray_hist = rgb.convert('L').histogram(mask=mask)
    running, median = 0, 128
    for value, count in enumerate(gray_hist):
        running += count
        if running >= total / 2:
            median = value
            break
    if median < 170:
        gamma = 0.85 if median < 120 else 0.92
        rgb = rgb.point([round(255 * ((v / 255.0) ** gamma)) for v in range(256)] * 3)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
    rgb = ImageEnhance.Color(rgb).enhance(1.12)
    rgb.putalpha(alpha)
    return _sharpen(rgb)


def _sharpen(subject):
    """Crisp edges and readable box text after resizing: one broad pass, one fine detail pass."""
    alpha = subject.getchannel('A')
    rgb = subject.convert('RGB')
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=2.0, percent=130, threshold=3))
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.8, percent=70, threshold=2))
    rgb.putalpha(alpha)
    return rgb


def _encode(canvas):
    output = io.BytesIO()
    # Lossless so the white frame stays exact #FFFFFF instead of a compressed gray.
    canvas.save(output, 'WEBP', lossless=True, quality=100, method=4)
    return output.getvalue()


BOX_FILL = 0.90  # an item filling this much of its upright box is treated as a box


def _box_edges(alpha):
    """Clean edges for box-shaped items. The predicted outline is coarse (320px), so box sides
    came out wavy with background shadow along them. If the item is a box, return its rectangle
    (robust median of each side, trimmed slightly inside the shadow line); otherwise None."""
    scale = min(1.0, 800.0 / max(alpha.size))
    small = alpha if scale == 1.0 else alpha.resize(
        (max(1, round(alpha.width * scale)), max(1, round(alpha.height * scale))), Image.Resampling.BILINEAR)
    solid = small.point(lambda v: 255 if v >= 128 else 0)
    box = solid.getbbox()
    if not box:
        return None
    w, h = box[2] - box[0], box[3] - box[1]
    if w < 20 or h < 20:
        return None
    filled = solid.crop(box).histogram()[255] / float(w * h)
    if filled < BOX_FILL:
        return None
    import numpy as np
    m = np.asarray(solid) > 0
    rows = [r for r in range(box[1] + h // 10, box[3] - h // 10) if m[r].any()]
    cols = [c for c in range(box[0] + w // 10, box[2] - w // 10) if m[:, c].any()]
    if len(rows) < 5 or len(cols) < 5:
        return None
    left = float(np.median([np.argmax(m[r]) for r in rows]))
    right = float(np.median([m.shape[1] - np.argmax(m[r][::-1]) for r in rows]))
    top = float(np.median([np.argmax(m[:, c]) for c in cols]))
    bottom = float(np.median([m.shape[0] - np.argmax(m[:, c][::-1]) for c in cols]))
    inset = 0.010 * min(right - left, bottom - top)
    return tuple(v / scale for v in (left + inset, top + inset, right - inset, bottom - inset))


def _rectangle_mask(size, edges):
    """Rectangle with slightly rounded corners, like a real box; edges softened by one pixel.
    Drawn at the photo's own size: a supersampled copy ran the small server out of memory."""
    from PIL import ImageDraw
    mask = Image.new('L', size, 0)
    left, top, right, bottom = edges
    radius = 0.012 * min(right - left, bottom - top)
    ImageDraw.Draw(mask).rounded_rectangle((left, top, right - 1, bottom - 1), radius=radius, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(0.8))


QUAD_FILL = 0.93  # an item filling this much of its four-corner outline is a box


def _box_quad(cut_small):
    """Four corners of a box-shaped item (top-left, top-right, bottom-right, bottom-left) in the
    small copy's pixels, or None. A box shot slightly from the side shows as a tilted trapezoid;
    straightening it with these corners makes the print square like a scan."""
    import numpy as np
    solid = cut_small.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    # Opening removes stray specks so they can't pose as a corner.
    solid = solid.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    m = np.asarray(solid) > 0
    ys, xs = np.nonzero(m)
    if len(xs) < 500:
        return None
    s_sum, s_diff = xs + ys, xs - ys
    tl = (xs[s_sum.argmin()], ys[s_sum.argmin()])
    br = (xs[s_sum.argmax()], ys[s_sum.argmax()])
    tr = (xs[s_diff.argmax()], ys[s_diff.argmax()])
    bl = (xs[s_diff.argmin()], ys[s_diff.argmin()])
    quad = [tl, tr, br, bl]
    area = 0.0
    for i in range(4):
        x1, y1 = quad[i]
        x2, y2 = quad[(i + 1) % 4]
        area += x1 * y2 - x2 * y1
    area = abs(area) / 2.0
    if area <= 0:
        return None
    sides = [((quad[i][0] - quad[(i + 1) % 4][0]) ** 2 + (quad[i][1] - quad[(i + 1) % 4][1]) ** 2) ** 0.5 for i in range(4)]
    if min(sides) < 40:
        return None
    fill = len(xs) / area
    if fill < QUAD_FILL or fill > 1.06:
        return None
    return [(float(x), float(y)) for x, y in quad]


def _warp_quad(image, quad, scale):
    """Map the four corners onto an upright rectangle (perspective straightening)."""
    tl, tr, br, bl = [(x / scale, y / scale) for x, y in quad]
    dist = lambda a, b: ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
    width = (dist(tl, tr) + dist(bl, br)) / 2.0
    height = (dist(tl, bl) + dist(tr, br)) / 2.0
    shrink = min(1.0, CROP_MAX / max(width, height))
    size = (max(1, int(round(width * shrink))), max(1, int(round(height * shrink))))
    data = (tl[0], tl[1], bl[0], bl[1], br[0], br[1], tr[0], tr[1])
    warped = image.convert('RGB').transform(size, Image.Transform.QUAD, data, resample=Image.Resampling.BICUBIC)
    # Trim a sliver inside the edge so the background and shadow line never show.
    inset = int(round(min(size) * 0.012))
    if inset:
        warped = warped.crop((inset, inset, size[0] - inset, size[1] - inset))
    warped.putalpha(_rectangle_mask(warped.size, (0, 0, warped.width, warped.height)))
    return warped


WORK_SIZE = 1000
CROP_MAX = 2000


def _steepen(alpha):
    return alpha.point(lambda v: 0 if v < 70 else 255 if v > 185 else int((v - 70) * 255 / 115))


def prepare_inventory_photo(raw, validate_photo=None):
    image = load_photo(raw)
    if _is_prepared(image):
        return _encode(image.convert('RGB')), False
    # Find the item on a small copy (fast), then cut it from the full-resolution photo (sharp).
    factor = min(1.0, WORK_SIZE / float(max(image.size)))
    small = image if factor == 1.0 else image.resize(
        (max(1, round(image.width * factor)), max(1, round(image.height * factor))), Image.Resampling.LANCZOS)
    cut_small = _harden_edges(_discard_background(remove_background(small)))
    alpha_small = cut_small.getchannel('A').point(lambda value: 255 if value > 0 else 0)
    bounds_small = _subject_bounds(cut_small)
    kept = (alpha_small.histogram()[255] / float(alpha_small.width * alpha_small.height)) if bounds_small else 0.0
    if bounds_small is None or kept < MIN_SUBJECT_SHARE:
        # The cut-out removed the item itself. Keep the full photo rather than save a blank.
        subject = image.copy()
        subject.putalpha(255)
    elif (quad := _box_quad(cut_small)):
        subject = _warp_quad(image, quad, factor)
    else:
        angle = _tilt_angle(cut_small)
        # Room around the item so straightening never clips a corner.
        margin = int(max(bounds_small[2] - bounds_small[0], bounds_small[3] - bounds_small[1]) * 0.08) + 4
        region_small = (max(0, bounds_small[0] - margin), max(0, bounds_small[1] - margin),
                        min(small.width, bounds_small[2] + margin), min(small.height, bounds_small[3] + margin))
        region = tuple(int(round(v / factor)) for v in region_small)
        region = (region[0], region[1], min(image.width, region[2]), min(image.height, region[3]))
        subject = image.crop(region).convert('RGB')
        # The saved item is at most 1520px; more detail than ~2000px only costs memory.
        if max(subject.size) > CROP_MAX:
            subject.thumbnail((CROP_MAX, CROP_MAX), Image.Resampling.LANCZOS)
        mask = cut_small.getchannel('A').crop(region_small).resize(subject.size, Image.Resampling.BICUBIC)
        subject.putalpha(_steepen(mask))
        if angle:
            subject = subject.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(255, 255, 255, 0))
        edges = _box_edges(subject.getchannel('A'))
        if edges:
            subject.putalpha(_rectangle_mask(subject.size, edges))
            subject = subject.crop(tuple(int(round(v)) for v in edges))
        else:
            tight = _subject_bounds(subject)
            if tight:
                subject = subject.crop(tight)
    source_long_side = max(subject.size)
    subject = _enhance(_discard_background(_scale_long_side(subject, CONTENT_MAX)))
    canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), WHITE)
    canvas.paste(
        subject,
        ((CANVAS_SIZE - subject.width) // 2, (CANVAS_SIZE - subject.height) // 2),
        subject.getchannel('A'),
    )
    _paint_white_frame(canvas)
    return _encode(canvas), source_long_side < 640


def enhance_saved_photo(raw):
    """Brighten and sharpen a product photo that is already on a white background.

    Levels are measured on the item (everything that isn't near-white) and applied to the
    whole picture, so the background stays pure white and there is no seam at the edges.
    Returns lossless WebP bytes."""
    image = load_photo(raw)
    if image.mode == 'RGBA' and image.getchannel('A').getextrema()[0] < 255:
        flat = Image.new('RGB', image.size, WHITE)
        flat.paste(image, (0, 0), image.getchannel('A'))
    else:
        flat = image.convert('RGB')
    item = flat.convert('L').point(lambda value: 255 if value < 242 else 0)
    subject = flat.copy()
    subject.putalpha(item)
    result = _enhance(subject).convert('RGB')
    if result.size == (CANVAS_SIZE, CANVAS_SIZE):
        _paint_white_frame(result)
    # High-quality lossy keeps the file ~6x smaller than lossless; flat white stays white.
    output = io.BytesIO()
    result.save(output, 'WEBP', quality=90, method=6)
    return output.getvalue()

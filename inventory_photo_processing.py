"""CPU segmentation for private inventory references (U2NETP via ONNX Runtime)."""
import io
import os
import threading
import warnings
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

# Every saved reference uses one square. The item's long side always fills the
# same inner box, leaving an equal pure-white frame on every side.
CANVAS_SIZE = 1600
FRAME_PADDING = 160
CONTENT_MAX = CANVAS_SIZE - (FRAME_PADDING * 2)
WHITE = (255, 255, 255)
# Mask values at or below this are leftover background and are discarded.
ALPHA_CUTOFF = 20

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
                # Decode JPEGs at reduced resolution to fit the small hosting plan.
                source.draft('RGB', (1600, 1600))
                source.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
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


def prepare_inventory_photo(raw, validate_photo=None):
    image = load_photo(raw)
    cutout = _discard_background(remove_background(image))
    bounds = cutout.getchannel('A').point(lambda value: 255 if value > 0 else 0).getbbox()
    if bounds is None:
        raise ValueError('No clear item was found. Retake the photo with one item and even lighting.')
    subject = cutout.crop(bounds)
    source_long_side = max(subject.size)
    subject = _discard_background(_scale_long_side(subject, CONTENT_MAX))
    canvas = Image.new('RGB', (CANVAS_SIZE, CANVAS_SIZE), WHITE)
    canvas.paste(
        subject,
        ((CANVAS_SIZE - subject.width) // 2, (CANVAS_SIZE - subject.height) // 2),
        subject.getchannel('A'),
    )
    _paint_white_frame(canvas)
    output = io.BytesIO()
    # Lossless so the white frame stays exact #FFFFFF instead of a compressed gray.
    canvas.save(output, 'WEBP', lossless=True, quality=100, method=4)
    return output.getvalue(), source_long_side < 640

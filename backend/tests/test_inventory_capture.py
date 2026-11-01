"""Admin photo preparation, access controls and private persistence."""
import csv
import io
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI, Header, HTTPException
from mongomock_motor import AsyncMongoMockClient
from PIL import Image, ImageChops, ImageDraw
from pymongo.errors import DuplicateKeyError

_HERE = Path(__file__).resolve().parent
_MODULE_ROOT = _HERE.parents[0] if (_HERE.parents[0] / "inventory_capture.py").exists() else _HERE
sys.path.insert(0, str(_MODULE_ROOT))
from inventory_capture import create_inventory_capture_router, ensure_inventory_indexes
import inventory_photo_processing as processing

WHITE = (255, 255, 255)
CANVAS = processing.CANVAS_SIZE
FRAME = processing.FRAME_PADDING

class Bucket:
    def __init__(self): self.files = {}
    async def upload_from_stream(self, name, data, **kwargs): self.files[name] = data; return name
    async def delete(self, name): self.files.pop(name)
    async def open_download_stream(self, name):
        data = self.files[name]
        class Stream:
            async def read(self): return data
        return Stream()

@pytest.mark.asyncio
async def test_prepare_review_save_and_auth(monkeypatch):
    db = AsyncMongoMockClient().inventory_test
    bucket = Bucket()
    async def admin(x_admin: str = Header(default='')):
        if x_admin != 'yes': raise HTTPException(403)
        return {'id': 'owner'}
    def segment(image):
        output = Image.new('RGBA', image.size)
        output.paste((200, 20, 30, 255), (20, 30, 80, 170))
        return output
    monkeypatch.setattr(processing, 'remove_background', segment)
    app = FastAPI()
    app.include_router(create_inventory_capture_router(db, bucket, admin, processing.validate_photo), prefix='/api/admin')
    base = '/api/admin/inventory-captures'
    raw = io.BytesIO(); Image.new('RGB', (100, 200), 'blue').save(raw, 'PNG')
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        denied = await client.post(base+'/prepare', files={'file': ('test.png', raw.getvalue())})
        assert denied.status_code == 403
        client.headers['X-Admin'] = 'yes'
        preview = await client.post(base+'/prepare', files={'file': ('test.png', raw.getvalue())})
        assert preview.status_code == 200
        photo = Image.open(io.BytesIO(preview.content)).convert('RGB')
        assert photo.size == (1600, 1600)
        assert all(c > 245 for c in photo.getpixel((0, 0)))
        bounds = ImageChops.difference(photo, Image.new('RGB', photo.size, 'white')).convert('L').point(lambda v: 255 if v > 20 else 0).getbbox()
        assert abs(bounds[0] - (1600-bounds[2])) < 5
        assert abs(bounds[1] - (1600-bounds[3])) < 5
        assert await db.inventory_captures.count_documents({}) == 0
        saved = await client.post(base, files={'file': ('prepared.webp', preview.content)}, data={'identifier': '001234', 'label': 'Reference'})
        assert saved.status_code == 200
        assert saved.json()['identifier'] == '001234'
        path = base+'/'+saved.json()['id']+'/photo'
        assert (await client.get(path)).headers['cache-control'] == 'no-store'
        assert (await client.get(path, headers={'X-Admin': ''})).status_code == 403
        assert (await client.get(base)).json()['captures'][0]['id'] == saved.json()['id']
        assert await db.products.count_documents({}) == 0
        invalid = await client.post(base+'/prepare', files={'file': ('bad.jpg', b'not an image')})
        assert invalid.status_code == 422
        def unavailable(image): raise processing.ProcessingUnavailable('Unavailable')
        monkeypatch.setattr(processing, 'remove_background', unavailable)
        failed = await client.post(base+'/prepare', files={'file': ('test.png', raw.getvalue())})
        assert failed.status_code == 503
        assert await db.inventory_captures.count_documents({}) == 1


def test_empty_mask_rejected(monkeypatch):
    monkeypatch.setattr(processing, 'remove_background', lambda image: Image.new('RGBA', image.size))
    raw = io.BytesIO(); Image.new('RGB', (100, 100), 'white').save(raw, 'PNG')
    with pytest.raises(ValueError, match='No clear item'):
        processing.prepare_inventory_photo(raw.getvalue())


def _png(size, color):
    raw = io.BytesIO()
    Image.new('RGB', size, color).save(raw, 'PNG')
    return raw.getvalue()


def _segment_rect(box, color=(180, 30, 40)):
    def segment(image):
        # A faint full-frame tint must be discarded; only the solid item remains.
        output = Image.new('RGBA', image.size, (255, 0, 0, 8))
        output.paste((*color, 255), box)
        return output
    return segment


def _content_box(image):
    pixels = image.load()
    min_x, min_y, max_x, max_y = CANVAS, CANVAS, 0, 0
    found = False
    for y in range(CANVAS):
        for x in range(CANVAS):
            if pixels[x, y] != WHITE:
                found = True
                min_x, min_y = min(min_x, x), min(min_y, y)
                max_x, max_y = max(max_x, x + 1), max(max_y, y + 1)
    assert found, 'processed photo has no visible item'
    return min_x, min_y, max_x, max_y


def assert_uniform_white_square(image):
    assert image.size == (CANVAS, CANVAS)
    pixels = image.load()
    for y in range(FRAME):
        for x in range(CANVAS):
            assert pixels[x, y] == WHITE
            assert pixels[x, CANVAS - 1 - y] == WHITE
    for x in range(FRAME):
        for y in range(CANVAS):
            assert pixels[x, y] == WHITE
            assert pixels[CANVAS - 1 - x, y] == WHITE
    left, top, right, bottom = _content_box(image)
    width, height = right - left, bottom - top
    assert max(width, height) == pytest.approx(processing.CONTENT_MAX, abs=2)
    assert abs(left - (CANVAS - right)) <= 1
    assert abs(top - (CANVAS - bottom)) <= 1
    assert left >= FRAME - 1 and top >= FRAME - 1


def test_samples_share_white_background_centering_and_scale(monkeypatch):
    samples = [
        ((480, 320), (20, 160, 50), (20, 30, 110, 250)),
        ((640, 240), (30, 50, 170), (260, 20, 600, 140)),
        ((360, 520), (150, 40, 140), (40, 300, 200, 490)),
        ((220, 220), (90, 90, 90), (15, 40, 120, 180)),
    ]
    outputs = []
    for size, background, box in samples:
        monkeypatch.setattr(processing, 'remove_background', _segment_rect(box))
        raw = _png(size, background)
        data, _low = processing.prepare_inventory_photo(raw)
        image = Image.open(io.BytesIO(data)).convert('RGB')
        assert_uniform_white_square(image)
        pixels = image.load()
        assert pixels[0, 0] == WHITE
        assert background not in {pixels[x, y] for x in range(0, CANVAS, 80) for y in range(0, CANVAS, 80)}
        outputs.append(_content_box(image))
    long_sides = [max(right - left, bottom - top) for left, top, right, bottom in outputs]
    assert max(long_sides) - min(long_sides) <= 2


def test_item_position_does_not_change_the_saved_square(monkeypatch):
    raw = _png((500, 400), (10, 20, 30))
    monkeypatch.setattr(processing, 'remove_background', _segment_rect((10, 20, 80, 210)))
    first, _low = processing.prepare_inventory_photo(raw)
    monkeypatch.setattr(processing, 'remove_background', _segment_rect((300, 140, 370, 330)))
    second, _low = processing.prepare_inventory_photo(raw)
    assert first == second


@pytest.mark.asyncio
async def test_records_keep_leading_zeros_reject_duplicates_and_stay_private(monkeypatch):
    db = AsyncMongoMockClient().inventory_records
    bucket = Bucket()
    async def admin(x_admin: str = Header(default='')):
        if x_admin != 'yes':
            raise HTTPException(403)
        return {'id': 'owner'}
    monkeypatch.setattr(processing, 'remove_background', _segment_rect((30, 40, 120, 200)))
    app = FastAPI()
    app.include_router(create_inventory_capture_router(db, bucket, admin, processing.validate_photo), prefix='/api/admin')
    await ensure_inventory_indexes(db)
    raw = _png((240, 180), (0, 80, 20))
    barcode = '00012345678901'
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        client.headers['X-Admin'] = 'yes'
        saved = await client.post('/api/admin/inventory-captures', files={'file': ('item.png', raw)}, data={
            'identifier': barcode, 'name': 'Mint disposable', 'description': 'Cooling mint',
            'details': 'Display box', 'category': 'Disposables', 'cost': '4.50',
            'retailPrice': '12.00', 'quantity': '6', 'notes': 'Back room',
        })
        assert saved.status_code == 200, saved.text
        body = saved.json()
        assert isinstance(body['barcode'], str) and body['barcode'] == barcode
        assert isinstance(body['identifier'], str) and body['identifier'] == barcode
        assert body['retailPrice'] == '12.00'
        assert body['purpose'] == 'internal_inventory'
        assert 'blobId' not in body
        stored = await db.inventory_captures.find_one({'id': body['id']})
        assert isinstance(stored['barcode'], str) and stored['barcode'] == barcode
        assert await db.products.count_documents({}) == 0

        duplicate = await client.post('/api/admin/inventory-captures', files={'file': ('item.png', raw)}, data={'identifier': barcode})
        assert duplicate.status_code == 409
        detail = duplicate.json()['detail']
        assert detail['existingId'] == body['id']
        assert 'Edit the existing record' in detail['message']
        assert await db.inventory_captures.count_documents({}) == 1

        edited = await client.put(f"/api/admin/inventory-captures/{body['id']}", json={
            'name': 'Mint disposable 2pk', 'description': 'Updated copy', 'details': 'Counter display',
            'retailPrice': '14.50', 'barcode': barcode,
        })
        assert edited.status_code == 200
        assert edited.json()['name'] == 'Mint disposable 2pk'
        assert edited.json()['retailPrice'] == '14.50'
        assert edited.json()['description'] == 'Updated copy'
        assert edited.json()['details'] == 'Counter display'
        assert await db.products.count_documents({}) == 0

        numeric = await client.put(f"/api/admin/inventory-captures/{body['id']}", json={'barcode': 123})
        assert numeric.status_code == 422
        assert 'text' in numeric.json()['detail']
        assert (await db.inventory_captures.find_one({'id': body['id']}))['barcode'] == barcode

        other = await client.post('/api/admin/inventory-captures', files={'file': ('other.png', raw)}, data={'barcode': '00012345678902', 'name': 'Other'})
        assert other.status_code == 200
        clash = await client.put(f"/api/admin/inventory-captures/{other.json()['id']}", json={'barcode': barcode})
        assert clash.status_code == 409
        assert clash.json()['detail']['existingId'] == body['id']

        monkeypatch.setattr(processing, 'remove_background', _segment_rect((40, 20, 160, 90), (10, 20, 200)))
        replaced = await client.post(f"/api/admin/inventory-captures/{body['id']}/photo", files={'file': ('next.png', raw)})
        assert replaced.status_code == 200
        photo = Image.open(io.BytesIO((await client.get(f"/api/admin/inventory-captures/{body['id']}/photo")).content)).convert('RGB')
        assert_uniform_white_square(photo)
        assert await db.products.count_documents({}) == 0

        exported = await client.get('/api/admin/inventory-captures/export.csv')
        assert exported.status_code == 200
        table = list(csv.reader(io.StringIO(exported.text)))
        header = table[0]
        values = dict(zip(header, table[1 if table[1][0] == barcode else 2]))
        assert values['barcode'] == barcode
        assert values['retailPrice'] == '14.50'

        denied = await client.put(f"/api/admin/inventory-captures/{body['id']}", json={'name': 'Nope'}, headers={'X-Admin': ''})
        assert denied.status_code == 403
        guest = await client.get('/api/admin/inventory-captures/export.csv', headers={'X-Admin': ''})
        assert guest.status_code == 403

    with pytest.raises(DuplicateKeyError):
        await db.inventory_captures.insert_one({'id': 'second', 'barcode': barcode, 'identifier': barcode})


def test_before_after_grid_uses_the_real_remover():
    """Write a review grid. Geometry guarantees are covered without the model above."""
    if not processing.MODEL_PATH.exists():
        pytest.skip('background-removal model is not installed')
    samples = [
        ('Left on green', (520, 380), (70, 130, 80), (40, 50, 220, 320), (190, 40, 50)),
        ('Wide on blue', (640, 280), (40, 70, 150), (180, 40, 600, 180), (230, 170, 40)),
        ('Tall on beige', (420, 560), (210, 190, 150), (140, 40, 300, 500), (40, 40, 50)),
        ('Small on gray', (480, 480), (170, 170, 170), (300, 250, 430, 420), (20, 90, 140)),
    ]
    cells = []
    for label, size, background, box, fill in samples:
        before = Image.new('RGB', size, background)
        draw = ImageDraw.Draw(before)
        draw.rounded_rectangle(box, radius=16, fill=fill)
        draw.rectangle((box[0] + 12, box[1] + 18, box[2] - 12, box[1] + 48), fill=(245, 245, 245))
        raw = io.BytesIO()
        before.save(raw, 'JPEG', quality=92)
        data, _low = processing.prepare_inventory_photo(raw.getvalue())
        after = Image.open(io.BytesIO(data)).convert('RGB')
        assert after.size == (CANVAS, CANVAS)
        assert after.getpixel((0, 0)) == WHITE
        assert after.getpixel((CANVAS - 1, CANVAS - 1)) == WHITE
        cells.append((label, before, after))
    thumb = 280
    pad = 16
    width = pad + len(cells) * (thumb + pad)
    height = pad + 24 + thumb + pad + thumb + pad
    grid = Image.new('RGB', (width, height), (245, 245, 245))
    draw = ImageDraw.Draw(grid)
    for index, (label, before, after) in enumerate(cells):
        x = pad + index * (thumb + pad)
        before_thumb = before.copy()
        before_thumb.thumbnail((thumb, thumb))
        after_thumb = after.resize((thumb, thumb))
        grid.paste(before_thumb, (x, 28))
        grid.paste(after_thumb, (x, 28 + thumb + pad))
        draw.text((x, 6), label, fill=(20, 20, 20))
    draw.text((pad, 28 + thumb + 2), 'After: background removed, centered on #FFFFFF', fill=(20, 20, 20))
    destination = Path('/opt/cursor/artifacts')
    destination.mkdir(parents=True, exist_ok=True)
    grid.save(destination / 'inventory-before-after-grid.png')
    assert (destination / 'inventory-before-after-grid.png').stat().st_size > 1000

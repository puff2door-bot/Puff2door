"""Admin photo preparation, access controls and private persistence."""
import io
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI, Header, HTTPException
from mongomock_motor import AsyncMongoMockClient
from PIL import Image, ImageChops

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inventory_capture import create_inventory_capture_router
import inventory_photo_processing as processing

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

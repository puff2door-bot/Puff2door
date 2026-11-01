"""Fetch the versioned model at build time and verify its SHA-256."""
import hashlib
from pathlib import Path
import urllib.request

URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx'
SHA256 = '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'
path = Path(__file__).resolve().parents[1] / 'models' / 'u2netp.onnx'
path.parent.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(URL, timeout=90) as response:
    data = response.read(6 * 1024 * 1024)
if hashlib.sha256(data).hexdigest() != SHA256:
    raise RuntimeError('Background-removal model checksum did not match')
path.write_bytes(data)
print('Verified inventory photo model installed')

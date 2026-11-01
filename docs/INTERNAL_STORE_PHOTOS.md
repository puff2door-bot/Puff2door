# Internal Store Photos

Open /admin/inventory-capture as an administrator. Choose a phone photo, review
the automatically prepared white-background version, enter its SKU/barcode and
optional label, then approve to save the private inventory reference.

This route does not create public product listings, change prices/stock, or write
to Clover. It preserves the existing Clover integration without modifying it.

The CPU U2NETP ONNX model is downloaded during Docker build and checked against
a pinned SHA-256. Runtime dependencies are pinned in requirements-photo-processing.txt.
The model and preprocessing follow https://github.com/danielgatis/rembg and the
U2-Net project at https://github.com/xuebinqin/U-2-Net (Apache-2.0 model project).
No paid image API is used. A single preparation runs per process at a time.

Images are restricted to still JPEG/PNG/WebP files under 12 MB and 24 MP.
The detected item is fitted within 1280 pixels on a 1600-square white canvas.
Manual preview approval is required; reflective/transparent objects and busy
backgrounds can produce imperfect edges. Perspective and physical tilt are not
corrected. Small inputs do not gain real detail by resizing. The original is
kept in the phone/browser until approval, not archived by this private endpoint.

Photo blobs are private GridFS records served only through administrator-authenticated
endpoints with no-store responses. The normal public upload collection is not used.
Preparation returns a preview without writing database records.

Local validation: authenticated prepare/save/read flow, unauthenticated denial,
no public catalog writes, failed preparation and empty-mask rejection; production
route registration; real CPU inference on a synthetic 24MP fixture. iPhone camera
and real product edge quality require a signed-in device check after deployment.

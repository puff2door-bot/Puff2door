import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Search } from "lucide-react";
import api, { imgUrl } from "../../api";

const SIZE = 1600;
const FRAME = 40;
const NO_TRIM = { top: 0, bottom: 0, left: 0, right: 0 };

// Cut the trimmed edges off the processed photo and centre what is left on a fresh white
// square with the same thin margin the server uses (so the server stores it unchanged).
const reframe = (image, trim, canvas) => {
  const ctx = canvas.getContext("2d");
  const w = image.naturalWidth, h = image.naturalHeight;
  const sx = (trim.left / 100) * w, sy = (trim.top / 100) * h;
  const sw = Math.max(1, w - sx - (trim.right / 100) * w), sh = Math.max(1, h - sy - (trim.bottom / 100) * h);
  // Find the item inside the kept area so it can be enlarged to fill the frame again.
  const probe = document.createElement("canvas");
  probe.width = Math.max(1, Math.round(sw / 4)); probe.height = Math.max(1, Math.round(sh / 4));
  const pctx = probe.getContext("2d");
  pctx.drawImage(image, sx, sy, sw, sh, 0, 0, probe.width, probe.height);
  const data = pctx.getImageData(0, 0, probe.width, probe.height).data;
  let minX = probe.width, minY = probe.height, maxX = -1, maxY = -1;
  for (let y = 0; y < probe.height; y += 1) {
    for (let x = 0; x < probe.width; x += 1) {
      const i = (y * probe.width + x) * 4;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  let cx = sx, cy = sy, cw = sw, ch = sh;
  if (maxX >= 0) {
    const fx = sw / probe.width, fy = sh / probe.height;
    cx = sx + minX * fx; cy = sy + minY * fy; cw = (maxX - minX + 1) * fx; ch = (maxY - minY + 1) * fy;
  }
  const inner = SIZE - FRAME * 2;
  const scale = Math.min(inner / cw, inner / ch);
  const dw = cw * scale, dh = ch * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, cx, cy, cw, ch, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);
  ctx.fillRect(0, 0, SIZE, FRAME); ctx.fillRect(0, SIZE - FRAME, SIZE, FRAME);
  ctx.fillRect(0, 0, FRAME, SIZE); ctx.fillRect(SIZE - FRAME, 0, FRAME, SIZE);
};

// Products still showing a category placeholder (or nothing). Tap Take photo, check the
// white-background preview, then Use this photo: it becomes the product's website picture.
const MissingPhotos = () => {
  const [products, setProducts] = useState([]);
  const [placeholders, setPlaceholders] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [retake, setRetake] = useState(false);
  const [active, setActive] = useState(null);
  const [preview, setPreview] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState([]);
  const [trim, setTrim] = useState(NO_TRIM);
  const [source, setSource] = useState(null);
  const input = useRef(null);
  const canvasRef = useRef(null);
  const trimmed = trim.top || trim.bottom || trim.left || trim.right;

  // Load the processed preview so the trim sliders can redraw it.
  useEffect(() => {
    if (!preview) { setSource(null); return; }
    const image = new Image();
    image.onload = () => setSource(image);
    image.src = preview;
  }, [preview]);

  useEffect(() => {
    if (source && canvasRef.current) reframe(source, trim, canvasRef.current);
  }, [source, trim]);

  useEffect(() => {
    Promise.all([api.get("/admin/products"), api.get("/admin/clover/placeholders").catch(() => ({ data: { placeholders: {} } }))])
      .then(([p, ph]) => { setProducts(p.data.products || []); setPlaceholders(ph.data.placeholders || {}); })
      .finally(() => setLoading(false));
  }, []);

  const placeholderSet = useMemo(() => new Set(Object.values(placeholders)), [placeholders]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => p.active && (retake ? (p.image && !placeholderSet.has(p.image)) : (!p.image || placeholderSet.has(p.image))))
      .filter((p) => !inStockOnly || p.stock > 0)
      .filter((p) => !q || `${p.name} ${p.brandName || ""} ${p.barcode || ""}`.toLowerCase().includes(q))
      .sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.name.localeCompare(b.name));
  }, [products, placeholderSet, query, inStockOnly, retake]);

  const start = (product) => {
    setActive(product); setPreview(null); setPrepared(null); setError(""); setTrim(NO_TRIM);
    if (input.current) { input.current.value = ""; input.current.click(); }
  };

  const chosen = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file || !active) return;
    setBusy("Removing background…"); setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const { data } = await api.post("/admin/inventory-captures/prepare", body, { responseType: "blob", timeout: 120000 });
      setPrepared(data);
      setTrim(NO_TRIM);
      setPreview(URL.createObjectURL(data));
    } catch (err) {
      let detail = "";
      try { detail = JSON.parse(await err.response.data.text()).detail; } catch (_) {}
      setError(detail || "The photo could not be processed. Try again.");
    } finally {
      setBusy("");
    }
  };

  const use = async () => {
    if (!active || !prepared) return;
    setBusy("Saving…"); setError("");
    try {
      const body = new FormData();
      let file = prepared;
      if (trimmed && canvasRef.current) {
        file = await new Promise((resolve) => canvasRef.current.toBlob(resolve, "image/png"));
      }
      body.append("file", file, trimmed ? "photo.png" : "photo.webp");
      const { data } = await api.post(`/admin/products/${active.id}/photo`, body, { timeout: 120000 });
      setProducts((prev) => prev.map((p) => (p.id === active.id ? { ...p, image: data.image, image2: data.image } : p)));
      setDone((prev) => [active.name, ...prev].slice(0, 5));
      setActive(null); setPreview(null); setPrepared(null);
    } catch (err) {
      setError(err?.response?.data?.detail || "The photo could not be saved. Try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="space-y-5" data-testid="missing-photos">
      <div>
        <h2 className="font-heading text-2xl">Missing photos</h2>
        <p className="text-sm text-neutral-500 mt-1">Products on the website that still show a placeholder. Tap <b>Take photo</b>, check the white-background preview, then <b>Use this photo</b>. It goes on the website right away. Tip: hold the phone straight above or in front of the item, fill most of the screen with it, and use soft light. Turn the flash off and keep bright lights from shining straight onto shiny or rainbow-foil boxes: glare on the box is part of the photo and cannot be removed. Tilted items are straightened automatically.</p>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-3.5 text-neutral-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, brand or barcode" className="w-full border rounded-xl pl-9 pr-3 py-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="accent-emerald-600 h-4 w-4" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} /> In stock only</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="accent-emerald-600 h-4 w-4" checked={retake} onChange={(e) => setRetake(e.target.checked)} data-testid="retake-toggle" /> Redo items that already have a photo</label>
      </div>
      <p className="text-sm font-semibold">{loading ? "Loading…" : retake ? `${list.length} product${list.length === 1 ? "" : "s"} with a photo` : `${list.length} product${list.length === 1 ? "" : "s"} need a photo`}</p>
      {done.length > 0 && <p role="status" className="text-sm text-emerald-700 flex gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" />Photo added: {done.join(", ")}</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={chosen} />
      {active && (
        <div className="border-2 border-emerald-500 rounded-2xl p-4 space-y-3" data-testid="missing-photo-panel">
          <p className="font-bold">{active.name}</p>
          <div className="aspect-square max-w-xs mx-auto border rounded-xl bg-white grid place-items-center overflow-hidden">
            {preview ? <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-label="White background preview" className="w-full h-full" /> : <Camera className="w-10 h-10 text-neutral-300" />}
          </div>
          {preview && (
            <div className="space-y-2 max-w-xs mx-auto" data-testid="trim-controls">
              <p className="text-xs text-neutral-500">Something extra in the picture? Slide to cut it off.</p>
              {[["top", "Trim top"], ["bottom", "Trim bottom"], ["left", "Trim left"], ["right", "Trim right"]].map(([side, label]) => (
                <label key={side} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0">{label}</span>
                  <input type="range" min="0" max="45" step="0.5" value={trim[side]} disabled={Boolean(busy)}
                    onChange={(e) => setTrim((prev) => ({ ...prev, [side]: Number(e.target.value) }))}
                    className="flex-1 accent-emerald-600" data-testid={`trim-${side}`} />
                </label>
              ))}
              {trimmed && <button type="button" onClick={() => setTrim(NO_TRIM)} className="text-xs underline">Reset trim</button>}
            </div>
          )}
          {busy && <p role="status" className="text-sm text-emerald-700">{busy}</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy) || !prepared} onClick={use} className="rounded-full px-5 py-3 font-bold text-sm bg-emerald-600 text-white disabled:opacity-50">Use this photo</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => start(active)} className="rounded-full px-5 py-3 font-bold text-sm border">Retake</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => { setActive(null); setPreview(null); setPrepared(null); }} className="rounded-full px-5 py-3 font-bold text-sm border">Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {list.map((p) => (
          <article key={p.id} className="flex items-center gap-3 border rounded-2xl p-3">
            <img src={imgUrl(p.image)} alt="" className="w-14 h-14 rounded-lg object-cover bg-neutral-100 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm break-words">{p.name}</p>
              <p className="text-xs text-neutral-500">{[p.category, p.brandName, p.barcode].filter(Boolean).join(" · ")} · Stock {p.stock}</p>
            </div>
            <button type="button" disabled={Boolean(busy)} onClick={() => start(p)} data-testid={`missing-photo-${p.id}`} className="rounded-full px-4 py-2 font-bold text-sm bg-neutral-900 text-white flex items-center gap-1 shrink-0 disabled:opacity-50"><Camera className="w-4 h-4" />{retake ? "Retake" : "Take photo"}</button>
          </article>
        ))}
      </div>
    </section>
  );
};

export default MissingPhotos;

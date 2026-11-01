import React, { useEffect, useRef, useState } from "react";
import { Camera, Upload, CheckCircle2 } from "lucide-react";
import api from "../../api";

const root = "/admin/inventory-captures";
const button = "rounded-full px-5 py-3 font-bold text-sm disabled:opacity-50";

function PrivatePhoto({ id }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false, objectUrl;
    api.get(`${root}/${id}/photo`, { responseType: "blob" }).then(({ data }) => {
      if (!cancelled) { objectUrl = URL.createObjectURL(data); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return url ? <img src={url} alt="Inventory reference" className="w-20 h-20 object-contain bg-white rounded-xl" /> : <span className="text-xs text-neutral-500">Preview unavailable</span>;
}

export default function InventoryCapture() {
  const [rows, setRows] = useState([]), [identifier, setIdentifier] = useState("");
  const [label, setLabel] = useState(""), [file, setFile] = useState(null), [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState("");
  const [processed, setProcessed] = useState(null), [processing, setProcessing] = useState(false);
  const [after, setAfter] = useState(""), [showOriginal, setShowOriginal] = useState(false), [retry, setRetry] = useState(0);
  const camera = useRef(null), gallery = useRef(null), sku = useRef(null), submitting = useRef(false);
  useEffect(() => { api.get(root).then(({ data }) => setRows(data.captures)).catch(() => setError("Saved captures could not load. Refresh to retry.")); }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!file) { setProcessed(null); setAfter(""); setProcessing(false); return; }
    const controller = new AbortController(); let url;
    setProcessing(true); setProcessed(null); setAfter(""); setError(""); setShowOriginal(false);
    const body = new FormData(); body.append("file", file);
    api.post(`${root}/prepare`, body, { responseType: "blob", signal: controller.signal, timeout: 120000 })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(data); setAfter(url); setProcessed(data);
      }).catch(async (err) => {
        if (controller.signal.aborted) return;
        let detail;
        try { detail = JSON.parse(await err.response.data.text()).detail; } catch (_) {}
        if (!controller.signal.aborted) setError(typeof detail === "string" ? detail : "Photo preparation failed. Your original is still here. Retry or retake the photo.");
      }).finally(() => { if (!controller.signal.aborted) setProcessing(false); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [file, retry]);
  useEffect(() => {
    const warn = (e) => { if (file) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [file]);
  const choose = (e) => {
    const next = e.target.files?.[0]; e.target.value = "";
    if (!next) return;
    if (next.size > 12 * 1024 * 1024) { setError("Choose a photo under 12 MB."); return; }
    setFile(next); setError(""); setSaved("");
  };
  const save = async (e) => {
    e.preventDefault();
    if (!processed || processing || !identifier.trim() || submitting.current) return;
    submitting.current = true; setBusy(true); setError(""); setSaved("");
    try {
      const body = new FormData(); body.append("file", processed, "inventory-white.webp"); body.append("identifier", identifier.trim()); body.append("label", label.trim());
      const { data } = await api.post(root, body);
      setRows((old) => [data, ...old].slice(0, 200)); setSaved(`Saved ${identifier.trim()}. Ready for the next item.`);
      setFile(null); setIdentifier(""); setLabel(""); sku.current?.focus();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Upload could not be confirmed. Your photo is still here. Check saved captures before retrying.");
    } finally { submitting.current = false; setBusy(false); }
  };
  return <section className="space-y-5">
    <div><h2 className="font-heading text-2xl">Store photo capture</h2><p className="text-sm text-neutral-500 mt-2">Private inventory reference photos. Enter or scan a barcode with your keyboard scanner, take a photo, then save and continue.</p></div>
    <form onSubmit={save} className="rounded-2xl border p-5 space-y-4 bg-white">
      <label className="block text-sm font-bold">Barcode or SKU<input ref={sku} required maxLength={200} disabled={busy} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" className="block border rounded-xl p-3 w-full mt-2 font-normal" placeholder="Keep leading zeros, e.g. 001234567890" /></label>
      <label className="block text-sm font-bold">Item label (optional)<input maxLength={200} disabled={busy} value={label} onChange={(e) => setLabel(e.target.value)} className="block border rounded-xl p-3 w-full mt-2 font-normal" /></label>
      <div className="aspect-square max-w-sm mx-auto border rounded-2xl bg-white grid place-items-center overflow-hidden">{preview ? <img src={!showOriginal && after ? after : preview} alt={!showOriginal && after ? "White background preview" : "Original inventory photo"} className="w-full h-full object-contain" /> : <Camera className="w-12 h-12 text-neutral-300" />}</div>
      {processing && <p role="status" className="text-sm text-emerald-700">Removing background and centering your item…</p>}
      {after && <><button type="button" className={`${button} border`} onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? "Show white background" : "Compare original"}</button><p className="text-xs text-neutral-500">Check the edges and label before saving. Reflective or transparent items may need a retake. Small or blurry originals will not gain real detail.</p></>}
      {file && !processing && !processed && <button type="button" className={`${button} border`} onClick={() => setRetry(retry + 1)}>Retry background removal</button>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} className={`${button} bg-neutral-900 text-white`} onClick={() => camera.current?.click()}>Take photo</button><button type="button" disabled={busy} className={`${button} border`} onClick={() => gallery.current?.click()}>Choose photo</button></div>
      <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose} className="hidden" />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} className="hidden" />
      <p className="text-xs text-neutral-500">Photograph one item in even light. Background removal starts automatically, then the item is centered on a 1600 × 1600 white square with consistent spacing. JPEG, PNG or WebP, up to 12 MB / 24 MP.</p>
      <button disabled={busy || processing || !processed || !identifier.trim()} className={`${button} bg-emerald-600 text-white w-full flex justify-center gap-2 items-center`}><Upload className="w-4 h-4" />{busy ? "Saving…" : "Approve photo & next item"}</button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700 flex gap-2"><CheckCircle2 className="w-5 h-5" />{saved}</p>}
    </form>
    <p className="text-xs text-neutral-500">Saved to internal inventory only. Website listings, Clover items, prices and stock are unchanged.</p>
    <h3 className="font-bold">Recent captures</h3>
    {rows.map((row) => <article key={row.id} className="flex gap-4 items-center border rounded-2xl p-3"><PrivatePhoto id={row.id} /><div className="min-w-0"><p className="font-bold break-all">{row.identifier}</p><p className="text-sm break-words">{row.label}</p><p className="text-xs text-neutral-500">{new Date(row.createdAt).toLocaleString()}</p></div></article>)}
  </section>;
}

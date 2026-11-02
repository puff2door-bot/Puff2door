import React, { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Trash2, Upload } from "lucide-react";
import api from "../../api";
import SearchableSelect from "../../components/admin/SearchableSelect";
import { resolveBrand, resolveCategory } from "../../components/admin/catalogChoices";

const root = "/admin/inventory-captures";
const button = "rounded-full px-5 py-3 font-bold text-sm disabled:opacity-50";
const field = "block border rounded-xl p-3 w-full mt-2 font-normal text-base";
const emptyForm = {
  barcode: "", name: "", description: "", details: "", categorySlug: "", categoryUnmatched: false, categoryLegacy: "",
  brandSlug: "", brandUnmatched: false, brandLegacy: "",
  label: "", cost: "", retailPrice: "", quantity: "", notes: "",
};

function errorText(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail.message === "string") return detail.message;
  return fallback;
}

function PrivatePhoto({ id, version }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    api.get(`${root}/${id}/photo`, { responseType: "blob" }).then(({ data }) => {
      if (!cancelled) { objectUrl = URL.createObjectURL(data); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, version]);
  return url ? <img src={url} alt="Inventory reference" className="w-20 h-20 object-contain bg-white rounded-xl" /> : <span className="text-xs text-neutral-500">Preview unavailable</span>;
}

export default function InventoryCapture() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [duplicate, setDuplicate] = useState(null);
  const [processed, setProcessed] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [after, setAfter] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [retry, setRetry] = useState(0);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const camera = useRef(null);
  const gallery = useRef(null);
  const sku = useRef(null);
  const submitting = useRef(false);

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    api.get(root).then(({ data }) => setRows(data.captures || [])).catch(() => setError("Saved records could not load. Refresh to retry."));
    api.get("/admin/categories").then(({ data }) => setCategories(data.categories || [])).catch(() => setCategories([]));
    api.get("/admin/brands").then(({ data }) => setBrands(data.brands || [])).catch(() => setBrands([]));
  }, []);
  useEffect(() => {
    if (!editing) return;
    setForm((current) => {
      if (!current.categoryUnmatched && !current.brandUnmatched) return current;
      const row = rows.find((item) => item.id === editing);
      if (!row) return current;
      const category = current.categoryUnmatched ? resolveCategory(row, categories) : null;
      const brand = current.brandUnmatched ? resolveBrand(row, brands) : null;
      return {
        ...current,
        ...(category ? { categorySlug: category.slug, categoryUnmatched: category.unmatched, categoryLegacy: category.legacy } : {}),
        ...(brand ? { brandSlug: brand.slug, brandUnmatched: brand.unmatched, brandLegacy: brand.legacy } : {}),
      };
    });
  }, [categories, brands, editing, rows]);
  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!file) { setProcessed(null); setAfter(""); setProcessing(false); return undefined; }
    const controller = new AbortController();
    let url;
    setProcessing(true); setProcessed(null); setAfter(""); setError(""); setShowOriginal(false);
    const body = new FormData();
    body.append("file", file);
    api.post(`${root}/prepare`, body, { responseType: "blob", signal: controller.signal, timeout: 120000 })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(data);
        setAfter(url);
        setProcessed(data);
      }).catch(async (err) => {
        if (controller.signal.aborted) return;
        let detail;
        try { detail = JSON.parse(await err.response.data.text()).detail; } catch (_) {}
        if (!controller.signal.aborted) setError(typeof detail === "string" ? detail : "Photo preparation failed. Your original is still here. Retry or retake the photo.");
      }).finally(() => { if (!controller.signal.aborted) setProcessing(false); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [file, retry]);
  useEffect(() => {
    const warn = (event) => { if (file) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [file]);

  const choose = (event) => {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    if (next.size > 12 * 1024 * 1024) { setError("Choose a photo under 12 MB."); return; }
    setFile(next); setError(""); setSaved(""); setDuplicate(null);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setFile(null);
    setDuplicate(null);
    sku.current?.focus();
  };

  const startEdit = (row) => {
    const category = resolveCategory(row, categories);
    const brand = resolveBrand(row, brands);
    setEditing(row.id);
    setForm({
      barcode: row.barcode || row.identifier || "",
      name: row.name || "",
      description: row.description || "",
      details: row.details || "",
      categorySlug: category.slug,
      categoryUnmatched: category.unmatched,
      categoryLegacy: category.legacy,
      brandSlug: brand.slug,
      brandUnmatched: brand.unmatched,
      brandLegacy: brand.legacy,
      label: row.label || "",
      cost: row.cost || "",
      retailPrice: row.retailPrice || "",
      quantity: row.quantity === 0 || row.quantity ? String(row.quantity) : "",
      notes: row.notes || "",
    });
    setFile(null);
    setError("");
    setSaved("");
    setDuplicate(null);
    sku.current?.focus();
  };

  const openExisting = async (id) => {
    const known = rows.find((row) => row.id === id);
    if (known) { startEdit(known); return; }
    try {
      const { data } = await api.get(`${root}/${id}`);
      setRows((current) => current.some((row) => row.id === data.id) ? current : [data, ...current]);
      startEdit(data);
    } catch (err) {
      setError(errorText(err, "That saved record could not be opened."));
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const barcode = form.barcode.trim();
    if (!barcode || processing || submitting.current) return;
    if ((!editing && !processed) || (file && !processed)) return;
    if (form.categoryUnmatched || form.brandUnmatched) {
      setError("Pick a category and brand from the lists. Unmatched text is not saved.");
      return;
    }
    submitting.current = true;
    setBusy(true); setError(""); setSaved(""); setDuplicate(null);
    const payload = {
      barcode,
      name: form.name.trim(),
      description: form.description.trim(),
      details: form.details.trim(),
      categorySlug: form.categorySlug,
      brandSlug: form.brandSlug,
      label: form.label.trim(),
      cost: form.cost.trim(),
      retailPrice: form.retailPrice.trim(),
      quantity: form.quantity.trim() || "0",
      notes: form.notes.trim(),
    };
    try {
      let data;
      if (editing) {
        ({ data } = await api.put(`${root}/${editing}`, payload));
        if (processed) {
          const body = new FormData();
          body.append("file", processed, "inventory-white.webp");
          ({ data } = await api.post(`${root}/${editing}/photo`, body));
        }
        setRows((current) => current.map((row) => (row.id === data.id ? data : row)));
        setSaved(data.publishedProductId ? `Updated ${barcode}. Photo is on the website for ${data.publishedProductName}.` : `Updated ${barcode}. ${data.publishNote || "The record is saved."}`);
      } else {
        const body = new FormData();
        body.append("file", processed, "inventory-white.webp");
        Object.entries(payload).forEach(([key, value]) => body.append(key, value));
        body.append("identifier", barcode);
        ({ data } = await api.post(root, body));
        setRows((current) => [data, ...current].slice(0, 200));
        setSaved(data.publishedProductId ? `Saved ${barcode}. Photo is on the website for ${data.publishedProductName}. Ready for the next item.` : `Saved ${barcode}. ${data.publishNote || "Ready for the next item."}`);
      }
      resetForm();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.existingId) {
        setDuplicate(detail);
        setError(detail.message || "This SKU or barcode is already saved. Edit the existing record instead of creating another.");
      } else {
        setError(errorText(err, "The record could not be saved. Your photo is still here. Check saved records before retrying."));
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const remove = async (row) => {
    const label = row.name || row.barcode || "this item";
    if (!window.confirm(`Delete the store photo for ${label}? The website product gets its previous picture back. This cannot be undone.`)) return;
    setError("");
    try {
      const { data } = await api.delete(`${root}/${row.id}`);
      setRows((current) => current.filter((item) => item.id !== row.id));
      if (editing === row.id) resetForm();
      setSaved(data.productRestored ? `Deleted. ${data.productRestored} has its previous picture back.` : "Deleted.");
    } catch (err) {
      setError(errorText(err, "The store photo could not be deleted. Try again."));
    }
  };

  const download = async () => {
    try {
      const { data } = await api.get(`${root}/export.csv`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "private-inventory.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(err, "The private inventory export could not be downloaded."));
    }
  };

  return <section className="space-y-5">
    <div>
      <h2 className="font-heading text-2xl">{editing ? "Edit private inventory record" : "Store photo capture"}</h2>
      <p className="text-sm text-neutral-500 mt-2">Enter or scan a barcode, photograph one item, then approve the white-background photo. When the barcode matches a website product, the photo becomes that product's picture on the website.</p>
    </div>
    <form onSubmit={save} className="rounded-2xl border p-5 space-y-4 bg-white">
      <label className="block text-sm font-bold">Barcode or SKU
        <input ref={sku} data-testid="inventory-barcode" required maxLength={200} disabled={busy} value={form.barcode} onChange={setField("barcode")} type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" autoComplete="off" className={field} placeholder="Keep leading zeros, e.g. 001234567890" />
      </label>
      <label className="block text-sm font-bold">Name
        <input data-testid="inventory-name" maxLength={200} disabled={busy} value={form.name} onChange={setField("name")} className={field} />
      </label>
      <label className="block text-sm font-bold">Description
        <textarea data-testid="inventory-description" maxLength={4000} disabled={busy} value={form.description} onChange={setField("description")} className={`${field} min-h-24`} />
      </label>
      <label className="block text-sm font-bold">Details
        <textarea data-testid="inventory-details" maxLength={4000} disabled={busy} value={form.details} onChange={setField("details")} className={`${field} min-h-20`} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SearchableSelect
          label="Category"
          testId="inventory-category"
          required
          disabled={busy}
          placeholder="Search categories"
          options={categories.map((category) => ({ value: category.slug, label: category.name }))}
          value={form.categorySlug}
          unmatched={form.categoryUnmatched}
          unmatchedLabel={form.categoryLegacy ? `Unmatched, pick one (${form.categoryLegacy})` : "Unmatched, pick one"}
          onChange={(categorySlug) => setForm((current) => ({ ...current, categorySlug, categoryUnmatched: false, categoryLegacy: "" }))}
          buttonClassName={field}
        />
        <SearchableSelect
          label="Brand"
          testId="inventory-brand"
          disabled={busy}
          placeholder="Search brands"
          emptyOption={{ value: "", label: "None" }}
          options={brands.map((brand) => ({ value: brand.slug, label: brand.displayName || brand.name }))}
          value={form.brandSlug}
          unmatched={form.brandUnmatched}
          unmatchedLabel={form.brandLegacy ? `Unmatched, pick one (${form.brandLegacy})` : "Unmatched, pick one"}
          onChange={(brandSlug) => setForm((current) => ({ ...current, brandSlug, brandUnmatched: false, brandLegacy: "" }))}
          buttonClassName={field}
        />
        <label className="block text-sm font-bold">Item label (optional)
          <input maxLength={200} disabled={busy} value={form.label} onChange={setField("label")} className={field} />
        </label>
        <label className="block text-sm font-bold">Cost
          <input data-testid="inventory-cost" type="text" inputMode="decimal" disabled={busy} value={form.cost} onChange={setField("cost")} className={field} placeholder="0.00" />
        </label>
        <label className="block text-sm font-bold">Retail price
          <input data-testid="inventory-retail-price" type="text" inputMode="decimal" disabled={busy} value={form.retailPrice} onChange={setField("retailPrice")} className={field} placeholder="0.00" />
        </label>
        <label className="block text-sm font-bold sm:col-span-2">Quantity
          <input data-testid="inventory-quantity" type="text" inputMode="numeric" disabled={busy} value={form.quantity} onChange={setField("quantity")} className={field} placeholder="0" />
        </label>
      </div>
      <p className="text-xs text-neutral-500">Category and brand come from the website lists, including names such as PODS. This form cannot create a category or brand. Retail price and cost stay on this record. Saving does not change the website price or Clover.</p>
      <label className="block text-sm font-bold">Notes
        <textarea maxLength={4000} disabled={busy} value={form.notes} onChange={setField("notes")} className={`${field} min-h-20`} />
      </label>
      <div className="aspect-square max-w-sm mx-auto border rounded-2xl bg-white grid place-items-center overflow-hidden">{preview ? <img src={!showOriginal && after ? after : preview} alt={!showOriginal && after ? "White background preview" : "Original inventory photo"} className="w-full h-full object-contain" /> : <Camera className="w-12 h-12 text-neutral-300" />}</div>
      {processing && <p role="status" data-testid="inventory-processing" className="text-sm text-emerald-700">Removing background and centering your item on a white square…</p>}
      {busy && <p role="status" data-testid="inventory-saving" className="text-sm text-emerald-700">Saving the private record…</p>}
      {after && <><button type="button" className={`${button} border`} onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? "Show white background" : "Compare original"}</button><p className="text-xs text-neutral-500">Check the edges and label before saving. Every saved photo is a 1600 × 1600 square with the background removed, the item centered, and the same white margin. Reflective or transparent items may need a retake.</p></>}
      {file && !processing && !processed && <button type="button" className={`${button} border`} onClick={() => setRetry(retry + 1)}>Retry background removal</button>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} className={`${button} bg-neutral-900 text-white`} onClick={() => camera.current?.click()}>{editing ? "Replace photo" : "Take photo"}</button>
        <button type="button" disabled={busy} className={`${button} border`} onClick={() => gallery.current?.click()}>Choose photo</button>
        {editing && <button type="button" disabled={busy} className={`${button} border`} onClick={resetForm}>Cancel edit</button>}
      </div>
      <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose} className="hidden" />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} className="hidden" />
      <p className="text-xs text-neutral-500">Photograph one item in even light. JPEG, PNG or WebP, up to 12 MB / 24 MP. The saved square is the same size for every item.</p>
      <button disabled={busy || processing || !form.barcode.trim() || (!editing && !processed) || (Boolean(file) && !processed)} className={`${button} bg-emerald-600 text-white w-full flex justify-center gap-2 items-center`}><Upload className="w-4 h-4" />{busy ? "Saving…" : editing ? "Save changes" : "Approve photo & next item"}</button>
      {duplicate && <div role="alert" data-testid="inventory-duplicate" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 space-y-2"><p>{error}</p><button type="button" className={`${button} bg-neutral-900 text-white`} onClick={() => openExisting(duplicate.existingId)}>Edit existing record</button></div>}
      {!duplicate && error && <p role="alert" data-testid="inventory-error" className="text-sm text-red-700">{error}</p>}
      {saved && <p role="status" data-testid="inventory-success" className="text-sm text-emerald-700 flex gap-2"><CheckCircle2 className="w-5 h-5" />{saved}</p>}
    </form>
    <p className="text-xs text-neutral-500">The photo also becomes the website picture of the product with the same barcode. Clover items, prices and stock are unchanged.</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-bold">Recent records</h3>
      <button type="button" className={`${button} border`} onClick={download}>Export CSV</button>
    </div>
    {rows.map((row) => <article key={row.id} className="flex gap-4 items-center border rounded-2xl p-3">
      <PrivatePhoto id={row.id} version={row.updatedAt || row.createdAt} />
      <div className="min-w-0 flex-1">
        <p className="font-bold break-words">{row.name || "Untitled item"}</p>
        <p className="font-mono text-sm break-all">{row.barcode || row.identifier}</p>
        {(row.category || row.brandName) && <p className="text-sm break-words">{[row.category, row.brandName].filter(Boolean).join(" · ")}{row.categoryMatch === "unmatched" ? " · unmatched, pick one" : ""}</p>}
        <p className="text-sm text-neutral-600">{row.retailPrice ? `Retail record $${row.retailPrice}` : "No retail price yet"}{row.quantity ? ` · Qty ${row.quantity}` : ""}</p>
        {row.description && <p className="text-sm break-words text-neutral-600">{row.description}</p>}
        <p className="text-xs text-neutral-500">{row.createdAt ? new Date(row.createdAt).toLocaleString() : ""}</p>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <button type="button" className={`${button} border`} onClick={() => startEdit(row)}>Edit record</button>
        <button type="button" data-testid={`inventory-delete-${row.id}`} className={`${button} border border-red-200 text-red-700 flex items-center gap-1 justify-center`} onClick={() => remove(row)}><Trash2 className="w-4 h-4" />Delete</button>
      </div>
    </article>)}
  </section>;
}

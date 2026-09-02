import React, { useRef, useState } from "react";
import { X, Upload, Link2, Loader2, Trash2 } from "lucide-react";
import api, { imgUrl } from "../../api";
import { categories, FLAVOR_KEYWORDS } from "../../mock";
import { useToast } from "../../hooks/use-toast";

const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition-colors";

export const ImageField = ({ label, value, onChange, testId }) => {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const { toast } = useToast();

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.url);
      toast({ title: "Image uploaded" });
    } catch (e) {
      toast({ title: "Upload failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">{label}</label>
      <div className="flex gap-3">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}
          onClick={() => fileRef.current?.click()}
          data-testid={`${testId}-dropzone`}
          className="relative h-28 w-28 shrink-0 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 grid place-items-center overflow-hidden cursor-pointer hover:border-emerald-500 transition-colors"
        >
          {value ? <img src={imgUrl(value)} alt="" className="h-full w-full object-contain p-1" /> : <Upload className="h-6 w-6 text-neutral-400" />}
          {busy && <span className="absolute inset-0 bg-white/80 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></span>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" data-testid={`${testId}-file`} onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-neutral-500">Drop an image or click the box to upload from your computer.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setUrlMode((v) => !v)} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"><Link2 className="h-3.5 w-3.5" /> {urlMode ? "Hide URL" : "Paste image URL"}</button>
            {value && <button type="button" onClick={() => onChange("")} data-testid={`${testId}-clear`} className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:underline"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
          </div>
          {urlMode && <input data-testid={`${testId}-url`} className={inputCls} placeholder="https://..." value={value} onChange={(e) => onChange(e.target.value)} />}
        </div>
      </div>
    </div>
  );
};

export const emptyProduct = {
  name: "", category: categories[0].name, categorySlug: categories[0].slug, price: "", salePrice: "", image: "", image2: "",
  brand: "", brandName: "", flavors: [], puffs: "", stock: 0, active: true, description: "",
};

const ProductForm = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState({ ...emptyProduct, ...initial, price: initial?.price ?? "", salePrice: initial?.salePrice ?? "", puffs: initial?.puffs ?? "" });
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const isEdit = Boolean(initial?.id);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      ...f,
      price: Number(f.price),
      salePrice: f.salePrice === "" ? null : Number(f.salePrice),
      puffs: f.puffs === "" ? null : Number(f.puffs),
      stock: Number(f.stock),
      brandName: f.brandName || f.name.split(" ")[0],
    };
    delete payload.id; delete payload.slug; delete payload.inStock; delete payload.rating; delete payload.restockNotified;
    try {
      const { data } = isEdit ? await api.put(`/admin/products/${initial.id}`, payload) : await api.post("/admin/products", payload);
      toast({ title: isEdit ? "Product updated" : "Product created", description: data.restockNotified ? `${data.restockNotified} customer(s) notified of restock` : data.name });
      onSaved(data);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast({ title: "Save failed", description: Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" data-testid="product-form-modal">
      <form onSubmit={submit} className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6 sm:p-8 space-y-5 animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl uppercase tracking-wide">{isEdit ? "Edit Product" : "New Product"}</h2>
          <button type="button" onClick={onClose} data-testid="product-form-close" className="h-9 w-9 grid place-items-center rounded-full hover:bg-neutral-100"><X className="h-5 w-5" /></button>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Product name *</label>
          <input required data-testid="pf-name" className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Category *</label>
            <select data-testid="pf-category" className={inputCls} value={f.categorySlug} onChange={(e) => { const c = categories.find((x) => x.slug === e.target.value); set("categorySlug", c.slug); set("category", c.name); }}>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Brand name</label>
            <input data-testid="pf-brand" className={inputCls} placeholder="e.g. GEEK BAR" value={f.brandName} onChange={(e) => set("brandName", e.target.value.toUpperCase())} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Price $ *</label>
            <input required type="number" min="0" step="0.01" data-testid="pf-price" className={inputCls} value={f.price} onChange={(e) => set("price", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Sale price $</label>
            <input type="number" min="0" step="0.01" data-testid="pf-sale-price" className={inputCls} placeholder="optional" value={f.salePrice} onChange={(e) => set("salePrice", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Stock qty *</label>
            <input required type="number" min="0" step="1" data-testid="pf-stock" className={inputCls} value={f.stock} onChange={(e) => set("stock", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Puff count</label>
            <input type="number" min="0" step="1" data-testid="pf-puffs" className={inputCls} placeholder="e.g. 25000" value={f.puffs} onChange={(e) => set("puffs", e.target.value)} />
          </div>
        </div>

        <ImageField label="Main photo" value={f.image} onChange={(v) => set("image", v)} testId="pf-image" />
        <ImageField label="Hover / second photo" value={f.image2} onChange={(v) => set("image2", v)} testId="pf-image2" />

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Flavors</label>
          <div className="flex flex-wrap gap-1.5">
            {FLAVOR_KEYWORDS.map((fl) => {
              const on = f.flavors.includes(fl);
              return (
                <button type="button" key={fl} onClick={() => set("flavors", on ? f.flavors.filter((x) => x !== fl) : [...f.flavors, fl])} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-emerald-600 border-emerald-600 text-white" : "border-neutral-300 text-neutral-600 hover:border-emerald-500"}`}>{fl}</button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Description</label>
          <textarea rows={3} data-testid="pf-description" className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" data-testid="pf-active" className="accent-emerald-600 h-4 w-4" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Visible in store
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full border border-neutral-300 text-sm font-bold hover:bg-neutral-50">Cancel</button>
          <button disabled={busy} data-testid="pf-save" className="px-6 py-2.5 rounded-full bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60">{busy ? "Saving..." : isEdit ? "Save Changes" : "Create Product"}</button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;

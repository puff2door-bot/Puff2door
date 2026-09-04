import React, { useEffect, useState } from "react";
import { Tag, Trash2, Loader2, Save, Plus, X, Link2 } from "lucide-react";
import api, { imgUrl } from "../../api";
import { useCatalog } from "../../context/CatalogContext";
import { useToast } from "../../hooks/use-toast";
import { ImageField } from "./ProductForm";

const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition-colors";
const isExternal = (u) => /^https?:\/\//.test(u || "") && !u.includes("/api/files/");

const BrandRow = ({ brand, onSaved, onDeleted }) => {
  const [f, setF] = useState({ name: brand.name, displayName: brand.displayName, logo: brand.logo || "", active: brand.active });
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const dirty = f.name !== brand.name || f.displayName !== brand.displayName || f.logo !== (brand.logo || "") || f.active !== brand.active;

  const save = async () => {
    setBusy(true);
    try {
      let logo = f.logo;
      if (isExternal(logo)) logo = (await api.post(`/admin/brands/${brand.slug}/import`, { image: logo })).data.logo;
      const { data } = await api.put(`/admin/brands/${brand.slug}`, { ...f, logo });
      onSaved(data);
      toast({ title: "Brand updated", description: `${data.displayName} · /brand/${data.slug}` });
    } catch (e) {
      toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete brand "${brand.displayName}"? Only possible when no products use it.`)) return;
    try {
      await api.delete(`/admin/brands/${brand.slug}`);
      onDeleted(brand.slug);
      toast({ title: "Brand deleted", description: brand.displayName });
    } catch (e) {
      toast({ title: "Cannot delete", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  return (
    <div data-testid={`brand-row-${brand.slug}`} className={`border rounded-xl p-4 bg-white grid grid-cols-1 lg:grid-cols-[72px_1fr_1fr_1.2fr_auto] gap-4 items-start ${brand.active ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-70"}`}>
      <div className="h-[72px] w-[72px] rounded-lg border border-neutral-200 bg-neutral-50 grid place-items-center overflow-hidden" data-testid={`brand-logo-preview-${brand.slug}`}>
        {f.logo ? <img src={imgUrl(f.logo)} alt="" className="h-full w-full object-contain p-1" /> : <Tag className="h-5 w-5 text-neutral-300" />}
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Brand name</label>
        <input data-testid={`brand-name-${brand.slug}`} className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <p className="text-[11px] text-neutral-500 mt-1.5 flex items-center gap-1"><Link2 className="h-3 w-3" /> URL: <span className="font-mono" data-testid={`brand-slug-${brand.slug}`}>/brand/{brand.slug}</span> (fixed)</p>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Display name (shown to customers)</label>
        <input data-testid={`brand-display-${brand.slug}`} className={inputCls} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
        <label className="mt-2 inline-flex items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" data-testid={`brand-active-${brand.slug}`} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active · {brand.productCount} product{brand.productCount === 1 ? "" : "s"}
        </label>
      </div>
      <ImageField label="Logo (JPG, PNG, WEBP — transparent PNG preferred)" value={f.logo} onChange={(v) => setF({ ...f, logo: v })} testId={`brand-logo-${brand.slug}`} />
      <div className="flex lg:flex-col gap-2">
        <button type="button" disabled={busy || !dirty} onClick={save} data-testid={`brand-save-${brand.slug}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full hover:bg-emerald-700 disabled:opacity-40 transition-colors whitespace-nowrap">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Update Brand
        </button>
        {f.logo && (
          <button type="button" onClick={() => setF({ ...f, logo: "" })} data-testid={`brand-remove-logo-${brand.slug}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-neutral-300 text-neutral-700 text-xs font-bold rounded-full hover:bg-neutral-50 whitespace-nowrap">
            <X className="h-3.5 w-3.5" /> Remove logo
          </button>
        )}
        {brand.productCount === 0 && (
          <button type="button" onClick={remove} data-testid={`brand-delete-${brand.slug}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 text-xs font-bold rounded-full hover:bg-red-50 whitespace-nowrap">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>
    </div>
  );
};

export const NewBrandForm = ({ onCreated, onCancel, compact = false }) => {
  const [f, setF] = useState({ name: "", displayName: "", logo: "" });
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/admin/brands", { name: f.name, displayName: f.displayName || f.name, logo: isExternal(f.logo) ? "" : f.logo });
      if (isExternal(f.logo)) {
        const imp = await api.post(`/admin/brands/${data.slug}/import`, { image: f.logo });
        data.logo = imp.data.logo;
      }
      toast({ title: "Brand created", description: `${data.displayName} · /brand/${data.slug}` });
      onCreated(data);
    } catch (err) {
      toast({ title: "Could not create brand", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} data-testid="new-brand-form" className="border border-emerald-200 bg-emerald-50/60 rounded-xl p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr_auto] gap-4 items-end">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Brand name *</label>
        <input required data-testid="new-brand-name" className={inputCls} placeholder="e.g. Exotic" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <p className="text-[11px] text-neutral-500 mt-1">URL will be /brand/{f.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "…"}</p>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Display name</label>
        <input data-testid="new-brand-display" className={inputCls} placeholder="Defaults to brand name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      </div>
      {!compact && <ImageField label="Logo (optional)" value={f.logo} onChange={(v) => setF({ ...f, logo: v })} testId="new-brand-logo" />}
      <div className="flex gap-2">
        <button disabled={busy} data-testid="new-brand-submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full hover:bg-emerald-700 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create Brand</button>
        {onCancel && <button type="button" onClick={onCancel} data-testid="new-brand-cancel" className="px-4 py-2 border border-neutral-300 text-xs font-bold rounded-full hover:bg-white">Cancel</button>}
      </div>
    </form>
  );
};

const AdminBrands = () => {
  const { refresh } = useCatalog();
  const [brands, setBrands] = useState(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => api.get("/admin/brands").then(({ data }) => setBrands(data.brands));
  useEffect(() => { load(); }, []);

  const onSaved = (b) => { setBrands((prev) => prev.map((x) => (x.slug === b.slug ? { ...x, ...b } : x))); refresh(); };
  const onDeleted = (slug) => { setBrands((prev) => prev.filter((x) => x.slug !== slug)); refresh(); };
  const onCreated = (b) => { setBrands((prev) => [...prev, b].sort((a, c) => a.displayName.localeCompare(c.displayName))); setAdding(false); refresh(); };

  const list = (brands || []).filter((b) => `${b.name} ${b.displayName} ${b.slug}`.toLowerCase().includes(q.toLowerCase()));
  const withLogo = (brands || []).filter((b) => b.logo).length;

  return (
    <div data-testid="admin-brands">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-tight">Brands</h1>
          <p className="text-sm text-neutral-500 mt-1" data-testid="brands-summary">{brands ? `${brands.length} brands · ${withLogo} with a logo. Display names and logos appear everywhere on the site; URL slugs never change.` : "Loading…"}</p>
        </div>
        <div className="flex gap-2">
          <input data-testid="brand-search" placeholder="Search brands…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-56 border border-neutral-300 rounded-full px-4 py-2 text-sm outline-none focus:border-emerald-600" />
          <button onClick={() => setAdding((v) => !v)} data-testid="add-brand-btn" className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-full hover:bg-neutral-800 whitespace-nowrap"><Plus className="h-4 w-4" /> Add Brand</button>
        </div>
      </div>
      {adding && <div className="mb-5"><NewBrandForm onCreated={onCreated} onCancel={() => setAdding(false)} /></div>}
      {!brands ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="space-y-3">
          {list.map((b) => <BrandRow key={`${b.slug}-${b.updatedAt || ""}-${b.logo}`} brand={b} onSaved={onSaved} onDeleted={onDeleted} />)}
        </div>
      )}
    </div>
  );
};

export default AdminBrands;

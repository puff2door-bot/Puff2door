import React, { useEffect, useRef, useState } from "react";
import { X, Upload, Link2, Loader2, Trash2 } from "lucide-react";
import api, { imgUrl } from "../../api";
import { FLAVOR_KEYWORDS } from "../../mock";
import { useToast } from "../../hooks/use-toast";
import SearchableSelect from "../../components/admin/SearchableSelect";

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
  name: "", category: "", categorySlug: "", price: "", salePrice: "", image: "", image2: "",
  brand: "", brandName: "", flavors: [], puffs: "", size: "", stock: 0, sku: "", barcode: "", active: true, description: "",
  complianceCategory: "regulated", minimumAge: 21, requiresIdAtDelivery: true, localDeliveryOnly: true,
  allowedStates: [], blockedStates: [],
};

const ProductForm = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState({ ...emptyProduct, ...initial, price: initial?.price ?? "", salePrice: initial?.salePrice ?? "", puffs: initial?.puffs ?? "",
    allowedStates: (initial?.allowedStates || []).join(", "), blockedStates: (initial?.blockedStates || []).join(", ") });
  const [busy, setBusy] = useState(false);
  const [confirmCloverPrice, setConfirmCloverPrice] = useState(false);
  const [confirmCloverStock, setConfirmCloverStock] = useState(false);
  // New products go to Clover by default so both systems stay in step.
  const [createInClover, setCreateInClover] = useState(!initial?.id);
  const { toast } = useToast();
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const [brandList, setBrandList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [usedFlavors, setUsedFlavors] = useState([]);
  const [newFlavor, setNewFlavor] = useState("");
  const flavorChoices = [...new Set([...FLAVOR_KEYWORDS, ...usedFlavors, ...(f.flavors || [])])]
    .sort((a, b) => a.localeCompare(b));
  const addFlavor = () => {
    const text = newFlavor.replace(/\s+/g, " ").trim().slice(0, 30)
      .toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    if (!text) return;
    const existing = flavorChoices.find((x) => x.toLowerCase() === text.toLowerCase()) || text;
    setF((prev) => ({ ...prev, flavors: prev.flavors.includes(existing) ? prev.flavors : [...prev.flavors, existing] }));
    setNewFlavor("");
  };
  useEffect(() => {
    // Flavors already used on any product, so ones added before can be picked again.
    api.get("/products").then(({ data }) => {
      const rows = data.products || data.items || data || [];
      setUsedFlavors([...new Set(rows.flatMap((p) => p.flavors || []).filter(Boolean))]);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    api.get("/admin/brands").then(({ data }) => setBrandList(data.brands || [])).catch(() => {});
    api.get("/admin/categories").then(({ data }) => {
      const rows = data.categories || [];
      setCategories(rows);
      if (!initial?.categorySlug && rows[0]) setF((prev) => ({ ...prev, categorySlug: prev.categorySlug || rows[0].slug, category: prev.category || rows[0].name }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      minimumAge: Number(f.minimumAge),
      allowedStates: String(f.allowedStates || "").split(/[\s,]+/).map((v) => v.trim().toUpperCase()).filter(Boolean),
      blockedStates: String(f.blockedStates || "").split(/[\s,]+/).map((v) => v.trim().toUpperCase()).filter(Boolean),
      brandName: f.brand ? f.brandName : "",
      confirmCloverPrice,
      confirmCloverStock,
      createInClover,
    };
    delete payload.id; delete payload.slug; delete payload.inStock; delete payload.rating; delete payload.restockNotified;
    delete payload.cloverItemId; delete payload.cloverLastSyncedAt; delete payload.cloverLastPushedAt; delete payload.cloverSyncError; delete payload.cloverSync;
    try {
      const { data } = isEdit ? await api.put(`/admin/products/${initial.id}`, payload) : await api.post("/admin/products", payload);
      const clover = data.cloverSync || {};
      const stock = data.cloverStock || {};
      if (stock.status === "needs_confirmation") {
        toast({ title: "Confirm the Clover stock change", description: stock.error, variant: "destructive" });
      } else if (stock.status === "failed") {
        toast({ title: "Product saved — Clover stock not updated", description: stock.error || "Open Clover Inventory to retry.", variant: "destructive" });
      } else if (clover.status === "needs_confirmation") {
        toast({ title: "Confirm the Clover price", description: clover.error || "A price change over 50% or to $0 needs confirmation.", variant: "destructive" });
      } else if (["failed", "partial"].includes(clover.status)) {
        toast({ title: "Product saved — Clover needs a retry", description: clover.error || clover.priceBlocked || "Open Clover Inventory to retry the sync.", variant: "destructive" });
      } else {
        const stockText = stock.status === "success" ? ` Clover stock ${stock.delta > 0 ? "+" : ""}${stock.delta} (now ${stock.resultingQuantity}).` : "";
        const cloverText = (clover.status === "success" ? (clover.action === "create" ? " Created in Clover." : " Clover updated.") : "") + stockText;
        toast({ title: isEdit ? "Product updated" : "Product created", description: (data.restockNotified ? `${data.restockNotified} customer(s) notified of restock.` : data.name) + cloverText });
      }
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
          <SearchableSelect
            label="Category"
            required
            testId="pf-category"
            placeholder="Search categories"
            labelClassName="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5"
            buttonClassName={inputCls}
            options={categories.map((category) => ({ value: category.slug, label: `${category.name}${category.active ? "" : " (inactive)"}` }))}
            value={f.categorySlug}
            onChange={(slug) => { const category = categories.find((row) => row.slug === slug); set("categorySlug", slug); set("category", category?.name || ""); }}
          />
          <SearchableSelect
            label="Brand"
            testId="pf-brand"
            placeholder="Search brands"
            labelClassName="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5"
            buttonClassName={inputCls}
            emptyOption={{ value: "", label: "None" }}
            options={brandList.length
              ? brandList.map((brand) => ({ value: brand.slug, label: `${brand.displayName}${brand.active ? "" : " (inactive)"}` }))
              : (f.brand ? [{ value: f.brand, label: f.brandName || f.brand }] : [])}
            value={f.brand || ""}
            onChange={(slug) => { const brand = brandList.find((row) => row.slug === slug); setF((prev) => ({ ...prev, brand: slug, brandName: brand ? brand.displayName : "" })); }}
          />
        </div>
        <p className="text-xs text-neutral-500 -mt-3">Categories and brands are the ones already saved. Add new ones from Categories or Brands, not from this form.</p>

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
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Strength / size</label>
            <input type="text" maxLength={30} data-testid="pf-size" className={inputCls} placeholder="e.g. 500 mg or 3.5 g" value={f.size || ""} onChange={(e) => set("size", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">SKU</label>
            <input data-testid="pf-sku" className={inputCls} placeholder="Exact Clover SKU" value={f.sku || ""} onChange={(e) => set("sku", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Barcode / UPC</label>
            <input data-testid="pf-barcode" className={inputCls} placeholder="Exact Clover barcode" value={f.barcode || ""} onChange={(e) => set("barcode", e.target.value)} />
          </div>
          <p className="sm:col-span-2 text-xs text-neutral-600">Clover can safely match this product when the SKU or barcode is exact and unique.{f.cloverItemId ? ` Connected to Clover item ${f.cloverItemId}.` : ""}</p>
        </div>

        <ImageField label="Main photo" value={f.image} onChange={(v) => set("image", v)} testId="pf-image" />
        <ImageField label="Hover / second photo" value={f.image2} onChange={(v) => set("image2", v)} testId="pf-image2" />

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Flavors</label>
          <div className="flex flex-wrap gap-1.5">
            {flavorChoices.map((fl) => {
              const on = f.flavors.includes(fl);
              return (
                <button type="button" key={fl} onClick={() => set("flavors", on ? f.flavors.filter((x) => x !== fl) : [...f.flavors, fl])} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-emerald-600 border-emerald-600 text-white" : "border-neutral-300 text-neutral-600 hover:border-emerald-500"}`}>{fl}</button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              data-testid="pf-new-flavor"
              value={newFlavor}
              maxLength={30}
              onChange={(e) => setNewFlavor(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFlavor(); } }}
              placeholder="Add a flavor, e.g. Pink Lemonade"
              className="flex-1 min-w-0 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <button type="button" data-testid="pf-add-flavor" onClick={addFlavor} disabled={!newFlavor.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white disabled:opacity-40">Add</button>
          </div>
          <p className="text-xs text-neutral-500 mt-1">Click a flavor to turn it on or off. New flavors show in the shop's Flavor filter once saved.</p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Description</label>
          <textarea rows={3} data-testid="pf-description" className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>

        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-4" data-testid="pf-compliance">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Product restrictions</h3>
            <p className="text-xs text-neutral-600 mt-1">These rules are captured with each order and enforced by checkout. Use two-letter state codes such as FL.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Compliance category</label><select className={inputCls} data-testid="pf-compliance-category" value={f.complianceCategory} onChange={(e) => set("complianceCategory", e.target.value)}><option value="regulated">Regulated product</option><option value="nicotine">Nicotine</option><option value="hemp">Hemp derived</option><option value="kratom">Kratom</option><option value="accessory">Accessory</option><option value="general">General merchandise</option></select></div>
            <div><label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Minimum age</label><input required type="number" min="0" max="99" step="1" className={inputCls} data-testid="pf-minimum-age" value={f.minimumAge} onChange={(e) => set("minimumAge", e.target.value)} /></div>
            <div><label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Allowed states</label><input className={inputCls} data-testid="pf-allowed-states" placeholder="FL (blank = any)" value={f.allowedStates} onChange={(e) => set("allowedStates", e.target.value.replace(/[^a-zA-Z,\s]/g, ""))} /></div>
            <div><label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Blocked states</label><input className={inputCls} data-testid="pf-blocked-states" placeholder="State codes, comma separated" value={f.blockedStates} onChange={(e) => set("blockedStates", e.target.value.replace(/[^a-zA-Z,\s]/g, ""))} /></div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer"><input type="checkbox" className="accent-emerald-600 h-4 w-4" checked={f.requiresIdAtDelivery} onChange={(e) => set("requiresIdAtDelivery", e.target.checked)} /> ID check required at delivery</label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer"><input type="checkbox" className="accent-emerald-600 h-4 w-4" checked={f.localDeliveryOnly} onChange={(e) => set("localDeliveryOnly", e.target.checked)} /> Local delivery only</label>
          </div>
        </section>

        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" data-testid="pf-active" className="accent-emerald-600 h-4 w-4" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Visible in store
        </label>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" data-testid="pf-create-clover" className="accent-emerald-600 h-4 w-4" checked={createInClover} onChange={(e) => setCreateInClover(e.target.checked)} /> Create in Clover if this product is not linked yet
        </label>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" data-testid="pf-confirm-price" className="accent-emerald-600 h-4 w-4" checked={confirmCloverPrice} onChange={(e) => setConfirmCloverPrice(e.target.checked)} /> Confirm a Clover price change over 50% or to $0
        </label>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" data-testid="pf-confirm-stock" className="accent-emerald-600 h-4 w-4" checked={confirmCloverStock} onChange={(e) => setConfirmCloverStock(e.target.checked)} /> Confirm a large Clover stock change (more than 50 units)
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

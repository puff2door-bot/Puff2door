import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Search, RefreshCw, Trash2, Copy, ChevronRight, LayoutList, LayoutGrid, X } from "lucide-react";
import api, { imgUrl } from "../../api";
import { useToast } from "../../hooks/use-toast";
import { useCatalog } from "../../context/CatalogContext";
import ProductForm from "./ProductForm";
import ImageMigrationPanel from "./ImageMigrationPanel";

const PAGE = 25;

// Things that need the owner's attention, shown as tiles and per-product tags.
const flagsOf = (p) => {
  const f = [];
  if (!p.active) f.push("hidden");
  if (p.stock === 0) f.push("out");
  else if (p.stock <= 2) f.push("low");
  if (!p.image) f.push("nophoto");
  if (!p.cloverItemId) f.push("unlinked");
  if (p.cloverSyncError) f.push("cloverError");
  if (Number(p.price) < 1) f.push("price");
  if (!p.brandName) f.push("nobrand");
  return f;
};

const STATUS = [
  { key: "all", label: "All products", hint: "Everything", dot: "bg-neutral-500" },
  { key: "visible", label: "On website", hint: "Customers can buy", dot: "bg-emerald-600" },
  { key: "hidden", label: "Hidden", hint: "Not on the site", dot: "bg-neutral-400" },
  { key: "out", label: "Out of stock", hint: "0 left", dot: "bg-red-600" },
  { key: "low", label: "Low stock", hint: "1–2 left", dot: "bg-amber-600" },
  { key: "nophoto", label: "No photo", hint: "Needs a picture", dot: "bg-violet-600" },
  { key: "price", label: "Price check", hint: "Under $1, likely wrong", dot: "bg-pink-700" },
  { key: "unlinked", label: "Not linked", hint: "Not matched to Clover", dot: "bg-blue-600" },
];

const TAGS = {
  out: ["Out of stock", "bg-red-50 text-red-700"],
  low: ["Low", "bg-amber-50 text-amber-700"],
  nophoto: ["No photo", "bg-violet-50 text-violet-700"],
  unlinked: ["Not linked to Clover", "bg-blue-50 text-blue-700"],
  cloverError: ["Clover retry needed", "bg-red-100 text-red-700"],
  price: ["Price check", "bg-pink-50 text-pink-700"],
  nobrand: ["No brand", "bg-neutral-100 text-neutral-600"],
};

const NO_CAT = "NO CATEGORY";
const catOf = (p) => p.category || NO_CAT;

const matchStatus = (p, key) => (key === "all" ? true : key === "visible" ? p.active : flagsOf(p).includes(key));

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  stockLow: (a, b) => a.stock - b.stock || a.name.localeCompare(b.name),
  priceHigh: (a, b) => b.price - a.price,
  recent: (a, b) => b.id - a.id,
};

const Switch = ({ on, onClick, label, busy }) => (
  <button type="button" onClick={onClick} disabled={busy} aria-pressed={on} aria-label={label} className="inline-flex items-center gap-2 py-1 disabled:opacity-50">
    <span className={`inline-flex w-10 h-6 rounded-full p-[3px] transition-colors ${on ? "bg-emerald-600 justify-end" : "bg-neutral-300 justify-start"}`}>
      <span className="block h-[18px] w-[18px] rounded-full bg-white shadow" />
    </span>
  </button>
);

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [status, setStatus] = useState("all");
  const [brand, setBrand] = useState("");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState(() => { try { return localStorage.getItem("p2d_admin_products_view") || "list"; } catch { return "list"; } });
  const [closed, setClosed] = useState({});
  const [limits, setLimits] = useState({});
  const [sel, setSel] = useState({});
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState({});
  const [bulkCat, setBulkCat] = useState("");
  const [bulkBrand, setBulkBrand] = useState("__keep");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { refresh } = useCatalog();
  const { toast } = useToast();

  const load = () => api.get("/admin/products").then(({ data }) => setProducts(data.products)).finally(() => setLoading(false));
  useEffect(() => {
    load();
    api.get("/admin/categories").then(({ data }) => setCategories(data.categories || [])).catch(() => {});
    api.get("/admin/brands").then(({ data }) => setBrands(data.brands || [])).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem("p2d_admin_products_view", view); } catch { /* ignore */ } }, [view]);

  useEffect(() => {
    if (searchParams.get("new")) { setEditing({}); setSearchParams({}); return; }
    const id = searchParams.get("edit");
    if (id && products.length) {
      const p = products.find((x) => x.id === Number(id));
      if (p) setEditing(p);
      setSearchParams({});
    }
  }, [searchParams, products, setSearchParams]);

  const replace = (p) => setProducts((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [...prev, p]));

  // Search + brand narrow everything; status and category are counted inside that.
  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => (!brand || p.brandName === brand) && (!s || `${p.name} ${p.brandName} ${p.category} ${p.id} ${p.sku || ""} ${p.barcode || ""}`.toLowerCase().includes(s)));
  }, [products, q, brand]);

  const inCat = (p) => cat === "ALL" || catOf(p) === cat;
  const tiles = STATUS.map((st) => ({ ...st, count: base.filter((p) => inCat(p) && matchStatus(p, st.key)).length }));
  const inStatus = base.filter((p) => matchStatus(p, status));

  const catNames = useMemo(() => {
    const fromList = categories.map((c) => c.name);
    const extra = [...new Set(products.map(catOf))].filter((c) => c !== NO_CAT && !fromList.includes(c));
    const missing = products.some((p) => !p.category) ? [NO_CAT] : [];
    return [...missing, ...fromList, ...extra.sort()];
  }, [categories, products]);

  const catRow = (name, rows, key) => {
    const live = rows.filter((p) => p.active && p.stock > 0).length;
    return { name, key, count: rows.length, live, pct: rows.length ? Math.round((live / rows.length) * 100) : 0 };
  };
  const catRows = [catRow("All categories", inStatus, "ALL"), ...catNames.map((c) => catRow(c, inStatus.filter((p) => catOf(p) === c), c))];

  const shown = inStatus.filter(inCat).sort(SORTS[sort] || SORTS.name);
  const groupNames = cat === "ALL" ? catNames.filter((c) => shown.some((p) => catOf(p) === c)) : (shown.length ? [cat] : []);
  const brandNames = useMemo(() => [...new Set(products.map((p) => p.brandName).filter(Boolean))].sort(), [products]);
  const hasFilters = Boolean(q || brand || status !== "all" || cat !== "ALL");
  const clearAll = () => { setQ(""); setBrand(""); setStatus("all"); setCat("ALL"); };
  const selectedIds = Object.keys(sel).filter((id) => sel[id]).map(Number);

  const quick = async (p, patch, confirm = false) => {
    setBusy((b) => ({ ...b, [p.id]: true }));
    try {
      const { data } = await api.patch(`/admin/products/${p.id}`, { ...patch, confirmCloverPrice: confirm });
      const clover = data.cloverSync || {};
      if (clover.status === "needs_confirmation") {
        if (window.confirm(`${clover.error || "This is a big price change."}\n\nSave $${Number(patch.price).toFixed(2)} for "${p.name}" on the website AND Clover?`)) {
          return quick(p, patch, true);
        }
        setPrices((x) => { const n = { ...x }; delete n[p.id]; return n; });
        toast({ title: "Price not changed", description: p.name });
        return false;
      }
      replace(data);
      if ("price" in patch) setPrices((x) => { const n = { ...x }; delete n[p.id]; return n; });
      if (clover.status === "failed") toast({ title: "Saved on the website. Clover needs a retry", description: clover.error || p.name, variant: "destructive" });
      return true;
    } catch (error) {
      toast({ title: "Not saved", description: error?.response?.data?.detail || "Try again.", variant: "destructive" });
      return false;
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[p.id]; return n; });
    }
  };

  const savePrice = (p) => {
    const raw = prices[p.id];
    if (raw === undefined) return;
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0 || raw === "") { toast({ title: "Enter a price like 19.99", variant: "destructive" }); return; }
    if (Math.abs(val - p.price) < 0.005) { setPrices((x) => { const n = { ...x }; delete n[p.id]; return n; }); return; }
    quick(p, { price: Math.round(val * 100) / 100 }).then((ok) => ok && toast({ title: "Price saved", description: `${p.name}: $${val.toFixed(2)}` }));
  };

  const toggleVisible = (p) => quick(p, { active: !p.active });

  const applyBulk = async (patch, label) => {
    const rows = products.filter((p) => sel[p.id]);
    if (!rows.length) return;
    setBulkBusy(true);
    let ok = 0;
    for (const p of rows) {
      try {
        const { data } = await api.patch(`/admin/products/${p.id}`, patch);
        replace(data);
        ok += 1;
      } catch { /* counted below */ }
    }
    setBulkBusy(false);
    refresh();
    toast({ title: `${label}: ${ok} of ${rows.length} updated`, variant: ok === rows.length ? "default" : "destructive" });
    if (ok === rows.length) { setSel({}); setBulkCat(""); setBulkBrand("__keep"); }
  };

  const applyBulkMove = () => {
    const patch = {};
    if (bulkCat) patch.categorySlug = bulkCat;
    if (bulkBrand !== "__keep") patch.brand = bulkBrand;
    if (!Object.keys(patch).length) { toast({ title: "Pick a category or brand first" }); return; }
    applyBulk(patch, "Moved");
  };

  const onSaved = (p) => { replace(p); setEditing(null); refresh(); };

  const duplicate = (p) => {
    const copy = { ...p, name: `${p.name} (new flavor)`, stock: 0, sku: "", barcode: "", flavors: [] };
    delete copy.id; delete copy.slug; delete copy.cloverItemId; delete copy.cloverSyncError; delete copy.cloverLastSyncedAt; delete copy.cloverLastPushedAt;
    setEditing(copy);
  };

  const removeEverywhere = async (p) => {
    if (!window.confirm(`Permanently delete "${p.name}" from the WEBSITE and from your CLOVER register?\n\nThis cannot be undone. To only take it off the website, use the switch instead.`)) return;
    try {
      const { data } = await api.delete(`/admin/products/${p.id}/permanent`);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      refresh();
      toast({ title: "Product deleted", description: `${data.name || p.name} was deleted from the website${data.cloverDeleted ? " and Clover" : ""}.` });
    } catch (error) {
      toast({ title: "Not deleted", description: error?.response?.data?.detail || "Try again.", variant: "destructive" });
    }
  };

  const retryClover = async (p) => {
    try {
      await api.post(`/admin/clover/products/${p.id}/retry`);
      await load();
      toast({ title: "Clover updated", description: p.name });
    } catch (error) {
      toast({ title: "Clover retry failed", description: error?.response?.data?.detail || "Try again from Clover Inventory.", variant: "destructive" });
    }
  };

  const stockCls = (n) => (n === 0 ? "bg-red-50 text-red-700" : n <= 2 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700");
  const tagList = (p) => flagsOf(p).filter((k) => TAGS[k]).map((k) => <span key={k} className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${TAGS[k][1]}`}>{TAGS[k][0]}</span>);
  const thumb = (p, big) => (
    <div className={`${big ? "h-32 w-full" : "h-12 w-12"} rounded-xl shrink-0 grid place-items-center overflow-hidden ${p.image ? "bg-neutral-50 border border-neutral-200 p-1" : "border-2 border-dashed border-violet-300 text-violet-700 text-[10px] font-bold"}`}>
      {p.image ? <img src={imgUrl(p.image)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : "No photo"}
    </div>
  );
  const priceBox = (p) => {
    const dirty = prices[p.id] !== undefined;
    return (
      <div>
        <label className={`flex items-center gap-1 border rounded-lg px-2 h-9 w-[104px] bg-white ${dirty ? "border-amber-500" : "border-neutral-300"}`}>
          <span className="text-neutral-500 text-sm">$</span>
          <span className="sr-only">Price for {p.name}</span>
          <input
            data-testid={`admin-price-${p.id}`}
            inputMode="decimal"
            value={dirty ? prices[p.id] : Number(p.price).toFixed(2)}
            onChange={(e) => setPrices((x) => ({ ...x, [p.id]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setPrices((x) => { const n = { ...x }; delete n[p.id]; return n; }); }}
            onBlur={() => savePrice(p)}
            disabled={busy[p.id]}
            className="w-16 outline-none text-sm font-semibold bg-transparent"
          />
        </label>
        {p.salePrice != null && p.salePrice < p.price && <span className="block text-[11px] text-emerald-700 mt-0.5">Sale ${Number(p.salePrice).toFixed(2)}</span>}
        {dirty && <span className="block text-[11px] text-amber-700 mt-0.5">Enter to save · also updates Clover</span>}
      </div>
    );
  };
  const actions = (p) => (
    <div className="flex justify-end gap-1">
      <button onClick={() => setEditing(p)} data-testid={`admin-edit-${p.id}`} className="h-9 w-9 grid place-items-center rounded-lg border border-neutral-200 hover:bg-emerald-50 text-neutral-700" aria-label={`Edit ${p.name}`} title="Edit"><Pencil className="h-4 w-4" /></button>
      <button onClick={() => duplicate(p)} className="h-9 w-9 grid place-items-center rounded-lg border border-neutral-200 hover:bg-emerald-50 text-neutral-700" aria-label={`Copy ${p.name} as a new flavor`} title="Copy as a new flavor"><Copy className="h-4 w-4" /></button>
      {p.cloverSyncError && <button onClick={() => retryClover(p)} className="h-9 w-9 grid place-items-center rounded-lg border border-amber-200 hover:bg-amber-50 text-amber-600" aria-label="Retry Clover sync" title="Retry Clover"><RefreshCw className="h-4 w-4" /></button>}
      <button onClick={() => removeEverywhere(p)} data-testid={`admin-delete-${p.id}`} className="h-9 w-9 grid place-items-center rounded-lg border border-neutral-200 hover:bg-red-50 text-neutral-500 hover:text-red-700" aria-label="Delete from website and Clover" title="Delete from website and Clover"><Trash2 className="h-4 w-4" /></button>
    </div>
  );

  return (
    <div data-testid="admin-products" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="font-heading text-3xl uppercase tracking-tight">Products <span className="text-neutral-400 text-xl">({products.length})</span></h1>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center border border-neutral-300 rounded-full px-3 bg-white focus-within:border-emerald-600">
            <Search className="h-4 w-4 text-neutral-400" />
            <span className="sr-only">Search products</span>
            <input data-testid="admin-product-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, SKU or barcode" className="px-2 py-2.5 text-sm outline-none w-64 max-w-full bg-transparent" />
            {q && <button onClick={() => setQ("")} aria-label="Clear search" className="text-neutral-400 hover:text-neutral-700"><X className="h-4 w-4" /></button>}
          </label>
          <button onClick={() => setEditing({})} data-testid="admin-add-product" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700"><Plus className="h-4 w-4" /> Add Product</button>
        </div>
      </div>

      <ImageMigrationPanel onChanged={() => { load(); refresh(); }} />

      {loading ? (
        <p className="text-neutral-500">Loading products...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5" data-testid="admin-product-tiles">
            {tiles.map((t) => (
              <button key={t.key} onClick={() => setStatus(t.key)} aria-pressed={status === t.key} className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 text-left transition-colors ${status === t.key ? "border-emerald-700 bg-emerald-50" : "border-neutral-200 bg-white hover:border-emerald-300"}`}>
                <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-neutral-600"><span className={`h-2 w-2 rounded-full ${t.dot}`} />{t.label}</span>
                <span className="font-heading text-3xl leading-none">{t.count}</span>
                <span className="text-[11px] text-neutral-500">{t.hint}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-5 items-start">
            <nav aria-label="Categories" className="flex-[1_1_220px] max-w-[280px] bg-white border border-neutral-200 rounded-2xl p-3 space-y-0.5 lg:sticky lg:top-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500 px-2 pt-1 pb-2">Categories</p>
              {catRows.map((c) => (
                <button key={c.key} onClick={() => setCat(c.key)} aria-pressed={cat === c.key} className={`w-full flex flex-col gap-1.5 p-2.5 rounded-xl text-left ${cat === c.key ? "bg-emerald-50 shadow-[inset_3px_0_0_#047857]" : "hover:bg-neutral-50"}`}>
                  <span className="flex justify-between items-center gap-2 w-full">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <span className="text-xs font-bold text-neutral-600 bg-neutral-100 rounded-full px-2 py-0.5">{c.count}</span>
                  </span>
                  <span className="block h-1 w-full rounded bg-neutral-100 overflow-hidden"><span className="block h-1 rounded bg-emerald-500" style={{ width: `${c.pct}%` }} /></span>
                  <span className="text-[11px] text-neutral-500">{c.count ? `${c.live} live · ${c.count - c.live} need attention` : "Nothing here"}</span>
                </button>
              ))}
            </nav>

            <div className="flex-[999_1_640px] min-w-0 space-y-3.5">
              <div className="flex flex-wrap gap-2.5 items-center justify-between bg-white border border-neutral-200 rounded-xl px-3 py-2.5">
                <div className="flex flex-wrap gap-3 items-center text-sm text-neutral-600">
                  <label className="flex items-center gap-1.5">Brand
                    <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 border border-neutral-300 rounded-lg px-2 text-sm bg-white">
                      <option value="">All brands</option>
                      {brandNames.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">Sort
                    <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 border border-neutral-300 rounded-lg px-2 text-sm bg-white">
                      <option value="name">Name A–Z</option>
                      <option value="stockLow">Lowest stock first</option>
                      <option value="priceHigh">Highest price first</option>
                      <option value="recent">Newest first</option>
                    </select>
                  </label>
                  <span className="text-neutral-500">Showing {shown.length} of {products.length}</span>
                  {hasFilters && <button onClick={clearAll} className="font-bold text-emerald-700 hover:underline">Clear filters</button>}
                </div>
                <div role="group" aria-label="View" className="flex bg-neutral-100 rounded-lg p-0.5">
                  <button onClick={() => setView("list")} aria-pressed={view === "list"} className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-bold ${view === "list" ? "bg-white shadow-sm" : "text-neutral-600"}`}><LayoutList className="h-4 w-4" />List</button>
                  <button onClick={() => setView("grid")} aria-pressed={view === "grid"} className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-bold ${view === "grid" ? "bg-white shadow-sm" : "text-neutral-600"}`}><LayoutGrid className="h-4 w-4" />Photos</button>
                </div>
              </div>

              {selectedIds.length > 0 && (
                <div className="sticky top-2 z-10 flex flex-wrap gap-2.5 items-center bg-neutral-900 text-white rounded-xl px-3.5 py-2.5" data-testid="admin-bulk-bar">
                  <span className="font-bold text-sm">{selectedIds.length} selected</span>
                  <span className="w-px h-5 bg-neutral-700" />
                  <label className="flex items-center gap-1.5 text-sm">Move to
                    <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} className="h-8 rounded-md text-neutral-900 px-2 text-sm">
                      <option value="">Same category</option>
                      {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">Brand
                    <select value={bulkBrand} onChange={(e) => setBulkBrand(e.target.value)} className="h-8 rounded-md text-neutral-900 px-2 text-sm">
                      <option value="__keep">Same brand</option>
                      <option value="">No brand</option>
                      {brands.map((b) => <option key={b.slug} value={b.slug}>{b.displayName}</option>)}
                    </select>
                  </label>
                  <button disabled={bulkBusy} onClick={applyBulkMove} className="h-8 px-3.5 rounded-md bg-emerald-400 text-emerald-950 font-bold text-sm disabled:opacity-50">Apply</button>
                  <button disabled={bulkBusy} onClick={() => applyBulk({ active: true }, "Shown on website")} className="h-8 px-3 rounded-md border border-neutral-600 text-sm font-semibold disabled:opacity-50">Show on site</button>
                  <button disabled={bulkBusy} onClick={() => applyBulk({ active: false }, "Hidden")} className="h-8 px-3 rounded-md border border-neutral-600 text-sm font-semibold disabled:opacity-50">Hide</button>
                  <button onClick={() => setSel({})} className="ml-auto text-sm font-semibold text-emerald-300">Clear selection</button>
                </div>
              )}

              {shown.length === 0 && (
                <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center text-neutral-600 text-sm">
                  No products match these filters. {hasFilters && <button onClick={clearAll} className="font-bold text-emerald-700 hover:underline">Clear filters</button>}
                </div>
              )}

              {groupNames.map((g) => {
                const rows = shown.filter((p) => catOf(p) === g);
                const open = !closed[g];
                const limit = limits[g] || PAGE;
                const visibleRows = rows.slice(0, limit);
                const out = rows.filter((p) => p.stock === 0).length;
                const hiddenN = rows.filter((p) => !p.active).length;
                const allSel = visibleRows.length > 0 && visibleRows.every((p) => sel[p.id]);
                const toggleAll = () => setSel((s) => { const n = { ...s }; visibleRows.forEach((p) => { n[p.id] = !allSel; }); return n; });
                return (
                  <section key={g} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden" data-testid={`admin-group-${g}`}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                      <button onClick={() => setClosed((c) => ({ ...c, [g]: open }))} aria-expanded={open} className="flex items-center gap-2.5 text-left">
                        <ChevronRight className={`h-4 w-4 text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`} />
                        <span className="font-heading text-xl uppercase">{g}</span>
                        <span className="text-sm text-neutral-500">{rows.length} products</span>
                      </button>
                      <span className="ml-auto flex flex-wrap gap-1.5">
                        {out > 0 && <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-red-50 text-red-700">{out} out of stock</span>}
                        {hiddenN > 0 && <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-neutral-100 text-neutral-600">{hiddenN} hidden</span>}
                      </span>
                    </div>

                    {open && view === "list" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[760px]">
                          <thead className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                            <tr>
                              <th className="pl-4 py-2.5 w-9"><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label={`Select all shown in ${g}`} className="accent-emerald-700 h-4 w-4" /></th>
                              <th className="px-2 py-2.5">Product</th>
                              <th className="px-2 py-2.5 w-36">Price</th>
                              <th className="px-2 py-2.5 w-24">Stock</th>
                              <th className="px-2 py-2.5 w-28">On website</th>
                              <th className="pr-4 py-2.5 text-right w-44">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRows.map((p) => (
                              <tr key={p.id} data-testid={`admin-product-row-${p.id}`} className={`border-t border-neutral-100 ${sel[p.id] ? "bg-emerald-50/60" : "hover:bg-neutral-50"} ${p.active ? "" : "opacity-70"}`}>
                                <td className="pl-4 py-2.5"><input type="checkbox" checked={!!sel[p.id]} onChange={() => setSel((s) => ({ ...s, [p.id]: !s[p.id] }))} aria-label={`Select ${p.name}`} className="accent-emerald-700 h-4 w-4" /></td>
                                <td className="px-2 py-2.5">
                                  <div className="flex items-center gap-3">
                                    {thumb(p)}
                                    <div className="min-w-0">
                                      <button onClick={() => setEditing(p)} className="font-semibold text-neutral-900 text-left hover:text-emerald-700 line-clamp-2">{p.name}</button>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-neutral-500">
                                        {p.brandName && <span className="font-bold tracking-wide text-emerald-700">{p.brandName}</span>}
                                        <span>#{p.id}{p.sku ? ` · SKU ${p.sku}` : ""}</span>
                                        {tagList(p)}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-2 py-2.5">{priceBox(p)}</td>
                                <td className="px-2 py-2.5"><span data-testid={`admin-stock-${p.id}`} className={`text-xs font-bold px-2.5 py-1 rounded-full ${stockCls(p.stock)}`}>{p.stock} left</span></td>
                                <td className="px-2 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <Switch on={p.active} busy={busy[p.id]} onClick={() => toggleVisible(p)} label={`Show ${p.name} on website`} />
                                    <span className="text-xs font-semibold text-neutral-600">{p.active ? "Visible" : "Hidden"}</span>
                                  </div>
                                </td>
                                <td className="pr-4 py-2.5">{actions(p)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {open && view === "grid" && (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 p-4">
                        {visibleRows.map((p) => (
                          <div key={p.id} className={`flex flex-col gap-1.5 p-2.5 rounded-xl border ${sel[p.id] ? "border-emerald-700 bg-emerald-50/60" : "border-neutral-200"} ${p.active ? "" : "opacity-70"}`}>
                            <div className="relative">
                              <button onClick={() => setEditing(p)} className="block w-full" aria-label={`Edit ${p.name}`}>{thumb(p, true)}</button>
                              <input type="checkbox" checked={!!sel[p.id]} onChange={() => setSel((s) => ({ ...s, [p.id]: !s[p.id] }))} aria-label={`Select ${p.name}`} className="absolute top-2 left-2 accent-emerald-700 h-4 w-4" />
                              <span className={`absolute top-2 right-2 text-[11px] font-bold px-2 py-0.5 rounded-full ${stockCls(p.stock)}`}>{p.stock} left</span>
                            </div>
                            {p.brandName && <span className="text-[11px] font-bold tracking-wide text-emerald-700">{p.brandName}</span>}
                            <button onClick={() => setEditing(p)} className="text-[13px] font-semibold leading-snug text-left hover:text-emerald-700 line-clamp-2">{p.name}</button>
                            <div className="flex justify-between items-center mt-auto">
                              <span className="font-heading text-lg">${Number(p.salePrice ?? p.price).toFixed(2)}</span>
                              <Switch on={p.active} busy={busy[p.id]} onClick={() => toggleVisible(p)} label={`Show ${p.name} on website`} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {open && rows.length > limit && (
                      <div className="px-4 pb-4 pt-1">
                        <button onClick={() => setLimits((l) => ({ ...l, [g]: limit + 50 }))} className="w-full h-10 rounded-xl border border-neutral-200 text-sm font-bold text-emerald-700 hover:bg-emerald-50">
                          Show more ({rows.length - limit} more in {g})
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}

      {editing !== null && <ProductForm initial={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
};

export default AdminProducts;

import React, { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Plus, Save, Trash2, Loader2, Link2, FolderTree } from "lucide-react";
import api from "../../api";
import { useCatalog } from "../../context/CatalogContext";
import { useToast } from "../../hooks/use-toast";

const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition-colors";

const CategoryRow = ({ cat, index, total, onMove, onSaved, onDeleted }) => {
  const [f, setF] = useState({ name: cat.name, active: cat.active });
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const dirty = f.name !== cat.name || f.active !== cat.active;

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/admin/categories/${cat.slug}`, f);
      onSaved(data);
    } catch (e) {
      toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete category "${cat.name}"? Only possible when no products use it.`)) return;
    try {
      await api.delete(`/admin/categories/${cat.slug}`);
      onDeleted(cat.slug);
      toast({ title: "Category deleted", description: cat.name });
    } catch (e) {
      toast({ title: "Cannot delete", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  return (
    <div data-testid={`category-row-${cat.slug}`} className={`border rounded-xl p-4 bg-white grid grid-cols-1 lg:grid-cols-[auto_1fr_auto_auto] gap-4 items-center ${cat.active ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-70"}`}>
      <div className="flex items-center gap-1">
        <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} data-testid={`category-up-${cat.slug}`} aria-label="Move up" className="h-8 w-8 grid place-items-center rounded-lg border border-neutral-200 hover:bg-neutral-50 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} data-testid={`category-down-${cat.slug}`} aria-label="Move down" className="h-8 w-8 grid place-items-center rounded-lg border border-neutral-200 hover:bg-neutral-50 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        <span className="ml-2 text-xs font-bold text-neutral-400 w-6 text-center" data-testid={`category-pos-${cat.slug}`}>{index + 1}</span>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Category name (shown to customers)</label>
        <input data-testid={`category-name-${cat.slug}`} className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <p className="text-[11px] text-neutral-500 mt-1.5 flex items-center gap-1"><Link2 className="h-3 w-3" /> URL: <span className="font-mono" data-testid={`category-slug-${cat.slug}`}>/product-category/{cat.slug}</span> (fixed) · {cat.productCount} product{cat.productCount === 1 ? "" : "s"}</p>
      </div>
      <label className="inline-flex items-center gap-2 text-xs text-neutral-600 whitespace-nowrap">
        <input type="checkbox" data-testid={`category-active-${cat.slug}`} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={busy || !dirty} onClick={save} data-testid={`category-save-${cat.slug}`} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Update
        </button>
        {cat.productCount === 0 && (
          <button type="button" onClick={remove} data-testid={`category-delete-${cat.slug}`} className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 text-xs font-bold rounded-full hover:bg-red-50 whitespace-nowrap"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        )}
      </div>
    </div>
  );
};

const AdminCategories = () => {
  const { refresh } = useCatalog();
  const { toast } = useToast();
  const [cats, setCats] = useState(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/admin/categories").then(({ data }) => setCats(data.categories)); }, []);

  const onSaved = (c) => {
    setCats((prev) => prev.map((x) => (x.slug === c.slug ? { ...x, ...c } : x)));
    toast({ title: "Category updated", description: `${c.name} · /product-category/${c.slug}${c.active ? "" : " · hidden"}` });
    refresh();
  };
  const onDeleted = (slug) => { setCats((prev) => prev.filter((x) => x.slug !== slug)); refresh(); };

  const onMove = async (index, dir) => {
    const next = [...cats];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    setCats(next);
    try {
      await api.put("/admin/categories/reorder", { slugs: next.map((c) => c.slug) });
      refresh();
    } catch {
      toast({ title: "Reorder failed", variant: "destructive" });
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/admin/categories", { name: newName });
      setCats((prev) => [...prev, data]);
      setNewName("");
      setAdding(false);
      refresh();
      toast({ title: "Category created", description: `${data.name} · /product-category/${data.slug}` });
    } catch (err) {
      toast({ title: "Could not create category", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="admin-categories">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><FolderTree className="h-7 w-7 text-emerald-600" /> Categories</h1>
          <p className="text-sm text-neutral-500 mt-1" data-testid="categories-summary">{cats ? `${cats.length} categories. Order here controls the Shop menu, footer and homepage. Categories without active products stay hidden from customers. URL slugs never change.` : "Loading…"}</p>
        </div>
        <button onClick={() => setAdding((v) => !v)} data-testid="add-category-btn" className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-full hover:bg-neutral-800 whitespace-nowrap"><Plus className="h-4 w-4" /> Add Category</button>
      </div>
      {adding && (
        <form onSubmit={create} data-testid="new-category-form" className="mb-5 border border-emerald-200 bg-emerald-50/60 rounded-xl p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Category name *</label>
            <input required data-testid="new-category-name" className={inputCls} placeholder="e.g. Nicotine Pouches" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <p className="text-[11px] text-neutral-500 mt-1">URL will be /product-category/{newName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "…"}</p>
          </div>
          <button disabled={busy} data-testid="new-category-submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full hover:bg-emerald-700 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create Category</button>
          <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 border border-neutral-300 text-xs font-bold rounded-full hover:bg-white">Cancel</button>
        </form>
      )}
      {!cats ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="space-y-3">
          {cats.map((c, i) => <CategoryRow key={c.slug} cat={c} index={i} total={cats.length} onMove={onMove} onSaved={onSaved} onDeleted={onDeleted} />)}
        </div>
      )}
    </div>
  );
};

export default AdminCategories;

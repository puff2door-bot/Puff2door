import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, EyeOff, Search } from "lucide-react";
import api, { imgUrl } from "../../api";
import { useToast } from "../../hooks/use-toast";
import { useCatalog } from "../../context/CatalogContext";
import ProductForm from "./ProductForm";
import ImageMigrationPanel from "./ImageMigrationPanel";

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { refresh } = useCatalog();
  const { toast } = useToast();

  const load = () => api.get("/admin/products").then(({ data }) => setProducts(data.products)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const id = searchParams.get("edit");
    if (id && products.length) {
      const p = products.find((x) => x.id === Number(id));
      if (p) setEditing(p);
      setSearchParams({});
    }
  }, [searchParams, products, setSearchParams]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? products.filter((p) => p.name.toLowerCase().includes(s) || p.brandName.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)) : products;
  }, [products, q]);

  const onSaved = (p) => {
    setProducts((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]));
    setEditing(null);
    refresh();
  };

  const hide = async (p) => {
    if (!window.confirm(`Hide "${p.name}" from the store?`)) return;
    await api.delete(`/admin/products/${p.id}`);
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: false } : x)));
    refresh();
    toast({ title: "Product hidden", description: p.name });
  };

  return (
    <div data-testid="admin-products">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="font-heading text-3xl uppercase tracking-tight">Products <span className="text-neutral-400 text-xl">({products.length})</span></h1>
        <div className="flex gap-2">
          <div className="flex items-center border border-neutral-300 rounded-full px-3 focus-within:border-emerald-600">
            <Search className="h-4 w-4 text-neutral-400" />
            <input data-testid="admin-product-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." className="px-2 py-2 text-sm outline-none w-48" />
          </div>
          <button onClick={() => setEditing({})} data-testid="admin-add-product" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700"><Plus className="h-4 w-4" /> Add Product</button>
        </div>
      </div>

      <ImageMigrationPanel onChanged={() => { load(); refresh(); }} />

      {loading ? (
        <p className="text-neutral-500">Loading products...</p>
      ) : (
        <div className="border border-neutral-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 hidden md:table-cell">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3 hidden sm:table-cell">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((p) => (
                <tr key={p.id} data-testid={`admin-product-row-${p.id}`} className={`hover:bg-neutral-50 ${p.active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-neutral-50 border grid place-items-center p-1 shrink-0">{p.image ? <img src={imgUrl(p.image)} alt="" className="max-h-full max-w-full object-contain" /> : null}</div>
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 line-clamp-1">{p.name}</p>
                        <p className="text-xs text-neutral-500">{p.brandName} · #{p.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-neutral-600">{p.category}</td>
                  <td className="px-4 py-3 font-semibold">
                    ${(p.salePrice ?? p.price).toFixed(2)}
                    {p.salePrice != null && p.salePrice < p.price && <span className="block text-xs text-neutral-400 line-through">${p.price.toFixed(2)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span data-testid={`admin-stock-${p.id}`} className={`text-xs font-bold px-2.5 py-1 rounded-full ${p.stock === 0 ? "bg-red-100 text-red-700" : p.stock <= 5 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{p.stock}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-xs font-semibold">{p.active ? <span className="text-emerald-600">Visible</span> : <span className="text-neutral-400">Hidden</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(p)} data-testid={`admin-edit-${p.id}`} className="h-8 w-8 grid place-items-center rounded-full hover:bg-emerald-50 text-neutral-600 hover:text-emerald-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                      {p.active && <button onClick={() => hide(p)} data-testid={`admin-hide-${p.id}`} className="h-8 w-8 grid place-items-center rounded-full hover:bg-red-50 text-neutral-600 hover:text-red-600" aria-label="Hide"><EyeOff className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="p-8 text-center text-neutral-500 text-sm">No products match.</p>}
        </div>
      )}

      {editing !== null && <ProductForm initial={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
};

export default AdminProducts;

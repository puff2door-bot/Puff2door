import React, { useCallback, useEffect, useState } from "react";
import { PackageSearch, RefreshCw } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";
import { formatEasternDateTime } from "../../lib/easternTime";

const statuses = ["new", "reviewing", "ordered", "added", "declined"];

export default function AdminProductRequests() {
  const [rows, setRows] = useState([]); const [filter, setFilter] = useState(""); const [busy, setBusy] = useState(""); const { toast } = useToast();
  const load = useCallback(() => api.get("/admin/product-requests", { params: filter ? { status: filter } : {} }).then(({ data }) => setRows(data.requests || [])), [filter]);
  useEffect(() => { load().catch(() => toast({ title: "Could not load requests", variant: "destructive" })); }, [load, toast]);
  const update = async (row, status) => { setBusy(row.id); try { await api.put(`/admin/product-requests/${row.id}`, { status, adminNotes: row.adminNotes || "", matchedProductId: row.matchedProductId ? Number(row.matchedProductId) : null }); await load(); toast({ title: "Product request updated" }); } catch (e) { toast({ title: "Update failed", description: e?.response?.data?.detail, variant: "destructive" }); } finally { setBusy(""); } };
  const patch = (id, value) => setRows((list) => list.map((row) => row.id === id ? { ...row, ...value } : row));
  return <div data-testid="admin-product-requests"><div className="flex flex-wrap items-end justify-between gap-3 mb-6"><div><h1 className="font-heading text-3xl uppercase">Product Requests</h1><p className="text-sm text-neutral-500">Customer demand, status, store notes, and the product added to fulfill it.</p></div><div className="flex gap-2"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All requests</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select><button onClick={load} className="rounded-lg border p-2" aria-label="Refresh"><RefreshCw className="h-5 w-5" /></button></div></div>
    {!rows.length ? <div className="rounded-xl border border-dashed p-12 text-center text-neutral-500"><PackageSearch className="h-10 w-10 mx-auto mb-3" />No requests in this view.</div> : <div className="space-y-3">{rows.map((row) => <article key={row.id} className="rounded-xl border p-5"><div className="flex flex-wrap justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-bold text-lg">{row.productName}</h2><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold uppercase">{row.status}</span></div><p className="text-sm text-neutral-600 mt-1">{[row.brand, row.flavor, row.size].filter(Boolean).join(" · ") || "No extra product details"}</p><p className="text-xs text-neutral-500 mt-2"><a href={`mailto:${row.email}`} className="hover:underline">{row.email}</a>{row.phone ? ` · ${row.phone}` : ""} · {formatEasternDateTime(row.createdAt)}</p>{row.notes && <p className="mt-3 text-sm rounded-lg bg-neutral-50 p-3">{row.notes}</p>}</div></div>
      <div className="grid md:grid-cols-[1fr_180px_170px] gap-2 mt-4"><input value={row.adminNotes || ""} onChange={(e) => patch(row.id, { adminNotes: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" placeholder="Store notes" /><input type="number" min="1" value={row.matchedProductId || ""} onChange={(e) => patch(row.id, { matchedProductId: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" placeholder="Added product ID" /><select value={row.status} onChange={(e) => patch(row.id, { status: e.target.value })} className="rounded-lg border px-3 py-2 text-sm">{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      <button disabled={busy === row.id} onClick={() => update(row, row.status)} className="mt-3 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">Save request</button>
    </article>)}</div>}
  </div>;
}

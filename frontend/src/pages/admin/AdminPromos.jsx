import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Ticket } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition-colors";
const Label = ({ children }) => <label className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1">{children}</label>;

const empty = { code: "", type: "percent", value: 10, minSubtotal: 0, maxUses: "", expiresAt: "", active: true };

const toLocalInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

const PromoForm = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState({ ...empty, ...initial, maxUses: initial?.maxUses ?? "", expiresAt: toLocalInput(initial?.expiresAt) });
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      code: f.code, type: f.type, value: Number(f.value), minSubtotal: Number(f.minSubtotal || 0),
      maxUses: f.maxUses === "" ? null : Number(f.maxUses), expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null, active: f.active,
    };
    try {
      const { data } = initial?.id ? await api.put(`/admin/promos/${initial.id}`, payload) : await api.post("/admin/promos", payload);
      toast({ title: initial?.id ? "Promo updated" : "Promo created", description: data.code });
      onSaved(data);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast({ title: "Save failed", description: Array.isArray(d) ? d.map((x) => x.msg.replace(/^Value error, /, "")).join(", ") : d || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" data-testid="promo-form-modal">
      <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 sm:p-8 space-y-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl uppercase tracking-wide">{initial?.id ? "Edit Promo" : "New Promo Code"}</h2>
          <button type="button" onClick={onClose} className="h-9 w-9 grid place-items-center rounded-full hover:bg-neutral-100"><X className="h-5 w-5" /></button>
        </div>
        <div><Label>Code *</Label><input required data-testid="promo-code-input" className={`${inputCls} uppercase font-mono`} placeholder="SUMMER20" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Discount type</Label>
            <select data-testid="promo-type" className={inputCls} value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="percent">Percent off (%)</option>
              <option value="fixed">Fixed amount off ($)</option>
            </select>
          </div>
          <div><Label>{f.type === "percent" ? "Percent off *" : "Amount off ($) *"}</Label><input required type="number" min="0.01" step="0.01" data-testid="promo-value" className={inputCls} value={f.value} onChange={(e) => set("value", e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Minimum subtotal ($)</Label><input type="number" min="0" step="0.01" data-testid="promo-min" className={inputCls} value={f.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} /></div>
          <div><Label>Max uses (blank = unlimited)</Label><input type="number" min="1" step="1" data-testid="promo-max-uses" className={inputCls} value={f.maxUses} onChange={(e) => set("maxUses", e.target.value)} /></div>
        </div>
        <div><Label>Expires (blank = never)</Label><input type="datetime-local" data-testid="promo-expires" className={inputCls} value={f.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer"><input type="checkbox" data-testid="promo-active" className="accent-emerald-600 h-4 w-4" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full border border-neutral-300 text-sm font-bold hover:bg-neutral-50">Cancel</button>
          <button disabled={busy} data-testid="promo-save" className="px-6 py-2.5 rounded-full bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60">{busy ? "Saving..." : "Save Promo"}</button>
        </div>
      </form>
    </div>
  );
};

const statusOf = (p) => {
  if (!p.active) return { label: "Inactive", cls: "bg-neutral-200 text-neutral-600" };
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) return { label: "Expired", cls: "bg-red-100 text-red-700" };
  if (p.maxUses && p.uses >= p.maxUses) return { label: "Used up", cls: "bg-amber-100 text-amber-700" };
  return { label: "Live", cls: "bg-emerald-100 text-emerald-700" };
};

const AdminPromos = () => {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    api.get("/admin/promos").then(({ data }) => setPromos(data.promos)).finally(() => setLoading(false));
  }, []);

  const onSaved = (p) => {
    setPromos((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]));
    setEditing(null);
  };

  const toggleActive = async (p) => {
    const { data } = await api.put(`/admin/promos/${p.id}`, { code: p.code, type: p.type, value: p.value, minSubtotal: p.minSubtotal, maxUses: p.maxUses, expiresAt: p.expiresAt, active: !p.active });
    setPromos((prev) => prev.map((x) => (x.id === p.id ? data : x)));
    toast({ title: data.active ? "Promo activated" : "Promo deactivated", description: p.code });
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete promo ${p.code}?`)) return;
    await api.delete(`/admin/promos/${p.id}`);
    setPromos((prev) => prev.filter((x) => x.id !== p.id));
    toast({ title: "Promo deleted", description: p.code });
  };

  return (
    <div data-testid="admin-promos">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-tight">Promo Codes</h1>
          <p className="text-sm text-neutral-500">Customers enter these in the cart. Discounts apply to items before tax.</p>
        </div>
        <button onClick={() => setEditing({})} data-testid="admin-add-promo" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700"><Plus className="h-4 w-4" /> New Promo</button>
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : promos.length === 0 ? (
        <p className="text-neutral-500 border border-dashed rounded-2xl p-10 text-center">No promo codes yet.</p>
      ) : (
        <div className="border border-neutral-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3 hidden md:table-cell">Rules</th><th className="px-4 py-3">Uses</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y">
              {promos.map((p) => {
                const st = statusOf(p);
                return (
                  <tr key={p.id} data-testid={`promo-row-${p.code}`} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono font-bold"><span className="inline-flex items-center gap-1.5"><Ticket className="h-4 w-4 text-emerald-600" />{p.code}</span></td>
                    <td className="px-4 py-3">{p.type === "percent" ? `${p.value}% off` : `$${p.value.toFixed(2)} off`}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-neutral-500">
                      {p.minSubtotal > 0 && <span className="block">Min ${p.minSubtotal.toFixed(2)}</span>}
                      {p.expiresAt && <span className="block">Expires {new Date(p.expiresAt).toLocaleString()}</span>}
                      {!p.minSubtotal && !p.expiresAt && "No restrictions"}
                    </td>
                    <td className="px-4 py-3">{p.uses}{p.maxUses ? ` / ${p.maxUses}` : ""}</td>
                    <td className="px-4 py-3"><button onClick={() => toggleActive(p)} data-testid={`promo-toggle-${p.code}`} className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</button></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(p)} data-testid={`promo-edit-${p.code}`} className="h-8 w-8 grid place-items-center rounded-full hover:bg-emerald-50 text-neutral-600 hover:text-emerald-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(p)} data-testid={`promo-delete-${p.code}`} className="h-8 w-8 grid place-items-center rounded-full hover:bg-red-50 text-neutral-600 hover:text-red-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && <PromoForm initial={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
};

export default AdminPromos;

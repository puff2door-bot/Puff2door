import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderCog, Image as ImageIcon, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import api from "../../api";

const errText = (e) => e?.response?.data?.detail || "Something went wrong.";
const fmt = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const badge = (s) => {
  if (!s || s.state === "none") return { cls: "bg-neutral-100 text-neutral-600", text: "No expiry" };
  if (s.state === "expired") return { cls: "bg-red-600 text-white", text: `Expired ${Math.abs(s.days)} day${Math.abs(s.days) === 1 ? "" : "s"} ago` };
  if (s.state === "soon") return { cls: "bg-amber-400 text-amber-950", text: s.days === 0 ? "Expires today" : `Expires in ${s.days} day${s.days === 1 ? "" : "s"}` };
  return { cls: "bg-emerald-100 text-emerald-800", text: `Valid · ${s.days} days left` };
};
const EMPTY = { title: "", typeId: "", number: "", issuedBy: "", issueDate: "", expiryDate: "", notes: "", remind: true };

const openFile = async (doc, f, download = false) => {
  const res = await api.get(`/admin/documents/${doc.id}/files/${f.fileId}`, { params: { download }, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  if (download) { const a = document.createElement("a"); a.href = url; a.download = f.name; a.click(); } else window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// Add / rename / turn expiry on or off / delete document types.
const TypeManager = ({ types, onClose, onChanged }) => {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState(true);
  const [editing, setEditing] = useState({});
  const [msg, setMsg] = useState("");
  const [moveTo, setMoveTo] = useState({});
  const run = async (fn) => { setMsg(""); try { await fn(); await onChanged(); } catch (e) { setMsg(errText(e)); } };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label="Document types">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between"><h2 className="font-heading text-2xl">Document types</h2><button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        <p className="text-sm text-neutral-500">Rename any type, add your own, or delete ones you don't use. “Has expiry” turns on the expiry date and renewal reminders.</p>
        {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
        <form className="flex flex-wrap gap-2 items-center rounded-xl border p-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post("/admin/documents/types", { name, hasExpiry: expiry }); setName(""); }); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New type, e.g. Alarm Permit" className="flex-1 min-w-[180px] border rounded-lg px-3 py-2 text-sm" aria-label="New type name" />
          <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={expiry} onChange={(e) => setExpiry(e.target.checked)} />Has expiry</label>
          <button type="submit" disabled={!name.trim()} className="rounded-lg bg-neutral-900 text-white px-3 py-2 text-sm font-semibold disabled:opacity-40 flex items-center gap-1"><Plus className="h-4 w-4" />Add</button>
        </form>
        <ul className="divide-y">
          {types.map((t, i) => (
            <li key={t.id} className="py-3 space-y-2">
              <div className="flex items-center gap-2">
                {editing[t.id] != null ? (
                  <form className="flex-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.patch(`/admin/documents/types/${t.id}`, { name: editing[t.id] }); setEditing((x) => ({ ...x, [t.id]: undefined })); }); }}>
                    <input autoFocus value={editing[t.id]} onChange={(e) => setEditing((x) => ({ ...x, [t.id]: e.target.value }))} className="flex-1 border rounded-lg px-2 py-1.5 text-sm" aria-label="Type name" />
                    <button type="submit" className="text-sm font-semibold underline">Save</button>
                    <button type="button" className="text-sm underline text-neutral-500" onClick={() => setEditing((x) => ({ ...x, [t.id]: undefined }))}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-semibold">{t.name} <span className="text-neutral-400 font-normal">({t.count})</span></span>
                    <button type="button" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => run(async () => { const prev = types[i - 1]; await api.patch(`/admin/documents/types/${t.id}`, { order: prev.order }); await api.patch(`/admin/documents/types/${prev.id}`, { order: t.order }); })} className="text-xs border rounded px-1.5 disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Rename ${t.name}`} onClick={() => setEditing((x) => ({ ...x, [t.id]: t.name }))} className="p-1"><Pencil className="h-4 w-4" /></button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={!!t.hasExpiry} onChange={(e) => run(() => api.patch(`/admin/documents/types/${t.id}`, { hasExpiry: e.target.checked }))} />Has expiry</label>
                {t.count > 0 && (
                  <select value={moveTo[t.id] || ""} onChange={(e) => setMoveTo((x) => ({ ...x, [t.id]: e.target.value }))} className="border rounded px-1 py-0.5" aria-label="Move documents to">
                    <option value="">Move its {t.count} doc(s) to…</option>
                    {types.filter((o) => o.id !== t.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
                <button type="button" disabled={t.count > 0 && !moveTo[t.id]} onClick={() => { if (window.confirm(`Delete the type “${t.name}”?`)) run(() => api.delete(`/admin/documents/types/${t.id}`, { params: { moveTo: moveTo[t.id] || "" } })); }} className="text-red-700 underline disabled:opacity-40 flex items-center gap-1"><Trash2 className="h-3 w-3" />Delete type</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const DocForm = ({ types, initial, onClose, onSaved }) => {
  const [f, setF] = useState({ ...EMPTY, typeId: types[0]?.id || "", ...initial });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const fileRef = useRef(null);
  const type = types.find((t) => t.id === f.typeId);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const body = { title: f.title, typeId: f.typeId, number: f.number, issuedBy: f.issuedBy, issueDate: f.issueDate || null, expiryDate: type?.hasExpiry ? f.expiryDate || null : null, notes: f.notes, remind: f.remind };
      const { data } = initial?.id ? await api.patch(`/admin/documents/${initial.id}`, body) : await api.post("/admin/documents", body);
      for (const file of pending) {
        const form = new FormData(); form.append("file", file);
        await api.post(`/admin/documents/${data.id}/files`, form);
      }
      onSaved();
    } catch (err) { setMsg(errText(err)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label="Document">
      <form className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="flex justify-between"><h2 className="font-heading text-2xl">{initial?.id ? "Edit document" : "Add document"}</h2><button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
        <label className="block text-sm font-semibold">Type<select value={f.typeId} onChange={set("typeId")} className="mt-1 w-full border rounded-lg px-3 py-2 font-normal">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">Name<input required value={f.title} onChange={set("title")} placeholder="e.g. Altamonte Springs BTR 2026" className="mt-1 w-full border rounded-lg px-3 py-2 font-normal" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">License / number<input value={f.number} onChange={set("number")} className="mt-1 w-full border rounded-lg px-3 py-2 font-normal" /></label>
          <label className="block text-sm font-semibold">Issued by<input value={f.issuedBy} onChange={set("issuedBy")} placeholder="City, State, IRS…" className="mt-1 w-full border rounded-lg px-3 py-2 font-normal" /></label>
          <label className="block text-sm font-semibold">Issue date<input type="date" value={f.issueDate || ""} onChange={set("issueDate")} className="mt-1 w-full border rounded-lg px-3 py-2 font-normal" /></label>
          {type?.hasExpiry && <label className="block text-sm font-semibold">Expiry date<input type="date" value={f.expiryDate || ""} onChange={set("expiryDate")} className="mt-1 w-full border rounded-lg px-3 py-2 font-normal" /></label>}
        </div>
        {type?.hasExpiry && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.remind !== false} onChange={set("remind")} />Email me 60, 30 and 7 days before it expires</label>}
        <label className="block text-sm font-semibold">Notes<textarea value={f.notes} onChange={set("notes")} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 font-normal" /></label>
        <div className="rounded-xl border border-dashed p-3 text-sm">
          <p className="font-semibold mb-1">Files</p>
          {(initial?.files || []).map((x) => <p key={x.fileId} className="text-neutral-600 flex items-center gap-2"><FileText className="h-4 w-4" />{x.name}</p>)}
          {pending.map((x) => <p key={x.name} className="text-emerald-700 flex items-center gap-2"><Upload className="h-4 w-4" />{x.name} (uploads when you save)</p>)}
          <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => setPending((p) => [...p, ...Array.from(e.target.files || [])])} />
          <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 rounded-lg border px-3 py-1.5 font-semibold flex items-center gap-1"><Upload className="h-4 w-4" />Add PDF or photo</button>
          <p className="text-xs text-neutral-500 mt-1">PDF or photo up to 15 MB. On a phone you can take a picture of the license.</p>
        </div>
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-700 text-white py-2.5 font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
};

const AdminDocuments = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState(null);
  const [manage, setManage] = useState(false);
  const load = useCallback(async () => {
    try { setData((await api.get("/admin/documents")).data); setError(""); } catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const typeName = useMemo(() => Object.fromEntries((data?.types || []).map((t) => [t.id, t.name])), [data]);
  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-neutral-500">Loading…</p>;
  const docs = data.documents.filter((d) => !typeFilter || d.typeId === typeFilter);
  const del = async (d) => { if (!window.confirm(`Delete “${d.title}” and its files? This can't be undone.`)) return; await api.delete(`/admin/documents/${d.id}`); load(); };
  const removeFile = async (d, f) => { if (!window.confirm(`Remove ${f.name}?`)) return; await api.delete(`/admin/documents/${d.id}/files/${f.fileId}`); load(); };

  return (
    <section className="space-y-5" data-testid="admin-documents">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div><h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><FileText className="w-7 h-7" />Licenses & Docs</h1>
          <p className="text-sm text-neutral-500">Licenses, permits and important papers in one private place. Only admins can open these files.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setManage(true)} className="rounded-xl border px-3 py-2 text-sm font-semibold flex items-center gap-1"><FolderCog className="h-4 w-4" />Edit types</button>
          <button type="button" onClick={() => setForm({})} className="rounded-xl bg-neutral-900 text-white px-3 py-2 text-sm font-semibold flex items-center gap-1"><Plus className="h-4 w-4" />Add document</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-xl">
        {[["Documents", data.summary.total, ""], ["Expiring in 30 days", data.summary.soon, data.summary.soon ? "text-amber-700" : ""], ["Expired", data.summary.expired, data.summary.expired ? "text-red-700" : ""]].map(([l, v, c]) => (
          <div key={l} className="rounded-xl border p-3"><p className="text-xs text-neutral-500">{l}</p><p className={`font-heading text-2xl ${c}`}>{v}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
        <button type="button" aria-pressed={!typeFilter} onClick={() => setTypeFilter("")} className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${!typeFilter ? "bg-neutral-900 text-white" : ""}`}>All ({data.summary.total})</button>
        {data.types.map((t) => <button key={t.id} type="button" aria-pressed={typeFilter === t.id} onClick={() => setTypeFilter(t.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${typeFilter === t.id ? "bg-neutral-900 text-white" : ""}`}>{t.name} ({t.count})</button>)}
      </div>
      {docs.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center text-neutral-500">No documents here yet. <button type="button" className="underline" onClick={() => setForm({ typeId: typeFilter || undefined })}>Add one</button></div> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {docs.map((d) => {
            const b = badge(d.status);
            return (
              <article key={d.id} className="rounded-2xl border p-4 flex flex-col gap-2">
                <div className="flex justify-between gap-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${b.cls}`}>{b.text}</span>
                  <div className="flex gap-1"><button type="button" aria-label={`Edit ${d.title}`} onClick={() => setForm(d)} className="p-1"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`Delete ${d.title}`} onClick={() => del(d)} className="p-1 text-red-700"><Trash2 className="h-4 w-4" /></button></div></div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">{typeName[d.typeId] || "Other"}</p>
                <h3 className="font-semibold leading-snug">{d.title}</h3>
                <dl className="text-xs text-neutral-600 grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {d.number && <><dt>Number</dt><dd className="font-mono text-neutral-900">{d.number}</dd></>}
                  {d.issuedBy && <><dt>Issued by</dt><dd className="text-neutral-900">{d.issuedBy}</dd></>}
                  <dt>Issued</dt><dd className="text-neutral-900">{fmt(d.issueDate)}</dd>
                  {d.expiryDate && <><dt>Expires</dt><dd className="text-neutral-900">{fmt(d.expiryDate)}</dd></>}
                </dl>
                {d.notes && <p className="text-xs text-neutral-600 whitespace-pre-line">{d.notes}</p>}
                <div className="mt-auto pt-2 border-t space-y-1">
                  {(d.files || []).length === 0 && <p className="text-xs text-amber-700">No file uploaded yet.</p>}
                  {(d.files || []).map((f) => (
                    <div key={f.fileId} className="flex items-center gap-2 text-sm">
                      {f.contentType.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                      <button type="button" onClick={() => openFile(d, f)} className="flex-1 text-left truncate underline">{f.name}</button>
                      <button type="button" onClick={() => openFile(d, f, true)} className="text-xs underline text-neutral-500">Download</button>
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(d, f)} className="text-neutral-400 hover:text-red-700"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {form && <DocForm types={data.types} initial={form.id ? form : { ...EMPTY, ...form, typeId: form.typeId || data.types[0]?.id }} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {manage && <TypeManager types={data.types} onClose={() => setManage(false)} onChanged={load} />}
    </section>
  );
};

export default AdminDocuments;

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Check, Search } from "lucide-react";
import api, { imgUrl } from "../../api";

// Products missing what customers filter by: flavor, puffs, strength/size, or a real description.
const LABEL = { flavor: "Flavor", puffs: "Puffs", size: "mg / g / ml", description: "Description" };
const CHIP = { flavor: "bg-emerald-100 text-emerald-900", puffs: "bg-sky-100 text-sky-900", size: "bg-violet-100 text-violet-900", description: "bg-amber-100 text-amber-900" };

const Row = ({ p, onSaved }) => {
  const [flavors, setFlavors] = useState(p.flavors.join(", "));
  const [puffs, setPuffs] = useState(p.puffs ?? "");
  const [size, setSize] = useState(p.size || p.suggestedSize || "");
  const [desc, setDesc] = useState(p.description);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const need = (k) => p.missing.includes(k);
  const save = async () => {
    setBusy(true); setMsg("");
    const body = {};
    if (need("flavor") || flavors !== p.flavors.join(", ")) body.flavors = flavors.split(",").map((x) => x.trim()).filter(Boolean);
    if (need("puffs") || String(puffs) !== String(p.puffs ?? "")) body.puffs = puffs === "" ? null : Number(puffs);
    if (need("size") || size !== p.size) body.size = size;
    if (need("description") || desc !== p.description) body.description = desc;
    try { await api.put(`/admin/missing-details/${p.id}`, body); setMsg("Saved"); onSaved(); }
    catch (e) { setMsg(e?.response?.data?.detail || "Could not save."); }
    setBusy(false);
  };
  const input = "border rounded-lg px-2 py-1.5 text-sm w-full";
  return (
    <div className="rounded-2xl border p-3 flex flex-col sm:flex-row gap-3">
      <img src={imgUrl(p.image)} alt="" className="w-20 h-20 object-contain rounded-lg bg-neutral-50 shrink-0" loading="lazy" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link to={`/admin/products?edit=${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
          <span className="text-xs text-neutral-400">{p.category} · {p.stock} in stock</span>
          {p.missing.map((m) => <span key={m} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CHIP[m]}`}>No {LABEL[m]}</span>)}
          {p.inReview && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-200">Draft waiting in Product Details</span>}
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {(need("flavor") || p.flavors.length > 0) && <label className="text-xs text-neutral-500">Flavors (comma separated)<input className={input} value={flavors} onChange={(e) => setFlavors(e.target.value)} placeholder="e.g. Strawberry, Kiwi, Ice" /></label>}
          {(need("puffs") || p.puffs) && <label className="text-xs text-neutral-500">Puffs<input className={input} type="number" min="0" value={puffs} onChange={(e) => setPuffs(e.target.value)} placeholder="e.g. 25000" /></label>}
          {(need("size") || p.size) && <label className="text-xs text-neutral-500">Strength / size<input className={input} value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 500 mg, 3.5 g, 1 ml" /></label>}
        </div>
        {need("description") && <textarea className={input} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short factual description (what it is, size, count, flavor). No health claims." />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"><Check className="h-4 w-4" />Save</button>
          {msg && <span role="status" className={`text-xs ${msg === "Saved" ? "text-emerald-700" : "text-red-700"}`}>{msg}</span>}
          {p.suggestedSize && !p.size && <span className="text-xs text-neutral-400">Size suggested from the name: check it matches the package.</span>}
        </div>
      </div>
    </div>
  );
};

const MissingDetails = () => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [what, setWhat] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [inStock, setInStock] = useState(true);
  const load = () => api.get("/admin/missing-details").then(({ data: x }) => { setData(x); setErr(""); }).catch(() => setErr("Could not load the list."));
  useEffect(() => { load(); }, []);
  const cats = useMemo(() => [...new Set((data?.products || []).map((p) => p.category))].sort(), [data]);
  const list = useMemo(() => (data?.products || []).filter((p) => (!what || p.missing.includes(what)) && (!cat || p.category === cat)
    && (!inStock || p.stock > 0) && (!q.trim() || `${p.name} ${p.brand}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, what, cat, q, inStock]);
  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-neutral-500">Loading…</p>;
  return (
    <section className="space-y-4" data-testid="missing-details">
      <div>
        <h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><ClipboardList className="w-7 h-7" />Missing Details</h1>
        <p className="text-sm text-neutral-500">Products customers can't filter yet: no flavor, puff count, strength/size (mg, g, ml) or real description. Fill them in here; this changes the website only, not Clover.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="What's missing">
        {[["", `All (${data.products.length})`], ...Object.entries(LABEL).map(([k, l]) => [k, `No ${l} (${data.counts[k] || 0})`])].map(([k, l]) =>
          <button key={l} type="button" aria-pressed={what === k} onClick={() => setWhat(k)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${what === k ? "bg-neutral-900 text-white" : ""}`}>{l}</button>)}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex-1 min-w-[200px] relative"><Search className="w-4 h-4 absolute left-3 top-3 text-neutral-400" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or brand" className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm" /></label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="border rounded-xl px-2 py-2.5 text-sm" aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <label className="text-sm flex items-center gap-1.5"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />In stock only</label>
      </div>
      <p className="text-sm font-semibold">{list.length} product(s)</p>
      <div className="space-y-2">{list.map((p) => <Row key={p.id} p={p} onSaved={load} />)}</div>
      {!list.length && <p className="rounded-2xl border p-6 text-center text-neutral-500">Nothing missing here.</p>}
    </section>
  );
};

export default MissingDetails;

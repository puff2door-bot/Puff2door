import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Sparkles, X } from "lucide-react";
import api from "../../api";

// Researched descriptions, flavor tags and puff counts wait here until the owner approves a batch.
const Item = ({ d, picked, onPick, text, onText }) => (
  <div className={`rounded-2xl border p-4 space-y-2 ${picked ? "border-emerald-400 bg-emerald-50/40" : ""}`}>
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={picked} onChange={onPick} className="mt-1 h-4 w-4" aria-label={`Include ${d.name}`} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{d.name} <span className="text-xs text-neutral-400">#{d.productId}</span></p>
        {d.flag && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1 flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{d.flag}</p>}
      </div>
    </label>
    <textarea value={text} onChange={(e) => onText(e.target.value)} rows={4} className="w-full border rounded-xl p-3 text-sm" aria-label={`Description for ${d.name}`} />
    <div className="flex flex-wrap gap-1 items-center text-xs">
      <span className="text-neutral-500 mr-1">Flavor filter:</span>
      {d.flavors.length ? d.flavors.map((f) => <span key={f} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-semibold">{f}</span>) : <span className="text-neutral-400">none</span>}
      {d.puffs ? <span className="ml-2 px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 font-semibold">{d.puffs.toLocaleString()} puffs</span> : null}
      {d.size ? <span className="ml-2 px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 font-semibold">Size: {d.size}</span> : null}
    </div>
    {d.before?.description && <details className="text-xs text-neutral-500"><summary className="cursor-pointer">Current description</summary><p className="mt-1">{d.before.description}</p></details>}
  </div>
);

const ProductDetails = () => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [batch, setBatch] = useState("");
  const [picked, setPicked] = useState({});
  const [texts, setTexts] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => api.get("/admin/product-details").then(({ data: x }) => {
    setData(x);
    const first = x.batches[0]?.name || "";
    setBatch((b) => (x.batches.some((y) => y.name === b) ? b : first));
    const p = {}, t = {};
    x.batches.forEach((b) => b.items.forEach((d) => { p[d.productId] = !d.flag; t[d.productId] = d.description; }));
    setPicked(p); setTexts(t);
  }).catch(() => setErr("Could not load product details."));
  useEffect(() => { load(); }, []);
  const items = useMemo(() => data?.batches.find((b) => b.name === batch)?.items || [], [data, batch]);
  const chosen = items.filter((d) => picked[d.productId]);
  const act = async (kind) => {
    setBusy(true); setMsg("");
    const ids = chosen.map((d) => d.productId);
    const edits = {};
    chosen.forEach((d) => { if (texts[d.productId] !== d.description) edits[d.productId] = texts[d.productId]; });
    try {
      const { data: r } = await api.post(`/admin/product-details/${kind}`, { ids, edits });
      setMsg(kind === "approve" ? `Published ${r.approved} product(s) to the website.` : `Skipped ${r.skipped}.`);
      await load();
    } catch (e) { setMsg(e?.response?.data?.detail || "Something went wrong. Nothing was changed."); }
    setBusy(false);
  };
  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-neutral-500">Loading…</p>;
  return (
    <section className="space-y-5" data-testid="product-details">
      <div>
        <h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><Sparkles className="w-7 h-7" />Product Details</h1>
        <p className="text-sm text-neutral-500">Researched descriptions, flavor filters and puff counts. Nothing changes on the website until you approve. {data.approved ? `${data.approved} published so far.` : ""}</p>
      </div>
      {!data.batches.length && <p className="rounded-2xl border p-6 text-center text-neutral-500">Nothing waiting for review.</p>}
      {data.batches.length > 0 && <>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Batch">
          {data.batches.map((b) => <button key={b.name} type="button" aria-pressed={batch === b.name} onClick={() => setBatch(b.name)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${batch === b.name ? "bg-neutral-900 text-white" : ""}`}>{b.name} ({b.items.length})</button>)}
        </div>
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border rounded-2xl p-3 flex flex-wrap gap-2 items-center">
          <span className="text-sm font-semibold mr-auto">{chosen.length} of {items.length} selected</span>
          <button type="button" onClick={() => setPicked((p) => ({ ...p, ...Object.fromEntries(items.map((d) => [d.productId, true])) }))} className="text-sm underline">Select all</button>
          <button type="button" disabled={busy || !chosen.length} onClick={() => act("skip")} className="rounded-xl border px-3 py-2 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"><X className="h-4 w-4" />Skip selected</button>
          <button type="button" disabled={busy || !chosen.length} onClick={() => act("approve")} className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"><Check className="h-4 w-4" />Approve & publish selected</button>
        </div>
        {msg && <p role="status" className="text-sm font-semibold text-emerald-800">{msg}</p>}
        <div className="grid lg:grid-cols-2 gap-3">
          {items.map((d) => <Item key={d.productId} d={d} picked={!!picked[d.productId]} onPick={() => setPicked((p) => ({ ...p, [d.productId]: !p[d.productId] }))}
            text={texts[d.productId] ?? d.description} onText={(v) => setTexts((t) => ({ ...t, [d.productId]: v }))} />)}
        </div>
      </>}
    </section>
  );
};

export default ProductDetails;

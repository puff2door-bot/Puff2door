import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, RefreshCw, Search, UserRound, X } from "lucide-react";
import api from "../../api";

const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
const ago = (n) => (n == null ? "—" : n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);
const TAG = { VIP: "bg-amber-100 text-amber-900", Regular: "bg-emerald-100 text-emerald-800", New: "bg-sky-100 text-sky-800", Overdue: "bg-red-100 text-red-800", Lost: "bg-neutral-200 text-neutral-700" };
const Tags = ({ tags }) => <>{(tags || []).map((t) => <span key={t} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${TAG[t] || "bg-neutral-100"}`}>{t === "VIP" ? "★ VIP" : t}</span>)}</>;

const Detail = ({ id, onClose }) => {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.get(`/admin/customers/${id}`).then(({ data }) => setD(data)).catch(() => setErr("Could not load this customer.")); }, [id]);
  const maxM = Math.max(1, ...((d?.months || []).map((m) => m.spend)));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label="Customer">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between"><div><h2 className="font-heading text-2xl">{d?.name || "Customer"}</h2>{d && <p className="text-sm text-neutral-500">{[d.phone, d.email].filter(Boolean).join(" · ") || "No contact saved in Clover"}</p>}{d && <div className="flex gap-1 mt-1"><Tags tags={d.tags} /></div>}</div><button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        {!d && !err && <p className="text-sm text-neutral-500">Loading…</p>}
        {d && <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[["Total spent", money(d.spend)], ["Visits", d.visits], ["Average sale", money(d.average)], ["Last visit", ago(d.daysSinceLast)],
              ["Comes in", d.everyDays ? `every ~${Math.round(d.everyDays)} days` : "—"], ["Usually", [d.usualDay, d.usualTime].filter(Boolean).join(" ~") || "—"],
              ["Customer since", day(d.firstVisit)], ["Usually served by", d.servedBy || "—"]].map(([l, v]) => (
              <div key={l} className="rounded-xl border p-3"><p className="text-[11px] text-neutral-500">{l}</p><p className="font-semibold">{v}</p></div>))}
          </div>
          <section><h3 className="font-semibold mb-2">What they buy</h3>
            {d.topBrand && <p className="text-sm text-neutral-600 mb-1">Favorite brand: <b>{d.topBrand}</b>{d.topCategory ? ` · mostly ${d.topCategory}` : ""}</p>}
            {d.topItems.map((i) => <div key={i.name} className="flex justify-between text-sm border-t py-1"><span className="truncate pr-3">{i.name}</span><b>{i.qty}×</b></div>)}
          </section>
          {d.months.length > 1 && <section><h3 className="font-semibold mb-2">Spending by month</h3><div className="flex items-end gap-2 h-24">{d.months.map((m) => <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full" title={money(m.spend)}><div className="w-full bg-emerald-500 rounded-t" style={{ height: `${(m.spend / maxM) * 100}%` }} /><span className="text-[10px] text-neutral-500 mt-1">{new Date(`${m.month}-15T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</span></div>)}</div></section>}
          {d.webOrders.length > 0 && <section><h3 className="font-semibold mb-2">Website orders (same phone or email)</h3>{d.webOrders.map((w) => <div key={w.orderNumber} className="flex justify-between text-sm border-t py-1"><span>{w.orderNumber} · {new Date(w.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><b>{money(w.total)}</b></div>)}</section>}
          <section><h3 className="font-semibold mb-2">Receipts</h3>
            {d.receipts.map((r) => <Link key={r.id} to={`/admin/receipts?start=${new Date(r.createdAt).toLocaleDateString("en-CA", { timeZone: "America/New_York" })}&end=${new Date(r.createdAt).toLocaleDateString("en-CA", { timeZone: "America/New_York" })}&q=${encodeURIComponent(r.total.toFixed(2))}`} className="flex justify-between gap-3 text-sm border-t py-1.5 hover:bg-emerald-50"><span className="whitespace-nowrap text-neutral-500">{new Date(r.createdAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span><span className="flex-1 truncate">{r.items.join(", ")}</span><b>{money(r.total)}</b></Link>)}
          </section>
        </>}
      </div>
    </div>
  );
};

const AdminCustomers = () => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("spend");
  const [tag, setTag] = useState("");
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = (refresh = false) => { setBusy(true); api.get("/admin/customers", { params: { refresh } }).then(({ data: x }) => { setData(x); setErr(""); }).catch(() => setErr("Could not load customers.")).finally(() => setBusy(false)); };
  useEffect(() => { load(); }, []);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let rows = (data?.customers || []).filter((c) => (!tag || c.tags.includes(tag)) && (!ql || `${c.name} ${c.phone} ${c.email} ${c.topItems.map((i) => i.name).join(" ")}`.toLowerCase().includes(ql)));
    const by = { spend: (a, b) => b.spend - a.spend, visits: (a, b) => b.visits - a.visits, recent: (a, b) => (a.daysSinceLast ?? 9e9) - (b.daysSinceLast ?? 9e9), away: (a, b) => (b.daysSinceLast ?? -1) - (a.daysSinceLast ?? -1), month: (a, b) => b.monthSpend - a.monthSpend };
    return [...rows].sort(by[sort]);
  }, [data, q, sort, tag]);
  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-neutral-500">Loading customers…</p>;
  const s = data.summary;
  return (
    <section className="space-y-5" data-testid="admin-customers">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div><h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><UserRound className="w-7 h-7" />Customers</h1>
          <p className="text-sm text-neutral-500">Store customers from Clover since {day(s.historyStart)}: who spends the most, on what, and how often.</p></div>
        <button type="button" onClick={() => load(true)} disabled={busy} className="rounded-xl border px-3 py-2 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />Refresh from Clover</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[["Customers with sales", s.count], ["Spent in store", money(s.spend)], ["Sales with a customer", `${s.linkedShare}%`], ["Top 20% bring in", `${s.top20Share}% of it`], ["Agreed to marketing", s.marketing]].map(([l, v]) => (
          <div key={l} className="rounded-xl border p-3"><p className="text-xs text-neutral-500">{l}</p><p className="font-heading text-2xl">{v}</p></div>))}
      </div>
      {data.vipItems.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-semibold flex items-center gap-1 mb-1"><Crown className="h-4 w-4" />What your VIPs buy most (never run out of these)</p><p className="text-amber-900">{data.vipItems.map((i) => `${i.name} (${i.qty})`).join(" · ")}</p></div>}
      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex-1 min-w-[200px] relative"><Search className="w-4 h-4 absolute left-3 top-3 text-neutral-400" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email or item" className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm" /></label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">{[["", `All (${s.count})`], ["VIP", `VIP (${s.vip})`], ["Regular", `Regulars (${s.regular})`], ["Overdue", `Overdue (${s.overdue})`], ["New", `New (${s.new})`]].map(([k, l]) => <button key={l} type="button" aria-pressed={tag === k} onClick={() => setTag(k)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${tag === k ? "bg-neutral-900 text-white" : ""}`}>{l}</button>)}</div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="border rounded-xl px-2 py-2.5 text-sm" aria-label="Sort"><option value="spend">Top spenders</option><option value="month">Top this month</option><option value="visits">Most visits</option><option value="recent">Most recent</option><option value="away">Longest away</option></select>
      </div>
      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-3">#</th><th className="p-3">Customer</th><th className="p-3 text-right">Spent</th><th className="p-3 text-right">Visits</th><th className="p-3 text-right hidden md:table-cell">Avg sale</th><th className="p-3 hidden md:table-cell">Buys most</th><th className="p-3">Last visit</th></tr></thead>
          <tbody>{list.map((c, i) => (
            <tr key={c.id} className="border-t hover:bg-emerald-50 cursor-pointer" onClick={() => setOpen(c.id)}>
              <td className="p-3 text-neutral-400">{i + 1}</td>
              <td className="p-3"><div className="font-semibold flex flex-wrap gap-1 items-center">{c.name}<Tags tags={c.tags} /></div><div className="text-xs text-neutral-500">{c.phone || c.email || ""}</div></td>
              <td className="p-3 text-right font-bold tabular-nums">{money(c.spend)}</td>
              <td className="p-3 text-right tabular-nums">{c.visits}{c.everyDays ? <div className="text-[11px] text-neutral-500">every ~{Math.round(c.everyDays)}d</div> : null}</td>
              <td className="p-3 text-right tabular-nums hidden md:table-cell">{money(c.average)}</td>
              <td className="p-3 hidden md:table-cell max-w-[260px] truncate">{c.topItems.slice(0, 2).map((x) => x.name).join(", ") || "—"}</td>
              <td className="p-3 whitespace-nowrap">{ago(c.daysSinceLast)}</td>
            </tr>))}
            {!list.length && <tr><td colSpan={7} className="p-6 text-center text-neutral-500">No customers match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-400">Only sales where a customer was added at the register (phone or name on the receipt) count here. Ask customers for their phone number at checkout to see more.</p>
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </section>
  );
};

export default AdminCustomers;

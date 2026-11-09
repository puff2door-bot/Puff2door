import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, ExternalLink, FileText, Mail, RefreshCw, Search, Wallet } from "lucide-react";
import api from "../../api";

const money = (v) => (v == null ? "—" : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const etDay = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const firstOfMonth = () => { const d = new Date(); return `${etDay(d).slice(0, 8)}01`; };
const firstOfYear = () => `${etDay(new Date()).slice(0, 4)}-01-01`;
const when = (v) => new Date(v).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
const COLORS = ["#059669", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#14b8a6", "#6366f1", "#ec4899", "#84cc16", "#f97316", "#64748b", "#a855f7", "#94a3b8"];

const BusinessExpenses = () => {
  const [params] = useSearchParams();
  const [start, setStart] = useState(firstOfYear());
  const [end, setEnd] = useState(etDay(new Date()));
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(params.get("gmail") === "connected" ? "Gmail connected. Receipts are being collected now; refresh in a minute." : params.get("gmail") === "error" ? "Gmail could not be connected. Please try again." : "");
  const [busy, setBusy] = useState("");
  const [sendersFor, setSendersFor] = useState(null);
  const [senderText, setSenderText] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setData((await api.get("/admin/expenses", { params: { start, end, category, q, hidden } })).data); }
    catch (e) { setError(e?.response?.data?.detail || "Could not load expenses."); }
  }, [start, end, category, q, hidden]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const connect = async (mode) => {
    setBusy(`connect-${mode}`);
    try { window.location.href = (await api.post("/admin/gmail/connect", null, { params: { mode, hint: mode === "business" ? "puff2door@gmail.com" : "" } })).data.url; }
    catch (e) { setNotice(e?.response?.data?.detail || "Could not start Gmail sign-in."); setBusy(""); }
  };
  const sync = async () => {
    setBusy("sync");
    try { const { data: r } = await api.post("/admin/expenses/sync"); setNotice(`Checked Gmail: ${r.added} new receipt${r.added === 1 ? "" : "s"} found.`); await load(); }
    catch (e) { setNotice("Could not check Gmail right now."); }
    setBusy("");
  };
  const edit = async (row, changes) => {
    setBusy(row.id);
    try { await api.patch(`/admin/expenses/${row.id}`, changes); await load(); }
    catch (e) { setNotice("Could not save that change."); }
    setBusy("");
  };
  const saveSenders = async () => {
    const senders = senderText.split(/[\s,]+/).filter(Boolean);
    try { await api.post("/admin/gmail/senders", { email: sendersFor, senders }); setSendersFor(null); setNotice("Approved senders saved. Click “Check Gmail now” to collect their receipts."); await load(); }
    catch (e) { setNotice("Could not save the senders."); }
  };
  const csv = () => {
    const head = ["Date", "Vendor", "Category", "Amount", "Invoice #", "Subject", "Inbox", "Notes"];
    const rows = (data?.items || []).map((r) => [r.date.slice(0, 10), r.vendor, r.category, r.amount ?? "", r.invoice, r.subject, r.inbox, r.notes || ""]);
    const text = [head, ...rows].map((c) => c.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = `business-expenses-${start}-to-${end}.csv`;
    a.click();
  };

  const catTotal = useMemo(() => (data?.categories || []).reduce((a, c) => a + c.total, 0), [data]);
  const inboxes = data?.inboxes || [];
  const business = inboxes.find((i) => i.mode === "business");
  const personal = inboxes.filter((i) => i.mode === "personal");

  return (
    <section className="space-y-5" data-testid="business-expenses">
      <div>
        <h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><Wallet className="w-7 h-7" />Business expenses</h1>
        <p className="text-sm text-neutral-500">Receipts and bills collected from Gmail and sorted by category. Gmail is only read, never changed.</p>
      </div>
      {notice && <p role="status" className="rounded-xl bg-emerald-50 text-emerald-900 px-4 py-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl border p-4 text-sm">
          <p className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4" />Business inbox</p>
          {business ? <p className="text-neutral-600 mt-1">{business.email} · every receipt is collected{business.lastSyncAt ? ` · checked ${when(business.lastSyncAt)}` : ""}{business.lastError ? <span className="block text-red-700">{business.lastError}</span> : null}</p>
            : <button type="button" disabled={!data?.configured || busy} onClick={() => connect("business")} className="mt-2 rounded-xl bg-emerald-700 text-white px-3 py-2 font-semibold disabled:opacity-50">Connect puff2door@gmail.com</button>}
        </div>
        <div className="rounded-2xl border p-4 text-sm">
          <p className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4" />Personal inbox (approved senders only)</p>
          {personal.map((p) => (
            <div key={p.email} className="mt-1 text-neutral-600">{p.email} · {(p.approvedSenders || []).length} approved sender{(p.approvedSenders || []).length === 1 ? "" : "s"}
              <button type="button" className="ml-2 underline" onClick={() => { setSendersFor(p.email); setSenderText((p.approvedSenders || []).join("\n")); }}>Edit senders</button></div>
          ))}
          {!personal.length && <><p className="text-neutral-500 mt-1">Optional. Nothing is imported until you approve senders (for example altamonte.org, lowes.com).</p>
            <button type="button" disabled={!data?.configured || busy} onClick={() => connect("personal")} className="mt-2 rounded-xl border px-3 py-2 font-semibold disabled:opacity-50">Connect a personal Gmail</button></>}
        </div>
      </div>

      {sendersFor && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm space-y-2">
          <p className="font-semibold">Approved senders for {sendersFor}</p>
          <p className="text-neutral-600">One per line: a full email (billing@yashcon.com) or a whole domain (altamonte.org). Only mail from these is imported.</p>
          <textarea value={senderText} onChange={(e) => setSenderText(e.target.value)} rows={6} className="w-full border rounded-xl p-2 font-mono text-xs" aria-label="Approved senders" />
          <div className="flex gap-2"><button type="button" onClick={saveSenders} className="rounded-xl bg-neutral-900 text-white px-3 py-2 font-semibold">Save</button><button type="button" onClick={() => setSendersFor(null)} className="rounded-xl border px-3 py-2">Cancel</button></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs font-semibold text-neutral-500">From<input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className="block border rounded-xl px-3 py-2 text-sm text-neutral-900" /></label>
        <label className="text-xs font-semibold text-neutral-500">To<input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="block border rounded-xl px-3 py-2 text-sm text-neutral-900" /></label>
        <div className="flex gap-1">{[["This month", firstOfMonth()], ["This year", firstOfYear()]].map(([l, s]) => <button key={l} type="button" onClick={() => { setStart(s); setEnd(etDay(new Date())); }} className="border rounded-xl px-3 py-2 text-xs font-semibold">{l}</button>)}</div>
        <label className="flex-1 min-w-[180px] relative"><Search className="w-4 h-4 absolute left-3 top-3 text-neutral-400" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vendor, invoice # or amount" className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm" /></label>
        <button type="button" onClick={sync} disabled={busy === "sync" || !inboxes.length} className="border rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${busy === "sync" ? "animate-spin" : ""}`} />Check Gmail now</button>
        <button type="button" onClick={csv} disabled={!data?.items?.length} className="border rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"><Download className="w-4 h-4" />CSV</button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
            <section className="rounded-2xl border p-5">
              <div className="flex justify-between items-baseline"><h2 className="font-heading text-lg uppercase">By category</h2><b className="font-heading text-2xl">{money(catTotal)}</b></div>
              {catTotal > 0 && <div className="flex h-3 rounded-full overflow-hidden my-3">{data.categories.map((c, i) => <div key={c.name} title={`${c.name}: ${money(c.total)}`} style={{ width: `${(c.total / catTotal) * 100}%`, background: COLORS[i % COLORS.length] }} />)}</div>}
              <div className="space-y-1">
                <button type="button" onClick={() => setCategory("")} className={`w-full flex justify-between text-sm rounded-lg px-2 py-1.5 ${!category ? "bg-neutral-100 font-semibold" : "hover:bg-neutral-50"}`}><span>All categories</span><span>{money(catTotal)}</span></button>
                {data.categories.map((c, i) => (
                  <button key={c.name} type="button" onClick={() => setCategory(c.name === category ? "" : c.name)} className={`w-full flex justify-between text-sm rounded-lg px-2 py-1.5 ${category === c.name ? "bg-neutral-100 font-semibold" : "hover:bg-neutral-50"}`}>
                    <span className="flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORS[i % COLORS.length] }} />{c.name}</span><span className="tabular-nums">{money(c.total)}</span>
                  </button>
                ))}
                {!data.categories.length && <p className="text-sm text-neutral-500">No receipts in these dates yet.</p>}
              </div>
            </section>
            <section className="rounded-2xl border p-5">
              <h2 className="font-heading text-lg uppercase mb-3">Top vendors{category ? ` · ${category}` : ""}</h2>
              {data.vendors.map((v) => <div key={v.vendor} className="flex justify-between text-sm py-1 border-t first:border-0"><span className="truncate">{v.vendor} <span className="text-neutral-400">({v.count})</span></span><b className="tabular-nums">{money(v.total)}</b></div>)}
              {data.months.length > 1 && <><h3 className="font-semibold text-sm mt-4 mb-1">By month</h3>{data.months.map((m) => <div key={m.month} className="flex justify-between text-sm"><span>{new Date(`${m.month}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span><span className="tabular-nums">{money(m.total)}</span></div>)}</>}
            </section>
          </div>

          <div className="flex justify-between items-center text-sm">
            <p className="font-semibold">{data.items.length} receipt{data.items.length === 1 ? "" : "s"} · {money(data.total)}{data.missingAmount ? ` · ${data.missingAmount} without an amount (open to check)` : ""}</p>
            <label className="flex items-center gap-2 text-neutral-600"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />Show “not a receipt”</label>
          </div>
          <div className="rounded-2xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-3">Date</th><th className="p-3">Vendor</th><th className="p-3">Category</th><th className="p-3 text-right">Amount</th><th className="p-3">Proof</th><th className="p-3" /></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-3 whitespace-nowrap">{when(r.date)}</td>
                    <td className="p-3 min-w-[200px]"><div className="font-semibold">{r.vendor}</div><div className="text-xs text-neutral-500 truncate max-w-[320px]">{r.subject}{r.invoice ? ` · #${r.invoice}` : ""}</div></td>
                    <td className="p-3"><select value={r.category} disabled={busy === r.id} onChange={(e) => edit(r, { category: e.target.value })} className="border rounded-lg px-2 py-1 text-xs bg-white" aria-label={`Category for ${r.vendor}`}>{data.allCategories.map((c) => <option key={c}>{c}</option>)}</select></td>
                    <td className="p-3 text-right"><input key={`${r.id}-${r.amount}`} type="number" step="0.01" defaultValue={r.amount ?? ""} placeholder="—" onBlur={(e) => { const v = e.target.value; if (String(v) !== String(r.amount ?? "")) edit(r, v === "" ? { clearAmount: true } : { amount: Number(v) }); }} className="w-24 border rounded-lg px-2 py-1 text-right tabular-nums" aria-label={`Amount for ${r.vendor}`} /></td>
                    <td className="p-3 whitespace-nowrap text-xs space-y-1">
                      <a href={r.gmailUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><ExternalLink className="w-3 h-3" />Email</a>
                      {(r.attachments || []).map((a) => <button key={a.attachmentId} type="button" onClick={async () => { const res = await api.get(`/admin/expenses/${r.id}/attachment/${encodeURIComponent(a.attachmentId)}`, { responseType: "blob" }); window.open(URL.createObjectURL(res.data), "_blank"); }} className="flex items-center gap-1 underline"><FileText className="w-3 h-3" />{a.name.slice(0, 22)}</button>)}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {hidden ? <button type="button" className="underline" onClick={() => edit(r, { notReceipt: false })}>Put back</button>
                        : <><button type="button" className="underline text-neutral-500 block" onClick={() => edit(r, { notReceipt: true })}>Not a receipt</button>
                          <button type="button" className="underline text-neutral-500 block" onClick={() => edit(r, { notReceipt: true, ignoreSender: true })}>Ignore this sender</button></>}
                    </td>
                  </tr>
                ))}
                {!data.items.length && <tr><td colSpan={6} className="p-6 text-center text-neutral-500">{inboxes.length ? "No receipts in these dates." : "Connect Gmail above to start collecting receipts."}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-400">Changing a category teaches it: that vendor's other receipts move too, and future ones follow. Checked automatically every 3 hours.</p>
        </>
      )}
    </section>
  );
};

export default BusinessExpenses;

import React, { useCallback, useEffect, useState } from "react";
import { Download, Printer, Receipt, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../../api";

const money = (v) => `$${Number(v || 0).toFixed(2)}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); };
const when = (v) => new Date(v).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const printReceipt = (r) => {
  const w = window.open("", "_blank");
  if (!w) return;
  const lines = r.lines.map((l) => `<tr><td>${esc(l.name)}${l.qty !== 1 ? ` × ${l.qty}` : ""}${l.refunded ? " (refunded)" : ""}</td><td style="text-align:right">${money(l.total)}</td></tr>`).join("");
  const disc = r.discounts.map((d) => `<tr><td>${esc(d.name)}</td><td style="text-align:right">-${money(d.amount)}</td></tr>`).join("");
  const pays = r.payments.map((p) => `<tr><td>${esc(p.type)}${p.cardType ? ` ${esc(p.cardType)}` : ""}${p.last4 ? ` •••• ${esc(p.last4)}` : ""}</td><td style="text-align:right">${money(p.amount)}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>body{font-family:monospace;width:300px;margin:16px auto;font-size:13px}table{width:100%}td{padding:2px 0}h2,p{text-align:center;margin:4px 0}hr{border:0;border-top:1px dashed #000}</style></head><body>
<h2>HD Smoke Shop</h2><p>481 N State Rd 434, Suite 1050<br>Altamonte Springs, FL 32714<br>(407) 625-6826</p><hr><p>${esc(when(r.createdAt))}${r.employee ? ` · ${esc(r.employee)}` : ""}<br>Order ${esc(r.id)}</p><hr>
<table>${lines}${disc}</table><hr><table><tr><td>Tax</td><td style="text-align:right">${money(r.tax)}</td></tr>${r.tip ? `<tr><td>Tip</td><td style="text-align:right">${money(r.tip)}</td></tr>` : ""}<tr><td><b>Total</b></td><td style="text-align:right"><b>${money(r.total)}</b></td></tr></table><hr><table>${pays}</table>
${r.refunds.length ? `<hr><p>Refunded ${money(r.refunds.reduce((a, x) => a + x.amount, 0))}</p>` : ""}<hr><p>Thank you! 21+ only.</p><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
};

const StoreReceipts = () => {
  const [params] = useSearchParams();
  const [from, setFrom] = useState(params.get("start") || daysAgo(6));
  const [to, setTo] = useState(params.get("end") || today());
  const [q, setQ] = useState(params.get("q") || "");
  const [employee, setEmployee] = useState(params.get("employee") || "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setData((await api.get("/admin/receipts/store", { params: { start: from, end: to, q, page, employee } })).data); }
    catch (e) { setError("Could not load receipts."); }
  }, [from, to, q, page, employee]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const show = async (row) => {
    setOpen(row); setDetail(null); setDetailError("");
    try { setDetail((await api.get(`/admin/receipts/store/${row.id}`)).data); }
    catch (e) { setDetailError(e?.response?.data?.detail || "Could not open this receipt."); }
  };

  const csv = async () => {
    const all = [];
    for (let p = 1; p <= 40; p += 1) {
      const { data: d } = await api.get("/admin/receipts/store", { params: { start: from, end: to, q, page: p, employee } });
      all.push(...d.receipts);
      if (all.length >= d.total) break;
    }
    const head = ["Date", "Time", "Order", "Total", "Tax", "Tip", "Discount", "Refunded", "Payment", "Card", "Last 4", "Employee", "Items"];
    const rows = all.map((r) => {
      const t = new Date(r.createdAt);
      return [r.date, t.toLocaleTimeString("en-US", { timeZone: "America/New_York" }), r.id, r.total, r.tax, r.tip, r.discount, r.refunded, r.paymentType, r.cardType, r.last4, r.employee,
        r.items.map((i) => `${i.name}${i.qty !== 1 ? ` x${i.qty}` : ""}`).join("; ")];
    });
    const text = [head, ...rows].map((c) => c.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = `store-receipts-${from}-to-${to}.csv`;
    a.click();
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  return (
    <section className="space-y-4" data-testid="store-receipts">
      <div>
        <h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><Receipt className="w-7 h-7" />Store receipts</h1>
        <p className="text-sm text-neutral-500">Every sale rung up on Clover (last 90 days). Click one to see the full receipt and print it.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs font-semibold text-neutral-500">From<input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="block border rounded-xl px-3 py-2 text-sm text-neutral-900" /></label>
        <label className="text-xs font-semibold text-neutral-500">To<input type="date" value={to} min={from} max={today()} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="block border rounded-xl px-3 py-2 text-sm text-neutral-900" /></label>
        <label className="flex-1 min-w-[200px] relative"><Search className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Item, exact total (24.98), card last 4 or employee" className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm" /></label>
        <button type="button" onClick={csv} disabled={!data?.total} className="border rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"><Download className="w-4 h-4" />CSV</button>
      </div>
      {employee && <p className="text-sm">Showing one employee's receipts. <button type="button" className="underline" onClick={() => { setEmployee(""); setPage(1); }}>Show everyone</button></p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <p className="text-sm font-semibold">{data ? `${data.total} receipt${data.total === 1 ? "" : "s"} · ${money(data.receipts.reduce((a, r) => a + r.total, 0))} on this page` : "Loading…"}</p>
      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-3">When</th><th className="p-3">Items</th><th className="p-3">Payment</th><th className="p-3">Employee</th><th className="p-3 text-right">Total</th></tr></thead>
          <tbody>
            {(data?.receipts || []).map((r) => (
              <tr key={r.id} className="border-t hover:bg-emerald-50 cursor-pointer" onClick={() => show(r)}>
                <td className="p-3 whitespace-nowrap">{when(r.createdAt)}</td>
                <td className="p-3 max-w-[340px] truncate">{r.items.map((i) => i.name).join(", ") || "—"}</td>
                <td className="p-3 whitespace-nowrap">{r.paymentType || "—"}{r.last4 ? ` •••• ${r.last4}` : ""}</td>
                <td className="p-3">{r.employee || "—"}</td>
                <td className="p-3 text-right font-bold tabular-nums whitespace-nowrap">{money(r.total)}{r.paymentState === "REFUNDED" ? <span className="ml-2 text-xs text-red-700">Refunded</span> : r.refunded ? <span className="ml-2 text-xs text-amber-700">-{money(r.refunded)}</span> : null}</td>
              </tr>
            ))}
            {data && !data.receipts.length && <tr><td colSpan={5} className="p-6 text-center text-neutral-500">No receipts for these dates.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && <div className="flex gap-2 items-center text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="border rounded-lg px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="border rounded-lg px-3 py-1.5 disabled:opacity-40">Next</button></div>}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label="Receipt">
          <div className="bg-white w-full max-w-md h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4"><div><h2 className="font-heading text-xl">Receipt</h2><p className="text-xs text-neutral-500 font-mono">{open.id}</p></div><button type="button" onClick={() => setOpen(null)} aria-label="Close"><X className="w-5 h-5" /></button></div>
            {detailError && <p role="alert" className="text-sm text-red-700">{detailError}</p>}
            {!detail && !detailError && <p className="text-sm text-neutral-500">Reading from Clover…</p>}
            {detail && (
              <div className="font-mono text-sm space-y-3">
                <p className="text-neutral-500">{when(detail.createdAt)}{detail.employee ? ` · ${detail.employee}` : ""}</p>
                <table className="w-full">{(detail.lines || []).map((l, i) => <tr key={i} className={l.refunded ? "line-through text-neutral-400" : ""}><td className="py-0.5">{l.name}{l.qty !== 1 ? ` × ${l.qty}` : ""}</td><td className="text-right">{money(l.total)}</td></tr>)}
                  {(detail.discounts || []).map((d, i) => <tr key={`d${i}`} className="text-emerald-700"><td>{d.name}</td><td className="text-right">-{money(d.amount)}</td></tr>)}</table>
                <table className="w-full border-t border-dashed pt-2"><tr><td>Tax</td><td className="text-right">{money(detail.tax)}</td></tr>{detail.tip ? <tr><td>Tip</td><td className="text-right">{money(detail.tip)}</td></tr> : null}<tr className="font-bold"><td>Total</td><td className="text-right">{money(detail.total)}</td></tr></table>
                <table className="w-full border-t border-dashed">{(detail.payments || []).map((p, i) => <tr key={i}><td className="py-0.5">{p.type}{p.cardType ? ` ${p.cardType}` : ""}{p.last4 ? ` •••• ${p.last4}` : ""}</td><td className="text-right">{money(p.amount)}</td></tr>)}</table>
                {(detail.refunds || []).length > 0 && <p className="text-red-700">Refunded {money(detail.refunds.reduce((a, x) => a + x.amount, 0))}</p>}
                {!detail.live && <p className="text-xs text-amber-700">Clover couldn't be reached, so this is the saved copy.</p>}
                <button type="button" onClick={() => printReceipt({ discounts: [], payments: [], refunds: [], lines: [], ...detail })} className="w-full rounded-xl bg-neutral-900 text-white py-2.5 font-sans font-semibold flex items-center justify-center gap-2"><Printer className="w-4 h-4" />Print receipt</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default StoreReceipts;

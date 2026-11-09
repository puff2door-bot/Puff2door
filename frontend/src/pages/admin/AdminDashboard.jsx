import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Barcode, Bell, Camera, Check, ClipboardCopy, FileText, MessageCircle, Package, Plus,
  Printer, Receipt, RefreshCw, ShoppingBag, Star, TrendingDown, TrendingUp, Truck, Wallet,
} from "lucide-react";
import api from "../../api";

const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ago = (d) => {
  if (!d) return "never";
  const days = Math.round((new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })) - new Date(d)) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};
const pace = (w) => (w >= 1 ? `~${Math.round(w)}/week` : w > 0 ? `~${Math.round(w * 4)}/month` : "no sales in 4 weeks");

const Photo = ({ src, name }) => (src
  ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain bg-white" />
  : <div className="h-full w-full grid place-items-center bg-neutral-100 text-neutral-400" aria-label={`No photo for ${name}`}><Camera className="h-6 w-6" /></div>);

const StockCard = ({ p, mode }) => (
  <Link to={`/admin/products?edit=${p.id}`} className="group rounded-2xl border bg-white overflow-hidden hover:border-emerald-500 hover:shadow-sm transition flex flex-col">
    <div className="relative aspect-square border-b"><Photo src={p.image} name={p.name} />
      <span className={`absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full ${p.stock <= 0 ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"}`}>
        {p.stock <= 0 ? "Sold out" : `${p.stock} left`}
      </span>
      {p.noBarcode && <span className="absolute top-2 right-2 bg-white/90 rounded-full p-1" title="No barcode in Clover"><Barcode className="h-3.5 w-3.5 text-neutral-600" /></span>}
    </div>
    <div className="p-3 flex-1 flex flex-col gap-1">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">{p.brand}</p>
      <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-emerald-700">{p.name}</p>
      <div className="mt-auto pt-2 text-xs text-neutral-600 space-y-0.5">
        <p>Sells {pace(p.perWeek)}</p>
        {mode === "reorder" && p.daysLeft != null && <p>Runs out in <b>{p.daysLeft < 1 ? "under a day" : `${Math.round(p.daysLeft)} days`}</b></p>}
        <p>Last sold {ago(p.lastSold)}</p>
        {mode !== "slow" && p.suggest > 0 && <p className="text-emerald-700 font-bold">Order {p.suggest}</p>}
        {mode === "slow" && <p className="text-neutral-700">{p.stock} on shelf · {money(p.stock * p.price)}</p>}
      </div>
    </div>
  </Link>
);

const AdminDashboard = () => {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("reorder");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/admin/dashboard").then(({ data }) => setD(data)).catch((e) => setError(e?.response?.data?.detail || "Failed to load the dashboard"));
  useEffect(() => { load(); }, []);

  const maxDay = useMemo(() => Math.max(1, ...((d?.chart || []).map((x) => x.store + x.web))), [d]);
  if (error) return <p className="text-red-600">{error}</p>;
  if (!d) return <p className="text-neutral-500">Loading dashboard…</p>;

  const t = d.today;
  const change = t.lastWeekSales ? Math.round(((t.storeSales - t.lastWeekSales) / t.lastWeekSales) * 100) : null;
  const list = tab === "reorder" ? d.reorder : tab === "soldout" ? d.soldOut : d.slow;
  const copyList = async (brand) => {
    const groups = brand ? d.shopping.filter((g) => g.brand === brand) : d.shopping;
    const text = groups.map((g) => `${g.brand}\n${g.items.map((i) => `- ${i.name} x${i.qty}`).join("\n")}`).join("\n\n");
    try { await navigator.clipboard.writeText(`HD Smoke Shop order\n\n${text}`); setCopied(brand || "all"); setTimeout(() => setCopied(""), 2000); } catch { /* clipboard blocked */ }
  };
  const checkGmail = async () => { setBusy(true); try { await api.post("/admin/expenses/sync"); } catch { /* shown on the expenses page */ } setBusy(false); load(); };
  const levelStyle = { alert: "border-red-200 bg-red-50 text-red-900", warn: "border-amber-200 bg-amber-50 text-amber-900", info: "border-sky-200 bg-sky-50 text-sky-900" };
  const attentionIcon = { orders: Truck, chat: MessageCircle, barcode: Barcode, review: Star, document: FileText, expense: Wallet };

  return (
    <div data-testid="admin-dashboard" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-heading text-3xl uppercase tracking-tight">Dashboard</h1>
          <p className="text-sm text-neutral-500">{new Date(`${t.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p></div>
        <div className="flex flex-wrap gap-2 text-sm" aria-label="Quick actions">
          <Link to="/admin/products?new=1" className="rounded-xl bg-neutral-900 text-white px-3 py-2 font-semibold flex items-center gap-1"><Plus className="h-4 w-4" />Add product</Link>
          <Link to="/admin/missing-barcodes" className="rounded-xl border px-3 py-2 font-semibold flex items-center gap-1"><Barcode className="h-4 w-4" />Scan barcodes</Link>
          <Link to="/admin/receipts" className="rounded-xl border px-3 py-2 font-semibold flex items-center gap-1"><Printer className="h-4 w-4" />Receipts</Link>
          <button type="button" onClick={checkGmail} disabled={busy} className="rounded-xl border px-3 py-2 font-semibold flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />Check Gmail</button>
        </div>
      </div>

      {/* 1. Today at a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link to="/admin/analytics" className="rounded-2xl border p-4 hover:border-emerald-500">
          <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">In-store sales today</p>
          <p className="font-heading text-3xl">{money(t.storeSales)}</p>
          <p className={`text-xs flex items-center gap-1 ${change == null ? "text-neutral-400" : change >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {change == null ? "no sales last week to compare" : <>{change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{change >= 0 ? "+" : ""}{change}% vs last {new Date(`${t.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })} ({money(t.lastWeekSales)})</>} · {t.storeOrders} sales
          </p>
        </Link>
        <Link to="/admin/orders" className="rounded-2xl border p-4 hover:border-emerald-500"><p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">Website orders waiting</p><p className="font-heading text-3xl">{t.webOrdersWaiting}</p><p className="text-xs text-neutral-500">not delivered or picked up yet</p></Link>
        <button type="button" onClick={() => setTab("reorder")} className="text-left rounded-2xl border p-4 hover:border-emerald-500"><p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">To reorder</p><p className="font-heading text-3xl">{t.toReorder + t.soldOutSellers}</p><p className="text-xs text-neutral-500">{t.toReorder} running low · {t.soldOutSellers} sellers sold out</p></button>
        <Link to="/admin/documents" className="rounded-2xl border p-4 hover:border-emerald-500"><p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">Licenses expiring</p><p className={`font-heading text-3xl ${t.docsExpiring ? "text-red-700" : ""}`}>{t.docsExpiring}</p><p className="text-xs text-neutral-500">in the next 30 days</p></Link>
      </div>

      {/* 5. Needs your attention */}
      {d.attention.length > 0 && (
        <section aria-label="Needs your attention" className="space-y-2">
          {d.attention.map((a, i) => {
            const Icon = attentionIcon[a.kind] || AlertTriangle;
            return <Link key={i} to={a.link} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${levelStyle[a.level]}`}><Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{a.text}</span><span className="text-xs font-semibold underline">Open</span></Link>;
          })}
        </section>
      )}
      {d.attention.length === 0 && <p className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 px-4 py-2.5 text-sm flex items-center gap-2"><Check className="h-4 w-4" />Nothing needs your attention right now.</p>}

      {/* 2. Stock as photo cards */}
      <section className="rounded-2xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-heading text-xl uppercase tracking-wide flex items-center gap-2"><Package className="h-5 w-5 text-amber-500" />Stock</h2>
          <div className="inline-flex rounded-full border p-1 text-xs font-bold" role="group" aria-label="Stock view">
            {[["reorder", `Reorder now (${d.counts.reorder})`], ["soldout", `Sold out (${d.counts.soldOut})`], ["slow", `Slow movers (${d.counts.slow})`]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full ${tab === k ? "bg-neutral-900 text-white" : "text-neutral-600"}`}>{l}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-neutral-500 mb-3">{tab === "reorder" ? "Items that sell at least twice a month and will run out within 10 days, fastest sellers first." : tab === "soldout" ? "Sold out, with the items that used to sell the most first." : d.slowReady ? "In stock but no sale in 60+ days, most money on the shelf first." : "Needs 60 days of sales history first."}</p>
        {list.length === 0 ? <p className="text-sm text-neutral-500 py-6 text-center">Nothing here right now.</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{list.slice(0, 24).map((p) => <StockCard key={p.id} p={p} mode={tab === "slow" ? "slow" : tab === "reorder" ? "reorder" : "soldout"} />)}</div>
        )}
        {list.length > 24 && <p className="text-xs text-neutral-500 mt-3">Showing 24 of {list.length}. <Link to="/admin/products" className="underline">See all products</Link></p>}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6">
        {/* 3. Shopping list by brand */}
        <section className="rounded-2xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-xl uppercase tracking-wide flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-emerald-600" />Order list by brand</h2>
            {d.shopping.length > 0 && <button type="button" onClick={() => copyList("")} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1"><ClipboardCopy className="h-3.5 w-3.5" />{copied === "all" ? "Copied" : "Copy all"}</button>}
          </div>
          {d.shopping.length === 0 ? <p className="text-sm text-neutral-500">Nothing to order right now.</p> : (
            <div className="space-y-4">{d.shopping.map((g) => (
              <div key={g.brand}>
                <div className="flex items-center justify-between"><h3 className="font-semibold">{g.brand} <span className="text-neutral-400 font-normal">· {g.units} units</span></h3>
                  <button type="button" onClick={() => copyList(g.brand)} className="text-xs underline text-neutral-600">{copied === g.brand ? "Copied" : "Copy"}</button></div>
                <ul className="text-sm mt-1 divide-y">{g.items.map((i) => <li key={i.name} className="flex justify-between py-1"><span className="truncate pr-3">{i.name}</span><span className="whitespace-nowrap"><b>×{i.qty}</b> <span className="text-neutral-400 text-xs">({i.stock <= 0 ? "out" : `${i.stock} left`})</span></span></li>)}</ul>
              </div>
            ))}</div>
          )}
          <p className="text-[11px] text-neutral-400 mt-3">Quantities cover about 2 weeks of sales. Copy and text it to your distributor.</p>
        </section>

        <div className="space-y-6">
          {/* 4. Sales mini chart */}
          <section className="rounded-2xl border p-5">
            <div className="flex items-center justify-between mb-2"><h2 className="font-heading text-xl uppercase tracking-wide">Last 14 days</h2><Link to="/admin/analytics" className="text-xs underline">Analytics</Link></div>
            <p className="text-xs text-neutral-500 mb-2"><i className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />In store <i className="inline-block w-2 h-2 rounded-sm bg-sky-500 ml-3 mr-1" />Website</p>
            <div className="flex items-end gap-1 h-36 pb-5">
              {d.chart.map((x) => (
                <div key={x.date} className="flex-1 h-full flex flex-col justify-end relative" title={`${x.date}: store ${money(x.store)} · web ${money(x.web)}`}>
                  {x.web > 0 && <div className="bg-sky-500 rounded-t" style={{ height: `${(x.web / maxDay) * 100}%` }} />}
                  <div className={`bg-emerald-500 min-h-[2px] ${x.web > 0 ? "" : "rounded-t"}`} style={{ height: `${(x.store / maxDay) * 100}%` }} />
                  <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[9px] text-neutral-400">{new Date(`${x.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" })}</span>
                </div>
              ))}
            </div>
          </section>
          {/* 6. Restock alerts */}
          <section className="rounded-2xl border p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="font-heading text-xl uppercase tracking-wide flex items-center gap-2"><Bell className="h-5 w-5 text-emerald-600" />Customers waiting</h2><Link to="/admin/alerts" className="text-xs underline">All alerts</Link></div>
            {d.restock.length === 0 ? <p className="text-sm text-neutral-500">Nobody is waiting on a sold-out item.</p> : (
              <ul className="space-y-2">{d.restock.map((p) => (
                <li key={p.id} className="flex items-center gap-3 text-sm"><span className="h-10 w-10 rounded-lg border overflow-hidden shrink-0"><Photo src={p.image} name={p.name} /></span><span className="flex-1 truncate">{p.name}</span><b className="whitespace-nowrap">{p.waiting} waiting</b></li>
              ))}</ul>
            )}
            <p className="text-[11px] text-neutral-400 mt-2">They get an email automatically when you restock.</p>
          </section>
        </div>
      </div>

      {/* 7. Top sellers this week */}
      <section className="rounded-2xl border p-5">
        <h2 className="font-heading text-xl uppercase tracking-wide mb-3 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-600" />Top sellers this week</h2>
        {d.top.length === 0 ? <p className="text-sm text-neutral-500">No sales recorded this week yet.</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">{d.top.map((p, i) => (
            <Link key={p.id} to={`/admin/products?edit=${p.id}`} className="rounded-xl border overflow-hidden hover:border-emerald-500">
              <div className="relative aspect-square border-b"><Photo src={p.image} name={p.name} /><span className="absolute top-1.5 left-1.5 h-6 w-6 grid place-items-center rounded-full bg-neutral-900 text-white text-xs font-bold">{i + 1}</span></div>
              <div className="p-2"><p className="text-xs font-semibold line-clamp-2 leading-snug">{p.name}</p><p className="text-[11px] text-neutral-500 mt-1">{p.weekQty} sold · {p.stock <= 0 ? <span className="text-red-700 font-semibold">sold out</span> : `${p.stock} left`}</p></div>
            </Link>
          ))}</div>
        )}
      </section>
      <p className="text-[11px] text-neutral-400 flex items-center gap-1"><Receipt className="h-3 w-3" />Sales from Clover and the website, updated about every hour.</p>
    </div>
  );
};

export default AdminDashboard;

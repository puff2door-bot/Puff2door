import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Barcode, DollarSign, Percent, Receipt, RotateCcw, ShoppingBag, Tag } from "lucide-react";
import api from "../../api";

const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;

const Bars = ({ rows, value, label, max, color = "bg-emerald-500" }) => (
  <div className="space-y-2">
    {rows.map((r) => (
      <div key={r.name} className="text-sm">
        <div className="flex justify-between gap-3"><span className="truncate">{r.name}</span><b className="tabular-nums">{label(r)}</b></div>
        <div className="h-1.5 bg-neutral-100 rounded-full mt-1"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, (value(r) / max) * 100)}%` }} /></div>
      </div>
    ))}
  </div>
);

// Store (Clover) sales, or store + website together ("both").
const StoreSales = ({ days, mode }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null); setError("");
    api.get("/admin/store-sales", { params: { days } }).then(({ data: d }) => setData(d)).catch(() => setError("Could not load store sales."));
  }, [days]);
  const both = mode === "both";
  const daily = useMemo(() => (data?.daily || []).map((d) => ({ ...d, total: d.storeRevenue + (both ? d.webRevenue : 0) })), [data, both]);
  const maxDay = Math.max(1, ...daily.map((d) => d.total));
  const busy = (data?.hours || []).filter((h) => h.hour >= 8);
  const maxHour = Math.max(1, ...busy.map((h) => h.revenue));
  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!data) return <p className="text-neutral-500">Loading store sales…</p>;
  const s = data.summary;
  const webRevenue = daily.reduce((a, d) => a + (d.webRevenue || 0), 0);
  const webOrders = daily.reduce((a, d) => a + (d.webOrders || 0), 0);
  const cards = both ? [
    ["Total sales", money(s.gross + webRevenue), DollarSign], ["In store", money(s.gross), ShoppingBag], ["Website", money(webRevenue), BarChart3],
    ["Orders", s.orders + webOrders, Receipt], ["In-store share", `${s.gross + webRevenue ? Math.round((s.gross / (s.gross + webRevenue)) * 100) : 0}%`, Percent],
    ["Refunds (store)", money(s.refunds), RotateCcw],
  ] : [
    ["Sales", money(s.gross), DollarSign], ["Orders", s.orders, ShoppingBag], ["Average sale", money(s.average), BarChart3],
    ["Tax collected", money(s.tax), Receipt], ["Tips", money(s.tips), DollarSign], ["Discounts", money(s.discounts), Tag],
    ["Refunds", money(s.refunds), RotateCcw], ["Items sold", s.items, ShoppingBag], ["“Custom Item” sales", `${money(s.customItemRevenue)} (${s.customItemShare}%)`, Barcode],
  ];
  return (
    <div data-testid="store-sales">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-xl border p-4"><Icon className="h-4 w-4 text-emerald-600" /><p className="text-xs text-neutral-500 mt-2">{label}</p><p className="font-heading text-2xl mt-0.5">{value}</p></div>
        ))}
      </div>
      {!both && s.customItemShare > 0 && (
        <p className="text-sm rounded-xl bg-amber-50 text-amber-900 px-4 py-3 mb-5">
          {s.customItemShare}% of store sales were rung up as “Custom Item”, so we can't tell what sold. <Link to="/admin/missing-barcodes" className="underline font-semibold">Fix missing barcodes</Link>
        </p>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5 mb-5">
        <section className="rounded-2xl border p-5">
          <h2 className="font-heading text-lg uppercase mb-1">Sales by day</h2>
          {both && <p className="text-xs text-neutral-500 mb-3"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />In store <span className="inline-block w-2 h-2 rounded-sm bg-sky-500 ml-3 mr-1" />Website</p>}
          <div className="flex items-end gap-1 h-52 overflow-x-auto pb-7">
            {daily.map((d) => (
              <div key={d.date} className="flex-1 min-w-[18px] h-full flex flex-col justify-end relative" title={`${d.date}: in store ${money(d.storeRevenue)} (${d.storeOrders})${both ? ` · website ${money(d.webRevenue)} (${d.webOrders})` : ""}`}>
                {both && <div className="bg-sky-500 rounded-t" style={{ height: `${(d.webRevenue / maxDay) * 100}%` }} />}
                <div className={`bg-emerald-500 min-h-[2px] ${both ? "" : "rounded-t"}`} style={{ height: `${(d.storeRevenue / maxDay) * 100}%` }} />
                <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-[9px] text-neutral-400 whitespace-nowrap">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="font-heading text-lg uppercase mb-4">Busiest hours (in store)</h2>
          <div className="flex items-end gap-1 h-40 pb-6">
            {busy.map((h) => (
              <div key={h.hour} className="flex-1 h-full flex flex-col justify-end relative" title={`${hourLabel(h.hour)}: ${money(h.revenue)} · ${h.orders} sales`}>
                <div className="bg-emerald-600 rounded-t min-h-[2px]" style={{ height: `${(h.revenue / maxHour) * 100}%` }} />
                <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[9px] text-neutral-400">{hourLabel(h.hour)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        <section className="rounded-2xl border p-5 xl:row-span-2">
          <h2 className="font-heading text-lg uppercase mb-4">Top items (in store)</h2>
          <div className="space-y-2.5">
            {data.topItems.map((p, i) => (
              <div key={`${p.name}-${i}`} className="flex items-center gap-3 text-sm"><span className="h-6 w-6 rounded-full bg-neutral-100 grid place-items-center text-xs font-bold">{i + 1}</span><span className="flex-1 truncate">{p.name}</span><span className="text-neutral-500">{p.qty} sold</span><b>{money(p.revenue)}</b></div>
            ))}
            {!data.topItems.length && <p className="text-sm text-neutral-500">No sales in this period.</p>}
          </div>
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="font-heading text-lg uppercase mb-4">By category</h2>
          <Bars rows={data.categories} value={(r) => r.revenue} label={(r) => money(r.revenue)} max={Math.max(1, ...data.categories.map((r) => r.revenue))} />
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="font-heading text-lg uppercase mb-4">By brand</h2>
          <Bars rows={data.brands} value={(r) => r.revenue} label={(r) => money(r.revenue)} max={Math.max(1, ...data.brands.map((r) => r.revenue))} color="bg-sky-500" />
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="font-heading text-lg uppercase mb-4">Payment types</h2>
          {data.detailsAvailable ? <Bars rows={data.paymentTypes} value={(r) => r.revenue} label={(r) => `${money(r.revenue)} · ${r.orders}`} max={Math.max(1, ...data.paymentTypes.map((r) => r.revenue))} />
            : <p className="text-sm text-neutral-500">Clover isn't sharing payment details with the website yet.</p>}
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="font-heading text-lg uppercase mb-4">By employee</h2>
          <Bars rows={data.employees} value={(r) => r.revenue} label={(r) => `${money(r.revenue)} · ${r.orders}`} max={Math.max(1, ...data.employees.map((r) => r.revenue))} color="bg-violet-500" />
        </section>
      </div>
      <p className="text-xs text-neutral-400 mt-5">Clover sales from {data.from} to {data.to}. Updated about every hour. <Link to="/admin/receipts" className="underline">See every receipt</Link></p>
    </div>
  );
};

export default StoreSales;

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Barcode, ChevronRight, DollarSign, Percent, Receipt, RotateCcw, Search, ShoppingBag, Tag, X } from "lucide-react";
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

// Every item sold in the range, opened from the "Items sold" card.
const ItemsSold = ({ params, onClose }) => {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("revenue");
  useEffect(() => { api.get("/admin/store-sales/items", { params }).then(({ data: d }) => setData(d)).catch(() => setData({ items: [], error: true })); }, [params]);
  const rows = useMemo(() => {
    const list = (data?.items || []).filter((r) => !q || `${r.name} ${r.category} ${r.brand}`.toLowerCase().includes(q.toLowerCase()));
    const by = { revenue: (a, b) => b.revenue - a.revenue, qty: (a, b) => b.qty - a.qty, name: (a, b) => a.name.localeCompare(b.name), last: (a, b) => b.lastSold.localeCompare(a.lastSold) };
    return [...list].sort(by[sort]);
  }, [data, q, sort]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label="Items sold">
      <div className="bg-white w-full max-w-3xl h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <div><h2 className="font-heading text-2xl">Items sold in store</h2>{data && !data.error && <p className="text-sm text-neutral-500">{data.from} to {data.to} · {data.items.length} different items · {data.totalQty} sold · {money(data.totalRevenue)}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <label className="flex-1 min-w-[180px] relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item, category or brand" className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm" /></label>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="border rounded-xl px-2 py-2 text-sm" aria-label="Sort"><option value="revenue">Most sales ($)</option><option value="qty">Most sold (qty)</option><option value="last">Sold most recently</option><option value="name">Name A–Z</option></select>
        </div>
        {!data && <p className="text-sm text-neutral-500">Loading…</p>}
        {data?.error && <p role="alert" className="text-sm text-red-700">Could not load the items.</p>}
        {data && !data.error && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="py-2">Item</th><th className="py-2 text-right">Sold</th><th className="py-2 text-right">Sales</th><th className="py-2 text-right hidden sm:table-cell">Avg price</th><th className="py-2 text-right hidden sm:table-cell">Days sold</th><th className="py-2 text-right hidden md:table-cell">Last sold</th><th className="py-2 text-right hidden md:table-cell">In stock</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`} className={`border-t ${r.custom ? "bg-amber-50" : ""}`}>
                  <td className="py-2 pr-2"><div className="font-semibold">{r.name}</div><div className="text-xs text-neutral-500">{r.custom ? "No barcode, rung up by hand" : [r.category, r.brand].filter(Boolean).join(" · ") || "Not on website"}</div></td>
                  <td className="py-2 text-right tabular-nums">{r.qty}</td>
                  <td className="py-2 text-right tabular-nums font-bold">{money(r.revenue)}</td>
                  <td className="py-2 text-right tabular-nums hidden sm:table-cell">{money(r.avgPrice)}</td>
                  <td className="py-2 text-right tabular-nums hidden sm:table-cell">{r.daysSold}</td>
                  <td className="py-2 text-right hidden md:table-cell">{r.lastSold.slice(5)}</td>
                  <td className="py-2 text-right tabular-nums hidden md:table-cell">{r.stock ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// One employee's sales, days worked (first and last sale), busiest hours and top items.
const EmployeeDetail = ({ who, params, onClose }) => {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/admin/store-sales/employee/${encodeURIComponent(who.id)}`, { params }).then(({ data: x }) => setD(x)).catch(() => setD({ error: true })); }, [who, params]);
  const maxH = Math.max(1, ...((d?.hours || []).map((h) => h.orders)));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Employee ${who.name}`}>
      <div className="bg-white w-full max-w-3xl h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div><h2 className="font-heading text-2xl">{who.name}</h2>{d && !d.error && <p className="text-sm text-neutral-500">{d.role ? `${d.role.toLowerCase()} · ` : ""}{d.from} to {d.to}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        {!d && <p className="text-sm text-neutral-500">Loading…</p>}
        {d?.error && <p role="alert" className="text-sm text-red-700">Could not load this employee.</p>}
        {d && !d.error && d.orders > 0 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[["Sales", money(d.revenue)], ["Orders", d.orders], ["Average sale", money(d.average)], ["Share of store sales", `${d.share}%`],
                ["Items sold", d.itemsSold], ["Days worked", d.daysWorked], ["Rung up as “Custom Item”", `${d.customItemShare}% of lines`]].map(([l, v]) => (
                <div key={l} className="rounded-xl border p-3"><p className="text-xs text-neutral-500">{l}</p><p className="font-heading text-xl">{v}</p></div>
              ))}
            </div>
            <section>
              <h3 className="font-semibold mb-2">Busiest hours</h3>
              <div className="flex items-end gap-1 h-28 pb-5">
                {d.hours.filter((h) => h.hour >= 8).map((h) => (
                  <div key={h.hour} className="flex-1 h-full flex flex-col justify-end relative" title={`${h.orders} sales`}>
                    <div className="bg-violet-500 rounded-t min-h-[2px]" style={{ height: `${(h.orders / maxH) * 100}%` }} />
                    <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[9px] text-neutral-400">{hourLabel(h.hour)}</span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="font-semibold mb-2">Day by day</h3>
              <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="py-1">Day</th><th className="py-1">First sale</th><th className="py-1">Last sale</th><th className="py-1 text-right">Orders</th><th className="py-1 text-right">Sales</th></tr></thead>
                <tbody>{d.days.map((x) => <tr key={x.date} className="border-t"><td className="py-1.5">{new Date(`${x.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td><td>{x.first}</td><td>{x.last}</td><td className="text-right tabular-nums">{x.orders}</td><td className="text-right tabular-nums font-bold">{money(x.revenue)}</td></tr>)}</tbody></table>
            </section>
            <section>
              <h3 className="font-semibold mb-2">What they sold most</h3>
              {d.topItems.map((t, i) => <div key={t.name} className="flex gap-3 text-sm py-1 border-t"><span className="w-5 text-neutral-400">{i + 1}</span><span className="flex-1 truncate">{t.name}</span><span className="text-neutral-500">{Math.round(t.qty * 10) / 10} sold</span><b>{money(t.revenue)}</b></div>)}
            </section>
            <Link to={`/admin/receipts?start=${d.from}&end=${d.to}&employee=${encodeURIComponent(who.id)}`} className="inline-block rounded-xl bg-neutral-900 text-white px-4 py-2 text-sm font-semibold">See their receipts</Link>
          </div>
        )}
        {d && !d.error && !d.orders && <p className="text-sm text-neutral-500">No sales in this period.</p>}
      </div>
    </div>
  );
};

// Store (Clover) sales, or store + website together ("both").
const StoreSales = ({ days, start, end, mode }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showItems, setShowItems] = useState(false);
  const [employee, setEmployee] = useState(null);
  const navigate = useNavigate();
  const params = useMemo(() => (start && end ? { start, end } : { days }), [days, start, end]);
  useEffect(() => {
    setData(null); setError("");
    api.get("/admin/store-sales", { params }).then(({ data: d }) => setData(d)).catch(() => setError("Could not load store sales."));
  }, [params]);
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
    ["Sales", money(s.gross), DollarSign], ["Orders", s.orders, ShoppingBag, () => navigate(`/admin/receipts?start=${data.from}&end=${data.to}`)],
    ["Average sale", money(s.average), BarChart3],
    ["Tax collected", money(s.tax), Receipt], ["Tips", data.detailsAvailable ? money(s.tips) : "—", DollarSign, null, !data.detailsAvailable],
    ["Discounts", data.detailsAvailable || s.discounts ? money(s.discounts) : "—", Tag, null, !data.detailsAvailable && !s.discounts],
    ["Refunds / returns", data.detailsAvailable || s.refunds ? money(s.refunds) : "—", RotateCcw, null, !data.detailsAvailable && !s.refunds],
    ["Items sold", s.items, ShoppingBag, () => setShowItems(true)],
    ["“Custom Item” sales", `${money(s.customItemRevenue)} (${s.customItemShare}%)`, Barcode, () => navigate(`/admin/receipts?start=${data.from}&end=${data.to}&q=custom item`)],
  ];
  return (
    <div data-testid="store-sales">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {cards.map(([label, value, Icon, onClick, needsPermission]) => {
          const body = <><Icon className="h-4 w-4 text-emerald-600" /><p className="text-xs text-neutral-500 mt-2">{label}</p><p className="font-heading text-2xl mt-0.5">{value}</p>
            {needsPermission && <p className="text-[11px] text-neutral-400 mt-1">Needs Clover's payments permission</p>}
            {onClick && <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center">See details<ChevronRight className="w-3 h-3" /></p>}</>;
          return onClick
            ? <button key={label} type="button" onClick={onClick} className="rounded-xl border p-4 text-left hover:border-emerald-500 hover:bg-emerald-50/50">{body}</button>
            : <div key={label} className="rounded-xl border p-4">{body}</div>;
        })}
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
      <section className="rounded-2xl border p-5 mb-5">
        <h2 className="font-heading text-lg uppercase mb-3">Daily sales</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="py-2">Day</th><th className="py-2 text-right">In-store sales</th><th className="py-2 text-right">Orders</th><th className="py-2 text-right">Average</th>{both && <th className="py-2 text-right">Website</th>}{both && <th className="py-2 text-right">Total</th>}<th /></tr></thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t hover:bg-emerald-50 cursor-pointer" onClick={() => navigate(`/admin/receipts?start=${d.date}&end=${d.date}`)}>
                  <td className="py-2">{new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td className="py-2 text-right tabular-nums font-bold">{money(d.storeRevenue)}</td>
                  <td className="py-2 text-right tabular-nums">{d.storeOrders}</td>
                  <td className="py-2 text-right tabular-nums">{d.storeOrders ? money(d.storeRevenue / d.storeOrders) : "—"}</td>
                  {both && <td className="py-2 text-right tabular-nums">{money(d.webRevenue)}</td>}
                  {both && <td className="py-2 text-right tabular-nums font-bold">{money(d.storeRevenue + d.webRevenue)}</td>}
                  <td className="py-2 text-right text-xs text-emerald-700">Receipts</td>
                </tr>
              ))}
              {!daily.length && <tr><td colSpan={7} className="py-4 text-neutral-500">No sales in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
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
          <div className="space-y-1">
            {data.employees.map((r) => {
              const max = Math.max(1, ...data.employees.map((x) => x.revenue));
              return (
                <button key={r.id} type="button" onClick={() => setEmployee(r)} className="w-full text-left text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-violet-50">
                  <div className="flex justify-between gap-3"><span className="truncate font-semibold">{r.name}</span><b className="tabular-nums">{money(r.revenue)} · {r.orders}</b></div>
                  <div className="h-1.5 bg-neutral-100 rounded-full mt-1"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(2, (r.revenue / max) * 100)}%` }} /></div>
                  <span className="text-[11px] text-violet-700 font-semibold">See details</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      {showItems && <ItemsSold params={params} onClose={() => setShowItems(false)} />}
      {employee && <EmployeeDetail who={employee} params={params} onClose={() => setEmployee(null)} />}
      <p className="text-xs text-neutral-400 mt-5">Clover sales from {data.from} to {data.to}. Updated about every hour. <Link to="/admin/receipts" className="underline">See every receipt</Link></p>
    </div>
  );
};

export default StoreSales;

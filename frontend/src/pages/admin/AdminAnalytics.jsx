import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Clock3, DollarSign, MapPin, RotateCcw, ShoppingBag, Users } from "lucide-react";
import api from "../../api";

const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const payLabel = { square: "Card", cash_app: "Cash App", paypal: "PayPal", apple_pay: "Apple Pay", zelle: "Zelle", test_card: "Test card" };

const AdminAnalytics = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); api.get("/admin/analytics", { params: { days } }).then(({ data }) => setData(data)); }, [days]);
  const maxRevenue = useMemo(() => Math.max(1, ...(data?.daily || []).map((d) => d.revenue)), [data]);
  if (!data) return <p className="text-neutral-500">Loading analytics...</p>;
  const cards = [
    ["Net revenue", money(data.summary.netRevenue), DollarSign], ["Orders", data.summary.orders, ShoppingBag],
    ["Average order", money(data.summary.averageOrderValue), BarChart3], ["Customers", data.summary.customers, Users],
    ["Repeat customer rate", `${data.summary.repeatRate}%`, RotateCcw], ["On-time delivery", `${data.summary.onTimeRate}%`, Clock3],
  ];
  return <div data-testid="admin-analytics">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6"><div><h1 className="font-heading text-3xl uppercase tracking-tight">Analytics Dashboard</h1><p className="text-sm text-neutral-500">Sales, customer return rate, fulfillment speed, delivery ZIPs, and product performance.</p></div><div className="flex rounded-full border p-1">{[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={`px-4 py-1.5 rounded-full text-xs font-bold ${days === d ? "bg-neutral-900 text-white" : "text-neutral-600"}`}>{d} days</button>)}</div></div>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">{cards.map(([label, value, Icon]) => <div key={label} className="rounded-xl border p-4"><Icon className="h-4 w-4 text-emerald-600" /><p className="text-xs text-neutral-500 mt-2">{label}</p><p className="font-heading text-2xl mt-0.5">{value}</p></div>)}</div>
    <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5 mb-5">
      <section className="rounded-2xl border p-5"><h2 className="font-heading text-lg uppercase mb-4">Daily revenue</h2><div className="flex items-end gap-1 h-52 overflow-x-auto pb-7">{data.daily.map((d) => <div key={d.date} className="flex-1 min-w-[18px] h-full flex flex-col justify-end group relative"><div title={`${d.date}: ${money(d.revenue)} · ${d.orders} orders`} className="bg-emerald-500 hover:bg-emerald-600 rounded-t transition-colors min-h-[2px]" style={{ height: `${Math.max(2, d.revenue / maxRevenue * 100)}%` }} /><span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-[9px] text-neutral-400 whitespace-nowrap">{d.date.slice(5)}</span></div>)}</div>{!data.daily.length && <p className="text-sm text-neutral-500">No orders in this period.</p>}</section>
      <section className="rounded-2xl border p-5"><h2 className="font-heading text-lg uppercase mb-4">Operations</h2><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-neutral-500">Paid orders</span><b>{data.summary.paidOrders}</b></div><div className="flex justify-between"><span className="text-neutral-500">Average fulfillment</span><b>{data.summary.averageFulfillmentMinutes ? `${data.summary.averageFulfillmentMinutes} min` : "—"}</b></div><div className="flex justify-between"><span className="text-neutral-500">Failed ID checks</span><b>{data.summary.failedIdChecks}</b></div><div className="flex justify-between"><span className="text-neutral-500">Driver tips</span><b>{money(data.summary.tips)}</b></div></div></section>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section className="rounded-2xl border p-5"><h2 className="font-heading text-lg uppercase mb-4">Top products</h2><div className="space-y-3">{data.topProducts.map((p, i) => <div key={`${p.name}-${i}`} className="flex items-center gap-3 text-sm"><span className="h-7 w-7 rounded-full bg-neutral-100 grid place-items-center text-xs font-bold">{i + 1}</span><span className="flex-1 truncate">{p.name}</span><span className="text-neutral-500">{p.qty} sold</span><b>{money(p.revenue)}</b></div>)}</div></section>
      <section className="rounded-2xl border p-5"><h2 className="font-heading text-lg uppercase mb-4 flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-600" /> Top delivery ZIPs</h2><div className="space-y-3">{data.topZips.map((z) => <div key={z.zip} className="flex justify-between text-sm"><span>{z.zip}</span><b>{z.orders} orders</b></div>)}</div><h3 className="text-xs font-bold uppercase text-neutral-500 mt-6 mb-3">Payment methods</h3><div className="flex flex-wrap gap-2">{data.paymentMethods.map((p) => <span key={p.name} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold">{payLabel[p.name] || p.name}: {p.orders}</span>)}</div></section>
    </div>
  </div>;
};

export default AdminAnalytics;

import React, { useEffect, useState } from "react";
import { MapPin, Users, ShoppingCart, BadgeCheck, RefreshCw } from "lucide-react";
import api from "../../api";

// Admin > Visitors: where visitors come from (approximate area), how they found the site, what they looked at.
// The owner's and staff's visits are never counted.
const RANGES = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"]];
const fmtTime = (iso, range) => {
  const d = new Date(iso);
  const opts = range === "today" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return d.toLocaleString("en-US", { ...opts, timeZone: "America/New_York" });
};
const RESULT = { Ordered: "bg-emerald-100 text-emerald-800", Checkout: "bg-amber-100 text-amber-900", "In cart": "bg-sky-100 text-sky-900", Browsed: "bg-neutral-100 text-neutral-600" };

const Bars = ({ rows, label, value, color = () => "bg-emerald-600", note }) => {
  const max = Math.max(1, ...rows.map(value));
  if (!rows.length) return <p className="text-sm text-neutral-500">No visits yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,9.5rem)_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate">{label(r)}{note && note(r) ? <span className="ml-1 text-[11px] text-neutral-500">{note(r)}</span> : null}</span>
          <span className="h-2.5 rounded-full bg-neutral-100 overflow-hidden"><span className={`block h-full rounded-full ${color(r)}`} style={{ width: `${(100 * value(r)) / max}%` }} /></span>
          <b className="text-right tabular-nums">{value(r)}</b>
        </div>
      ))}
    </div>
  );
};

const Stat = ({ icon: Icon, label, value, sub }) => (
  <div className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
    <p className="flex items-center gap-1.5 text-xs text-neutral-500"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</p>
    <p className="font-heading text-2xl sm:text-3xl tabular-nums">{value}</p>
    {sub ? <p className="text-xs text-neutral-500">{sub}</p> : null}
  </div>
);

const AdminVisitors = () => {
  const [range, setRange] = useState("today");
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const load = () => api.get("/admin/visitors", { params: { range } }).then(({ data }) => { setD(data); setError(""); }).catch(() => setError("Couldn't load visitors. Try again in a moment."));
  useEffect(() => { setD(null); load(); const t = setInterval(load, 60000); return () => clearInterval(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  return (
    <div data-testid="admin-visitors">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="hidden lg:block font-heading text-3xl uppercase tracking-tight flex-1">Visitors</h1>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white overflow-hidden text-xs font-bold" role="tablist">
          {RANGES.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => setRange(k)} className={`px-3.5 py-2 ${range === k ? "bg-neutral-900 text-white" : "text-neutral-600"}`}>{l}</button>)}
        </div>
        <button type="button" onClick={load} className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-200 bg-white" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Not counting you: admin accounts and any device that has logged into Admin are left out, plus bots.{d && d.enabled === false ? " Visitor tracking is switched off in Store Settings." : ""}</p>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {!d ? <p className="text-sm text-neutral-500">Loading visitors…</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat icon={Users} label="Visitors" value={d.visitors} sub={<span className="text-emerald-700 font-bold">● {d.liveNow} on the site now</span>} />
            <Stat icon={MapPin} label="From your delivery area" value={`${d.deliveryAreaShare}%`} sub="ZIPs and cities you deliver to" />
            <Stat icon={ShoppingCart} label="Reached checkout" value={d.reachedCheckout} sub={d.visitors ? `${Math.round((100 * d.reachedCheckout) / d.visitors)}% of visitors` : ""} />
            <Stat icon={BadgeCheck} label="Ordered" value={d.ordered} sub={d.visitors ? `${((100 * d.ordered) / d.visitors).toFixed(1)}% of visitors` : ""} />
          </div>
          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4 mb-4">
            <section className="rounded-xl border border-neutral-200 bg-white p-4">
              <h2 className="font-heading text-base uppercase mb-3">Where visitors are</h2>
              <Bars rows={d.areas} label={(r) => r.area} value={(r) => r.count} note={(r) => r.zips.length ? r.zips.join(" · ") : ""} color={(r) => (r.deliverable ? "bg-emerald-600" : "bg-neutral-400")} />
              <p className="mt-3 text-[11px] text-neutral-500">Green = you deliver there. Areas are approximate (from the visitor's internet connection); phone data often shows the nearest big city, e.g. Lake Nona as Orlando.</p>
            </section>
            <section className="rounded-xl border border-neutral-200 bg-white p-4">
              <h2 className="font-heading text-base uppercase mb-3">How they found you</h2>
              <Bars rows={d.sources} label={(r) => r.source} value={(r) => r.count} />
              <h2 className="font-heading text-base uppercase mt-5 mb-3">Device</h2>
              <Bars rows={d.devices} label={(r) => ({ phone: "Phone", desktop: "Laptop / desktop", tablet: "Tablet" }[r.device] || r.device)} value={(r) => r.count} />
            </section>
          </div>
          <section className="rounded-xl border border-neutral-200 bg-white p-4 mb-4">
            <h2 className="font-heading text-base uppercase mb-3">Latest visits</h2>
            {!d.latest.length ? <p className="text-sm text-neutral-500">No visits yet in this period.</p> : (
              <ul className="divide-y divide-neutral-100">
                {d.latest.map((v, i) => (
                  <li key={i} className="py-2.5 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <span className="sm:w-28 shrink-0 font-semibold tabular-nums">{fmtTime(v.at, range)}</span>
                    <span className="sm:w-44 shrink-0">{v.area}{v.zip ? ` · ${v.zip}` : ""}</span>
                    <span className="sm:w-32 shrink-0 text-neutral-500">{v.source}</span>
                    <span className="flex-1 min-w-0 text-neutral-700 truncate">{v.steps.join(" → ")}</span>
                    <span className={`self-start sm:self-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${RESULT[v.result] || RESULT.Browsed}`}>{v.result}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="font-heading text-base uppercase mb-3">Most viewed products</h2>
            {!d.topProducts.length ? <p className="text-sm text-neutral-500">No product views yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500"><th className="py-1.5">Product</th><th className="py-1.5 text-right">Views</th><th className="py-1.5 text-right">Added to cart</th></tr></thead>
                <tbody>{d.topProducts.map((p) => <tr key={p.slug} className="border-t border-neutral-100"><td className="py-2 pr-2">{p.name}</td><td className="py-2 text-right tabular-nums">{p.views}</td><td className="py-2 text-right tabular-nums">{p.cartAdds}</td></tr>)}</tbody>
              </table>
            )}
          </section>
          <p className="mt-4 text-[11px] text-neutral-400">Visits are kept for 90 days. {d.dbipReady ? <>IP geolocation by <a className="underline" href="https://db-ip.com" target="_blank" rel="noreferrer">DB-IP</a>.</> : null}</p>
        </>
      )}
    </div>
  );
};

export default AdminVisitors;

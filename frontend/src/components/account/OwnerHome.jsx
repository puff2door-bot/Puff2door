import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, MessageCircle, Package, MapPinned, Settings, BarChart3, LogOut, Eye, Plus, AlertTriangle, Info, CircleAlert, ExternalLink } from "lucide-react";
import api from "../../api";
import AnimatedLogo from "../AnimatedLogo";
import { useApp } from "../../context/AppContext";

// "My Account" for the owner and admins: today's numbers, shortcuts and what needs attention.
// Customers' account pages are unchanged. "View as a customer" shows the normal page.
const money = (n) => `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date())) % 24;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const LEVEL = {
  alert: { icon: CircleAlert, cls: "text-red-600" },
  warn: { icon: AlertTriangle, cls: "text-amber-600" },
  info: { icon: Info, cls: "text-sky-600" },
};

const Stat = ({ label, value, sub, to }) => (
  <Link to={to} className="block rounded-xl border border-neutral-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition">
    <p className="text-xs text-neutral-500">{label}</p>
    <p className="font-heading text-3xl tabular-nums">{value}</p>
    {sub ? <p className="text-xs text-neutral-500 truncate">{sub}</p> : null}
  </Link>
);

const Tile = ({ to, icon: Icon, label, count, external }) => {
  const cls = "flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3.5 font-bold text-sm hover:border-emerald-300 hover:shadow-sm transition";
  const inner = (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      {label}
      {count > 0 && <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{count}</span>}
      {external && <ExternalLink className="ml-auto h-4 w-4 text-neutral-400" aria-hidden="true" />}
    </>
  );
  return external ? <a href={to} target="_blank" rel="noreferrer" className={cls}>{inner}</a> : <Link to={to} className={cls}>{inner}</Link>;
};

const OwnerHome = ({ onViewAsCustomer }) => {
  const { user, logout } = useApp();
  const [dash, setDash] = useState(null);
  const [visitors, setVisitors] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [win, setWin] = useState(null);
  const [toPick, setToPick] = useState([]);
  const [chats, setChats] = useState(0);

  useEffect(() => {
    const load = () => {
      api.get("/admin/dashboard").then(({ data }) => setDash(data)).catch(() => setDash({}));
      api.get("/admin/visitors", { params: { range: "today" } }).then(({ data }) => setVisitors(data)).catch(() => setVisitors({}));
      api.get("/admin/picking").then(({ data }) => setToPick(data.orders || [])).catch(() => {});
      api.get("/admin/chat/conversations", { params: { status: "open" } }).then(({ data }) => setChats(data.unreadTotal || 0)).catch(() => {});
    };
    load();
    api.get("/google-reviews").then(({ data }) => setReviews(data)).catch(() => {});
    api.get("/delivery/window").then(({ data }) => setWin(data)).catch(() => {});
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const today = (dash && dash.today) || {};
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date())) % 24;
  const storeOpen = hour >= 10 && hour < 22;
  const deliveryText = !win ? "" : win.sameDayOpen ? `Same-day delivery open till ${win.cutoffLabel}` : "Delivery closed for today";
  const rating = reviews && (reviews.averageRating || (reviews.summary && reviews.summary.averageRating));
  const ratingCount = reviews && (reviews.totalReviewCount || reviews.total);
  const lowStock = ((dash && dash.reorder) || []).slice(0, 3);
  const attention = (dash && dash.attention) || [];

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-8 sm:py-12" data-testid="owner-home">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <AnimatedLogo className="h-14 w-14" />
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl uppercase tracking-tight">{greeting()}, {user.firstName && user.firstName !== "Admin" ? user.firstName : "boss"}</h1>
          <p className="text-sm text-neutral-500 truncate">{user.email} · Owner</p>
        </div>
        <span className={`sm:ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${storeOpen ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-700"}`}>
          <span className={`h-2 w-2 rounded-full ${storeOpen ? "bg-emerald-500" : "bg-neutral-400"}`} />
          {storeOpen ? "Store open till 10 PM" : "Store closed · opens 10 AM"}{deliveryText ? ` · ${deliveryText}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat to="/admin" label="Today's sales (Clover)" value={dash ? money(today.storeSales) : "…"} sub={dash ? `${today.storeOrders || 0} sales · last ${new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })} ${money(today.lastWeekSales)}` : ""} />
        <Stat to="/admin/orders" label="Website orders open" value={dash ? today.webOrdersWaiting || 0 : "…"} sub={`${toPick.length} to pick`} />
        <Stat to="/admin/visitors" label="Visitors today" value={visitors ? visitors.visitors || 0 : "…"} sub={visitors && visitors.areas && visitors.areas[0] ? `Top: ${visitors.areas[0].area}` : "Not counting you"} />
        <Stat to="/admin/reviews" label="Google rating" value={rating ? `${Number(rating).toFixed(1)}★` : "…"} sub={ratingCount ? `${ratingCount} reviews` : ""} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Tile to="/admin/orders" icon={ShoppingBag} label="Orders" count={toPick.length} />
        <Tile to="/admin/chat" icon={MessageCircle} label="Live chat" count={chats} />
        <Tile to="/admin/products" icon={Package} label="Products" />
        <Tile to="/admin/visitors" icon={MapPinned} label="Visitors" />
        <Tile to="/admin/analytics" icon={BarChart3} label="Analytics" />
        <Tile to="/admin/settings" icon={Settings} label="Store settings" />
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="font-heading text-base uppercase mb-2">Needs attention</h2>
          {!dash ? <p className="text-sm text-neutral-500">Loading…</p> : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {toPick.slice(0, 3).map((o) => (
                <li key={o.id}><Link to="/admin/picking" className="flex items-center gap-2 py-2.5 hover:text-emerald-700"><ShoppingBag className="h-4 w-4 text-emerald-600 shrink-0" />Order {o.orderNumber} · ${Number(o.total || 0).toFixed(2)} · ready to pick</Link></li>
              ))}
              {attention.map((a, i) => {
                const L = LEVEL[a.level] || LEVEL.info;
                return <li key={i}><Link to={a.link || "/admin"} className="flex items-center gap-2 py-2.5 hover:text-emerald-700"><L.icon className={`h-4 w-4 shrink-0 ${L.cls}`} />{a.text}</Link></li>;
              })}
              {lowStock.map((p) => (
                <li key={p.id}><Link to="/admin" className="flex items-center gap-2 py-2.5 hover:text-emerald-700"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />{p.name}: {p.stock} left{p.daysLeft != null ? ` (about ${Math.max(0, Math.round(p.daysLeft))} days)` : ""}</Link></li>
              ))}
              {!toPick.length && !attention.length && !lowStock.length && <li className="py-2.5 text-neutral-500">All clear. Nothing needs you right now.</li>}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="font-heading text-base uppercase mb-3">Quick actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">Open Admin</Link>
            <Link to="/admin/products" className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-bold hover:bg-neutral-50"><Plus className="h-4 w-4" />Add a product</Link>
            <a href="https://business.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-bold hover:bg-neutral-50">Google Business<ExternalLink className="h-3.5 w-3.5" /></a>
            <button type="button" onClick={onViewAsCustomer} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-bold hover:bg-neutral-50"><Eye className="h-4 w-4" />View as a customer</button>
            <button type="button" onClick={logout} data-testid="owner-logout" className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white hover:bg-neutral-700"><LogOut className="h-4 w-4" />Log out</button>
          </div>
          <p className="mt-4 text-xs text-neutral-500">Only admins see this page. Customers see their rewards and orders here.</p>
        </section>
      </div>
    </div>
  );
};

export default OwnerHome;

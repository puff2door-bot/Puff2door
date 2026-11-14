import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RotateCcw, Truck, Plus, Store } from "lucide-react";
import api, { imgUrl } from "../api";
import { useApp } from "../context/AppContext";
import { useCart } from "../context/CartContext";
import { useCatalog } from "../context/CatalogContext";
import { useToast } from "../hooks/use-toast";
import { useDeliveryWindow } from "./DeliveryCountdown";

// Small storefront features, each with an on/off switch in Admin > Store Settings (delivery.features).
export const useFeature = (key) => {
  const { delivery } = useCart();
  const f = delivery && delivery.features;
  return !f || f[key] !== false;
};

const shortClock = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
};
const fmtLeft = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// 1. "Same as last time?" one-tap reorder on the homepage (signed-in customers with a past order).
export const ReorderCard = () => {
  const { user } = useApp();
  const { addItem } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const on = useFeature("reorderCardEnabled");
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!on || !user || user.role === "admin") return;
    api.get("/orders").then(({ data }) => {
      const last = (data.orders || []).find((o) => !["cancelled", "returned", "id_check_failed"].includes(o.status) && o.paymentStatus !== "awaiting_payment");
      setOrder(last || null);
    }).catch(() => {});
  }, [on, user]);
  if (!on || !user || user.role === "admin" || !order || !order.items || !order.items.length) return null;
  const items = order.items;
  const summary = items.slice(0, 3).map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ") + (items.length > 3 ? ` +${items.length - 3} more` : "");
  const reorder = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${order.id}/reorder`);
      data.items.forEach((item) => addItem({ id: item.productId, slug: item.slug, name: item.name, price: item.price, image: item.image, category: item.category, categorySlug: item.categorySlug, inStock: true }, item.qty));
      const notes = [];
      if (data.unavailable?.length) notes.push(`${data.unavailable.length} sold-out item(s) skipped`);
      toast({ title: "Your usual is in the cart", description: notes.join(" · ") || "Today's prices and stock were checked." });
      navigate("/cart");
    } catch (error) {
      toast({ title: "Couldn't reorder", description: error?.response?.data?.detail || "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <section className="max-w-[1280px] mx-auto px-4 pt-8 sm:pt-10" data-testid="reorder-card">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex -space-x-3 shrink-0">
          {items.slice(0, 3).map((i, n) => (
            <span key={n} className="h-12 w-12 rounded-xl bg-white border border-emerald-100 grid place-items-center overflow-hidden">
              {i.image ? <img src={imgUrl(i.image)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : null}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-emerald-900">Welcome back{user.firstName ? `, ${user.firstName}` : ""}. Same as last time?</p>
          <p className="text-sm text-emerald-900/80 truncate">{summary}</p>
        </div>
        <button type="button" onClick={reorder} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />{busy ? "Adding…" : "Reorder in one tap"}
        </button>
      </div>
    </section>
  );
};

// 3. Cart: small in-stock add-ons that close the gap to free delivery.
export const CartAddons = ({ subtotal, min }) => {
  const on = useFeature("cartAddonsEnabled");
  const { products } = useCatalog();
  const { items, addItem } = useCart();
  const left = Math.max(0, (min || 0) - subtotal);
  const picks = useMemo(() => {
    if (!on || !(min > 0) || left <= 0) return [];
    const inCart = new Set(items.map((i) => i.id));
    return (products || [])
      .filter((p) => p.inStock && !inCart.has(p.id) && p.price >= 1 && p.price <= left + 10 && p.price >= Math.min(left, 3))
      .map((p) => ({ p, score: Math.abs(p.price - left) + (p.price < left ? 2 : 0) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((x) => x.p);
  }, [on, min, left, items, products]);
  if (!picks.length) return null;
  return (
    <div className="rounded-lg border border-emerald-100 bg-white p-3" data-testid="cart-addons">
      <p className="text-xs font-bold text-emerald-700 mb-2">Grab one of these for FREE delivery:</p>
      <div className="grid grid-cols-3 gap-2">
        {picks.map((p) => (
          <div key={p.id} className="rounded-lg border border-neutral-200 p-2 text-center text-xs">
            <div className="h-12 grid place-items-center mb-1">{p.image ? <img src={imgUrl(p.image)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : null}</div>
            <p className="line-clamp-2 leading-tight min-h-[2rem]">{p.name}</p>
            <p className="font-bold">${p.price.toFixed(2)}</p>
            <button type="button" onClick={() => addItem(p, 1)} className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"><Plus className="h-3 w-3" />Add</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// 4. Product pages: "Order in 1h 20m for delivery today, 12–6 PM" (or tomorrow after the cutoff).
export const ProductDeliveryCountdown = () => {
  const on = useFeature("productCountdownEnabled");
  const { window: win, remaining, sameDayOpen, enabled } = useDeliveryWindow();
  if (!on || !win || !enabled || !win.nextDeliveryDate) return null;
  const hours = `${shortClock(win.deliveryStart)}–${shortClock(win.deliveryEnd)}`;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="product-countdown">
      <Truck className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      {sameDayOpen && remaining > 0
        ? <span><b>Order in {fmtLeft(remaining)}</b> for delivery <b>today</b>, {hours}</span>
        : <span>Order now for delivery <b>{(win.nextDeliveryLabel || "next day").toLowerCase()}</b> from {shortClock(win.deliveryStart)}</span>}
    </div>
  );
};

// 8. "In stock at the store" + "Only X left" (from Clover stock).
export const StockBadge = ({ product, compact = false }) => {
  const on = useFeature("stockBadgeEnabled");
  if (!on || !product || !product.inStock) return null;
  const low = typeof product.stock === "number" && product.stock > 0 && product.stock <= 5;
  if (compact) return low ? <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Only {product.stock} left</span> : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="stock-badge">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800"><Store className="h-3.5 w-3.5" aria-hidden="true" />In stock at the store · SR 434</span>
      {low && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-900">Only {product.stock} left</span>}
    </div>
  );
};

// 5. /in-store: "Show this at the counter" first-visit deal, one code per phone.
export const CounterDealPage = () => {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let device = "";
    try {
      device = localStorage.getItem("p2d_device") || "";
      if (!device) { device = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[^a-zA-Z0-9]/g, ""); localStorage.setItem("p2d_device", device); }
    } catch { device = `${Date.now()}${Math.random()}`.replace(/\D/g, ""); }
    api.post("/counter-deal/claim", { device }).then(({ data }) => setState(data)).catch((e) => setState({ error: e?.response?.data?.detail || "This offer isn't available right now." }));
  }, []);
  const ends = state.ends ? new Date(`${state.ends}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  return (
    <div className="max-w-md mx-auto px-4 py-12" data-testid="counter-deal">
      {state.loading ? <p className="text-center text-neutral-500">Getting your code…</p> : state.error ? (
        <div className="text-center"><h1 className="font-heading text-3xl uppercase mb-2">Offer ended</h1><p className="text-neutral-600 mb-6">{state.error}</p><Link to="/" className="font-bold text-emerald-700 hover:underline">Back to the shop</Link></div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-emerald-600 bg-white p-6 text-center">
          <p className="text-xs font-extrabold tracking-[0.15em] text-emerald-700">FIRST VISIT · IN STORE ONLY</p>
          <h1 className="font-heading text-5xl my-1">{state.percent}% OFF</h1>
          <p className="text-sm text-neutral-700">Show this screen at the counter<br />481 N State Rd 434, Suite 1050, Altamonte Springs</p>
          <p className={`my-4 rounded-lg py-3 font-mono text-3xl font-bold tracking-[0.2em] ${state.redeemed ? "bg-neutral-100 text-neutral-400 line-through" : "bg-emerald-50 text-emerald-900"}`}>{state.code}</p>
          {state.redeemed ? <p className="text-sm font-bold text-neutral-600">Already used. Thanks for visiting!</p> : null}
          <p className="text-xs text-neutral-500">One per customer · 21+ with valid ID · In-store purchases only{ends ? ` · Ends ${ends}` : ""}</p>
          <p className="mt-4 text-xs text-neutral-500">Open 10 AM–10 PM daily · (407) 625-6826</p>
        </div>
      )}
    </div>
  );
};

// 10. Checkout: "2 spots left" on a delivery window (only when 3 or fewer remain).
export const SpotsLeft = ({ window: w }) => {
  const on = useFeature("spotsLeftEnabled");
  if (!on || !w || typeof w.remaining !== "number") return null;
  if (w.full || w.remaining <= 0) return <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-500">Full</span>;
  if (w.remaining > 3) return null;
  return <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{w.remaining} spot{w.remaining === 1 ? "" : "s"} left</span>;
};

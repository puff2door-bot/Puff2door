import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Circle, Truck, Package, MapPin, Home, Clock, PartyPopper, Gift, XCircle } from "lucide-react";
import api, { imgUrl } from "../api";
import { ecommerce } from "../seo/Analytics";
import ZelleInstructions from "../components/checkout/ZelleInstructions";

const PAY_LABEL = { square: "Card", cash_app: "Cash App Pay", paypal: "PayPal", zelle: "Zelle", test_card: "Test card" };

const ICONS = { placed: Package, confirmed: CheckCircle2, out_for_delivery: Truck, delivered: Home };

const Tracker = ({ order }) => {
  const activeIndex = order.timeline.filter((t) => t.done).length - 1;
  return (
    <div className="border border-neutral-200 rounded-xl p-6 sm:p-8">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-heading text-xl uppercase tracking-wide">Delivery Tracker</h2>
        {order.status !== "delivered" ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full"><Clock className="h-3.5 w-3.5" /> {order.manualStatus ? "In Progress" : "Live"}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full"><PartyPopper className="h-3.5 w-3.5" /> Delivered</span>
        )}
      </div>

      {/* Desktop horizontal */}
      <div className="hidden sm:flex items-start justify-between relative">
        <div className="absolute top-6 left-0 right-0 h-1 bg-neutral-200 mx-12">
          <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.max(0, (activeIndex / (order.timeline.length - 1)) * 100)}%` }} />
        </div>
        {order.timeline.map((t, i) => {
          const Icon = ICONS[t.key] || Circle;
          return (
            <div key={t.key} className="relative z-10 flex flex-col items-center text-center w-1/4">
              <span className={`grid place-items-center h-12 w-12 rounded-full border-4 border-white transition-colors ${t.done ? "bg-emerald-500 text-white" : "bg-neutral-200 text-neutral-400"}`}>
                <Icon className="h-5 w-5" />
              </span>
              <p className={`mt-3 text-sm font-semibold ${t.done ? "text-neutral-900" : "text-neutral-400"}`}>{t.label}</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">{t.at ? new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Pending"}</p>
            </div>
          );
        })}
      </div>

      {/* Mobile vertical */}
      <div className="sm:hidden space-y-1">
        {order.timeline.map((t, i) => {
          const Icon = ICONS[t.key] || Circle;
          return (
            <div key={t.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={`grid place-items-center h-10 w-10 rounded-full ${t.done ? "bg-emerald-500 text-white" : "bg-neutral-200 text-neutral-400"}`}><Icon className="h-4 w-4" /></span>
                {i < order.timeline.length - 1 && <span className={`w-0.5 flex-1 min-h-[24px] ${t.done ? "bg-emerald-500" : "bg-neutral-200"}`} />}
              </div>
              <div className="pb-4">
                <p className={`text-sm font-semibold ${t.done ? "text-neutral-900" : "text-neutral-400"}`}>{t.label}</p>
                <p className="text-[11px] text-neutral-400">{t.at ? new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Pending"}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const OrderPage = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/orders/${id}`);
      if (Date.now() - new Date(data.createdAt).getTime() < 15 * 60 * 1000) ecommerce.purchase(data);
      setOrder(data);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="max-w-[1280px] mx-auto px-4 py-24 text-center"><h1 className="font-heading text-3xl mb-3">Order not found</h1><Link to="/" className="text-emerald-600 font-bold">Go Home</Link></div>;
  if (!order) return <div className="max-w-[1280px] mx-auto px-4 py-24 text-center text-neutral-500">Loading order...</div>;

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-10">
      {order.status === "cancelled" ? (
        <div data-testid="cancelled-banner" className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8 flex items-center gap-4">
          <span className="grid place-items-center h-12 w-12 rounded-full bg-red-500 text-white shrink-0"><XCircle className="h-6 w-6" /></span>
          <div>
            <h1 className="font-heading text-2xl uppercase tracking-wide text-red-800">Order cancelled</h1>
            <p className="text-sm text-red-700">Order <span className="font-bold">{order.orderNumber}</span> was cancelled{order.paymentStatus === "refunded" ? " and refunded" : ""}. Questions? Contact us.</p>
          </div>
        </div>
      ) : order.paymentStatus === "awaiting_payment" ? (
        <div data-testid="awaiting-payment-banner" className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 flex items-center gap-4">
          <span className="grid place-items-center h-12 w-12 rounded-full bg-amber-500 text-white shrink-0"><Clock className="h-6 w-6" /></span>
          <div>
            <h1 className="font-heading text-2xl uppercase tracking-wide text-amber-800">Order received — awaiting your payment</h1>
            <p className="text-sm text-amber-700">Order <span className="font-bold">{order.orderNumber}</span> · we'll confirm it as soon as your {PAY_LABEL[order.paymentMethod]} payment arrives.</p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-8 flex items-center gap-4">
          <span className="grid place-items-center h-12 w-12 rounded-full bg-emerald-600 text-white shrink-0"><CheckCircle2 className="h-6 w-6" /></span>
          <div>
            <h1 className="font-heading text-2xl uppercase tracking-wide text-emerald-800">Thank you for your order!</h1>
            <p className="text-sm text-emerald-700">Order <span className="font-bold">{order.orderNumber}</span> · placed {new Date(order.createdAt).toLocaleString()}</p>
          </div>
        </div>
      )}
      {order.zelle && <div className="mb-8 max-w-2xl"><ZelleInstructions recipient={order.zelle.recipient} name={order.zelle.name} amount={order.zelle.amount} memo={order.zelle.memo} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-8">
          {order.status !== "cancelled" && <Tracker order={order} />}
          <div className="border border-neutral-200 rounded-xl p-6">
            <h2 className="font-heading text-xl uppercase tracking-wide mb-4">Items</h2>
            <div className="space-y-4">
              {order.items.map((it, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-16 w-16 bg-neutral-50 rounded-lg overflow-hidden grid place-items-center p-1 shrink-0"><img src={imgUrl(it.image)} alt={it.name} className="max-h-full max-w-full object-contain" /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm text-neutral-800 line-clamp-2">{it.name}</p><p className="text-xs text-neutral-500">Qty {it.qty}</p></div>
                  <span className="font-heading text-lg">${(it.price * it.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6 h-fit">
          <div className="border border-neutral-200 rounded-xl p-6">
            <h2 className="font-heading text-lg uppercase tracking-wide mb-4">Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>${order.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Delivery</span><span>{order.shippingCost === 0 ? "FREE" : `$${order.shippingCost.toFixed(2)}`}</span></div>
              {order.tax > 0 && <div className="flex justify-between" data-testid="order-tax"><span className="text-neutral-500">Sales tax ({(order.taxRate * 100).toFixed(1).replace(/\.0$/, "")}%)</span><span>${order.tax.toFixed(2)}</span></div>}
              {order.discount > 0 && <div className="flex justify-between text-emerald-600" data-testid="order-discount"><span>Discount{order.promoCode ? ` (${order.promoCode})` : ""}</span><span>-${order.discount.toFixed(2)}</span></div>}
              {order.rewardDiscount > 0 && <div className="flex justify-between text-emerald-600" data-testid="order-reward"><span>Rewards ({order.rewardPoints.toLocaleString()} pts)</span><span>-${order.rewardDiscount.toFixed(2)}</span></div>}
              {order.refundedAmount > 0 && <div className="flex justify-between text-red-600" data-testid="order-refunded"><span>Refunded</span><span>-${order.refundedAmount.toFixed(2)}</span></div>}
              <div className="flex justify-between font-heading text-lg border-t pt-2 mt-2"><span>Total</span><span>${order.total.toFixed(2)}</span></div>
              <p className="text-xs text-neutral-400 pt-1" data-testid="order-payment-info">
                {order.paymentStatus === "awaiting_payment" ? `Awaiting ${PAY_LABEL[order.paymentMethod]} payment` : order.paymentStatus === "refunded" ? "Refunded" : `Paid via ${order.paymentBrand || PAY_LABEL[order.paymentMethod]}${order.paymentLast4 && order.paymentMethod !== "paypal" ? ` •••• ${order.paymentLast4}` : ""}`}
              </p>
            </div>
          </div>
          {order.userId && (order.pointsEarned > 0 || order.rewardPoints > 0 || order.paymentStatus === "awaiting_payment") && (
            <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-5" data-testid="order-rewards">
              <h2 className="font-heading text-lg uppercase tracking-wide mb-2 flex items-center gap-2"><Gift className="h-4 w-4 text-emerald-600" /> Puff2door Rewards</h2>
              <div className="text-sm text-neutral-700 space-y-1">
                {order.rewardPoints > 0 && <p data-testid="order-rewards-redeemed">Redeemed <b>{order.rewardPoints.toLocaleString()} pts</b> for ${order.rewardDiscount.toFixed(2)} off.</p>}
                {order.pointsEarned > 0 ? (
                  <p data-testid="order-rewards-earned">You earned <b className="text-emerald-700">+{(order.pointsEarned - (order.pointsReversed || 0)).toLocaleString()} pts</b>{order.pointsReversed ? ` (${order.pointsReversed} reversed after refund)` : ""} on this order.</p>
                ) : order.paymentStatus === "awaiting_payment" ? (
                  <p data-testid="order-rewards-pending">Points are added as soon as your payment is confirmed.</p>
                ) : null}
                <Link to="/my-account" className="inline-block text-xs font-bold text-emerald-700 hover:underline">View my rewards</Link>
              </div>
            </div>
          )}
          <div className="border border-neutral-200 rounded-xl p-6">
            <h2 className="font-heading text-lg uppercase tracking-wide mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-600" /> Delivering To</h2>
            <p className="text-sm text-neutral-700 leading-relaxed">
              {order.shipping.firstName} {order.shipping.lastName}<br />
              {order.shipping.address}<br />
              {order.shipping.city}, {order.shipping.state} {order.shipping.zip}<br />
              {order.shipping.phone}
            </p>
            {order.deliveryDate && order.status !== "cancelled" && (
              <p data-testid="order-delivery-day" className="mt-3 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {order.sameDay ? "Same-day local delivery" : "Scheduled local delivery"}: {new Date(order.deliveryDate + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
              </p>
            )}
          </div>
          <Link to="/shop" className="block text-center py-3 border-2 border-neutral-900 font-bold rounded-full hover:bg-neutral-900 hover:text-white transition-colors">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );
};

export default OrderPage;

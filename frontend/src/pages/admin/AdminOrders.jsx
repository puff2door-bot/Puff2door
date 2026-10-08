import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, BadgeDollarSign, Camera, MessageSquareText, Save } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

const STATUSES = [
  { key: "placed", label: "Order Placed" },
  { key: "confirmed", label: "Preparing" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];
const CANCELLED = { key: "cancelled", label: "Cancelled" };
const ALL_STATUSES = [...STATUSES, CANCELLED];

const PAY_LABEL = { square: "Card", cash_app: "Cash App", paypal: "PayPal", apple_pay: "Apple Pay", zelle: "Zelle", test_card: "Test card" };
const payTone = { paid: "bg-emerald-100 text-emerald-700", awaiting_payment: "bg-amber-100 text-amber-800", refunded: "bg-neutral-200 text-neutral-600" };

const tone = { placed: "bg-neutral-100 text-neutral-700", confirmed: "bg-blue-100 text-blue-700", out_for_delivery: "bg-amber-100 text-amber-700", delivered: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-700" };

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [deliveryDrafts, setDeliveryDrafts] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    api.get("/admin/orders").then(({ data }) => setOrders(data.orders)).finally(() => setLoading(false));
  }, []);

  const setStatus = async (o, status) => {
    if (status === "cancelled" && !window.confirm(`Cancel ${o.orderNumber}? Stock is returned and any rewards points earned on it are reversed.`)) return;
    try {
      const { data } = await api.put(`/admin/orders/${o.id}/status`, { status });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? data : x)));
      toast({ title: "Order updated", description: `${o.orderNumber} → ${ALL_STATUSES.find((s) => s.key === status).label}` });
    } catch (e) {
      toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  const refund = async (o) => {
    const maxRefund = Math.round((o.subtotal - o.discount - (o.rewardDiscount || 0) - (o.refundedAmount || 0)) * 100) / 100;
    const raw = window.prompt(`Refund amount for ${o.orderNumber} (merchandise, up to $${maxRefund.toFixed(2)}). Matching rewards points are reversed automatically.`, maxRefund.toFixed(2));
    if (raw === null) return;
    const amount = Number(raw);
    if (!amount || amount <= 0) return toast({ title: "Invalid amount", variant: "destructive" });
    const reason = window.prompt("Reason (optional)", "") ?? "";
    try {
      const { data } = await api.post(`/admin/orders/${o.id}/refund`, { amount, reason });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? data : x)));
      toast({ title: "Refund recorded", description: `$${amount.toFixed(2)} refunded on ${o.orderNumber}${data.pointsReversed ? ` · ${data.pointsReversed} pts reversed` : ""}` });
    } catch (e) {
      toast({ title: "Refund failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  const markPaid = async (o) => {
    if (!window.confirm(`Confirm you received $${o.total.toFixed(2)} for ${o.orderNumber}?`)) return;
    try {
      const { data } = await api.put(`/admin/orders/${o.id}/payment`, { paymentStatus: "paid" });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? data : x)));
      toast({ title: "Payment confirmed", description: `${o.orderNumber} is now confirmed.` });
    } catch (e) {
      toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  const draftFor = (o) => deliveryDrafts[o.id] || { deliveryPhotoUrl: o.deliveryPhotoUrl || "", driverTextSent: Boolean(o.driverTextSent) };
  const updateDraft = (o, patch) => setDeliveryDrafts((prev) => ({ ...prev, [o.id]: { ...draftFor(o), ...patch } }));
  const saveDelivery = async (o) => {
    try {
      const { data } = await api.put(`/admin/orders/${o.id}/delivery-details`, draftFor(o));
      setOrders((prev) => prev.map((x) => (x.id === o.id ? data : x)));
      setDeliveryDrafts((prev) => { const next = { ...prev }; delete next[o.id]; return next; });
      toast({ title: "Delivery details saved", description: `${o.orderNumber} tracking is updated.` });
    } catch (e) {
      toast({ title: "Save failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  const list = filter === "all" ? orders : filter === "awaiting_payment" ? orders.filter((o) => o.paymentStatus === "awaiting_payment") : orders.filter((o) => o.status === filter);

  return (
    <div data-testid="admin-orders">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="font-heading text-3xl uppercase tracking-tight">Orders <span className="text-neutral-400 text-xl">({orders.length})</span></h1>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {[{ key: "all", label: "All" }, { key: "awaiting_payment", label: "Awaiting Payment" }, ...ALL_STATUSES].map((s) => (
            <button key={s.key} onClick={() => setFilter(s.key)} data-testid={`orders-filter-${s.key}`} className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${filter === s.key ? "bg-neutral-900 border-neutral-900 text-white" : "border-neutral-300 text-neutral-600 hover:border-neutral-900"}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading orders...</p>
      ) : list.length === 0 ? (
        <p className="text-neutral-500 border border-dashed rounded-2xl p-10 text-center">No orders here yet.</p>
      ) : (
        <div className="space-y-3">
          {list.map((o) => (
            <div key={o.id} data-testid={`admin-order-${o.orderNumber}`} className="border border-neutral-200 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                <div className="min-w-[160px]">
                  <p className="font-heading text-lg">{o.orderNumber}</p>
                  <p className="text-xs text-neutral-500">{new Date(o.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-medium text-neutral-900">{o.shipping.firstName} {o.shipping.lastName} <span className="text-neutral-400 font-normal">· {o.shipping.email || "guest"}</span></p>
                  <p className="text-xs text-neutral-500 line-clamp-1">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
                  <p className="text-xs text-neutral-500">{[o.shipping.address, o.shipping.city, o.shipping.state, o.shipping.zip].filter(Boolean).join(", ")}</p>
                  {o.arrivalLabel && <p className="text-xs font-semibold text-emerald-700">Delivery window: {o.arrivalLabel}</p>}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-heading text-xl">${o.total.toFixed(2)}</span>
                  {o.tip > 0 && <span data-testid={`order-tip-${o.orderNumber}`} className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">Tip ${o.tip.toFixed(2)}</span>}
                  <span data-testid={`order-pay-badge-${o.orderNumber}`} className={`text-xs font-bold px-2.5 py-1 rounded-full ${payTone[o.paymentStatus] || payTone.paid}`}>{PAY_LABEL[o.paymentMethod] || "Card"} · {o.paymentStatus === "awaiting_payment" ? "Unpaid" : o.paymentStatus === "refunded" ? "Refunded" : "Paid"}</span>
                  {o.paymentStatus === "awaiting_payment" && (
                    <button onClick={() => markPaid(o)} data-testid={`mark-paid-${o.orderNumber}`} className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-neutral-900 text-white hover:bg-emerald-600 transition-colors"><BadgeDollarSign className="h-3.5 w-3.5" /> Mark Paid</button>
                  )}
                  {o.paymentStatus === "paid" && o.status !== "cancelled" && (
                    <button onClick={() => refund(o)} data-testid={`refund-${o.orderNumber}`} className="text-xs font-bold px-3 py-1.5 rounded-full border border-neutral-300 text-neutral-600 hover:border-red-400 hover:text-red-600 transition-colors">Refund</button>
                  )}
                  {(o.pointsEarned > 0 || o.rewardPoints > 0) && (
                    <span data-testid={`order-points-${o.orderNumber}`} className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">{o.pointsEarned > 0 ? `+${o.pointsEarned - (o.pointsReversed || 0)} pts` : ""}{o.pointsEarned > 0 && o.rewardPoints > 0 ? " · " : ""}{o.rewardPoints > 0 ? `${o.rewardPoints} redeemed` : ""}</span>
                  )}
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tone[o.status]}`}>{ALL_STATUSES.find((s) => s.key === o.status)?.label}</span>
                  <select data-testid={`order-status-select-${o.orderNumber}`} disabled={o.paymentStatus === "awaiting_payment"} value={o.manualStatus || o.status} onChange={(e) => setStatus(o, e.target.value)} className="border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-emerald-600">
                    {ALL_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <Link to={`/order/${o.id}`} target="_blank" className="text-neutral-400 hover:text-emerald-600" aria-label="Open"><ExternalLink className="h-4 w-4" /></Link>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-neutral-100 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-center" data-testid={`delivery-details-${o.orderNumber}`}>
                <label className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 focus-within:border-emerald-600">
                  <Camera className="h-4 w-4 text-neutral-400 shrink-0" />
                  <input type="url" placeholder="Optional delivery photo URL (https://…)" value={draftFor(o).deliveryPhotoUrl} onChange={(e) => updateDraft(o, { deliveryPhotoUrl: e.target.value })} className="w-full py-2 text-xs outline-none" />
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={draftFor(o).driverTextSent} onChange={(e) => updateDraft(o, { driverTextSent: e.target.checked })} className="accent-emerald-600" />
                  <MessageSquareText className="h-4 w-4 text-emerald-600" /> Driver text sent
                </label>
                <button type="button" onClick={() => saveDelivery(o)} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-neutral-900 text-white px-4 py-2 text-xs font-bold hover:bg-emerald-600"><Save className="h-3.5 w-3.5" /> Save tracking details</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminOrders;

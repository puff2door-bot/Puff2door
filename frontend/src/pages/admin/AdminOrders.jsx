import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, BadgeDollarSign, Camera, MessageSquareText, Save, Store, ShieldCheck, PackageCheck, BellRing, Phone } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

const STATUSES = [
  { key: "placed", label: "Order Placed" },
  { key: "confirmed", label: "Preparing" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];
const PICKUP_LABELS = { placed: "Order Placed", confirmed: "Preparing", out_for_delivery: "Ready for Pickup", delivered: "Picked Up", cancelled: "Cancelled" };
const ID_TYPES = ["Driver license", "State ID", "Passport", "Military ID"];
const CANCELLED = { key: "cancelled", label: "Cancelled" };
const ALL_STATUSES = [...STATUSES, CANCELLED];
const SPECIAL_LABELS = { returning_to_store: "Returning to Store", returned: "Returned to Store", id_check_failed: "ID Check Failed" };

const PAY_LABEL = { square: "Card", cash_app: "Cash App", paypal: "PayPal", apple_pay: "Apple Pay", zelle: "Zelle", test_card: "Test card" };
const payTone = { paid: "bg-emerald-100 text-emerald-700", awaiting_payment: "bg-amber-100 text-amber-800", refunded: "bg-neutral-200 text-neutral-600" };

const tone = { placed: "bg-neutral-100 text-neutral-700", confirmed: "bg-blue-100 text-blue-700", out_for_delivery: "bg-amber-100 text-amber-700", delivered: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-700", returning_to_store: "bg-red-100 text-red-700", returned: "bg-neutral-200 text-neutral-700" };

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [deliveryDrafts, setDeliveryDrafts] = useState({});
  const [pickupDrafts, setPickupDrafts] = useState({});
  const { toast } = useToast();

  const [showHidden, setShowHidden] = useState(false);
  useEffect(() => {
    setLoading(true);
    api.get("/admin/orders", { params: showHidden ? { archived: true } : {} }).then(({ data }) => setOrders(data.orders)).finally(() => setLoading(false));
  }, [showHidden]);

  // Hiding keeps the order on record but out of Orders, the dashboard and alerts (e.g. test orders).
  const setHidden = async (o, archived) => {
    if (archived && !window.confirm(`Hide ${o.orderNumber}? It stays on record and you can unhide it from "Hidden orders".`)) return;
    try {
      await api.put(`/admin/orders/${o.id}/archive`, { archived });
      setOrders((prev) => prev.filter((x) => x.id !== o.id));
      toast({ title: archived ? "Order hidden" : "Order restored", description: o.orderNumber });
    } catch (e) {
      toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  const setStatus = async (o, status) => {
    if (status === "cancelled" && !window.confirm(`Cancel ${o.orderNumber}? Stock is returned and any rewards points earned on it are reversed.`)) return;
    try {
      const { data } = await api.put(`/admin/orders/${o.id}/status`, { status });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? data : x)));
      toast({ title: "Order updated", description: `${o.orderNumber} → ${o.fulfillment === "pickup" ? PICKUP_LABELS[status] : ALL_STATUSES.find((s) => s.key === status).label}` });
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
  const resolveIssue = async (o, issue, status) => {
    const resolution = status === "resolved" ? (window.prompt("Resolution note", issue.resolution || "") ?? null) : issue.resolution || "";
    if (resolution === null) return;
    try {
      const { data } = await api.put(`/admin/orders/${o.id}/issues/${issue.id}`, { status, resolution });
      setOrders((prev) => prev.map((x) => x.id === o.id ? data : x));
      toast({ title: "Help request updated" });
    } catch (e) {
      toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  // Store pickup: "Ready" emails the customer; handing over needs a passed 21+ ID check first.
  const pickupDraft = (o) => pickupDrafts[o.id] || { idType: ID_TYPES[0], checked: false };
  const setPickupDraft = (o, patch) => setPickupDrafts((prev) => ({ ...prev, [o.id]: { ...pickupDraft(o), ...patch } }));
  const handOver = async (o) => {
    const d = pickupDraft(o);
    if (!d.checked) return toast({ title: "Check the ID first", description: "Tick the ID box after checking photo, age 21+, name and expiry.", variant: "destructive" });
    try {
      await api.put(`/admin/orders/${o.id}/id-check`, { result: "passed", idType: d.idType, photoIdValid: true, age21Confirmed: true, nameMatchesOrder: true, expirationValid: true, checkedBy: "Store staff" });
      const { data } = await api.put(`/admin/orders/${o.id}/status`, { status: "delivered" });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? data : x)));
      toast({ title: "Picked up", description: `${o.orderNumber} handed over.` });
    } catch (e) {
      toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };
  const failPickupId = async (o) => {
    const reason = window.prompt(`Why couldn't ${o.orderNumber} be handed over? (e.g. no ID, under 21, name doesn't match)`, "");
    if (!reason) return;
    try {
      const { data } = await api.put(`/admin/orders/${o.id}/id-check`, { result: "failed", idType: pickupDraft(o).idType, failureReason: reason, checkedBy: "Store staff" });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? data : x)));
      toast({ title: "ID check failed recorded", description: "Decide on the refund in Delivery Operations." });
    } catch (e) {
      toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    }
  };

  const list = filter === "pickup" ? orders.filter((o) => o.fulfillment === "pickup") : filter === "all" ? orders : filter === "awaiting_payment" ? orders.filter((o) => o.paymentStatus === "awaiting_payment") : orders.filter((o) => o.status === filter);

  return (
    <div data-testid="admin-orders">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="font-heading text-3xl uppercase tracking-tight">{showHidden ? "Hidden orders" : "Orders"} <span className="text-neutral-400 text-xl">({orders.length})</span>
          <button type="button" onClick={() => setShowHidden((v) => !v)} data-testid="orders-toggle-hidden" className="ml-3 align-middle text-xs font-bold normal-case tracking-normal underline text-neutral-500">{showHidden ? "Back to orders" : "Show hidden"}</button>
        </h1>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {[{ key: "all", label: "All" }, { key: "pickup", label: "Pickup" }, { key: "awaiting_payment", label: "Awaiting Payment" }, ...ALL_STATUSES].map((s) => (
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
                  {o.fulfillment === "pickup" && <span data-testid={`pickup-badge-${o.orderNumber}`} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800"><Store className="h-3 w-3" /> PICKUP</span>}
                  <p className="text-xs text-neutral-500">{new Date(o.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-medium text-neutral-900">{o.shipping.firstName} {o.shipping.lastName} <span className="text-neutral-400 font-normal">· {o.shipping.email || "guest"}</span></p>
                  <p className="text-xs font-semibold text-neutral-700" data-testid={`order-phone-${o.orderNumber}`}>
                    <Phone className="inline h-3 w-3 mr-1" />
                    {o.shipping.phone ? <a className="hover:text-emerald-700 hover:underline" href={`tel:${o.shipping.phone}`}>{o.shipping.phone}</a> : <span className="text-red-600">Phone number missing</span>}
                  </p>
                  <p className="text-xs text-neutral-500 line-clamp-1">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
                  {o.fulfillment === "pickup" ? (
                    <p className="text-xs font-semibold text-purple-800">Store pickup{o.pickup?.holdUntil && !["delivered", "cancelled"].includes(o.status) ? ` · held until ${new Date(o.pickup.holdUntil).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}{o.pickup?.refundNeeded && o.paymentStatus === "paid" ? " · NOT COLLECTED — refund needed" : ""}</p>
                  ) : <>
                  <p className="text-xs text-neutral-500">{[o.shipping.address, o.shipping.city, o.shipping.state, o.shipping.zip].filter(Boolean).join(", ")}</p>
                  {o.arrivalLabel && <p className="text-xs font-semibold text-emerald-700">Delivery window: {o.arrivalLabel}</p>}
                  </>}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-heading text-xl">${o.total.toFixed(2)}</span>
                  {o.tip > 0 && <span data-testid={`order-tip-${o.orderNumber}`} className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">Tip ${o.tip.toFixed(2)}</span>}
                  {o.replacementCreditDue > 0 && <span className="text-xs font-bold text-violet-800 bg-violet-100 px-2.5 py-1 rounded-full">Replacement credit due ${o.replacementCreditDue.toFixed(2)}</span>}
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
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tone[o.status] || tone.placed}`}>{(o.fulfillment === "pickup" && PICKUP_LABELS[o.status]) || ALL_STATUSES.find((s) => s.key === o.status)?.label || SPECIAL_LABELS[o.status] || o.status}</span>
                  {SPECIAL_LABELS[o.status] ? <Link to="/admin/operations" className="text-xs font-bold text-red-700 underline">Manage return</Link> : <select data-testid={`order-status-select-${o.orderNumber}`} disabled={o.paymentStatus === "awaiting_payment"} value={o.manualStatus || o.status} onChange={(e) => setStatus(o, e.target.value)} className="border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-emerald-600">
                    {ALL_STATUSES.map((s) => <option key={s.key} value={s.key}>{o.fulfillment === "pickup" ? PICKUP_LABELS[s.key] : s.label}</option>)}
                  </select>}
                  {(showHidden || ["cancelled", "delivered", "returned"].includes(o.status)) && (
                    <button type="button" onClick={() => setHidden(o, !showHidden)} data-testid={`order-hide-${o.orderNumber}`} className="text-xs font-bold px-3 py-1.5 rounded-full border border-neutral-300 text-neutral-600 hover:border-neutral-900">{showHidden ? "Unhide" : "Hide"}</button>
                  )}
                  <Link to={`/order/${o.id}`} target="_blank" className="text-neutral-400 hover:text-emerald-600" aria-label="Open"><ExternalLink className="h-4 w-4" /></Link>
                </div>
              </div>
              {o.fulfillment === "pickup" ? (
                !["delivered", "cancelled", "id_check_failed", "returned"].includes(o.status) && o.paymentStatus !== "awaiting_payment" && (
                <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-wrap items-center gap-3" data-testid={`pickup-panel-${o.orderNumber}`}>
                  {o.status !== "out_for_delivery" ? (
                    <button type="button" onClick={() => setStatus(o, "out_for_delivery")} data-testid={`pickup-ready-${o.orderNumber}`} className="inline-flex items-center gap-1.5 rounded-full bg-purple-700 text-white px-4 py-2 text-xs font-bold hover:bg-purple-800"><BellRing className="h-3.5 w-3.5" /> Ready for pickup (emails customer)</button>
                  ) : (
                    <>
                      <select value={pickupDraft(o).idType} onChange={(e) => setPickupDraft(o, { idType: e.target.value })} className="border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold">{ID_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                      <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
                        <input type="checkbox" checked={pickupDraft(o).checked} onChange={(e) => setPickupDraft(o, { checked: e.target.checked })} className="accent-emerald-600 h-4 w-4" data-testid={`pickup-id-ok-${o.orderNumber}`} />
                        <ShieldCheck className="h-4 w-4 text-emerald-600" /> ID checked: photo matches, 21+, name matches order, not expired
                      </label>
                      <button type="button" onClick={() => handOver(o)} data-testid={`pickup-done-${o.orderNumber}`} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 text-white px-4 py-2 text-xs font-bold hover:bg-emerald-700"><PackageCheck className="h-3.5 w-3.5" /> Picked up</button>
                      <button type="button" onClick={() => failPickupId(o)} className="text-xs font-bold text-red-700 underline">ID failed</button>
                    </>
                  )}
                </div>)
              ) : (
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
              </div>)}
              {(o.issues || []).length > 0 && <div className="mt-4 border-t pt-4 space-y-2">{o.issues.map((i)=><div key={i.id} className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex flex-wrap items-center gap-2 text-sm"><b className="capitalize">{i.kind.replaceAll("_"," ")}</b><span className="text-neutral-600 flex-1">{i.message || "No details provided"}</span><select value={i.status} onChange={(e)=>resolveIssue(o,i,e.target.value)} className="border rounded-lg px-2 py-1 text-xs"><option value="open">Open</option><option value="working">Working</option><option value="resolved">Resolved</option></select></div>)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminOrders;

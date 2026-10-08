import React from "react";
import { CheckCircle2, Circle, Truck, Package, Home, Clock, PartyPopper, XCircle, MessageSquareText, Camera } from "lucide-react";

const ICONS = { placed: Package, confirmed: CheckCircle2, out_for_delivery: Truck, delivered: Home, cancelled: XCircle };

const OrderTracking = ({ order }) => {
  const timeline = order.timeline || [];
  const activeIndex = Math.max(0, timeline.filter((t) => t.done).length - 1);
  const cancelled = order.status === "cancelled";
  const complete = order.status === "delivered";
  const activeTone = cancelled ? "bg-red-500" : "bg-emerald-500";

  return (
    <div className="border border-neutral-200 rounded-xl p-6 sm:p-8" data-testid="order-tracker">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-heading text-xl uppercase tracking-wide">Delivery Tracker</h2>
          {order.arrivalLabel && !cancelled && <p className="text-sm font-semibold text-emerald-700 mt-1" data-testid="order-arrival-window">Arriving {order.arrivalLabel}</p>}
        </div>
        {cancelled ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 px-3 py-1.5 rounded-full"><XCircle className="h-3.5 w-3.5" /> Cancelled</span>
        ) : complete ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full"><PartyPopper className="h-3.5 w-3.5" /> Delivered</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full"><Clock className="h-3.5 w-3.5" /> Live</span>
        )}
      </div>

      <div className="hidden sm:flex items-start justify-between relative">
        <div className="absolute top-6 left-0 right-0 h-1 bg-neutral-200 mx-12">
          <div className={`h-full transition-all duration-700 ${activeTone}`} style={{ width: `${timeline.length > 1 ? (activeIndex / (timeline.length - 1)) * 100 : 100}%` }} />
        </div>
        {timeline.map((t) => {
          const Icon = ICONS[t.key] || Circle;
          return (
            <div key={t.key} className="relative z-10 flex flex-col items-center text-center" style={{ width: `${100 / Math.max(timeline.length, 1)}%` }}>
              <span className={`grid place-items-center h-12 w-12 rounded-full border-4 border-white transition-colors ${t.done ? `${activeTone} text-white` : "bg-neutral-200 text-neutral-400"}`}><Icon className="h-5 w-5" /></span>
              <p className={`mt-3 text-sm font-semibold ${t.done ? "text-neutral-900" : "text-neutral-400"}`}>{t.label}</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">{t.at ? new Date(t.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Pending"}</p>
            </div>
          );
        })}
      </div>

      <div className="sm:hidden space-y-1">
        {timeline.map((t, i) => {
          const Icon = ICONS[t.key] || Circle;
          return (
            <div key={t.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={`grid place-items-center h-10 w-10 rounded-full ${t.done ? `${activeTone} text-white` : "bg-neutral-200 text-neutral-400"}`}><Icon className="h-4 w-4" /></span>
                {i < timeline.length - 1 && <span className={`w-0.5 flex-1 min-h-[24px] ${t.done ? activeTone : "bg-neutral-200"}`} />}
              </div>
              <div className="pb-4">
                <p className={`text-sm font-semibold ${t.done ? "text-neutral-900" : "text-neutral-400"}`}>{t.label}</p>
                <p className="text-[11px] text-neutral-400">{t.at ? new Date(t.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Pending"}</p>
              </div>
            </div>
          );
        })}
      </div>

      {["out_for_delivery", "delivered"].includes(order.status) && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="driver-on-way">
          <p className="font-bold flex items-center gap-2"><Truck className="h-4 w-4" /> {order.status === "delivered" ? "Delivery completed" : "Your driver is on the way"}</p>
          {order.driverTextSent && <p className="mt-1 flex items-center gap-2 text-xs"><MessageSquareText className="h-3.5 w-3.5" /> A text update was sent to the phone number on this order.</p>}
        </div>
      )}

      {order.status === "delivered" && order.deliveryPhotoUrl && (
        <div className="mt-6" data-testid="delivery-photo">
          <p className="font-bold text-sm flex items-center gap-2 mb-2"><Camera className="h-4 w-4 text-emerald-600" /> Photo at your door</p>
          <img src={order.deliveryPhotoUrl} alt="Delivery at the door" className="w-full max-h-96 object-cover rounded-xl border border-neutral-200" />
        </div>
      )}
    </div>
  );
};

export default OrderTracking;

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Package, ShieldCheck } from "lucide-react";
import api from "../api";
import { useToast } from "../hooks/use-toast";
import OrderTracking from "../components/OrderTracking";

const TrackPage = () => {
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);
  const { toast } = useToast();

  const submit = async (e) => {
    e.preventDefault();
    if (!num.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.get(`/orders/track/${num.trim().toUpperCase()}`);
      setOrder(data);
    } catch {
      toast({ title: "Not found", description: "No order matches that number.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-16">
      <div className="max-w-lg mx-auto text-center mb-10">
        <span className="inline-grid place-items-center h-16 w-16 rounded-full bg-emerald-100 text-emerald-700 mb-5"><Package className="h-8 w-8" /></span>
        <h1 className="font-heading text-3xl sm:text-4xl font-700 uppercase tracking-tight mb-2">Track Your Order</h1>
        <p className="text-neutral-500 mb-8">Enter your order number (e.g. P2D-12345678) to see live delivery status.</p>
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex items-center border border-neutral-300 rounded-full px-4 focus-within:border-emerald-600 transition-colors">
            <Search className="h-5 w-5 text-neutral-400" />
            <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="P2D-XXXXXXXX" className="flex-1 px-3 py-3 text-sm outline-none uppercase" />
          </div>
          <button disabled={busy} className="px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Searching..." : "Track"}</button>
        </form>
      </div>
      {order && (
        <div className="max-w-4xl mx-auto space-y-4" data-testid="track-result">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div><p className="text-xs text-neutral-500">Order</p><p className="font-heading text-xl">{order.orderNumber}</p></div>
            <Link to={`/order/${order.id}`} className="text-sm font-bold text-emerald-700 hover:underline">View full order details</Link>
          </div>
          <OrderTracking order={order} />
          <p className="rounded-xl bg-neutral-50 border border-neutral-200 px-4 py-3 text-xs text-neutral-600 flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" /> Valid government-issued photo ID proving age 21+ is checked at the door. Orders cannot be left with anyone under 21.</p>
        </div>
      )}
    </div>
  );
};

export default TrackPage;

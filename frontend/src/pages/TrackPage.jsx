import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Package } from "lucide-react";
import api from "../api";
import { useToast } from "../hooks/use-toast";

const TrackPage = () => {
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const submit = async (e) => {
    e.preventDefault();
    if (!num.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.get(`/orders/track/${num.trim().toUpperCase()}`);
      navigate(`/order/${data.id}`);
    } catch {
      toast({ title: "Not found", description: "No order matches that number.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-16">
      <div className="max-w-lg mx-auto text-center">
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
    </div>
  );
};

export default TrackPage;

import React, { useEffect, useRef, useState } from "react";
import { Truck, Clock } from "lucide-react";
import api from "../api";

const fmt = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
};

// Countdown is anchored to the server clock (Orlando time); the device clock only drives the ticking.
export const useDeliveryWindow = () => {
  const [win, setWin] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const anchor = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get("/delivery/window");
      anchor.current = { secs: data.secondsRemaining, at: Date.now() };
      setWin(data);
      setRemaining(data.secondsRemaining);
    } catch { setWin(null); }
  };

  useEffect(() => {
    load();
    const refresh = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (!win?.sameDayOpen) return undefined;
    const t = setInterval(() => {
      const left = Math.max(0, anchor.current.secs - Math.floor((Date.now() - anchor.current.at) / 1000));
      setRemaining(left);
      if (left === 0) load();
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win]);

  const text = !win ? "" : win.sameDayOpen ? `Order within ${fmt(remaining)} for today's local delivery` : win.message;
  return { window: win, remaining, text, sameDayOpen: Boolean(win?.sameDayOpen), enabled: Boolean(win?.enabled) };
};

const DeliveryCountdown = ({ variant = "home" }) => {
  const { window: win, text, sameDayOpen, enabled } = useDeliveryWindow();
  if (!win || !enabled || !text) return null;

  if (variant === "inline") {
    return (
      <p data-testid="checkout-delivery-countdown" className={`mt-2 flex items-start gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-semibold ${sameDayOpen ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 border border-neutral-200"}`}>
        {sameDayOpen ? <Truck className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" /> : <Clock className="h-4 w-4 mt-0.5 shrink-0 text-neutral-500" />}
        <span>{text}{sameDayOpen ? <span className="text-emerald-300 font-normal"> · cutoff {win.cutoffLabel} ET</span> : win.nextDeliveryLabel && win.todayOpen ? <span className="font-normal"> Next delivery: {win.nextDeliveryLabel}.</span> : null}<span className="block font-normal mt-0.5">Deliveries run {win.deliveryStartLabel}–{win.deliveryEndLabel} ET. No deliveries before or after those hours.</span></span>
      </p>
    );
  }

  return (
    <div data-testid="delivery-countdown" className="bg-neutral-950 text-white">
      <div className="max-w-[1280px] mx-auto px-4 py-2 text-center">
        <p className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold tracking-wide">
          {sameDayOpen ? <Truck className="h-4 w-4 shrink-0 text-emerald-400" /> : <Clock className="h-4 w-4 shrink-0 text-neutral-400" />}
          <span data-testid="delivery-countdown-text">{sameDayOpen ? (<>Order within <span className="text-emerald-400 tabular-nums">{text.replace("Order within ", "").replace(" for today's local delivery", "")}</span> for today's local delivery</>) : text}</span>
          {!sameDayOpen && win.todayOpen && win.nextDeliveryLabel && <span className="hidden sm:inline text-neutral-400 font-normal">· Next: {win.nextDeliveryLabel}</span>}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-400" data-testid="delivery-hours">Same-day cutoff is {win.cutoffLabel} ET. No deliveries after {win.deliveryEndLabel} or before {win.deliveryStartLabel}.</p>
      </div>
    </div>
  );
};

export default DeliveryCountdown;

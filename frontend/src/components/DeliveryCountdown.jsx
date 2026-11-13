import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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

const shortClock = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
};

const fillTokens = (template, values) => String(template || "").replace(/\{(countdown|cutoff|start|end|next)\}/g, (_, key) => values[key] || "");

const renderOpenTemplate = (template, values, highlight = false) => {
  const source = String(template || "");
  if (!source.includes("{countdown}")) return fillTokens(source, values);
  const [before, ...after] = source.split("{countdown}");
  return <>{fillTokens(before, values)}<span className={highlight ? "text-emerald-400 tabular-nums" : "tabular-nums"}>{values.countdown}</span>{fillTokens(after.join("{countdown}"), values)}</>;
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

  const copy = win?.countdownCopy || {};
  const copyValue = (key, fallback) => Object.prototype.hasOwnProperty.call(copy, key) ? copy[key] : fallback;
  const values = win ? { countdown: fmt(remaining), cutoff: win.cutoffLabel, start: win.deliveryStartLabel, end: win.deliveryEndLabel, next: win.nextDeliveryLabel || "" } : {};
  const template = !win ? "" : win.sameDayOpen ? copyValue("countdownOpenText", "Order within {countdown} for today's local delivery")
    : !win.enabled ? copyValue("countdownPausedText", "")
      : !win.nextDeliveryDate ? copyValue("countdownPausedText", win.message)
        : win.todayOpen ? copyValue("countdownClosedText", win.message) : copyValue("countdownClosedDayText", win.message);
  const text = fillTokens(template, values);
  return { window: win, remaining, text, template, values, sameDayOpen: Boolean(win?.sameDayOpen), enabled: Boolean(win?.enabled), copy };
};

const DeliveryCountdown = ({ variant = "home" }) => {
  const { window: win, text, template, values, sameDayOpen, enabled, copy } = useDeliveryWindow();
  if (!win || !enabled || copy.countdownVisible === false) return null;
  const showHeadline = copy.countdownHeadlineVisible !== false && Boolean(text);
  const hoursTemplate = Object.prototype.hasOwnProperty.call(copy, "countdownHoursText") ? copy.countdownHoursText : "Same-day cutoff is {cutoff} ET. No deliveries after {end} or before {start}.";
  const hoursText = fillTokens(hoursTemplate, values);
  const showHours = copy.countdownHoursVisible !== false && Boolean(hoursText);
  const extraLines = (copy.countdownExtraLines || []).filter((line) => line.visible !== false && line.text).map((line) => fillTokens(line.text, values));
  if (!showHeadline && !showHours && !extraLines.length) return null;

  if (variant === "inline") {
    return (
      <div data-testid="checkout-delivery-countdown" className={`mt-2 flex items-start gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm ${sameDayOpen ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 border border-neutral-200"}`}>
        {sameDayOpen ? <Truck className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" /> : <Clock className="h-4 w-4 mt-0.5 shrink-0 text-neutral-500" />}
        <span>{showHeadline && <span className="block font-semibold">{sameDayOpen ? renderOpenTemplate(template, values) : text}</span>}{showHours && <span className="block font-normal mt-0.5">{hoursText}</span>}{extraLines.map((line, i) => <span className="block font-normal mt-0.5" key={`${line}-${i}`}>{line}</span>)}</span>
      </div>
    );
  }

  if (copy.countdownStyle !== "classic") {
    const first = (win.availableWindows || [])[0];
    const nextTime = first ? shortClock(first.start) : win.deliveryStartLabel?.replace(":00", "");
    const nextDay = first ? (first.label || "").replace(/\s\d{1,2}:\d{2}.*$/, "") : win.nextDeliveryLabel;
    const chip = sameDayOpen ? `Same-day open · ${values.countdown} left` : win.todayOpen ? "Closed for today" : "No delivery today";
    const detail = sameDayOpen ? `Order by ${values.cutoff} for delivery today` : nextDay ? `Next delivery: ${nextDay.toLowerCase() === "tomorrow" ? "tomorrow" : nextDay}${nextTime ? `, ${nextTime}` : ""}` : "";
    return (
      <div data-testid="delivery-countdown" className="bg-neutral-950 text-white">
        <div className="max-w-[1280px] mx-auto px-4 py-2 flex items-center justify-between gap-3 flex-wrap sm:justify-center sm:gap-5">
          <div className="flex items-center gap-2.5 flex-wrap text-xs sm:text-sm">
            <span data-testid="delivery-countdown-chip" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tabular-nums" style={sameDayOpen ? { background: "#d1fae5", color: "#065f46" } : { background: "#fef3c7", color: "#78350f" }}>
              {sameDayOpen ? <Truck className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" aria-hidden="true" />}{chip}
            </span>
            {detail && <span data-testid="delivery-countdown-text" className="text-neutral-200">{detail}</span>}
          </div>
          <Link to="/shop" data-testid="delivery-countdown-shop" className="shrink-0 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors">Shop now</Link>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="delivery-countdown" className="bg-neutral-950 text-white">
      <div className="max-w-[1280px] mx-auto px-4 py-2 text-center">
        {showHeadline && <p className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold tracking-wide">
          {sameDayOpen ? <Truck className="h-4 w-4 shrink-0 text-emerald-400" /> : <Clock className="h-4 w-4 shrink-0 text-neutral-400" />}
          <span data-testid="delivery-countdown-text">{sameDayOpen ? renderOpenTemplate(template, values, true) : text}</span>
          {!sameDayOpen && win.todayOpen && win.nextDeliveryLabel && <span className="hidden sm:inline text-neutral-400 font-normal">· Next: {win.nextDeliveryLabel}</span>}
        </p>}
        {showHours && <p className="mt-0.5 text-[11px] text-neutral-400" data-testid="delivery-hours">{hoursText}</p>}
        {extraLines.map((line, i) => <p className="mt-0.5 text-[11px] text-neutral-400" data-testid={`delivery-extra-line-${i}`} key={`${line}-${i}`}>{line}</p>)}
      </div>
    </div>
  );
};

export default DeliveryCountdown;

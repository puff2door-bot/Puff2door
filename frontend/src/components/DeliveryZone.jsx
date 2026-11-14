import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, CheckCircle2, XCircle, Search } from "lucide-react";
import api from "../api";
import { deliveryBannerText } from "./deliveryAreaText";
import { SalMascot, useSal } from "./SalMascot";

export const DeliveryBanner = () => {
  const [area, setArea] = useState(null);
  useEffect(() => {
    let active = true;
    api.get("/delivery/area")
      .then(({ data }) => { if (active) setArea(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const message = useMemo(() => deliveryBannerText(area), [area]);
  const sal = useSal();
  return (
    <div data-testid="delivery-banner" className="bg-emerald-700 text-white">
      {/* Fixed height (2 lines on phones, 1 on larger screens, room for Sal's face) so the page doesn't jump when the delivery area loads. */}
      <p className="max-w-[1280px] mx-auto px-4 py-[3px] h-[48px] sm:h-[40px] flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold tracking-wide text-center overflow-hidden">
        {sal.enabled
          ? <SalMascot pose="face" size={34} label="Sal from Puff2door" interactive />
          : <MapPin className="h-3.5 w-3.5 shrink-0" />}
        <span className="line-clamp-2 sm:line-clamp-1">{message}</span>
        <Link to="/delivery-area" data-testid="delivery-banner-link" className="shrink-0 whitespace-nowrap underline underline-offset-2 hover:text-emerald-100 font-medium"><span className="sm:hidden">See area</span><span className="hidden sm:inline">See delivery area</span></Link>
      </p>
    </div>
  );
};

export const DeliveryChecker = () => {
  const [zip, setZip] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const sal = useSal();

  const check = async (e) => {
    e.preventDefault();
    if (zip.length !== 5) return;
    setBusy(true);
    try {
      const { data } = await api.get("/delivery/check", { params: { zip } });
      setResult({ ...data, at: Date.now() });
    } catch {
      setResult({ eligible: false, message: "Couldn't check that ZIP right now. Please try again." });
    } finally { setBusy(false); }
  };

  return (
    <section data-testid="delivery-checker" className="bg-emerald-50 border-b border-emerald-100">
      <div className="max-w-[1280px] mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <p className="text-sm font-bold text-emerald-900 shrink-0">Do we deliver to you?</p>
        <form onSubmit={check} className="flex items-center gap-2">
          <input
            data-testid="delivery-zip-input"
            inputMode="numeric"
            placeholder="Enter ZIP code"
            value={zip}
            onChange={(e) => { setZip(e.target.value.replace(/\D/g, "").slice(0, 5)); setResult(null); }}
            className="w-40 border border-emerald-200 bg-white rounded-full px-4 py-2 text-sm outline-none focus:border-emerald-600 transition-colors"
          />
          <button data-testid="delivery-check-btn" disabled={busy || zip.length !== 5} className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-50">
            <Search className="h-4 w-4" /> {busy ? "Checking..." : "Check"}
          </button>
        </form>
        {result && (
          <p data-testid="delivery-check-result" className={`flex items-center gap-1.5 text-sm font-semibold ${result.eligible ? "text-emerald-700" : "text-red-600"}`}>
            {sal.enabled && result.at
              ? <span key={result.at} className={`inline-flex shrink-0 ${sal.animated ? (result.eligible ? "sal-dance" : "sal-shrug") : ""}`}><SalMascot pose="face" size={32} /></span>
              : result.eligible ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            <span>{sal.enabled && result.at ? <b>{result.eligible ? "I got you! " : "Too far for my wheels. "}</b> : null}{result.message}</span>
          </p>
        )}
      </div>
    </section>
  );
};

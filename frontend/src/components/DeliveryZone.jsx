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
      {/* Fixed height (2 lines on phones, 1 on larger screens) so the page doesn't jump when the delivery area loads. */}
      <p className="max-w-[1280px] mx-auto px-4 py-1.5 h-[44px] sm:h-[32px] flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold tracking-wide text-center overflow-hidden">
        {sal.enabled
          ? <SalMascot pose="avatar" size={22} label="Sal from Puff2door" />
          : <MapPin className="h-3.5 w-3.5 shrink-0" />}
        <span className="line-clamp-2 sm:line-clamp-1">{message}</span>
        <Link to="/delivery-area" data-testid="delivery-banner-link" className="underline underline-offset-2 hover:text-emerald-100 font-medium">See delivery area</Link>
      </p>
    </div>
  );
};

export const DeliveryChecker = () => {
  const [zip, setZip] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async (e) => {
    e.preventDefault();
    if (zip.length !== 5) return;
    setBusy(true);
    try {
      const { data } = await api.get("/delivery/check", { params: { zip } });
      setResult(data);
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
            {result.eligible ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
};

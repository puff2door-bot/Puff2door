import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import api from "../api";

const SHOW_AFTER_MS = 1400;
const RETRY_AFTER_MS = 5000;

const ServiceWakeBanner = () => {
  const [status, setStatus] = useState("checking");
  const [visible, setVisible] = useState(false);
  const retryRef = useRef(null);
  const activeRef = useRef(true);

  const checkService = useCallback(async () => {
    if (!activeRef.current) return;
    setStatus((current) => current === "offline" ? "retrying" : current);
    try {
      await api.get("/", { timeout: 70000 });
      if (!activeRef.current) return;
      setStatus("online");
      setVisible(false);
      window.dispatchEvent(new Event("p2d-backend-ready"));
    } catch {
      if (!activeRef.current) return;
      setStatus("offline");
      setVisible(true);
      retryRef.current = window.setTimeout(checkService, RETRY_AFTER_MS);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const showTimer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    checkService();
    return () => {
      activeRef.current = false;
      window.clearTimeout(showTimer);
      window.clearTimeout(retryRef.current);
    };
  }, [checkService]);

  if (!visible || status === "online") return null;

  const unavailable = status === "offline";
  return (
    <aside
      className="border-b border-amber-300 bg-amber-50 text-amber-950"
      aria-live="polite"
      data-testid="service-wake-banner"
    >
      <div className="mx-auto flex max-w-[1264px] items-center gap-3 px-4 py-3 sm:px-6">
        {unavailable
          ? <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          : <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {unavailable ? "Secure services are taking longer than expected" : "HD Smoke Shop’s secure services are waking up"}
          </p>
          <p className="text-xs sm:text-sm">
            The website is ready to browse. Account, checkout, inventory, and tracking should be ready shortly. Your cart is safe.
          </p>
        </div>
        {unavailable && (
          <button
            type="button"
            onClick={() => {
              window.clearTimeout(retryRef.current);
              setStatus("retrying");
              checkService();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-800 px-3 py-1.5 text-xs font-bold hover:bg-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        )}
      </div>
    </aside>
  );
};

export default ServiceWakeBanner;

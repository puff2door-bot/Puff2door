import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadScript } from "../../lib/loadScript";

// Square Web Payments SDK: card + Cash App Pay. Exposes card tokenizer via onReady(tokenizeFn).
const SquarePayment = ({ config, mode, total, onReady, onCashAppToken, onError }) => {
  const [state, setState] = useState("loading");
  const cardRef = useRef(null);
  const cashRef = useRef(null);
  const totalRef = useRef(total);
  totalRef.current = total;

  useEffect(() => {
    let cancelled = false;
    const src = config.env === "production" ? "https://web.squarecdn.com/v1/square.js" : "https://sandbox.web.squarecdn.com/v1/square.js";
    (async () => {
      try {
        await loadScript(src);
        if (cancelled || !window.Square) throw new Error("Square SDK unavailable");
        const payments = window.Square.payments(config.applicationId, config.locationId);
        if (mode === "square") {
          const card = await payments.card();
          await card.attach("#square-card-container");
          cardRef.current = card;
          onReady(async () => {
            const result = await card.tokenize();
            if (result.status !== "OK") throw new Error(result.errors?.[0]?.message || "Card details are invalid");
            return result.token;
          });
        } else {
          const request = payments.paymentRequest({ countryCode: "US", currencyCode: "USD", total: { amount: totalRef.current.toFixed(2), label: "Puff2Door order" } });
          const cash = await payments.cashAppPay(request, { redirectURL: window.location.href, referenceId: `p2d-${Date.now()}` });
          await cash.attach("#cash-app-pay-container", { shape: "semiround", width: "full" });
          cash.addEventListener("ontokenization", ({ detail }) => {
            if (detail.error) return onError("Cash App Pay could not start");
            const r = detail.tokenResult;
            if (r.status === "OK") onCashAppToken(r.token);
            else if (r.status !== "Cancel") onError("Cash App Pay was not completed");
          });
          cashRef.current = cash;
        }
        if (!cancelled) setState("ready");
      } catch (e) {
        if (!cancelled) { setState("error"); onError(e.message); }
      }
    })();
    return () => {
      cancelled = true;
      cardRef.current?.destroy?.();
      cashRef.current?.destroy?.();
      cardRef.current = null;
      cashRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.applicationId, config.locationId, config.env, mode]);

  return (
    <div data-testid={`square-${mode}-panel`}>
      {state === "loading" && <p className="flex items-center gap-2 text-sm text-neutral-500 mb-3"><Loader2 className="h-4 w-4 animate-spin" /> Loading secure payment form...</p>}
      {state === "error" && <p className="text-sm text-red-500 mb-3">Payment form could not be loaded. Please refresh or choose another method.</p>}
      {mode === "square" ? <div id="square-card-container" className="min-h-[90px]" /> : <div id="cash-app-pay-container" className="min-h-[48px]" />}
      {mode === "cash_app" && state === "ready" && <p className="text-xs text-neutral-500 mt-2">Tap the Cash App Pay button above to approve the payment — your order is placed automatically once approved.</p>}
    </div>
  );
};

export default SquarePayment;

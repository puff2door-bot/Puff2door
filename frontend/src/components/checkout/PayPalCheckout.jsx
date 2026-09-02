import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadScript } from "../../lib/loadScript";

// PayPal JS SDK buttons; order is created & captured server-side.
const PayPalCheckout = ({ config, createOrder, onApprove, onError, validate }) => {
  const [state, setState] = useState("loading");
  const containerRef = useRef(null);
  const handlers = useRef({ createOrder, onApprove, onError, validate });
  handlers.current = { createOrder, onApprove, onError, validate };

  useEffect(() => {
    let buttons;
    let cancelled = false;
    (async () => {
      try {
        await loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=USD&intent=capture&components=buttons`, { "data-namespace": "paypal_sdk" });
        const paypal = window.paypal_sdk;
        if (cancelled || !paypal) throw new Error("PayPal SDK unavailable");
        buttons = paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "pill", label: "paypal", height: 48 },
          onClick: (data, actions) => (handlers.current.validate() ? actions.resolve() : actions.reject()),
          createOrder: () => handlers.current.createOrder(),
          onApprove: (data) => handlers.current.onApprove(data.orderID),
          onError: (err) => handlers.current.onError(err?.message || "PayPal error"),
        });
        if (containerRef.current) {
          await buttons.render(containerRef.current);
          if (!cancelled) setState("ready");
        }
      } catch (e) {
        if (!cancelled) { setState("error"); handlers.current.onError(e.message); }
      }
    })();
    return () => { cancelled = true; buttons?.close?.(); };
  }, [config.clientId]);

  return (
    <div data-testid="paypal-panel">
      {state === "loading" && <p className="flex items-center gap-2 text-sm text-neutral-500 mb-3"><Loader2 className="h-4 w-4 animate-spin" /> Loading PayPal...</p>}
      {state === "error" && <p className="text-sm text-red-500 mb-3">PayPal could not be loaded. Please choose another method.</p>}
      <div ref={containerRef} className="max-w-md" />
      {state === "ready" && <p className="text-xs text-neutral-500 mt-2">You'll approve the payment in PayPal; your order is placed once approved.</p>}
    </div>
  );
};

export default PayPalCheckout;

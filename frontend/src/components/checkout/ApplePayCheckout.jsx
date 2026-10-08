
import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadScript } from "../../lib/loadScript";

const ApplePayCheckout = ({ config, total, createOrder, onApprove, onError, onCancel, validate }) => {
  const [state, setState] = useState("loading");
  const applePayRef = useRef(null);
  const applePayConfigRef = useRef(null);
  const handlers = useRef({ createOrder, onApprove, onError, onCancel, validate });
  handlers.current = { createOrder, onApprove, onError, onCancel, validate };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.ApplePaySession?.canMakePayments?.()) throw new Error("Apple Pay is not available on this device.");
        const sdkHost = config.env === "sandbox" ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
        await Promise.all([
          loadScript(`${sdkHost}/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=USD&buyer-country=US&intent=capture&components=applepay`, { "data-namespace": "paypal_applepay" }),
          loadScript("https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"),
        ]);
        if (cancelled || !window.paypal_applepay?.Applepay) throw new Error("Apple Pay could not be loaded.");
        const applepay = window.paypal_applepay.Applepay();
        const applePayConfig = await applepay.config();
        if (!applePayConfig?.isEligible) throw new Error("Apple Pay is not enabled for this store yet.");
        applePayRef.current = applepay;
        applePayConfigRef.current = applePayConfig;
        if (!cancelled) setState("ready");
      } catch (err) {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [config.clientId, config.env]);

  const begin = () => {
    if (!handlers.current.validate() || state !== "ready") return;
    const applepay = applePayRef.current;
    const applePayConfig = applePayConfigRef.current;
    try {
      const paymentRequest = {
        countryCode: applePayConfig.countryCode || "US",
        currencyCode: "USD",
        merchantCapabilities: applePayConfig.merchantCapabilities,
        supportedNetworks: applePayConfig.supportedNetworks,
        total: { label: "Puff2Door", type: "final", amount: Number(total).toFixed(2) },
      };
      const session = new window.ApplePaySession(4, paymentRequest);
      session.onvalidatemerchant = async (event) => {
        try {
          const result = await applepay.validateMerchant({ validationUrl: event.validationURL, displayName: "Puff2Door" });
          session.completeMerchantValidation(result.merchantSession);
        } catch (err) {
          session.abort();
          handlers.current.onError(err?.message || "Apple Pay merchant validation failed.");
        }
      };
      session.onpaymentauthorized = async (event) => {
        try {
          const orderId = await handlers.current.createOrder();
          await applepay.confirmOrder({
            orderId,
            token: event.payment.token,
            billingContact: event.payment.billingContact,
          });
          await handlers.current.onApprove(orderId);
          session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
        } catch (err) {
          session.completePayment(window.ApplePaySession.STATUS_FAILURE);
          handlers.current.onError(err?.message || "Apple Pay could not complete the payment.");
        }
      };
      session.oncancel = () => handlers.current.onCancel?.();
      session.begin();
    } catch (err) {
      handlers.current.onError(err?.message || "Apple Pay could not be started.");
    }
  };

  return (
    <div data-testid="apple-pay-panel" className="max-w-md">
      {state === "loading" && <p className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking Apple Pay...</p>}
      {state === "unavailable" && <p className="text-sm text-neutral-500">Apple Pay is not available for this browser, device, or merchant account. Choose PayPal or another method.</p>}
      {state === "ready" && (
        <div className="relative" data-testid="apple-pay-button">
          <apple-pay-button
            buttonstyle="black"
            type="buy"
            locale="en-US"
            aria-hidden="true"
            style={{ display: "block", width: "100%", height: "48px", "--apple-pay-button-border-radius": "10px", pointerEvents: "none" }}
          />
          {/* Safari's Apple Pay custom element does not reliably forward clicks to React. */}
          <button
            type="button"
            onClick={begin}
            aria-label={`Pay $${Number(total).toFixed(2)} with Apple Pay`}
            className="absolute inset-0 h-full w-full cursor-pointer rounded-[10px] border-0 bg-transparent"
          />
        </div>
      )}
    </div>
  );
};

export default ApplePayCheckout;

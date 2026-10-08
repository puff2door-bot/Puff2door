import React from "react";
import { CreditCard, Wallet, Landmark, Smartphone, TestTube2, Check } from "lucide-react";

export const METHOD_META = {
  square: { label: "Credit / Debit Card", hint: "Visa, Mastercard, Amex, Discover", icon: CreditCard },
  cash_app: { label: "Cash App Pay", hint: "Approve in the Cash App", icon: Smartphone },
  paypal: { label: "PayPal / Card", hint: "PayPal balance, Pay Later, or debit & credit card", icon: Wallet },
  apple_pay: { label: "Apple Pay", hint: "Fast, secure checkout with Touch ID or Face ID", icon: Smartphone },
  zelle: { label: "Zelle", hint: "Send from your bank app — we confirm manually", icon: Landmark },
  test_card: { label: "Test Card", hint: "Demo only — no real charge (4242 4242 4242 4242)", icon: TestTube2 },
};

export const enabledMethods = (config) =>
  ["square", "cash_app", "paypal", "apple_pay", "zelle", "test_card"].filter((m) => {
    if (m === "cash_app") return config?.cashApp?.enabled;
    if (m === "apple_pay") return config?.applePay?.enabled && Boolean(window.ApplePaySession?.canMakePayments?.());
    if (m === "test_card") return config?.testCard?.visible ?? config?.testCard?.enabled;
    return config?.[m]?.enabled;
  });

const PaymentMethodPicker = ({ methods, value, onChange }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="payment-method-picker" role="radiogroup">
    {methods.map((m) => {
      const meta = METHOD_META[m];
      const active = value === m;
      return (
        <button
          type="button"
          key={m}
          role="radio"
          aria-checked={active}
          data-testid={`pay-method-${m}`}
          onClick={() => onChange(m)}
          className={`relative flex items-start gap-3 text-left rounded-xl border-2 p-4 transition-colors ${active ? "border-emerald-600 bg-emerald-50/50" : "border-neutral-200 hover:border-neutral-400"}`}
        >
          <span className={`h-9 w-9 shrink-0 grid place-items-center rounded-full ${active ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-600"}`}><meta.icon className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-neutral-900">{meta.label}</span>
            <span className="block text-xs text-neutral-500">{meta.hint}</span>
          </span>
          {active && <Check className="absolute top-3 right-3 h-4 w-4 text-emerald-600" />}
        </button>
      );
    })}
  </div>
);

export default PaymentMethodPicker;

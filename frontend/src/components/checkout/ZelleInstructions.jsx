import React, { useState } from "react";
import { Copy, Check, Landmark } from "lucide-react";

const Row = ({ label, value, testId }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(String(value)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-emerald-100 last:border-0">
      <span className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <span data-testid={testId} className="font-mono text-sm font-bold text-neutral-900 break-all">{value}</span>
        <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="h-7 w-7 grid place-items-center rounded-full hover:bg-emerald-100 text-emerald-700">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
      </span>
    </div>
  );
};

const ZelleInstructions = ({ recipient, name, amount, memo, compact = false }) => (
  <div data-testid="zelle-instructions" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
    {!compact && (
      <div className="flex items-center gap-2 mb-2">
        <span className="h-8 w-8 grid place-items-center rounded-full bg-[#6d1ed4] text-white"><Landmark className="h-4 w-4" /></span>
        <p className="font-heading text-lg">Pay with Zelle</p>
      </div>
    )}
    <p className="text-xs text-neutral-600 mb-2">Open your bank app, choose Zelle, and send the exact amount to the recipient below. {memo ? "Put the order number in the memo so we can match your payment." : "You'll get the order number to use as the memo after you place the order."} We confirm within a few hours during business hours.</p>
    <Row label="Send to" value={recipient} testId="zelle-recipient" />
    {name && <Row label="Recipient name" value={name} testId="zelle-name" />}
    {amount != null && <Row label="Amount" value={`$${Number(amount).toFixed(2)}`} testId="zelle-amount" />}
    {memo && <Row label="Memo" value={memo} testId="zelle-memo" />}
  </div>
);

export default ZelleInstructions;

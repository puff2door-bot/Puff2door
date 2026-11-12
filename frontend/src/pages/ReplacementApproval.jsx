import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, CircleX, RefreshCw } from "lucide-react";
import api from "../api";
import Seo from "../seo/Seo";

export default function ReplacementApproval() {
  const { token } = useParams();
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => api.get(`/replacement/${token}`).then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.detail || "This approval link is not available."));
  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (decision) => { setBusy(true); setError(""); try { const { data: next } = await api.post(`/replacement/${token}`, { decision }); setData(next); } catch (e) { setError(e?.response?.data?.detail || "Please try again."); } finally { setBusy(false); } };
  if (error && !data) return <div className="max-w-xl mx-auto px-4 py-24 text-center"><CircleX className="h-12 w-12 text-red-500 mx-auto" /><h1 className="font-heading text-3xl mt-4">Replacement unavailable</h1><p className="text-neutral-500 mt-2">{error}</p></div>;
  if (!data) return <div className="py-24 text-center text-neutral-500"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading replacement…</div>;
  const offer = data.offer; const closed = offer.status !== "pending"; const credit = Math.abs(Number(offer.priceDifference || 0));
  return <div className="max-w-2xl mx-auto px-4 py-12"><Seo noindex title="Replacement Approval | HD Smoke Shop" description="Secure order replacement approval." />
    <div className="rounded-2xl border p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Order {data.orderNumber}</p><h1 className="font-heading text-3xl uppercase mt-2">Review your replacement</h1>
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        {[{ label: "Original item", name: offer.originalName, image: offer.originalImage, price: offer.originalUnitPrice }, { label: "Suggested replacement", name: offer.replacementName, image: offer.replacementImage, price: offer.replacementUnitPrice }].map((item) => <div key={item.label} className="rounded-xl border p-4"><p className="text-xs uppercase tracking-wide text-neutral-500">{item.label}</p>{item.image && <img src={item.image} alt="" className="h-32 w-full object-contain my-3" />}<p className="font-bold">{item.name}</p><p className="text-sm text-neutral-600">${Number(item.price).toFixed(2)} each · Qty {offer.qty}</p></div>)}
      </div>
      {offer.note && <p className="rounded-lg bg-neutral-50 p-4 text-sm mt-4">Store note: {offer.note}</p>}
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mt-4 text-sm text-emerald-900"><strong>You will never be charged more through this approval.</strong>{credit > 0.005 ? ` This replacement is $${credit.toFixed(2)} less, and that credit will be flagged for the store to review/refund.` : " The replacement is the same price."}</div>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {closed ? <div className={`mt-6 rounded-xl p-5 text-center font-bold ${offer.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-700"}`}><CheckCircle2 className="h-6 w-6 mx-auto mb-2" />Replacement {offer.status}</div> : <div className="grid sm:grid-cols-2 gap-3 mt-6"><button disabled={busy} onClick={() => decide("approved")} className="rounded-full bg-emerald-600 text-white py-3 font-bold disabled:opacity-50">Approve replacement</button><button disabled={busy} onClick={() => decide("declined")} className="rounded-full border border-neutral-400 py-3 font-bold disabled:opacity-50">Decline</button></div>}
      <p className="text-xs text-neutral-500 mt-5">Questions? Call (407) 625-6826. Valid government-issued 21+ photo ID is still required at delivery.</p>
    </div>
  </div>;
}

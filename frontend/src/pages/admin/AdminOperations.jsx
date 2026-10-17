import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, IdCard, RefreshCw, RotateCcw, Send, Truck, UserRound } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

const localDate = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const stateTone = {
  placed: "bg-neutral-100 text-neutral-700", confirmed: "bg-blue-100 text-blue-700",
  out_for_delivery: "bg-amber-100 text-amber-800", delivered: "bg-emerald-100 text-emerald-700",
  returning_to_store: "bg-red-100 text-red-700", returned: "bg-neutral-200 text-neutral-700", cancelled: "bg-red-100 text-red-700",
};

const blankCheck = { idType: "Driver license", photoIdValid: false, age21Confirmed: false, nameMatchesOrder: false, expirationValid: false, failureReason: "", checkedBy: "" };

const AdminOperations = () => {
  const [date, setDate] = useState(localDate());
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [idDrafts, setIdDrafts] = useState({});
  const [busy, setBusy] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    const res = await api.get("/admin/operations", { params: { date } });
    setData(res.data);
  }, [date]);

  useEffect(() => { load().catch(() => toast({ title: "Could not load delivery operations", variant: "destructive" })); }, [load, toast]);

  const draft = (o) => drafts[o.id] || { driverName: o.driverName || "", driverPhoneLast4: o.dispatch?.driverPhoneLast4 || "", etaMinutes: o.dispatch?.etaMinutes || data?.defaultEtaMinutes || 45, dispatchNotes: o.dispatch?.dispatchNotes || "", driverTextSent: Boolean(o.driverTextSent) };
  const patchDraft = (id, patch) => setDrafts((v) => ({ ...v, [id]: { ...(v[id] || {}), ...patch } }));
  const idDraft = (o) => idDrafts[o.id] || { ...blankCheck, checkedBy: o.driverName || "" };
  const patchId = (id, patch) => setIdDrafts((v) => ({ ...v, [id]: { ...(v[id] || blankCheck), ...patch } }));

  const run = async (key, request, success) => {
    setBusy(key);
    try { await request(); toast({ title: success }); await load(); }
    catch (e) { toast({ title: "Update failed", description: e?.response?.data?.detail || "Try again.", variant: "destructive" }); }
    finally { setBusy(""); }
  };

  const dispatch = (o) => run(`dispatch-${o.id}`, () => api.put(`/admin/orders/${o.id}/dispatch`, { ...draft(o), etaMinutes: Number(draft(o).etaMinutes) }), "Driver and ETA saved");
  const markOut = (o) => run(`out-${o.id}`, async () => {
    await api.put(`/admin/orders/${o.id}/dispatch`, { ...draft(o), etaMinutes: Number(draft(o).etaMinutes) });
    await api.put(`/admin/orders/${o.id}/status`, { status: "out_for_delivery" });
    if (draft(o).driverTextSent) await api.put(`/admin/orders/${o.id}/delivery-details`, { deliveryPhotoUrl: o.deliveryPhotoUrl || "", driverTextSent: true });
  }, "Order is out for delivery");
  const saveId = (o, result) => run(`id-${o.id}`, () => api.put(`/admin/orders/${o.id}/id-check`, { ...idDraft(o), result }), result === "passed" ? "ID check passed" : "Failed ID return started");
  const markDelivered = (o) => run(`delivered-${o.id}`, () => api.put(`/admin/orders/${o.id}/status`, { status: "delivered" }), "Order marked delivered");
  const completeReturn = (o, disposition) => run(`return-${o.id}`, () => api.put(`/admin/orders/${o.id}/return`, { disposition, notes: disposition === "restocked" ? "Returned to inventory after failed ID check." : "Removed from sellable inventory after failed ID check." }), disposition === "restocked" ? "Return completed and inventory restored" : "Return completed without restocking");

  if (!data) return <p className="text-neutral-500">Loading delivery operations...</p>;

  return (
    <div data-testid="admin-operations">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div><h1 className="font-heading text-3xl uppercase tracking-tight">Delivery Operations Center</h1><p className="text-sm text-neutral-500">Capacity, dispatch, live ETA, door ID verification, and failed-ID returns in one place.</p></div>
        <div className="flex gap-2"><label className="flex items-center gap-2 border rounded-lg px-3"><CalendarDays className="h-4 w-4 text-emerald-600" /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="py-2 text-sm outline-none" /></label><button onClick={load} className="h-10 w-10 grid place-items-center rounded-lg border hover:bg-neutral-50" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[["Orders", data.summary.total], ["Active", data.summary.active], ["Unassigned", data.summary.unassigned], ["On the road", data.summary.outForDelivery], ["Failed ID", data.summary.failedId]].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p className="text-xs text-neutral-500">{label}</p><p className="font-heading text-2xl mt-1">{value}</p></div>)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-7">
        {data.windows.map((w) => <div key={w.id} className={`rounded-xl border p-4 ${w.full ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50/50"}`}><p className="font-bold">{w.label}</p><p className="text-sm text-neutral-600 mt-1">{w.booked} booked · {w.remaining} remaining · {w.capacity} capacity</p><div className="h-2 rounded-full bg-white mt-3 overflow-hidden"><div className={`h-full ${w.full ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (w.booked / Math.max(w.capacity, 1)) * 100)}%` }} /></div></div>)}
      </div>

      {!data.orders.length ? <div className="rounded-xl border border-dashed p-10 text-center text-neutral-500">No deliveries scheduled for this date.</div> : <div className="space-y-4">
        {data.orders.map((o) => {
          const d = draft(o); const check = idDraft(o); const idPassed = o.idCheck?.status === "passed"; const idFailed = o.idCheck?.status === "failed"; const canDispatch = ["placed", "confirmed", "out_for_delivery"].includes(o.status);
          return <article key={o.id} className="rounded-2xl border border-neutral-200 p-5" data-testid={`operations-order-${o.orderNumber}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><h2 className="font-heading text-xl">{o.orderNumber}</h2><span className={`text-xs font-bold rounded-full px-2.5 py-1 ${stateTone[o.status] || "bg-neutral-100"}`}>{String(o.status).replaceAll("_", " ")}</span></div><p className="text-sm text-neutral-600 mt-1">{o.shipping.firstName} {o.shipping.lastName} · {o.shipping.phone} · {o.shipping.zip}</p><p className="text-xs text-neutral-500 mt-1"><Clock3 className="inline h-3.5 w-3.5 mr-1" />{o.deliveryWindow?.label || o.arrivalLabel}</p></div>
              {o.etaAt && <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-bold">ETA {new Date(o.etaAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
            </div>

            {canDispatch && <><div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
              <label className="border rounded-lg px-3 py-2"><span className="block text-[10px] font-bold uppercase text-neutral-500">Driver name</span><input value={d.driverName} onChange={(e) => patchDraft(o.id, { driverName: e.target.value })} className="w-full text-sm outline-none" placeholder="Driver" /></label>
              <label className="border rounded-lg px-3 py-2"><span className="block text-[10px] font-bold uppercase text-neutral-500">Phone last 4</span><input value={d.driverPhoneLast4} maxLength={4} onChange={(e) => patchDraft(o.id, { driverPhoneLast4: e.target.value.replace(/\D/g, "") })} className="w-full text-sm outline-none" placeholder="1234" /></label>
              <label className="border rounded-lg px-3 py-2"><span className="block text-[10px] font-bold uppercase text-neutral-500">ETA minutes</span><input type="number" min="5" max="480" value={d.etaMinutes} onChange={(e) => patchDraft(o.id, { etaMinutes: e.target.value })} className="w-full text-sm outline-none" /></label>
              <button disabled={busy} onClick={() => dispatch(o)} className="rounded-lg border border-neutral-900 px-3 py-2 text-sm font-bold hover:bg-neutral-900 hover:text-white disabled:opacity-50"><UserRound className="inline h-4 w-4 mr-1" /> Save assignment</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs font-semibold text-neutral-700"><input type="checkbox" checked={d.driverTextSent} onChange={(e) => patchDraft(o.id, { driverTextSent: e.target.checked })} className="accent-emerald-600" /> Customer text was sent</label><button disabled={busy || !d.driverName} onClick={() => markOut(o)} className="rounded-full bg-amber-500 text-white px-4 py-2 text-xs font-bold disabled:opacity-50"><Send className="inline h-3.5 w-3.5 mr-1" /> Driver on the way</button></div></>}

            {o.requiresIdAtDelivery && !idPassed && !idFailed && o.status !== "out_for_delivery" && canDispatch && <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-600"><IdCard className="inline h-4 w-4 mr-1 text-neutral-500" /> Door ID verification becomes available after the order is marked “Driver on the way.”</div>}
            {o.requiresIdAtDelivery && !idPassed && !idFailed && o.status === "out_for_delivery" && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h3 className="font-bold text-sm flex items-center gap-2"><IdCard className="h-4 w-4" /> Door ID check</h3><p className="text-xs text-neutral-600 mt-1 mb-3">Inspect the physical ID. Do not photograph or upload the complete ID.</p>
              <div className="grid sm:grid-cols-2 gap-2"><label className="border bg-white rounded-lg px-3 py-2 text-xs font-bold">ID type<input value={check.idType} onChange={(e) => patchId(o.id, { idType: e.target.value })} className="block w-full mt-1 font-normal outline-none" /></label><label className="border bg-white rounded-lg px-3 py-2 text-xs font-bold">Checked by<input value={check.checkedBy} onChange={(e) => patchId(o.id, { checkedBy: e.target.value })} className="block w-full mt-1 font-normal outline-none" placeholder="Driver name" /></label></div>
              <div className="grid sm:grid-cols-2 gap-2 mt-3">{[["photoIdValid", "Government photo ID is valid"], ["age21Confirmed", "DOB confirms age 21+"], ["nameMatchesOrder", "Name matches the order"], ["expirationValid", "ID is not expired"]].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={check[key]} onChange={(e) => patchId(o.id, { [key]: e.target.checked })} className="accent-emerald-600" />{label}</label>)}</div>
              <div className="mt-3 flex flex-col sm:flex-row gap-2"><button disabled={busy || !check.idType.trim() || !check.photoIdValid || !check.age21Confirmed || !check.nameMatchesOrder || !check.expirationValid} onClick={() => saveId(o, "passed")} className="rounded-full bg-emerald-600 text-white px-4 py-2 text-xs font-bold disabled:opacity-50"><CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> ID passed</button><input value={check.failureReason} onChange={(e) => patchId(o.id, { failureReason: e.target.value })} className="flex-1 rounded-lg border bg-white px-3 py-2 text-xs" placeholder="Failure reason: under 21, expired, mismatch, refused…" /><button disabled={busy || !check.failureReason.trim()} onClick={() => saveId(o, "failed")} className="rounded-full bg-red-600 text-white px-4 py-2 text-xs font-bold disabled:opacity-50">Fail ID &amp; return</button></div>
            </div>}

            {idPassed && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm"><span className="font-bold text-emerald-800"><CheckCircle2 className="inline h-4 w-4 mr-1" /> ID verified by {o.idCheck.checkedBy}</span>{o.status !== "delivered" && <button disabled={busy} onClick={() => markDelivered(o)} className="rounded-full bg-emerald-700 text-white px-4 py-2 text-xs font-bold"><Truck className="inline h-3.5 w-3.5 mr-1" /> Mark delivered</button>}</div>}
            {idFailed && o.returnProcedure?.status !== "completed" && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-bold text-red-800"><RotateCcw className="inline h-4 w-4 mr-1" /> Return to store required: {o.idCheck.failureReason}</p><p className="text-xs text-red-700 mt-1">Do not hand over the order. Return all items, then record whether they can safely be returned to inventory. After the return, review the payment or refund separately in Orders.</p><div className="flex flex-wrap gap-2 mt-3"><button disabled={busy} onClick={() => completeReturn(o, "restocked")} className="rounded-full bg-neutral-900 text-white px-4 py-2 text-xs font-bold">Returned and restocked</button><button disabled={busy} onClick={() => completeReturn(o, "discarded")} className="rounded-full border border-red-400 text-red-700 px-4 py-2 text-xs font-bold">Returned, do not restock</button></div></div>}
          </article>;
        })}
      </div>}
    </div>
  );
};

export default AdminOperations;

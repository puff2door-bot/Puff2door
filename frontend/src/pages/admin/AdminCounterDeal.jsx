import React, { useEffect, useState } from "react";
import { Ticket, CheckCircle2, XCircle } from "lucide-react";
import api from "../../api";

// Staff redeem "Show this at the counter" codes here (works on a phone at the register).
const AdminCounterDeal = () => {
  const [info, setInfo] = useState(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/admin/counter-deal").then(({ data }) => setInfo(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const redeem = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/admin/counter-deal/redeem", { code });
      setResult({ ok: true, text: `${data.code} is valid: give ${data.percent}% off. It's now marked as used.` });
      setCode("");
      load();
    } catch (err) {
      setResult({ ok: false, text: err?.response?.data?.detail || "Couldn't check that code." });
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl" data-testid="admin-counter-deal">
      <h1 className="hidden lg:flex items-center gap-2 font-heading text-3xl uppercase mb-4"><Ticket className="h-7 w-7 text-emerald-600" />Counter deal</h1>
      <p className="text-sm text-neutral-600 mb-4">Customers open <b>puff2door.com/in-store</b> and show you a code. Type it here to check it and mark it used. Each code works once.</p>
      <form onSubmit={redeem} className="flex gap-2 mb-3">
        <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setResult(null); }} placeholder="HD-7Q4K" autoCapitalize="characters" className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 font-mono text-lg tracking-widest outline-none focus:border-emerald-600" data-testid="counter-code-input" />
        <button disabled={busy || !code.trim()} className="rounded-lg bg-emerald-600 px-5 font-bold text-white disabled:opacity-50">{busy ? "Checking…" : "Redeem"}</button>
      </form>
      {result && (
        <p className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold mb-4 ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {result.ok ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}{result.text}
        </p>
      )}
      {info && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          <p className="mb-2"><b>{info.percent}% off</b> · {info.active ? `running${info.ends ? ` until ${info.ends}` : ""}` : "not running"} · change it in Store Settings</p>
          <p className="text-neutral-600">{info.claimed} code{info.claimed === 1 ? "" : "s"} handed out · {info.redeemed} used in store</p>
          {info.recent.length > 0 && (
            <ul className="mt-3 divide-y divide-neutral-100">
              {info.recent.map((r) => <li key={r.code} className="flex justify-between py-1.5"><span className="font-mono">{r.code}</span><span className="text-neutral-500">{new Date(r.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminCounterDeal;

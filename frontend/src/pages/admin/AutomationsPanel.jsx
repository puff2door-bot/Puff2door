import React, { useEffect, useState } from "react";
import { CheckCircle2, Star, Zap } from "lucide-react";
import api from "../../api";

const when = (v) => (v ? new Date(v).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

// What the agents now do on their own, with an on/off switch for each and a log of what was done.
const AutomationsPanel = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    try { setData((await api.get("/admin/automations")).data); setError(""); } catch (e) { setError("Could not load automations."); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (id, on) => {
    setBusy(id);
    try { await api.post(`/admin/automations/${id}`, { on }); await load(); } catch (e) { setError("Could not change that setting."); }
    setBusy("");
  };

  const connectGoogle = async () => {
    setBusy("google");
    try { window.location.href = (await api.post("/admin/google/connect")).data.url; } catch (e) {
      setError(e?.response?.data?.detail || "Google sign-in isn't ready yet.");
      setBusy("");
    }
  };

  const g = data?.google || {};
  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm space-y-4" data-testid="automations-panel">
      <div>
        <h3 className="font-heading text-xl flex items-center gap-2"><Zap className="w-5 h-5 text-emerald-600" />Runs automatically</h3>
        <p className="text-sm text-neutral-500 mt-1">The agents do these on their own. Turn any of them off here. Everything they do is listed below and in your morning email.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="grid md:grid-cols-2 gap-2">
        {(data?.automations || []).map((a) => (
          <label key={a.id} className="flex items-center justify-between gap-3 border rounded-xl px-3 py-2 text-sm">
            <span>{a.label}</span>
            <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={a.on} disabled={busy === a.id} onChange={(e) => toggle(a.id, e.target.checked)} aria-label={a.label} />
          </label>
        ))}
      </div>
      <div className="border rounded-xl p-3 text-sm flex flex-wrap items-center gap-3">
        <Star className="w-5 h-5 text-amber-500" />
        <div className="flex-1 min-w-[200px]">
          <b>Google reviews:</b>{" "}
          {g.connected ? `connected to ${g.locationTitle || "your profile"} · ${g.repliedCount || 0} replies sent${g.lastCheckedAt ? ` · checked ${when(g.lastCheckedAt)}` : ""}`
            : g.configured ? "not connected yet." : "waiting for Google to approve API access."}
          {g.lastError && <span className="block text-red-700">Last try didn't work: {g.lastError}</span>}
          {g.connected && <span className="block text-neutral-600 mt-1">{g.reviewsOnFile || 0} five-star reviews ready for the website.{" "}
            <a href="/delivery-area?reviewPreview=1" target="_blank" rel="noreferrer" className="underline">Preview</a></span>}
        </div>
        {g.connected && <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={!!g.onSite} disabled={busy === "site"}
            onChange={async (e) => { setBusy("site"); try { await api.post("/admin/google/reviews-on-site", { on: e.target.checked }); await load(); } catch { setError("Could not change that setting."); } setBusy(""); }} />
          Show on website</label>}
        {!g.connected && <button type="button" onClick={connectGoogle} disabled={busy === "google" || !g.configured} className="rounded-xl px-3 py-2 font-semibold bg-emerald-700 text-white disabled:opacity-50">Connect Google</button>}
      </div>
      <div>
        <p className="text-sm font-semibold mb-2">Recently done for you</p>
        {!(data?.log || []).length ? <p className="text-sm text-neutral-500">Nothing yet.</p> : (
          <ul className="space-y-1 max-h-72 overflow-auto text-sm">
            {data.log.map((row, i) => (
              <li key={i} className="flex gap-2"><CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${row.detail?.ok === false ? "text-red-500" : "text-emerald-600"}`} />
                <span><span className="text-neutral-400 tabular-nums">{when(row.at)}</span> · {row.text}</span></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default AutomationsPanel;

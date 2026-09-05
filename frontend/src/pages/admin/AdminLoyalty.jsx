import React, { useEffect, useState } from "react";
import { Save, Gift, Search, Users, Wrench } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";
import { HistoryTable } from "../../components/account/MyRewards";

const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";

const Field = ({ label, hint, children }) => (
  <div className="border border-neutral-200 rounded-2xl p-4">
    <label className="text-sm font-bold text-neutral-900 block mb-0.5">{label}</label>
    <p className="text-xs text-neutral-500 mb-2">{hint}</p>
    {children}
  </div>
);

const errText = (err) => { const d = err?.response?.data?.detail; return Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || "Try again"; };

const SettingsForm = () => {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => { api.get("/admin/loyalty/settings").then(({ data }) => setF(data)); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/admin/loyalty/settings", { ...f, pointsPerDollar: Number(f.pointsPerDollar), pointsPerReward: Number(f.pointsPerReward), rewardValue: Number(f.rewardValue), minRedeemPoints: Number(f.minRedeemPoints), maxRedeemPerOrder: Number(f.maxRedeemPerOrder), minPurchaseForRedeem: Number(f.minPurchaseForRedeem), signupBonusPoints: Number(f.signupBonusPoints) });
      setF(data);
      toast({ title: "Rewards settings saved", description: "New rules apply to all new orders and redemptions immediately." });
    } catch (err) {
      toast({ title: "Save failed", description: errText(err), variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!f) return <p className="text-neutral-500">Loading settings...</p>;
  const ex = 100;
  return (
    <form onSubmit={save} data-testid="loyalty-settings" className="mb-10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" data-testid="loyalty-enabled" className="accent-emerald-600 h-4 w-4" checked={f.loyaltyEnabled} onChange={(e) => setF({ ...f, loyaltyEnabled: e.target.checked })} /> Program enabled</label>
        <button disabled={busy} data-testid="loyalty-settings-save" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700 disabled:opacity-60"><Save className="h-4 w-4" /> {busy ? "Saving..." : "Save Rewards Settings"}</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Field label="Points per $1 spent" hint="On eligible merchandise only (after discounts; tax & delivery excluded)."><input required type="number" min="0" max="100" step="0.5" data-testid="loyalty-points-per-dollar" className={inputCls} value={f.pointsPerDollar} onChange={(e) => setF({ ...f, pointsPerDollar: e.target.value })} /></Field>
        <Field label="Points per reward" hint="Points needed for one reward block."><input required type="number" min="1" step="1" data-testid="loyalty-points-per-reward" className={inputCls} value={f.pointsPerReward} onChange={(e) => setF({ ...f, pointsPerReward: e.target.value })} /></Field>
        <Field label="Reward value ($)" hint="Dollar value of one reward block."><input required type="number" min="0" step="0.01" data-testid="loyalty-reward-value" className={inputCls} value={f.rewardValue} onChange={(e) => setF({ ...f, rewardValue: e.target.value })} /></Field>
        <Field label="Minimum points to redeem" hint="Customers need at least this many points to redeem."><input required type="number" min="0" step="1" data-testid="loyalty-min-redeem" className={inputCls} value={f.minRedeemPoints} onChange={(e) => setF({ ...f, minRedeemPoints: e.target.value })} /></Field>
        <Field label="Max points per order" hint="0 = no limit."><input required type="number" min="0" step="1" data-testid="loyalty-max-redeem" className={inputCls} value={f.maxRedeemPerOrder} onChange={(e) => setF({ ...f, maxRedeemPerOrder: e.target.value })} /></Field>
        <Field label="Minimum purchase to redeem ($)" hint="Merchandise total (after promo) required before rewards can be applied. 0 = none."><input required type="number" min="0" step="0.01" data-testid="loyalty-min-purchase" className={inputCls} value={f.minPurchaseForRedeem} onChange={(e) => setF({ ...f, minPurchaseForRedeem: e.target.value })} /></Field>
        <Field label="Welcome bonus (points)" hint="Added once when a new account is created (email or Google). 0 = no bonus."><input required type="number" min="0" step="1" data-testid="loyalty-signup-bonus" className={inputCls} value={f.signupBonusPoints} onChange={(e) => setF({ ...f, signupBonusPoints: e.target.value })} /></Field>
      </div>
      <p className="text-sm text-neutral-600 border border-dashed rounded-2xl p-4" data-testid="loyalty-preview">A ${ex} merchandise order earns <b>{Math.floor(ex * Number(f.pointsPerDollar))} points</b> · {Number(f.pointsPerReward)} points = <b>${Number(f.rewardValue).toFixed(2)} off</b> ({Number(f.pointsPerReward) && Number(f.rewardValue) ? `${(Number(f.rewardValue) / Number(f.pointsPerReward) * 100).toFixed(1)}¢ per point` : "—"}).</p>
    </form>
  );
};

const CustomerDetail = ({ userId, onChange }) => {
  const [d, setD] = useState(null);
  const [adj, setAdj] = useState({ points: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = () => api.get(`/admin/loyalty/customers/${userId}`).then(({ data }) => setD(data)).catch(() => setD(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [userId]);

  const adjust = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/loyalty/customers/${userId}/adjust`, { points: Number(adj.points), reason: adj.reason });
      toast({ title: "Points adjusted", description: `${Number(adj.points) > 0 ? "+" : ""}${adj.points} pts · new balance ${data.available}` });
      setAdj({ points: "", reason: "" });
      await load();
      onChange?.();
    } catch (err) {
      toast({ title: "Adjustment failed", description: errText(err), variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!d) return <p className="text-neutral-500 text-sm">Loading customer...</p>;
  return (
    <div data-testid="loyalty-customer-detail" className="border border-neutral-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="font-heading text-xl">{d.customer.name || "Customer"}</p>
          <p className="text-sm text-neutral-500">{d.customer.email}</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-3xl" data-testid="loyalty-customer-balance">{d.available.toLocaleString()} <span className="text-base text-neutral-400">pts</span></p>
          <p className="text-xs text-neutral-500">${d.availableValue.toFixed(2)} · lifetime {d.lifetimeEarned.toLocaleString()} · redeemed {d.redeemed.toLocaleString()}</p>
        </div>
      </div>
      <form onSubmit={adjust} data-testid="loyalty-adjust-form" className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 items-end mb-5 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
        <div><label className="text-xs font-bold text-neutral-600 block mb-1">Points (+/-)</label><input required type="number" step="1" data-testid="loyalty-adjust-points" placeholder="e.g. 50 or -100" className={inputCls} value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} /></div>
        <div><label className="text-xs font-bold text-neutral-600 block mb-1">Reason (required, shown to customer)</label><input required minLength={3} data-testid="loyalty-adjust-reason" placeholder="Goodwill credit for late delivery" className={inputCls} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></div>
        <button disabled={busy} data-testid="loyalty-adjust-submit" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-neutral-900 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 disabled:opacity-60"><Wrench className="h-4 w-4" /> {busy ? "Saving..." : "Apply"}</button>
      </form>
      {d.history.length === 0 ? <p className="text-sm text-neutral-500">No activity yet.</p> : <HistoryTable history={d.history} showAdmin testId="loyalty-customer-history" />}
    </div>
  );
};

const AdminLoyalty = () => {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);

  const search = (query = q) => api.get("/admin/loyalty/customers", { params: { q: query } }).then(({ data }) => setCustomers(data.customers)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search(""); }, []);

  return (
    <div data-testid="admin-loyalty">
      <div className="mb-6">
        <h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><Gift className="h-7 w-7 text-emerald-600" /> Loyalty Rewards</h1>
        <p className="text-sm text-neutral-500">Points are awarded only after an order is paid, on merchandise only. Every change is recorded in the customer's ledger.</p>
      </div>
      <SettingsForm />

      <h2 className="font-heading text-2xl uppercase tracking-wide mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /> Customers</h2>
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2 mb-4 max-w-lg">
        <div className="flex-1 flex items-center border border-neutral-300 rounded-lg px-3 focus-within:border-emerald-600"><Search className="h-4 w-4 text-neutral-400" /><input data-testid="loyalty-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name" className="flex-1 px-2 py-2.5 text-sm outline-none" /></div>
        <button data-testid="loyalty-search-submit" className="px-4 py-2.5 bg-neutral-900 text-white text-sm font-bold rounded-lg hover:bg-emerald-600">Search</button>
      </form>
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1" data-testid="loyalty-customer-list">
          {customers.length === 0 ? <p className="text-sm text-neutral-500 border border-dashed rounded-xl p-6 text-center">{q ? "No customers match." : "No rewards activity yet. Search to find any customer."}</p> : customers.map((c) => (
            <button key={c.id} type="button" onClick={() => setSelected(c.id)} data-testid={`loyalty-customer-${c.email}`} className={`w-full text-left border rounded-xl px-4 py-3 transition-colors ${selected === c.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-emerald-300"}`}>
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-neutral-900 truncate">{c.name || c.email}</p><span className="text-sm font-bold text-emerald-700 whitespace-nowrap">{c.available.toLocaleString()} pts</span></div>
              <p className="text-xs text-neutral-500 truncate">{c.email} · ${c.availableValue.toFixed(2)}</p>
            </button>
          ))}
        </div>
        <div>{selected ? <CustomerDetail userId={selected} onChange={() => search()} /> : <p className="text-sm text-neutral-500 border border-dashed rounded-2xl p-10 text-center">Select a customer to see their ledger and adjust points.</p>}</div>
      </div>
    </div>
  );
};

export default AdminLoyalty;

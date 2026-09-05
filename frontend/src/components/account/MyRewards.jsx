import React, { useEffect, useState } from "react";
import { Gift, ArrowDownRight, ArrowUpRight, RotateCcw, Wrench } from "lucide-react";
import api from "../../api";

export const TX_META = {
  earn: { label: "Earned", icon: ArrowUpRight, cls: "text-emerald-700 bg-emerald-50" },
  redeem: { label: "Redeemed", icon: ArrowDownRight, cls: "text-amber-700 bg-amber-50" },
  reverse: { label: "Reversed", icon: RotateCcw, cls: "text-red-700 bg-red-50" },
  redeem_return: { label: "Returned", icon: RotateCcw, cls: "text-blue-700 bg-blue-50" },
  adjust: { label: "Adjustment", icon: Wrench, cls: "text-neutral-700 bg-neutral-100" },
  bonus: { label: "Bonus", icon: Gift, cls: "text-emerald-700 bg-emerald-50" },
};

export const HistoryTable = ({ history, showAdmin = false, testId = "rewards-history" }) => (
  <div className="overflow-x-auto" data-testid={testId}>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b">
          <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Activity</th><th className="py-2 pr-3">Details</th>{showAdmin && <th className="py-2 pr-3">By</th>}<th className="py-2 text-right">Points</th>
        </tr>
      </thead>
      <tbody>
        {history.map((t) => {
          const m = TX_META[t.type] || TX_META.adjust;
          return (
            <tr key={t.id} data-testid={`rewards-tx-${t.type}`} className="border-b border-neutral-100">
              <td className="py-2.5 pr-3 text-xs text-neutral-500 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
              <td className="py-2.5 pr-3"><span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${m.cls}`}><m.icon className="h-3 w-3" /> {m.label}</span></td>
              <td className="py-2.5 pr-3 text-neutral-700">{t.description}{t.reason ? <span className="block text-xs text-neutral-500">Reason: {t.reason}</span> : null}{t.rewardValue ? <span className="block text-xs text-neutral-500">${Number(t.rewardValue).toFixed(2)} value</span> : null}</td>
              {showAdmin && <td className="py-2.5 pr-3 text-xs text-neutral-500">{t.adminEmail || (t.adminId ? "admin" : "system")}</td>}
              <td className={`py-2.5 text-right font-bold whitespace-nowrap ${t.points > 0 ? "text-emerald-700" : "text-red-600"}`}>{t.points > 0 ? "+" : ""}{t.points.toLocaleString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const MyRewards = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/loyalty/me").then(({ data }) => setData(data)).catch(() => setError(true));
  }, []);

  if (error || (data && !data.rules?.enabled)) return null;
  if (!data) return <p className="text-neutral-500 text-sm mb-8">Loading rewards...</p>;

  const per = data.rules.pointsPerReward;
  const progress = per ? ((data.available % per) / per) * 100 : 0;

  return (
    <section data-testid="my-rewards" className="mb-10">
      <h2 className="font-heading text-2xl uppercase tracking-wide mb-5 flex items-center gap-2"><Gift className="h-6 w-6 text-emerald-600" /> My Rewards</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="bg-neutral-900 text-white rounded-2xl p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-2">Available points</p>
          <p className="font-heading text-4xl" data-testid="rewards-available-points">{data.available.toLocaleString()}</p>
          <p className="text-sm text-emerald-400 font-semibold mt-1" data-testid="rewards-available-value">= ${data.availableValue.toFixed(2)} in rewards</p>
        </div>
        <div className="border border-neutral-200 rounded-2xl p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-2">Next ${data.rules.rewardValue.toFixed(2)} reward</p>
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden mb-2"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${data.available >= per ? 100 : progress}%` }} /></div>
          <p className="text-sm text-neutral-600" data-testid="rewards-next">{data.available >= per ? `You can redeem ${data.redeemablePoints.toLocaleString()} pts ($${data.redeemableValue.toFixed(2)}) at checkout` : `${data.pointsToNextReward} more points to go`}</p>
        </div>
        <div className="border border-neutral-200 rounded-2xl p-6 text-sm text-neutral-600 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-2">How it works</p>
          <p>Earn <span className="font-bold text-neutral-900">{data.rules.pointsPerDollar} pt per $1</span> of merchandise once your order is paid.</p>
          <p><span className="font-bold text-neutral-900">{per} pts = ${data.rules.rewardValue.toFixed(2)} off</span> at checkout. Tax, delivery and discounts don't earn points.</p>
          <p className="text-xs text-neutral-400">Lifetime earned: {data.lifetimeEarned.toLocaleString()} pts</p>
        </div>
      </div>
      {data.history.length === 0 ? (
        <p className="text-sm text-neutral-500 border border-dashed rounded-xl p-6 text-center" data-testid="rewards-empty">No rewards activity yet — points appear here after your first paid order.</p>
      ) : <HistoryTable history={data.history} />}
    </section>
  );
};

export default MyRewards;

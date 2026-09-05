import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Sparkles } from "lucide-react";
import api from "../../api";
import { useCart, rewardValue } from "../../context/CartContext";
import { useApp } from "../../context/AppContext";

const RewardsPanel = () => {
  const { user } = useApp();
  const { loyalty, redeemPoints, setRedeemPoints, totals, subtotal } = useCart();
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!user) { setMe(null); return; }
    api.get("/loyalty/me").then(({ data }) => setMe(data)).catch(() => setMe(null));
  }, [user]);

  const per = loyalty.pointsPerReward;
  const merchAfterPromo = Math.max(subtotal - totals.discount, 0);
  const maxByBalance = me ? me.redeemablePoints : 0;
  const maxByCart = Math.floor(merchAfterPromo / loyalty.rewardValue) * per;
  const maxRedeem = Math.min(maxByBalance, maxByCart);

  useEffect(() => {
    if (redeemPoints > maxRedeem) setRedeemPoints(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxRedeem]);

  if (!loyalty?.enabled) return null;

  if (!user) {
    return (
      <div data-testid="rewards-guest" className="border border-dashed border-emerald-300 bg-emerald-50/50 rounded-xl px-5 py-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
        <p className="text-sm text-neutral-700">
          <span className="font-bold text-neutral-900">Earn {totals.pointsToEarn} Puff2door Rewards points on this order.</span>{" "}
          <Link to="/my-account" className="text-emerald-700 font-semibold hover:underline" data-testid="rewards-signin-link">Sign in or create an account</Link> to collect points{loyalty.signupBonusPoints ? ` (new members get ${loyalty.signupBonusPoints} bonus points)` : ""} — every {per} points = ${loyalty.rewardValue.toFixed(2)} off a future order.
        </p>
      </div>
    );
  }

  const options = [];
  for (let p = per; p <= maxRedeem; p += per) options.push(p);
  const canRedeem = options.length > 0 && merchAfterPromo >= (loyalty.minPurchaseForRedeem || 0);

  return (
    <div data-testid="rewards-panel" className="border border-emerald-200 bg-emerald-50/40 rounded-xl px-5 py-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-emerald-600" />
          <h3 className="font-heading text-lg uppercase tracking-wide">Puff2door Rewards</h3>
        </div>
        <span data-testid="rewards-balance" className="text-xs font-bold bg-white border border-emerald-200 text-emerald-800 px-3 py-1 rounded-full">
          {me ? `${me.available.toLocaleString()} pts · $${me.availableValue.toFixed(2)}` : "Loading..."}
        </span>
      </div>
      <p className="text-xs text-neutral-600 mt-2" data-testid="rewards-earn-preview">
        You'll earn <span className="font-bold text-emerald-700">{totals.pointsToEarn} points</span> on this order once it's paid ({loyalty.pointsPerDollar} point{loyalty.pointsPerDollar === 1 ? "" : "s"} per $1 of merchandise; tax, delivery and discounts excluded).
      </p>
      {me && (
        canRedeem ? (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <label className="text-sm font-semibold text-neutral-800" htmlFor="redeem-points">Redeem</label>
            <select id="redeem-points" data-testid="rewards-redeem-select" value={redeemPoints} onChange={(e) => setRedeemPoints(Number(e.target.value))} className="border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-600">
              <option value={0}>Don't redeem now</option>
              {options.map((p) => <option key={p} value={p}>{`${p.toLocaleString()} pts → $${rewardValue(p, loyalty).toFixed(2)} off`}</option>)}
            </select>
            {redeemPoints > 0 && <span data-testid="rewards-applied" className="text-sm font-bold text-emerald-700">-${totals.reward.toFixed(2)} applied</span>}
          </div>
        ) : (
          <p className="mt-3 text-xs text-neutral-500" data-testid="rewards-not-redeemable">
            {me.available < per ? `Collect ${me.pointsToNextReward || per} more points to unlock your next $${loyalty.rewardValue.toFixed(2)} reward.` : `Rewards can't be applied to this cart yet (each $${loyalty.rewardValue.toFixed(2)} reward needs at least $${loyalty.rewardValue.toFixed(2)} of merchandise${loyalty.minPurchaseForRedeem ? `, min purchase $${loyalty.minPurchaseForRedeem.toFixed(2)}` : ""}).`}
          </p>
        )
      )}
    </div>
  );
};

export default RewardsPanel;

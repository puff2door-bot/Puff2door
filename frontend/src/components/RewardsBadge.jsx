import React from "react";
import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useApp } from "../context/AppContext";

const RewardsBadge = ({ price, qty = 1 }) => {
  const { loyalty } = useCart();
  const { user } = useApp();
  if (!loyalty?.enabled || !loyalty.pointsPerDollar) return null;
  const pts = Math.floor(price * qty * loyalty.pointsPerDollar);
  if (pts <= 0) return null;
  return (
    <div data-testid="product-rewards-badge" className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-5">
      <Gift className="h-3.5 w-3.5 text-emerald-600" />
      <span>Earn <b>{pts.toLocaleString()} pts</b> ({loyalty.pointsPerDollar} pt per $1) · {loyalty.pointsPerReward} pts = ${loyalty.rewardValue.toFixed(2)} off</span>
      {!user && <Link to="/my-account" data-testid="product-rewards-join" className="underline hover:text-emerald-600">{loyalty.signupBonusPoints ? `Join for ${loyalty.signupBonusPoints} bonus pts` : "Join free"}</Link>}
    </div>
  );
};

export default RewardsBadge;

import { imgUrl } from "../api";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag, ArrowRight, Tag } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useToast } from "../hooks/use-toast";

const CartPage = () => {
  const { items, updateQty, removeItem, subtotal, clearCart, pricing, promo, applyPromo, removePromo, totals } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const { shipping, tax, discount, total } = totals;

  const onApply = async () => {
    if (!code.trim()) return;
    setApplying(true);
    try {
      const p = await applyPromo(code);
      toast({ title: "Promo applied", description: p.type === "percent" ? `${p.value}% off with ${p.code}` : `$${p.value.toFixed(2)} off with ${p.code}` });
      setCode("");
    } catch (err) {
      toast({ title: "Invalid code", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setApplying(false); }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-24 text-center">
        <span className="inline-grid place-items-center h-20 w-20 rounded-full bg-neutral-100 mb-6">
          <ShoppingBag className="h-9 w-9 text-neutral-400" />
        </span>
        <h1 className="font-heading text-3xl font-700 mb-2">Your cart is empty</h1>
        <p className="text-neutral-500 mb-8">Looks like you haven't added anything yet.</p>
        <Link to="/shop" className="inline-flex items-center gap-2 px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors">
          Start Shopping <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-8">
      <h1 className="font-heading text-3xl sm:text-4xl font-700 uppercase tracking-tight mb-8">Shopping Cart</h1>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div>
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            {items.map((it) => (
              <div key={it.id} data-testid={`cart-line-${it.id}`} className="flex gap-4 p-4 border-b last:border-b-0">
                <Link to={`/shop/${it.slug}`} className="h-24 w-24 shrink-0 bg-neutral-50 rounded-lg overflow-hidden grid place-items-center p-2">
                  <img src={imgUrl(it.image)} alt={it.name} className="max-h-full max-w-full object-contain" />
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">{it.category}</p>
                  <Link to={`/shop/${it.slug}`} className="block text-sm font-medium text-neutral-800 line-clamp-2 hover:text-emerald-600">{it.name}</Link>
                  <p className="font-heading text-lg mt-1">${it.price.toFixed(2)}</p>
                </div>
                <div className="flex flex-col items-end justify-between">
                  <button onClick={() => removeItem(it.id)} data-testid={`cart-remove-${it.id}`} aria-label="Remove item" className="text-neutral-400 hover:text-red-500 transition-colors"><Trash2 className="h-5 w-5" /></button>
                  <div className="flex items-center border border-neutral-300 rounded-full">
                    <button onClick={() => updateQty(it.id, it.qty - 1)} className="h-8 w-8 grid place-items-center hover:text-emerald-600"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-8 text-center text-sm font-semibold">{it.qty}</span>
                    <button onClick={() => updateQty(it.id, it.qty + 1)} className="h-8 w-8 grid place-items-center hover:text-emerald-600"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4">
            <Link to="/shop" className="text-sm font-bold text-emerald-600 hover:underline">← Continue Shopping</Link>
            <button onClick={clearCart} className="text-sm font-bold text-neutral-500 hover:text-red-500">Clear Cart</button>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-[180px] h-fit">
          <div className="border border-neutral-200 rounded-xl p-6">
            <h2 className="font-heading text-xl uppercase tracking-wide mb-5">Order Summary</h2>
            {promo ? (
              <div data-testid="promo-applied" className="flex items-center justify-between gap-2 mb-5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-emerald-800"><Tag className="h-4 w-4" /> <span className="font-bold">{promo.code}</span> applied · {promo.type === "percent" ? `${promo.value}% off` : `$${promo.value.toFixed(2)} off`}</span>
                <button onClick={removePromo} data-testid="promo-remove" className="text-xs font-bold text-neutral-500 hover:text-red-500">Remove</button>
              </div>
            ) : (
              <div className="flex gap-2 mb-5">
                <div className="flex-1 flex items-center border border-neutral-300 rounded-lg px-3">
                  <Tag className="h-4 w-4 text-neutral-400" />
                  <input data-testid="promo-input" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onApply()} placeholder="Promo code" className="flex-1 px-2 py-2.5 text-sm outline-none uppercase" />
                </div>
                <button onClick={onApply} disabled={applying} data-testid="promo-apply" className="px-4 bg-neutral-900 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-60">{applying ? "..." : "Apply"}</button>
              </div>
            )}
            <div className="space-y-3 text-sm border-t pt-4">
              <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span className="font-semibold">${subtotal.toFixed(2)}</span></div>
              {discount > 0 && (<div className="flex justify-between text-emerald-600" data-testid="cart-discount"><span>Discount ({promo.code})</span><span className="font-semibold">-${discount.toFixed(2)}</span></div>)}
              <div className="flex justify-between"><span className="text-neutral-500">Delivery</span><span className="font-semibold">{shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}</span></div>
              <div className="flex justify-between" data-testid="cart-tax"><span className="text-neutral-500">{pricing.taxLabel}</span><span className="font-semibold">${tax.toFixed(2)}</span></div>
              {subtotal < pricing.freeDeliveryMin && (<p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Add ${(pricing.freeDeliveryMin - subtotal).toFixed(2)} more for FREE delivery!</p>)}
            </div>
            <div className="flex justify-between items-center border-t mt-4 pt-4">
              <span className="font-heading text-lg uppercase">Total</span>
              <span className="font-heading text-2xl">${total.toFixed(2)}</span>
            </div>
            <button onClick={() => navigate("/checkout")} className="w-full mt-5 py-3.5 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
              Proceed to Checkout <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-center text-xs text-neutral-400 mt-3">Secure checkout · 21+ verification required</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;

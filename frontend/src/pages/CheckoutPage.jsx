import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CreditCard, Lock, ChevronRight, ShieldCheck } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";
import { usStates } from "../mock";
import api from "../api";

const CheckoutPage = () => {
  const { items, subtotal, clearCart, toServerItem } = useCart();
  const { user } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [discount] = useState(0);

  const shipping = subtotal >= 75 || subtotal === 0 ? 0 : 7.99;
  const total = subtotal + shipping - discount;

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", city: "", state: "", zip: "",
  });
  const [card, setCard] = useState({ number: "", name: "", expiry: "", cvc: "" });

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        firstName: user.firstName || "", lastName: user.lastName || "",
        email: user.email || "", phone: user.phone || "",
        address: user.address || "", city: user.city || "",
        state: user.state || "", zip: user.zip || "",
      }));
    }
  }, [user]);

  useEffect(() => {
    if (items.length === 0 && !placed) navigate("/cart");
  }, [items.length, navigate, placed]);

  const fmtCard = (v) => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const fmtExp = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    const digits = card.number.replace(/\s/g, "");
    if (digits.length < 15) {
      toast({ title: "Invalid card", description: "Enter a valid card number (try 4242...)", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/orders", {
        items: items.map(toServerItem),
        shipping: form,
        subtotal,
        shippingCost: shipping,
        discount,
        total,
        paymentLast4: digits.slice(-4),
      });
      setPlaced(true);
      clearCart();
      toast({ title: "Order placed!", description: `Order ${data.orderNumber} confirmed.` });
      navigate(`/order/${data.id}`);
    } catch (err) {
      toast({ title: "Checkout failed", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const inputCls = "w-full border border-neutral-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-8">
      <nav className="flex items-center gap-1.5 text-xs text-neutral-500 mb-4">
        <Link to="/" className="hover:text-emerald-600">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/cart" className="hover:text-emerald-600">Cart</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-neutral-800 font-medium">Checkout</span>
      </nav>
      <h1 className="font-heading text-3xl sm:text-4xl font-700 uppercase tracking-tight mb-8">Checkout</h1>

      <form onSubmit={placeOrder} className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        <div className="space-y-8">
          {/* Shipping */}
          <section>
            <h2 className="font-heading text-xl uppercase tracking-wide mb-4">Delivery Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1.5">First Name *</label><input required className={inputCls} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">Last Name *</label><input required className={inputCls} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">Email *</label><input required type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">Phone *</label><input required className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Street Address *</label><input required className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">City *</label><input required className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">State *</label><select required className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}><option value="">Select...</option>{usStates.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
              <div><label className="block text-sm font-medium mb-1.5">ZIP *</label><input required className={inputCls} value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
            </div>
          </section>

          {/* Payment */}
          <section>
            <h2 className="font-heading text-xl uppercase tracking-wide mb-1 flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600" /> Payment</h2>
            <p className="text-xs text-neutral-500 mb-4">Demo checkout — use test card <span className="font-semibold">4242 4242 4242 4242</span>. No real charge.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Card Number *</label><input required inputMode="numeric" placeholder="4242 4242 4242 4242" className={inputCls} value={card.number} onChange={(e) => setCard({ ...card, number: fmtCard(e.target.value) })} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Name on Card *</label><input required className={inputCls} value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">Expiry *</label><input required placeholder="MM/YY" className={inputCls} value={card.expiry} onChange={(e) => setCard({ ...card, expiry: fmtExp(e.target.value) })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">CVC *</label><input required inputMode="numeric" placeholder="123" className={inputCls} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
            </div>
            <p className="flex items-center gap-2 text-xs text-neutral-400 mt-3"><Lock className="h-3.5 w-3.5" /> Your payment info is encrypted &amp; secure.</p>
          </section>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-[180px] h-fit">
          <div className="border border-neutral-200 rounded-xl p-6">
            <h2 className="font-heading text-xl uppercase tracking-wide mb-4">Your Order</h2>
            <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-neutral-50 rounded-lg overflow-hidden grid place-items-center p-1 shrink-0"><img src={it.image} alt={it.name} className="max-h-full max-w-full object-contain" /></div>
                  <p className="flex-1 text-xs text-neutral-700 line-clamp-2">{it.name}</p>
                  <span className="text-xs font-semibold">{it.qty}× ${it.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm border-t pt-4">
              <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span className="font-semibold">${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Shipping</span><span className="font-semibold">{shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}</span></div>
            </div>
            <div className="flex justify-between items-center border-t mt-4 pt-4">
              <span className="font-heading text-lg uppercase">Total</span>
              <span className="font-heading text-2xl">${total.toFixed(2)}</span>
            </div>
            <button disabled={busy} className="w-full mt-5 py-3.5 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              <ShieldCheck className="h-5 w-5" /> {busy ? "Processing..." : `Pay $${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CheckoutPage;

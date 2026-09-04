import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CreditCard, Lock, ChevronRight, ShieldCheck, MapPin, CheckCircle2, XCircle } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";
import { usStates } from "../mock";
import api, { imgUrl } from "../api";
import { ecommerce } from "../seo/Analytics";
import PaymentMethodPicker, { enabledMethods } from "../components/checkout/PaymentMethodPicker";
import SquarePayment from "../components/checkout/SquarePayment";
import PayPalCheckout from "../components/checkout/PayPalCheckout";
import ZelleInstructions from "../components/checkout/ZelleInstructions";

const CheckoutPage = () => {
  const { items, subtotal, clearCart, toServerItem, pricing, delivery, promo, totals } = useCart();
  const { user } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(false);

  const { shipping, tax, discount, total } = totals;

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", city: "", state: "", zip: "",
  });
  const [card, setCard] = useState({ number: "", name: "", expiry: "", cvc: "" });
  const [payConfig, setPayConfig] = useState(null);
  const [method, setMethod] = useState("");
  const [zone, setZone] = useState(null);
  const formRef = useRef(null);
  const tokenizeRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const zoneRef = useRef(zone);
  zoneRef.current = zone;

  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || !itemsRef.current.length) return;
    checkoutTracked.current = true;
    ecommerce.beginCheckout(itemsRef.current.map((i) => ({ ...i, unitPrice: i.price })), totals.total, promo?.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const zip = form.zip.replace(/\D/g, "");
    if (zip.length !== 5) { setZone(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api.get("/delivery/check", { params: { zip } }).then(({ data }) => { if (live) setZone(data); }).catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [form.zip]);

  useEffect(() => {
    api.get("/payments/config").then(({ data }) => {
      setPayConfig(data);
      setMethod((m) => m || enabledMethods(data)[0] || "");
    }).catch(() => setPayConfig({}));
  }, []);

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

  const submitOrder = useCallback(async (extra) => {
    setBusy(true);
    try {
      const { data } = await api.post("/orders", { items: itemsRef.current.map(toServerItem), shipping: form, paymentMethod: method, promoCode: promo?.code || "", ...extra });
      ecommerce.purchase(data);
      setPlaced(true);
      clearCart();
      toast({ title: data.paymentStatus === "awaiting_payment" ? "Order placed — awaiting payment" : "Order placed!", description: `Order ${data.orderNumber}${data.paymentStatus === "awaiting_payment" ? ". Send your Zelle payment to complete it." : " confirmed."}` });
      navigate(`/order/${data.id}`);
      return data;
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      toast({ title: status === 409 ? "Stock changed" : status === 402 ? "Payment declined" : "Checkout failed", description: typeof detail === "string" ? detail : "Try again", variant: "destructive" });
      throw err;
    } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, method, promo, toServerItem, clearCart, navigate, toast]);

  const validateShipping = () => {
    if (!formRef.current?.reportValidity()) {
      toast({ title: "Missing delivery details", description: "Please fill in all delivery fields first.", variant: "destructive" });
      return false;
    }
    if (!zoneRef.current?.eligible) {
      toast({ title: "Outside delivery area", description: zoneRef.current?.message || `Sorry, we only deliver within ${delivery.radiusMiles} miles of ${delivery.zip}.`, variant: "destructive" });
      return false;
    }
    return true;
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    if (!validateShipping()) return;
    if (method === "test_card") {
      const digits = card.number.replace(/\s/g, "");
      if (digits.length < 15) return toast({ title: "Invalid card", description: "Enter a valid card number (try 4242...)", variant: "destructive" });
      return submitOrder({ paymentLast4: digits.slice(-4) }).catch(() => {});
    }
    if (method === "zelle") return submitOrder({}).catch(() => {});
    if (method === "square") {
      if (!tokenizeRef.current) return toast({ title: "Card form not ready", description: "Please wait a moment and try again.", variant: "destructive" });
      setBusy(true);
      try {
        const token = await tokenizeRef.current();
        await submitOrder({ paymentToken: token });
      } catch (err) {
        if (!err?.response) toast({ title: "Card error", description: err.message, variant: "destructive" });
        setBusy(false);
      }
    }
  };

  const paypalCreate = async () => {
    const { data } = await api.post("/payments/paypal/create-order", { items: itemsRef.current.map(toServerItem), promoCode: promo?.code || "", zip: form.zip });
    return data.id;
  };

  const payError = (msg) => toast({ title: "Payment problem", description: msg, variant: "destructive" });
  const methods = payConfig ? enabledMethods(payConfig) : [];
  const buttonDriven = method === "paypal" || method === "cash_app";
  const outOfZone = Boolean(zone && !zone.eligible);

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

      <form ref={formRef} onSubmit={placeOrder} className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        <div className="space-y-8">
          {/* Shipping */}
          <section>
            <h2 className="font-heading text-xl uppercase tracking-wide mb-4">Delivery Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1.5">First Name *</label><input required data-testid="checkout-firstName" className={inputCls} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">Last Name *</label><input required data-testid="checkout-lastName" className={inputCls} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">Email *</label><input required data-testid="checkout-email" type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">Phone *</label><input required data-testid="checkout-phone" className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Street Address *</label><input required data-testid="checkout-address" className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">City *</label><input required data-testid="checkout-city" className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><label className="block text-sm font-medium mb-1.5">State *</label><select required data-testid="checkout-state" className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}><option value="">Select...</option>{usStates.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
              <div><label className="block text-sm font-medium mb-1.5">ZIP *</label><input required data-testid="checkout-zip" inputMode="numeric" className={`${inputCls} ${outOfZone ? "border-red-400" : zone?.eligible ? "border-emerald-500" : ""}`} value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value.replace(/\D/g, "").slice(0, 5) })} /></div>
            </div>
            <p className="mt-3 text-xs text-neutral-500 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-emerald-600" /> We deliver within {delivery.radiusMiles} miles of {delivery.zip} only.</p>
            {zone && (
              <div data-testid="checkout-zone-status" className={`mt-2 flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${zone.eligible ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {zone.eligible ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{zone.message}</span>
              </div>
            )}
          </section>

          {/* Payment */}
          <section>
            <h2 className="font-heading text-xl uppercase tracking-wide mb-1 flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600" /> Payment</h2>
            <p className="text-xs text-neutral-500 mb-4">Choose how you'd like to pay.</p>
            {outOfZone ? (
              <p data-testid="payment-blocked" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">Sorry, we only deliver within {delivery.radiusMiles} miles of {delivery.zip}. Enter an eligible ZIP code to continue to payment.</p>
            ) : !payConfig ? (
              <p className="text-sm text-neutral-500">Loading payment options...</p>
            ) : methods.length === 0 ? (
              <p className="text-sm text-red-500">No payment methods are available right now. Please contact us.</p>
            ) : (
              <>
                <PaymentMethodPicker methods={methods} value={method} onChange={(m) => { setMethod(m); ecommerce.addPaymentInfo(m, totals.total); }} />
                <div className="mt-5" data-testid="payment-panel">
                  {method === "square" && (
                    <SquarePayment key="square" config={payConfig.square} mode="square" total={total} onReady={(fn) => { tokenizeRef.current = fn; }} onError={payError} />
                  )}
                  {method === "cash_app" && (
                    <div>
                      <SquarePayment key="cash_app" config={payConfig.square} mode="cash_app" total={total} onReady={() => {}} onError={payError}
                        onCashAppToken={(token) => { if (validateShipping()) submitOrder({ paymentToken: token }).catch(() => {}); }} />
                    </div>
                  )}
                  {method === "paypal" && (
                    <PayPalCheckout config={payConfig.paypal} validate={validateShipping} createOrder={paypalCreate} onError={payError}
                      onApprove={(paypalOrderId) => submitOrder({ paypalOrderId }).catch(() => {})} />
                  )}
                  {method === "zelle" && <ZelleInstructions recipient={payConfig.zelle.email} name={payConfig.zelle.name} amount={total} />}
                  {method === "test_card" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="test-card-form">
                      <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Card Number *</label><input required data-testid="checkout-card-number" inputMode="numeric" placeholder="4242 4242 4242 4242" className={inputCls} value={card.number} onChange={(e) => setCard({ ...card, number: fmtCard(e.target.value) })} /></div>
                      <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Name on Card *</label><input required data-testid="checkout-card-name" className={inputCls} value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></div>
                      <div><label className="block text-sm font-medium mb-1.5">Expiry *</label><input required data-testid="checkout-card-expiry" placeholder="MM/YY" className={inputCls} value={card.expiry} onChange={(e) => setCard({ ...card, expiry: fmtExp(e.target.value) })} /></div>
                      <div><label className="block text-sm font-medium mb-1.5">CVC *</label><input required data-testid="checkout-card-cvc" inputMode="numeric" placeholder="123" className={inputCls} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
                    </div>
                  )}
                </div>
              </>
            )}
            <p className="flex items-center gap-2 text-xs text-neutral-400 mt-4"><Lock className="h-3.5 w-3.5" /> Your payment info is encrypted &amp; never stored on our servers.</p>
          </section>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-[180px] h-fit">
          <div className="border border-neutral-200 rounded-xl p-6">
            <h2 className="font-heading text-xl uppercase tracking-wide mb-4">Your Order</h2>
            <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-neutral-50 rounded-lg overflow-hidden grid place-items-center p-1 shrink-0"><img src={imgUrl(it.image)} alt={it.name} className="max-h-full max-w-full object-contain" /></div>
                  <p className="flex-1 text-xs text-neutral-700 line-clamp-2">{it.name}</p>
                  <span className="text-xs font-semibold">{it.qty}× ${it.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm border-t pt-4">
              <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span className="font-semibold">${subtotal.toFixed(2)}</span></div>
              {discount > 0 && <div className="flex justify-between text-emerald-600" data-testid="checkout-discount"><span>Discount ({promo.code})</span><span className="font-semibold">-${discount.toFixed(2)}</span></div>}
              <div className="flex justify-between"><span className="text-neutral-500">Delivery</span><span className="font-semibold">{shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}</span></div>
              <div className="flex justify-between" data-testid="checkout-tax"><span className="text-neutral-500">{pricing.taxLabel}</span><span className="font-semibold">${tax.toFixed(2)}</span></div>
            </div>
            <div className="flex justify-between items-center border-t mt-4 pt-4">
              <span className="font-heading text-lg uppercase">Total</span>
              <span className="font-heading text-2xl">${total.toFixed(2)}</span>
            </div>
            {outOfZone ? (
              <p data-testid="checkout-submit-blocked" className="mt-5 text-center text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full py-3 px-4">Outside our {delivery.radiusMiles}-mile delivery area</p>
            ) : buttonDriven ? (
              <p data-testid="checkout-button-hint" className="mt-5 text-center text-xs text-neutral-500 border border-dashed rounded-full py-3 px-4">Complete your payment with the {method === "paypal" ? "PayPal" : "Cash App Pay"} button in the Payment section.</p>
            ) : (
              <button disabled={busy || !method || outOfZone} data-testid="checkout-submit" className="w-full mt-5 py-3.5 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                <ShieldCheck className="h-5 w-5" /> {busy ? "Processing..." : method === "zelle" ? "Place Order — Pay via Zelle" : `Pay $${total.toFixed(2)}`}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default CheckoutPage;

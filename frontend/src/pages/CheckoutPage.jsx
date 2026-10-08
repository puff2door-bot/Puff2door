import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CreditCard, Lock, ChevronRight, ShieldCheck, MapPin, CheckCircle2, XCircle, Heart, Clock3, RefreshCw } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useApp } from "../context/AppContext";
import { useCatalog } from "../context/CatalogContext";
import { useToast } from "../hooks/use-toast";
import { usStates } from "../mock";
import api, { imgUrl } from "../api";
import { ecommerce } from "../seo/Analytics";
import PaymentMethodPicker, { enabledMethods } from "../components/checkout/PaymentMethodPicker";
import SquarePayment from "../components/checkout/SquarePayment";
import PayPalCheckout from "../components/checkout/PayPalCheckout";
import ApplePayCheckout from "../components/checkout/ApplePayCheckout";
import ZelleInstructions from "../components/checkout/ZelleInstructions";
import RewardsPanel from "../components/checkout/RewardsPanel";
import DeliveryCountdown, { useDeliveryWindow } from "../components/DeliveryCountdown";

const CheckoutPage = () => {
  const { items, subtotal, clearCart, removeItem, toServerItem, pricing, delivery, promo, totals, redeemPoints } = useCart();
  const { user } = useApp();
  const { products, getProductById, refresh: refreshCatalog } = useCatalog();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(false);

  const { shipping, tax, discount, reward, total: totalBeforeTip } = totals;
  const [tipChoice, setTipChoice] = useState("none");
  const [customTip, setCustomTip] = useState("");
  const tipBase = Math.max(subtotal - discount - reward, 0);
  const tip = tipChoice === "custom"
    ? Math.min(Math.max(Math.round((Number(customTip) || 0) * 100) / 100, 0), 500)
    : tipChoice === "none" ? 0 : Math.round(tipBase * Number(tipChoice)) / 100;
  const total = Math.round((totalBeforeTip + tip) * 100) / 100;
  const redeemRef = useRef(redeemPoints);
  redeemRef.current = redeemPoints;
  const { window: deliveryWin } = useDeliveryWindow();
  const [deliveryWindowId, setDeliveryWindowId] = useState("");
  const sameDayRef = useRef(false);
  const chosenDeliveryWindow = deliveryWin?.availableWindows?.find((w) => w.id === deliveryWindowId);
  sameDayRef.current = Boolean(chosenDeliveryWindow?.sameDay);

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", city: "", state: "", zip: "", dateOfBirth: "",
  });
  const [card, setCard] = useState({ number: "", name: "", expiry: "", cvc: "" });
  const [payConfig, setPayConfig] = useState(null);
  const [method, setMethod] = useState("");
  const [paymentError, setPaymentError] = useState("");
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
    const windows = deliveryWin?.availableWindows || [];
    if (windows.length && !windows.some((w) => w.id === deliveryWindowId)) setDeliveryWindowId(windows[0].id);
  }, [deliveryWin, deliveryWindowId]);

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
      setPaymentError("");
      const { data } = await api.post("/orders", { items: itemsRef.current.map(toServerItem), shipping: form, dateOfBirth: form.dateOfBirth, deliveryWindowId, paymentMethod: method, promoCode: promo?.code || "", redeemPoints: user ? redeemRef.current : 0, tip, expectSameDay: sameDayRef.current, ...extra });
      ecommerce.purchase(data);
      setPlaced(true);
      clearCart();
      const earned = data.pointsEarned ? ` You earned ${data.pointsEarned} rewards points.` : "";
      toast({ title: data.paymentStatus === "awaiting_payment" ? "Order placed — awaiting payment" : "Order placed!", description: `Order ${data.orderNumber}${data.paymentStatus === "awaiting_payment" ? ". Send your Zelle payment to complete it." : " confirmed."}${earned}` });
      navigate(`/order/${data.id}`);
      return data;
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409) refreshCatalog();
      const title = status === 409 ? (String(detail || "").includes("delivery") ? "Delivery window changed" : String(detail || "").includes("PayPal") ? "Payment in progress" : "Stock changed") : status === 402 ? "Payment declined" : "Checkout failed";
      const message = typeof detail === "string" ? detail : "Try again or choose another payment method.";
      setPaymentError(message);
      toast({ title, description: message, variant: "destructive" });
      throw err;
    } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, deliveryWindowId, method, promo, tip, toServerItem, clearCart, navigate, toast, user]);

  const validateShipping = () => {
    if (!formRef.current?.reportValidity()) {
      toast({ title: "Missing delivery details", description: "Please fill in all delivery fields first.", variant: "destructive" });
      return false;
    }
    if (!zoneRef.current?.eligible) {
      toast({ title: "Outside delivery area", description: zoneRef.current?.message || `Sorry, we only deliver within ${delivery.radiusMiles} miles of ${delivery.zip}.`, variant: "destructive" });
      return false;
    }
    if (!deliveryWindowId) {
      toast({ title: "Choose a delivery time", description: "Select one of the available delivery windows.", variant: "destructive" });
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

  const stockIssues = products.length ? items.flatMap((it) => {
    const p = getProductById(it.id);
    if (!p || !p.inStock || p.stock <= 0) return [{ id: it.id, message: `${it.name} is sold out.` }];
    if (it.qty > p.stock) return [{ id: it.id, message: `Only ${p.stock} left of ${it.name} (you have ${it.qty}).` }];
    return [];
  }) : [];

  const paypalCreate = async () => {
    if (stockIssues.length) throw new Error(stockIssues.map((s) => s.message).join(" "));
    try {
      const { data } = await api.post("/payments/paypal/create-order", { items: itemsRef.current.map(toServerItem), promoCode: promo?.code || "", zip: form.zip, redeemPoints: user ? redeemRef.current : 0, tip, dateOfBirth: form.dateOfBirth, deliveryWindowId });
      return data.id;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 409) refreshCatalog();
      throw new Error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => d.msg).join(", ") : "Could not start PayPal checkout. Please try again.");
    }
  };

  const payError = (msg) => {
    const message = typeof msg === "string" && msg ? msg : "Please try again or choose another payment method.";
    setPaymentError(message);
    toast({ title: "Payment problem", description: message, variant: "destructive" });
  };
  const methods = payConfig ? enabledMethods(payConfig) : [];
  const buttonDriven = method === "paypal" || method === "apple_pay" || method === "cash_app";
  const outOfZone = Boolean(zone && !zone.eligible);
  const blocked = outOfZone || stockIssues.length > 0;

  const inputCls = "w-full border border-neutral-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";
  const maxDob = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 21); return d.toISOString().slice(0, 10); })();
  const acceptedLabels = methods.map((m) => ({ square: "debit/credit card", cash_app: "Cash App Pay", paypal: "PayPal or debit/credit card", apple_pay: "Apple Pay", zelle: "Zelle", test_card: "test card" }[m])).filter(Boolean);

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
              <div><label className="block text-sm font-medium mb-1.5">Date of Birth *</label><input required type="date" max={maxDob} data-testid="checkout-dob" className={inputCls} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></div>
            </div>
            <p className="mt-3 text-xs text-neutral-600 flex items-start gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" /> You must be 21+. A valid government-issued photo ID is checked at the door, and orders cannot be left with anyone under 21.</p>
            <p className="mt-3 text-xs text-neutral-500 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-emerald-600" /> We deliver within {delivery.radiusMiles} miles of {delivery.zip} only.</p>
            {zone && (
              <div data-testid="checkout-zone-status" className={`mt-2 flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${zone.eligible ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {zone.eligible ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{zone.message}</span>
              </div>
            )}
            {zone?.eligible && <DeliveryCountdown variant="inline" />}
            {zone?.eligible && (
              <div className="mt-4" data-testid="checkout-delivery-windows">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Clock3 className="h-4 w-4 text-emerald-600" /> Choose a delivery window *</h3>
                {(deliveryWin?.availableWindows || []).length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {deliveryWin.availableWindows.map((w) => (
                      <button key={w.id} type="button" data-testid={`delivery-window-${w.id}`} aria-pressed={deliveryWindowId === w.id} onClick={() => setDeliveryWindowId(w.id)} className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-colors ${deliveryWindowId === w.id ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-neutral-300 hover:border-emerald-500"}`}>{w.label}</button>
                    ))}
                  </div>
                ) : <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">No delivery windows are currently available. Please contact us.</p>}
              </div>
            )}
          </section>

          <RewardsPanel />

          {/* Driver tip */}
          <section className="border border-neutral-200 rounded-xl p-5" data-testid="checkout-tip-section">
            <h2 className="font-heading text-xl uppercase tracking-wide mb-1 flex items-center gap-2"><Heart className="h-5 w-5 text-emerald-600" /> Tip Your Driver</h2>
            <p className="text-xs text-neutral-500 mb-4">100% of your tip goes to your delivery driver.</p>
            <div className="grid grid-cols-4 gap-2">
              {[10, 15, 20].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  data-testid={`checkout-tip-${percent}`}
                  aria-pressed={tipChoice === String(percent)}
                  onClick={() => { setTipChoice(String(percent)); setCustomTip(""); }}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${tipChoice === String(percent) ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-300 hover:border-emerald-600"}`}
                >
                  {percent}%
                </button>
              ))}
              <button
                type="button"
                data-testid="checkout-tip-none"
                aria-pressed={tipChoice === "none"}
                onClick={() => { setTipChoice("none"); setCustomTip(""); }}
                className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${tipChoice === "none" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-900"}`}
              >
                No tip
              </button>
            </div>
            <div className="mt-3">
              <label htmlFor="checkout-custom-tip" className="block text-xs font-bold text-neutral-600 mb-1.5">Custom tip</label>
              <div className={`flex items-center rounded-lg border px-3 transition-colors ${tipChoice === "custom" ? "border-emerald-600" : "border-neutral-300"}`}>
                <span className="text-neutral-500 font-semibold">$</span>
                <input
                  id="checkout-custom-tip"
                  type="number"
                  min="0"
                  max="500"
                  step="0.01"
                  inputMode="decimal"
                  data-testid="checkout-tip-custom"
                  placeholder="Enter amount"
                  value={customTip}
                  onFocus={() => setTipChoice("custom")}
                  onChange={(e) => { setTipChoice("custom"); setCustomTip(e.target.value); }}
                  className="w-full px-2 py-2.5 text-sm outline-none"
                />
              </div>
            </div>
            {tip > 0 && <p className="mt-3 text-sm font-semibold text-emerald-700" data-testid="checkout-tip-selected">Tip: ${tip.toFixed(2)}</p>}
          </section>

          {/* Payment */}
          <section>
            <h2 className="font-heading text-xl uppercase tracking-wide mb-1 flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600" /> Payment</h2>
            <p className="text-xs text-neutral-500 mb-1">Choose how you'd like to pay.</p>
            {acceptedLabels.length > 0 && <p className="text-xs font-semibold text-neutral-700 mb-4" data-testid="accepted-payments">Accepted now: {acceptedLabels.join(", ")}.</p>}
            {paymentError && (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="payment-retry">
                <span><b>Payment wasn’t completed.</b> {paymentError} Your cart is still saved.</span>
                <button type="button" onClick={() => setPaymentError("")} className="shrink-0 inline-flex items-center gap-1 font-bold underline"><RefreshCw className="h-3.5 w-3.5" /> Retry or switch method</button>
              </div>
            )}
            {outOfZone ? (
              <p data-testid="payment-blocked" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">Sorry, we only deliver within {delivery.radiusMiles} miles of {delivery.zip}. Enter an eligible ZIP code to continue to payment.</p>
            ) : stockIssues.length > 0 ? (
              <div data-testid="stock-blocked" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="font-bold mb-1">Some items in your cart are no longer available:</p>
                <ul className="list-disc pl-5 space-y-0.5">{stockIssues.map((s) => <li key={s.id} data-testid={`stock-issue-${s.id}`}>{s.message}</li>)}</ul>
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link to="/cart" data-testid="stock-fix-cart" className="font-bold underline">Update your cart</Link>
                  <button type="button" data-testid="stock-remove-all" onClick={() => stockIssues.forEach((s) => removeItem(s.id))} className="font-bold underline">Remove unavailable items</button>
                </div>
              </div>
            ) : !payConfig ? (
              <p className="text-sm text-neutral-500">Loading payment options...</p>
            ) : methods.length === 0 ? (
              <p className="text-sm text-red-500">No payment methods are available right now. Please contact us.</p>
            ) : (
              <>
                <PaymentMethodPicker methods={methods} value={method} onChange={(m) => { setPaymentError(""); setMethod(m); ecommerce.addPaymentInfo(m, total); }} />
                <div className="mt-5" data-testid="payment-panel">
                  {method === "square" && (
                    <SquarePayment key="square" config={payConfig.square} mode="square" total={total} onReady={(fn) => { tokenizeRef.current = fn; }} onError={payError} />
                  )}
                  {method === "cash_app" && (
                    <div>
                      <SquarePayment key={`cash_app-${total.toFixed(2)}`} config={payConfig.square} mode="cash_app" total={total} onReady={() => {}} onError={payError}
                        onCashAppToken={(token) => { if (validateShipping()) submitOrder({ paymentToken: token }).catch(() => {}); }} />
                    </div>
                  )}
                  {method === "paypal" && (
                    <PayPalCheckout config={payConfig.paypal} validate={validateShipping} createOrder={paypalCreate} onError={payError}
                      onCancel={() => { setPaymentError("PayPal was cancelled. You were not charged. Retry or choose another payment method."); toast({ title: "PayPal cancelled", description: "You were not charged. Choose a payment method to try again." }); }}
                      onApprove={(paypalOrderId) => submitOrder({ paypalOrderId }).catch(() => {})} />
                  )}
                  {method === "apple_pay" && (
                    <ApplePayCheckout config={payConfig.applePay} total={total} validate={validateShipping} createOrder={paypalCreate} onError={payError}
                      onCancel={() => { setPaymentError("Apple Pay was cancelled. You were not charged. Retry or choose another payment method."); toast({ title: "Apple Pay cancelled", description: "You were not charged. Choose a payment method to try again." }); }}
                      onApprove={(paypalOrderId) => submitOrder({ paypalOrderId })} />
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
              {reward > 0 && <div className="flex justify-between text-emerald-600" data-testid="checkout-reward"><span>Rewards ({redeemPoints.toLocaleString()} pts)</span><span className="font-semibold">-${reward.toFixed(2)}</span></div>}
              <div className="flex justify-between"><span className="text-neutral-500">Delivery</span><span className="font-semibold">{shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}</span></div>
              <div className="flex justify-between" data-testid="checkout-tax"><span className="text-neutral-500">{pricing.taxLabel}</span><span className="font-semibold">${tax.toFixed(2)}</span></div>
              {tip > 0 && <div className="flex justify-between" data-testid="checkout-tip"><span className="text-neutral-500">Driver tip</span><span className="font-semibold">${tip.toFixed(2)}</span></div>}
            </div>
            <div className="flex justify-between items-center border-t mt-4 pt-4">
              <span className="font-heading text-lg uppercase">Total</span>
              <span className="font-heading text-2xl">${total.toFixed(2)}</span>
            </div>
            {outOfZone ? (
              <p data-testid="checkout-submit-blocked" className="mt-5 text-center text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full py-3 px-4">Outside our {delivery.radiusMiles}-mile delivery area</p>
            ) : stockIssues.length > 0 ? (
              <p data-testid="checkout-submit-stock-blocked" className="mt-5 text-center text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full py-3 px-4">Update your cart to continue — some items are unavailable</p>
            ) : buttonDriven ? (
              <p data-testid="checkout-button-hint" className="mt-5 text-center text-xs text-neutral-500 border border-dashed rounded-full py-3 px-4">Complete your payment with the {method === "paypal" ? "PayPal" : method === "apple_pay" ? "Apple Pay" : "Cash App Pay"} button in the Payment section.</p>
            ) : (
              <button disabled={busy || !method || blocked} data-testid="checkout-submit" className="w-full mt-5 py-3.5 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
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

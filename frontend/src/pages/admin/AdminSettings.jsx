import React, { useEffect, useState } from "react";
import { Save, Percent, Truck, Gift, MapPin, Radius } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";

const Field = ({ icon: Icon, label, hint, children }) => (
  <div className="border border-neutral-200 rounded-2xl p-5">
    <div className="flex items-center gap-2 mb-1"><Icon className="h-4 w-4 text-emerald-600" /><label className="text-sm font-bold text-neutral-900">{label}</label></div>
    <p className="text-xs text-neutral-500 mb-3">{hint}</p>
    {children}
  </div>
);

const AdminSettings = () => {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const toForm = (data) => ({ taxPercent: +(data.taxRate * 100).toFixed(3), deliveryFee: data.deliveryFee, freeDeliveryMin: data.freeDeliveryMin, deliveryZip: data.deliveryZip || "32832", deliveryRadiusMiles: data.deliveryRadiusMiles ?? 20 });

  useEffect(() => {
    api.get("/admin/settings").then(({ data }) => setF(toForm(data)));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/admin/settings", { taxRate: Number(f.taxPercent) / 100, deliveryFee: Number(f.deliveryFee), freeDeliveryMin: Number(f.freeDeliveryMin), deliveryZip: f.deliveryZip, deliveryRadiusMiles: Number(f.deliveryRadiusMiles) });
      setF(toForm(data));
      toast({ title: "Settings saved", description: "New rates and delivery zone apply to all new carts and orders immediately." });
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast({ title: "Save failed", description: Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!f) return <p className="text-neutral-500">Loading settings...</p>;
  const example = 50;
  const exTax = Math.round(example * (Number(f.taxPercent) / 100) * 100) / 100;
  const exShip = example >= Number(f.freeDeliveryMin) ? 0 : Number(f.deliveryFee);

  return (
    <form onSubmit={save} data-testid="admin-settings">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-tight">Store Settings</h1>
          <p className="text-sm text-neutral-500">Tax and delivery rules used in the cart, checkout, emails and every payment method.</p>
        </div>
        <button disabled={busy} data-testid="settings-save" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700 disabled:opacity-60"><Save className="h-4 w-4" /> {busy ? "Saving..." : "Save Settings"}</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Field icon={Percent} label="Sales tax rate (%)" hint="Applied to items only, after any promo discount. Orlando / Orange County is 6.5%.">
          <input required type="number" min="0" max="50" step="0.001" data-testid="settings-tax" className={inputCls} value={f.taxPercent} onChange={(e) => setF({ ...f, taxPercent: e.target.value })} />
        </Field>
        <Field icon={Truck} label="Delivery fee ($)" hint="Charged when the cart subtotal is below the free-delivery minimum.">
          <input required type="number" min="0" step="0.01" data-testid="settings-delivery-fee" className={inputCls} value={f.deliveryFee} onChange={(e) => setF({ ...f, deliveryFee: e.target.value })} />
        </Field>
        <Field icon={Gift} label="Free delivery from ($)" hint="Carts at or above this subtotal get free delivery. Set 0 to always deliver free.">
          <input required type="number" min="0" step="0.01" data-testid="settings-free-min" className={inputCls} value={f.freeDeliveryMin} onChange={(e) => setF({ ...f, freeDeliveryMin: e.target.value })} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Field icon={MapPin} label="Delivery center ZIP" hint="Distances are measured from the center of this ZIP code (your store location).">
          <input required inputMode="numeric" pattern="\d{5}" data-testid="settings-delivery-zip" className={inputCls} value={f.deliveryZip} onChange={(e) => setF({ ...f, deliveryZip: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
        </Field>
        <Field icon={Radius} label="Delivery radius (miles)" hint="Orders with a delivery ZIP farther than this are blocked at checkout. Shown in the homepage banner.">
          <input required type="number" min="1" max="500" step="1" data-testid="settings-delivery-radius" className={inputCls} value={f.deliveryRadiusMiles} onChange={(e) => setF({ ...f, deliveryRadiusMiles: e.target.value })} />
        </Field>
      </div>

      <div className="border border-dashed border-neutral-300 rounded-2xl p-5 text-sm text-neutral-600" data-testid="settings-preview">
        <p className="font-bold text-neutral-900 mb-1">Preview for a ${example.toFixed(2)} cart</p>
        <p>Delivery {exShip === 0 ? "FREE" : `$${exShip.toFixed(2)}`} · Tax ${exTax.toFixed(2)} · <span className="font-bold text-neutral-900">Total ${(example + exShip + exTax).toFixed(2)}</span></p>
      </div>
    </form>
  );
};

export default AdminSettings;

import React, { useEffect, useState } from "react";
import { Save, Percent, Truck, Gift, MapPin, Radius, Clock, LayoutTemplate, Gauge, Plus, Trash2, Eye, EyeOff, Star, Store } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const toForm = (data) => ({ taxPercent: +(data.taxRate * 100).toFixed(3), deliveryFee: data.deliveryFee, freeDeliveryMin: data.freeDeliveryMin, deliveryZip: data.deliveryZip || "32714", deliveryRadiusMiles: data.deliveryRadiusMiles ?? 20, allowedZipCodes: (data.allowedZipCodes || []).join(", "),
    sameDayEnabled: data.sameDayEnabled ?? true, deliveryCutoff: data.deliveryCutoff || "20:00", deliveryStart: data.deliveryStart || "11:00", deliveryEnd: data.deliveryEnd || "21:00", deliveryDays: data.deliveryDays || [0, 1, 2, 3, 4, 5, 6], homepageLayout: data.homepageLayout || "classic",
    countdownVisible: data.countdownVisible ?? true, countdownHeadlineVisible: data.countdownHeadlineVisible ?? true, countdownHoursVisible: data.countdownHoursVisible ?? true,
    countdownOpenText: data.countdownOpenText ?? "Order within {countdown} for today's local delivery", countdownClosedText: data.countdownClosedText ?? "Today's delivery window has closed. Order now for the next available delivery day.",
    countdownClosedDayText: data.countdownClosedDayText ?? "No local delivery today. Order now for the next available delivery day ({next}).", countdownPausedText: data.countdownPausedText ?? "Local delivery is currently paused. Please check back soon.",
    countdownHoursText: data.countdownHoursText ?? "Same-day cutoff is {cutoff} ET. No deliveries after {end} or before {start}.", countdownExtraLines: data.countdownExtraLines || [],
    deliverySlotCapacity: data.deliverySlotCapacity ?? 8, deliveryDriverCount: data.deliveryDriverCount ?? 1, ordersPerDriverPerWindow: data.ordersPerDriverPerWindow ?? 8, defaultEtaMinutes: data.defaultEtaMinutes ?? 45,
    googleReviewUrl: data.googleReviewUrl || "", hideOutOfStock: data.hideOutOfStock ?? true, liveShelfEnabled: data.liveShelfEnabled ?? false,
    pickupEnabled: data.pickupEnabled ?? false, pickupAddress: data.pickupAddress || "481 N State Rd 434, Suite 1050, Altamonte Springs, FL 32714", pickupHoursText: data.pickupHoursText ?? "Pick up during store hours.",
    pickupReadyMinutes: data.pickupReadyMinutes ?? 15, pickupHoldDays: data.pickupHoldDays ?? 1, pickupInstructions: data.pickupInstructions ?? "Bring a valid, unexpired 21+ photo ID that matches the name on the order.",
    lakeNonaEnabled: data.lakeNonaEnabled ?? false, countdownStyle: data.countdownStyle || "chip", zipTaxRates: Object.entries(data.zipTaxRates || {}).map(([z, r]) => `${z}=${+(r * 100).toFixed(3)}`).join(", ") });

  useEffect(() => {
    api.get("/admin/settings").then(({ data }) => setF(toForm(data)));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/admin/settings", { taxRate: Number(f.taxPercent) / 100, deliveryFee: Number(f.deliveryFee), freeDeliveryMin: Number(f.freeDeliveryMin), deliveryZip: f.deliveryZip, deliveryRadiusMiles: Number(f.deliveryRadiusMiles), allowedZipCodes: f.allowedZipCodes.split(/[\s,]+/).map((z) => z.trim()).filter(Boolean),
        sameDayEnabled: Boolean(f.sameDayEnabled), deliveryCutoff: f.deliveryCutoff, deliveryStart: f.deliveryStart, deliveryEnd: f.deliveryEnd, deliveryDays: f.deliveryDays, homepageLayout: f.homepageLayout,
        countdownVisible: Boolean(f.countdownVisible), countdownHeadlineVisible: Boolean(f.countdownHeadlineVisible), countdownHoursVisible: Boolean(f.countdownHoursVisible), countdownOpenText: f.countdownOpenText, countdownClosedText: f.countdownClosedText, countdownClosedDayText: f.countdownClosedDayText, countdownPausedText: f.countdownPausedText, countdownHoursText: f.countdownHoursText, countdownExtraLines: f.countdownExtraLines,
        deliverySlotCapacity: Number(f.deliverySlotCapacity), deliveryDriverCount: Number(f.deliveryDriverCount), ordersPerDriverPerWindow: Number(f.ordersPerDriverPerWindow), defaultEtaMinutes: Number(f.defaultEtaMinutes), googleReviewUrl: f.googleReviewUrl.trim(), hideOutOfStock: Boolean(f.hideOutOfStock), liveShelfEnabled: Boolean(f.liveShelfEnabled),
        pickupEnabled: Boolean(f.pickupEnabled), pickupAddress: f.pickupAddress.trim(), pickupHoursText: f.pickupHoursText, pickupReadyMinutes: Number(f.pickupReadyMinutes), pickupHoldDays: Number(f.pickupHoldDays), pickupInstructions: f.pickupInstructions,
        lakeNonaEnabled: Boolean(f.lakeNonaEnabled), countdownStyle: f.countdownStyle, zipTaxRates: Object.fromEntries(f.zipTaxRates.split(/[\s,]+/).filter(Boolean).map((pair) => { const [z, r] = pair.split("="); return [z.trim(), Number(r) / 100]; })) });
      setF(toForm(data));
      toast({ title: "Settings saved", description: "New rates, delivery zone and same-day cutoff apply immediately." });
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
        <Field icon={Percent} label="Sales tax rate (%)" hint="Applied to items only, after any promo discount. Seminole County (Altamonte Springs) is 7%: 6% Florida + 1% county surtax.">
          <input required type="number" min="0" max="50" step="0.001" data-testid="settings-tax" className={inputCls} value={f.taxPercent} onChange={(e) => setF({ ...f, taxPercent: e.target.value })} />
        </Field>
        <Field icon={Truck} label="Delivery fee ($)" hint="Charged when the cart subtotal is below the free-delivery minimum.">
          <input required type="number" min="0" step="0.01" data-testid="settings-delivery-fee" className={inputCls} value={f.deliveryFee} onChange={(e) => setF({ ...f, deliveryFee: e.target.value })} />
        </Field>
        <Field icon={Gift} label="Free delivery from ($)" hint="Carts at or above this subtotal get free delivery. Set 0 to always deliver free.">
          <input required type="number" min="0" step="0.01" data-testid="settings-free-min" className={inputCls} value={f.freeDeliveryMin} onChange={(e) => setF({ ...f, freeDeliveryMin: e.target.value })} />
        </Field>
      </div>

      <div className="border border-neutral-200 rounded-2xl p-5 mb-6" data-testid="settings-homepage-layout">
        <div className="flex items-center gap-2 mb-1"><LayoutTemplate className="h-4 w-4 text-emerald-600" /><label className="text-sm font-bold text-neutral-900">Website theme &amp; homepage layout</label></div>
        <p className="text-xs text-neutral-500 mb-4">Choose the customer-facing look. Neon and Cool Blue style the entire website—including the logo, header, product cards, checkout, account, tracking, footer and mobile navigation. Products, prices and functions stay shared.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {[
            ["classic", "Classic Store", "The current familiar storefront with balanced product sections.", "Emerald · White"],
            ["showcase", "Modern Showcase", "A complete energetic glass-and-gradient identity across every customer page.", "Soft green · Glass"],
            ["minimal", "Premium Minimal", "A complete restrained editorial identity with refined type and quiet luxury.", "Editorial · Airy"],
            ["neon", "Neon After Dark", "A complete electric identity across every customer page, with stacked drops and neon motion.", "Onyx · Electric green"],
            ["blue", "Cool Blue", "A complete calm-futurist identity with icy gradients, glass cards and cobalt controls.", "Ice · Cobalt"],
          ].map(([value, title, description, palette]) => {
            const selected = f.homepageLayout === value;
            return <div key={value} className={`homepage-theme-option rounded-xl border-2 overflow-hidden transition-all ${selected ? "border-emerald-600 bg-emerald-50 shadow-sm" : "border-neutral-200 hover:border-emerald-300"}`}>
              <button type="button" data-testid={`homepage-layout-${value}`} onClick={() => setF({ ...f, homepageLayout: value })} className="w-full text-left p-3 pb-2">
                <span className={`homepage-theme-swatch homepage-theme-swatch-${value}`} aria-hidden="true"><i /><i /><i /></span>
                <span className="flex items-center justify-between gap-2 mt-3"><strong className="text-sm text-neutral-900">{title}</strong><span className={`h-4 w-4 rounded-full border-2 shrink-0 ${selected ? "border-emerald-600 bg-emerald-600 shadow-[inset_0_0_0_3px_white]" : "border-neutral-300"}`} /></span>
                <span className="block text-xs text-neutral-500 mt-2 leading-relaxed min-h-[3.75rem]">{description}</span>
                <span className="block text-[10px] uppercase tracking-[0.14em] text-neutral-400 mt-2">{palette}</span>
              </button>
              <a href={`/?homepagePreview=${value}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 border-t border-neutral-200 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-600 hover:bg-neutral-900 hover:text-white transition-colors"><Eye className="h-3.5 w-3.5" /> Preview</a>
            </div>;
          })}
        </div>
        <p className="text-[11px] text-neutral-500 mt-3">Preview opens a private full-site view without saving and keeps the theme while you browse other pages. Select an option and click <strong>Save Settings</strong> only when you want customers to see it. <strong>Classic Store always remains available</strong> to restore the current website.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Field icon={MapPin} label="Delivery center ZIP" hint="Distances are measured from the center of this ZIP code (your store location).">
          <input required inputMode="numeric" pattern="\d{5}" data-testid="settings-delivery-zip" className={inputCls} value={f.deliveryZip} onChange={(e) => setF({ ...f, deliveryZip: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
        </Field>
        <Field icon={Radius} label="Delivery radius (miles)" hint="Orders with a delivery ZIP farther than this are blocked at checkout. Shown in the homepage banner.">
          <input required type="number" min="1" max="500" step="1" data-testid="settings-delivery-radius" className={inputCls} value={f.deliveryRadiusMiles} onChange={(e) => setF({ ...f, deliveryRadiusMiles: e.target.value })} />
        </Field>
      </div>

      <div className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-1"><MapPin className="h-4 w-4 text-emerald-600" /><label className="text-sm font-bold text-neutral-900">Allowed ZIP codes</label></div>
        <p className="text-xs text-neutral-600 mb-3">Enter ZIP codes separated by commas or spaces. When this list has ZIP codes, only these ZIP codes can place delivery orders. Leave it empty to use the mileage radius above.</p>
        <textarea rows={3} data-testid="settings-allowed-zips" className={inputCls} placeholder="32701, 32714, 32779" value={f.allowedZipCodes} onChange={(e) => setF({ ...f, allowedZipCodes: e.target.value.replace(/[^\d,\s]/g, "") })} />
      </div>

      <div className="border border-neutral-200 rounded-2xl p-5 mb-6" data-testid="settings-lake-nona">
        <label className="flex items-center justify-between gap-4 cursor-pointer mb-1">
          <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-600" /><span className="text-sm font-bold text-neutral-900">Lake Nona delivery (32832, 32827)</span></span>
          <span className="flex items-center gap-2 text-sm font-bold">{f.lakeNonaEnabled ? "On" : "Off"}<input type="checkbox" data-testid="settings-lake-nona-enabled" className="accent-emerald-600 h-5 w-5" checked={f.lakeNonaEnabled} onChange={(e) => setF({ ...f, lakeNonaEnabled: e.target.checked })} /></span>
        </label>
        <p className="text-xs text-neutral-500">When on, customers in 32832 and 32827 can place delivery orders, and the Lake Nona delivery page is shown in the footer, on the Delivery Area page and in the Google sitemap. Turn it off to stop Lake Nona orders and hide the page.</p>
      </div>

      <div className="border border-neutral-200 rounded-2xl p-5 mb-6" data-testid="settings-zip-tax">
        <div className="flex items-center gap-2 mb-1"><MapPin className="h-4 w-4 text-emerald-600" /><label className="text-sm font-bold text-neutral-900">Sales tax by delivery ZIP</label></div>
        <p className="text-xs text-neutral-500 mb-3">Delivery ZIPs in another county that use a different tax rate, as ZIP=percent, separated by commas (Orange County is 6.5%). Every other order, and all store pickups, use the sales tax rate above. Leave empty to use one rate for everything.</p>
        <textarea rows={2} data-testid="settings-zip-tax-rates" className={inputCls} placeholder="32832=6.5, 32827=6.5" value={f.zipTaxRates} onChange={(e) => setF({ ...f, zipTaxRates: e.target.value.replace(/[^\d,.=\s]/g, "") })} />
      </div>

      <div className="border border-neutral-200 rounded-2xl p-5 mb-6" data-testid="settings-sameday">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-emerald-600" /><label className="text-sm font-bold text-neutral-900">Same-day local delivery countdown</label></div>
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer"><input type="checkbox" data-testid="settings-sameday-enabled" className="accent-emerald-600 h-4 w-4" checked={f.sameDayEnabled} onChange={(e) => setF({ ...f, sameDayEnabled: e.target.checked })} /> {f.sameDayEnabled ? "ON" : "OFF"}</label>
        </div>
        <p className="text-xs text-neutral-500 mb-4">Shows "Order within Xh Ym for today's local delivery" on the homepage and checkout. Times are Orlando (Eastern) time on the server — customers' device clocks are ignored, and checkout re-checks the cutoff.</p>
        <div className="rounded-xl border border-neutral-200 p-4 mb-4" data-testid="settings-countdown-style">
          <p className="text-sm font-bold text-neutral-900 mb-1">Homepage banner style</p>
          <p className="text-xs text-neutral-600 mb-3">Compact shows a status chip ("Same-day open · 2h 14m left" or "Closed for today"), the next delivery time and a Shop now button. Classic shows the text lines below.</p>
          <div className="flex gap-4 flex-wrap text-sm">
            {[["chip", "Compact with Shop now button"], ["classic", "Classic text"]].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="countdownStyle" className="accent-emerald-600 h-4 w-4" checked={f.countdownStyle === value} onChange={() => setF({ ...f, countdownStyle: value })} /> {label}</label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 mb-4" data-testid="settings-countdown-copy">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div><p className="text-sm font-bold text-neutral-900">Countdown text &amp; visibility</p><p className="text-xs text-neutral-600 mt-0.5">Edit every message without changing delivery scheduling. Available placeholders: <code>{'{countdown}'}</code>, <code>{'{cutoff}'}</code>, <code>{'{start}'}</code>, <code>{'{end}'}</code>, <code>{'{next}'}</code>.</p></div>
            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" data-testid="settings-countdown-visible" className="accent-emerald-600 h-4 w-4" checked={f.countdownVisible} onChange={(e) => setF({ ...f, countdownVisible: e.target.checked })} /> Show countdown section</label>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="lg:col-span-2"><label className="flex items-center justify-between text-xs font-bold text-neutral-700 mb-1"><span>Open for same-day delivery</span><input type="checkbox" aria-label="Show main countdown text" checked={f.countdownHeadlineVisible} onChange={(e) => setF({ ...f, countdownHeadlineVisible: e.target.checked })} /></label><textarea rows={2} maxLength={240} className={inputCls} value={f.countdownOpenText} onChange={(e) => setF({ ...f, countdownOpenText: e.target.value })} /></div>
            <div><label className="block text-xs font-bold text-neutral-700 mb-1">After today's cutoff</label><textarea rows={3} maxLength={240} className={inputCls} value={f.countdownClosedText} onChange={(e) => setF({ ...f, countdownClosedText: e.target.value })} /></div>
            <div><label className="block text-xs font-bold text-neutral-700 mb-1">Closed delivery day</label><textarea rows={3} maxLength={240} className={inputCls} value={f.countdownClosedDayText} onChange={(e) => setF({ ...f, countdownClosedDayText: e.target.value })} /></div>
            <div><label className="block text-xs font-bold text-neutral-700 mb-1">Delivery paused</label><textarea rows={3} maxLength={240} className={inputCls} value={f.countdownPausedText} onChange={(e) => setF({ ...f, countdownPausedText: e.target.value })} /></div>
            <div><label className="flex items-center justify-between text-xs font-bold text-neutral-700 mb-1"><span>Hours and cutoff line</span><input type="checkbox" aria-label="Show hours text" checked={f.countdownHoursVisible} onChange={(e) => setF({ ...f, countdownHoursVisible: e.target.checked })} /></label><textarea rows={3} maxLength={300} className={inputCls} value={f.countdownHoursText} onChange={(e) => setF({ ...f, countdownHoursText: e.target.value })} /></div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 mb-2"><p className="text-xs font-bold text-neutral-700">Additional text lines</p><button type="button" disabled={f.countdownExtraLines.length >= 8} onClick={() => setF({ ...f, countdownExtraLines: [...f.countdownExtraLines, { text: "", visible: true }] })} className="inline-flex items-center gap-1 rounded-full bg-neutral-900 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add text</button></div>
            {f.countdownExtraLines.length === 0 && <p className="text-xs text-neutral-500">No additional lines. Add one for a promotion, delivery notice, or custom message.</p>}
            <div className="space-y-2">{f.countdownExtraLines.map((line, i) => <div className="flex items-center gap-2" key={i}><button type="button" aria-label={line.visible ? "Hide text line" : "Show text line"} onClick={() => setF({ ...f, countdownExtraLines: f.countdownExtraLines.map((x, n) => n === i ? { ...x, visible: !x.visible } : x) })} className="p-2 rounded-lg border border-neutral-300 text-neutral-600">{line.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><input maxLength={240} className={inputCls} placeholder="Enter an additional line" value={line.text} onChange={(e) => setF({ ...f, countdownExtraLines: f.countdownExtraLines.map((x, n) => n === i ? { ...x, text: e.target.value } : x) })} /><button type="button" aria-label="Remove text line" onClick={() => setF({ ...f, countdownExtraLines: f.countdownExtraLines.filter((_, n) => n !== i) })} className="p-2 rounded-lg border border-red-200 text-red-600"><Trash2 className="h-4 w-4" /></button></div>)}</div>
          </div>
          <div className="mt-4 rounded-lg bg-neutral-950 text-white px-4 py-3 text-center" data-testid="settings-countdown-preview"><p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1">Preview</p>{f.countdownVisible ? <>{f.countdownHeadlineVisible && <p className="text-sm font-semibold">{f.countdownOpenText.replace("{countdown}", "2h 15m").replace("{cutoff}", "8:00 PM").replace("{start}", "11:00 AM").replace("{end}", "9:00 PM").replace("{next}", "Tomorrow")}</p>}{f.countdownHoursVisible && <p className="text-[11px] text-neutral-400 mt-1">{f.countdownHoursText.replace("{countdown}", "2h 15m").replace("{cutoff}", "8:00 PM").replace("{start}", "11:00 AM").replace("{end}", "9:00 PM").replace("{next}", "Tomorrow")}</p>}{f.countdownExtraLines.filter((x) => x.visible && x.text).map((x, i) => <p className="text-[11px] text-neutral-400 mt-1" key={i}>{x.text.replace("{countdown}", "2h 15m").replace("{cutoff}", "8:00 PM").replace("{start}", "11:00 AM").replace("{end}", "9:00 PM").replace("{next}", "Tomorrow")}</p>)}</> : <p className="text-xs text-neutral-400">Countdown section hidden</p>}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-neutral-600 mb-1">Daily cutoff time (ET)</label>
            <input required type="time" data-testid="settings-cutoff" className={inputCls} value={f.deliveryCutoff} onChange={(e) => setF({ ...f, deliveryCutoff: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-600 mb-1">First delivery time (ET)</label>
            <input required type="time" data-testid="settings-delivery-start" className={inputCls} value={f.deliveryStart} onChange={(e) => setF({ ...f, deliveryStart: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-600 mb-1">Last delivery time (ET)</label>
            <input required type="time" data-testid="settings-delivery-end" className={inputCls} value={f.deliveryEnd} onChange={(e) => setF({ ...f, deliveryEnd: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-neutral-600 mb-1">Delivery days (unticked = closed, customers see the next open day)</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = f.deliveryDays.includes(i);
                return (
                  <button type="button" key={d} data-testid={`settings-day-${d.toLowerCase()}`} onClick={() => setF({ ...f, deliveryDays: on ? f.deliveryDays.filter((x) => x !== i) : [...f.deliveryDays, i].sort() })} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? "bg-neutral-900 border-neutral-900 text-white" : "border-neutral-300 text-neutral-500 hover:border-neutral-900"}`}>{d}</button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="border border-neutral-200 rounded-2xl p-5 mb-6" data-testid="settings-delivery-capacity">
        <div className="flex items-center gap-2 mb-1"><Gauge className="h-4 w-4 text-emerald-600" /><label className="text-sm font-bold text-neutral-900">Delivery capacity &amp; ETA</label></div>
        <p className="text-xs text-neutral-500 mb-4">Checkout closes a delivery window when its calculated capacity is full. Capacity uses the lower of the fixed slot limit and drivers × orders per driver.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div><label className="block text-xs font-bold text-neutral-600 mb-1">Maximum orders per window</label><input required type="number" min="1" max="500" step="1" data-testid="settings-slot-capacity" className={inputCls} value={f.deliverySlotCapacity} onChange={(e) => setF({ ...f, deliverySlotCapacity: e.target.value })} /></div>
          <div><label className="block text-xs font-bold text-neutral-600 mb-1">Active drivers</label><input required type="number" min="1" max="100" step="1" data-testid="settings-driver-count" className={inputCls} value={f.deliveryDriverCount} onChange={(e) => setF({ ...f, deliveryDriverCount: e.target.value })} /></div>
          <div><label className="block text-xs font-bold text-neutral-600 mb-1">Orders per driver/window</label><input required type="number" min="1" max="100" step="1" data-testid="settings-orders-per-driver" className={inputCls} value={f.ordersPerDriverPerWindow} onChange={(e) => setF({ ...f, ordersPerDriverPerWindow: e.target.value })} /></div>
          <div><label className="block text-xs font-bold text-neutral-600 mb-1">Default live ETA (minutes)</label><input required type="number" min="5" max="480" step="5" data-testid="settings-default-eta" className={inputCls} value={f.defaultEtaMinutes} onChange={(e) => setF({ ...f, defaultEtaMinutes: e.target.value })} /></div>
        </div>
        <p className="mt-3 text-xs font-semibold text-emerald-700">Effective capacity: {Math.min(Number(f.deliverySlotCapacity) || 1, (Number(f.deliveryDriverCount) || 1) * (Number(f.ordersPerDriverPerWindow) || 1))} orders per delivery window.</p>
      </div>

      <div className="border border-neutral-200 rounded-2xl p-5 mb-6" data-testid="settings-pickup">
        <label className="flex items-center justify-between gap-4 cursor-pointer mb-1">
          <span className="flex items-center gap-2"><Store className="h-4 w-4 text-emerald-600" /><span className="text-sm font-bold text-neutral-900">Store pickup</span></span>
          <span className="flex items-center gap-2 text-sm font-bold">{f.pickupEnabled ? "On" : "Off"}<input type="checkbox" data-testid="settings-pickup-enabled" className="accent-emerald-600 h-5 w-5" checked={f.pickupEnabled} onChange={(e) => setF({ ...f, pickupEnabled: e.target.checked })} /></span>
        </label>
        <p className="text-xs text-neutral-500 mb-4">When on, checkout offers "Store pickup": no delivery fee, no driver tip, paid online. In Orders, tap <b>Ready for pickup</b> (the customer gets an email), check their 21+ ID at the counter, then tap <b>Picked up</b>. Uncollected orders are cancelled after the hold time and the stock goes back on the shelf.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label className="block text-xs font-bold text-neutral-600 mb-1">Pickup address shown to customers</label><input required data-testid="settings-pickup-address" className={inputCls} value={f.pickupAddress} onChange={(e) => setF({ ...f, pickupAddress: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-bold text-neutral-600 mb-1">Pickup hours note</label><input data-testid="settings-pickup-hours" className={inputCls} value={f.pickupHoursText} onChange={(e) => setF({ ...f, pickupHoursText: e.target.value })} /></div>
          <div><label className="block text-xs font-bold text-neutral-600 mb-1">Usually ready in (minutes, 0 = don't show)</label><input required type="number" min="0" max="480" step="5" data-testid="settings-pickup-ready" className={inputCls} value={f.pickupReadyMinutes} onChange={(e) => setF({ ...f, pickupReadyMinutes: e.target.value })} /></div>
          <div><label className="block text-xs font-bold text-neutral-600 mb-1">Hold uncollected orders until end of day +</label>
            <select data-testid="settings-pickup-hold" className={inputCls} value={f.pickupHoldDays} onChange={(e) => setF({ ...f, pickupHoldDays: e.target.value })}>
              {[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? "Same day" : d === 1 ? "Next day (end of)" : `${d} days`}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="block text-xs font-bold text-neutral-600 mb-1">Pickup instructions</label><input data-testid="settings-pickup-instructions" className={inputCls} value={f.pickupInstructions} onChange={(e) => setF({ ...f, pickupInstructions: e.target.value })} /></div>
        </div>
      </div>

      <div className="border border-neutral-200 rounded-2xl p-5 mb-6" data-testid="settings-hide-out-of-stock">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span><span className="block text-sm font-bold text-neutral-900">Hide out-of-stock products</span><span className="block text-xs text-neutral-500 mt-1">Products at 0 stock drop off the shop, categories and brands, and come back on their own when Clover shows stock again.</span></span>
          <input type="checkbox" data-testid="settings-hide-oos" className="accent-emerald-600 h-4 w-4 shrink-0" checked={f.hideOutOfStock} onChange={(e) => setF({ ...f, hideOutOfStock: e.target.checked })} />
        </label>
      </div>

      <div className="border border-sky-200 bg-sky-50/50 rounded-2xl p-5 mb-6" data-testid="settings-live-shelf">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span><span className="block text-sm font-bold text-neutral-900">Live Store Shelf</span><span className="block text-xs text-neutral-500 mt-1">Show customers a fast, mobile shelf containing only products currently in stock. Availability refreshes automatically.</span></span>
          <span className="flex items-center gap-2 text-sm font-bold">{f.liveShelfEnabled ? "Visible" : "Hidden"}<input type="checkbox" className="accent-sky-600 h-5 w-5 shrink-0" checked={f.liveShelfEnabled} onChange={(e) => setF({ ...f, liveShelfEnabled: e.target.checked })} /></span>
        </label>
        <a href="/live-shelf?preview=1" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-bold text-sky-800"><Eye className="h-3.5 w-3.5" /> Private preview</a>
        <p className="mt-2 text-[11px] text-neutral-500">Preview works while hidden. Customers only see the header link after you turn this on and save.</p>
      </div>

      <div className="border border-neutral-200 rounded-2xl p-5 mb-6" data-testid="settings-google-reviews">
        <div className="flex items-center gap-2 mb-1"><Star className="h-4 w-4 text-emerald-600" /><label htmlFor="google-review-url" className="text-sm font-bold text-neutral-900">Google reviews link</label></div>
        <p className="text-xs text-neutral-500 mb-3">Paste your real Google Business review or profile link. The customer review section stays hidden when this is blank.</p>
        <input id="google-review-url" type="url" placeholder="https://g.page/r/.../review" data-testid="settings-google-review-url" className={inputCls} value={f.googleReviewUrl} onChange={(e) => setF({ ...f, googleReviewUrl: e.target.value })} />
      </div>

      <div className="border border-dashed border-neutral-300 rounded-2xl p-5 text-sm text-neutral-600" data-testid="settings-preview">
        <p className="font-bold text-neutral-900 mb-1">Preview for a ${example.toFixed(2)} cart</p>
        <p>Delivery {exShip === 0 ? "FREE" : `$${exShip.toFixed(2)}`} · Tax ${exTax.toFixed(2)} · <span className="font-bold text-neutral-900">Total ${(example + exShip + exTax).toFixed(2)}</span></p>
      </div>
    </form>
  );
};

export default AdminSettings;

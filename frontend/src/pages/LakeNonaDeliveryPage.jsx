import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Truck, ShieldCheck, Clock, SearchCheck, ShoppingBag, Camera } from "lucide-react";
import { DeliveryChecker } from "../components/DeliveryZone";
import { useDeliveryWindow } from "../components/DeliveryCountdown";
import { useCart } from "../context/CartContext";
import { useCatalog } from "../context/CatalogContext";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd, faqJsonLd, SITE_URL, STORE, titleCase } from "../seo/config";

export const LAKE_NONA_ZIPS = ["32832", "32827"];
const NEIGHBORHOODS = ["Laureate Park", "Lake Nona Town Center", "Medical City", "Northlake Park", "Storey Park", "Randal Park"];

const LakeNonaDeliveryPage = () => {
  const { delivery, pricing } = useCart();
  const { activeCategories } = useCatalog();
  const { window: win } = useDeliveryWindow();
  const sameDayEnabled = delivery.sameDayEnabled === true;
  const cutoff = win?.cutoffLabel || "our same-day cutoff";
  const fee = pricing.freeDeliveryMin <= 0
    ? "Delivery is currently free. Your final total is shown before you pay."
    : `Delivery is free on orders over $${pricing.freeDeliveryMin}.${pricing.deliveryFee > 0 ? ` Smaller orders carry a $${pricing.deliveryFee} delivery fee.` : ""} Your final total is shown before you pay.`;
  const faqs = [
    { q: "Do you deliver to Lake Nona?", a: `Yes. HD Smoke Shop delivers to adults 21+ in Lake Nona, ZIP codes ${LAKE_NONA_ZIPS.join(" and ")}, including ${NEIGHBORHOODS.slice(0, 4).join(", ")} and nearby streets. Enter your ZIP above to confirm your address.` },
    { q: "Can I get same-day delivery in Lake Nona?", a: sameDayEnabled ? `Yes. Order by ${cutoff} and pick a same-day delivery window at checkout. Orders placed after ${cutoff} go out on the next available day.` : "Choose the next available delivery window at checkout." },
    { q: "Where do Lake Nona orders come from?", a: `Every order is packed at our store at ${STORE.fullAddress} and driven to you by our own driver, in plain packaging.` },
    { q: "Is there a delivery fee?", a: fee },
    { q: "Do I need ID?", a: "Yes. Someone 21 or older must be at the door with a valid, unexpired government-issued photo ID. Orders cannot be left unattended or handed to anyone under 21." },
    { q: "What can I order?", a: activeCategories.length ? `Everything in our online smoke shop: ${activeCategories.map((c) => titleCase(c.name).toLowerCase()).join(", ")}.` : "Browse the Shop page to see every product available for delivery." },
  ];
  const jsonLd = [
    breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Delivery Area", path: "/delivery-area" }, { name: "Lake Nona", path: "/delivery/lake-nona" }]),
    faqJsonLd(faqs),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Smoke Shop & Vape Delivery in Lake Nona, Orlando, FL",
      serviceType: "Smoke shop delivery",
      provider: { "@id": `${SITE_URL}/#store` },
      areaServed: LAKE_NONA_ZIPS.map((zip) => ({ "@type": "Place", name: `Lake Nona, Orlando, FL ${zip}`, address: { "@type": "PostalAddress", postalCode: zip, addressLocality: "Orlando", addressRegion: "FL", addressCountry: "US" } })),
      url: `${SITE_URL}/delivery/lake-nona`,
    },
  ];

  if (!delivery.lakeNonaEnabled) {
    return (
      <div className="max-w-[900px] mx-auto px-4 py-16 text-center" data-testid="lake-nona-off">
        <Seo title="Lake Nona Delivery – HD Smoke Shop" description="Lake Nona delivery is not available right now." path="/delivery/lake-nona" noindex />
        <h1 className="font-heading text-3xl font-700 text-neutral-900 uppercase mb-3">Lake Nona delivery isn't available right now</h1>
        <p className="text-neutral-600 mb-6">See where we deliver today, or visit our store at {STORE.fullAddress}.</p>
        <Link to="/delivery-area" className="inline-flex items-center justify-center px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 uppercase text-sm">See delivery area</Link>
      </div>
    );
  }

  return (
    <div data-testid="lake-nona-page">
      <Seo
        title="Smoke Shop & Vape Delivery in Lake Nona (32832) – HD Smoke Shop"
        description={`Same-day smoke shop and vape delivery to Lake Nona, Orlando (32832, 32827).${win?.cutoffLabel ? ` Order online by ${win.cutoffLabel}.` : ""} Adults 21+ only; ID checked at the door.`}
        path="/delivery/lake-nona"
        jsonLd={jsonLd}
      />
      <DeliveryChecker />
      <div className="max-w-[1280px] mx-auto px-4 py-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500 mb-4">
          <Link to="/" className="hover:text-emerald-600">Home</Link><span>/</span>
          <Link to="/delivery-area" className="hover:text-emerald-600">Delivery Area</Link><span>/</span>
          <span className="text-neutral-800 font-medium">Lake Nona</span>
        </nav>
        <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
        <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-700 text-neutral-900 uppercase tracking-tight mb-3">Smoke Shop &amp; Vape Delivery in Lake Nona</h1>
        <p className="text-neutral-600 leading-relaxed max-w-3xl mb-4">
          HD Smoke Shop now delivers to Lake Nona, Orlando ({LAKE_NONA_ZIPS.join(" and ")}). Order disposable vapes, pod kits, hemp-derived delta products,
          kratom, hookah, glass, rolling papers, cigars and wraps online, and our own driver brings them to your door in plain packaging.
          {sameDayEnabled ? ` Order by ${cutoff} for same-day delivery.` : " Pick the next available delivery window at checkout."} Every order is 21+ and ID-checked at the door.
        </p>
        <p className="text-sm text-neutral-500 max-w-3xl mb-10">Orders are packed at our Altamonte Springs store and driven to Lake Nona, so the earliest same-day window is usually later in the afternoon or evening.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {[
            sameDayEnabled ? { icon: Clock, t: `Order by ${cutoff}`, d: "Same-day delivery to Lake Nona" } : { icon: Clock, t: "Scheduled delivery", d: "Choose the next available window" },
            { icon: Truck, t: pricing.freeDeliveryMin > 0 ? `Free over $${pricing.freeDeliveryMin}` : "Free delivery", d: "Fee shown in your cart before you pay" },
            { icon: ShieldCheck, t: "21+ ID verified", d: "Valid photo ID checked at the door" },
          ].map((f) => (
            <div key={f.t} className="border border-neutral-200 rounded-xl p-5 flex gap-3 items-center">
              <span className="grid place-items-center h-11 w-11 rounded-full bg-emerald-100 text-emerald-700 shrink-0"><f.icon className="h-5 w-5" aria-hidden="true" /></span>
              <div><h3 className="font-semibold text-sm text-neutral-900">{f.t}</h3><p className="text-xs text-neutral-500">{f.d}</p></div>
            </div>
          ))}
        </div>

        <section aria-labelledby="ln-areas" className="mb-12">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="ln-areas" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-2">Lake Nona Areas We Deliver To</h2>
          <p className="text-sm text-neutral-500 mb-6">Enter your ZIP above for the final check. Delivery is only available to the ZIP codes listed here.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="lake-nona-zips">
            {LAKE_NONA_ZIPS.map((zip) => (
              <div key={zip} className="border border-neutral-200 rounded-xl p-5">
                <h3 className="font-heading text-lg uppercase flex items-center gap-2 mb-2"><MapPin className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Orlando, FL {zip}</h3>
                <p className="text-sm text-neutral-600">{zip === "32832" ? "Lake Nona: Laureate Park, Lake Nona Town Center, Medical City, Northlake Park and nearby." : "Lake Nona South: Storey Park, Randal Park and nearby."}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="ln-how" className="mb-12">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="ln-how" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-6">How Lake Nona Delivery Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: SearchCheck, n: "1", t: "Check your ZIP", d: "Make sure your address is in 32832 or 32827." },
              { icon: ShoppingBag, n: "2", t: sameDayEnabled ? `Order by ${cutoff}` : "Choose a time", d: "Pick a delivery window at checkout." },
              { icon: ShieldCheck, n: "3", t: "Have 21+ ID ready", d: "We check a valid photo ID at the door." },
              { icon: Camera, n: "4", t: "Track the delivery", d: "Follow live status updates until it arrives." },
            ].map((step) => (
              <div key={step.n} className="border border-neutral-200 rounded-xl p-5">
                <span className="inline-grid place-items-center h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 mb-3"><step.icon className="h-5 w-5" /></span>
                <p className="text-xs font-bold text-emerald-700 mb-1">STEP {step.n}</p><h3 className="font-bold text-neutral-900">{step.t}</h3><p className="text-sm text-neutral-500 mt-1">{step.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="ln-faq" className="mb-12">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="ln-faq" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-6">Lake Nona Delivery FAQ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {faqs.map((f) => (
              <div key={f.q} className="border border-neutral-200 rounded-xl p-5">
                <h3 className="font-semibold text-neutral-900 mb-1.5">{f.q}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="relative overflow-hidden rounded-2xl bg-neutral-900 px-8 py-10 sm:px-12 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="relative">
            <h2 className="font-heading text-2xl sm:text-3xl font-700 text-white uppercase leading-tight">Order to Lake Nona</h2>
            <p className="text-neutral-300 text-sm mt-1">Browse the shop. Your ZIP is checked again at checkout.</p>
          </div>
          <Link to="/shop" className="relative inline-flex items-center justify-center px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors uppercase text-sm tracking-wide">Shop All Products</Link>
        </div>
      </div>
    </div>
  );
};

export default LakeNonaDeliveryPage;

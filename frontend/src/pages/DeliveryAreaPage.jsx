import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Truck, ShieldCheck, Clock, SearchCheck, ShoppingBag, Camera, Star, Video } from "lucide-react";
import { DeliveryChecker } from "../components/DeliveryZone";
import { useCart } from "../context/CartContext";
import { useCatalog } from "../context/CatalogContext";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd, faqJsonLd, SITE_URL, STORE, titleCase } from "../seo/config";
import VisitStore from "../components/VisitStore";

// Add a hosted walkthrough URL here when a delivery video is ready.
const DELIVERY_VIDEO_URL = "";
// A real Google review embed can be enabled with these build-time values. A normal Google review link can also be entered in Store Settings.
const GOOGLE_PLACE_ID = (process.env.REACT_APP_GOOGLE_PLACE_ID || "").trim();
const GOOGLE_MAPS_KEY = (process.env.REACT_APP_GOOGLE_MAPS_EMBED_KEY || "").trim();

const DeliveryAreaPage = () => {
  const { delivery, pricing, trust } = useCart();
  const { activeCategories } = useCatalog();
  const sameDayEnabled = delivery.sameDayEnabled === true;
  const zoneDescription = STORE.deliveryAreaText;
  const faqs = [
    { q: "Where does HD Smoke Shop deliver?", a: `We deliver to adults 21+ within ${zoneDescription}. Enter your ZIP code above to confirm. Outside 32714? You're welcome to visit our store at ${STORE.fullAddress}.` },
    { q: "Can I shop in store instead?", a: `Yes, walk-ins are welcome. We're open ${STORE.hoursText} at ${STORE.fullAddress}. Shoppers from Longwood, Casselberry, Maitland, Winter Springs and Apopka are welcome in store.` },
    { q: "Is there a delivery fee?", a: pricing.freeDeliveryMin <= 0 ? "Local delivery is currently free. Your final total is shown before you pay." : `Local delivery is free on orders over $${pricing.freeDeliveryMin}.${pricing.deliveryFee > 0 ? ` Orders below that carry a $${pricing.deliveryFee} delivery fee.` : ""} Your final total is shown before you pay.` },
    { q: "Do I need ID for delivery?", a: "Yes. You must be 21 or older, and a valid government-issued photo ID is checked at the door. Orders cannot be left with anyone under 21." },
    { q: "What can I order for delivery?", a: activeCategories.length ? `Everything in our online smoke shop: ${activeCategories.map((c) => titleCase(c.name).toLowerCase()).join(", ")}.` : "Browse the Shop page to see every product currently available for local delivery." },
  ];
  const jsonLd = [
    breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Delivery Area", path: "/delivery-area" }]),
    faqJsonLd(faqs),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Smoke Shop Delivery in Altamonte Springs, FL 32714",
      serviceType: "Local delivery",
      provider: { "@id": `${SITE_URL}/#store` },
      areaServed: { "@type": "Place", name: "Altamonte Springs, FL 32714", address: { "@type": "PostalAddress", postalCode: STORE.deliveryZip, addressLocality: STORE.city, addressRegion: STORE.region, addressCountry: STORE.country } },
      url: `${SITE_URL}/delivery-area`,
    },
  ];

  return (
    <div data-testid="delivery-area-page">
      <Seo
        title="Smoke Shop Delivery in Altamonte Springs 32714 – HD Smoke Shop"
        description="Local delivery from our SR 434 store within Altamonte Springs, ZIP 32714. Order online at puff2door.com. Adults 21+ only; ID checked at the door."
        path="/delivery-area"
        jsonLd={jsonLd}
      />
      <DeliveryChecker />
      <div className="max-w-[1280px] mx-auto px-4 py-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500 mb-4">
          <Link to="/" className="hover:text-emerald-600">Home</Link><span>/</span><span className="text-neutral-800 font-medium">Delivery Area</span>
        </nav>
        <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
        <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-700 text-neutral-900 uppercase tracking-tight mb-3">Smoke Shop Delivery in Altamonte Springs, 32714</h1>
        <p className="text-neutral-600 leading-relaxed max-w-3xl mb-10">
          Visit our Altamonte Springs store or order for delivery. Walk-ins are welcome at our SR 434 store, open {STORE.hoursText}. Order disposable vapes, hemp-derived delta products,
          glass pipes, kratom and more online, and we bring them to your door within {zoneDescription}. {sameDayEnabled ? "Order before the cutoff for same-day local delivery. " : "Choose from the available local delivery windows at checkout. "}
          Every order is age-verified (21+){pricing.freeDeliveryMin > 0 ? `, and delivery is free on orders over $${pricing.freeDeliveryMin}` : ", and local delivery is currently free"}.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {[
            { icon: Truck, t: pricing.freeDeliveryMin > 0 ? "Free over $" + pricing.freeDeliveryMin : "Free Local Delivery", d: pricing.deliveryFee > 0 && pricing.freeDeliveryMin > 0 ? `$${pricing.deliveryFee} delivery fee on smaller orders` : "No delivery fee is currently charged" },
            sameDayEnabled ? { icon: Clock, t: "Same-Day Local", d: "Order before cutoff for delivery today" } : { icon: Clock, t: "Scheduled Local", d: "Choose the next available delivery window" },
            { icon: ShieldCheck, t: "21+ ID Verified", d: "Valid ID checked at the door" },
          ].map((f, i) => (
            <div key={i} className="border border-neutral-200 rounded-xl p-5 flex gap-3 items-center">
              <span className="grid place-items-center h-11 w-11 rounded-full bg-emerald-100 text-emerald-700 shrink-0"><f.icon className="h-5 w-5" aria-hidden="true" /></span>
              <div><h3 className="font-semibold text-sm text-neutral-900">{f.t}</h3><p className="text-xs text-neutral-500">{f.d}</p></div>
            </div>
          ))}
        </div>

        <section aria-labelledby="areas-heading" className="mb-12">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="areas-heading" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-2">Areas We Deliver To</h2>
          <p className="text-sm text-neutral-500 mb-6">We deliver from our SR 434 store to addresses in one ZIP code. Enter your ZIP above for the final check.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6" data-testid="delivery-area-list">
            <div className="border border-neutral-200 rounded-xl p-5" data-testid="area-altamonte-springs">
              <h3 className="font-heading text-lg uppercase flex items-center gap-2 mb-2"><MapPin className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Altamonte Springs, FL</h3>
              <p className="text-sm text-neutral-600 leading-relaxed"><span className="font-medium text-neutral-800">{STORE.deliveryZip}</span> – Altamonte Springs</p>
            </div>
            <div className="border border-neutral-200 rounded-xl p-5 md:col-span-1 lg:col-span-2">
              <h3 className="font-heading text-lg uppercase mb-2">Outside 32714?</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">Shoppers from Longwood, Casselberry, Maitland, Winter Springs and Apopka are welcome to visit the store in person — no delivery needed.</p>
            </div>
          </div>
          <div data-testid="delivery-map"><VisitStore /></div>
        </section>

        <section aria-labelledby="how-delivery-works" className="mb-12" data-testid="how-delivery-works">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="how-delivery-works" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-6">How Delivery Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: SearchCheck, n: "1", t: "Check your ZIP", d: "Confirm your address is inside the live delivery area." },
              sameDayEnabled ? { icon: ShoppingBag, n: "2", t: "Order before cutoff", d: "Choose an available two-hour delivery window at checkout." } : { icon: ShoppingBag, n: "2", t: "Choose a time", d: "Select the next available delivery window at checkout." },
              { icon: ShieldCheck, n: "3", t: "Have 21+ ID ready", d: "We check a valid government-issued photo ID at the door." },
              { icon: Camera, n: "4", t: "Track the delivery", d: "Follow live status updates and see a door photo when provided." },
            ].map((step) => (
              <div key={step.n} className="border border-neutral-200 rounded-xl p-5">
                <span className="inline-grid place-items-center h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 mb-3"><step.icon className="h-5 w-5" /></span>
                <p className="text-xs font-bold text-emerald-700 mb-1">STEP {step.n}</p><h3 className="font-bold text-neutral-900">{step.t}</h3><p className="text-sm text-neutral-500 mt-1">{step.d}</p>
              </div>
            ))}
          </div>
          {DELIVERY_VIDEO_URL && <a href={DELIVERY_VIDEO_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:underline"><Video className="h-4 w-4" /> Watch how delivery works</a>}
        </section>

        {(GOOGLE_PLACE_ID && GOOGLE_MAPS_KEY) || trust.googleReviewUrl ? <section aria-labelledby="local-reviews" className="mb-12" data-testid="local-reviews">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="local-reviews" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-4">What Local Customers Say</h2>
          {GOOGLE_PLACE_ID && GOOGLE_MAPS_KEY ? (
            <iframe title="HD Smoke Shop on Google Maps" className="w-full h-[360px] rounded-2xl border border-neutral-200" loading="lazy" allowFullScreen src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&q=place_id:${encodeURIComponent(GOOGLE_PLACE_ID)}`} />
          ) : (
            <div className="border border-neutral-200 rounded-2xl p-8 text-center bg-neutral-50">
              <Star className="h-8 w-8 text-emerald-600 mx-auto mb-3" />
              <p className="font-bold text-neutral-900">Read our verified Google reviews</p>
              <p className="text-sm text-neutral-500 mt-1 mb-4">See current customer feedback directly on Google.</p>
              <a href={trust.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Open Google Reviews</a>
            </div>
          )}
        </section> : null}

        <section aria-labelledby="da-faq-heading" className="mb-12">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="da-faq-heading" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-6">Delivery FAQ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="delivery-faq-list">
            {faqs.map((f, i) => (
              <div key={f.q} className="border border-neutral-200 rounded-xl p-5" data-testid={`delivery-faq-${i}`}>
                <h3 className="font-semibold text-neutral-900 mb-1.5">{f.q}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="relative overflow-hidden rounded-2xl bg-neutral-900 px-8 py-10 sm:px-12 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-600/20 blur-2xl" />
          <div className="relative">
            <h2 className="font-heading text-2xl sm:text-3xl font-700 text-white uppercase leading-tight">Ready to order?</h2>
            <p className="text-neutral-300 text-sm mt-1">Browse the shop — your ZIP is checked again at checkout.</p>
          </div>
          <Link to="/shop" data-testid="delivery-shop-cta" className="relative inline-flex items-center justify-center px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors uppercase text-sm tracking-wide">Shop All Products</Link>
        </div>
      </div>
    </div>
  );
};

export default DeliveryAreaPage;

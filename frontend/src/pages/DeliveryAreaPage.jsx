import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Truck, ShieldCheck, Clock, SearchCheck, ShoppingBag, Camera, Star, Video } from "lucide-react";
import api from "../api";
import { DeliveryChecker } from "../components/DeliveryZone";
import { useCart } from "../context/CartContext";
import { useCatalog } from "../context/CatalogContext";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd, faqJsonLd, SITE_URL, titleCase } from "../seo/config";

// Add a hosted walkthrough URL here when a delivery video is ready.
const DELIVERY_VIDEO_URL = "";
// A real Google review embed requires both values. Until they are configured, the page shows an honest placeholder and never invents reviews.
const GOOGLE_PLACE_ID = (process.env.REACT_APP_GOOGLE_PLACE_ID || "").trim();
const GOOGLE_MAPS_KEY = (process.env.REACT_APP_GOOGLE_MAPS_EMBED_KEY || "").trim();

const DeliveryAreaPage = () => {
  const { delivery, pricing } = useCart();
  const { activeCategories } = useCatalog();
  const [area, setArea] = useState(null);

  useEffect(() => {
    api.get("/delivery/area").then(({ data }) => setArea(data)).catch(() => setArea({ areas: [], zipCount: 0 }));
  }, []);

  const radius = area?.radiusMiles ?? delivery.radiusMiles;
  const center = area?.centerZip ?? delivery.zip;
  const mapSrc = area?.centerLat && area?.centerLng ? (() => {
    const latSpan = Math.max(radius / 69, 0.08);
    const lngSpan = Math.max(radius / (69 * Math.cos(area.centerLat * Math.PI / 180)), 0.08);
    const bbox = [area.centerLng - lngSpan, area.centerLat - latSpan, area.centerLng + lngSpan, area.centerLat + latSpan].join(",");
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${area.centerLat}%2C${area.centerLng}`;
  })() : "";
  const faqs = [
    { q: "Where does Puff2door deliver?", a: `Puff2door delivers to addresses within ${radius} miles of ZIP ${center} in the Orlando, Florida area${area?.zipCount ? ` — that covers ${area.zipCount} ZIP codes` : ""}. Enter your ZIP code above to confirm instantly.` },
    { q: "Is there a delivery fee in Orlando?", a: `Local delivery is free on orders over $${pricing.freeDeliveryMin}. Orders below that carry a $${pricing.deliveryFee} delivery fee, shown before you pay.` },
    { q: "Do I need ID for vape delivery?", a: "Yes. You must be 21 or older, and a valid government-issued ID may be checked at delivery. Orders cannot be left with anyone under 21." },
    { q: "What can I order for delivery?", a: `Everything in our online smoke shop: ${activeCategories.map((c) => titleCase(c.name).toLowerCase()).join(", ")}.` },
  ];
  const jsonLd = [
    breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Delivery Area", path: "/delivery-area" }]),
    faqJsonLd(faqs),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Vape & Smoke Shop Delivery in Orlando, FL",
      serviceType: "Local delivery",
      provider: { "@id": `${SITE_URL}/#organization` },
      areaServed: (area?.areas || []).map((a) => ({ "@type": "City", name: `${a.city}, ${a.state}` })),
      url: `${SITE_URL}/delivery-area`,
    },
  ];

  return (
    <div data-testid="delivery-area-page">
      <Seo
        title="Vape Delivery Orlando, FL | Puff2door Delivery Area"
        description={`Puff2door delivers vapes, delta products, glass and smoke shop essentials within ${radius} miles of Orlando ZIP ${center}. Check your ZIP code and see every area we serve. 21+ only.`}
        path="/delivery-area"
        jsonLd={jsonLd}
      />
      <DeliveryChecker />
      <div className="max-w-[1280px] mx-auto px-4 py-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500 mb-4">
          <Link to="/" className="hover:text-emerald-600">Home</Link><span>/</span><span className="text-neutral-800 font-medium">Delivery Area</span>
        </nav>
        <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
        <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-700 text-neutral-900 uppercase tracking-tight mb-3">Vape Delivery in Orlando, FL</h1>
        <p className="text-neutral-600 leading-relaxed max-w-3xl mb-10">
          Puff2door is an online smoke shop with local vape delivery — not a walk-in store. Order disposable vapes, hemp-derived delta products,
          glass pipes, kratom and more, and we bring them to your door anywhere within {radius} miles of ZIP {center}. Same-day local delivery is
          available, every order is age-verified (21+), and delivery is free on orders over ${pricing.freeDeliveryMin}.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {[
            { icon: Truck, t: "Free over $" + pricing.freeDeliveryMin, d: `$${pricing.deliveryFee} delivery fee on smaller orders` },
            { icon: Clock, t: "Same-Day Local", d: "Order today, delivered today in the Orlando area" },
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
          <p className="text-sm text-neutral-500 mb-6">
            {area ? `${area.zipCount} ZIP codes across ${area.areas.length} cities and communities within ${radius} miles of ${area.centerCity || "Orlando"} ${center}.` : "Loading delivery zone…"}
            {" "}Distances are straight-line from the center of each ZIP code.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="delivery-area-list">
            {(area?.areas || []).map((a) => (
              <div key={a.city} className="border border-neutral-200 rounded-xl p-5" data-testid={`area-${a.city.toLowerCase().replace(/\s+/g, "-")}`}>
                <h3 className="font-heading text-lg uppercase flex items-center gap-2 mb-2"><MapPin className="h-4 w-4 text-emerald-600" aria-hidden="true" /> {a.city}, {a.state}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">
                  {a.zips.map((z, i) => (
                    <span key={z.zip}>{i > 0 && ", "}<span className="font-medium text-neutral-800">{z.zip}</span> <span className="text-neutral-400 text-xs">({z.distanceMiles} mi)</span></span>
                  ))}
                </p>
              </div>
            ))}
          </div>
          {mapSrc && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50" data-testid="delivery-map">
              <iframe title={`Puff2door delivery area around ${center}`} src={mapSrc} className="w-full h-[360px]" loading="lazy" referrerPolicy="no-referrer" />
              <p className="px-4 py-3 text-xs text-neutral-500">Map centered on ZIP {center}. Enter your ZIP above for the final delivery check within {radius} miles.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="how-delivery-works" className="mb-12" data-testid="how-delivery-works">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="how-delivery-works" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-6">How Delivery Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: SearchCheck, n: "1", t: "Check your ZIP", d: "Confirm your address is inside the live delivery area." },
              { icon: ShoppingBag, n: "2", t: "Order before cutoff", d: "Choose an available two-hour delivery window at checkout." },
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

        <section aria-labelledby="local-reviews" className="mb-12" data-testid="local-reviews">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="local-reviews" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-4">What Local Customers Say</h2>
          {GOOGLE_PLACE_ID && GOOGLE_MAPS_KEY ? (
            <iframe title="Puff2door on Google Maps" className="w-full h-[360px] rounded-2xl border border-neutral-200" loading="lazy" allowFullScreen src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&q=place_id:${encodeURIComponent(GOOGLE_PLACE_ID)}`} />
          ) : (
            <div className="border border-dashed border-neutral-300 rounded-2xl p-8 text-center bg-neutral-50">
              <Star className="h-8 w-8 text-emerald-600 mx-auto mb-3" />
              <p className="font-bold text-neutral-900">Google reviews are coming here soon.</p>
              <p className="text-sm text-neutral-500 mt-1">We will display verified local reviews once the Google Business Place ID is connected.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="da-faq-heading" className="mb-12">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h2 id="da-faq-heading" className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight mb-6">Orlando Delivery FAQ</h2>
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

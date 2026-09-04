import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Truck, ShieldCheck, Clock } from "lucide-react";
import api from "../api";
import { DeliveryChecker } from "../components/DeliveryZone";
import { useCart } from "../context/CartContext";
import { useCatalog } from "../context/CatalogContext";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd, faqJsonLd, SITE_URL, titleCase } from "../seo/config";

const DeliveryAreaPage = () => {
  const { delivery, pricing } = useCart();
  const { activeCategories } = useCatalog();
  const [area, setArea] = useState(null);

  useEffect(() => {
    api.get("/delivery/area").then(({ data }) => setArea(data)).catch(() => setArea({ areas: [], zipCount: 0 }));
  }, []);

  const radius = area?.radiusMiles ?? delivery.radiusMiles;
  const center = area?.centerZip ?? delivery.zip;
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

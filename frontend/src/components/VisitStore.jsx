import React, { useEffect, useRef, useState } from "react";
import { MapPin, Phone, Clock, Navigation, Star } from "lucide-react";
import { STORE } from "../seo/config";

// Google's map adds about 400 KB of scripts, so it only loads once the visitor scrolls near it.
const LazyMap = () => {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return undefined;
    if (typeof IntersectionObserver === "undefined") { setShow(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); }
    }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} className="h-full min-h-[320px]">
      {show ? (
        <iframe
          title="Map to HD Smoke Shop, Altamonte Springs"
          src={STORE.mapEmbedUrl}
          width="100%"
          height="380"
          style={{ border: 0, display: "block", minHeight: 320, height: "100%" }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <a href={STORE.directionsUrl} target="_blank" rel="noopener noreferrer" className="flex h-full min-h-[320px] items-center justify-center gap-2 text-sm font-semibold text-neutral-500">
          <MapPin className="h-4 w-4" /> Loading map…
        </a>
      )}
    </div>
  );
};

// "Visit our store" block: address, click-to-call phone, hours, Google map and review link.
// The map is Google's free embed (no API key needed).
const VisitStore = ({ heading = "Visit Our Altamonte Springs Store", className = "" }) => (
  <section data-testid="visit-store" aria-labelledby="visit-store-heading" className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 items-stretch ${className}`}>
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 id="visit-store-heading" className="font-heading text-2xl uppercase tracking-wide text-neutral-900">{heading}</h2>
      <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
        Walk-ins welcome. Find us in San Sebastian Square on SR 434, just off I-4 — or order online for local delivery within {STORE.deliveryAreaText}.
      </p>
      <address className="not-italic mt-5 space-y-3 text-sm">
        <p className="flex items-start gap-3"><MapPin className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /><span><strong>{STORE.name}</strong><br />481 N State Rd 434, Suite 1050<br />Altamonte Springs, FL 32714</span></p>
        <p className="flex items-start gap-3"><Phone className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /><a href={STORE.phoneHref} data-testid="visit-store-phone" className="font-semibold text-emerald-700 hover:underline">{STORE.phone}</a></p>
        <p className="flex items-start gap-3"><Clock className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /><span>Open {STORE.hoursText}</span></p>
      </address>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={STORE.directionsUrl} target="_blank" rel="noopener noreferrer" data-testid="visit-store-directions" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors"><Navigation className="h-4 w-4" /> Get directions</a>
        <a href={STORE.googleReviewUrl} target="_blank" rel="noopener noreferrer" data-testid="visit-store-review" className="inline-flex items-center gap-2 rounded-full border border-emerald-600 px-5 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"><Star className="h-4 w-4" /> Leave us a Google review</a>
      </div>
    </div>
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 min-h-[320px]">
      <LazyMap />
    </div>
  </section>
);

export default VisitStore;

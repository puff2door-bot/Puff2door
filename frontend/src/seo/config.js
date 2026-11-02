import { BRAND } from "../mock";

export const SITE_URL = (process.env.REACT_APP_SITE_URL || "https://puff2door.com").replace(/\/$/, "");
export const SITE_NAME = "HD Smoke Shop";
export const DEFAULT_TITLE = "HD Smoke Shop Altamonte Springs, FL – Smoke Shop & Delivery";
export const DEFAULT_DESCRIPTION = "Smoke shop on SR 434 in Altamonte Springs, open 10 AM–10 PM daily. Shop in store or order online for local delivery. 21+ only, ID required.";
export const DEFAULT_IMAGE = `${SITE_URL}/img/og-image.jpg`;
export const LOGO_URL = `${SITE_URL}/img/logo.png`;

// Single source of truth for the store's name, address, phone and hours (NAP).
// Keep these identical to the Google Business Profile.
export const STORE = {
  name: "HD Smoke Shop",
  streetAddress: "481 N State Rd 434, Suite 1050",
  city: "Altamonte Springs",
  region: "FL",
  postalCode: "32714",
  country: "US",
  fullAddress: "481 N State Rd 434, Suite 1050, Altamonte Springs, FL 32714",
  phone: "(407) 625-6826",
  phoneHref: "tel:+14076256826",
  phoneE164: "+1-407-625-6826",
  hoursText: "10 AM – 10 PM daily",
  opens: "10:00",
  closes: "22:00",
  latitude: 28.667897,
  longitude: -81.418196,
  deliveryZip: "32714",
  deliveryAreaText: "Altamonte Springs, ZIP 32714",
  mapEmbedUrl: "https://www.google.com/maps?q=HD+Smoke+Shop,+481+N+State+Rd+434+Suite+1050,+Altamonte+Springs,+FL+32714&output=embed",
  directionsUrl: "https://www.google.com/maps/place/?q=place_id:ChIJKZb4tvlx54gRjJxn6gAuEU4",
  googleReviewUrl: "https://g.page/r/CYycZ-oALhFOEBM/review",
  instagram: "https://www.instagram.com/hd.smokeshop/",
  facebook: "https://www.facebook.com/puff2doors",
  tiktok: "https://www.tiktok.com/@hd_smokeshop",
  yelp: "https://www.yelp.com/biz/hd-smoke-shop-altamonte-springs",
  mapquest: "https://www.mapquest.com/us/florida/hd-smoke-shop-467534151",
  yellowPages: "https://www.yellowpages.com/altamonte-springs-fl/bp/hd-smoke-shop-581442087",
};

export const absUrl = (path = "/") => (path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`);

export const truncate = (text = "", max = 155) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/[\s,;:.-]+\S*$/, "")}…`;
};

export const titleCase = (s = "") => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bThc\b/g, "THC").replace(/\bThca\b/g, "THCA");

// Short on-page intro per category. Titles and meta descriptions follow one local pattern (see categorySeo).
export const CATEGORY_SEO = {
  disposable: { intro: "Shop disposable vapes from top brands. Order online for local delivery in Altamonte Springs (ZIP 32714) or pick them up at our SR 434 store." },
  delta: { intro: "Hemp-derived delta disposable vapes from trusted brands, available in store or for local delivery in ZIP 32714." },
  "delta-cartridges": { intro: "510-thread delta cartridges from leading brands, available in store or for local delivery in ZIP 32714." },
  "delta-edibles": { intro: "Hemp-derived delta gummies and edibles from popular brands, available in store or for local delivery in ZIP 32714." },
  "delta-smokeables": { intro: "THCA flower, pre-rolls and other delta smokeables from trusted brands, available in store or for local delivery in ZIP 32714." },
  "vape-accessories": { intro: "Vape accessories and essentials, available in store or for local delivery in ZIP 32714." },
  "glass-pipes": { intro: "Glass hand pipes, bubblers and smoking accessories. Visit our Altamonte Springs store or order for local delivery." },
  kratom: { intro: "Kratom capsules, extracts and botanical products, available in store or for local delivery in ZIP 32714." },
  "hemp-wraps": { intro: "Hemp wraps from popular brands, available in store or for local delivery." },
  "paper-cones": { intro: "Rolling papers and pre-rolled cones, available in store or for local delivery." },
  lighter: { intro: "Lighters and torch lighters, available in store or for local delivery." },
  "air-freshner": { intro: "Air fresheners and odor eliminators for your space." },
  "hookah-accessories": { intro: "Hookah accessories, available in store or for local delivery." },
  miscellaneous: { intro: "Smoke shop essentials and other useful extras." },
};

export const categorySeo = (cat) => {
  if (!cat) return null;
  const name = titleCase(cat.name);
  return {
    title: `${name} – Shop Online or In Store | HD Smoke Shop`,
    description: truncate(`Shop ${name.toLowerCase()} at HD Smoke Shop in Altamonte Springs. Order online for local delivery or visit our SR 434 store. 21+ only, ID required.`),
    intro: CATEGORY_SEO[cat.slug]?.intro || `${name} available at our Altamonte Springs store or for local delivery in ZIP 32714.`,
  };
};

export const brandSeo = (brand) => ({
  title: `${brand.name} – Available at HD Smoke Shop Altamonte Springs`,
  description: truncate(`Find ${brand.name} at HD Smoke Shop. Check online availability, then order for local delivery or pick up in Altamonte Springs. 21+ only.`),
  intro: `${brand.name} products available at HD Smoke Shop in Altamonte Springs, in store or for local delivery.`,
});

export const productSeoDescription = (p) => {
  const name = titleCase(p.name);
  return truncate(`${name}${p.brandName ? ` from ${p.brandName}` : ""} at HD Smoke Shop, Altamonte Springs. Check availability and order for local delivery. 21+ only, ID required.`, 158);
};

export const productSpecs = (p) => {
  const rows = [];
  if (p.brandName) rows.push(["Brand", p.brandName]);
  if (p.category) rows.push(["Category", titleCase(p.category)]);
  if (p.puffs) rows.push(["Puff count", `Up to ${p.puffs.toLocaleString()} puffs`]);
  if (p.flavors?.length) rows.push(["Flavor", p.flavors.join(", ")]);
  rows.push(["Availability", p.inStock ? "In stock – local delivery" : "Currently sold out"]);
  rows.push(["Age requirement", "21+ only, ID verified at delivery"]);
  return rows;
};

export const storeJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "Store",
  "@id": `${SITE_URL}/#store`,
  name: STORE.name,
  alternateName: ["Puff2door", "Puff2Door"],
  url: SITE_URL,
  logo: LOGO_URL,
  image: DEFAULT_IMAGE,
  description: "Smoke shop in Altamonte Springs, FL. Walk-ins welcome, plus online ordering with local delivery within ZIP 32714. Adults 21+ only.",
  telephone: STORE.phoneE164,
  email: BRAND.email,
  contactPoint: {
    "@type": "ContactPoint",
    telephone: STORE.phoneE164,
    contactType: "customer service",
    areaServed: "US-FL",
    availableLanguage: "English",
  },
  priceRange: "$$",
  address: { "@type": "PostalAddress", streetAddress: STORE.streetAddress, addressLocality: STORE.city, addressRegion: STORE.region, postalCode: STORE.postalCode, addressCountry: STORE.country },
  geo: { "@type": "GeoCoordinates", latitude: STORE.latitude, longitude: STORE.longitude },
  hasMap: STORE.directionsUrl,
  openingHours: "Mo-Su 10:00-22:00",
  openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: STORE.opens, closes: STORE.closes }],
  areaServed: [{ "@type": "Place", name: "Altamonte Springs, FL 32714", address: { "@type": "PostalAddress", postalCode: STORE.deliveryZip, addressLocality: STORE.city, addressRegion: STORE.region, addressCountry: STORE.country } }],
  audience: { "@type": "PeopleAudience", suggestedMinAge: 21 },
  sameAs: [STORE.instagram, STORE.facebook, STORE.tiktok, STORE.yelp, STORE.mapquest, STORE.yellowPages],
});

// Kept for older imports.
export const organizationJsonLd = storeJsonLd;

export const websiteJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  publisher: { "@id": `${SITE_URL}/#store` },
  potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/shop?search={search_term_string}` }, "query-input": "required name=search_term_string" },
});

export const breadcrumbJsonLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absUrl(it.path) })),
});

export const productJsonLd = (p, price, imgAbs, reviews) => {
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: titleCase(p.name),
    image: [p.image, p.image2].filter((v, i, a) => v && a.indexOf(v) === i).map(imgAbs),
    description: productSeoDescription(p),
    sku: p.slug,
    category: titleCase(p.category || ""),
    url: absUrl(`/shop/${p.slug}`),
    offers: {
      "@type": "Offer",
      url: absUrl(`/shop/${p.slug}`),
      priceCurrency: "USD",
      price: price.toFixed(2),
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${SITE_URL}/#store` },
    },
  };
  if (p.brandName) data.brand = { "@type": "Brand", name: p.brandName };
  if (reviews && reviews.count > 0) data.aggregateRating = { "@type": "AggregateRating", ratingValue: reviews.average, reviewCount: reviews.count, bestRating: 5, worstRating: 1 };
  return data;
};

export const faqJsonLd = (faqs) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

// Local FAQs shown on the home and contact pages (also published as FAQPage structured data).
export const LOCAL_FAQS = [
  { q: "What are HD Smoke Shop's hours?", a: "We're open 10 AM to 10 PM, seven days a week." },
  { q: "Where is HD Smoke Shop, and can I walk in?", a: "Yes, walk-ins are welcome. Visit us at 481 N State Rd 434, Suite 1050, Altamonte Springs, FL 32714, in San Sebastian Square on SR 434. Shoppers from Longwood, Casselberry, Maitland, Winter Springs and Apopka are welcome in store." },
  { q: "Where do you deliver?", a: "We deliver to adults 21+ within Altamonte Springs, ZIP 32714. Order online at puff2door.com and enter your ZIP to confirm. If you're outside 32714, you're welcome to visit the store." },
  { q: "Do I need to be 21 and show ID?", a: "Yes. Everyone must be 21 or older with a valid, unexpired government-issued photo ID, both in store and at delivery. Orders are never left with anyone under 21." },
];

export const HOME_FAQS = [
  ...LOCAL_FAQS,
  { q: "What products does HD Smoke Shop sell?", a: "HD Smoke Shop carries disposable vapes, hemp-derived delta disposables, cartridges, edibles and smokeables, glass pipes, kratom and other smoke shop essentials from well-known brands. Browse the Shop page to see what's in stock, or stop by the store." },
  { q: "How can I track my order?", a: "After checkout you receive an order number by email. Enter it on the Track Order page to see your order status, from placed to confirmed, out for delivery and delivered." },
  { q: "What payment methods does HD Smoke Shop accept?", a: "The payment methods currently available for your device are shown at checkout. Complete payment through the secure option you select." },
];

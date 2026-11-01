import { BRAND } from "../mock";

export const SITE_URL = (process.env.REACT_APP_SITE_URL || "https://puff2door.com").replace(/\/$/, "");
export const SITE_NAME = "HD Smoke Shop";
export const DEFAULT_TITLE = "Online Smoke Shop & Vape Delivery | HD Smoke Shop";
export const DEFAULT_DESCRIPTION = "Shop vapes, smoking accessories and smoke shop essentials online at HD Smoke Shop. Convenient ordering, fast delivery and shipping right to your door.";
export const DEFAULT_IMAGE = `${SITE_URL}/img/og-image.jpg`;
export const LOGO_URL = `${SITE_URL}/img/logo.png`;

export const absUrl = (path = "/") => (path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`);

export const truncate = (text = "", max = 155) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/[\s,;:.-]+\S*$/, "")}…`;
};

export const titleCase = (s = "") => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bThc\b/g, "THC").replace(/\bThca\b/g, "THCA");

export const CATEGORY_SEO = {
  disposable: {
    title: "Disposable Vapes | Shop Online | HD Smoke Shop",
    description: "Browse disposable vapes online at HD Smoke Shop. Popular brands, high puff counts and a wide range of flavors with convenient local delivery in the Orlando area. 21+ only.",
    intro: "Shop disposable vapes online from top brands. Order at HD Smoke Shop for convenient delivery to your door in the Orlando area.",
  },
  delta: {
    title: "Delta Disposables | Shop Online | HD Smoke Shop",
    description: "Shop delta disposable vapes online at HD Smoke Shop. Order hemp-derived delta disposables with convenient local delivery in the Orlando area. Must be 21+ to purchase.",
    intro: "Hemp-derived delta disposable vapes from trusted brands, ordered online and delivered locally.",
  },
  "delta-cartridges": {
    title: "Delta Cartridges Online | HD Smoke Shop",
    description: "Order delta vape cartridges online at HD Smoke Shop. Hemp-derived delta carts from leading brands with convenient local delivery in the Orlando area. 21+ only.",
    intro: "510-thread delta cartridges from leading brands, available for online ordering and local delivery.",
  },
  "delta-edibles": {
    title: "Delta Edibles & Gummies Online | HD Smoke Shop",
    description: "Shop delta edibles and gummies online at HD Smoke Shop. Hemp-derived edibles from popular brands with convenient local delivery in the Orlando area. Must be 21+.",
    intro: "Hemp-derived delta gummies and edibles from popular brands, delivered to your door in the Orlando area.",
  },
  "delta-smokeables": {
    title: "Delta Smokeables & THCA Flower Online | HD Smoke Shop",
    description: "Browse delta smokeables and THCA flower online at HD Smoke Shop. Pre-rolls and flower from trusted brands with convenient local delivery in the Orlando area. 21+ only.",
    intro: "THCA flower, pre-rolls and other delta smokeables from trusted brands, ordered online for local delivery.",
  },
  "vape-accessories": {
    title: "Vape Accessories | HD Smoke Shop",
    description: "Shop vape accessories online at HD Smoke Shop. Batteries, chargers and vaping essentials with convenient local delivery in the Orlando area. 21+ only.",
    intro: "Vape accessories and essentials, ordered online and delivered locally.",
  },
  "glass-pipes": {
    title: "Glass Pipes & Smoking Accessories Online | HD Smoke Shop",
    description: "Shop glass pipes and smoking accessories online at HD Smoke Shop. Hand pipes, bubblers and glassware with convenient local delivery in the Orlando area. 21+ only.",
    intro: "Glass hand pipes, bubblers and smoking accessories from your online smoke shop, delivered locally.",
  },
  kratom: {
    title: "Kratom Products Online | HD Smoke Shop",
    description: "Order kratom and botanical products online at HD Smoke Shop. Capsules, extracts and more with convenient local delivery in the Orlando area. Must be 21+ to purchase.",
    intro: "Kratom capsules, extracts and botanical products available for online ordering and local delivery.",
  },
  "hemp-wraps": { title: "Hemp Wraps Online | HD Smoke Shop", description: "Shop hemp wraps online at HD Smoke Shop with convenient local delivery in the Orlando area. 21+ only.", intro: "Hemp wraps from popular brands, delivered locally." },
  "paper-cones": { title: "Rolling Papers & Cones Online | HD Smoke Shop", description: "Shop rolling papers and pre-rolled cones online at HD Smoke Shop with convenient local delivery in the Orlando area. 21+ only.", intro: "Rolling papers and pre-rolled cones, ordered online for local delivery." },
  lighter: { title: "Lighters & Torches Online | HD Smoke Shop", description: "Shop lighters and torches online at HD Smoke Shop with convenient local delivery in the Orlando area. 21+ only.", intro: "Lighters and torch lighters, delivered locally." },
  "air-freshner": { title: "Air Fresheners Online | HD Smoke Shop", description: "Shop air fresheners and odor eliminators online at HD Smoke Shop with convenient local delivery in the Orlando area.", intro: "Air fresheners and odor eliminators for your space." },
  "hookah-accessories": { title: "Hookah Accessories Online | HD Smoke Shop", description: "Shop hookah accessories online at HD Smoke Shop with convenient local delivery in the Orlando area. 21+ only.", intro: "Hookah accessories, ordered online for local delivery." },
  miscellaneous: { title: "Smoke Shop Essentials Online | HD Smoke Shop", description: "Browse smoke shop essentials and miscellaneous products online at HD Smoke Shop with convenient local delivery in the Orlando area. 21+ only.", intro: "Smoke shop essentials and other useful extras." },
};

export const categorySeo = (cat) => {
  if (!cat) return null;
  const name = titleCase(cat.name);
  return CATEGORY_SEO[cat.slug] || {
    title: `${name} | Shop Online | HD Smoke Shop`,
    description: `Shop ${name.toLowerCase()} online at HD Smoke Shop with convenient local delivery in the Orlando area. Must be 21+ to purchase.`,
    intro: `${name} available for online ordering and local delivery.`,
  };
};

export const brandSeo = (brand) => ({
  title: `${brand.name} Products Online | HD Smoke Shop`,
  description: `Shop ${brand.name} vapes and smoke shop products online at HD Smoke Shop. Order ${brand.name} with convenient local delivery in the Orlando area. Must be 21+ to purchase.`,
  intro: `${brand.name} products available at HD Smoke Shop for online ordering and local delivery.`,
});

const fmtPuffs = (n) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

export const productSeoDescription = (p) => {
  const cat = titleCase(p.category || "").replace(/s$/, "");
  const parts = [`${titleCase(p.name)}${p.brandName ? ` by ${p.brandName}` : ""}`];
  const specs = [];
  if (p.puffs) specs.push(`up to ${fmtPuffs(p.puffs)} puffs`);
  if (p.flavors?.length) specs.push(`${p.flavors.slice(0, 3).join(", ")} flavor${p.flavors.length > 1 ? "s" : ""}`);
  parts.push(specs.length ? ` – ${cat.toLowerCase()} with ${specs.join(" and ")}.` : ` – ${cat.toLowerCase()} available online.`);
  parts.push(` $${(p.salePrice && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price).toFixed(2)} at HD Smoke Shop, Orlando-area delivery. 21+ only.`);
  return truncate(parts.join(""), 158);
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

export const organizationJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: LOGO_URL,
  image: DEFAULT_IMAGE,
  description: "Online smoke shop and vape shop offering online ordering with local delivery in the Orlando, Florida area.",
  telephone: BRAND.phone,
  email: BRAND.email,
  address: { "@type": "PostalAddress", streetAddress: "481 N State Rd 434", addressLocality: "Altamonte Springs", addressRegion: "FL", postalCode: "32714", addressCountry: "US" },
  areaServed: { "@type": "GeoCircle", geoMidpoint: { "@type": "GeoCoordinates", latitude: 28.3774, longitude: -81.1888 }, geoRadius: "32000" },
  sameAs: ["https://www.instagram.com/puff2doors/"],
  contactPoint: { "@type": "ContactPoint", telephone: BRAND.phone, contactType: "customer service", email: BRAND.email, areaServed: "US" },
});

export const websiteJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  publisher: { "@id": `${SITE_URL}/#organization` },
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
      seller: { "@id": `${SITE_URL}/#organization` },
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

export const HOME_FAQS = [
  { q: "What products does HD Smoke Shop sell?", a: "HD Smoke Shop is an online smoke shop carrying disposable vapes, hemp-derived delta disposables, cartridges, edibles and smokeables, glass pipes and kratom products from well-known brands. Browse the Shop page to see everything currently in stock." },
  { q: "Does HD Smoke Shop offer local delivery?", a: "Yes. Use the ZIP code checker on the homepage to confirm whether your address is in the current delivery area. Available windows and any delivery fee are shown before payment." },
  { q: "Does HD Smoke Shop ship orders outside Orlando?", a: "HD Smoke Shop currently serves its configured local delivery area. Enter your ZIP on the Delivery Area page to check availability before ordering." },
  { q: "Do I need to be 21 or older to order?", a: "Yes. You must be 21 or older to purchase from HD Smoke Shop. Age is confirmed when you enter the site and a valid government-issued ID may be checked at delivery." },
  { q: "How can I track my order?", a: "After checkout you receive an order number by email. Enter it on the Track Order page to see your order status, from placed to confirmed, out for delivery and delivered." },
  { q: "What payment methods does HD Smoke Shop accept?", a: "The payment methods currently available for your device are shown at checkout. Complete payment through the secure option you select." },
];

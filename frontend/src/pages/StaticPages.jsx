import React from "react";
import { Link } from "react-router-dom";
import { Truck, ShieldCheck, Award, Heart } from "lucide-react";
import { useCatalog } from "../context/CatalogContext";
import BrandLogo from "../components/BrandLogo";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd, faqJsonLd } from "../seo/config";
import LocalFaq from "../components/LocalFaq";
import VisitStore from "../components/VisitStore";

export const BrandsPage = () => {
  const { activeBrands: brands } = useCatalog();
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-10">
      <Seo
        title="Vape & Smoke Shop Brands | HD Smoke Shop"
        description="Browse every vape and smoke shop brand carried by HD Smoke Shop, including Geek Bar, Lost Mary, Fume, Hidden Hills and more. Shop in our Altamonte Springs store or order online for local delivery."
        path="/brands"
        jsonLd={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Brands", path: "/brands" }])}
      />
      <div className="relative overflow-hidden rounded-xl bg-neutral-900 px-8 py-10 mb-8">
        <div className="absolute -right-10 -bottom-16 h-56 w-56 rounded-full bg-emerald-600/20 blur-2xl" />
        <h1 className="font-heading text-3xl sm:text-4xl font-700 text-white uppercase tracking-tight relative">Our Brands</h1>
        <p className="text-neutral-400 text-sm mt-1 relative">Shop {brands.length} trusted vape and smoke shop brands</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4" data-testid="brands-grid">
        {brands.map((b) => (
          <Link key={b.slug} to={`/brand/${b.slug}`} title={`Shop ${b.name} products`} data-testid={`brand-tile-${b.slug}`} className="group aspect-square bg-white border border-neutral-200 rounded-lg grid place-items-center p-4 hover:shadow-lg hover:border-emerald-200 transition-all text-center">
            <BrandLogo brand={b} showCount />
          </Link>
        ))}
      </div>
    </div>
  );
};

export const AboutPage = () => {
  const { activeCategories } = useCatalog();
  const values = [
    { icon: Truck, t: "Visit or Delivery", d: "Walk in at our SR 434 store, or order online for delivery within Altamonte Springs, ZIP 32714, in plain packaging." },
    { icon: ShieldCheck, t: "21+ Only", d: "A valid 21+ photo ID is required in store and at delivery. We never sell to minors." },
    { icon: Award, t: "Top Brands Only", d: "We curate popular names in vape, delta and smoke culture." },
    { icon: Heart, t: "Customer First", d: "Friendly staff in store and a straightforward online ordering experience." },
  ];
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-10">
      <Seo
        title="About HD Smoke Shop – Altamonte Springs Smoke Shop"
        description="Locally owned smoke shop at 481 N State Rd 434, Suite 1050, Altamonte Springs. Meet our team and learn how we serve adults 21+."
        path="/about"
        jsonLd={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])}
      />
      <div className="relative overflow-hidden rounded-2xl bg-neutral-900 px-8 py-16 mb-12 text-center">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-600/20 blur-2xl" />
        <h1 className="font-heading text-4xl sm:text-5xl font-700 text-white uppercase tracking-tight relative">About HD Smoke Shop</h1>
        <p className="text-neutral-300 max-w-2xl mx-auto mt-4 relative">Visit our Altamonte Springs store or order for delivery. We're a locally owned smoke shop on SR 434 carrying disposables, delta products, kratom, glass and everything in between — open 10 AM–10 PM daily.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
        {values.map((v, i) => (
          <div key={i} className="border border-neutral-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
            <span className="grid place-items-center h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 mb-4"><v.icon className="h-6 w-6" aria-hidden="true" /></span>
            <h2 className="font-heading text-lg uppercase mb-2">{v.t}</h2>
            <p className="text-sm text-neutral-500 leading-relaxed">{v.d}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <img src="/img/hero-raz.webp" alt="Disposable vapes available from HD Smoke Shop" loading="lazy" width="1264" height="848" className="rounded-xl w-full h-full object-cover" />
        <div>
          <span className="block h-1 w-12 bg-emerald-600 mb-4 rounded-full" />
          <h2 className="font-heading text-3xl font-700 uppercase mb-4">Your Smoke Shop in Altamonte Springs</h2>
          <p className="text-neutral-600 leading-relaxed mb-4">Founded with a simple mission — make popular smoke and vape products easy to find, whether you shop in store or order online. We stock products across {activeCategories.length} categories from well-known brands. Walk-ins are welcome at 481 N State Rd 434, Suite 1050, or order through this website for local delivery within ZIP 32714.</p>
          <p className="text-neutral-600 leading-relaxed mb-6">Whether you're after the latest 25K disposable, THCA flower, gummies or a classic glass piece, HD Smoke Shop has you covered — in store, or with age-verified checkout and discreet delivery.</p>
          <Link to="/shop" className="inline-block px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors">Shop All Products</Link>
        </div>
      </div>
      <VisitStore className="mt-14" />
    </div>
  );
};


const FAQ_SECTIONS = [
  {
    title: "Ordering & Delivery",
    faqs: [
      { q: "Where do you deliver?", a: "We deliver only within Altamonte Springs, ZIP 32714. Enter your ZIP at checkout to confirm. If you're outside 32714, you're welcome to shop in store." },
      { q: "Is there an order minimum for delivery?", a: "No. There is no minimum order for delivery. The delivery fee and any free-delivery threshold are shown in your cart before you pay." },
      { q: "How fast is delivery?", a: "Pick from the delivery windows shown at checkout. They reflect our current hours and driver capacity, so the earliest available window is always listed first." },
      { q: "How do I track my order?", a: "After checkout you get an order number by email. Enter it on the Track Order page to follow your order from placed to out for delivery and delivered." },
      { q: "Can I change or cancel my order?", a: "Call us at (407) 625-6826 as soon as possible. We can usually update or cancel an order before it leaves the store." },
    ],
  },
  {
    title: "Age & ID",
    faqs: [
      { q: "Do I need to be 21?", a: "Yes. Every product we sell is for adults 21 and older only, both online and in store." },
      { q: "What ID do I need at delivery?", a: "A valid, unexpired government-issued photo ID showing you are 21 or older. The person named on the order must show it. Orders are never left at the door or handed to anyone under 21." },
      { q: "What if no one 21+ is available when the driver arrives?", a: "The driver can't complete the delivery and the order comes back to the store. Contact us to arrange another window; see our Refund Policy for how returned deliveries are handled." },
    ],
  },
  {
    title: "Payment",
    faqs: [
      { q: "What payment methods do you accept?", a: "Online orders are paid at checkout with the secure payment options shown for your device. In store we accept cards." },
      { q: "Can I pay the driver in cash?", a: "No. Our drivers don't accept cash, so please pay online when you place a delivery order." },
    ],
  },
  {
    title: "Visiting the Store",
    faqs: [
      { q: "Where is HD Smoke Shop?", a: "481 N State Rd 434, Suite 1050, Altamonte Springs, FL 32714. Walk-ins are always welcome." },
      { q: "What are your hours?", a: "10 AM to 10 PM every day, including holidays." },
      { q: "Is there parking?", a: "Yes, free parking is available in the plaza right outside the store." },
      { q: "How can I contact you?", a: "Call (407) 625-6826, use the Contact page, or message us on Instagram at @hd.smokeshop." },
    ],
  },
  {
    title: "Products & Returns",
    faqs: [
      { q: "What do you sell?", a: "Disposable vapes and pods, hemp-derived delta disposables, cartridges, edibles and smokeables, kratom, cigars and wraps, rolling papers and cones, glass, lighters, hookah supplies and other smoke shop essentials from well-known brands." },
      { q: "Is the stock on the website accurate?", a: "Yes. The website is synced with our in-store register throughout the day, so what you see online reflects what's on our shelves." },
      { q: "Can I return an item?", a: "Opened or used consumable products generally can't be returned. If an item is missing, wrong, damaged or defective, contact us right away with your order number. See our Refund Policy for details." },
    ],
  },
];

export const FaqPage = () => {
  const all = FAQ_SECTIONS.flatMap((section) => section.faqs);
  return (
    <div className="max-w-[960px] mx-auto px-4 py-10">
      <Seo
        title="FAQ – HD Smoke Shop Altamonte Springs"
        description="Answers about delivery in ZIP 32714, 21+ ID checks, payment, store hours, parking and returns at HD Smoke Shop in Altamonte Springs."
        path="/faq"
        jsonLd={[breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "FAQ", path: "/faq" }]), faqJsonLd(all)]}
      />
      <div className="relative overflow-hidden rounded-2xl bg-neutral-900 px-8 py-12 mb-10">
        <h1 className="font-heading text-4xl text-white uppercase tracking-wide">Frequently Asked Questions</h1>
        <p className="text-neutral-400 text-sm mt-2">Delivery, ID, payment, store visits and returns. Still have a question? <Link to="/contact" className="text-emerald-400 font-semibold hover:underline">Contact us</Link>.</p>
      </div>
      <div className="space-y-10" data-testid="faq-page">
        {FAQ_SECTIONS.map((section, i) => (
          <LocalFaq key={section.title} faqs={section.faqs} heading={section.title} testId={`faq-${i}`} />
        ))}
      </div>
    </div>
  );
};

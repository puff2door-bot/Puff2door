import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck, ShieldCheck, Clock, BadgePercent, MapPin } from "lucide-react";
import HeroSlider from "../components/HeroSlider";
import DealOfTheDay from "../components/DealOfTheDay";
import ProductCard from "../components/ProductCard";
import { DeliveryBanner, DeliveryChecker } from "../components/DeliveryZone";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import { imgUrl } from "../api";
import Seo from "../seo/Seo";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, HOME_FAQS, faqJsonLd, titleCase } from "../seo/config";

const tabCats = [
  { name: "Disposable Vapes", slug: "disposable" },
  { name: "Delta Disposables", slug: "delta" },
  { name: "Delta Cartridges", slug: "delta-cartridges" },
  { name: "Delta Edibles", slug: "delta-edibles" },
  { name: "Delta Smokeables", slug: "delta-smokeables" },
];

const features = [
  { icon: Truck, title: "Local Delivery", desc: "Straight to your door in the Orlando area" },
  { icon: ShieldCheck, title: "21+ Age Verified", desc: "ID checked on every delivery" },
  { icon: Clock, title: "Same-Day Local", desc: "Order today, puff today" },
  { icon: BadgePercent, title: "Best Prices", desc: "Deals on top vape brands" },
];

const SectionHeader = ({ title, link, linkLabel = "View All" }) => (
  <div className="flex items-end justify-between mb-6">
    <div>
      <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
      <h2 className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 uppercase tracking-tight">
        {title}
      </h2>
    </div>
    {link && (
      <Link to={link} className="hidden sm:inline-flex items-center gap-1 text-sm font-bold text-emerald-600 hover:gap-2 transition-all">
        {linkLabel} <ArrowRight className="h-4 w-4" />
      </Link>
    )}
  </div>
);

const Home = () => {
  const [activeTab, setActiveTab] = useState("disposable");
  const { newProducts, getProductsByCategory, promoTiles, activeCategories, activeBrands } = useCatalog();
  const { delivery, pricing } = useCart();
  const tabProducts = getProductsByCategory(activeTab).slice(0, 12);
  const tabs = tabCats.filter((t) => activeCategories.some((c) => c.slug === t.slug));

  return (
    <div>
      <Seo title={DEFAULT_TITLE} description={DEFAULT_DESCRIPTION} path="/" jsonLd={faqJsonLd(HOME_FAQS)} />
      <DeliveryBanner />
      <DeliveryChecker />
      <HeroSlider />

      {/* Intro / H1 */}
      <section className="bg-white border-b" data-testid="home-intro">
        <div className="max-w-[1280px] mx-auto px-4 py-8">
          <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-700 text-neutral-900 uppercase tracking-tight mb-3">
            Online Smoke Shop &amp; Vape Delivery
          </h1>
          <p className="text-neutral-600 leading-relaxed max-w-3xl">
            Puff2door is your online smoke shop for disposable vapes, hemp-derived delta products, glass pipes, kratom and other
            smoke shop essentials. Browse trusted brands, order online in minutes and get local vape delivery to your door in the
            Orlando, Florida area — within {delivery.radiusMiles} miles of ZIP {delivery.zip}. Adults 21+ only.
          </p>
        </div>
      </section>

      {/* Feature bar */}
      <section className="bg-neutral-50 border-b" aria-labelledby="why-shop-heading">
        <div className="max-w-[1280px] mx-auto px-4 pt-6">
          <h2 id="why-shop-heading" className="font-heading text-xl sm:text-2xl font-700 text-neutral-900 uppercase tracking-tight">Why Shop With Puff2door?</h2>
        </div>
        <div className="max-w-[1280px] mx-auto px-4 grid grid-cols-2 lg:grid-cols-4 divide-x divide-neutral-200">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-3 py-5 px-4">
              <span className="grid place-items-center h-11 w-11 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                <f.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold text-sm text-neutral-900">{f.title}</h3>
                <p className="text-xs text-neutral-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <DealOfTheDay />

      {/* Category pills */}
      <section className="max-w-[1280px] mx-auto px-4 pt-10">
        <SectionHeader title="Shop Popular Categories" link="/shop" linkLabel="Shop All Products" />
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2">
          {activeCategories.map((c) => (
            <Link
              key={c.slug}
              to={`/product-category/${c.slug}`}
              className="shrink-0 px-4 py-2 rounded-full border border-neutral-300 text-xs font-semibold text-neutral-700 hover:border-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors uppercase tracking-wide"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {/* Promo blocks */}
      <section className="max-w-[1280px] mx-auto px-4 pt-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {promoTiles.map((b) => (
            <Link key={b.id} to={b.link} data-testid={`promo-tile-${b.id}`} className="group relative rounded-xl overflow-hidden aspect-[4/3] bg-neutral-100 border border-neutral-200 hover:border-emerald-300 hover:shadow-lg transition-all">
              {b.tag && <span className="absolute top-3 left-3 z-10 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">{b.tag}</span>}
              <img src={imgUrl(b.image)} alt={`${titleCase(b.label)} available from Puff2door`} loading="lazy" className="h-full w-full object-contain p-6 pb-16 group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent p-4 pt-8">
                <p className="text-neutral-900 text-xs font-bold uppercase tracking-wide line-clamp-1">{b.label}</p>
                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold mt-1">{b.price != null ? `$${b.price.toFixed(2)} · ` : ""}Shop Now <ArrowRight className="h-3.5 w-3.5" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* New Products */}
      <section className="max-w-[1280px] mx-auto px-4 pt-14">
        <SectionHeader title="New Vape Products" link="/shop" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {newProducts.slice(0, 15).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Top Categories tabbed */}
      <section className="max-w-[1280px] mx-auto px-4 pt-14">
        <SectionHeader title="Top Categories" />
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 border-b" role="tablist" aria-label="Top categories">
          {tabs.map((t) => (
            <button
              key={t.slug}
              role="tab"
              aria-selected={activeTab === t.slug}
              onClick={() => setActiveTab(t.slug)}
              className={`shrink-0 px-4 py-3 text-sm font-bold uppercase tracking-wide border-b-2 transition-colors ${
                activeTab === t.slug
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {tabProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <div className="text-center mt-8">
          <Link to={`/product-category/${activeTab}`} className="inline-flex items-center gap-2 px-7 py-3 border-2 border-neutral-900 text-neutral-900 font-bold rounded-full hover:bg-neutral-900 hover:text-white transition-colors uppercase text-sm tracking-wide">
            View All {tabCats.find((t) => t.slug === activeTab)?.name} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Brands */}
      <section className="max-w-[1280px] mx-auto px-4 pt-14">
        <SectionHeader title="Shop By Brand" link="/brands" linkLabel="All Brands" />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          {[...activeBrands].sort((a, b) => b.count - a.count).slice(0, 16).map((b) => (
            <Link key={b.slug} to={`/brand/${b.slug}`} title={`Shop ${b.name} products`} data-testid={`home-brand-tile-${b.slug}`} className="group aspect-square bg-white border border-neutral-200 rounded-lg grid place-items-center p-3 hover:shadow-lg hover:border-emerald-200 transition-all text-center">
              {b.image ? (
                <img src={b.image} alt={`${b.name} logo`} loading="lazy" className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform" />
              ) : (
                <span className="font-heading text-sm sm:text-base uppercase text-neutral-900 leading-tight group-hover:text-emerald-700 transition-colors">{b.name}</span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Delivery */}
      <section className="max-w-[1280px] mx-auto px-4 pt-14" data-testid="home-delivery-section">
        <SectionHeader title="Convenient Delivery & Shipping" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-neutral-200 rounded-xl p-6 flex gap-4">
            <span className="grid place-items-center h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 shrink-0"><MapPin className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <h3 className="font-heading text-lg uppercase mb-2">Vape Delivery in Orlando, FL</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Puff2door is an online store with local smoke shop delivery — we bring your order to addresses within {delivery.radiusMiles} miles of ZIP {delivery.zip}{" "}
                in the Orlando area. Check your ZIP code at the top of this page to confirm we deliver to you.
              </p>
            </div>
          </div>
          <div className="border border-neutral-200 rounded-xl p-6 flex gap-4">
            <span className="grid place-items-center h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 shrink-0"><Truck className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <h3 className="font-heading text-lg uppercase mb-2">Fees &amp; Order Tracking</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Local delivery is free on orders over ${pricing.freeDeliveryMin}; a ${pricing.deliveryFee} delivery fee applies below that. Every order gets an order number you can follow on our{" "}
                <Link to="/track" className="text-emerald-600 font-semibold hover:underline">order tracking page</Link>. A valid 21+ ID is required at delivery.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-[1280px] mx-auto px-4 pt-14" data-testid="home-faq">
        <SectionHeader title="Frequently Asked Questions" />
        <Accordion type="single" collapsible className="border border-neutral-200 rounded-xl px-6">
          {HOME_FAQS.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left font-semibold text-neutral-900 hover:text-emerald-700 hover:no-underline">
                <h3 className="text-base font-semibold">{f.q}</h3>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-neutral-600 leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA banner */}
      <section className="max-w-[1280px] mx-auto px-4 pt-14">
        <div className="relative overflow-hidden rounded-2xl bg-neutral-900 px-8 py-12 sm:px-14 sm:py-16">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-600/20 blur-2xl" />
          <div className="relative max-w-lg">
            <h2 className="font-heading text-3xl sm:text-4xl font-700 text-white uppercase leading-tight mb-3">
              Get 10% off your first order
            </h2>
            <p className="text-neutral-300 mb-6">Join the Puff2Door club for exclusive deals, new drops and same-day delivery updates.</p>
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col sm:flex-row gap-3 max-w-md">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input id="newsletter-email" type="email" required placeholder="Enter your email" className="flex-1 px-5 py-3 rounded-full text-sm outline-none" />
              <button className="px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors">Subscribe</button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;

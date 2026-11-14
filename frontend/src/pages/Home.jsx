import React, { useState } from "react";
import { ReorderCard } from "../components/StoreExtras";
import { Link } from "react-router-dom";
import { ArrowRight, Truck, ShieldCheck, Clock, BadgePercent, MapPin } from "lucide-react";
import HeroSlider from "../components/HeroSlider";
import DealOfTheDay from "../components/DealOfTheDay";
import ProductCard from "../components/ProductCard";
import { DeliveryBanner } from "../components/DeliveryZone";
import DeliveryCountdown from "../components/DeliveryCountdown";
import BrandLogo from "../components/BrandLogo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import api, { imgUrl } from "../api";
import Seo from "../seo/Seo";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, HOME_FAQS, STORE, faqJsonLd, titleCase } from "../seo/config";
import PersonalizedShelf from "../components/PersonalizedShelf";
import VisitStore from "../components/VisitStore";
import GoogleReviews from "../components/GoogleReviews";
import { useToast } from "../hooks/use-toast";
import HomeConceptHero from "../components/HomeConceptHero";
import { resolveSiteTheme } from "../lib/siteTheme";

const tabCats = [
  { name: "Disposable Vapes", slug: "disposable" },
  { name: "Delta Disposables", slug: "delta" },
  { name: "Delta Cartridges", slug: "delta-cartridges" },
  { name: "Delta Edibles", slug: "delta-edibles" },
  { name: "Delta Smokeables", slug: "delta-smokeables" },
];

const baseFeatures = [
  { icon: Truck, title: "Local Delivery", desc: "Delivery in ZIP 32714 or shop our SR 434 store" },
  { icon: ShieldCheck, title: "21+ Age Verified", desc: "ID checked on every delivery" },
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
  const { toast } = useToast();
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterBusy, setNewsletterBusy] = useState(false);
  const subscribe = async (e) => {
    e.preventDefault();
    setNewsletterBusy(true);
    try {
      const { data } = await api.post("/newsletter", { email: newsletterEmail });
      toast({ title: "Subscribed", description: data.message });
      setNewsletterEmail("");
    } catch (err) {
      toast({ title: "Could not subscribe", description: err?.response?.data?.detail || "Please try again.", variant: "destructive" });
    } finally {
      setNewsletterBusy(false);
    }
  };
  const { newProducts, getProductsByCategory, promoTiles, activeCategories, activeBrands } = useCatalog();
  const { delivery, pricing, presentation } = useCart();
  const lakeNona = delivery.lakeNonaEnabled === true;
  const areaText = lakeNona ? "in Altamonte Springs (ZIP 32714) and Lake Nona (ZIPs 32832 and 32827)" : "within ZIP 32714";
  const features = [
    lakeNona ? { ...baseFeatures[0], desc: "Altamonte Springs & Lake Nona, or shop our SR 434 store" } : baseFeatures[0],
    baseFeatures[1],
    delivery.sameDayEnabled === true
      ? { icon: Clock, title: "Same-Day Local", desc: "Order before cutoff for today's delivery" }
      : { icon: Clock, title: "Scheduled Delivery", desc: "Choose an available delivery window" },
    baseFeatures[2],
  ];
  const homeFaqs = HOME_FAQS.map((faq) => {
    if (faq.q === "Where do you deliver?") {
      const feeText = pricing.freeDeliveryMin > 0
        ? `Local delivery is free on orders over $${pricing.freeDeliveryMin}${pricing.deliveryFee > 0 ? `; a $${pricing.deliveryFee} fee applies below that amount` : ""}.`
        : "Local delivery is free.";
      return { ...faq, a: `${faq.a} ${feeText}` };
    }
    return faq;
  });
  const tabProducts = getProductsByCategory(activeTab).slice(0, 12);
  const tabs = tabCats.filter((t) => activeCategories.some((c) => c.slug === t.slug));
  const savedLayout = presentation?.homepageLayout || "classic";
  const layout = resolveSiteTheme(savedLayout);
  const conceptLayout = layout === "neon" || layout === "blue";
  const intro = (
    // Phones: the section and its box "dissolve" (display: contents) so the heading stays on top while the
    // paragraph moves to just above the footer (order-1). Larger screens: one block, unchanged.
    <section className="home-intro contents sm:block bg-white border-b" data-testid="home-intro">
      <div className="contents sm:block max-w-[1280px] mx-auto px-4 py-6 sm:py-8">
        <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full mx-4 mt-6 sm:mx-0 sm:mt-0" />
        <h1 className="font-heading text-[26px] leading-tight sm:leading-normal sm:text-4xl lg:text-5xl font-700 text-neutral-900 uppercase tracking-tight mb-1 px-4 sm:px-0 sm:mb-3">Altamonte Springs Smoke Shop &amp; Local Delivery</h1>
        <p className="order-1 sm:order-none text-neutral-600 leading-relaxed max-w-3xl px-4 pt-10 pb-6 sm:p-0 text-sm sm:text-base">HD Smoke Shop is a smoke shop at 481 N State Rd 434, Suite 1050 in Altamonte Springs, FL, open 10 AM–10 PM daily. Walk-ins are welcome, or order disposable vapes, hemp-derived delta products, glass pipes, kratom and other smoke shop essentials online for local delivery {areaText}. Adults 21+ only, ID required.</p>
      </div>
    </section>
  );
  const featureBar = (
    <section className="home-feature-bar order-1 sm:order-none bg-neutral-50 border-b" aria-labelledby="why-shop-heading">
      <div className="max-w-[1280px] mx-auto px-4 pt-6"><h2 id="why-shop-heading" className="font-heading text-xl sm:text-2xl font-700 text-neutral-900 uppercase tracking-tight">Why Shop With HD Smoke Shop?</h2></div>
      <div className="home-feature-grid max-w-[1280px] mx-auto px-4 grid grid-cols-2 lg:grid-cols-4 divide-x divide-neutral-200">
        {features.map((f, i) => <div key={i} className="home-feature flex items-center gap-2.5 py-3 px-3 sm:gap-3 sm:py-5 sm:px-4"><span className="grid place-items-center h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-emerald-100 text-emerald-700 shrink-0"><f.icon className="h-5 w-5" aria-hidden="true" /></span><div><h3 className="font-semibold text-sm text-neutral-900">{f.title}</h3><p className="text-xs text-neutral-500">{f.desc}</p></div></div>)}
      </div>
    </section>
  );

  return (
    <div className={`home-shell flex flex-col sm:block home-layout-${layout}`} data-home-layout={layout}>
      <Seo title={DEFAULT_TITLE} description={DEFAULT_DESCRIPTION} path="/" jsonLd={faqJsonLd(homeFaqs)} />
      <DeliveryBanner />
      <DeliveryCountdown />
      {conceptLayout ? (
        <>
          <HomeConceptHero layout={layout} products={newProducts} categories={activeCategories} sameDayEnabled={delivery.sameDayEnabled === true} />
          {featureBar}
          {intro}
        </>
      ) : (
        <>
          {layout === "minimal" && intro}
          <div className="home-hero"><HeroSlider /></div>
          {layout === "showcase" ? <>{featureBar}{intro}</> : <>{layout !== "minimal" && intro}{featureBar}</>}
        </>
      )}

      <ReorderCard />
      <DealOfTheDay />
      <PersonalizedShelf />

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p2d-phone-span">
          {promoTiles.map((b) => (
            <Link key={b.id} to={b.link} data-testid={`promo-tile-${b.id}`} className="group relative rounded-xl overflow-hidden aspect-[4/3] bg-neutral-100 border border-neutral-200 hover:border-emerald-300 hover:shadow-lg transition-all">
              {b.tag && <span className="absolute top-3 left-3 z-10 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">{b.tag}</span>}
              <img src={imgUrl(b.image)} alt={`${titleCase(b.label)} available from HD Smoke Shop`} loading="lazy" className="h-full w-full object-contain p-6 pb-16 group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent p-4 pt-8">
                <p className="text-neutral-900 text-xs font-bold uppercase tracking-wide line-clamp-1">{b.label}</p>
                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold mt-1">{b.price != null ? `$${b.price.toFixed(2)} · ` : ""}Shop Now <ArrowRight className="h-3.5 w-3.5" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* New Products */}
      <section className="max-w-[1280px] mx-auto px-4 pt-10 sm:pt-14">
        <SectionHeader title="New Vape Products" link="/shop" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 p2d-cap15 p2d-phone-even">
          {newProducts.slice(0, 16).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Top Categories tabbed */}
      <section className="max-w-[1280px] mx-auto px-4 pt-10 sm:pt-14">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 p2d-phone-even">
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
      <section className="max-w-[1280px] mx-auto px-4 pt-10 sm:pt-14">
        <SectionHeader title="Shop By Brand" link="/brands" linkLabel="All Brands" />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-4 p2d-phone-3">
          {[...activeBrands].sort((a, b) => b.count - a.count).slice(0, 16).map((b) => (
            <Link key={b.slug} to={`/brand/${b.slug}`} title={`Shop ${b.name} products`} data-testid={`home-brand-tile-${b.slug}`} className="group aspect-square bg-white border border-neutral-200 rounded-lg grid place-items-center p-3 hover:shadow-lg hover:border-emerald-200 transition-all text-center">
              <BrandLogo brand={b} textClass="text-sm sm:text-base" />
            </Link>
          ))}
        </div>
      </section>

      {/* Delivery */}
      <section className="max-w-[1280px] mx-auto px-4 pt-10 sm:pt-14" data-testid="home-delivery-section">
        <SectionHeader title="Convenient Delivery & Shipping" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-neutral-200 rounded-xl p-6 flex gap-4">
            <span className="grid place-items-center h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 shrink-0"><MapPin className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <h3 className="font-heading text-lg uppercase mb-2">Altamonte Springs Delivery &amp; Walk-Ins</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Visit our Altamonte Springs store on SR 434 or order for delivery. We deliver to adults 21+ {lakeNona ? "in Altamonte Springs (ZIP 32714) and Lake Nona (ZIPs 32832 and 32827)" : "within Altamonte Springs, ZIP 32714"} — check your ZIP at the top of this page or see{" "}
                <Link to="/delivery-area" className="text-emerald-600 font-semibold hover:underline">our delivery area</Link>. Shopping from Longwood, Casselberry, Maitland, Winter Springs or Apopka? Walk-ins are welcome at the store.
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

      {/* Real customer reviews (hidden until the owner turns them on in Admin → Reviews) */}
      <section className="max-w-[1280px] mx-auto px-4 pt-10 sm:pt-14" data-testid="home-reviews">
        <GoogleReviews placement="homepage" title="What Our Customers Say" reviewUrl={STORE.googleReviewUrl} />
      </section>

      {/* Local store proof */}
      <div className="max-w-[1280px] mx-auto px-4 pt-10 sm:pt-14">
        <VisitStore heading="Visit HD Smoke Shop in Altamonte Springs" />
      </div>

      {/* FAQ */}
      <section className="max-w-[1280px] mx-auto px-4 pt-10 sm:pt-14" data-testid="home-faq">
        <SectionHeader title="Frequently Asked Questions" />
        <Accordion type="single" collapsible className="border border-neutral-200 rounded-xl px-6">
          {homeFaqs.map((f, i) => (
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
      <section className="max-w-[1280px] mx-auto px-4 pt-10 sm:pt-14">
        <div className="relative overflow-hidden rounded-2xl bg-neutral-900 px-8 py-12 sm:px-14 sm:py-16">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-600/20 blur-2xl" />
          <div className="relative max-w-lg">
            <h2 className="font-heading text-3xl sm:text-4xl font-700 text-white uppercase leading-tight mb-3">
              Get 10% off your first order
            </h2>
            <p className="text-neutral-300 mb-6">Join the HD Smoke Shop club for exclusive deals, new drops and local delivery updates.</p>
            <form onSubmit={subscribe} className="flex flex-col sm:flex-row gap-3 max-w-md">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input id="newsletter-email" type="email" required placeholder="Enter your email" className="flex-1 px-5 py-3 rounded-full text-sm outline-none" value={newsletterEmail} onChange={(e) => setNewsletterEmail(e.target.value)} />
              <button disabled={newsletterBusy} className="px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{newsletterBusy ? "Subscribing…" : "Subscribe"}</button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;

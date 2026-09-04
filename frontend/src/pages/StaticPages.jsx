import React from "react";
import { Link } from "react-router-dom";
import { Truck, ShieldCheck, Award, Heart } from "lucide-react";
import { useCatalog } from "../context/CatalogContext";
import BrandLogo from "../components/BrandLogo";
import { useCart } from "../context/CartContext";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd } from "../seo/config";

export const BrandsPage = () => {
  const { activeBrands: brands } = useCatalog();
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-10">
      <Seo
        title="Vape & Smoke Shop Brands | Puff2door"
        description="Browse every vape and smoke shop brand carried by Puff2door, including Geek Bar, Lost Mary, Fume, Hidden Hills and more. Order online for local delivery in the Orlando area."
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
  const { delivery } = useCart();
  const values = [
    { icon: Truck, t: "Local Delivery", d: `Orders delivered to your door within ${delivery.radiusMiles} miles of ZIP ${delivery.zip} in the Orlando area, in plain packaging.` },
    { icon: ShieldCheck, t: "21+ Only", d: "Age is confirmed on the site and a valid ID is checked at delivery. We never sell to minors." },
    { icon: Award, t: "Top Brands Only", d: "We curate popular names in vape, delta and smoke culture." },
    { icon: Heart, t: "Customer First", d: "Friendly support and a straightforward online ordering experience." },
  ];
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-10">
      <Seo
        title="About Puff2door | Online Smoke Shop in Orlando, FL"
        description="Puff2door is an online smoke shop offering vapes, delta products, glass and smoke shop essentials with local delivery in the Orlando, Florida area. Learn how we work."
        path="/about"
        jsonLd={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])}
      />
      <div className="relative overflow-hidden rounded-2xl bg-neutral-900 px-8 py-16 mb-12 text-center">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-600/20 blur-2xl" />
        <h1 className="font-heading text-4xl sm:text-5xl font-700 text-white uppercase tracking-tight relative">About Puff2Door</h1>
        <p className="text-neutral-300 max-w-2xl mx-auto mt-4 relative">Puffs delivered to your door. We're an online smoke &amp; vape shop serving the Orlando area with disposables, delta products, kratom, glass and everything in between.</p>
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
        <img src="/img/hero-raz.webp" alt="Disposable vapes available from Puff2door" loading="lazy" width="1264" height="848" className="rounded-xl w-full h-full object-cover" />
        <div>
          <span className="block h-1 w-12 bg-emerald-600 mb-4 rounded-full" />
          <h2 className="font-heading text-3xl font-700 uppercase mb-4">Your Online Smoke Shop in Orlando</h2>
          <p className="text-neutral-600 leading-relaxed mb-4">Founded with a simple mission — make popular smoke and vape products easy to order online and deliver them fast. We stock products across {activeCategories.length} categories from well-known brands, and everything is ordered through this website for local delivery rather than a walk-in storefront.</p>
          <p className="text-neutral-600 leading-relaxed mb-6">Whether you're after the latest 25K disposable, THCA flower, gummies or a classic glass piece, Puff2Door has you covered — with age-verified checkout and discreet delivery.</p>
          <Link to="/shop" className="inline-block px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors">Shop All Products</Link>
        </div>
      </div>
    </div>
  );
};

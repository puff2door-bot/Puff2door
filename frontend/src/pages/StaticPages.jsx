import React from "react";
import { Link } from "react-router-dom";
import { Truck, ShieldCheck, Award, Heart } from "lucide-react";
import { useCatalog } from "../context/CatalogContext";
import BrandLogo from "../components/BrandLogo";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd } from "../seo/config";
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

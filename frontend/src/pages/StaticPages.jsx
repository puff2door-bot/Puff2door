import React from "react";
import { Link } from "react-router-dom";
import { brands, categories } from "../mock";
import { Truck, ShieldCheck, Award, Heart } from "lucide-react";

export const BrandsPage = () => (
  <div className="max-w-[1280px] mx-auto px-4 py-10">
    <div className="relative overflow-hidden rounded-xl bg-neutral-900 px-8 py-10 mb-8">
      <div className="absolute -right-10 -bottom-16 h-56 w-56 rounded-full bg-emerald-600/20 blur-2xl" />
      <h1 className="font-heading text-3xl sm:text-4xl font-700 text-white uppercase tracking-tight relative">Our Brands</h1>
      <p className="text-neutral-400 text-sm mt-1 relative">Shop {brands.length} trusted brands</p>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
      {brands.map((b) => (
        <Link key={b.slug} to={`/brand/${b.slug}`} className="group aspect-square bg-white border border-neutral-200 rounded-lg grid place-items-center p-4 hover:shadow-lg hover:border-emerald-200 transition-all">
          <img src={b.image} alt={b.name} className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform" />
        </Link>
      ))}
    </div>
  </div>
);

export const AboutPage = () => {
  const values = [
    { icon: Truck, t: "Fast & Discreet", d: "Same-day local delivery and quick nationwide shipping in plain packaging." },
    { icon: ShieldCheck, t: "Compliant & Safe", d: "Every product is lab-tested and meets all legal requirements." },
    { icon: Award, t: "Top Brands Only", d: "We curate the best names in vape, delta and smoke culture." },
    { icon: Heart, t: "Customer First", d: "Friendly support and a satisfaction-first shopping experience." },
  ];
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-10">
      <div className="relative overflow-hidden rounded-2xl bg-neutral-900 px-8 py-16 mb-12 text-center">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-600/20 blur-2xl" />
        <h1 className="font-heading text-4xl sm:text-5xl font-700 text-white uppercase tracking-tight relative">About Puff2Door</h1>
        <p className="text-neutral-300 max-w-2xl mx-auto mt-4 relative">Puffs delivered to your door. We're your one-stop online smoke &amp; vape shop for disposables, delta, kratom, glass, papers and everything in between.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
        {values.map((v, i) => (
          <div key={i} className="border border-neutral-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
            <span className="grid place-items-center h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 mb-4"><v.icon className="h-6 w-6" /></span>
            <h3 className="font-heading text-lg uppercase mb-2">{v.t}</h3>
            <p className="text-sm text-neutral-500 leading-relaxed">{v.d}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <img src="https://nonaonlinesmokeshop.com/wp-content/uploads/2023/12/NONA-1-of-2.jpg" alt="Store" className="rounded-xl w-full h-full object-cover" />
        <div>
          <span className="block h-1 w-12 bg-emerald-600 mb-4 rounded-full" />
          <h2 className="font-heading text-3xl font-700 uppercase mb-4">Your Trusted Smoke Shop</h2>
          <p className="text-neutral-600 leading-relaxed mb-4">Founded with a simple mission — make premium smoke and vape products accessible, affordable, and delivered fast. We stock hundreds of products across {categories.length} categories from the industry's most-loved brands.</p>
          <p className="text-neutral-600 leading-relaxed mb-6">Whether you're after the latest 25K disposable, THCA flower, gummies or a classic glass piece, Puff2Door has you covered — all with age-verified, discreet checkout.</p>
          <Link to="/shop" className="inline-block px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors">Shop Now</Link>
        </div>
      </div>
    </div>
  );
};

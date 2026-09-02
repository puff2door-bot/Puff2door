import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, ShoppingCart, ArrowRight } from "lucide-react";
import { useCatalog } from "../context/CatalogContext";
import { imgUrl } from "../api";
import { useCart } from "../context/CartContext";
import { useToast } from "../hooks/use-toast";

const pad = (n) => String(n).padStart(2, "0");

const useCountdown = (endsAt) => {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  const s = Math.floor(left / 1000);
  return { h: pad(Math.floor(s / 3600)), m: pad(Math.floor((s % 3600) / 60)), s: pad(s % 60) };
};

const TimeBox = ({ v, label }) => (
  <div className="text-center">
    <div className="h-14 w-14 sm:h-16 sm:w-16 grid place-items-center rounded-xl bg-white/10 backdrop-blur border border-white/15 font-heading text-2xl sm:text-3xl text-white tabular-nums">{v}</div>
    <span className="block mt-1 text-[10px] uppercase tracking-[0.2em] text-neutral-400">{label}</span>
  </div>
);

const DealOfTheDay = () => {
  const { dealOfTheDay } = useCatalog();
  return dealOfTheDay ? <DealBanner deal={dealOfTheDay} /> : null;
};

const DealBanner = ({ deal }) => {
  const { product, pct, dealPrice, endsAt } = deal;
  const { h, m, s } = useCountdown(endsAt);
  const { addItem } = useCart();
  const { toast } = useToast();

  const add = () => {
    addItem({ ...product, price: dealPrice }, 1);
    toast({ title: "Deal added to cart", description: `${product.name} at $${dealPrice.toFixed(2)}` });
  };

  return (
    <section className="max-w-[1280px] mx-auto px-4 pt-10" data-testid="deal-of-the-day">
      <div className="relative overflow-hidden rounded-2xl bg-neutral-900 grid grid-cols-1 lg:grid-cols-[1fr_320px] items-center gap-6 px-6 py-8 sm:px-10">
        <div className="absolute -left-20 -bottom-24 h-72 w-72 rounded-full bg-emerald-600/25 blur-3xl" />
        <div className="absolute right-1/3 -top-24 h-64 w-64 rounded-full bg-red-600/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <Link to={`/shop/${product.slug}`} className="shrink-0 h-40 w-40 sm:h-48 sm:w-48 rounded-xl bg-white grid place-items-center p-3">
            <img src={imgUrl(product.image)} alt={product.name} className="max-h-full max-w-full object-contain" />
          </Link>
          <div>
            <span className="inline-flex items-center gap-1.5 bg-red-600 text-white text-[11px] font-bold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full mb-3">
              <Flame className="h-3.5 w-3.5" /> Deal of the Day · {pct}% off
            </span>
            <Link to={`/shop/${product.slug}`}>
              <h2 data-testid="deal-product-name" className="font-heading text-2xl sm:text-3xl text-white leading-tight mb-2 hover:text-emerald-300 transition-colors">{product.name}</h2>
            </Link>
            <p className="text-neutral-400 text-sm mb-4">Today only. Price resets at midnight, so grab it before the clock hits zero.</p>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="font-heading text-4xl text-emerald-400" data-testid="deal-price">${dealPrice.toFixed(2)}</span>
              <span className="text-neutral-500 line-through text-lg">${product.price.toFixed(2)}</span>
              <button onClick={add} data-testid="deal-add-to-cart" className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors text-sm">
                <ShoppingCart className="h-4 w-4" /> Grab the Deal
              </button>
              <Link to={`/shop/${product.slug}`} className="inline-flex items-center gap-1 text-sm font-bold text-neutral-300 hover:text-white">Details <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>
        <div className="relative flex items-center justify-start lg:justify-end gap-3" data-testid="deal-countdown">
          <TimeBox v={h} label="Hours" />
          <span className="font-heading text-2xl text-neutral-500 -mt-5">:</span>
          <TimeBox v={m} label="Minutes" />
          <span className="font-heading text-2xl text-neutral-500 -mt-5">:</span>
          <TimeBox v={s} label="Seconds" />
        </div>
      </div>
    </section>
  );
};

export default DealOfTheDay;

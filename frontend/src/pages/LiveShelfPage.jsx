import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Radio, Search, ShoppingBag, ShoppingCart } from "lucide-react";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import { imgUrl } from "../api";
import { useToast } from "../hooks/use-toast";
import Seo from "../seo/Seo";

const PREVIEW_SHELF = [
  { id: 1, slug: "silly-dots-super-dose-mushroom-pills-2400mg-tab-3ct-1", name: "SILLY DOTS SUPER DOSE MUSHROOM PILLS 2400MG/TAB 3CT", category: "KRATOM", categorySlug: "kratom", price: 40, image: "/uploads/puff2door/products/4dae3e6e-f8cb-4127-b41f-2537bbfed9f3.png", brandName: "SILLY DOTS", stock: 1, inStock: true },
  { id: 14, slug: "geek-bar-pulse-2-25k-grape-hubba-14", name: "GEEK BAR PULSE 2 25K GRAPE HUBBA", category: "DISPOSABLE VAPES", categorySlug: "disposable", price: 27, image: "/uploads/puff2door/products/934ca561-40a6-4039-b31c-4d5813079eee.png", brandName: "GEEK BAR", stock: 1, inStock: true },
  { id: 17, slug: "nexa-ultra-ii-50k-puff-disposable-georgia-peach-ice-17", name: "NEXA ULTRA II 50K GEORGIA PEACH ICE", category: "DISPOSABLE VAPES", categorySlug: "disposable", price: 32, image: "/uploads/puff2door/products/e5693b2a-7ba4-4a41-80a7-9d619b9a2843.webp", brandName: "NEXA", stock: 4, inStock: true },
  { id: 19, slug: "raz-bar-25000-punch-edition-hawaiian-punch-19", name: "RAZ BAR 25000 HAWAIIAN PUNCH", category: "DISPOSABLE VAPES", categorySlug: "disposable", price: 29.99, image: "/uploads/puff2door/products/98a899bc-103b-4e3b-80d7-f9aea4e283c0.png", brandName: "RAZ", stock: 7, inStock: true },
  { id: 32, slug: "muha-cartridge-1g-hybrid-strawberry-runtz-32", name: "MUHA CARTRIDGE 1G STRAWBERRY RUNTZ", category: "DELTA CARTRIDGES", categorySlug: "delta-cartridges", price: 35, image: "/uploads/puff2door/products/48670cfa-7435-413e-895a-f8bc91ab38fa.png", brandName: "MUHA", stock: 3, inStock: true },
  { id: 40, slug: "black-sheep-live-thc-gummies-1-500mg-indica-sour-grape-40", name: "BLACK SHEEP LIVE THC GUMMIES SOUR GRAPE", category: "DELTA EDIBLES", categorySlug: "delta-edibles", price: 50, image: "/uploads/puff2door/products/738c52cc-bd25-4914-a2b6-9fe107a5fedc.png", brandName: "BLACK SHEEP", stock: 6, inStock: true },
  { id: 62, slug: "glass-tobacco-pipe-5-screen-bucket-62", name: "GLASS TOBACCO PIPE 5 INCH SCREEN BUCKET", category: "GLASS PIPES", categorySlug: "glass-pipes", price: 40, image: "/uploads/puff2door/products/cad46fe0-9303-46f2-a10e-6d6f02933d47.png", brandName: "PIPE", stock: 2, inStock: true },
];

export default function LiveShelfPage() {
  const [params] = useSearchParams();
  const preview = params.get("preview") === "1";
  const { products, activeCategories, getPrice, refresh, loading } = useCatalog();
  const { presentation, addItem } = useCart();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [added, setAdded] = useState("");

  useEffect(() => {
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  const visibleProducts = useMemo(() => products.length ? products : preview ? PREVIEW_SHELF : [], [products, preview]);
  const visibleCategories = useMemo(() => products.length ? activeCategories : Array.from(new Map(PREVIEW_SHELF.map((product) => [product.categorySlug, { slug: product.categorySlug, name: product.category }])).values()), [products, activeCategories]);
  const shelf = useMemo(() => visibleProducts.filter((product) => product.inStock)
    .filter((product) => category === "all" || product.categorySlug === category)
    .filter((product) => !query.trim() || `${product.name} ${product.brandName} ${product.category}`.toLowerCase().includes(query.trim().toLowerCase())), [visibleProducts, query, category]);

  if (!preview && !presentation.liveShelfEnabled) return <div className="mx-auto max-w-2xl px-4 py-24 text-center"><ShoppingBag className="mx-auto h-12 w-12 text-neutral-300" /><h1 className="mt-4 font-heading text-4xl">Live Shelf is not open yet</h1><p className="mt-2 text-neutral-500">Browse the full shop for current products and availability.</p><Link to="/shop" className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 font-bold text-white">Shop all products</Link></div>;

  return <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white pb-20" data-testid="live-shelf-page">
    <Seo noindex={preview} title="Live Store Shelf | HD Smoke Shop" description="See products currently in stock at HD Smoke Shop in Altamonte Springs." path="/live-shelf" />
    {preview && <div className="bg-amber-300 px-4 py-2 text-center text-xs font-black uppercase tracking-widest text-neutral-900">Private preview · customers cannot see this until enabled in Store Settings</div>}
    <section className="mx-auto max-w-[1280px] px-4 pt-10">
      <div className="overflow-hidden rounded-[2rem] bg-neutral-950 px-6 py-8 text-white shadow-2xl md:px-10 md:py-12">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-sky-300"><Radio className="h-4 w-4 animate-pulse" /> Live from the store</div>
        <h1 className="mt-4 font-heading text-4xl md:text-6xl">The shelf, right now.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300 md:text-base">See what is currently available at HD Smoke Shop. Stock refreshes automatically, but popular items can sell between checkout steps.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-full border border-white/20 bg-white/10 py-3 pl-12 pr-4 text-white outline-none placeholder:text-neutral-400 focus:border-sky-400" placeholder="Search the live shelf…" /></label><div className="rounded-full bg-sky-400 px-5 py-3 text-center text-sm font-black text-neutral-950">{shelf.length} available now</div></div>
      </div>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2"><button onClick={() => setCategory("all")} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${category === "all" ? "bg-sky-600 text-white" : "border bg-white"}`}>All in stock</button>{visibleCategories.filter((item) => visibleProducts.some((product) => product.inStock && product.categorySlug === item.slug)).map((item) => <button key={item.slug} onClick={() => setCategory(item.slug)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${category === item.slug ? "bg-sky-600 text-white" : "border bg-white"}`}>{item.name}</button>)}</div>
      {loading && !preview ? <p className="py-20 text-center text-neutral-500">Checking the shelf…</p> : !shelf.length ? <div className="my-10 rounded-3xl border border-dashed bg-white p-12 text-center"><p className="font-bold">No matching products are on the shelf right now.</p><Link to="/request-product" className="mt-2 inline-block text-sm font-bold text-sky-700 underline">Request a product</Link></div> : <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{shelf.map((product) => { const price = products.length ? getPrice(product) : Number(product.salePrice || product.price); const justAdded = added === product.id; return <article key={product.id} className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><Link to={`/shop/${product.slug}`} className="block aspect-square bg-neutral-50 p-3"><img src={imgUrl(product.image)} alt={product.name} className="h-full w-full object-contain" loading="lazy" /></Link><div className="p-3"><p className="text-[10px] font-black uppercase tracking-wider text-sky-700">{product.brandName || product.category}</p><Link to={`/shop/${product.slug}`} className="mt-1 block min-h-[2.5rem] text-sm font-bold leading-5 text-neutral-900 line-clamp-2">{product.name}</Link><p className={`mt-2 text-[11px] font-bold ${product.stock <= 3 ? "text-amber-600" : "text-emerald-700"}`}>{product.stock <= 3 ? `Only ${product.stock} left` : "In stock now"}</p><div className="mt-3 flex items-center justify-between"><span className="font-heading text-xl">${price.toFixed(2)}</span><button onClick={() => { addItem({ ...product, price }, 1); setAdded(product.id); toast({ title: "Added from Live Shelf", description: product.name }); setTimeout(() => setAdded(""), 1200); }} className={`grid h-10 w-10 place-items-center rounded-full text-white ${justAdded ? "bg-emerald-600" : "bg-sky-600 hover:bg-sky-700"}`} aria-label={`Add ${product.name} to cart`}>{justAdded ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}</button></div></div></article>; })}</div>}
    </section>
  </div>;
}

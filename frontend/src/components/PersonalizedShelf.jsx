import React, { useEffect, useMemo, useState } from "react";
import { Clock3, Sparkles } from "lucide-react";
import ProductCard from "./ProductCard";
import { getRecentlyViewed } from "../lib/customerExperience";
import { useCatalog } from "../context/CatalogContext";
import { useApp } from "../context/AppContext";

const PersonalizedShelf = () => {
  const { products } = useCatalog();
  const { user } = useApp();
  const [recent, setRecent] = useState(getRecentlyViewed);
  useEffect(() => { const update = () => setRecent(getRecentlyViewed()); window.addEventListener("p2d-experience-change", update); return () => window.removeEventListener("p2d-experience-change", update); }, []);
  const liveRecent = useMemo(() => recent.map((r) => products.find((p) => p.id === r.id) || r).slice(0, 5), [recent, products]);
  const recommended = useMemo(() => {
    const cats = new Set(liveRecent.map((p) => p.categorySlug || p.category));
    return products.filter((p) => p.inStock && !liveRecent.some((r) => r.id === p.id) && (cats.size === 0 || cats.has(p.categorySlug) || cats.has(p.category))).slice(0, 5);
  }, [products, liveRecent]);
  if (!liveRecent.length && !user) return null;
  const Shelf = ({ title, icon: Icon, items }) => items.length ? <section className="max-w-[1280px] mx-auto px-4 pt-14"><div className="flex items-center gap-2 mb-6"><Icon className="h-6 w-6 text-emerald-600"/><h2 className="font-heading text-3xl sm:text-4xl uppercase tracking-tight">{title}</h2></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">{items.map((p) => <ProductCard key={p.id} product={p}/>)}</div></section> : null;
  return <><Shelf title={user ? `Welcome back, ${user.firstName || "Member"}` : "Recently Viewed"} icon={Clock3} items={liveRecent}/><Shelf title="Picked For You" icon={Sparkles} items={recommended}/></>;
};
export default PersonalizedShelf;

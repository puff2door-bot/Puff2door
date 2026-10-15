import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useCatalog } from "../context/CatalogContext";
import { imgUrl } from "../api";

const SmartSearch = ({ query, setQuery, onSubmit, mobile = false }) => {
  const { products } = useCatalog();
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const tokens = q.split(/\s+/);
    return products.filter((p) => tokens.every((t) => `${p.name} ${p.brandName} ${p.category}`.toLowerCase().includes(t))).slice(0, 6);
  }, [products, query]);
  return (
    <form onSubmit={onSubmit} className={`${mobile ? "md:hidden pb-3" : "hidden md:flex flex-1 max-w-xl mx-auto"} relative`} role="search">
      <div className="flex w-full items-center border border-neutral-300 rounded-full overflow-hidden focus-within:border-emerald-600 transition-colors bg-white">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mobile ? "Search products..." : "Search products, brands, flavors..."} className="flex-1 px-5 py-2.5 text-sm outline-none min-w-0" aria-label="Search products" autoComplete="off" />
        {query && <button type="button" onClick={() => setQuery("")} className="p-2 text-neutral-400 hover:text-neutral-900" aria-label="Clear search"><X className="h-4 w-4" /></button>}
        <button type="submit" className="px-4 sm:px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700"><Search className="h-5 w-5" /></button>
      </div>
      {matches.length > 0 && (
        <div className="absolute z-[80] top-full mt-2 left-0 right-0 bg-white border border-neutral-200 rounded-xl shadow-2xl overflow-hidden">
          {matches.map((p) => <Link key={p.id} to={`/shop/${p.slug}`} onClick={() => setQuery("")} className="flex items-center gap-3 p-3 hover:bg-emerald-50 border-b last:border-0">
            <img src={imgUrl(p.image)} alt="" className="h-10 w-10 object-contain bg-neutral-50 rounded" />
            <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-emerald-700">{p.brandName}</span><span className="block text-sm truncate">{p.name}</span></span>
            <span className="font-heading text-sm">${Number(p.salePrice || p.price).toFixed(2)}</span>
          </Link>)}
          <button type="submit" className="w-full p-3 text-sm font-bold text-emerald-700 hover:bg-emerald-50">See all results for “{query}”</button>
        </div>
      )}
    </form>
  );
};
export default SmartSearch;

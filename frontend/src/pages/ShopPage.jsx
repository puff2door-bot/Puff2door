import React, { useMemo, useState } from "react";
import { useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { SlidersHorizontal, ChevronRight } from "lucide-react";
import ProductCard from "../components/ProductCard";
import { products, categories, brands, getProductsByCategory } from "../mock";

const SORTS = [
  { key: "popular", label: "Popularity" },
  { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" },
  { key: "name", label: "Name A-Z" },
];

const ShopPage = () => {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isBrand = location.pathname.startsWith("/brand/");
  const searchQuery = searchParams.get("search") || "";
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const perPage = 15;

  const currentCat = categories.find((c) => c.slug === slug);
  const currentBrand = brands.find((b) => b.slug === slug);

  const baseList = useMemo(() => {
    let list;
    if (isBrand) {
      list = products.filter((p) => p.brand === slug);
    } else {
      list = slug ? getProductsByCategory(slug) : [...products];
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = products.filter(
        (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "price-asc": list = [...list].sort((a, b) => a.price - b.price); break;
      case "price-desc": list = [...list].sort((a, b) => b.price - a.price); break;
      case "name": list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break;
      default: break;
    }
    return list;
  }, [slug, searchQuery, sort, isBrand]);

  const totalPages = Math.max(1, Math.ceil(baseList.length / perPage));
  const pageList = baseList.slice((page - 1) * perPage, page * perPage);

  const title = searchQuery
    ? `Search: "${searchQuery}"`
    : isBrand && currentBrand
    ? currentBrand.name
    : currentCat
    ? currentCat.name
    : "Shop All";

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-neutral-500 mb-4">
        <Link to="/" className="hover:text-emerald-600">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/shop" className="hover:text-emerald-600">Shop</Link>
        {currentCat && (<><ChevronRight className="h-3.5 w-3.5" /><span className="text-neutral-800 font-medium">{currentCat.name}</span></>)}
      </nav>

      {/* Banner */}
      <div className="relative overflow-hidden rounded-xl bg-neutral-900 px-8 py-10 mb-8">
        <div className="absolute -right-10 -bottom-16 h-56 w-56 rounded-full bg-emerald-600/20 blur-2xl" />
        <h1 className="font-heading text-3xl sm:text-4xl font-700 text-white uppercase tracking-tight relative">{title}</h1>
        <p className="text-neutral-400 text-sm mt-1 relative">{baseList.length} products available</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-[180px]">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
              <h3 className="font-heading text-lg uppercase tracking-wide">Categories</h3>
            </div>
            <ul className="space-y-1">
              <li>
                <Link to="/shop" className={`block px-3 py-2 rounded-lg text-sm ${!slug ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-neutral-700 hover:bg-neutral-100"}`}>All Products</Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link to={`/product-category/${c.slug}`} className={`block px-3 py-2 rounded-lg text-sm ${slug === c.slug ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-neutral-700 hover:bg-neutral-100"}`}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-neutral-500">Showing {pageList.length} of {baseList.length}</p>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600">
              {SORTS.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
            </select>
          </div>

          {pageList.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-heading text-2xl text-neutral-800 mb-2">No products found</p>
              <p className="text-sm text-neutral-500 mb-6">Try another category or search term.</p>
              <Link to="/shop" className="inline-block px-6 py-3 bg-emerald-600 text-white font-bold rounded-full">Browse All</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {pageList.map((p) => (<ProductCard key={p.id} product={p} />))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setPage(i + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className={`h-10 w-10 rounded-lg font-semibold text-sm transition-colors ${page === i + 1 ? "bg-emerald-600 text-white" : "border border-neutral-300 text-neutral-700 hover:border-emerald-600"}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShopPage;

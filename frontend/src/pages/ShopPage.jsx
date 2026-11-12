import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { SlidersHorizontal, ChevronRight, Filter } from "lucide-react";
import ProductCard from "../components/ProductCard";
import ShopFilters, { buildFilterOptions, applyFilters } from "../components/ShopFilters";
import { useCatalog } from "../context/CatalogContext";
import Seo from "../seo/Seo";
import { brandSeo, breadcrumbJsonLd, categorySeo, titleCase } from "../seo/config";

const SORTS = [
  { key: "popular", label: "Popularity" },
  { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" },
  { key: "name", label: "Name A-Z" },
];

const EMPTY_FILTERS = { brands: [], flavors: [], puffs: [], sizes: [] };

const ShopPage = () => {
  const { slug } = useParams();
  const { products, getProductsByCategory, loading, activeCategories, getCategory, getBrand, categoryRecords, brandRecords } = useCatalog();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isBrand = location.pathname.startsWith("/brand/");
  const searchQuery = searchParams.get("search") || "";
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [mobileFilters, setMobileFilters] = useState(false);
  const perPage = 15;

  useEffect(() => { setFilters(EMPTY_FILTERS); setPage(1); }, [slug, searchQuery, isBrand]);

  const currentCat = !isBrand ? getCategory(slug) : null;
  const currentBrand = isBrand ? getBrand(slug) : null;

  const scopeList = useMemo(() => {
    let list;
    if (isBrand) {
      list = products.filter((p) => p.brand === slug);
    } else {
      list = slug ? getProductsByCategory(slug) : [...products];
    }
    if (searchQuery) {
      // Every word must appear somewhere in the name, category or brand, so
      // "royal honey" also finds "VVIP Honey" from the Royal Honey brand.
      const words = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      list = products.filter((p) => {
        const hay = [p.name, p.category, p.categorySlug, p.brandName, (p.brand || "").replace(/-/g, " ")]
          .filter(Boolean).join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    return list;
  }, [slug, searchQuery, isBrand, products, getProductsByCategory]);

  const filterOptions = useMemo(() => buildFilterOptions(scopeList), [scopeList]);

  const baseList = useMemo(() => {
    let list = applyFilters(scopeList, filters);
    switch (sort) {
      case "price-asc": list = [...list].sort((a, b) => a.price - b.price); break;
      case "price-desc": list = [...list].sort((a, b) => b.price - a.price); break;
      case "name": list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break;
      default: break;
    }
    return list;
  }, [scopeList, filters, sort]);

  const activeFilterCount = filters.brands.length + filters.flavors.length + filters.puffs.length + filters.sizes.length;

  const totalPages = Math.max(1, Math.ceil(baseList.length / perPage));
  const pageList = baseList.slice((page - 1) * perPage, page * perPage);

  const title = searchQuery
    ? `Search: "${searchQuery}"`
    : isBrand && currentBrand
    ? currentBrand.name
    : currentCat
    ? currentCat.name
    : "Shop All";

  const seo = searchQuery
    ? { title: `Search results for "${searchQuery}" | HD Smoke Shop`, description: `Search results for ${searchQuery} at HD Smoke Shop.`, noindex: true, path: "/shop" }
    : isBrand && currentBrand
    ? { ...brandSeo(currentBrand), path: `/brand/${currentBrand.slug}` }
    : currentCat
    ? { ...categorySeo(currentCat), path: `/product-category/${currentCat.slug}` }
    : slug
    ? { title: "Page not found | HD Smoke Shop", description: "This category does not exist.", noindex: true }
    : { title: "Shop Smoke Shop Accessories Online – HD Smoke Shop", description: "Browse vaporizers, hookah, glass and smoke shop accessories at HD Smoke Shop in Altamonte Springs. Local delivery or in-store pickup. 21+ only.", intro: "Every product we carry, from disposable vapes to glass and kratom — shop online for local delivery in ZIP 32714, or visit our Altamonte Springs store.", path: "/shop" };
  const crumbs = [{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }];
  if (currentCat) crumbs.push({ name: titleCase(currentCat.name), path: `/product-category/${currentCat.slug}` });
  if (isBrand && currentBrand) crumbs.push({ name: currentBrand.name, path: `/brand/${currentBrand.slug}` });

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-8">
      {/* Until the catalog has really loaded, a category or brand can't be found yet. Saying
          "not found / noindex" in that moment made Google drop real pages, so keep the
          server's tags until we actually know. */}
      {!(slug && !currentCat && !currentBrand && (loading || !(isBrand ? brandRecords.length : categoryRecords.length))) && (
        <Seo title={seo.title} description={seo.description} path={seo.path} noindex={seo.noindex} jsonLd={seo.noindex ? undefined : breadcrumbJsonLd(crumbs)} />
      )}
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500 mb-4">
        <Link to="/" className="hover:text-emerald-600">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/shop" className="hover:text-emerald-600">Shop</Link>
        {currentCat && (<><ChevronRight className="h-3.5 w-3.5" /><span className="text-neutral-800 font-medium">{currentCat.name}</span></>)}
        {isBrand && currentBrand && (<><ChevronRight className="h-3.5 w-3.5" /><span className="text-neutral-800 font-medium">{currentBrand.name}</span></>)}
      </nav>

      {/* Banner */}
      <div className="relative overflow-hidden rounded-xl bg-neutral-900 px-8 py-10 mb-8">
        <div className="absolute -right-10 -bottom-16 h-56 w-56 rounded-full bg-emerald-600/20 blur-2xl" />
        <h1 className="font-heading text-3xl sm:text-4xl font-700 text-white uppercase tracking-tight relative">{title}</h1>
        <p className="text-neutral-400 text-sm mt-1 relative">{baseList.length} {baseList.length === 1 ? "product" : "products"} available{seo.intro ? ` · ${seo.intro}` : ""}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-[180px]">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
              <h2 className="font-heading text-lg uppercase tracking-wide">Categories</h2>
            </div>
            <ul className="space-y-1">
              <li>
                <Link to="/shop" className={`block px-3 py-2 rounded-lg text-sm ${!slug ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-neutral-700 hover:bg-neutral-100"}`}>All Products</Link>
              </li>
              {activeCategories.map((c) => (
                <li key={c.slug}>
                  <Link to={`/product-category/${c.slug}`} className={`block px-3 py-2 rounded-lg text-sm ${slug === c.slug ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-neutral-700 hover:bg-neutral-100"}`}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-8 border-t pt-6">
              <ShopFilters variant="desktop" options={filterOptions} filters={filters} setFilters={(f) => { setFilters(f); setPage(1); }} />
            </div>
          </div>
        </aside>

        {/* Main */}
        <div>
          <div className="flex items-center justify-between mb-5 gap-3">
            <p className="text-sm text-neutral-500">Showing {pageList.length} of {baseList.length}</p>
            <div className="flex items-center gap-2">
              <button
                data-testid="mobile-filters-toggle"
                onClick={() => setMobileFilters((v) => !v)}
                className="lg:hidden inline-flex items-center gap-1.5 border border-neutral-300 rounded-lg px-3 py-2 text-sm font-semibold hover:border-emerald-600"
              >
                <Filter className="h-4 w-4" /> Filters {activeFilterCount > 0 && <span className="h-5 w-5 grid place-items-center rounded-full bg-emerald-600 text-white text-[10px]">{activeFilterCount}</span>}
              </button>
              <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600">
                {SORTS.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
              </select>
            </div>
          </div>

          {mobileFilters && (
            <div className="lg:hidden border border-neutral-200 rounded-xl p-4 mb-5">
              <ShopFilters variant="mobile" options={filterOptions} filters={filters} setFilters={(f) => { setFilters(f); setPage(1); }} />
            </div>
          )}

          {loading ? (
            <div className="py-24 text-center text-neutral-500">Loading products...</div>
          ) : pageList.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-heading text-2xl text-neutral-800 mb-2">No products found</p>
              <p className="text-sm text-neutral-500 mb-6">{activeFilterCount > 0 ? "Try removing some filters." : "Try another category or search term."}</p>
              {activeFilterCount > 0 ? (
                <button onClick={() => setFilters(EMPTY_FILTERS)} className="inline-block px-6 py-3 bg-emerald-600 text-white font-bold rounded-full">Clear Filters</button>
              ) : (
                <div className="flex flex-wrap justify-center gap-3"><Link to="/shop" className="inline-block px-6 py-3 bg-emerald-600 text-white font-bold rounded-full">Browse All</Link><Link to="/request-product" className="inline-block px-6 py-3 border border-emerald-600 text-emerald-700 font-bold rounded-full">Request a Product</Link></div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="shop-product-grid">
              {pageList.map((p) => (<ProductCard key={p.id} product={p} />))}
            </div>
          )}

          {totalPages > 1 && (
            <nav aria-label="Pages" className="flex flex-wrap justify-center items-center gap-2 mt-10" data-testid="shop-pagination">
              {/* First, last and the pages around the current one, so it fits a phone screen. */}
              {(() => {
                const go = (n) => { setPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); };
                const shown = [...new Set([1, page - 1, page, page + 1, totalPages])].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
                const cls = (active) => `h-10 min-w-[2.5rem] px-3 rounded-lg font-semibold text-sm transition-colors ${active ? "bg-emerald-600 text-white" : "border border-neutral-300 text-neutral-700 hover:border-emerald-600"} disabled:opacity-40`;
                const out = [<button key="prev" type="button" disabled={page === 1} onClick={() => go(page - 1)} className={cls(false)} aria-label="Previous page">‹</button>];
                shown.forEach((n, idx) => {
                  if (idx && n - shown[idx - 1] > 1) out.push(<span key={`gap-${n}`} className="px-1 text-neutral-400">…</span>);
                  out.push(<button key={n} type="button" onClick={() => go(n)} aria-current={page === n ? "page" : undefined} className={cls(page === n)}>{n}</button>);
                });
                out.push(<button key="next" type="button" disabled={page === totalPages} onClick={() => go(page + 1)} className={cls(false)} aria-label="Next page">›</button>);
                return out;
              })()}
            </nav>
          )}
          {!loading && <div className="mt-10 rounded-xl border border-dashed p-5 flex flex-col sm:flex-row items-center justify-between gap-3"><div><p className="font-bold">Looking for something we don’t carry?</p><p className="text-sm text-neutral-500">Send a product request and we’ll track it in the store system.</p></div><Link to="/request-product" className="shrink-0 rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-bold">Request a Product</Link></div>}
        </div>
      </div>
    </div>
  );
};

export default ShopPage;

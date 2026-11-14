import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { SlidersHorizontal, ChevronRight, Filter } from "lucide-react";
import ProductCard from "../components/ProductCard";
import ShopFilters, { buildFilterOptions, applyFilters } from "../components/ShopFilters";
import { useCatalog } from "../context/CatalogContext";
import Seo from "../seo/Seo";
import { brandSeo, breadcrumbJsonLd, categorySeo, titleCase, CATEGORY_SEO } from "../seo/config";

// The server already puts the category's name in the page title ("Delta Disposables – Shop Online…").
// Reuse it for the heading while products load, so the banner keeps its final size.
const FIRST_PATH = typeof window !== "undefined" ? window.location.pathname : "";
const FIRST_TITLE = typeof document !== "undefined" ? document.title : "";
const pendingName = (slug) => {
  const fromTitle = FIRST_TITLE.split(" – ")[0];
  if (typeof window !== "undefined" && window.location.pathname === FIRST_PATH && FIRST_TITLE.includes(" – ")
      && fromTitle.toLowerCase().includes(slug.split("-")[0].toLowerCase())) {
    return fromTitle;
  }
  return titleCase(slug.replace(/-/g, " "));
};

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
  // Phones show 16 per page (8 full rows of two); tablets and laptops keep 15.
  const [perPage] = useState(() => (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 639px)").matches ? 16 : 15));

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
    : slug && loading
    ? pendingName(slug)
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
  // While the catalog loads, show the category's own heading and intro text so the banner
  // doesn't change height (and push the products down) once the data arrives.
  const pendingIntro = loading && slug && !isBrand && !searchQuery ? CATEGORY_SEO[slug]?.intro || "" : "";
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
        <p className="text-neutral-400 text-sm mt-1 relative">
          {loading ? "Loading products" : `${baseList.length} ${baseList.length === 1 ? "product" : "products"} available`}
          {(seo.intro || pendingIntro) ? ` · ${seo.intro || pendingIntro}` : ""}
        </p>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" aria-label="Loading products">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 overflow-hidden">
                  <div className="aspect-square bg-neutral-100 animate-pulse" />
                  <div className="p-3 space-y-2"><div className="h-3 bg-neutral-100 rounded" /><div className="h-3 w-1/2 bg-neutral-100 rounded" /><div className="h-9" /></div>
                </div>
              ))}
            </div>
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
              {pageList.map((p, i) => (<ProductCard key={p.id} product={p} priority={i < 2} />))}
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
          {!loading && !searchQuery && (isBrand ? currentBrand : currentCat || !slug) && (
            <section className="mt-10 grid gap-6 md:grid-cols-2 text-sm leading-relaxed text-neutral-600" data-testid="shop-buying-info">
              <div>
                <h2 className="font-heading text-xl uppercase text-neutral-900 mb-2">Buying {isBrand ? currentBrand.name : currentCat ? titleCase(currentCat.name) : "smoke shop products"} at HD Smoke Shop</h2>
                <p>We currently list {baseList.length} {baseList.length === 1 ? "product" : "products"} online, and the same shelf is in our Altamonte Springs store at 481 N State Rd 434, Suite 1050, open 10 AM to 10 PM every day. Stock on this page updates from our in-store register, so what you see here is what we have. Ask our staff if you're looking for a flavor, strength or size you don't see listed.</p>
              </div>
              <div>
                <h2 className="font-heading text-xl uppercase text-neutral-900 mb-2">Delivery and ID</h2>
                <p>Order online for local same-day delivery within our delivery area, or walk in and shop in person. Every order is for adults 21 and older only. Our driver checks a valid, unexpired government photo ID at the door, and we never leave orders unattended. See the <Link to="/delivery-area" className="text-emerald-700 underline">Delivery Area</Link> page for the ZIP codes we serve and today's delivery times.</p>
              </div>
            </section>
          )}
          {!loading && <div className="mt-10 rounded-xl border border-dashed p-5 flex flex-col sm:flex-row items-center justify-between gap-3"><div><p className="font-bold">Looking for something we don’t carry?</p><p className="text-sm text-neutral-500">Send a product request and we’ll track it in the store system.</p></div><Link to="/request-product" className="shrink-0 rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-bold">Request a Product</Link></div>}
        </div>
      </div>
    </div>
  );
};

export default ShopPage;

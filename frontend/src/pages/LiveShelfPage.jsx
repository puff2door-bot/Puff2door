import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Eye, Layers3, PackageCheck, Radio, Search, ShoppingBag, ShoppingCart, Sparkles, X, Zap } from "lucide-react";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import { imgUrl } from "../api";
import { useToast } from "../hooks/use-toast";
import { isMixSaveEligible } from "../utils/mixSave";
import { LIVE_SHELF_PREVIEW_PRODUCTS } from "../constants/liveShelfPreview";
import Seo from "../seo/Seo";

const PRIORITY_CATEGORIES = ["disposable", "delta-smokeables", "delta", "delta-cartridges"];

const stockCopy = (product) => {
  const stock = Math.max(0, Number(product.stock || 0));
  if (stock <= 3) return `Only ${stock} left in local stock`;
  return `${stock} available in store`;
};

const editorialBadge = (product) => {
  if (product.staffPick) return "Staff Pick";
  if (product.topShelf) return "Top Shelf";
  if (product.fastestDelivery) return "Fastest Delivery";
  return Number(product.stock || 0) <= 3 ? "Low Stock" : "Ready Now";
};

function QuickView({ product, price, eligible, onClose, onAdd, onMix }) {
  useEffect(() => {
    if (!product) return undefined;
    const close = (event) => event.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", close); };
  }, [product, onClose]);

  if (!product) return null;
  const notes = (product.flavors || []).filter(Boolean);
  return <div className="live-quick-overlay" role="dialog" aria-modal="true" aria-label={`Quick view ${product.name}`}>
    <button className="live-quick-backdrop" onClick={onClose} aria-label="Close quick view" />
    <section className="live-quick-sheet">
      <button className="live-quick-close" onClick={onClose} aria-label="Close"><X /></button>
      <div className="live-quick-visual"><span className="live-stock-orbit"><i /> {stockCopy(product)}</span><img src={imgUrl(product.image)} alt={product.name} /></div>
      <div className="live-quick-copy">
        <p className="live-card-brand">{product.brandName || product.category}</p>
        <h2>{product.name}</h2>
        <div className="live-quick-price"><strong>${price.toFixed(2)}</strong><span>Local inventory · refreshed automatically</span></div>
        {(notes.length > 0 || product.size) && <div className="live-notes">{product.size && <span>{product.size}</span>}{notes.map((note) => <span key={note}>{note}</span>)}</div>}
        <p className="live-description">{product.description || "Available now at HD Smoke Shop. Check the live quantity before ordering; local stock can change during the day."}</p>
        <div className="live-quick-actions"><button onClick={onAdd}><ShoppingCart /> Quick Add</button>{eligible && <button className="mix" onClick={onMix}><Sparkles /> Build Mix & Save</button>}</div>
        <Link to={`/shop/${product.slug}`} onClick={onClose} className="live-full-details">View full product details</Link>
      </div>
    </section>
  </div>;
}

export default function LiveShelfPage() {
  const [params] = useSearchParams();
  const preview = params.get("preview") === "1";
  const { products, activeCategories, getPrice, refresh, loading } = useCatalog();
  const { presentation, addItem, mixSave } = useCart();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [added, setAdded] = useState("");
  const [quickProduct, setQuickProduct] = useState(null);

  useEffect(() => {
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  const visibleProducts = useMemo(() => products.length ? products : preview ? LIVE_SHELF_PREVIEW_PRODUCTS : [], [products, preview]);
  const visibleCategories = useMemo(() => {
    const source = products.length ? activeCategories : Array.from(new Map(LIVE_SHELF_PREVIEW_PRODUCTS.map((product) => [product.categorySlug, { slug: product.categorySlug, name: product.category }])).values());
    return source
      .filter((item) => visibleProducts.some((product) => product.inStock && product.categorySlug === item.slug))
      .sort((a, b) => {
        const left = PRIORITY_CATEGORIES.indexOf(a.slug);
        const right = PRIORITY_CATEGORIES.indexOf(b.slug);
        if (left >= 0 || right >= 0) return (left < 0 ? 999 : left) - (right < 0 ? 999 : right);
        return a.name.localeCompare(b.name);
      });
  }, [products, activeCategories, visibleProducts]);
  const shelf = useMemo(() => visibleProducts.filter((product) => product.inStock)
    .filter((product) => category === "all" || product.categorySlug === category)
    .filter((product) => !query.trim() || `${product.name} ${product.brandName} ${product.category} ${(product.flavors || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), [visibleProducts, query, category]);

  const priceFor = (product) => products.length ? getPrice(product) : Number(product.salePrice || product.price);
  const addNow = (product) => {
    const price = priceFor(product);
    addItem({ ...product, price }, 1);
    setAdded(product.id);
    toast({ title: "Added from Live Shelf", description: product.name });
    setTimeout(() => setAdded(""), 1200);
  };
  const openMix = (product) => {
    setQuickProduct(null);
    window.dispatchEvent(new CustomEvent("p2d-open-mix-save", { detail: { productId: product.id } }));
  };

  if (!preview && !presentation.liveShelfEnabled) return <div className="mx-auto max-w-2xl px-4 py-24 text-center"><ShoppingBag className="mx-auto h-12 w-12 text-neutral-300" /><h1 className="mt-4 font-heading text-4xl">Live Shelf is not open yet</h1><p className="mt-2 text-neutral-500">Browse the full shop for current products and availability.</p><Link to="/shop" className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 font-bold text-white">Shop all products</Link></div>;

  return <div className="live-showroom" data-testid="live-shelf-page">
    <Seo noindex={preview} title="Live Store Shelf | HD Smoke Shop" description="See products currently in stock at HD Smoke Shop in Altamonte Springs." path="/live-shelf" />
    {preview && <div className="live-preview-ribbon">Private preview · customers cannot see this until enabled in Store Settings</div>}
    <section className="live-showroom-inner">
      <header className="live-showroom-hero">
        <div className="live-grid-lines" aria-hidden="true" />
        <div className="live-hero-copy"><p><span className="live-pulse-dot" /> Live from HD Smoke Shop</p><h1>Your local shelf.<br /><em>Right now.</em></h1><span>Real local quantities refresh automatically every minute. Browse the showroom, quick-add an item, or build a Mix & Save bundle without losing your place.</span></div>
        <div className="live-hero-console"><div><Radio /><strong>Live inventory feed</strong><small>Auto-refresh · 60 seconds</small></div><div><PackageCheck /><strong>{visibleProducts.filter((product) => product.inStock).length} products available</strong><small>Local stock only</small></div><div><Zap /><strong>Built for fast checkout</strong><small>Quick add is ready</small></div></div>
        <label className="live-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, brands, flavors…" /><span>{shelf.length} live</span></label>
      </header>

      <nav className="live-filter-dock" aria-label="Live Shelf categories"><div className="live-filter-scroll"><button onClick={() => setCategory("all")} className={category === "all" ? "active" : ""}><Layers3 /> All live <span>{visibleProducts.filter((product) => product.inStock).length}</span></button>{visibleCategories.map((item) => { const count = visibleProducts.filter((product) => product.inStock && product.categorySlug === item.slug).length; return <button key={item.slug} onClick={() => setCategory(item.slug)} className={category === item.slug ? "active" : ""}>{item.name}<span>{count}</span></button>; })}</div></nav>

      <div className="live-shelf-heading"><div><p>Interactive showroom</p><h2>{category === "all" ? "Everything on the shelf" : visibleCategories.find((item) => item.slug === category)?.name}</h2></div><span><i /> Inventory is live</span></div>

      {loading && !preview ? <div className="live-loading"><span /><span /><span /><p>Checking the shelf…</p></div> : !shelf.length ? <div className="live-empty"><ShoppingBag /><p>No matching products are on the shelf right now.</p><Link to="/request-product">Request a product</Link></div> : <div className="live-product-grid">{shelf.map((product) => {
        const price = priceFor(product);
        const justAdded = added === product.id;
        const eligible = isMixSaveEligible(product, mixSave);
        return <article key={product.id} className="live-product-card">
          <div className="live-card-glow" aria-hidden="true" />
          <div className="live-card-media"><img src={imgUrl(product.image)} alt={product.name} loading="lazy" decoding="async" width="360" height="360" /><span className="live-card-status"><i /> {stockCopy(product)}</span><span className={`live-editorial-badge ${Number(product.stock || 0) <= 3 ? "urgent" : ""}`}>{editorialBadge(product)}</span><button className="live-quick-button" onClick={() => setQuickProduct(product)} aria-label={`Quick view ${product.name}`}><Eye /> Quick view</button></div>
          <div className="live-card-copy"><p className="live-card-brand">{product.brandName || product.category}</p><Link to={`/shop/${product.slug}`}><h3>{product.name}</h3></Link>{eligible && <button className="live-mix-badge" onClick={() => openMix(product)}><Sparkles /> Eligible for {mixSave.buttonText}</button>}<div className="live-card-bottom"><div><strong>${price.toFixed(2)}</strong>{price < Number(product.price) && <del>${Number(product.price).toFixed(2)}</del>}</div><button onClick={() => addNow(product)} className={justAdded ? "added" : ""} aria-label={`Add ${product.name} to cart`}>{justAdded ? <Check /> : <ShoppingCart />}</button></div></div>
        </article>;
      })}</div>}
    </section>
    <QuickView product={quickProduct} price={quickProduct ? priceFor(quickProduct) : 0} eligible={quickProduct ? isMixSaveEligible(quickProduct, mixSave) : false} onClose={() => setQuickProduct(null)} onAdd={() => { addNow(quickProduct); setQuickProduct(null); }} onMix={() => openMix(quickProduct)} />
  </div>;
}

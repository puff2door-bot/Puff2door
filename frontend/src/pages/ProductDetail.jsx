import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronRight, Minus, Plus, ShoppingCart, Truck, ShieldCheck, RotateCcw, Star, Check, Heart, Bell, BellRing } from "lucide-react";
import ProductCard from "../components/ProductCard";
import ReviewsSection from "../components/ReviewsSection";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";
import api, { imgUrl } from "../api";
import Seo from "../seo/Seo";
import { ecommerce } from "../seo/Analytics";
import { absUrl, breadcrumbJsonLd, productJsonLd, productSeoDescription, productSpecs, titleCase } from "../seo/config";

const ProductDetail = () => {
  const { slug } = useParams();
  const { getProductBySlug, getProductsByCategory, getPrice, isOnDeal, loading } = useCatalog();
  const product = getProductBySlug(slug);
  const { addItem } = useCart();
  const { has, toggle, items: wishItems, setNotify } = useWishlist();
  const { user } = useApp();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [added, setAdded] = useState(false);
  const [reviewSummary, setReviewSummary] = useState(null);
  useEffect(() => { if (product) ecommerce.viewItem(product, getPrice(product)); }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [alertEmail, setAlertEmail] = useState(user?.email || "");
  const [alertBusy, setAlertBusy] = useState(false);

  if (loading) return <div className="max-w-[1280px] mx-auto px-4 py-24 text-center text-neutral-500">Loading...</div>;

  if (!product) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-24 text-center">
        <Seo noindex title="Product not found | Puff2door" description="This product is no longer available." />
        <h1 className="font-heading text-3xl mb-3">Product not found</h1>
        <Link to="/shop" className="text-emerald-600 font-bold">Back to Shop</Link>
      </div>
    );
  }

  const gallery = [product.image, product.image2].filter((v, i, a) => a.indexOf(v) === i);
  const related = getProductsByCategory(product.categorySlug).filter((p) => p.id !== product.id).slice(0, 5);
  const price = getPrice(product);
  const wished = has(product.id);
  const alertSet = Boolean(wishItems.find((i) => i.productId === product.id)?.notify);
  const imgAbs = (u) => (u && u.startsWith("/api/") ? absUrl(u) : imgUrl(u)?.startsWith("http") ? imgUrl(u) : absUrl(u));
  const jsonLd = [
    productJsonLd(product, price, imgAbs, reviewSummary),
    breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: titleCase(product.category), path: `/product-category/${product.categorySlug}` }, { name: titleCase(product.name), path: `/shop/${product.slug}` }]),
  ];

  const handleAdd = () => {
    addItem({ ...product, price }, qty);
    setAdded(true);
    toast({ title: "Added to cart", description: `${qty} × ${product.name}` });
    setTimeout(() => setAdded(false), 1600);
  };

  const handleWish = () => {
    const nowWished = toggle(product);
    toast({ title: nowWished ? "Saved to wishlist" : "Removed from wishlist", description: product.name });
  };

  const handleAlert = async (e) => {
    e.preventDefault();
    setAlertBusy(true);
    try {
      await api.post("/stock-alerts", { productId: product.id, productSlug: product.slug, name: product.name, email: alertEmail });
      if (!wished) toggle(product);
      setNotify(product.id, true);
      toast({ title: "Restock alert set", description: `We'll email ${alertEmail} when it's back.` });
    } catch (err) {
      toast({ title: "Could not set alert", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally {
      setAlertBusy(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-8">
      <Seo title={`${titleCase(product.name)} | Puff2door`} description={productSeoDescription(product)} path={`/shop/${product.slug}`} image={imgAbs(product.image)} type="product" jsonLd={jsonLd} />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500 mb-6 flex-wrap">
        <Link to="/" className="hover:text-emerald-600">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to={`/product-category/${product.categorySlug}`} className="hover:text-emerald-600">{product.category}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-neutral-800 font-medium line-clamp-1">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Gallery */}
        <div>
          <div className="aspect-square bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden grid place-items-center p-6">
            <img src={imgUrl(gallery[activeImg])} alt={`${titleCase(product.name)} – ${titleCase(product.category)} from Puff2door`} width="600" height="600" fetchPriority="high" className="max-h-full max-w-full object-contain" />
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-3 mt-4">
              {gallery.map((g, i) => (
                <button key={i} onClick={() => setActiveImg(i)} aria-label={`Show image ${i + 1}`} className={`h-20 w-20 rounded-lg border-2 overflow-hidden bg-neutral-50 p-2 ${activeImg === i ? "border-emerald-600" : "border-neutral-200"}`}>
                  <img src={imgUrl(g)} alt={`${titleCase(product.name)} thumbnail ${i + 1}`} loading="lazy" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <p className="text-xs font-bold text-emerald-600 tracking-[0.15em] uppercase mb-2">{product.category}</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 leading-tight mb-3">{product.name}</h1>
          <div className="flex items-center gap-2 mb-5">
            <div className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => {
                const val = reviewSummary && reviewSummary.count ? reviewSummary.average : product.rating;
                return <Star key={i} className={`h-4 w-4 ${i < Math.round(val) ? "fill-current" : ""}`} />;
              })}
            </div>
            <span className="text-sm text-neutral-500">
              {reviewSummary && reviewSummary.count
                ? `${reviewSummary.average} · ${reviewSummary.count} review${reviewSummary.count === 1 ? "" : "s"}`
                : `${product.rating.toFixed(1)}`}
              {" · "}
              <span data-testid="stock-status" className={product.inStock ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>{product.inStock ? (product.stock <= 5 ? `Only ${product.stock} left` : "In stock") : "Sold out"}</span>
            </span>
          </div>

          <div className="flex items-baseline gap-3 mb-6">
            <p className="font-heading text-4xl text-neutral-900" data-testid="product-price">${price.toFixed(2)}</p>
            {isOnDeal(product) && (
              <>
                <span className="text-xl text-neutral-400 line-through">${product.price.toFixed(2)}</span>
                <span className="bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">Deal of the Day</span>
              </>
            )}
            {!isOnDeal(product) && price < product.price && (
              <>
                <span className="text-xl text-neutral-400 line-through">${product.price.toFixed(2)}</span>
                <span className="bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">Sale</span>
              </>
            )}
          </div>
          <p className="text-neutral-600 leading-relaxed mb-5">{product.description}</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-7 border border-neutral-200 rounded-xl p-4 bg-neutral-50" data-testid="product-specs">
            {productSpecs(product).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-neutral-200/70 last:border-0 sm:[&:nth-last-child(2)]:border-0 pb-1.5">
                <dt className="text-neutral-500">{k}</dt>
                <dd className="font-medium text-neutral-800 text-right">{v}</dd>
              </div>
            ))}
          </dl>

          {product.inStock ? (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center border border-neutral-300 rounded-full">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-11 w-11 grid place-items-center hover:text-emerald-600"><Minus className="h-4 w-4" /></button>
                <span className="w-10 text-center font-semibold">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} className="h-11 w-11 grid place-items-center hover:text-emerald-600"><Plus className="h-4 w-4" /></button>
              </div>
              <button onClick={handleAdd} data-testid="detail-add-to-cart" className={`flex-1 h-11 rounded-full font-bold text-white flex items-center justify-center gap-2 transition-colors ${added ? "bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                {added ? <><Check className="h-5 w-5" /> Added!</> : <><ShoppingCart className="h-5 w-5" /> Add to Cart</>}
              </button>
              <button onClick={handleWish} data-testid="detail-wishlist-toggle" aria-label="Wishlist" className={`h-11 w-11 grid place-items-center rounded-full border-2 transition-colors ${wished ? "border-red-500 text-red-500" : "border-neutral-300 text-neutral-500 hover:border-red-400 hover:text-red-500"}`}>
                <Heart className={`h-5 w-5 ${wished ? "fill-current" : ""}`} />
              </button>
            </div>
          ) : (
            <div className="mb-6 border border-neutral-200 rounded-xl p-5 bg-neutral-50">
              <p className="font-heading text-lg mb-1">Currently sold out</p>
              <p className="text-sm text-neutral-500 mb-4">Get an email the moment this vape is back in stock.</p>
              {alertSet ? (
                <span data-testid="detail-alert-active" className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-full"><BellRing className="h-4 w-4" /> Restock alert set</span>
              ) : (
                <form onSubmit={handleAlert} className="flex flex-col sm:flex-row gap-2">
                  <input required type="email" data-testid="detail-alert-email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="you@email.com" className="flex-1 border border-neutral-300 rounded-full px-4 py-2.5 text-sm outline-none focus:border-emerald-600" />
                  <button disabled={alertBusy} data-testid="detail-alert-submit" className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-neutral-900 text-white font-bold rounded-full hover:bg-emerald-600 transition-colors text-sm disabled:opacity-60"><Bell className="h-4 w-4" /> Notify Me</button>
                  <button type="button" onClick={handleWish} data-testid="detail-wishlist-toggle" aria-label="Wishlist" className={`h-11 w-11 grid place-items-center rounded-full border-2 transition-colors ${wished ? "border-red-500 text-red-500" : "border-neutral-300 text-neutral-500 hover:border-red-400 hover:text-red-500"}`}>
                    <Heart className={`h-5 w-5 ${wished ? "fill-current" : ""}`} />
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 border-t pt-6">
            {[{ icon: Truck, t: "Fast Local Delivery" }, { icon: ShieldCheck, t: "21+ ID Verified" }, { icon: RotateCcw, t: "Order Tracking" }].map((f, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-2">
                <f.icon className="h-6 w-6 text-emerald-600" />
                <span className="text-xs text-neutral-600 font-medium">{f.t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ReviewsSection productSlug={product.slug} onSummary={setReviewSummary} />

      {related.length > 0 && (
        <section className="pt-16">
          <h2 className="font-heading text-2xl sm:text-3xl font-700 uppercase tracking-tight mb-6">More {titleCase(product.category)}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {related.map((p) => (<ProductCard key={p.id} product={p} />))}
          </div>
          <div className="mt-6">
            <Link to={`/product-category/${product.categorySlug}`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600 hover:underline">Browse all {titleCase(product.category)} <ChevronRight className="h-4 w-4" /></Link>
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductDetail;

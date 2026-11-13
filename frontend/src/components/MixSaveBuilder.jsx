import React, { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import { imgUrl } from "../api";
import { calculateMixSave, isMixSaveEligible } from "../utils/mixSave";
import { useToast } from "../hooks/use-toast";
import { LIVE_SHELF_PREVIEW_PRODUCTS } from "../constants/liveShelfPreview";

const PRIVATE_PREVIEW = process.env.REACT_APP_MIX_SAVE_PREVIEW === "1";

export const MixSaveButton = ({ onClick, compact = false }) => {
  const { mixSave } = useCart();
  if (!mixSave.enabled) return null;
  const animation = mixSave.animationEnabled && mixSave.animationStyle !== "none" ? ` mix-save-${mixSave.animationStyle}` : "";
  return <button type="button" onClick={onClick} className={`mix-save-trigger${animation}${compact ? " mix-save-trigger-compact" : ""}`} data-testid="mix-save-trigger"><Sparkles className="h-3.5 w-3.5 shrink-0" /><span>{mixSave.buttonText}</span></button>;
};

export default function MixSaveBuilder({ open, onClose, initialProductId = null }) {
  const { products, activeCategories, getPrice } = useCatalog();
  const { addItem, mixSave } = useCart();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState({});

  const availableProducts = useMemo(() => products.length ? products : PRIVATE_PREVIEW ? LIVE_SHELF_PREVIEW_PRODUCTS : [], [products]);
  const eligible = useMemo(() => availableProducts.filter((product) => product.inStock && isMixSaveEligible(product, mixSave)), [availableProducts, mixSave]);
  const categories = useMemo(() => {
    const source = activeCategories.length ? activeCategories : Array.from(new Map(eligible.map((product) => [product.categorySlug, { slug: product.categorySlug, name: product.category }])).values());
    return source.filter((item) => eligible.some((product) => product.categorySlug === item.slug));
  }, [activeCategories, eligible]);
  const visible = useMemo(() => eligible
    .filter((product) => category === "all" || product.categorySlug === category)
    .filter((product) => !query.trim() || `${product.name} ${product.brandName || ""} ${product.category || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [eligible, category, query]);
  const tray = useMemo(() => eligible.filter((product) => Number(selected[product.id] || 0) > 0).map((product) => ({ ...product, price: getPrice(product), qty: Number(selected[product.id]), mixSaveQty: Number(selected[product.id]) })), [eligible, selected, getPrice]);
  const progress = useMemo(() => calculateMixSave(tray, mixSave), [tray, mixSave]);

  useEffect(() => {
    if (!open || !initialProductId) return;
    const product = eligible.find((item) => item.id === Number(initialProductId));
    if (product) setSelected((previous) => ({ ...previous, [product.id]: Math.max(1, previous[product.id] || 0) }));
  }, [open, initialProductId, eligible]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", close); };
  }, [open, onClose]);

  if (!open || !mixSave.enabled) return null;
  const update = (product, delta) => setSelected((previous) => {
    const next = Math.max(0, Math.min(Number(product.stock || 0), Number(previous[product.id] || 0) + delta));
    return { ...previous, [product.id]: next };
  });
  const addBundle = () => {
    if (!progress.qualified) return;
    tray.forEach((product) => addItem(product, product.qty, { mixSaveQty: product.qty }));
    toast({ title: "Mix & Save bundle added", description: `${progress.selectedQuantity} items · $${progress.discount.toFixed(2)} discount verified at checkout.` });
    setSelected({});
    onClose();
  };

  return <div className="mix-save-overlay" role="dialog" aria-modal="true" aria-label="Mix and Save bundle builder" data-testid="mix-save-builder">
    <button className="mix-save-backdrop" onClick={onClose} aria-label="Close bundle builder" />
    <section className="mix-save-drawer">
      <header className="mix-save-drawer-head">
        <div><p className="mix-save-eyebrow"><Sparkles className="h-4 w-4" /> Build your deal</p><h2>{mixSave.buttonText}</h2><p>Mix eligible products. Your discount is checked again securely in the cart and at checkout.</p></div>
        <button onClick={onClose} className="mix-save-close" aria-label="Close"><X /></button>
      </header>
      <div className="mix-save-progress" data-qualified={progress.qualified}>
        <div className="mix-save-progress-copy"><strong>{progress.selectedQuantity} of {mixSave.minQuantity} items selected</strong><span>{progress.qualified ? `Unlocked · You save $${progress.discount.toFixed(2)}` : progress.itemsRemaining > 0 ? `Add ${progress.itemsRemaining} more eligible item${progress.itemsRemaining === 1 ? "" : "s"}` : `$${progress.amountRemaining.toFixed(2)} away from unlocking the offer`}</span></div>
        <div className="mix-save-meter"><i style={{ width: `${Math.min(100, Math.max(progress.selectedQuantity / mixSave.minQuantity, progress.qualifyingSubtotal / (mixSave.minSubtotal + 0.01)) * 100)}%` }} /></div>
        <div className="mix-save-math"><span>Bundle ${progress.bundleSubtotal.toFixed(2)}</span><span>{mixSave.discountType === "percent" ? `${mixSave.discountValue}% off` : `$${mixSave.discountValue.toFixed(2)} off`}</span></div>
      </div>
      <div className="mix-save-tools"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search eligible products" /></label><div className="mix-save-pills"><button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>All</button>{categories.map((item) => <button key={item.slug} className={category === item.slug ? "active" : ""} onClick={() => setCategory(item.slug)}>{item.name}</button>)}</div></div>
      <div className="mix-save-product-grid">
        {visible.map((product) => { const qty = Number(selected[product.id] || 0); const price = getPrice(product); return <article key={product.id} className={qty ? "selected" : ""}>
          <div className="mix-save-product-image"><img src={imgUrl(product.image)} alt={product.name} loading="lazy" />{qty > 0 && <span><Check /> {qty} in tray</span>}</div>
          <div className="mix-save-product-info"><small>{product.brandName || product.category}</small><h3>{product.name}</h3><div><strong>${price.toFixed(2)}</strong><span>{product.stock <= 4 ? `Only ${product.stock} left` : "In local stock"}</span></div></div>
          <div className="mix-save-stepper"><button onClick={() => update(product, -1)} disabled={!qty}><Minus /></button><span>{qty}</span><button onClick={() => update(product, 1)} disabled={qty >= product.stock}><Plus /></button></div>
        </article>; })}
        {!visible.length && <div className="mix-save-empty"><ShoppingBag /><p>No eligible in-stock products match this filter.</p></div>}
      </div>
      <footer className="mix-save-tray"><div><span>{progress.selectedQuantity} item{progress.selectedQuantity === 1 ? "" : "s"}</span><strong>${progress.bundleSubtotal.toFixed(2)}{progress.qualified ? ` − $${progress.discount.toFixed(2)}` : ""}</strong></div><button onClick={addBundle} disabled={!progress.qualified}>Add Bundle to Cart</button></footer>
    </section>
  </div>;
}

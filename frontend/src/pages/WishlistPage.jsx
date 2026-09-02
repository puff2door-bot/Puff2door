import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, ShoppingCart, Trash2, Bell, BellRing, Check } from "lucide-react";
import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";
import { useCatalog } from "../context/CatalogContext";
import api, { imgUrl } from "../api";

const NotifyControl = ({ product, item }) => {
  const { user } = useApp();
  const { setNotify } = useWishlist();
  const { toast } = useToast();
  const [email, setEmail] = useState(user?.email || "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await api.post("/stock-alerts", { productId: product.id, productSlug: product.slug, name: product.name, email });
      setNotify(product.id, true);
      setOpen(false);
      toast({ title: "You're on the list", description: `We'll email ${email} when it's back in stock.` });
    } catch (err) {
      toast({ title: "Could not set alert", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (item.notify) {
    return (
      <span data-testid={`notify-active-${product.id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-full">
        <BellRing className="h-3.5 w-3.5" /> Alert set
      </span>
    );
  }
  if (!open) {
    return (
      <button
        data-testid={`notify-btn-${product.id}`}
        onClick={() => (user?.email ? submit() : setOpen(true))}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors"
      >
        <Bell className="h-3.5 w-3.5" /> Notify me when back
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        required
        type="email"
        data-testid={`notify-email-${product.id}`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="border border-neutral-300 rounded-full px-3 py-1.5 text-xs outline-none focus:border-emerald-600 w-44"
      />
      <button disabled={busy} data-testid={`notify-submit-${product.id}`} className="h-8 w-8 grid place-items-center rounded-full bg-emerald-600 text-white disabled:opacity-60">
        <Check className="h-4 w-4" />
      </button>
    </form>
  );
};

const WishlistRow = ({ item }) => {
  const { getProductById, getPrice } = useCatalog();
  const product = getProductById(item.productId);
  const { remove } = useWishlist();
  const { addItem } = useCart();
  const { toast } = useToast();
  if (!product) return null;
  const price = getPrice(product);

  return (
    <div data-testid={`wishlist-item-${product.id}`} className="flex flex-col sm:flex-row sm:items-center gap-4 border border-neutral-200 rounded-xl p-4">
      <Link to={`/shop/${product.slug}`} className="h-24 w-24 shrink-0 bg-neutral-50 rounded-lg grid place-items-center p-2">
        <img src={imgUrl(product.image)} alt={product.name} className={`max-h-full max-w-full object-contain ${product.inStock ? "" : "grayscale opacity-70"}`} />
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-emerald-600 tracking-[0.15em] uppercase">{product.brandName}</p>
        <Link to={`/shop/${product.slug}`} className="font-medium text-neutral-900 hover:text-emerald-600 line-clamp-2">{product.name}</Link>
        <div className="flex items-center gap-3 mt-1">
          <span className="font-heading text-xl">${price.toFixed(2)}</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${product.inStock ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>
            {product.inStock ? "In Stock" : "Sold Out"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {product.inStock ? (
          <button
            data-testid={`wishlist-add-cart-${product.id}`}
            onClick={() => { addItem({ ...product, price }, 1); toast({ title: "Added to cart", description: product.name }); }}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
          </button>
        ) : (
          <NotifyControl product={product} item={item} />
        )}
        <button
          data-testid={`wishlist-remove-${product.id}`}
          onClick={() => remove(product.id)}
          aria-label="Remove"
          className="h-9 w-9 grid place-items-center rounded-full border border-neutral-300 text-neutral-500 hover:border-red-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const WishlistPage = () => {
  const { items } = useWishlist();
  const { user } = useApp();

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-12" data-testid="wishlist-page">
      <div className="mb-8">
        <span className="block h-1 w-12 bg-emerald-600 mb-3 rounded-full" />
        <h1 className="font-heading text-3xl sm:text-4xl font-700 uppercase tracking-tight flex items-center gap-3">
          <Heart className="h-8 w-8 text-red-500 fill-current" /> My Wishlist
        </h1>
        <p className="text-neutral-500 text-sm mt-2">
          {items.length} saved item{items.length === 1 ? "" : "s"}
          {!user && " · Log in to keep your wishlist synced across devices."}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded-2xl p-14 text-center">
          <Heart className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
          <p className="font-heading text-2xl mb-2">Nothing saved yet</p>
          <p className="text-neutral-500 text-sm mb-6">Tap the heart on any vape to save it here and get restock alerts.</p>
          <Link to="/shop" className="inline-block px-6 py-3 bg-emerald-600 text-white font-bold rounded-full">Browse Vapes</Link>
        </div>
      ) : (
        <div className="space-y-3 max-w-4xl">
          {items.map((i) => <WishlistRow key={i.productId} item={i} />)}
        </div>
      )}
    </div>
  );
};

export default WishlistPage;

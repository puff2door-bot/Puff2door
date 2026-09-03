import React from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, Check, Heart } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useToast } from "../hooks/use-toast";
import { useCatalog } from "../context/CatalogContext";
import { imgUrl } from "../api";

const ProductCard = ({ product }) => {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const { getPrice, isOnDeal } = useCatalog();
  const { toast } = useToast();
  const [added, setAdded] = React.useState(false);
  const wished = has(product.id);
  const price = getPrice(product);

  const handleAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.inStock) return;
    addItem({ ...product, price }, 1);
    setAdded(true);
    toast({ title: "Added to cart", description: product.name });
    setTimeout(() => setAdded(false), 1400);
  };

  const handleWish = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowWished = toggle(product);
    toast({ title: nowWished ? "Saved to wishlist" : "Removed from wishlist", description: product.name });
  };

  return (
    <div data-testid={`product-card-${product.id}`} className="group relative bg-white border border-neutral-200 rounded-lg overflow-hidden hover:shadow-xl hover:border-emerald-200 transition-all duration-300 flex flex-col">
      <Link to={`/shop/${product.slug}`} className="block relative aspect-square bg-neutral-50 overflow-hidden">
        <img
          src={imgUrl(product.image)}
          alt={`${product.name} – ${product.category} from Puff2door`}
          loading="lazy"
          width="300"
          height="300"
          className={`product-card-img absolute inset-0 h-full w-full object-contain p-4 group-hover:opacity-0 ${product.inStock ? "" : "grayscale opacity-70"}`}
        />
        <img
          src={imgUrl(product.image2)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="product-card-img absolute inset-0 h-full w-full object-contain p-4 opacity-0 group-hover:opacity-100 group-hover:scale-105"
        />
        <span className="absolute top-3 left-3 bg-neutral-900/90 text-white text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-full uppercase">
          {product.category}
        </span>
        {isOnDeal(product) && (
          <span className="absolute bottom-3 left-3 bg-red-600 text-white text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full uppercase">Deal -20%</span>
        )}
        {!isOnDeal(product) && price < product.price && (
          <span className="absolute bottom-3 left-3 bg-red-600 text-white text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full uppercase">Sale</span>
        )}
        {!product.inStock && (
          <span data-testid={`sold-out-${product.id}`} className="absolute bottom-3 right-3 bg-white/95 text-neutral-900 border border-neutral-300 text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full uppercase">Sold Out</span>
        )}
      </Link>

      <button
        onClick={handleWish}
        data-testid={`wishlist-toggle-${product.id}`}
        aria-label={wished ? "Remove from wishlist" : "Save to wishlist"}
        className={`absolute top-3 right-3 z-10 grid place-items-center h-8 w-8 rounded-full bg-white/90 shadow-sm transition-all hover:scale-110 ${wished ? "text-red-500" : "text-neutral-400 hover:text-red-500"}`}
      >
        <Heart className={`h-4 w-4 ${wished ? "fill-current" : ""}`} />
      </button>

      <div className="p-4 flex flex-col flex-1">
        <p className="text-[10px] font-bold text-emerald-600 tracking-[0.15em] uppercase mb-1">
          {product.brandName}
        </p>
        <Link to={`/shop/${product.slug}`} className="block">
          <h3 className="text-[13px] font-medium text-neutral-800 leading-snug line-clamp-2 min-h-[2.6em] hover:text-emerald-600 transition-colors">
            {product.name}
          </h3>
        </Link>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="font-heading text-xl text-neutral-900 flex items-baseline gap-2">
            ${price.toFixed(2)}
            {price !== product.price && <span className="text-sm text-neutral-400 line-through">${product.price.toFixed(2)}</span>}
          </span>
          <button
            onClick={handleAdd}
            disabled={!product.inStock}
            data-testid={`add-to-cart-${product.id}`}
            className={`grid place-items-center h-9 w-9 rounded-full transition-all ${
              !product.inStock ? "bg-neutral-200 text-neutral-400 cursor-not-allowed" : added ? "bg-emerald-600 text-white" : "bg-neutral-900 text-white hover:bg-emerald-600"
            }`}
            aria-label="Add to cart"
          >
            {added ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
